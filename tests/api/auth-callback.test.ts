import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Supabase SSR client mock
const mockExchange = vi.fn();
const mockVerifyOtp = vi.fn();
const mockGetUser = vi.fn();
const mockSignOut = vi.fn();
const mockRpc = vi.fn();
const mockTrainerMaybeSingle = vi.fn();
let mockTrainerStatus: string | null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        exchangeCodeForSession: mockExchange,
        verifyOtp: mockVerifyOtp,
        getUser: mockGetUser,
        signOut: mockSignOut,
      },
      from: (table: string) => {
        if (table !== 'trainers') throw new Error('unexpected table: ' + table);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: mockTrainerMaybeSingle,
            }),
          }),
        };
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
  mockTrainerStatus = 'active';
  mockExchange.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ error: null });
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'uid-1', email: 'trainer@example.com' } },
    error: null,
  });
  mockSignOut.mockResolvedValue({ error: null });
  mockTrainerMaybeSingle.mockResolvedValue({ data: { status: 'active' }, error: null });
  mockGetUserRole.mockResolvedValue('trainer');
  mockRpc.mockResolvedValue({ data: true, error: null });
});

describe('GET /auth/callback', () => {
  it('redirects to /login?error=auth_callback_failed when no code or token_hash', async () => {
    const res = await GET(buildRequest({}));
    expect(res.status).toBe(307);
    expect(await getLocation(res)).toBe('http://localhost:3000/login?error=auth_callback_failed');
  });

  it('verifyOtp token_hash path routes trainer to dashboard when hasPwd', async () => {
    const res = await GET(
      buildRequest({ token_hash: 'hash-abc', type: 'magiclink' }),
    );
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash-abc',
      type: 'magiclink',
    });
    expect(mockExchange).not.toHaveBeenCalled();
    expect(await getLocation(res)).toContain('/dashboard');
  });

  it('redirects to login on verifyOtp failure', async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: { message: 'expired' } });
    const res = await GET(
      buildRequest({ token_hash: 'hash-abc', type: 'magiclink' }),
    );
    expect(await getLocation(res)).toContain('/login?error=auth_callback_failed');
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
    const res = await GET(buildRequest({ code: 'x', intent: 'reset' }));
    expect(mockRpc).not.toHaveBeenCalled(); // reset short-circuits the RPC
    const loc = await getLocation(res);
    expect(loc).toContain('/account/set-password');
    expect(loc).toContain('next=%2Fdashboard');
  });

  it('hasPwd === false routes to set-password with admin next', async () => {
    mockGetUserRole.mockResolvedValue('admin');
    mockRpc.mockResolvedValue({ data: false, error: null });
    const res = await GET(buildRequest({ code: 'x' }));
    const loc = await getLocation(res);
    expect(loc).toContain('/account/set-password');
    expect(loc).toContain('next=%2Fadmin');
  });

  it('hasPwd === true routes to dashboard for trainers', async () => {
    const res = await GET(buildRequest({ code: 'x' }));
    expect(await getLocation(res)).toContain('/dashboard');
  });

  it('hasPwd === true routes to /admin for admins', async () => {
    mockGetUserRole.mockResolvedValue('admin');
    const res = await GET(buildRequest({ code: 'x' }));
    expect(await getLocation(res)).toContain('/admin');
  });

  it('rpc error surfaces auth_callback_failed (does not silently force reset)', async () => {
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
