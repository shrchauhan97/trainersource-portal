// tests/api/dev-login.test.ts
//
// Covers the post-T2.4 hardening of /api/dev/login:
//   - env-gate triple-guard returns 404 (not 403) when misconfigured
//   - timing-safe secret comparison (wrong secret = 401)
//   - allowlist gate (non-dev email = 401 even with valid secret)
//   - open-redirect blocked (absolute URLs / protocol-relative / unsafe chars
//     fall back to /dashboard)
//   - happy path: 302 with safe relative redirect

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSignIn = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signInWithPassword: mockSignIn },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  mockSignIn.mockClear();
  mockSignIn.mockResolvedValue({ error: null });
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('ENABLE_DEV_LOGIN', '1');
  vi.stubEnv('DEV_LOGIN_SECRET', 'super-secret-dev-token');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function callRoute(url: string) {
  const { GET } = await import('@/app/api/dev/login/route');
  return GET(new Request(url));
}

describe('GET /api/dev/login', () => {
  it('404s in production (treat as not-found)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const url =
      'https://x/api/dev/login?email=demo@trainer-source.com&password=p&secret=super-secret-dev-token';
    const res = await callRoute(url);
    expect(res.status).toBe(404);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('404s when ENABLE_DEV_LOGIN is not 1', async () => {
    vi.stubEnv('ENABLE_DEV_LOGIN', '');
    const url =
      'https://x/api/dev/login?email=demo@trainer-source.com&password=p&secret=super-secret-dev-token';
    const res = await callRoute(url);
    expect(res.status).toBe(404);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('404s when DEV_LOGIN_SECRET env var is not set', async () => {
    vi.stubEnv('DEV_LOGIN_SECRET', '');
    const url =
      'https://x/api/dev/login?email=demo@trainer-source.com&password=p&secret=any';
    const res = await callRoute(url);
    expect(res.status).toBe(404);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('400s when params are missing', async () => {
    const res = await callRoute('https://x/api/dev/login?email=demo@trainer-source.com');
    expect(res.status).toBe(400);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('401s when secret is wrong (timing-safe compare)', async () => {
    const url =
      'https://x/api/dev/login?email=demo@trainer-source.com&password=p&secret=WRONG';
    const res = await callRoute(url);
    expect(res.status).toBe(401);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('401s when secret is correct but email is not on allowlist', async () => {
    const url =
      'https://x/api/dev/login?email=attacker@gmail.com&password=p&secret=super-secret-dev-token';
    const res = await callRoute(url);
    expect(res.status).toBe(401);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('allowlists @evaa.com domain emails', async () => {
    const url =
      'https://x/api/dev/login?email=shaurya@evaa.com&password=p&secret=super-secret-dev-token';
    const res = await callRoute(url);
    expect(res.status).toBe(307);
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'shaurya@evaa.com',
      password: 'p',
    });
  });

  describe('open-redirect protection', () => {
    const cases: Array<[string, string]> = [
      // [redirect param, expected resolved path+search after sanitize]
      ['https://evil.example/phish', '/dashboard'],
      ['//evil.example/phish', '/dashboard'],
      ['/\\evil.example', '/dashboard'],
      ['javascript:alert(1)', '/dashboard'],
      // `:` is not in the safe-char regex, so this falls back even though %0d/%0a
      // would be percent-encoded once on the wire.
      ['/dashboard%0d%0aSet-Cookie:x', '/dashboard'],
      ['/safe/path', '/safe/path'],
      ['/dashboard?tab=codes', '/dashboard?tab=codes'],
    ];

    for (const [rawRedirect, expectedPath] of cases) {
      it(`redirect=${JSON.stringify(rawRedirect)} -> ${expectedPath}`, async () => {
        const url = new URL('https://x/api/dev/login');
        url.searchParams.set('email', 'demo@trainer-source.com');
        url.searchParams.set('password', 'p');
        url.searchParams.set('secret', 'super-secret-dev-token');
        url.searchParams.set('redirect', rawRedirect);
        const res = await callRoute(url.toString());
        expect(res.status).toBe(307);
        const loc = res.headers.get('location') ?? '';
        // Location must be same-origin (x) and resolve to expected path.
        const locUrl = new URL(loc, 'https://x');
        expect(locUrl.origin).toBe('https://x');
        expect(locUrl.pathname + locUrl.search).toBe(expectedPath);
      });
    }

    it('rejects CR/LF embedded in redirect (header-injection guard)', async () => {
      const url = new URL('https://x/api/dev/login');
      url.searchParams.set('email', 'demo@trainer-source.com');
      url.searchParams.set('password', 'p');
      url.searchParams.set('secret', 'super-secret-dev-token');
      url.searchParams.set('redirect', '/dash\nboard');
      const res = await callRoute(url.toString());
      expect(res.status).toBe(307);
      const locUrl = new URL(res.headers.get('location') ?? '', 'https://x');
      expect(locUrl.pathname).toBe('/dashboard');
    });
  });

  it('happy path: 302 to /dashboard with no redirect param', async () => {
    const url =
      'https://x/api/dev/login?email=demo@trainer-source.com&password=p&secret=super-secret-dev-token';
    const res = await callRoute(url);
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(new URL(loc, 'https://x').pathname).toBe('/dashboard');
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'demo@trainer-source.com',
      password: 'p',
    });
  });

  it('passes through supabase auth failure as 401', async () => {
    mockSignIn.mockResolvedValueOnce({ error: { message: 'invalid creds' } });
    const url =
      'https://x/api/dev/login?email=demo@trainer-source.com&password=wrong&secret=super-secret-dev-token';
    const res = await callRoute(url);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid creds');
  });
});
