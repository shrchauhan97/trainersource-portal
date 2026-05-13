import crypto from 'node:crypto';

/** Payload shape from the Telegram Login Widget (per official spec). */
export interface LoginWidgetPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/** Verified user, hash stripped. */
export interface VerifiedTelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
}

// Login Widget callbacks are accepted for 24h (separate from Mini App initData,
// which uses the tighter MAX_AUTH_AGE_SECONDS replay window further down).
const LOGIN_WIDGET_MAX_AUTH_AGE_SECONDS = 86_400;

/**
 * Verify a Telegram Login Widget callback.
 * See https://core.telegram.org/widgets/login#checking-authorization
 *
 * Returns the verified user object (hash stripped) on success, or null if the
 * payload fails HMAC verification or is older than 24h.
 */
export function verifyLoginWidget(
  payload: Partial<LoginWidgetPayload>,
  botToken: string,
): VerifiedTelegramUser | null {
  if (!payload || typeof payload.hash !== 'string' || !payload.hash) return null;
  if (typeof payload.id !== 'number') return null;
  if (typeof payload.auth_date !== 'number') return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - payload.auth_date > LOGIN_WIDGET_MAX_AUTH_AGE_SECONDS) return null;

  const { hash, ...rest } = payload as LoginWidgetPayload;

  const dataCheckString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${(rest as Record<string, unknown>)[k]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const a = Buffer.from(expected.toLowerCase(), 'utf8');
  const b = Buffer.from(hash.toLowerCase(), 'utf8');
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return {
    id: payload.id,
    first_name: payload.first_name!,
    last_name: payload.last_name,
    username: payload.username,
    photo_url: payload.photo_url,
    auth_date: payload.auth_date,
  };
}

/** User object extracted from Mini App initData (`user=<JSON>` param). */
export interface TelegramMiniAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

/**
 * Verify a Telegram Mini App `initData` string per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Note: the secret key derivation differs from Login Widget — Mini Apps use
 * HMAC-SHA256("WebAppData", botToken) whereas Login Widget uses
 * sha256(botToken). Keep them separate on purpose.
 *
 * Returns the parsed user object on success, or null if the hash is missing,
 * tampered, produced with the wrong token, or the user field can't be parsed.
 */
export function verifyTelegramWebApp(
  initData: string,
  botToken: string,
): TelegramMiniAppUser | null {
  if (!initData || !botToken) return null;

  const parsed = new URLSearchParams(initData);
  const hash = parsed.get('hash');
  if (!hash) return null;

  parsed.delete('hash');

  const dataCheckString = [...parsed.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  const userJson = parsed.get('user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson) as TelegramMiniAppUser;
  } catch {
    return null;
  }
}

/**
 * Extract the auth_date (unix seconds) from a Mini App initData string.
 * Used by Mini App route handlers to enforce a staleness window beyond
 * what verifyTelegramWebApp checks (it only verifies HMAC, not freshness).
 * Returns null if the field is missing or unparseable.
 */
export function getAuthDateSeconds(initData: string): number | null {
  if (!initData) return null;
  const parsed = new URLSearchParams(initData);
  const raw = parsed.get('auth_date');
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Default Mini App initData freshness window (5 minutes), per Telegram's own
 * replay-attack guidance. Used by `verifyTelegramWebAppFresh` and route
 * handlers that need replay protection on captured initData.
 *
 * Note: the older reorder routes intentionally use a 24h window — keep their
 * local constants in place. New routes should prefer this default.
 */
export const MAX_AUTH_AGE_SECONDS = 300;

/**
 * Clock-skew tolerance (in seconds) for auth_date values that appear to be in
 * the future relative to the server clock. Telegram's runtime sets auth_date
 * from the client side, so trusting it down to the second invites spurious
 * failures on devices with a slightly fast clock. Matches the existing
 * reorder-route constant.
 */
export const CLOCK_SKEW_SECONDS = 60;

export type WebAppVerifyFailReason =
  | 'invalid_signature'
  | 'expired_auth_data';

export type WebAppVerifyResult =
  | { ok: true; user: TelegramMiniAppUser }
  | { ok: false; reason: WebAppVerifyFailReason };

/**
 * Verify Mini App initData *and* enforce a freshness window on the embedded
 * `auth_date`. Returns a discriminated result so callers can map failures to
 * appropriate HTTP responses (e.g. 401 + `expired_auth_data` to prompt the
 * client to reopen the Mini App and obtain a fresh initData string).
 *
 * - HMAC failure → `{ ok: false, reason: 'invalid_signature' }`
 * - Missing/unparseable/too-old/too-far-in-future auth_date →
 *   `{ ok: false, reason: 'expired_auth_data' }`
 *
 * Defaults to `MAX_AUTH_AGE_SECONDS` (5 minutes) per Telegram replay-attack
 * guidance. Callers that need a wider window (e.g. long-lived reorder flows)
 * should continue calling `verifyTelegramWebApp` + `getAuthDateSeconds`
 * directly with their own constants.
 */
export function verifyTelegramWebAppFresh(
  initData: string,
  botToken: string,
  options: { maxAgeSeconds?: number; clockSkewSeconds?: number } = {},
): WebAppVerifyResult {
  const user = verifyTelegramWebApp(initData, botToken);
  if (!user) return { ok: false, reason: 'invalid_signature' };

  const maxAge = options.maxAgeSeconds ?? MAX_AUTH_AGE_SECONDS;
  const skew = options.clockSkewSeconds ?? CLOCK_SKEW_SECONDS;
  const authDate = getAuthDateSeconds(initData);
  const now = Math.floor(Date.now() / 1000);
  if (
    authDate === null ||
    authDate > now + skew ||
    now - authDate > maxAge
  ) {
    return { ok: false, reason: 'expired_auth_data' };
  }

  return { ok: true, user };
}
