import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

export interface BcSsoConfig {
  clientId: string;
  clientSecret: string;
  storeHash: string;
  storeUrl: string; // e.g., https://ultimate-peptides.com
}

export interface BcLoginPayload {
  iss: string;
  iat: number;
  jti: string;
  operation: 'customer_logon';
  store_hash: string;
  customer_id: number;
  redirect_to?: string;
}

/**
 * Mint a BigCommerce Customer Login SSO JWT.
 * https://developer.bigcommerce.com/docs/store-operations/customer-login
 *
 * The returned token is valid for ~30 seconds — BC's checkout endpoint
 * rejects stale `iat`. Callers should mint right before redirect, not cache.
 */
export function buildBcLoginJwt(
  cfg: BcSsoConfig,
  customerId: number,
  redirectTo?: string,
): string {
  const payload: BcLoginPayload = {
    iss: cfg.clientId,
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID(),
    operation: 'customer_logon',
    store_hash: cfg.storeHash,
    customer_id: customerId,
    ...(redirectTo ? { redirect_to: redirectTo } : {}),
  };
  return jwt.sign(payload, cfg.clientSecret, { algorithm: 'HS256' });
}

export function buildBcLoginUrl(
  cfg: BcSsoConfig,
  customerId: number,
  redirectTo?: string,
): string {
  const token = buildBcLoginJwt(cfg, customerId, redirectTo);
  const base = cfg.storeUrl.replace(/\/$/, '');
  return `${base}/login/token/${token}`;
}

export function loadBcSsoConfig(): BcSsoConfig {
  const clientId = process.env.BC_CLIENT_ID;
  const clientSecret = process.env.BC_CLIENT_SECRET;
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const storeUrl = process.env.BC_STORE_URL ?? 'https://ultimate-peptides.com';
  if (!clientId || !clientSecret || !storeHash) {
    throw new Error(
      'bc-sso: missing BC_CLIENT_ID / BC_CLIENT_SECRET / BIGCOMMERCE_STORE_HASH env',
    );
  }
  return { clientId, clientSecret, storeHash, storeUrl };
}
