import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Supabase SSR client mock
const mockExchange = vi.fn();
const mockGetUser = vi.fn();
const mockSignOut = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        exchangeCodeForSession: mockExchange,
        getUser: mockGetUser,
        signOut: mockSignOut,
      },
      rpc: mockRpc,
    })
  ),
}));

const mockGetUserRole = vi.fn();
vi.mock('@/lib/auth', () => ({
  getUserRole: (...args: unknown[]) => mockGetUserRole(...args),
}));

import { GET } from '@/app/auth/callback/route';

function buildRequest(query: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/auth/callback');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

async function getLocation(res: Response): Promise<string | null> {
  return res.headers.get('location');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExchange.mockResolvedValue({ error: null });
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'uid-1', email: 'trainer@example.com' } },
    error: null,
  });
  mockSignOut.mockResolvedValue({ error: null });
});

describe('GET /auth/callback', () => {
  it('redirects to /login?error=auth_callback_failed when no code', async () => {
    const res = await GET(buildRequest({}));
    expect(res.status).toBe(307);
    expect(await getLocation(res)).toBe('http://localhost:3000/login?error=auth_callback_failed');
  });

  it('redirects to login on exchange failure', async () => {
    mockExchange.mockResolvedValueOnce({ error: { message: 'bad code' } });
    const res = await GET(buildRequest({ code: 'x' }));
    expect(await getLocation(res)).toContain('/login?error=auth_callback_failed');
  });

  it('suspended role signs out + redirects with suspended error', async () => {
    mockGetUserRole.mockResolvedValueOnce('suspended');
    const res = await GET(buildRequest({ code: 'x' }));
    expect(mockSignOut).toHaveBeenCalled();
    expect(await getLocation(res)).toContain('/login?error=suspended');
  });

  it('unauthorized role signs out + redirects with not_authorized', async () => {
    mockGetUserRole.mockResolvedValueOnce('unauthorized');
    const res = await GET(buildRequest({ code: 'x' }));
    expect(mockSignOut).toHaveBeenCalled();
    expect(await getLocation(res)).toContain('/login?error=not_authorized');
  });

  it('intent=reset always routes to set-password regardless of hasPwd', async () => {
    mockGetUserRole.mockResolvedValueOnce('trainer');
    const res = await GET(buildRequest({ code: 'x', intent: 'reset' }));
    expect(mockRpc).not.toHaveBeenCalled(); // reset short-circuits the RPC
    const loc = await getLocation(res);
    expect(loc).toContain('/account/set-password');
    expect(loc).toContain('next=%2Fdashboard');
  });

  it('hasPwd === false routes to set-password with admin next', async () => {
    mockGetUserRole.mockResolvedValueOnce('admin');
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const res = await GET(buildRequest({ code: 'x' }));
    const loc = await getLocation(res);
    expect(loc).toContain('/account/set-password');
    expect(loc).toContain('next=%2Fadmin');
  });

  it('hasPwd === true routes to dashboard for trainers', async () => {
    mockGetUserRole.mockResolvedValueOnce('trainer');
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const res = await GET(buildRequest({ code: 'x' }));
    expect(await getLocation(res)).toContain('/dashboard');
  });

  it('hasPwd === true routes to /admin for admins', async () => {
    mockGetUserRole.mockResolvedValueOnce('admin');
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const res = await GET(buildRequest({ code: 'x' }));
    expect(await getLocation(res)).toContain('/admin');
  });

  // SHA-6: a freshly-approved trainer (status='onboarding') clicks the
  // magic link from their approval email. Without this branch, the
  // callback signs them out as `not_authorized` and the link silently
  // dead-ends. They MUST be routed to /onboarding so they can finish
  // setup; the set-password gate (hasPwd === false) is the normal first
  // step, otherwise straight to /onboarding.
  it('hasPwd === false routes onboarding role to set-password next=/onboarding', async () => {
    mockGetUserRole.mockResolvedValueOnce('onboarding');
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const res = await GET(buildRequest({ code: 'x' }));
    const loc = await getLocation(res);
    expect(loc).toContain('/account/set-password');
    expect(loc).toContain('next=%2Fonboarding');
  });

  it('hasPwd === true routes onboarding role straight to /onboarding', async () => {
    mockGetUserRole.mockResolvedValueOnce('onboarding');
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const res = await GET(buildRequest({ code: 'x' }));
    const loc = await getLocation(res);
    expect(loc).toContain('/onboarding');
    expect(loc).not.toContain('/dashboard');
    expect(loc).not.toContain('/admin');
  });

  it('rpc error surfaces auth_callback_failed (does not silently force reset)', async () => {
    mockGetUserRole.mockResolvedValueOnce('trainer');
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'permission denied for function user_has_password' },
    });
    const res = await GET(buildRequest({ code: 'x' }));
    const loc = await getLocation(res);
    expect(loc).toContain('/login?error=auth_callback_failed');
    expect(loc).not.toContain('/account/set-password');
  });
});
