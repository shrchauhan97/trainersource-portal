import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyLoginWidget } from '@/lib/telegram-auth';

const BOT_TOKEN = '1234567:ABC-DEF_ghiJKLmno';

function sign(data: Record<string, string | number>, token: string): string {
  const secret = crypto.createHash('sha256').update(token).digest();
  const dataCheckString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  return crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
}

describe('verifyLoginWidget', () => {
  it('accepts valid payload', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      id: 111222333,
      first_name: 'Sarah',
      auth_date: now,
    } as const;
    const hash = sign(payload, BOT_TOKEN);
    const out = verifyLoginWidget({ ...payload, hash }, BOT_TOKEN);
    expect(out).not.toBeNull();
    expect(out?.id).toBe(111222333);
    expect(out?.first_name).toBe('Sarah');
  });

  it('rejects tampered payload', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { id: 1, first_name: 'Sarah', auth_date: now } as const;
    const hash = sign(payload, BOT_TOKEN);
    const out = verifyLoginWidget(
      { ...payload, first_name: 'Mallory', hash },
      BOT_TOKEN,
    );
    expect(out).toBeNull();
  });

  it('rejects payload without hash', () => {
    expect(verifyLoginWidget({ id: 1, auth_date: 1 } as any, BOT_TOKEN)).toBeNull();
  });

  it('rejects stale auth_date (>86400s old)', () => {
    const stale = Math.floor(Date.now() / 1000) - 86401;
    const payload = { id: 1, first_name: 'S', auth_date: stale } as const;
    const hash = sign(payload, BOT_TOKEN);
    expect(verifyLoginWidget({ ...payload, hash }, BOT_TOKEN)).toBeNull();
  });

  it('accepts optional fields (username, photo_url, last_name)', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      id: 5,
      first_name: 'S',
      last_name: 'J',
      username: 'sarah',
      photo_url: 'https://t.me/i/photo.jpg',
      auth_date: now,
    } as const;
    const hash = sign(payload, BOT_TOKEN);
    const out = verifyLoginWidget({ ...payload, hash }, BOT_TOKEN);
    expect(out?.username).toBe('sarah');
  });

  it('uses timing-safe compare (accepts hash with any case)', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { id: 9, first_name: 'S', auth_date: now } as const;
    const hash = sign(payload, BOT_TOKEN);
    const out = verifyLoginWidget({ ...payload, hash: hash.toUpperCase() }, BOT_TOKEN);
    expect(out).not.toBeNull();
  });
});
