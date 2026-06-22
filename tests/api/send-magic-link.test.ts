import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockCreateUser = vi.fn();
const mockGenerateLink = vi.fn();
const mockCaptureMessage = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  captureException: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      admin: {
        createUser: mockCreateUser,
        generateLink: mockGenerateLink,
      },
    },
  }),
}));

const mockEnsureAuthUserForEmail = vi.fn();
vi.mock('@/lib/auth-users', () => ({
  ensureAuthUserForEmail: (...args: unknown[]) => mockEnsureAuthUserForEmail(...args),
}));

const mockSendEmail = vi.fn();
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  };
});

const { ipTick } = vi.hoisted(() => ({ ipTick: { n: 0 } }));
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'x-forwarded-for' ? `198.51.100.${++ipTick.n}` : null,
    }),
}));

import { sendMagicLinkAction } from '@/app/login/actions';

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
  trainer: { status: 'active' | 'onboarding' } | null,
) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: trainer ? { id: 't1', status: trainer.status } : null, error: null }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsureAuthUserForEmail.mockResolvedValue({ ok: true });
  mockCreateUser.mockResolvedValue({ error: null });
  mockGenerateLink.mockResolvedValue({
    data: { properties: { hashed_token: 'tok-hash-123' } },
    error: null,
  });
  mockSendEmail.mockResolvedValue({ ok: true, id: 'email-1' });
  mockRpc.mockResolvedValue({ data: false, error: null });
});

describe('sendMagicLinkAction', () => {
  it('rejects not_authorized emails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow(null);
      throw new Error('unexpected table: ' + table);
    });

    const result = await sendMagicLinkAction('nobody@example.com');
    expect(result).toEqual({ ok: false, reason: 'not_authorized' });
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('sends magic link for onboarding trainer', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'onboarding' });
      throw new Error('unexpected table: ' + table);
    });

    const result = await sendMagicLinkAction('onboarding-trainer@example.com');
    expect(result).toEqual({ ok: true });
    expect(mockEnsureAuthUserForEmail).toHaveBeenCalledBefore(mockGenerateLink);
    expect(mockEnsureAuthUserForEmail).toHaveBeenCalledWith(
      expect.anything(),
      'onboarding-trainer@example.com',
    );
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'onboarding-trainer@example.com',
      options: { redirectTo: 'http://localhost:3000/auth/callback' },
    });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'onboarding-trainer@example.com',
        subject: 'Sign in to TrainerSource',
      }),
    );
    const html = mockSendEmail.mock.calls[0][0].html as string;
    expect(html).toContain(
      'http://localhost:3000/auth/confirm?token_hash=tok-hash-123&amp;type=magiclink',
    );
  });

  it('normalizes mixed-case email before ensure, generateLink, and send', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'onboarding' });
      throw new Error('unexpected table: ' + table);
    });

    const result = await sendMagicLinkAction('  Trainer-B@Example.COM  ');
    expect(result).toEqual({ ok: true });
    expect(mockEnsureAuthUserForEmail).toHaveBeenCalledWith(
      expect.anything(),
      'trainer-b@example.com',
    );
    expect(mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'trainer-b@example.com' }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'trainer-b@example.com' }),
    );
  });

  it('returns server_error when ensureAuthUserForEmail fails without minting a link', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'onboarding' });
      throw new Error('unexpected table: ' + table);
    });
    mockEnsureAuthUserForEmail.mockResolvedValueOnce({
      ok: false,
      message: 'database down',
    });

    const result = await sendMagicLinkAction('ensure-fail-trainer@example.com');
    expect(result).toEqual({ ok: false, reason: 'server_error' });
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('includes intent=reset in confirm URL when requested', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'active' });
      throw new Error('unexpected table: ' + table);
    });

    const result = await sendMagicLinkAction('reset-trainer@example.com', 'reset');
    expect(result).toEqual({ ok: true });
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'reset-trainer@example.com',
      options: { redirectTo: 'http://localhost:3000/auth/callback?intent=reset' },
    });
    const html = mockSendEmail.mock.calls[0][0].html as string;
    expect(html).toContain('token_hash=tok-hash-123');
    expect(html).toContain('intent=reset');
  });

  it('returns send_failed when email delivery fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow('admin');
      throw new Error('unexpected table: ' + table);
    });
    mockSendEmail.mockResolvedValueOnce({ ok: false, error: 'no_api_key' });

    const result = await sendMagicLinkAction('admin@example.com');
    expect(result).toEqual({ ok: false, reason: 'send_failed' });
  });
});

function trainerAllowedFrom() {
  return (table: string) => {
    if (table === 'admins') return adminsRow(null);
    if (table === 'trainers') return trainersRow({ status: 'onboarding' });
    throw new Error('unexpected table: ' + table);
  };
}

// Isolated module load so the in-memory BUCKET starts empty.
describe('sendMagicLinkAction — per-email rate limit', () => {
  it('rejects with rate_limited once same email exceeds per-email LIMIT', async () => {
    vi.resetModules();
    const freshFrom = vi.fn(trainerAllowedFrom());
    const freshGenerateLink = vi.fn().mockResolvedValue({
      data: { properties: { hashed_token: 'tok-hash-123' } },
      error: null,
    });
    const freshSendEmail = vi.fn().mockResolvedValue({ ok: true, id: 'email-1' });
    const freshEnsure = vi.fn().mockResolvedValue({ ok: true });

    vi.doMock('@sentry/nextjs', () => ({
      captureMessage: vi.fn(),
      captureException: vi.fn(),
    }));
    vi.doMock('@/lib/auth-users', () => ({
      ensureAuthUserForEmail: (...args: unknown[]) => freshEnsure(...args),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      createServiceClient: () => ({
        from: freshFrom,
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
        auth: {
          admin: {
            createUser: vi.fn().mockResolvedValue({ error: null }),
            generateLink: freshGenerateLink,
          },
        },
      }),
    }));
    vi.doMock('@/lib/email', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/email')>();
      return { ...actual, sendEmail: (...args: unknown[]) => freshSendEmail(...args) };
    });
    vi.doMock('next/headers', () => ({
      headers: () =>
        Promise.resolve({
          get: (name: string) => (name === 'x-forwarded-for' ? '198.51.100.99' : null),
        }),
    }));

    const { sendMagicLinkAction: fresh } = await import('@/app/login/actions');
    const target = 'throttle-target@example.com';

    const results = [];
    for (let i = 0; i < 7; i++) {
      results.push(await fresh(target));
    }

    expect(results.filter((r) => r.ok)).toHaveLength(6);
    expect(results.filter((r) => !r.ok && r.reason === 'rate_limited')).toHaveLength(1);
    expect(freshGenerateLink).toHaveBeenCalledTimes(6);
    expect(freshSendEmail).toHaveBeenCalledTimes(6);
  });

  it('does not block different enrolled emails via the per-email bucket', async () => {
    vi.resetModules();
    const freshFrom = vi.fn(trainerAllowedFrom());
    const freshGenerateLink = vi.fn().mockResolvedValue({
      data: { properties: { hashed_token: 'tok-hash-123' } },
      error: null,
    });
    const freshSendEmail = vi.fn().mockResolvedValue({ ok: true, id: 'email-1' });

    vi.doMock('@sentry/nextjs', () => ({
      captureMessage: vi.fn(),
      captureException: vi.fn(),
    }));
    vi.doMock('@/lib/auth-users', () => ({
      ensureAuthUserForEmail: vi.fn().mockResolvedValue({ ok: true }),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      createServiceClient: () => ({
        from: freshFrom,
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
        auth: {
          admin: {
            createUser: vi.fn().mockResolvedValue({ error: null }),
            generateLink: freshGenerateLink,
          },
        },
      }),
    }));
    vi.doMock('@/lib/email', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/email')>();
      return { ...actual, sendEmail: (...args: unknown[]) => freshSendEmail(...args) };
    });
    vi.doMock('next/headers', () => ({
      headers: () =>
        Promise.resolve({
          get: (name: string) => (name === 'x-forwarded-for' ? '198.51.100.99' : null),
        }),
    }));

    const { sendMagicLinkAction: fresh } = await import('@/app/login/actions');

    for (let i = 0; i < 3; i++) {
      const result = await fresh(`distinct-trainer-${i}@example.com`);
      expect(result).toEqual({ ok: true });
    }
    expect(freshGenerateLink).toHaveBeenCalledTimes(3);
  });

  it('shares per-email bucket across mixed-case variants', async () => {
    vi.resetModules();
    const freshFrom = vi.fn(trainerAllowedFrom());
    const freshGenerateLink = vi.fn().mockResolvedValue({
      data: { properties: { hashed_token: 'tok-hash-123' } },
      error: null,
    });
    const freshSendEmail = vi.fn().mockResolvedValue({ ok: true, id: 'email-1' });

    vi.doMock('@sentry/nextjs', () => ({
      captureMessage: vi.fn(),
      captureException: vi.fn(),
    }));
    vi.doMock('@/lib/auth-users', () => ({
      ensureAuthUserForEmail: vi.fn().mockResolvedValue({ ok: true }),
    }));
    vi.doMock('@/lib/supabase/service', () => ({
      createServiceClient: () => ({
        from: freshFrom,
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
        auth: {
          admin: {
            createUser: vi.fn().mockResolvedValue({ error: null }),
            generateLink: freshGenerateLink,
          },
        },
      }),
    }));
    vi.doMock('@/lib/email', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/email')>();
      return { ...actual, sendEmail: (...args: unknown[]) => freshSendEmail(...args) };
    });
    vi.doMock('next/headers', () => ({
      headers: () =>
        Promise.resolve({
          get: (name: string) => (name === 'x-forwarded-for' ? '198.51.100.99' : null),
        }),
    }));

    const { sendMagicLinkAction: fresh } = await import('@/app/login/actions');

    for (let i = 0; i < 6; i++) {
      expect(await fresh('Case-Mix@Example.COM')).toEqual({ ok: true });
    }
    expect(await fresh('case-mix@example.com')).toEqual({ ok: false, reason: 'rate_limited' });
    expect(freshGenerateLink).toHaveBeenCalledTimes(6);
  });
});
