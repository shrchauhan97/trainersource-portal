import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateUser = vi.fn();

import { ensureAuthUserForEmail } from '@/lib/auth-users';

const service = {
  auth: {
    admin: {
      createUser: mockCreateUser,
    },
  },
} as Parameters<typeof ensureAuthUserForEmail>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ensureAuthUserForEmail', () => {
  it('returns ok when createUser succeeds', async () => {
    mockCreateUser.mockResolvedValueOnce({ error: null });
    const result = await ensureAuthUserForEmail(service, 'Trainer@Example.com');
    expect(result).toEqual({ ok: true });
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'trainer@example.com',
      email_confirm: true,
    });
  });

  it('treats already-registered as ok', async () => {
    mockCreateUser.mockResolvedValueOnce({
      error: { message: 'User already been registered', status: 422, code: 'email_exists' },
    });
    const result = await ensureAuthUserForEmail(service, 'trainer@example.com');
    expect(result).toEqual({ ok: true });
  });

  it('surfaces unexpected createUser errors', async () => {
    mockCreateUser.mockResolvedValueOnce({
      error: { message: 'database down', status: 500 },
    });
    const result = await ensureAuthUserForEmail(service, 'trainer@example.com');
    expect(result).toEqual({ ok: false, message: 'database down' });
  });
});
