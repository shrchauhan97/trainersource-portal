// tests/api/validate-code-rate-limit.test.ts
//
// Regression coverage for the per-IP rate-limit added to POST
// /api/codes/validate (nightly 2026-05-30).
//
// Why this matters: prior to this wave the route had NO server-side rate
// limit. The only brake on rapid submission was the `FAILED_ATTEMPT_LOCK_MS
// = 3000` cooldown inside up-bc-cdn/bc-paste.js — pure client-side state,
// bypassable by curl, a script, or any browser session that clears
// localStorage. Because the route returns specific `reason` values
// (`not_found` / `consumed` / `expired` / `revoked` / `country_blocked`),
// an attacker without rate-limiting could enumerate the `[A-Z0-9-]{4,40}`
// code space at machine speed, mapping which codes are active and which
// were already burned.
//
// The new limiter (30 req/min/IP, in-memory token bucket) caps that.
// These tests pin the contract.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}));

vi.mock('@/lib/bigcommerce', () => ({
  getBigCommerceCustomerByEmail: vi.fn().mockResolvedValue(null),
  createBigCommerceCustomer: vi.fn().mockResolvedValue({ id: 99 }),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  newClientJoinedEmail: vi.fn().mockReturnValue({ subject: 's', html: '<p/>' }),
}));

vi.mock('@/lib/session-token', () => ({
  mintSessionToken: () => 'fake-session-token',
}));

import { POST, __resetRateLimit } from '@/app/api/codes/validate/route';

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  fromMock.mockImplementation(() => ({
    insert: vi.fn().mockResolvedValue({ error: null }),
  }));
  __resetRateLimit();
  vi.stubEnv('ACCESS_GATE_ALLOWED_ORIGINS', 'https://ultimate-peptides.com');
});

function reqFrom(ip: string, body: Record<string, unknown> = {}) {
  return new Request('https://trainer-source.com/api/codes/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://ultimate-peptides.com',
      'user-agent': 'vitest-rate-limit',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({
      code: 'BADCODE',
      email: 'a@b.test',
      name: 'A B',
      country: 'Singapore',
      city: 'Singapore',
      ...body,
    }),
  });
}

describe('POST /api/codes/validate — per-IP rate limit', () => {
  it('allows the 30th call from the same IP and 429s the 31st within the window', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: 'not_found', access_code_id: null, customer_id: null, trainer_id: null },
      error: null,
    });

    const IP = '198.51.100.42';
    // First 30 must all succeed (200 with whatever reason the RPC returned).
    for (let i = 0; i < 30; i++) {
      const res = await POST(reqFrom(IP));
      expect(res.status, `call #${i + 1} should pass the limiter`).toBe(200);
    }

    const tripped = await POST(reqFrom(IP));
    expect(tripped.status).toBe(429);
    const body = (await tripped.json()) as { valid: boolean; reason: string };
    expect(body).toEqual({ valid: false, reason: 'rate_limited' });
    expect(tripped.headers.get('Retry-After')).toMatch(/^\d+$/);
    // CORS header still mirrored so the BC storefront can read the 429.
    expect(tripped.headers.get('Access-Control-Allow-Origin')).toBe('https://ultimate-peptides.com');
  });

  it('keeps separate buckets per client IP — IP B is not affected by IP A burning its budget', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: 'not_found', access_code_id: null, customer_id: null, trainer_id: null },
      error: null,
    });

    const IP_A = '198.51.100.10';
    const IP_B = '198.51.100.20';

    for (let i = 0; i < 30; i++) {
      const res = await POST(reqFrom(IP_A));
      expect(res.status).toBe(200);
    }
    const aLimited = await POST(reqFrom(IP_A));
    expect(aLimited.status).toBe(429);

    // IP B is untouched.
    const bFirst = await POST(reqFrom(IP_B));
    expect(bFirst.status).toBe(200);
  });

  it('429 fires BEFORE the RPC is called (no DB amplification on a burst)', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: 'not_found', access_code_id: null, customer_id: null, trainer_id: null },
      error: null,
    });

    const IP = '198.51.100.55';
    for (let i = 0; i < 30; i++) {
      await POST(reqFrom(IP));
    }
    const callsBefore = rpcMock.mock.calls.length;

    const limited = await POST(reqFrom(IP));
    expect(limited.status).toBe(429);
    expect(rpcMock.mock.calls.length).toBe(callsBefore);
  });

  it('429 fires BEFORE any code_attempts audit row is inserted (no audit-table amplification)', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: 'not_found', access_code_id: null, customer_id: null, trainer_id: null },
      error: null,
    });

    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation(() => ({ insert: insertSpy }));

    const IP = '198.51.100.77';
    for (let i = 0; i < 30; i++) {
      await POST(reqFrom(IP));
    }
    const auditBefore = insertSpy.mock.calls.length;

    const limited = await POST(reqFrom(IP));
    expect(limited.status).toBe(429);
    expect(insertSpy.mock.calls.length).toBe(auditBefore);
  });

  it('falls back to the shared `unknown` bucket when no IP-header is present', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: 'not_found', access_code_id: null, customer_id: null, trainer_id: null },
      error: null,
    });

    function reqNoIp() {
      return new Request('https://trainer-source.com/api/codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'https://ultimate-peptides.com' },
        body: JSON.stringify({
          code: 'BADCODE',
          email: 'a@b.test',
          name: 'A B',
          country: 'Singapore',
          city: 'Singapore',
        }),
      });
    }

    for (let i = 0; i < 30; i++) {
      const res = await POST(reqNoIp());
      expect(res.status).toBe(200);
    }
    const tripped = await POST(reqNoIp());
    expect(tripped.status).toBe(429);
  });
});
