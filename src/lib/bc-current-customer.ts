import jwt from 'jsonwebtoken';

export interface BcCurrentCustomerConfig {
  clientId: string;
  clientSecret: string;
  storeHash: string;
  storeUrl: string;
}

export type ResolveBcCustomerResult =
  | { ok: true; customerId: number }
  | {
      ok: false;
      reason:
        | 'misconfigured'
        | 'no_bc_session'
        | 'invalid_jwt'
        | 'store_hash_mismatch'
        | 'fetch_failed';
    };

interface CurrentCustomerJwtPayload {
  customer?: { id?: number };
  store_hash?: string;
  operation?: string;
}

export function loadBcCurrentCustomerConfig(): BcCurrentCustomerConfig | null {
  const clientId = process.env.BC_CLIENT_ID?.trim();
  const clientSecret = process.env.BC_CLIENT_SECRET?.trim();
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH?.trim();
  const storeUrl = (process.env.BC_STORE_URL ?? 'https://ultimate-peptides.com').replace(
    /\/$/,
    '',
  );
  if (!clientId || !clientSecret || !storeHash) return null;
  return { clientId, clientSecret, storeHash, storeUrl };
}

export function verifyCurrentCustomerJwt(
  token: string,
  cfg: BcCurrentCustomerConfig,
): { ok: true; customerId: number } | { ok: false; reason: 'invalid_jwt' | 'store_hash_mismatch' } {
  try {
    const decoded = jwt.verify(token, cfg.clientSecret, {
      algorithms: ['HS256'],
    }) as CurrentCustomerJwtPayload;

    if (decoded.operation !== 'current_customer') {
      return { ok: false, reason: 'invalid_jwt' };
    }
    if (decoded.store_hash !== cfg.storeHash) {
      return { ok: false, reason: 'store_hash_mismatch' };
    }

    const customerId = decoded.customer?.id;
    if (typeof customerId !== 'number' || !Number.isInteger(customerId) || customerId <= 0) {
      return { ok: false, reason: 'invalid_jwt' };
    }

    return { ok: true, customerId };
  } catch {
    return { ok: false, reason: 'invalid_jwt' };
  }
}

/**
 * Resolve the logged-in BC customer from storefront session cookies via the
 * Current Customer API (https://developer.bigcommerce.com/docs/storefront-auth/current-customer).
 */
export async function resolveBcCustomerFromCookies(
  cookieHeader: string | null | undefined,
  cfg: BcCurrentCustomerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveBcCustomerResult> {
  if (!cookieHeader?.trim()) {
    return { ok: false, reason: 'no_bc_session' };
  }

  const url = `${cfg.storeUrl}/customer/current.jwt?app_client_id=${encodeURIComponent(cfg.clientId)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: 'fetch_failed' };
  }

  if (!res.ok) {
    return { ok: false, reason: 'no_bc_session' };
  }

  const token = (await res.text()).trim();
  if (!token) {
    return { ok: false, reason: 'no_bc_session' };
  }

  const verified = verifyCurrentCustomerJwt(token, cfg);
  if (!verified.ok) return verified;
  return verified;
}
