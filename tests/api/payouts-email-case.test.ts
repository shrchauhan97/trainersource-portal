// Regression coverage for AGGREGATE.md T2.13 on the admin-gated /api/payouts
// route — the financial endpoint that creates payout batches (POST) and marks
// payouts sent/confirmed (PATCH).
//
// This route was NOT among the 17 sites PR #47 originally fixed: its
// `requireAdmin()` looked up `admins.email` against the RAW session email via
// `.eq('email', user.email)`. A mixed-case admin session ("Op@Example.COM")
// missed the canonical lower-case `admins` row, so a legitimate admin got a
// 401 Unauthorized on every payout operation.
//
// These tests pin the case-insensitive admin lookup by asserting the exact
// string passed to `.eq('email', ...)` and that a mixed-case session
// authorizes (200, not 401).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const adminEqCalls: Array<{ column: string; value: unknown }> = [];

const mockAuth = {
  getUser: vi.fn(),
};

// The admins row is keyed by the canonical lower-case email; the mock only
// returns it when the route looks it up with the normalized form. If the
// route ever regresses to passing the raw mixed-case email, `maybeSingle`
// resolves null and the route falls to 401.
let adminRow: { id: string; email: string } | null = null;

function makeSupabase() {
  return {
    auth: mockAuth,
    from(table: string) {
      if (table === 'admins') {
        return {
          select: vi.fn().mockReturnThis(),
          eq(column: string, value: unknown) {
            adminEqCalls.push({ column, value });
            // Mimic a real lookup: only hand back the row when the value the
            // route passed matches the canonical stored email.
            const matched =
              adminRow && column === 'email' && value === adminRow.email
                ? adminRow
                : null;
            return {
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: matched, error: null }),
            };
          },
        };
      }
      if (table === 'commissions') {
        // POST builds: from('commissions').select(...).eq(...).is(...)
        //   .gte(...).lte(...) and awaits the chain. Resolve to an empty
        //   approved-commission set so the batch completes with no payouts.
        const chain: Record<string, unknown> = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          is: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          lte: vi.fn(() => chain),
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: [], error: null }),
        };
        return chain;
      }
      return {};
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSupabase(),
}));

beforeEach(() => {
  adminEqCalls.length = 0;
  mockAuth.getUser.mockReset();
  adminRow = null;
});

function postRequest() {
  return new Request('https://x/api/payouts', {
    method: 'POST',
    body: JSON.stringify({ period_start: '2026-01-01', period_end: '2026-01-31' }),
  });
}

describe('POST /api/payouts — case-insensitive admin email matching (T2.13)', () => {
  it('lower-cases a mixed-case admin session email and authorizes the batch', async () => {
    adminRow = { id: 'admin-1', email: 'op@example.com' };
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: 'Op@Example.COM' } },
      error: null,
    });

    const { POST } = await import('@/app/api/payouts/route');
    const res = await POST(postRequest());

    // 200 — not 401 — proves the admin row was resolvable after normalization.
    expect(res.status).toBe(200);
    const emailCall = adminEqCalls.find((c) => c.column === 'email');
    expect(emailCall?.value).toBe('op@example.com');
  });

  it('trims surrounding whitespace from the admin session email', async () => {
    adminRow = { id: 'admin-1', email: 'op@example.com' };
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: '  op@example.com  ' } },
      error: null,
    });

    const { POST } = await import('@/app/api/payouts/route');
    const res = await POST(postRequest());

    expect(res.status).toBe(200);
    const emailCall = adminEqCalls.find((c) => c.column === 'email');
    expect(emailCall?.value).toBe('op@example.com');
  });

  it('returns 401 when the mixed-case session matches no admin row', async () => {
    // No admin configured — the normalized lookup still runs, but finds nothing.
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: 'Stranger@Example.COM' } },
      error: null,
    });

    const { POST } = await import('@/app/api/payouts/route');
    const res = await POST(postRequest());

    expect(res.status).toBe(401);
    // The lookup MUST have run with the lower-cased form; a regression to the
    // raw email would trip this assertion.
    expect(adminEqCalls).toContainEqual({ column: 'email', value: 'stranger@example.com' });
  });

  it('returns 401 without any admin lookup when the session has no email', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: null } },
      error: null,
    });

    const { POST } = await import('@/app/api/payouts/route');
    const res = await POST(postRequest());

    expect(res.status).toBe(401);
    expect(adminEqCalls.find((c) => c.column === 'email')).toBeUndefined();
  });

  it('returns 401 without any admin lookup when the session email is whitespace-only', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: '   ' } },
      error: null,
    });

    const { POST } = await import('@/app/api/payouts/route');
    const res = await POST(postRequest());

    expect(res.status).toBe(401);
    expect(adminEqCalls.find((c) => c.column === 'email')).toBeUndefined();
  });
});
