// tests/api/session-check.test.ts
//
// Coverage for /api/session/check (Wave 3, T2.16):
// the route must honor `customers.status`, not just verify the HMAC token.
// A suspended/removed customer must NOT keep a valid session for the full
// 30-day token TTL — we surface `valid:false, reason:'suspended'` so the
// BC storefront's `clearBypassMarkers()` wipes the stale localStorage token.
//
// Strategy: mock `verifySessionToken` so we don't have to mint real HMACs,
// and mock `@supabase/supabase-js`'s `createClient` so the customers lookup
// is fully scriptable. The route uses createClient() directly (not the
// shared `@/lib/supabase/service` helper), so we mock the SDK module itself.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/session-token', () => ({
  verifySessionToken: (token: unknown) => verifyMock(token),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}));

beforeEach(() => {
  verifyMock.mockReset();
  fromMock.mockReset();
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-for-tests');
  vi.stubEnv('ACCESS_GATE_ALLOWED_ORIGINS', 'https://ultimate-peptides.com');
});

function buildRequest(body: unknown = { session_token: 'tok' }, origin = 'https://ultimate-peptides.com') {
  return new Request('https://trainer-source.com/api/session/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin,
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

describe('POST /api/session/check', () => {
  it('returns valid:true for an active customer', async () => {
    verifyMock.mockReturnValueOnce({ customerId: 'cust-active' });
    stubCustomersLookup({
      data: { id: 'cust-active', status: 'active' },
      error: null,
    });

    const { POST } = await import('@/app/api/session/check/route');
    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: true });
  });

  it('returns valid:false + reason:suspended for a suspended customer', async () => {
    verifyMock.mockReturnValueOnce({ customerId: 'cust-suspended' });
    stubCustomersLookup({
      data: { id: 'cust-suspended', status: 'suspended' },
      error: null,
    });

    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { POST } = await import('@/app/api/session/check/route');
    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'suspended' });
    // We log every suspension hit so ops can correlate against
    // /admin/customers/[id]/suspend events in lifecycle_events.
    expect(consoleInfo).toHaveBeenCalledWith(
      'session check rejected: non-active customer',
      expect.objectContaining({ customerId: 'cust-suspended', status: 'suspended' }),
    );

    consoleInfo.mockRestore();
  });

  it('returns valid:false + reason:suspended for a removed customer (any non-active)', async () => {
    verifyMock.mockReturnValueOnce({ customerId: 'cust-removed' });
    stubCustomersLookup({
      data: { id: 'cust-removed', status: 'removed' },
      error: null,
    });

    const { POST } = await import('@/app/api/session/check/route');
    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'suspended' });
  });

  it('returns valid:false + reason:customer_not_found when the row is missing (existing behavior preserved)', async () => {
    verifyMock.mockReturnValueOnce({ customerId: 'cust-deleted' });
    stubCustomersLookup({ data: null, error: null });

    const { POST } = await import('@/app/api/session/check/route');
    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'customer_not_found' });
  });

  it('returns valid:false + reason:invalid_or_expired when verifySessionToken returns null (no cookie / bad cookie)', async () => {
    verifyMock.mockReturnValueOnce(null);

    const { POST } = await import('@/app/api/session/check/route');
    const res = await POST(buildRequest({ session_token: 'garbage' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'invalid_or_expired' });
    // The verifier shorts the lookup — we never call into supabase at all.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns valid:false + reason:invalid_payload for malformed JSON', async () => {
    const { POST } = await import('@/app/api/session/check/route');
    const res = await POST(buildRequest('{not json'));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'invalid_payload' });
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('returns server_error (500) when the customer lookup errors — fail closed', async () => {
    verifyMock.mockReturnValueOnce({ customerId: 'cust-x' });
    stubCustomersLookup({ data: null, error: { message: 'connection lost' } });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/session/check/route');
    const res = await POST(buildRequest());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'server_error' });

    consoleError.mockRestore();
  });

  it('rejects cross-origin requests not on the allow-list with 403', async () => {
    const { POST } = await import('@/app/api/session/check/route');
    const res = await POST(buildRequest({ session_token: 'tok' }, 'https://evil.example'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'origin_not_allowed' });
    expect(verifyMock).not.toHaveBeenCalled();
  });
});
