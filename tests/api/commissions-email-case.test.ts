// Regression coverage for AGGREGATE.md T2.13 on the dual-role
// /api/commissions route. The original code looked up both `admins.email`
// and `trainers.email` against the raw session email in parallel; a
// mixed-case session ("MyAdmin@example.com") missed both rows and the
// request landed on 401 Unauthorized.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const emailEqCalls: Array<{ table: string; value: unknown }> = [];

const mockAuth = {
  getUser: vi.fn(),
};

let adminRow: { id: string; email: string } | null = null;
let trainerRow: { id: string; email: string } | null = null;

function makeSupabase() {
  return {
    auth: mockAuth,
    from(table: string) {
      if (table === 'admins' || table === 'trainers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq(column: string, value: unknown) {
            if (column === 'email') {
              emailEqCalls.push({ table, value });
            }
            return {
              maybeSingle: vi.fn().mockResolvedValue({
                data: table === 'admins' ? adminRow : trainerRow,
                error: null,
              }),
            };
          },
        };
      }
      if (table === 'commissions') {
        // The route builds a thenable chain:
        //   from('commissions').select(...).order(...)
        // and may further `.eq(...)` zero or more times. Awaiting the
        // chain resolves the empty result set.
        const chain: Record<string, unknown> = {
          select: vi.fn(() => chain),
          order: vi.fn(() => chain),
          eq: vi.fn(() => chain),
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
  emailEqCalls.length = 0;
  mockAuth.getUser.mockReset();
  adminRow = null;
  trainerRow = null;
});

describe('GET /api/commissions — case-insensitive email matching (T2.13)', () => {
  it('lower-cases a mixed-case admin session email and finds the admin row', async () => {
    adminRow = { id: 'admin-1', email: 'op@example.com' };
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: 'OP@Example.COM' } },
      error: null,
    });
    const { GET } = await import('@/app/api/commissions/route');
    const res = await GET(new Request('https://x/api/commissions'));
    expect(res.status).toBe(200);
    // Both admin and trainer lookups ran with the lower-cased email so the
    // admin row was resolvable — that's what flips the route off 401.
    expect(emailEqCalls).toContainEqual({ table: 'admins', value: 'op@example.com' });
    expect(emailEqCalls).toContainEqual({ table: 'trainers', value: 'op@example.com' });
  });

  it('lower-cases a mixed-case trainer session email and finds the trainer row', async () => {
    trainerRow = { id: 'trainer-1', email: 'sarah@example.com' };
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: 'Sarah@Example.com' } },
      error: null,
    });
    const { GET } = await import('@/app/api/commissions/route');
    const res = await GET(new Request('https://x/api/commissions'));
    expect(res.status).toBe(200);
    expect(emailEqCalls).toContainEqual({ table: 'trainers', value: 'sarah@example.com' });
  });

  it('returns 401 when neither admin nor trainer row matches', async () => {
    // No rows configured — both lookups return null.
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: 'Stranger@Example.com' } },
      error: null,
    });
    const { GET } = await import('@/app/api/commissions/route');
    const res = await GET(new Request('https://x/api/commissions'));
    expect(res.status).toBe(401);
    // But still: the lookups MUST have run with the lower-cased form. If we
    // ever regress to passing the raw mixed-case email, this assertion will
    // fail and tip us off.
    expect(emailEqCalls).toContainEqual({ table: 'admins', value: 'stranger@example.com' });
    expect(emailEqCalls).toContainEqual({ table: 'trainers', value: 'stranger@example.com' });
  });

  it('returns 401 without running any email lookup when the session has no email', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: null } },
      error: null,
    });
    const { GET } = await import('@/app/api/commissions/route');
    const res = await GET(new Request('https://x/api/commissions'));
    expect(res.status).toBe(401);
    expect(emailEqCalls).toHaveLength(0);
  });
});
