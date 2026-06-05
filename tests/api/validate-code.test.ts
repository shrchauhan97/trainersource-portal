// tests/api/validate-code.test.ts
//
// Unit-level coverage for /api/codes/validate (Fix-B: T1.1 + T1.6).
//
// We mock the service-role supabase client, the BigCommerce helpers, the
// transactional-email helper, and the session-token minter so the route logic
// is exercised without any I/O. The RPC `validate_and_consume_code` is the
// authority for race-safety; here we verify the route ALWAYS records a
// code_attempts row and translates the RPC response into the documented
// reason contract.

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

beforeEach(async () => {
  rpcMock.mockReset();
  fromMock.mockReset();
  // Set just enough env for any code paths that read it. createServiceClient
  // is fully mocked above so its env vars are irrelevant.
  vi.stubEnv('ACCESS_GATE_ALLOWED_ORIGINS', 'https://ultimate-peptides.com');
  // The route now keeps a module-local IP rate-limit bucket. Clear it so
  // accumulated state from a prior `it()` (or another suite running in the
  // same worker) can't push later cases into a spurious 429.
  const { __resetRateLimit } = await import('@/app/api/codes/validate/route');
  __resetRateLimit();
});

/**
 * Default `from(table)` mock: returns a tiny chainable that resolves whatever
 * the caller wants for known tables. Override per-test.
 */
function setupFromHandlers(handlers: Record<string, () => unknown>) {
  fromMock.mockImplementation((table: string) => {
    const fn = handlers[table];
    if (!fn) {
      throw new Error(`unexpected table: ${table}`);
    }
    return fn();
  });
}

function buildRequest(body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request('https://trainer-source.com/api/codes/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://ultimate-peptides.com',
      'user-agent': 'vitest-runner/1.0',
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/codes/validate', () => {
  it('returns invalid_format for malformed codes (regex fail) and logs the attempt', async () => {
    const captured: Array<Record<string, unknown>> = [];
    setupFromHandlers({
      code_attempts: () => ({
        insert: (row: Record<string, unknown>) => {
          captured.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    });

    const { POST } = await import('@/app/api/codes/validate/route');
    const res = await POST(
      buildRequest({
        code: 'no spaces allowed!',
        email: 'a@b.co',
        name: 'A B',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'invalid_format' });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      outcome: 'invalid_format',
      // x-forwarded-for is "203.0.113.7, 10.0.0.1" — we take the first hop.
      ip_address: '203.0.113.7',
      user_agent: 'vitest-runner/1.0',
    });
    expect(captured[0].duration_ms).toEqual(expect.any(Number));
  });

  it('returns invalid_input when required fields are missing', async () => {
    const captured: Array<Record<string, unknown>> = [];
    setupFromHandlers({
      code_attempts: () => ({
        insert: (row: Record<string, unknown>) => {
          captured.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    });

    const { POST } = await import('@/app/api/codes/validate/route');
    const res = await POST(
      buildRequest({
        code: 'ABCD-1234',
        email: '', // missing
        name: 'Some Name',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'invalid_input' });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ outcome: 'invalid_input' });
  });

  it('returns the RPC reason verbatim on a failed validate (consumed / expired / not_found / country_blocked / revoked / server_error)', async () => {
    const cases = ['consumed', 'expired', 'not_found', 'country_blocked', 'revoked', 'server_error'] as const;

    for (const reason of cases) {
      rpcMock.mockReset();
      const captured: Array<Record<string, unknown>> = [];
      setupFromHandlers({
        code_attempts: () => ({
          insert: (row: Record<string, unknown>) => {
            captured.push(row);
            return Promise.resolve({ error: null });
          },
        }),
      });

      rpcMock.mockResolvedValueOnce({
        data: [{ ok: false, reason, access_code_id: 'ac-1', customer_id: null, trainer_id: 't-1' }],
        error: null,
      });

      const { POST } = await import('@/app/api/codes/validate/route');
      const res = await POST(
        buildRequest({
          code: 'GOOD-CODE-001',
          email: 'a@b.co',
          name: 'A B',
          country: 'Singapore',
          city: 'Singapore',
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ valid: false, reason });
      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({
        outcome: reason,
        access_code_id: 'ac-1',
        trainer_id: 't-1',
      });
    }
  });

  it('happy path: ok=true → returns valid=true + customer_id + bc_customer_id + session_token, logs success', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          reason: null,
          access_code_id: 'ac-9',
          customer_id: 'cust-9',
          trainer_id: 'trn-9',
        },
      ],
      error: null,
    });

    const captured: Array<Record<string, unknown>> = [];
    setupFromHandlers({
      // Post-RPC BigCommerce sync looks up the customer row for the existing
      // bigcommerce_customer_id.
      customers: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { bigcommerce_customer_id: null },
                error: null,
              }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
      // Trainer-notification SELECT
      trainers: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { email: 'trainer@x.com', name: 'Coach' },
                error: null,
              }),
          }),
        }),
      }),
      code_attempts: () => ({
        insert: (row: Record<string, unknown>) => {
          captured.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    });

    const { POST } = await import('@/app/api/codes/validate/route');
    const res = await POST(
      buildRequest({
        code: 'GOOD-CODE-001',
        email: 'a@b.co',
        name: 'A B',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      valid: true,
      customer_id: 'cust-9',
      session_token: 'fake-session-token',
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      outcome: 'success',
      access_code_id: 'ac-9',
      trainer_id: 'trn-9',
    });
  });

  it('treats an RPC supabase error as server_error and still records the attempt', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection lost' },
    });

    const captured: Array<Record<string, unknown>> = [];
    setupFromHandlers({
      code_attempts: () => ({
        insert: (row: Record<string, unknown>) => {
          captured.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    });

    const { POST } = await import('@/app/api/codes/validate/route');
    const res = await POST(
      buildRequest({
        code: 'GOOD-CODE-001',
        email: 'a@b.co',
        name: 'A B',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: false, reason: 'server_error' });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      outcome: 'server_error',
      reason_detail: 'connection lost',
    });
  });
});
