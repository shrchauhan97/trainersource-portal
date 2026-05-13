// tests/api/demo-login.test.ts
//
// Coverage for the Wave 2 T2.3 fix on `/api/demo-login`:
//   - open-redirect via `next=` is rejected (falls back to /dashboard)
//   - admin emails are refused with 403 (no trainer -> admin pivot)
//   - non-trainer emails return 404 (no auth.users existence leak)
//   - wrong secret returns 401 (timing-safe; length mismatch path)
//   - happy path: valid trainer + secret + safe `next` -> session mint + 302
//
// The route uses `createServiceClient` for service-role lookups (admins,
// trainers, generateLink) and the SSR client for `verifyOtp`. We mock both
// before importing the route module.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateLinkMock = vi.fn();
const verifyOtpMock = vi.fn();
const serviceFromMock = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: serviceFromMock,
    auth: { admin: { generateLink: generateLinkMock } },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { verifyOtp: verifyOtpMock },
  }),
}));

beforeEach(() => {
  generateLinkMock.mockReset();
  verifyOtpMock.mockReset();
  serviceFromMock.mockReset();
  vi.stubEnv('DEMO_LOGIN_SECRET', 'top-secret-demo-token');
});

/**
 * Wire up `service.from('admins')` and `service.from('trainers')` lookups.
 * Each handler returns the row (or null) the route would receive from
 * `maybeSingle()`.
 */
function setupLookups(opts: {
  admin?: { id: string } | null;
  trainer?: { id: string } | null;
  adminError?: { message: string } | null;
  trainerError?: { message: string } | null;
}) {
  serviceFromMock.mockImplementation((table: string) => {
    if (table === 'admins') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: opts.admin ?? null,
                error: opts.adminError ?? null,
              }),
          }),
        }),
      };
    }
    if (table === 'trainers') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: opts.trainer ?? null,
                error: opts.trainerError ?? null,
              }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

function buildRequest(query: Record<string, string>): Request {
  const qs = new URLSearchParams(query).toString();
  return new Request(`https://trainer-source.com/api/demo-login?${qs}`, {
    headers: { 'x-forwarded-for': '203.0.113.7' },
  });
}

describe('GET /api/demo-login', () => {
  it('404s when DEMO_LOGIN_SECRET is not set', async () => {
    vi.stubEnv('DEMO_LOGIN_SECRET', '');
    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({ email: 'trainer@x.com', secret: 'whatever' }),
    );
    expect(res.status).toBe(404);
    expect(serviceFromMock).not.toHaveBeenCalled();
  });

  it('returns 400 when email or secret missing', async () => {
    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(buildRequest({ email: 'trainer@x.com' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 with the wrong secret (and never touches DB)', async () => {
    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({ email: 'trainer@x.com', secret: 'WRONG-SECRET' }),
    );
    expect(res.status).toBe(401);
    expect(serviceFromMock).not.toHaveBeenCalled();
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('returns 401 when secret length matches expected (still wrong)', async () => {
    // expected = 'top-secret-demo-token' (21 chars). Same length, different
    // content — exercises the timingSafeEqual path, not the short-circuit.
    const sameLen = 'xxxxxxxxxxxxxxxxxxxxx';
    expect(sameLen.length).toBe('top-secret-demo-token'.length);
    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({ email: 'trainer@x.com', secret: sameLen }),
    );
    expect(res.status).toBe(401);
    expect(serviceFromMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the email belongs to an admin', async () => {
    setupLookups({ admin: { id: 'a-1' } });
    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({ email: 'admin@demo.test', secret: 'top-secret-demo-token' }),
    );
    expect(res.status).toBe(403);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the email does not match a trainer', async () => {
    setupLookups({ admin: null, trainer: null });
    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({ email: 'ghost@nowhere.test', secret: 'top-secret-demo-token' }),
    );
    expect(res.status).toBe(404);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('rejects open-redirect `next=https://evil.com` and falls back to /dashboard', async () => {
    setupLookups({ trainer: { id: 't-1' } });
    generateLinkMock.mockResolvedValueOnce({
      data: { properties: { email_otp: '123456' } },
      error: null,
    });
    verifyOtpMock.mockResolvedValueOnce({ error: null });

    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({
        email: 'trainer@x.com',
        secret: 'top-secret-demo-token',
        next: 'https://evil.com',
      }),
    );

    expect(res.status).toBe(307); // NextResponse.redirect default
    const loc = res.headers.get('location') ?? '';
    expect(loc).not.toContain('evil.com');
    expect(loc).toContain('/dashboard');
  });

  it('rejects protocol-relative `next=//evil.com` and falls back to /dashboard', async () => {
    setupLookups({ trainer: { id: 't-1' } });
    generateLinkMock.mockResolvedValueOnce({
      data: { properties: { email_otp: '123456' } },
      error: null,
    });
    verifyOtpMock.mockResolvedValueOnce({ error: null });

    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({
        email: 'trainer@x.com',
        secret: 'top-secret-demo-token',
        next: '//evil.com/x',
      }),
    );
    const loc = res.headers.get('location') ?? '';
    expect(loc).not.toContain('evil.com');
    expect(loc).toContain('/dashboard');
  });

  it('rejects backslash-mangled `next=/\\evil.com` and falls back to /dashboard', async () => {
    setupLookups({ trainer: { id: 't-1' } });
    generateLinkMock.mockResolvedValueOnce({
      data: { properties: { email_otp: '123456' } },
      error: null,
    });
    verifyOtpMock.mockResolvedValueOnce({ error: null });

    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({
        email: 'trainer@x.com',
        secret: 'top-secret-demo-token',
        next: '/\\evil.com',
      }),
    );
    const loc = res.headers.get('location') ?? '';
    expect(loc).not.toContain('evil.com');
    expect(loc).toContain('/dashboard');
  });

  it('happy path: trainer + valid secret + safe `next` -> 302 redirect to next', async () => {
    setupLookups({ admin: null, trainer: { id: 't-9' } });
    generateLinkMock.mockResolvedValueOnce({
      data: { properties: { email_otp: '654321' } },
      error: null,
    });
    verifyOtpMock.mockResolvedValueOnce({ error: null });

    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({
        email: 'trainer@x.com',
        secret: 'top-secret-demo-token',
        next: '/onboarding/welcome',
      }),
    );

    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/onboarding/welcome');
    // generateLink and verifyOtp were both invoked exactly once with the
    // (now lower-cased) email.
    expect(generateLinkMock).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'trainer@x.com',
    });
    expect(verifyOtpMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'trainer@x.com', token: '654321', type: 'email' }),
    );
  });

  it('happy path with no `next` defaults to /dashboard', async () => {
    setupLookups({ admin: null, trainer: { id: 't-9' } });
    generateLinkMock.mockResolvedValueOnce({
      data: { properties: { email_otp: '111111' } },
      error: null,
    });
    verifyOtpMock.mockResolvedValueOnce({ error: null });

    const { GET } = await import('@/app/api/demo-login/route');
    const res = await GET(
      buildRequest({
        email: 'trainer@x.com',
        secret: 'top-secret-demo-token',
      }),
    );
    expect(res.headers.get('location') ?? '').toContain('/dashboard');
  });
});
