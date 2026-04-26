import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireBotSecret } from '@/lib/bot-auth';

beforeEach(() => {
  vi.stubEnv('BOT_PORTAL_SHARED_SECRET', 'test-secret');
});

function req(headers: Record<string, string>): Request {
  return new Request('https://x/api/trainer/codes', { headers });
}

describe('requireBotSecret', () => {
  it('returns trainerId when headers valid', () => {
    const result = requireBotSecret(req({
      'X-Bot-Secret': 'test-secret',
      'X-Trainer-Id': '11111111-1111-1111-1111-111111111111',
    }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.trainerId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('rejects missing X-Bot-Secret', () => {
    const result = requireBotSecret(req({ 'X-Trainer-Id': 'x' }));
    expect(result.ok).toBe(false);
  });

  it('rejects wrong X-Bot-Secret (timing-safe)', () => {
    const result = requireBotSecret(req({
      'X-Bot-Secret': 'wrong',
      'X-Trainer-Id': '11111111-1111-1111-1111-111111111111',
    }));
    expect(result.ok).toBe(false);
  });

  it('rejects malformed X-Trainer-Id', () => {
    const result = requireBotSecret(req({
      'X-Bot-Secret': 'test-secret',
      'X-Trainer-Id': 'not-a-uuid',
    }));
    expect(result.ok).toBe(false);
  });

  it('rejects when env secret not set', () => {
    vi.stubEnv('BOT_PORTAL_SHARED_SECRET', '');
    const result = requireBotSecret(req({
      'X-Bot-Secret': 'anything',
      'X-Trainer-Id': '11111111-1111-1111-1111-111111111111',
    }));
    expect(result.ok).toBe(false);
  });
});
