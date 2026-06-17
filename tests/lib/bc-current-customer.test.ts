import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  verifyCurrentCustomerJwt,
  resolveBcCustomerFromCookies,
  type BcCurrentCustomerConfig,
} from '@/lib/bc-current-customer';

const cfg: BcCurrentCustomerConfig = {
  clientId: 'test_client_id',
  clientSecret: 'test_client_secret_long_enough_for_hs256',
  storeHash: 'yemcm3khpa',
  storeUrl: 'https://ultimate-peptides.com',
};

function mintCurrentCustomerJwt(
  customerId: number,
  overrides: Partial<{ operation: string; store_hash: string }> = {},
): string {
  return jwt.sign(
    {
      customer: { id: customerId, email: 'test@example.com', group_id: '1' },
      iss: 'bc/apps',
      operation: 'current_customer',
      store_hash: cfg.storeHash,
      ...overrides,
    },
    cfg.clientSecret,
    { algorithm: 'HS256', expiresIn: '15m' },
  );
}

describe('verifyCurrentCustomerJwt', () => {
  it('accepts a valid current_customer JWT', () => {
    const token = mintCurrentCustomerJwt(42);
    const out = verifyCurrentCustomerJwt(token, cfg);
    expect(out).toEqual({ ok: true, customerId: 42 });
  });

  it('rejects wrong operation', () => {
    const token = mintCurrentCustomerJwt(42, { operation: 'customer_login' });
    expect(verifyCurrentCustomerJwt(token, cfg)).toEqual({
      ok: false,
      reason: 'invalid_jwt',
    });
  });

  it('rejects store_hash mismatch', () => {
    const token = mintCurrentCustomerJwt(42, { store_hash: 'wrong' });
    expect(verifyCurrentCustomerJwt(token, cfg)).toEqual({
      ok: false,
      reason: 'store_hash_mismatch',
    });
  });

  it('rejects tampered token', () => {
    const token = mintCurrentCustomerJwt(42);
    const tampered = `${token}x`;
    expect(verifyCurrentCustomerJwt(tampered, cfg)).toEqual({
      ok: false,
      reason: 'invalid_jwt',
    });
  });
});

describe('resolveBcCustomerFromCookies', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns no_bc_session when cookie header is empty', async () => {
    const out = await resolveBcCustomerFromCookies('', cfg);
    expect(out).toEqual({ ok: false, reason: 'no_bc_session' });
  });

  it('returns customer id when BC returns a valid JWT', async () => {
    const token = mintCurrentCustomerJwt(99);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(token, { status: 200 }),
    );

    const out = await resolveBcCustomerFromCookies('SHOP_TOKEN=abc', cfg, fetchImpl);

    expect(out).toEqual({ ok: true, customerId: 99 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ultimate-peptides.com/customer/current.jwt?app_client_id=test_client_id',
      expect.objectContaining({
        headers: { Cookie: 'SHOP_TOKEN=abc' },
        cache: 'no-store',
      }),
    );
  });

  it('returns no_bc_session when BC responds non-200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    const out = await resolveBcCustomerFromCookies('SHOP_TOKEN=abc', cfg, fetchImpl);
    expect(out).toEqual({ ok: false, reason: 'no_bc_session' });
  });
});
