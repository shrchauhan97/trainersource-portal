import { beforeEach, describe, expect, it, vi } from 'vitest';

// SECURITY REGRESSION SUITE — SHA-195
// Locks in the secure "set a password" architecture: the action is only
// invokable by an already-authenticated user (proved via supabase.auth.getUser()
// which reads the session cookie). It MUST NOT accept an email + password and
// reach into auth.admin.updateUserById on behalf of an unverified caller —
// that was the account-takeover shape reviewed out of Saad's PR #43.

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
        updateUser: mockUpdateUser,
        signOut: mockSignOut,
      },
    }),
}));

const mockStampUpdate = vi.fn();
const mockStampEq = vi.fn(() => mockStampUpdate());
const mockServiceFrom = vi.fn(() => ({
  update: vi.fn(() => ({ eq: mockStampEq })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mockServiceFrom }),
}));

const mockGetUserRole = vi.fn();
vi.mock('@/lib/auth', () => ({
  getUserRole: (...args: unknown[]) => mockGetUserRole(...args),
}));

class RedirectError extends Error {
  constructor(public to: string) {
    super(`NEXT_REDIRECT: ${to}`);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

import { setPassword } from '@/app/account/set-password/actions';

const STRONG_PW = 'Trainer-Source-2026';
const STRONGER_PW = 'Trainer-Source-2027';

function formOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function authedUser(email = 'trainer@example.com') {
  return {
    data: { user: { id: 'u1', email } },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSignOut.mockResolvedValue({ error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
  mockStampUpdate.mockResolvedValue({ error: null });
});

describe('setPassword — security boundary (SHA-195)', () => {
  it('redirects to /login when there is no authenticated session', async () => {
    // SECURITY: anonymous callers must NOT reach updateUser. If they could,
    // anyone could POST this server action with a known email and clobber
    // the password on someone else's account.
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW }))).rejects.toMatchObject({
      to: '/login?error=auth_callback_failed',
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockServiceFrom).not.toHaveBeenCalled();
  });

  it('redirects to /login when getUser surfaces an error (treats as unauthenticated)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt expired' } });

    await expect(setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW }))).rejects.toMatchObject({
      to: '/login?error=auth_callback_failed',
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('redirects to /login when authenticated user has no email', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: null } }, error: null });

    await expect(setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW }))).rejects.toMatchObject({
      to: '/login?error=auth_callback_failed',
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('signs out and refuses for suspended trainer (auth session alone is not enough)', async () => {
    mockGetUser.mockResolvedValue(authedUser('suspended@example.com'));
    mockGetUserRole.mockResolvedValue('suspended');

    await expect(setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW }))).rejects.toMatchObject({
      to: '/login?error=suspended',
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('signs out and refuses for unauthorized role (auth user not in admins/trainers)', async () => {
    // A Supabase auth row could exist for any email if someone else triggered
    // OTP — the role check binds the auth session to our app's allowlist.
    mockGetUser.mockResolvedValue(authedUser('rando@example.com'));
    mockGetUserRole.mockResolvedValue('unauthorized');

    await expect(setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW }))).rejects.toMatchObject({
      to: '/login?error=not_authorized',
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('returns auth_callback_failed when getUserRole throws (does not silently allow)', async () => {
    mockGetUser.mockResolvedValue(authedUser());
    mockGetUserRole.mockRejectedValue(new Error('rls denied'));

    await expect(setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW }))).rejects.toMatchObject({
      to: '/login?error=auth_callback_failed',
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe('setPassword — input validation', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue(authedUser());
    mockGetUserRole.mockResolvedValue('trainer');
  });

  it('rejects passwords that fail the policy (too short, no upper, etc.)', async () => {
    const weak = ['short', 'alllowercase123', 'NOLOWERCASE123', 'NoDigitsHereXXX', 'short1A'];
    for (const pw of weak) {
      const result = await setPassword(formOf({ password: pw, confirm: pw }));
      expect(result?.error).toMatch(/12 characters/i);
    }
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('rejects when password and confirm differ', async () => {
    const result = await setPassword(formOf({ password: STRONG_PW, confirm: STRONGER_PW }));
    expect(result).toEqual({ error: 'Passwords do not match.' });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe('setPassword — happy paths', () => {
  it('trainer: updates password, stamps trainers.password_set_at, redirects to next', async () => {
    mockGetUser.mockResolvedValue(authedUser('trainer@example.com'));
    mockGetUserRole.mockResolvedValue('trainer');

    await expect(
      setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW, next: '/dashboard/codes' }))
    ).rejects.toMatchObject({ to: '/dashboard/codes' });

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: STRONG_PW });
    expect(mockServiceFrom).toHaveBeenCalledWith('trainers');
    expect(mockStampUpdate).toHaveBeenCalledTimes(1);
  });

  it('admin: stamps admins.password_set_at and falls back to /dashboard when no next provided', async () => {
    mockGetUser.mockResolvedValue(authedUser('admin@example.com'));
    mockGetUserRole.mockResolvedValue('admin');

    await expect(setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW }))).rejects.toMatchObject({
      to: '/dashboard',
    });

    expect(mockServiceFrom).toHaveBeenCalledWith('admins');
  });

  it('rejects an open-redirect next and falls back to /dashboard', async () => {
    mockGetUser.mockResolvedValue(authedUser());
    mockGetUserRole.mockResolvedValue('trainer');

    await expect(
      setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW, next: '//evil.com/steal' }))
    ).rejects.toMatchObject({ to: '/dashboard' });
  });

  it('returns curated error (no redirect) when updateUser fails — caller can retry', async () => {
    mockGetUser.mockResolvedValue(authedUser());
    mockGetUserRole.mockResolvedValue('trainer');
    mockUpdateUser.mockResolvedValueOnce({ error: { message: 'pwned password rejected' } });

    const result = await setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW }));
    expect(result?.error).toMatch(/couldn.?t save that password/i);
    // Did NOT stamp our table when the auth update failed.
    expect(mockServiceFrom).not.toHaveBeenCalled();
  });

  it('stamp failure is non-fatal — auth update already succeeded so we still redirect', async () => {
    mockGetUser.mockResolvedValue(authedUser());
    mockGetUserRole.mockResolvedValue('trainer');
    mockStampUpdate.mockResolvedValueOnce({ error: { message: 'rls denied' } });

    await expect(
      setPassword(formOf({ password: STRONG_PW, confirm: STRONG_PW, next: '/dashboard' }))
    ).rejects.toMatchObject({ to: '/dashboard' });
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  });
});
