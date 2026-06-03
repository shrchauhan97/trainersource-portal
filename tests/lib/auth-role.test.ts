import { beforeEach, describe, expect, it, vi } from 'vitest';

// Direct unit coverage for getUserRole — previously only exercised through
// the auth-callback / sign-in tests, which mocked it out. SHA-5 hinges on
// this function returning 'trainer' for onboarding status (so the
// approved-but-not-active trainer can authenticate); pin the contract here.

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: mockFrom }),
}));

import { getUserRole } from '@/lib/auth';

function adminsRow(role: 'admin' | null) {
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
          Promise.resolve({
            data: trainer ? { id: 't1', status: trainer.status } : null,
            error,
          }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getUserRole', () => {
  it('returns unauthorized for empty/whitespace email', async () => {
    expect(await getUserRole(null)).toBe('unauthorized');
    expect(await getUserRole('')).toBe('unauthorized');
    expect(await getUserRole('   ')).toBe('unauthorized');
  });

  it('returns admin when the email is in the admins table', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow('admin');
      throw new Error('unexpected table: ' + table);
    });
    expect(await getUserRole('admin@example.com')).toBe('admin');
  });

  it('returns trainer for active trainer', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'active' });
      throw new Error('unexpected table: ' + table);
    });
    expect(await getUserRole('trainer@example.com')).toBe('trainer');
  });

  it('returns trainer for onboarding trainer (SHA-5)', async () => {
    // Before SHA-5 this returned 'unauthorized' — the trainer was approved
    // (admin clicked Approve, status flipped applied → onboarding) but the
    // auth gate then rejected them, making the entire onboarding flow
    // unreachable. The dashboard shell is already designed to render for
    // onboarding trainers (see src/app/dashboard/actions.ts:89-92), so
    // mapping onboarding → 'trainer' here doesn't open new attack surface;
    // mutation actions re-check status === 'active' before running.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'onboarding' });
      throw new Error('unexpected table: ' + table);
    });
    expect(await getUserRole('onboarding@example.com')).toBe('trainer');
  });

  it('returns suspended for suspended trainer (kept even after SHA-5)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'suspended' });
      throw new Error('unexpected table: ' + table);
    });
    expect(await getUserRole('sus@example.com')).toBe('suspended');
  });

  it('returns unauthorized for applied trainer (admin has not approved)', async () => {
    // 'applied' must NOT flip to 'trainer' after SHA-5 — they have not been
    // approved yet, only the admin's Approve click moves them to onboarding.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'applied' });
      throw new Error('unexpected table: ' + table);
    });
    expect(await getUserRole('applicant@example.com')).toBe('unauthorized');
  });

  it('returns unauthorized when the email is in neither table', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow(null);
      throw new Error('unexpected table: ' + table);
    });
    expect(await getUserRole('nobody@example.com')).toBe('unauthorized');
  });

  it('normalizes the email (trim + lowercase) before the .eq lookup', async () => {
    let observedAdminEmail: unknown;
    let observedTrainerEmail: unknown;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') {
        return {
          select: () => ({
            eq: (_col: string, value: string) => {
              observedAdminEmail = value;
              return {
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              };
            },
          }),
        };
      }
      if (table === 'trainers') {
        return {
          select: () => ({
            eq: (_col: string, value: string) => {
              observedTrainerEmail = value;
              return {
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id: 't1', status: 'active' },
                    error: null,
                  }),
              };
            },
          }),
        };
      }
      throw new Error('unexpected table: ' + table);
    });
    await getUserRole('  Trainer@Example.COM  ');
    expect(observedAdminEmail).toBe('trainer@example.com');
    expect(observedTrainerEmail).toBe('trainer@example.com');
  });

  it('bubbles a trainers lookup error rather than silently denying', async () => {
    // Defence-in-depth: a transient DB error must NOT silently fall through
    // to 'unauthorized'. The callers (auth/callback, sign-in) catch the
    // throw and surface auth_callback_failed / server_error.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers')
        return trainersRow(null, { code: 'PGRST500', message: 'timeout' });
      throw new Error('unexpected table: ' + table);
    });
    await expect(getUserRole('any@example.com')).rejects.toMatchObject({
      message: 'timeout',
    });
  });
});
