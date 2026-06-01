// Regression coverage for AGGREGATE.md T2.13.
//
// Before normalizeSessionEmail() landed, `/api/codes/generate` called
// `supabase.from('trainers').select('*').eq('email', user.email)` directly.
// If a trainer's Supabase auth session carried `Sarah@Example.COM` (the case
// the user originally typed into the magic-link form) but the persisted
// `trainers.email` row is canonical `sarah@example.com`, the lookup silently
// missed and the route returned 401 Unauthorized.
//
// This test pins down the case-insensitive lookup contract by asserting the
// exact string passed to `.eq('email', ...)`.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TRAINER_ROW = {
  id: 'trainer-uuid',
  email: 'sarah@example.com',
  status: 'active',
  max_clients: 100,
};

const trainerEqCalls: Array<{ column: string; value: unknown }> = [];

const mockAuth = {
  getUser: vi.fn(),
};

function makeSupabase() {
  return {
    auth: mockAuth,
    from(table: string) {
      if (table === 'trainers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq(column: string, value: unknown) {
            trainerEqCalls.push({ column, value });
            return {
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: TRAINER_ROW, error: null }),
            };
          },
        };
      }
      if (table === 'customers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi
            .fn()
            .mockResolvedValue({ count: 0, error: null }),
        };
      }
      if (table === 'access_codes') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { code: 'ABC12345', expires_at: '2099-01-01T00:00:00Z' },
            error: null,
          }),
        };
      }
      return {};
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSupabase(),
}));

beforeEach(() => {
  trainerEqCalls.length = 0;
  mockAuth.getUser.mockReset();
});

describe('POST /api/codes/generate — case-insensitive email matching (T2.13)', () => {
  it('lower-cases a mixed-case session email before the trainer lookup', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: 'Sarah@Example.COM' } },
      error: null,
    });
    const { POST } = await import('@/app/api/codes/generate/route');
    const res = await POST();
    expect(res.status).toBe(200);

    const emailCall = trainerEqCalls.find((c) => c.column === 'email');
    expect(emailCall).toBeDefined();
    expect(emailCall?.value).toBe('sarah@example.com');
  });

  it('trims surrounding whitespace from a session email', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: '  sarah@example.com  ' } },
      error: null,
    });
    const { POST } = await import('@/app/api/codes/generate/route');
    const res = await POST();
    expect(res.status).toBe(200);

    const emailCall = trainerEqCalls.find((c) => c.column === 'email');
    expect(emailCall?.value).toBe('sarah@example.com');
  });

  it('passes an already-canonical email through unchanged', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: 'sarah@example.com' } },
      error: null,
    });
    const { POST } = await import('@/app/api/codes/generate/route');
    const res = await POST();
    expect(res.status).toBe(200);

    const emailCall = trainerEqCalls.find((c) => c.column === 'email');
    expect(emailCall?.value).toBe('sarah@example.com');
  });

  it('returns 401 when no email is on the session (no trainer lookup attempted)', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: null } },
      error: null,
    });
    const { POST } = await import('@/app/api/codes/generate/route');
    const res = await POST();
    expect(res.status).toBe(401);
    // Critically: the route must NOT have run the trainer lookup with a
    // bogus value (null / 'null' / ''). It must short-circuit at the gate.
    expect(trainerEqCalls.find((c) => c.column === 'email')).toBeUndefined();
  });

  it('returns 401 when the session email is whitespace-only', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { email: '   ' } },
      error: null,
    });
    const { POST } = await import('@/app/api/codes/generate/route');
    const res = await POST();
    expect(res.status).toBe(401);
    expect(trainerEqCalls.find((c) => c.column === 'email')).toBeUndefined();
  });
});
