import jwt from 'jsonwebtoken';
import { cookieNames, linkTelegramDebug } from '@/lib/link-telegram-debug';

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
      // #region agent log
      linkTelegramDebug({
        location: 'bc-current-customer.ts:verifyCurrentCustomerJwt',
        message: 'store_hash mismatch',
        hypothesisId: 'B',
        data: {
          jwtStoreHash: decoded.store_hash ?? null,
          expectedStoreHash: cfg.storeHash,
        },
      });
      // #endregion
      return { ok: false, reason: 'store_hash_mismatch' };
    }

    const customerId = decoded.customer?.id;
    if (typeof customerId !== 'number' || !Number.isInteger(customerId) || customerId <= 0) {
      return { ok: false, reason: 'invalid_jwt' };
    }

    return { ok: true, customerId };
  } catch {
    const unsafe = jwt.decode(token) as CurrentCustomerJwtPayload | null;
    // #region agent log
    linkTelegramDebug({
      location: 'bc-current-customer.ts:verifyCurrentCustomerJwt',
      message: 'jwt verify failed',
      hypothesisId: 'A',
      data: {
        jwtOperation: unsafe?.operation ?? null,
        jwtStoreHash: unsafe?.store_hash ?? null,
        expectedStoreHash: cfg.storeHash,
        hasCustomerId: typeof unsafe?.customer?.id === 'number',
      },
    });
    // #endregion
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
    // #region agent log
    linkTelegramDebug({
      location: 'bc-current-customer.ts:resolveBcCustomerFromCookies',
      message: 'empty cookie header',
      hypothesisId: 'D',
      data: { cookieCount: 0 },
    });
    // #endregion
    return { ok: false, reason: 'no_bc_session' };
  }

  const url = `${cfg.storeUrl}/customer/current.jwt?app_client_id=${encodeURIComponent(cfg.clientId)}`;
  const names = cookieNames(cookieHeader);
  // #region agent log
  linkTelegramDebug({
    location: 'bc-current-customer.ts:resolveBcCustomerFromCookies',
    message: 'bc jwt fetch start',
    hypothesisId: 'D',
    data: {
      cookieCount: names.length,
      cookieNames: names,
      hasShopSessionToken: names.includes('SHOP_SESSION_TOKEN'),
      jwtUrlHost: new URL(url).host,
    },
  });
  // #endregion
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
  } catch (err) {
    // #region agent log
    linkTelegramDebug({
      location: 'bc-current-customer.ts:resolveBcCustomerFromCookies',
      message: 'bc jwt fetch threw',
      hypothesisId: 'C',
      data: {
        error: err instanceof Error ? err.message : 'unknown',
      },
    });
    // #endregion
    return { ok: false, reason: 'fetch_failed' };
  }

  if (!res.ok) {
    // #region agent log
    linkTelegramDebug({
      location: 'bc-current-customer.ts:resolveBcCustomerFromCookies',
      message: 'bc jwt non-200',
      hypothesisId: 'E',
      data: { status: res.status },
    });
    // #endregion
    return { ok: false, reason: 'no_bc_session' };
  }

  const token = (await res.text()).trim();
  const looksLikeJwt = token.startsWith('eyJ');
  // #region agent log
  linkTelegramDebug({
    location: 'bc-current-customer.ts:resolveBcCustomerFromCookies',
    message: 'bc jwt response',
    hypothesisId: 'E',
    data: {
      status: res.status,
      bodyLength: token.length,
      looksLikeJwt,
      bodyPrefix: token.slice(0, 12),
    },
  });
  // #endregion
  if (!token) {
    return { ok: false, reason: 'no_bc_session' };
  }

  const verified = verifyCurrentCustomerJwt(token, cfg);
  if (!verified.ok) {
    // #region agent log
    linkTelegramDebug({
      location: 'bc-current-customer.ts:resolveBcCustomerFromCookies',
      message: 'jwt verify rejected',
      hypothesisId: 'A',
      data: { reason: verified.reason },
    });
    // #endregion
    return verified;
  }
  return verified;
}
