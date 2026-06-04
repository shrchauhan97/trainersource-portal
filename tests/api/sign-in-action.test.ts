import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signOut: mockSignOut,
      },
    }),
}));

const mockGetUserRole = vi.fn();
vi.mock('@/lib/auth', () => ({
  getUserRole: (...args: unknown[]) => mockGetUserRole(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: vi.fn(), rpc: vi.fn() }),
}));

// Each test gets a unique source IP so the per-instance rate-limit
// bucket doesn't carry quota between tests. Counter lives in a hoisted
// closure because vi.mock() is itself hoisted above all imports.
const { ipTick } = vi.hoisted(() => ({ ipTick: { n: 0 } }));
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'x-forwarded-for' ? `198.51.100.${++ipTick.n}` : null,
    }),
}));

// redirect() in Server Actions throws a NEXT_REDIRECT sentinel which the
// runtime traps. In tests it bubbles as an exception — we catch + assert.
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

import { signInRedirect, signInWithPasswordAction } from '@/app/login/actions';

function activeSessionPayload(email = 'trainer@example.com') {
  return {
    data: { session: { access_token: 'x' }, user: { id: 'u1', email } },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('signInWithPasswordAction', () => {
  it('rejects empty credentials', async () => {
    const r1 = await signInWithPasswordAction('', 'pw');
    const r2 = await signInWithPasswordAction('a@b.co', '');
    expect(r1).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(r2).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('maps Supabase invalid_credentials code to invalid_credentials reason', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
    });

    const result = await signInWithPasswordAction('trainer@example.com', 'wrong-pw');
    expect(result).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(mockGetUserRole).not.toHaveBeenCalled();
  });

  it('maps HTTP 400 (no explicit code) to invalid_credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { status: 400, message: 'Some Localised Wording' },
    });

    const result = await signInWithPasswordAction('trainer@example.com', 'wrong-pw');
    expect(result).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('non-credential supabase error (5xx) bubbles as server_error', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'server_error', status: 503, message: 'service unavailable' },
    });

    const result = await signInWithPasswordAction('trainer@example.com', 'pw');
    expect(result).toEqual({ ok: false, reason: 'server_error' });
  });

  it('suspended role signs out + returns suspended', async () => {
    mockSignInWithPassword.mockResolvedValue(activeSessionPayload());
    mockGetUserRole.mockResolvedValue('suspended');

    const result = await signInWithPasswordAction('trainer@example.com', 'pw');
    expect(result).toEqual({ ok: false, reason: 'suspended' });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('unauthorized role signs out + returns not_authorized', async () => {
    mockSignInWithPassword.mockResolvedValue(activeSessionPayload());
    mockGetUserRole.mockResolvedValue('unauthorized');

    const result = await signInWithPasswordAction('any@example.com', 'pw');
    expect(result).toEqual({ ok: false, reason: 'not_authorized' });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('getUserRole throw signs out + server_error', async () => {
    mockSignInWithPassword.mockResolvedValue(activeSessionPayload());
    mockGetUserRole.mockRejectedValue(new Error('rls denied'));

    const result = await signInWithPasswordAction('trainer@example.com', 'pw');
    expect(result).toEqual({ ok: false, reason: 'server_error' });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('happy path — trainer routes to /dashboard', async () => {
    mockSignInWithPassword.mockResolvedValue(activeSessionPayload());
    mockGetUserRole.mockResolvedValue('trainer');

    const result = await signInWithPasswordAction('trainer@example.com', 'pw');
    expect(result).toEqual({ ok: true, next: '/dashboard' });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  // SHA-6: approved-but-not-yet-active trainer must be able to sign in and
  // land in /onboarding. Pre-fix, the role was treated as unauthorized.
  it('happy path — onboarding role routes to /onboarding', async () => {
    mockSignInWithPassword.mockResolvedValue(activeSessionPayload('onboarding@example.com'));
    mockGetUserRole.mockResolvedValue('onboarding');

    const result = await signInWithPasswordAction('onboarding@example.com', 'pw');
    expect(result).toEqual({ ok: true, next: '/onboarding' });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('happy path — admin routes to /admin', async () => {
    mockSignInWithPassword.mockResolvedValue(activeSessionPayload('admin@example.com'));
    mockGetUserRole.mockResolvedValue('admin');

    const result = await signInWithPasswordAction('admin@example.com', 'pw');
    expect(result).toEqual({ ok: true, next: '/admin' });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('normalises email (trim + lowercase) before sign-in', async () => {
    mockSignInWithPassword.mockResolvedValue(activeSessionPayload('trainer@example.com'));
    mockGetUserRole.mockResolvedValue('trainer');

    await signInWithPasswordAction('  Trainer@Example.COM  ', 'pw');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'trainer@example.com',
      password: 'pw',
    });
  });
});

describe('signInRedirect (form-action wrapper)', () => {
  it('throws NEXT_REDIRECT to /admin on admin happy path', async () => {
    mockSignInWithPassword.mockResolvedValue(activeSessionPayload('admin@example.com'));
    mockGetUserRole.mockResolvedValue('admin');

    const form = new FormData();
    form.set('email', 'admin@example.com');
    form.set('password', 'pw');

    await expect(signInRedirect(form)).rejects.toMatchObject({
      to: '/admin',
    });
  });

  it('returns curated copy on invalid_credentials (no throw)', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
    });

    const form = new FormData();
    form.set('email', 'trainer@example.com');
    form.set('password', 'wrong');
    const result = await signInRedirect(form);
    expect(result).toEqual({ error: 'Incorrect email or password.' });
  });

  it('returns suspended copy when role is suspended', async () => {
    mockSignInWithPassword.mockResolvedValue(activeSessionPayload());
    mockGetUserRole.mockResolvedValue('suspended');

    const form = new FormData();
    form.set('email', 'trainer@example.com');
    form.set('password', 'pw');
    const result = await signInRedirect(form);
    expect(result?.error).toMatch(/suspended/i);
    expect(mockSignOut).toHaveBeenCalled();
  });
});
