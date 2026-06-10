import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockCreateUser = vi.fn();
const mockGenerateLink = vi.fn();

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

vi.mock('@/lib/auth-users', () => ({
  ensureAuthUserForEmail: vi.fn(async () => ({ ok: true as const })),
}));

const mockSendEmail = vi.fn();
vi.mock('@/lib/email', () => ({
  getSiteUrl: () => 'http://localhost:3000',
  magicLinkLoginEmail: () => ({
    subject: 'Sign in',
    html: '<p>link</p>',
  }),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

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
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'trainer@example.com',
      options: { redirectTo: 'http://localhost:3000/auth/callback' },
    });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'trainer@example.com', subject: 'Sign in' }),
    );
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
