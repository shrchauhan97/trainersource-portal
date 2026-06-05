// tests/api/bc-webhook.test.ts
//
// Unit-level coverage for POST /api/webhooks/bigcommerce (Wave-3 T2.19).
//
// The webhook now delegates both writes (orders + commissions) to a single
// PL/pgSQL function `ingest_bc_order_and_commission` so duplicate deliveries
// hit ON CONFLICT and we never end up with an order row + missing commission
// row. The route's job is to compute the commission amount up-front, call the
// RPC, and translate the {ok, was_new} result into a 200/idempotent/500
// response.
//
// We mock:
//   * the supabase-js client (the route still uses createServiceRoleClient
//     inline, which calls createSupabaseClient under the hood)
//   * the BC REST fetch (global fetch)
//   * email senders (Resend client must not be touched)
//
// Three cases exercise the atomicity + idempotency contract:
//   1. Happy path — fresh order, both rows written via single RPC call.
//   2. Duplicate webhook — RPC returns was_new=false; route returns
//      {idempotent: true}, NEVER hits the email sender.
//   3. Concurrent webhooks — two near-simultaneous calls for the same
//      bigcommerce_order_id; one wins, the other is idempotent. Verifies the
//      orders.insert is not invoked directly anywhere (only via RPC).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseRpcMock = vi.fn();
const supabaseFromMock = vi.fn();
const sendEmailMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: supabaseRpcMock,
    from: supabaseFromMock,
    auth: { getUser: vi.fn() },
  })),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: sendEmailMock,
  firstOrderEmail: vi.fn().mockReturnValue({
    subject: 'first sale',
    html: '<p>congrats</p>',
  }),
}));

const CUSTOMER = {
  id: 'cust-uuid',
  bigcommerce_customer_id: '42',
  email: 'client@example.com',
  name: 'Client Person',
  country: 'Singapore',
  city: 'Singapore',
  trainer_id: 'trainer-uuid',
};

const TRAINER = {
  id: 'trainer-uuid',
  name: 'Sarah Trainer',
  email: 'sarah@trainer-source.com',
  commission_rate: 0.2,
  reorder_commission_rate: 0.1,
  // Other Trainer fields not consulted by the webhook for this test.
};

function setupFromHandlers(handlers: Record<string, () => unknown>) {
  supabaseFromMock.mockImplementation((table: string) => {
    const fn = handlers[table];
    if (!fn) {
      throw new Error(`unexpected table: ${table}`);
    }
    return fn();
  });
}

// Default `from()` chain used by happy-path tests: customer lookup by BC id,
// previous-settled-orders count returning `priorSettledOrders`, trainer lookup
// returning TRAINER.
//
// The route counts prior SETTLED orders, EXCLUDING the order currently being
// reconciled, via
//   .from('orders').select('id', {head})
//     .eq('customer_id', …).in('status', […]).neq('bigcommerce_order_id', …)
// so the orders mock must support the chain terminating on `.neq(...)`. We make
// `.in(...)` return a thenable that ALSO exposes `.neq(...)` so the mock works
// whether the route awaits after `.in(...)` (old, buggy) or after `.neq(...)`
// (fixed). Both resolve to the SAME priorSettledOrders count — the regression
// test instead asserts that `.neq(...)` was actually called with the current
// order id, which is the load-bearing exclusion.
//
// `ordersNeqSpy` captures the (column, value) the route passes to `.neq(...)`
// so a test can assert the current order is excluded from the prior count.
let ordersNeqSpy: ReturnType<typeof vi.fn>;

// The route reads the count AFTER `.neq(...)` (the current-order exclusion), so
// `postExclusionCount` is the value that actually drives first-sale vs reorder.
// `priorSettledOrders` is what `.in(...)` resolves to PRE-exclusion; it only
// matters for the buggy/old path that awaited before `.neq(...)`. By default
// the two are equal (no current-order row in the settled set). A regression
// test sets them apart — e.g. pre=1, post=0 models "the only settled order IS
// this very order", which the exclusion must drop to 0 → first_sale.
function makeOrdersCountResult(priorSettledOrders: number, postExclusionCount = priorSettledOrders) {
  // A Promise that resolves the PostgREST-style { count, error } shape, but
  // which ALSO carries a `.neq` method so the chain can continue. This lets the
  // same mock satisfy `await query.in(...)` and `await query.in(...).neq(...)`.
  const result = Promise.resolve({ count: priorSettledOrders, error: null });
  ordersNeqSpy = vi.fn().mockResolvedValue({ count: postExclusionCount, error: null });
  (result as unknown as { neq: typeof ordersNeqSpy }).neq = ordersNeqSpy;
  return result;
}

function defaultFromHandlers(priorSettledOrders = 0, postExclusionCount = priorSettledOrders) {
  return {
    customers: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: CUSTOMER, error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
    orders: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue(
            makeOrdersCountResult(priorSettledOrders, postExclusionCount),
          ),
        }),
      }),
    }),
    trainers: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: TRAINER, error: null }),
    }),
  } satisfies Record<string, () => unknown>;
}

function bcOrderResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1001,
    customer_id: 42,
    status: 'Awaiting Fulfillment',
    total_inc_tax: '150.00',
    payment_method: 'ACH',
    billing_address: {
      country: 'Singapore',
      city: 'Singapore',
      email: 'client@example.com',
    },
    date_created: '2026-05-14T01:00:00Z',
    date_modified: '2026-05-14T01:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc-key');
  vi.stubEnv('BIGCOMMERCE_WEBHOOK_SECRET', 'whsec');
  vi.stubEnv('BIGCOMMERCE_STORE_HASH', 'abc');
  vi.stubEnv('BIGCOMMERCE_ACCESS_TOKEN', 'tok');

  supabaseRpcMock.mockReset();
  supabaseFromMock.mockReset();
  sendEmailMock.mockClear();

  // Default BC REST stub. Individual tests override.
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => bcOrderResponse(),
  }) as typeof fetch;
});

function buildRequest(body: Record<string, unknown>) {
  return new Request('https://trainer-source.com/api/webhooks/bigcommerce', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: 'Bearer whsec',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/webhooks/bigcommerce — atomicity + idempotency', () => {
  it('happy path: writes order + commission via single RPC call (was_new=true)', async () => {
    setupFromHandlers(defaultFromHandlers());
    supabaseRpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          was_new: true,
          reason: null,
          order_id: 'order-uuid-1',
          commission_id: 'commission-uuid-1',
        },
      ],
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/created', data: { id: 1001, customer_id: 42 } }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, order_id: 'order-uuid-1' });
    expect(body.idempotent).toBeUndefined();

    // The RPC is the sole order/commission write path — verify it's called
    // exactly once with the right commission payload (first sale → 20% of
    // $150 = $30.00).
    expect(supabaseRpcMock).toHaveBeenCalledTimes(1);
    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'ingest_bc_order_and_commission',
      expect.objectContaining({
        p_bigcommerce_order_id: '1001',
        p_customer_id: 'cust-uuid',
        p_trainer_id: 'trainer-uuid',
        p_total: 150,
        p_status: 'paid',
        p_commission_type: 'first_sale',
        p_commission_rate: 0.2,
        p_commission_amount: 30,
      }),
    );

    // First-sale notification fires on a fresh write.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('duplicate webhook delivery: RPC returns was_new=false → 200 with idempotent:true, no email', async () => {
    setupFromHandlers(defaultFromHandlers());
    supabaseRpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          was_new: false,
          reason: 'duplicate_delivery',
          order_id: 'order-uuid-1',
          commission_id: 'commission-uuid-1',
        },
      ],
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/created', data: { id: 1001, customer_id: 42 } }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      idempotent: true,
      order_id: 'order-uuid-1',
    });

    // The route handed BC's retry off to the RPC, which short-circuited.
    // The first-sale email MUST NOT fire on a duplicate — the first
    // delivery already sent it.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('concurrent webhooks (same bigcommerce_order_id): one wins, the other is idempotent', async () => {
    // Simulates two near-simultaneous deliveries that both pass HMAC,
    // both fetch BC, and both call the RPC. The RPC is the serialisation
    // point: first call gets was_new=true; second call gets was_new=false
    // because the ON CONFLICT (bigcommerce_order_id) DO NOTHING returned
    // zero rows for it.
    setupFromHandlers(defaultFromHandlers());
    supabaseRpcMock
      .mockResolvedValueOnce({
        data: [
          {
            ok: true,
            was_new: true,
            reason: null,
            order_id: 'order-uuid-1',
            commission_id: 'commission-uuid-1',
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            ok: true,
            was_new: false,
            reason: 'duplicate_delivery',
            order_id: 'order-uuid-1',
            commission_id: 'commission-uuid-1',
          },
        ],
        error: null,
      });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const req1 = buildRequest({
      scope: 'store/order/created',
      data: { id: 1001, customer_id: 42 },
    });
    const req2 = buildRequest({
      scope: 'store/order/created',
      data: { id: 1001, customer_id: 42 },
    });

    const [res1, res2] = await Promise.all([POST(req1), POST(req2)]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const body1 = await res1.json();
    const body2 = await res2.json();

    // One response has order_id and is fresh; the other is idempotent. We
    // don't depend on which arrived first — only on the contract that one
    // wins and the other is short-circuited.
    const fresh = [body1, body2].find((b) => !b.idempotent);
    const dup = [body1, body2].find((b) => b.idempotent);
    expect(fresh).toMatchObject({ ok: true, order_id: 'order-uuid-1' });
    expect(dup).toMatchObject({
      ok: true,
      idempotent: true,
      order_id: 'order-uuid-1',
    });

    // Exactly one email — only the fresh delivery notifies the trainer.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    // Exactly two RPC invocations — no other write path was used.
    expect(supabaseRpcMock).toHaveBeenCalledTimes(2);
  });

  it('RPC returns ok=false (server_error from EXCEPTION block) → 500 ingest_failed', async () => {
    setupFromHandlers(defaultFromHandlers());
    supabaseRpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: false,
          was_new: false,
          reason: 'server_error',
          order_id: null,
          commission_id: null,
        },
      ],
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/created', data: { id: 1001, customer_id: 42 } }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('ingest_failed');
    expect(body.reason).toBe('server_error');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('reorder: a prior SETTLED order for the customer → reorder rate (10%)', async () => {
    // Customer already has one settled order → this purchase is a reorder.
    setupFromHandlers(defaultFromHandlers(1));
    supabaseRpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          was_new: true,
          reason: null,
          order_id: 'order-uuid-2',
          commission_id: 'commission-uuid-2',
        },
      ],
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/created', data: { id: 2002, customer_id: 42 } }),
    );

    expect(res.status).toBe(200);
    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'ingest_bc_order_and_commission',
      expect.objectContaining({
        p_commission_type: 'reorder',
        p_commission_rate: 0.1,
        // 10% of $150 = $15.00
        p_commission_amount: 15,
      }),
    );
  });

  it('first sale: prior PENDING-only orders (zero settled) still count as first_sale (20%)', async () => {
    // Regression for first-sale misclassification: an ACH / "awaiting payment"
    // first order creates a `pending` orders row but NO commission. The
    // customer's first commissionable order must still be classified as
    // first_sale — counting that pending row would wrongly demote it to a
    // reorder and underpay the trainer. The route counts only SETTLED prior
    // orders, so the settled count here is 0.
    setupFromHandlers(defaultFromHandlers(0));
    supabaseRpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          was_new: true,
          reason: null,
          order_id: 'order-uuid-3',
          commission_id: 'commission-uuid-3',
        },
      ],
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/created', data: { id: 3003, customer_id: 42 } }),
    );

    expect(res.status).toBe(200);
    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'ingest_bc_order_and_commission',
      expect.objectContaining({
        p_commission_type: 'first_sale',
        p_commission_rate: 0.2,
        // 20% of $150 = $30.00
        p_commission_amount: 30,
      }),
    );
  });

  it('non-actionable status (cancelled): skips RPC entirely', async () => {
    setupFromHandlers(defaultFromHandlers());
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => bcOrderResponse({ status: 'Cancelled' }),
    }) as typeof fetch;

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/created', data: { id: 1001, customer_id: 42 } }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, skipped: true, reason: 'status_not_actionable' });
    expect(supabaseRpcMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PR #45 — order/updated reconcile must not count the order being settled as
  // a "prior settled order". On the ACH settle path the order row is upserted
  // to a settled status; if the prior-settled COUNT does not exclude THIS
  // order's bigcommerce_order_id, the order sees *itself* as a prior settled
  // order, flips first_sale (20%) → reorder (10%), and suppresses the
  // first-sale email — underpaying the trainer on exactly the path this PR
  // exists to fix.
  // ──────────────────────────────────────────────────────────────────────────

  it('first-ever order via order/updated settle: booked first_sale @20% and excludes self from prior count', async () => {
    // The order being reconciled is the customer's FIRST. By the time this
    // order/updated lands, the order row already exists in a settled status
    // (created-then-settled, or a re-delivered settle). A naive prior-settled
    // count returns 1 (it counts THIS order) → reorder @10%. The route must
    // exclude the current bigcommerce_order_id, so the genuine count drops to 0
    // and the order is correctly first_sale @20%. We model that with pre=1
    // (the order counts itself), post=0 (after excluding self, none remain).
    setupFromHandlers(defaultFromHandlers(1, 0));
    supabaseRpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          was_new: true,
          reason: null,
          order_id: 'order-uuid-settle-1',
          commission_id: 'commission-uuid-settle-1',
        },
      ],
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/updated', data: { id: 1001, customer_id: 42 } }),
    );

    expect(res.status).toBe(200);

    // The exclusion is the load-bearing fix: the prior-settled count must call
    // .neq('bigcommerce_order_id', '<this order id>').
    expect(ordersNeqSpy).toHaveBeenCalledWith('bigcommerce_order_id', '1001');

    // Routed through the reconcile RPC with the FIRST-SALE rate, not reorder.
    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'reconcile_bc_order_and_commission',
      expect.objectContaining({
        p_bigcommerce_order_id: '1001',
        p_commission_type: 'first_sale',
        p_commission_rate: 0.2,
        // 20% of $150 = $30.00
        p_commission_amount: 30,
      }),
    );

    // First-sale email fires exactly once for a genuine first settled sale.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('order/updated settle for a customer WITH a prior settled order: booked reorder @10% (no over-correction)', async () => {
    // Guard against over-correcting #45: a customer who genuinely has one OTHER
    // prior settled order (i.e. the count EXCLUDING this order is still 1) must
    // be a reorder. pre=2 (this order + one genuinely prior), post=1 (after
    // excluding self, one real prior settled order remains) → reorder.
    setupFromHandlers(defaultFromHandlers(2, 1));
    supabaseRpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          was_new: true,
          reason: null,
          order_id: 'order-uuid-reorder',
          commission_id: 'commission-uuid-reorder',
        },
      ],
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/updated', data: { id: 2002, customer_id: 42 } }),
    );

    expect(res.status).toBe(200);
    expect(ordersNeqSpy).toHaveBeenCalledWith('bigcommerce_order_id', '2002');
    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'reconcile_bc_order_and_commission',
      expect.objectContaining({
        p_commission_type: 'reorder',
        p_commission_rate: 0.1,
        // 10% of $150 = $15.00
        p_commission_amount: 15,
      }),
    );
  });

  it('still-pending order/updated (not settled): no commission payload, no email, RPC ack only', async () => {
    // An order/updated that has NOT yet settled (still "Awaiting Payment" →
    // pending). The order row is upserted but NO commission is computed
    // (commission_type/amount must be NULL) and NO first-sale email fires.
    setupFromHandlers(defaultFromHandlers(0));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => bcOrderResponse({ status: 'Awaiting Payment' }),
    }) as typeof fetch;
    supabaseRpcMock.mockResolvedValueOnce({
      data: [
        {
          ok: true,
          was_new: false,
          reason: 'no_commission',
          order_id: 'order-uuid-pending',
          commission_id: null,
        },
      ],
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/updated', data: { id: 4004, customer_id: 42 } }),
    );

    expect(res.status).toBe(200);
    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'reconcile_bc_order_and_commission',
      expect.objectContaining({
        p_status: 'pending',
        p_commission_type: null,
        p_commission_rate: null,
        p_commission_amount: null,
      }),
    );
    // No commission → no first-sale email, no double-book.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('reconcile RPC not deployed (42883 undefined_function): returns 200 reconcile_pending, no 5xx', async () => {
    // The reconcile RPC ships in a migration applied to prod separately from
    // the Vercel deploy. Until it exists, an order/updated must NOT 5xx (which
    // would trigger a BC retry-storm) — the route swallows the undefined_func
    // error and acks 200 { reconcile_pending: true }.
    setupFromHandlers(defaultFromHandlers(0));
    supabaseRpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42883',
        message:
          'function public.reconcile_bc_order_and_commission(...) does not exist',
      },
    });

    const { POST } = await import('@/app/api/webhooks/bigcommerce/route');
    const res = await POST(
      buildRequest({ scope: 'store/order/updated', data: { id: 5005, customer_id: 42 } }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, reconcile_pending: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
