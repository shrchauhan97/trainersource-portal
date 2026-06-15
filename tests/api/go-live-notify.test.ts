import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockFrom = vi.fn();
const mockDownload = vi.fn();
const mockSendEmail = vi.fn();
const mockCaptureMessage = vi.fn();
const mockCaptureException = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock('@/app/onboarding/_lib/storage', () => ({
  downloadOnboardingFileWithService: (...args: unknown[]) => mockDownload(...args),
}));

vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  };
});

import { notifyAdminsOfOnboardingCompletion } from '@/app/onboarding/go-live/notify-admins';

const payload = {
  trainerId: 'trainer-uuid-1',
  trainerName: 'Alice Trainer',
  trainerEmail: 'alice@example.com',
  city: 'Austin',
  signedAgreementPath: 'trainer-uuid-1/signed-agreement-1.pdf',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({
    select: () =>
      Promise.resolve({
        data: [{ email: 'admin@example.com' }],
        error: null,
      }),
  });
  mockSendEmail.mockResolvedValue({ ok: true, id: 'email-1' });
});

describe('notifyAdminsOfOnboardingCompletion', () => {
  it('sends email with attachment when download succeeds', async () => {
    const pdf = Buffer.from('pdf-bytes');
    mockDownload.mockResolvedValueOnce(pdf);

    await notifyAdminsOfOnboardingCompletion(payload);

    expect(mockDownload).toHaveBeenCalledWith(payload.signedAgreementPath);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        attachments: [{ filename: 'signed-agreement.pdf', content: pdf }],
      }),
    );
    const html = mockSendEmail.mock.calls[0][0].html as string;
    expect(html).toContain('signed agreement is attached');
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(
      'go-live: signed agreement download failed',
      expect.anything(),
    );
  });

  it('sends honest copy without attachment when download fails', async () => {
    mockDownload.mockResolvedValueOnce(null);

    await notifyAdminsOfOnboardingCompletion(payload);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        attachments: undefined,
      }),
    );
    const html = mockSendEmail.mock.calls[0][0].html as string;
    expect(html).toContain('attach the signed agreement automatically');
    expect(html).toContain(payload.signedAgreementPath);
    expect(html).not.toContain('is attached to this email');
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'go-live: signed agreement download failed',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          trainerId: payload.trainerId,
          path: payload.signedAgreementPath,
        }),
      }),
    );
  });

  it('skips download when signed agreement path is empty', async () => {
    await notifyAdminsOfOnboardingCompletion({ ...payload, signedAgreementPath: '' });

    expect(mockDownload).not.toHaveBeenCalled();
    const html = mockSendEmail.mock.calls[0][0].html as string;
    expect(html).toContain('No signed agreement path was recorded');
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: undefined }),
    );
  });
});
