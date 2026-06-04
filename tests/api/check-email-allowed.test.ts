import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));
// Unique source IP per call so the per-instance rate-limit bucket
// doesn't carry quota between tests. The rate-limit assertion below
// re-mocks with a fixed IP for its specific test.
const { ipTick } = vi.hoisted(() => ({ ipTick: { n: 0 } }));
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'x-forwarded-for' ? `203.0.113.${++ipTick.n}` : null,
    }),
}));

import { checkEmailAllowed } from '@/app/login/actions';

function adminsRow(role: 'admin' | 'superadmin' | null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: role ? { id: 'a1' } : null, error: null }),
      }),
    }),
  };
}

function trainersRow(
  trainer: { status: 'active' | 'suspended' | 'applied' | 'onboarding' } | null,
  error: { code?: string; message?: string } | null = null
) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: trainer ? { id: 't1', status: trainer.status } : null, error }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkEmailAllowed', () => {
  it('rejects malformed email', async () => {
    const result = await checkEmailAllowed('not-an-email');
    expect(result).toEqual({ allowed: false, reason: 'invalid' });
  });

  it('admin email is allowed (hasPassword reflects RPC)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow('admin');
      throw new Error('unexpected table: ' + table);
    });
    mockRpc.mockResolvedValue({ data: true, error: null });

    const result = await checkEmailAllowed('admin@example.com');
    expect(result).toEqual({ allowed: true, hasPassword: true });
  });

  it('active trainer is allowed; hasPassword false when RPC returns false', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'active' });
      throw new Error('unexpected table: ' + table);
    });
    mockRpc.mockResolvedValue({ data: false, error: null });

    const result = await checkEmailAllowed('trainer@example.com');
    expect(result).toEqual({ allowed: true, hasPassword: false });
  });

  it('suspended trainer returns suspended (and never reaches RPC)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'suspended' });
      throw new Error('unexpected table: ' + table);
    });

    const result = await checkEmailAllowed('suspended@example.com');
    expect(result).toEqual({ allowed: false, reason: 'suspended' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('applied trainer (not yet approved) returns not_authorized', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'applied' });
      throw new Error('unexpected table: ' + table);
    });

    const result = await checkEmailAllowed('applicant@example.com');
    expect(result).toEqual({ allowed: false, reason: 'not_authorized' });
  });

  // SHA-6 regression — pre-fix, 'onboarding' trainers were rejected as
  // not_authorized at the login form, so the approval magic-link email
  // dead-ended the moment they clicked it. They MUST flow through to the
  // RPC password check (and ultimately /onboarding) just like an active
  // trainer.
  it('onboarding (approved) trainer is allowed; hasPassword reflects RPC', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'onboarding' });
      throw new Error('unexpected table: ' + table);
    });
    mockRpc.mockResolvedValue({ data: false, error: null });

    const result = await checkEmailAllowed('approved@example.com');
    expect(result).toEqual({ allowed: true, hasPassword: false });
  });

  it('unknown email returns not_authorized', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow(null);
      throw new Error('unexpected table: ' + table);
    });
    const result = await checkEmailAllowed('nobody@example.com');
    expect(result).toEqual({ allowed: false, reason: 'not_authorized' });
  });

  it('admins lookup error surfaces server_error (not not_authorized)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: null,
                  error: { code: 'PGRST500', message: 'timeout' },
                }),
            }),
          }),
        };
      }
      throw new Error('unexpected table: ' + table);
    });
    const result = await checkEmailAllowed('any@example.com');
    expect(result).toEqual({ allowed: false, reason: 'server_error' });
  });

  it('trainers lookup error surfaces server_error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers')
        return trainersRow(null, { code: 'PGRST500', message: 'timeout' });
      throw new Error('unexpected table: ' + table);
    });
    const result = await checkEmailAllowed('any@example.com');
    expect(result).toEqual({ allowed: false, reason: 'server_error' });
  });

  it('RPC error surfaces server_error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow('admin');
      throw new Error('unexpected table: ' + table);
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    const result = await checkEmailAllowed('admin@example.com');
    expect(result).toEqual({ allowed: false, reason: 'server_error' });
  });

});

// Rate-limit assertion gets its own describe so we can isolate the
// module-level BUCKET. Without resetModules() the bucket here would
// already be past LIMIT from preceding tests and the assertion would
// pass for the wrong reason.
describe('checkEmailAllowed — rate limit', () => {
  it('rejects with rate_limited once same IP exceeds LIMIT in the window', async () => {
    vi.resetModules();
    const freshFrom = vi.fn((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow(null);
      throw new Error('unexpected table: ' + table);
    });
    vi.doMock('@/lib/supabase/service', () => ({
      createServiceClient: () => ({ from: freshFrom, rpc: vi.fn() }),
    }));
    vi.doMock('next/headers', () => ({
      headers: () =>
        Promise.resolve({
          get: (name: string) => (name === 'x-forwarded-for' ? '198.51.100.7' : null),
        }),
    }));
    const { checkEmailAllowed: fresh } = await import('@/app/login/actions');

    const results: Array<Awaited<ReturnType<typeof fresh>>> = [];
    for (let i = 0; i < 12; i++) {
      results.push(await fresh(`u${i}@example.com`));
    }
    const allowedCount = results.filter((r) => !('reason' in r) || r.reason !== 'rate_limited').length;
    const limitedCount = results.length - allowedCount;
    expect(allowedCount).toBe(10);
    expect(limitedCount).toBe(2);
  });
});
