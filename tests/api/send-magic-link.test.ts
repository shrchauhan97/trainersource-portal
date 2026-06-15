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

    const result = await sendMagicLinkAction('trainer@example.com');
    expect(result).toEqual({ ok: true });
    expect(mockEnsureAuthUserForEmail).toHaveBeenCalledBefore(mockGenerateLink);
    expect(mockEnsureAuthUserForEmail).toHaveBeenCalledWith(
      expect.anything(),
      'trainer@example.com',
    );
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'trainer@example.com',
      options: { redirectTo: 'http://localhost:3000/auth/callback' },
    });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'trainer@example.com',
        subject: 'Sign in to TrainerSource',
      }),
    );
    const html = mockSendEmail.mock.calls[0][0].html as string;
    expect(html).toContain(
      'http://localhost:3000/auth/callback?token_hash=tok-hash-123&amp;type=magiclink',
    );
  });

  it('normalizes mixed-case email before ensure, generateLink, and send', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'onboarding' });
      throw new Error('unexpected table: ' + table);
    });

    const result = await sendMagicLinkAction('  Trainer@Example.COM  ');
    expect(result).toEqual({ ok: true });
    expect(mockEnsureAuthUserForEmail).toHaveBeenCalledWith(
      expect.anything(),
      'trainer@example.com',
    );
    expect(mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'trainer@example.com' }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'trainer@example.com' }),
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

    const result = await sendMagicLinkAction('trainer@example.com');
    expect(result).toEqual({ ok: false, reason: 'server_error' });
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('includes intent=reset in callback URL when requested', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'admins') return adminsRow(null);
      if (table === 'trainers') return trainersRow({ status: 'active' });
      throw new Error('unexpected table: ' + table);
    });

    const result = await sendMagicLinkAction('trainer@example.com', 'reset');
    expect(result).toEqual({ ok: true });
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'trainer@example.com',
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
