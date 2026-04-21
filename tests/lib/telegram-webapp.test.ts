import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyTelegramWebApp } from '@/lib/telegram-auth';

// Build a valid initData string for the test bot token — mirrors what
// Telegram's WebApp runtime produces in window.Telegram.WebApp.initData.
function buildInitData(
  botToken: string,
  user: { id: number; first_name: string; last_name?: string; username?: string },
  authDate = Math.floor(Date.now() / 1000),
): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAH-test-query-id');
  params.set('user', JSON.stringify(user));

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  params.set('hash', hash);
  return params.toString();
}

const TEST_BOT_TOKEN = '123456:TEST_BOT_TOKEN_NEVER_REAL';
const TEST_USER = { id: 777, first_name: 'Test', username: 'testuser' };

describe('verifyTelegramWebApp', () => {
  it('returns the user object for a valid initData payload', () => {
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER);
    const result = verifyTelegramWebApp(initData, TEST_BOT_TOKEN);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(777);
    expect(result?.first_name).toBe('Test');
    expect(result?.username).toBe('testuser');
  });

  it('returns null when the hash is tampered', () => {
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER);
    const tampered = initData.replace(/hash=([a-f0-9])/, (_m, c) =>
      `hash=${c === '0' ? '1' : '0'}`,
    );
    const result = verifyTelegramWebApp(tampered, TEST_BOT_TOKEN);
    expect(result).toBeNull();
  });

  it('returns null when user field is tampered (hash no longer matches)', () => {
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER);
    const tampered = initData.replace(
      /user=%7B%22id%22%3A777/,
      'user=%7B%22id%22%3A999',
    );
    const result = verifyTelegramWebApp(tampered, TEST_BOT_TOKEN);
    expect(result).toBeNull();
  });

  it('returns null when initData has no hash', () => {
    const params = new URLSearchParams();
    params.set('auth_date', '1700000000');
    params.set('user', JSON.stringify(TEST_USER));
    const result = verifyTelegramWebApp(params.toString(), TEST_BOT_TOKEN);
    expect(result).toBeNull();
  });

  it('returns null when wrong bot token is used', () => {
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER);
    const result = verifyTelegramWebApp(initData, '000000:WRONG_TOKEN');
    expect(result).toBeNull();
  });

  it('returns null for empty initData', () => {
    expect(verifyTelegramWebApp('', TEST_BOT_TOKEN)).toBeNull();
  });

  it('returns null for empty bot token', () => {
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER);
    expect(verifyTelegramWebApp(initData, '')).toBeNull();
  });
});
