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
  createBigCommerceCustomer: vi.fn().mockResolvedValue({ id: 99, created: true }),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  newClientJoinedEmail: vi.fn().mockReturnValue({ subject: 's', html: '<p/>' }),
  storefrontWelcomeEmail: vi
    .fn()
    .mockReturnValue({ subject: 'welcome', html: '<p/>' }),
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

  // SHA-122: when BC mints a new storefront account we now send a welcome
  // email with a reset-password CTA, so a returning customer who clears
  // localStorage doesn't dead-end at the BC login form. The welcome MUST
  // only fire on a fresh insert — not when the customer already exists in
  // BC (typical "user re-enters a code" or 422 dedupe race).
  it('sends the storefront welcome email on a freshly minted BC customer', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          reason: null,
          access_code_id: 'ac-122',
          customer_id: 'cust-122',
          trainer_id: 'trn-122',
        },
      ],
      error: null,
    });
    setupFromHandlers({
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
      trainers: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      code_attempts: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    });

    const bigcommerceMod = await import('@/lib/bigcommerce');
    const emailMod = await import('@/lib/email');
    (
      bigcommerceMod.createBigCommerceCustomer as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ id: 7777, created: true });
    (
      bigcommerceMod.getBigCommerceCustomerByEmail as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null);
    const welcomeMock = emailMod.storefrontWelcomeEmail as ReturnType<typeof vi.fn>;
    const callsBefore = welcomeMock.mock.calls.length;

    const { POST } = await import('@/app/api/codes/validate/route');
    const res = await POST(
      buildRequest({
        code: 'WELCOME-001',
        email: 'New.Customer@Example.com',
        name: 'New Customer',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(res.status).toBe(200);
    expect(welcomeMock.mock.calls.length).toBeGreaterThan(callsBefore);
    const lastCall = welcomeMock.mock.calls[welcomeMock.mock.calls.length - 1];
    // Email is normalised to lower-case before reaching the email helper
    // (matches the trainers/admins/customers row contract).
    expect(lastCall?.[0]).toEqual({
      customerName: 'New Customer',
      customerEmail: 'new.customer@example.com',
    });
  });

  it('does NOT send the storefront welcome email when BC already had the customer', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          reason: null,
          access_code_id: 'ac-122b',
          customer_id: 'cust-122b',
          trainer_id: 'trn-122b',
        },
      ],
      error: null,
    });
    setupFromHandlers({
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
      trainers: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      code_attempts: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    });

    const bigcommerceMod = await import('@/lib/bigcommerce');
    const emailMod = await import('@/lib/email');
    // Existing BC customer surfaces via the email lookup — never reaches
    // createBigCommerceCustomer, no welcome email.
    (
      bigcommerceMod.getBigCommerceCustomerByEmail as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ id: 8888 });
    const welcomeMock = emailMod.storefrontWelcomeEmail as ReturnType<typeof vi.fn>;
    const callsBefore = welcomeMock.mock.calls.length;

    const { POST } = await import('@/app/api/codes/validate/route');
    const res = await POST(
      buildRequest({
        code: 'RETURNING-002',
        email: 'returning@example.com',
        name: 'Returning Customer',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(res.status).toBe(200);
    expect(welcomeMock.mock.calls.length).toBe(callsBefore);
  });

  it('does NOT send the storefront welcome email when the customer already has a bigcommerce_customer_id mapped', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          reason: null,
          access_code_id: 'ac-122c',
          customer_id: 'cust-122c',
          trainer_id: 'trn-122c',
        },
      ],
      error: null,
    });
    setupFromHandlers({
      customers: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { bigcommerce_customer_id: '4242' },
                error: null,
              }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
      trainers: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      code_attempts: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    });

    const bigcommerceMod = await import('@/lib/bigcommerce');
    const emailMod = await import('@/lib/email');
    const createMock = bigcommerceMod.createBigCommerceCustomer as ReturnType<
      typeof vi.fn
    >;
    const welcomeMock = emailMod.storefrontWelcomeEmail as ReturnType<typeof vi.fn>;
    const createCallsBefore = createMock.mock.calls.length;
    const welcomeCallsBefore = welcomeMock.mock.calls.length;

    const { POST } = await import('@/app/api/codes/validate/route');
    const res = await POST(
      buildRequest({
        code: 'ALREADY-MAPPED-003',
        email: 'mapped@example.com',
        name: 'Mapped Customer',
        country: 'Singapore',
        city: 'Singapore',
      }),
    );

    expect(res.status).toBe(200);
    expect(createMock.mock.calls.length).toBe(createCallsBefore);
    expect(welcomeMock.mock.calls.length).toBe(welcomeCallsBefore);
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
