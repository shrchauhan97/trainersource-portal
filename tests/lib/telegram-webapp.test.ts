import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  verifyTelegramWebApp,
  verifyTelegramWebAppFresh,
  MAX_AUTH_AGE_SECONDS,
  CLOCK_SKEW_SECONDS,
} from '@/lib/telegram-auth';

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

describe('verifyTelegramWebAppFresh', () => {
  it('accepts a freshly signed initData within the 5-minute window', () => {
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER);
    const result = verifyTelegramWebAppFresh(initData, TEST_BOT_TOKEN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(777);
      expect(result.user.first_name).toBe('Test');
    }
  });

  it('rejects initData with auth_date older than MAX_AUTH_AGE_SECONDS as expired', () => {
    const stale = Math.floor(Date.now() / 1000) - (MAX_AUTH_AGE_SECONDS + 5);
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER, stale);
    const result = verifyTelegramWebAppFresh(initData, TEST_BOT_TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired_auth_data');
  });

  it('accepts initData with auth_date right at the edge of the window', () => {
    // Pick an auth_date that is MAX_AUTH_AGE_SECONDS - 5 seconds in the past.
    // It should comfortably pass the freshness check.
    const recent = Math.floor(Date.now() / 1000) - (MAX_AUTH_AGE_SECONDS - 5);
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER, recent);
    const result = verifyTelegramWebAppFresh(initData, TEST_BOT_TOKEN);
    expect(result.ok).toBe(true);
  });

  it('accepts mild clock skew (auth_date a few seconds in the future)', () => {
    const future = Math.floor(Date.now() / 1000) + (CLOCK_SKEW_SECONDS - 10);
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER, future);
    const result = verifyTelegramWebAppFresh(initData, TEST_BOT_TOKEN);
    expect(result.ok).toBe(true);
  });

  it('rejects auth_date far in the future (beyond clock skew) as expired', () => {
    const future = Math.floor(Date.now() / 1000) + CLOCK_SKEW_SECONDS + 30;
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER, future);
    const result = verifyTelegramWebAppFresh(initData, TEST_BOT_TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired_auth_data');
  });

  it('reports invalid_signature when HMAC fails (does not leak as expired)', () => {
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER);
    const tampered = initData.replace(/hash=([a-f0-9])/, (_m, c) =>
      `hash=${c === '0' ? '1' : '0'}`,
    );
    const result = verifyTelegramWebAppFresh(tampered, TEST_BOT_TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_signature');
  });

  it('honors a caller-supplied maxAgeSeconds override (wider window)', () => {
    // 10 minutes old — would fail the 5-min default, should pass with a 1h override.
    const tenMinAgo = Math.floor(Date.now() / 1000) - 600;
    const initData = buildInitData(TEST_BOT_TOKEN, TEST_USER, tenMinAgo);
    const tight = verifyTelegramWebAppFresh(initData, TEST_BOT_TOKEN);
    expect(tight.ok).toBe(false);
    const loose = verifyTelegramWebAppFresh(initData, TEST_BOT_TOKEN, {
      maxAgeSeconds: 3600,
    });
    expect(loose.ok).toBe(true);
  });

  it('uses MAX_AUTH_AGE_SECONDS = 300 by default (matches Telegram guidance)', () => {
    expect(MAX_AUTH_AGE_SECONDS).toBe(300);
  });
});
