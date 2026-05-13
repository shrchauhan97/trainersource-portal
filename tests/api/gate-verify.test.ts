// tests/api/gate-verify.test.ts
//
// Coverage for the Wave 3 T2.17 fix on `/api/gate/verify`.
//
// Before the fix this route was fully unauthenticated and returned a
// `reason` field that distinguished `not-found` from `suspended` from
// `removed`. A drive-by enumerator could walk `bc_customer_id=1..N` and
// map (a) which IDs exist in our DB and (b) which of those are suspended.
//
// The fix layers three gates: a shared-secret bypass header for legitimate
// server-to-server callers, an Origin/Referer allow-list for browser
// callers from the BC storefront, and an in-memory per-IP rate limiter
// behind both. On the browser path the response shape collapses to
// `{ allowed: true|false }` only — no `reason`, so even a successful call
// reveals nothing about whether the customer ID exists or is suspended.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: fromMock }),
}));

beforeEach(async () => {
  maybeSingleMock.mockReset();
  eqMock.mockClear();
  selectMock.mockClear();
  fromMock.mockClear();
  // Re-wire chainable. .mockReset() above wipes implementations.
  eqMock.mockImplementation(() => ({ maybeSingle: maybeSingleMock }));
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  fromMock.mockImplementation(() => ({ select: selectMock }));

  vi.stubEnv('ACCESS_GATE_ALLOWED_ORIGINS', 'https://ultimate-peptides.com');
  vi.stubEnv('GATE_VERIFY_SHARED_SECRET', 'unit-test-shared-secret');

  // Per-process IP buckets persist across tests within a worker. Reset
  // before each case so rate-limit tests don't pollute each other.
  const route = await import('@/app/api/gate/verify/route');
  route.__resetRateLimit();
});

type Headers = Record<string, string>;

function buildRequest(
  query: Record<string, string> = {},
  headers: Headers = {},
  ip = '203.0.113.7',
): Request {
  const qs = new URLSearchParams(query).toString();
  const url = `https://trainer-source.com/api/gate/verify${qs ? `?${qs}` : ''}`;
  const allHeaders: Headers = { 'x-forwarded-for': ip, ...headers };
  return new Request(url, { headers: allHeaders });
}

describe('GET /api/gate/verify — auth gates', () => {
  it('returns 401 with no Origin, no Referer, no shared secret', async () => {
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(buildRequest({ bc_customer_id: '42' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ allowed: false, reason: 'unauthorized' });
    // Crucially: we never even hit the DB on the unauth path.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 401 when Origin is set but not on the allow-list', async () => {
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(
      buildRequest({ bc_customer_id: '42' }, { origin: 'https://evil.example' }),
    );
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 401 when Referer is set but its origin is not allow-listed', async () => {
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(
      buildRequest(
        { bc_customer_id: '42' },
        { referer: 'https://evil.example/cart' },
      ),
    );
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 401 with a wrong shared-secret header (timing-safe path)', async () => {
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(
      buildRequest(
        { bc_customer_id: '42' },
        { 'x-gate-verify-secret': 'wrong-secret-but-same-length-buf' },
      ),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ allowed: false, reason: 'unauthorized' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 401 with a wrong shared-secret of differing length (length-mismatch path)', async () => {
    // Different byte length — exercises the length short-circuit before
    // crypto.timingSafeEqual (which would throw otherwise).
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(
      buildRequest({ bc_customer_id: '42' }, { 'x-gate-verify-secret': 'x' }),
    );
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/gate/verify — browser path (Origin allow-listed)', () => {
  const browserHeaders = { origin: 'https://ultimate-peptides.com' };

  it('returns opaque allowed:true for an active customer (no reason field)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'active' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(buildRequest({ bc_customer_id: '42' }, browserHeaders));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ allowed: true });
    expect(body).not.toHaveProperty('reason');
  });

  it('returns opaque allowed:false for a suspended customer (no `reason: "suspended"`)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'suspended' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(buildRequest({ bc_customer_id: '42' }, browserHeaders));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ allowed: false });
    expect(body).not.toHaveProperty('reason');
  });

  it('returns opaque allowed:false for a removed customer (no `reason: "removed"`)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'removed' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(buildRequest({ bc_customer_id: '42' }, browserHeaders));
    const body = await res.json();
    // Same shape as "suspended" — caller cannot distinguish.
    expect(body).toEqual({ allowed: false });
  });

  it('returns the SAME opaque shape for a nonexistent BC customer ID (no information leak)', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(buildRequest({ bc_customer_id: '99999999' }, browserHeaders));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Indistinguishable from "active customer" — same `{allowed:true}`,
    // same status code, no `reason: 'not-found'`.
    expect(body).toEqual({ allowed: true });
  });

  it('falls open opaquely on a DB error (allowed:true, no `reason: "db-error"`)', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(buildRequest({ bc_customer_id: '42' }, browserHeaders));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ allowed: true });
  });

  it('accepts an allow-listed Referer when Origin is absent', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'active' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(
      buildRequest(
        { bc_customer_id: '42' },
        { referer: 'https://ultimate-peptides.com/cart' },
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allowed: true });
  });

  it('echoes only the matched Origin in Access-Control-Allow-Origin', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'active' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(buildRequest({ bc_customer_id: '42' }, browserHeaders));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://ultimate-peptides.com',
    );
  });
});

describe('GET /api/gate/verify — shared-secret bypass (server-to-server)', () => {
  const sharedSecretHeaders = { 'x-gate-verify-secret': 'unit-test-shared-secret' };

  it('preserves the verbose `{allowed, reason}` shape on the secret path (for e2e smoke)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'suspended' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(
      buildRequest({ bc_customer_id: '42' }, sharedSecretHeaders),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ allowed: false, reason: 'suspended' });
  });

  it('returns `reason: "not-found"` on the secret path for nonexistent IDs', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(
      buildRequest({ bc_customer_id: '99999999' }, sharedSecretHeaders),
    );
    const body = await res.json();
    expect(body).toEqual({ allowed: true, reason: 'not-found' });
  });

  it('returns `allowed: true` (no reason) on the secret path for active customers', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'active' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(
      buildRequest({ bc_customer_id: '42' }, sharedSecretHeaders),
    );
    expect(await res.json()).toEqual({ allowed: true });
  });

  it('works without an Origin header (server-to-server caller)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'active' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    // No origin, no referer — only the secret.
    const res = await GET(
      buildRequest({ bc_customer_id: '42' }, sharedSecretHeaders),
    );
    expect(res.status).toBe(200);
  });

  it('is disabled entirely when GATE_VERIFY_SHARED_SECRET env is unset', async () => {
    vi.stubEnv('GATE_VERIFY_SHARED_SECRET', '');
    const { GET } = await import('@/app/api/gate/verify/route');
    const res = await GET(
      buildRequest(
        { bc_customer_id: '42' },
        { 'x-gate-verify-secret': 'anything' },
      ),
    );
    // Without the env var the secret header is ignored, so we fall to the
    // Origin gate, which also has no header here → 401.
    expect(res.status).toBe(401);
  });
});

describe('GET /api/gate/verify — rate limiting', () => {
  it('429s on the 31st request from the same IP within the window', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'active' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const browserHeaders = { origin: 'https://ultimate-peptides.com' };

    // 30 allowed requests
    for (let i = 0; i < 30; i++) {
      const res = await GET(
        buildRequest({ bc_customer_id: String(i) }, browserHeaders, '198.51.100.1'),
      );
      expect(res.status).toBe(200);
    }
    // 31st must trip the limiter
    const res = await GET(
      buildRequest({ bc_customer_id: '31' }, browserHeaders, '198.51.100.1'),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ allowed: false, reason: 'rate_limited' });
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('keys the limiter per IP (a second IP is not affected)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'active' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const browserHeaders = { origin: 'https://ultimate-peptides.com' };

    // Burn through IP A's budget
    for (let i = 0; i < 30; i++) {
      await GET(
        buildRequest({ bc_customer_id: String(i) }, browserHeaders, '198.51.100.7'),
      );
    }
    // IP A is throttled
    const throttled = await GET(
      buildRequest({ bc_customer_id: '31' }, browserHeaders, '198.51.100.7'),
    );
    expect(throttled.status).toBe(429);
    // IP B sails through
    const fresh = await GET(
      buildRequest({ bc_customer_id: '1' }, browserHeaders, '198.51.100.8'),
    );
    expect(fresh.status).toBe(200);
  });

  it('429 response still carries CORS headers (browser must see the status)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { status: 'active' }, error: null });
    const { GET } = await import('@/app/api/gate/verify/route');
    const browserHeaders = { origin: 'https://ultimate-peptides.com' };
    for (let i = 0; i < 30; i++) {
      await GET(
        buildRequest({ bc_customer_id: String(i) }, browserHeaders, '198.51.100.9'),
      );
    }
    const res = await GET(
      buildRequest({ bc_customer_id: '31' }, browserHeaders, '198.51.100.9'),
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://ultimate-peptides.com',
    );
  });
});

describe('OPTIONS /api/gate/verify (CORS preflight unaffected by auth gates)', () => {
  it('returns 204 with CORS headers for an allow-listed Origin', async () => {
    const { OPTIONS } = await import('@/app/api/gate/verify/route');
    const res = await OPTIONS(
      new Request('https://trainer-source.com/api/gate/verify', {
        method: 'OPTIONS',
        headers: { origin: 'https://ultimate-peptides.com' },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://ultimate-peptides.com',
    );
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(
      /X-Gate-Verify-Secret/i,
    );
  });
});
