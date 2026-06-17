import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  handleLinkTelegramCallback,
  isTelegramCallback,
  LINK_TELEGRAM_BOT_REDIRECT,
} from '@/lib/link-telegram-handler';

const mockRpc = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ rpc: mockRpc }),
}));

vi.mock('@/lib/bc-current-customer', () => ({
  loadBcCurrentCustomerConfig: () => ({
    clientId: 'cid',
    clientSecret: 'secret',
    storeHash: 'hash',
    storeUrl: 'https://ultimate-peptides.com',
  }),
  resolveBcCustomerFromCookies: vi.fn().mockResolvedValue({ ok: true, customerId: 42 }),
}));

const { resolveBcCustomerFromCookies } = await import('@/lib/bc-current-customer');

function sign(data: Record<string, string | number>, token: string): string {
  const secret = crypto.createHash('sha256').update(token).digest();
  const dcs = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  return crypto.createHmac('sha256', secret).update(dcs).digest('hex');
}

function telegramParams(id = 999, firstName = 'Test') {
  const now = Math.floor(Date.now() / 1000);
  const payload = { id, first_name: firstName, auth_date: now };
  const hash = sign(payload, '1234567:ABCDEF');
  return {
    id: String(id),
    first_name: firstName,
    auth_date: String(now),
    hash,
  };
}

const headers = new Headers({ 'user-agent': 'vitest' });

beforeEach(() => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '1234567:ABCDEF');
  mockRpc.mockReset();
  vi.mocked(resolveBcCustomerFromCookies).mockResolvedValue({
    ok: true,
    customerId: 42,
  });
  mockRpc.mockResolvedValue({
    data: [{ ok: true, reason: null, action: 'create' }],
    error: null,
  });
});

describe('isTelegramCallback', () => {
  it('returns true when hash param is present', () => {
    expect(isTelegramCallback({ hash: 'abc' })).toBe(true);
  });

  it('returns false when hash is missing', () => {
    expect(isTelegramCallback({ id: '1' })).toBe(false);
  });
});

describe('handleLinkTelegramCallback', () => {
  it('redirects to bot on happy path', async () => {
    const result = await handleLinkTelegramCallback(
      telegramParams(999),
      'SHOP_TOKEN=x',
      headers,
    );
    expect(result).toEqual({ kind: 'redirect', url: LINK_TELEGRAM_BOT_REDIRECT });
    expect(mockRpc).toHaveBeenCalledWith(
      'link_telegram_to_bc_customer',
      expect.objectContaining({
        p_telegram_user_id: 999,
        p_bc_customer_id: 42,
        p_linked_via: 'widget',
      }),
    );
  });

  it('returns 401 on invalid Telegram HMAC', async () => {
    const result = await handleLinkTelegramCallback(
      { ...telegramParams(), hash: 'deadbeef' },
      'SHOP_TOKEN=x',
      headers,
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.status).toBe(401);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns store login required when no BC session', async () => {
    vi.mocked(resolveBcCustomerFromCookies).mockResolvedValueOnce({
      ok: false,
      reason: 'no_bc_session',
    });
    const result = await handleLinkTelegramCallback(
      telegramParams(),
      null,
      headers,
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.title).toBe('Store login required');
      expect(result.status).toBe(401);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 409 on telegram_account_linked_to_another_customer', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          ok: false,
          reason: 'telegram_account_linked_to_another_customer',
          action: 'conflict_blocked',
        },
      ],
      error: null,
    });
    const result = await handleLinkTelegramCallback(
      telegramParams(),
      'SHOP_TOKEN=x',
      headers,
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.status).toBe(409);
      expect(result.title).toMatch(/Telegram account already linked/i);
    }
  });

  it('returns 409 on bc_customer_linked_to_another_telegram', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          ok: false,
          reason: 'bc_customer_linked_to_another_telegram',
          action: 'conflict_blocked',
        },
      ],
      error: null,
    });
    const result = await handleLinkTelegramCallback(
      telegramParams(),
      'SHOP_TOKEN=x',
      headers,
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.status).toBe(409);
      expect(result.title).toMatch(/Store account already linked/i);
    }
  });

  it('returns 500 when RPC errors', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    const result = await handleLinkTelegramCallback(
      telegramParams(),
      'SHOP_TOKEN=x',
      headers,
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.status).toBe(500);
    }
  });
});
