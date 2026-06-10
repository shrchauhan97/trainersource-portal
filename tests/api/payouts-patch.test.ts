// tests/api/payouts-patch.test.ts
//
// Regression coverage for PATCH /api/payouts (nightly 2026-05-30).
//
// Prior to this wave the route only checked that `status` was one of
// `['pending','sent','confirmed']`; it did NOT validate that the requested
// transition was legal, AND it never cascaded `confirmed` → commissions=`paid`
// the way the admin/actions.ts server action does. Two real consequences:
//
//   1. An authenticated admin (any role) could rewind a payout from
//      `confirmed` back to `pending`, or skip `pending` straight to
//      `confirmed`, bypassing the Wise-transfer-id capture step.
//   2. Confirming a payout via the API path left every attached commission
//      stuck on `approved`, breaking the dashboard invariant that all
//      commissions inside a `confirmed` payout read as `paid`.
//
// These tests pin both contracts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseFromMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: supabaseFromMock,
  })),
}));

import { PATCH } from '@/app/api/payouts/route';

type FromHandlers = Record<string, () => unknown>;

function installFromHandlers(handlers: FromHandlers) {
  supabaseFromMock.mockImplementation((table: string) => {
    const fn = handlers[table];
    if (!fn) throw new Error(`unexpected table: ${table}`);
    return fn();
  });
}

function adminLookupChain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { id: 'admin-1', role: 'admin', email: 'a@x.test' }, error: null }),
  };
}

function payoutLookupChain(payout: { id: string; status: 'pending' | 'sent' | 'confirmed' } | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: payout, error: null }),
  };
}

function payoutUpdateChain(opts: { resultStatus: 'pending' | 'sent' | 'confirmed' }) {
  const updateSpy = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'p1', status: opts.resultStatus, total: 100, trainer_id: 't1' },
          error: null,
        }),
      }),
    }),
  });
  return { updateSpy, chain: { update: updateSpy } };
}

function commissionsUpdateChain() {
  const innerEqResult = { error: null as unknown };
  const innerEq = vi.fn().mockResolvedValue(innerEqResult);
  const outerEq = vi.fn().mockReturnValue({ eq: innerEq });
  const updateSpy = vi.fn().mockReturnValue({ eq: outerEq });
  return { updateSpy, outerEq, innerEq };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/payouts', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { email: 'a@x.test' } }, error: null });
});

describe('PATCH /api/payouts — state machine', () => {
  it('returns 404 when payoutId does not exist', async () => {
    installFromHandlers({
      admins: adminLookupChain,
      payouts: () => payoutLookupChain(null),
    });

    const res = await PATCH(makeRequest({ payoutId: 'missing', status: 'sent' }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it('rejects the skip transition pending → confirmed with 409', async () => {
    const updateChain = payoutUpdateChain({ resultStatus: 'confirmed' });
    const commissions = commissionsUpdateChain();

    installFromHandlers({
      admins: adminLookupChain,
      payouts: () => ({
        ...payoutLookupChain({ id: 'p1', status: 'pending' }),
        ...updateChain.chain,
      }),
      commissions: () => ({ update: commissions.updateSpy }),
    });

    const res = await PATCH(makeRequest({ payoutId: 'p1', status: 'confirmed' }));
    expect(res.status).toBe(409);
    expect(updateChain.updateSpy).not.toHaveBeenCalled();
    expect(commissions.updateSpy).not.toHaveBeenCalled();
  });

  it('rejects the rewind transition sent → pending with 409', async () => {
    const updateChain = payoutUpdateChain({ resultStatus: 'pending' });
    const commissions = commissionsUpdateChain();

    installFromHandlers({
      admins: adminLookupChain,
      payouts: () => ({
        ...payoutLookupChain({ id: 'p1', status: 'sent' }),
        ...updateChain.chain,
      }),
      commissions: () => ({ update: commissions.updateSpy }),
    });

    const res = await PATCH(makeRequest({ payoutId: 'p1', status: 'pending' }));
    expect(res.status).toBe(409);
    expect(updateChain.updateSpy).not.toHaveBeenCalled();
    expect(commissions.updateSpy).not.toHaveBeenCalled();
  });

  it('rejects rewinding away from terminal confirmed → sent with 409', async () => {
    const updateChain = payoutUpdateChain({ resultStatus: 'sent' });
    const commissions = commissionsUpdateChain();

    installFromHandlers({
      admins: adminLookupChain,
      payouts: () => ({
        ...payoutLookupChain({ id: 'p1', status: 'confirmed' }),
        ...updateChain.chain,
      }),
      commissions: () => ({ update: commissions.updateSpy }),
    });

    const res = await PATCH(makeRequest({ payoutId: 'p1', status: 'sent' }));
    expect(res.status).toBe(409);
    expect(updateChain.updateSpy).not.toHaveBeenCalled();
  });

  it('rejects the no-op pending → pending with 409', async () => {
    const updateChain = payoutUpdateChain({ resultStatus: 'pending' });
    const commissions = commissionsUpdateChain();

    installFromHandlers({
      admins: adminLookupChain,
      payouts: () => ({
        ...payoutLookupChain({ id: 'p1', status: 'pending' }),
        ...updateChain.chain,
      }),
      commissions: () => ({ update: commissions.updateSpy }),
    });

    const res = await PATCH(makeRequest({ payoutId: 'p1', status: 'pending' }));
    expect(res.status).toBe(409);
  });

  it('accepts the legal pending → sent and does NOT cascade commissions', async () => {
    const updateChain = payoutUpdateChain({ resultStatus: 'sent' });
    const commissions = commissionsUpdateChain();

    installFromHandlers({
      admins: adminLookupChain,
      payouts: () => ({
        ...payoutLookupChain({ id: 'p1', status: 'pending' }),
        ...updateChain.chain,
      }),
      commissions: () => ({ update: commissions.updateSpy }),
    });

    const res = await PATCH(
      makeRequest({ payoutId: 'p1', status: 'sent', wise_transfer_id: 'wt-123' }),
    );
    expect(res.status).toBe(200);
    expect(updateChain.updateSpy).toHaveBeenCalledTimes(1);
    expect(updateChain.updateSpy).toHaveBeenCalledWith({ status: 'sent', wise_transfer_id: 'wt-123' });
    // Cascade is `confirmed`-only.
    expect(commissions.updateSpy).not.toHaveBeenCalled();
  });

  it('accepts the legal sent → confirmed and cascades commissions approved → paid', async () => {
    const updateChain = payoutUpdateChain({ resultStatus: 'confirmed' });
    const commissions = commissionsUpdateChain();

    installFromHandlers({
      admins: adminLookupChain,
      payouts: () => ({
        ...payoutLookupChain({ id: 'p1', status: 'sent' }),
        ...updateChain.chain,
      }),
      commissions: () => ({ update: commissions.updateSpy }),
    });

    const res = await PATCH(makeRequest({ payoutId: 'p1', status: 'confirmed' }));
    expect(res.status).toBe(200);
    expect(updateChain.updateSpy).toHaveBeenCalledTimes(1);
    // Cascade runs with the two-eq filter so already-paid commissions aren't
    // touched and orphan commissions on other payouts aren't either.
    expect(commissions.updateSpy).toHaveBeenCalledWith({ status: 'paid' });
    expect(commissions.outerEq).toHaveBeenCalledWith('payout_id', 'p1');
    expect(commissions.innerEq).toHaveBeenCalledWith('status', 'approved');
  });

  it('returns 401 when no admin row matches the authenticated email', async () => {
    installFromHandlers({
      admins: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const res = await PATCH(makeRequest({ payoutId: 'p1', status: 'sent' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on an unknown status value', async () => {
    installFromHandlers({
      admins: adminLookupChain,
    });

    const res = await PATCH(makeRequest({ payoutId: 'p1', status: 'paid' as unknown as 'sent' }));
    expect(res.status).toBe(400);
  });
});
