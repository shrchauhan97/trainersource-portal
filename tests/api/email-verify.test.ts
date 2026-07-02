// tests/api/email-verify.test.ts
//
// Coverage for /api/auth/email-verify (Email-based returning customer access):
// the route must look up customers by email, verify they're active, and mint a
// new session token. Suspended/removed customers must get `valid:false` with
// `reason:'suspended'`, and non-existent emails get `reason:'not_found'`.
//
// Strategy: mock `mintSessionToken` so we don't need the actual HMAC secret,
// and mock `@supabase/supabase-js`'s `createClient` so the customers lookup
// is fully scriptable. The route uses createClient() directly (not the shared
// `@/lib/supabase/service` helper), so we mock the SDK module itself.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mintMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/session-token', () => ({
  mintSessionToken: (customerId: string) => mintMock(customerId),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}));

beforeEach(() => {
  mintMock.mockReset();
  fromMock.mockReset();
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-for-tests');
  vi.stubEnv('ACCESS_GATE_ALLOWED_ORIGINS', 'https://ultimate-peptides.com');
});

function buildRequest(
  body: unknown = { email: 'test@example.com' },
  origin = 'https://ultimate-peptides.com',
  headers: Record<string, string> = {},
) {
  return new Request('https://trainer-source.com/api/auth/email-verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin,
      'x-forwarded-for': '192.168.1.1',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * Helper: return a chainable `.from('customers').select().eq().maybeSingle()`
 * stub that resolves with the given `{ data, error }` payload. Mirrors the
 * shape supabase-js exposes — we only need the methods the route actually
 * calls, but we surface the unknown-table case loudly so a regression that
 * widens the query is caught by tests, not at runtime.
 */
function stubCustomersLookup(result: { data: unknown; error: unknown }) {
  fromMock.mockImplementation((table: string) => {
    if (table !== 'customers') {
      throw new Error(`unexpected table: ${table}`);
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
      }),
    };
  });
}

describe('POST /api/auth/email-verify', () => {
  it('returns valid:true with session_token for an active customer', async () => {
    mintMock.mockReturnValueOnce('mocked-session-token-abc123');
    stubCustomersLookup({
      data: { id: 'cust-active-001', email: 'alice@example.com', status: 'active' },
      error: null,
    });

    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'alice@example.com' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      valid: true,
      session_token: 'mocked-session-token-abc123',
      customer_id: 'cust-active-001',
    });
    expect(mintMock).toHaveBeenCalledWith('cust-active-001');
  });

  it('normalizes email to lowercase before lookup', async () => {
    mintMock.mockReturnValueOnce('token-xyz');
    stubCustomersLookup({
      data: { id: 'cust-002', email: 'bob@example.com', status: 'active' },
      error: null,
    });

    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'BoB@ExAmPlE.cOm' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.customer_id).toBe('cust-002');
  });

  it('returns valid:false + reason:not_found when email does not exist', async () => {
    stubCustomersLookup({ data: null, error: null });

    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'unknown@example.com' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'not_found' });
    expect(consoleInfo).toHaveBeenCalledWith(
      '[email-verify] email not found',
      expect.objectContaining({ email: 'unknown@example.com' }),
    );
    expect(mintMock).not.toHaveBeenCalled();

    consoleInfo.mockRestore();
  });

  it('returns valid:false + reason:suspended for a suspended customer', async () => {
    stubCustomersLookup({
      data: { id: 'cust-suspended', email: 'suspended@example.com', status: 'suspended' },
      error: null,
    });

    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'suspended@example.com' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'suspended' });
    expect(consoleInfo).toHaveBeenCalledWith(
      '[email-verify] non-active customer',
      expect.objectContaining({
        customerId: 'cust-suspended',
        email: 'suspended@example.com',
        status: 'suspended',
      }),
    );
    expect(mintMock).not.toHaveBeenCalled();

    consoleInfo.mockRestore();
  });

  it('returns valid:false + reason:suspended for a removed customer (any non-active)', async () => {
    stubCustomersLookup({
      data: { id: 'cust-removed', email: 'removed@example.com', status: 'removed' },
      error: null,
    });

    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'removed@example.com' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'suspended' });
    expect(mintMock).not.toHaveBeenCalled();
  });

  it('returns valid:false + reason:invalid_input for an invalid email format', async () => {
    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'not-an-email' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'invalid_input' });
    expect(fromMock).not.toHaveBeenCalled();
    expect(mintMock).not.toHaveBeenCalled();
  });

  it('returns valid:false + reason:invalid_input for a missing email field', async () => {
    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({}));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'invalid_input' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns valid:false + reason:invalid_input for an empty email string', async () => {
    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: '' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'invalid_input' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns valid:false + reason:invalid_payload for malformed JSON', async () => {
    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest('{not json'));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'invalid_payload' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns server_error (500) when the customer lookup errors — fail closed', async () => {
    stubCustomersLookup({ data: null, error: { message: 'connection lost' } });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'test@example.com' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'server_error' });
    expect(mintMock).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('rejects cross-origin requests not on the allow-list with 403', async () => {
    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'test@example.com' }, 'https://evil.example'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'origin_not_allowed' });
    expect(fromMock).not.toHaveBeenCalled();
    expect(mintMock).not.toHaveBeenCalled();
  });

  it('handles OPTIONS preflight requests with CORS headers', async () => {
    const { OPTIONS } = await import('@/app/api/auth/email-verify/route');
    const req = new Request('https://trainer-source.com/api/auth/email-verify', {
      method: 'OPTIONS',
      headers: { origin: 'https://ultimate-peptides.com' },
    });
    const res = await OPTIONS(req);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://ultimate-peptides.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
  });

  describe('rate limiting', () => {
    beforeEach(async () => {
      const { __resetRateLimit } = await import('@/app/api/auth/email-verify/route');
      __resetRateLimit();
    });

    it('allows up to 30 requests per minute from the same IP', async () => {
      mintMock.mockReturnValue('token');
      stubCustomersLookup({
        data: { id: 'cust-rate-test', email: 'rate@example.com', status: 'active' },
        error: null,
      });

      const { POST } = await import('@/app/api/auth/email-verify/route');

      // Make 30 requests - all should succeed
      for (let i = 0; i < 30; i++) {
        const res = await POST(
          buildRequest({ email: 'rate@example.com' }, 'https://ultimate-peptides.com', {
            'x-forwarded-for': '10.0.0.1',
          }),
        );
        expect(res.status).toBe(200);
      }

      // 31st request should be rate limited
      const res = await POST(
        buildRequest({ email: 'rate@example.com' }, 'https://ultimate-peptides.com', {
          'x-forwarded-for': '10.0.0.1',
        }),
      );
      expect(res.status).toBe(429);
      await expect(res.json()).resolves.toEqual({ valid: false, reason: 'rate_limited' });
      expect(res.headers.get('Retry-After')).toBeTruthy();
    });

    it('maintains separate rate limit buckets per IP', async () => {
      mintMock.mockReturnValue('token');
      stubCustomersLookup({
        data: { id: 'cust-multi-ip', email: 'multi@example.com', status: 'active' },
        error: null,
      });

      const { POST } = await import('@/app/api/auth/email-verify/route');

      // Make 30 requests from IP1 - should succeed
      for (let i = 0; i < 30; i++) {
        const res = await POST(
          buildRequest({ email: 'multi@example.com' }, 'https://ultimate-peptides.com', {
            'x-forwarded-for': '10.0.0.100',
          }),
        );
        expect(res.status).toBe(200);
      }

      // Request from different IP should still work
      const res = await POST(
        buildRequest({ email: 'multi@example.com' }, 'https://ultimate-peptides.com', {
          'x-forwarded-for': '10.0.0.200',
        }),
      );
      expect(res.status).toBe(200);
    });
  });

  it('trims whitespace from email before validation', async () => {
    mintMock.mockReturnValueOnce('token-trimmed');
    stubCustomersLookup({
      data: { id: 'cust-trim', email: 'trim@example.com', status: 'active' },
      error: null,
    });

    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: '  trim@example.com  ' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  it('returns server_error when SUPABASE_URL is missing', async () => {
    vi.stubEnv('SUPABASE_URL', '');

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'test@example.com' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'server_error' });
    expect(consoleError).toHaveBeenCalledWith(
      '[email-verify] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing',
    );

    consoleError.mockRestore();
  });

  it('returns server_error when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/auth/email-verify/route');
    const res = await POST(buildRequest({ email: 'test@example.com' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'server_error' });

    consoleError.mockRestore();
  });
});
