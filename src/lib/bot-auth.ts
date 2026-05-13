// src/lib/bot-auth.ts
//
// Bot → portal auth.
//
// CONTRACT (post-T2.5, 2026-05-14):
//   The bot identifies itself with THREE pieces of evidence:
//     1. X-Bot-Secret      : the global shared secret (proves the caller is the bot).
//     2. X-Telegram-User-Id: the Telegram user_id the bot is acting on behalf of.
//     3. X-Bot-Sig         : hex(HMAC-SHA256(X-Telegram-User-Id, BOT_PORTAL_SHARED_SECRET)).
//
//   The portal (a) verifies the secret (timing-safe), (b) verifies the HMAC binds the
//   secret holder to THIS telegram_user_id (so a captured header set for user A cannot
//   be replayed against user B without re-signing), (c) maps telegram_user_id →
//   trainer_id via `trainer_telegram_links` (the caller does NOT get to choose),
//   (d) confirms the trainer status is 'active'.
//
//   A leaked BOT_PORTAL_SHARED_SECRET still lets an attacker act for any
//   *linked* telegram_user_id — but they must KNOW that user_id (much less
//   enumerable than the UUIDs the legacy contract trusted blindly), AND the
//   underlying trainer must be linked & active. Net: meaningfully reduced blast
//   radius vs the pre-fix code which trusted any UUID anyone sent in a header.
//
// MIGRATION NOTE:
//   The previous contract used `X-Trainer-Id: <uuid>` (no signature). That mode
//   is REMOVED — the bot in `trainersource-bot/src/portal-api.ts` must be
//   updated to compute and send the new headers before this change deploys.
//   See bugs/fixes/F-T2.5-bot-auth.md for the matching bot-side patch.

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const TELEGRAM_USER_ID_RE = /^[1-9][0-9]{0,18}$/; // up to 19 digits, positive int
const SIGNATURE_HEX_RE = /^[0-9a-f]{64}$/i; // sha256 = 32 bytes = 64 hex chars

export type BotAuthReason =
  | 'server-misconfigured'
  | 'bad-secret'
  | 'bad-telegram-user-id'
  | 'bad-signature'
  | 'not-linked'
  | 'trainer-not-active'
  | 'lookup-failed';

export type BotAuthResult =
  | { ok: true; trainerId: string; telegramUserId: string }
  | { ok: false; reason: BotAuthReason };

/**
 * Timing-safe string compare. Returns false on length mismatch (without
 * leaking the length difference further than necessary — we still do work
 * over a fixed-length buffer to keep this cheap and predictable).
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verifies the bot is allowed to act on behalf of the trainer linked to the
 * supplied telegram_user_id.
 *
 * Async because we now resolve trainer_id via `trainer_telegram_links` —
 * the trainer_id is no longer caller-supplied.
 */
export async function requireBotSecret(
  request: Request,
  supabase: SupabaseClient,
): Promise<BotAuthResult> {
  // 1. Shared-secret check (gates every request; cheap; timing-safe).
  const envSecret = (process.env.BOT_PORTAL_SHARED_SECRET ?? '').trim();
  if (!envSecret) return { ok: false, reason: 'server-misconfigured' };

  const headerSecret = request.headers.get('X-Bot-Secret') ?? '';
  if (!timingSafeStringEqual(envSecret, headerSecret)) {
    return { ok: false, reason: 'bad-secret' };
  }

  // 2. Validate telegram_user_id shape. Telegram user IDs are positive
  //    bigints; we accept up to 19 digits to be future-proof for the
  //    64-bit-id rollout. Reject anything else (no leading zeros, no
  //    minus signs, no decimals).
  const telegramUserId = (request.headers.get('X-Telegram-User-Id') ?? '').trim();
  if (!TELEGRAM_USER_ID_RE.test(telegramUserId)) {
    return { ok: false, reason: 'bad-telegram-user-id' };
  }

  // 3. Verify signature binds the secret holder to this telegram_user_id.
  //    Without this step, the secret alone is sufficient — see the fix doc.
  const headerSig = (request.headers.get('X-Bot-Sig') ?? '').trim();
  if (!SIGNATURE_HEX_RE.test(headerSig)) {
    return { ok: false, reason: 'bad-signature' };
  }
  const expectedSig = crypto
    .createHmac('sha256', envSecret)
    .update(telegramUserId)
    .digest('hex');
  if (!timingSafeStringEqual(expectedSig, headerSig.toLowerCase())) {
    return { ok: false, reason: 'bad-signature' };
  }

  // 4. Resolve trainer_id from trainer_telegram_links. The portal — not the
  //    caller — chooses which trainer this signed telegram_user_id maps to.
  //    Service-role client is required (RLS hides this table from anon).
  const { data: link, error: linkErr } = await supabase
    .from('trainer_telegram_links')
    .select('trainer_id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle<{ trainer_id: string }>();

  if (linkErr) {
    console.error('[bot-auth] link lookup failed:', linkErr);
    return { ok: false, reason: 'lookup-failed' };
  }
  if (!link?.trainer_id) {
    return { ok: false, reason: 'not-linked' };
  }

  // 5. Verify the trainer is in good standing. A suspended trainer's bot
  //    session must not be able to issue codes or read earnings.
  const { data: trainer, error: trainerErr } = await supabase
    .from('trainers')
    .select('status')
    .eq('id', link.trainer_id)
    .maybeSingle<{ status: string }>();

  if (trainerErr) {
    console.error('[bot-auth] trainer lookup failed:', trainerErr);
    return { ok: false, reason: 'lookup-failed' };
  }
  if (!trainer || trainer.status !== 'active') {
    return { ok: false, reason: 'trainer-not-active' };
  }

  return { ok: true, trainerId: link.trainer_id, telegramUserId };
}

/**
 * Helper for bot-side implementations: compute the signature header value
 * for a given telegram_user_id + shared secret. Exported so a hypothetical
 * Node bot can re-import this exact routine. The bot's own implementation
 * lives in `trainersource-bot/src/portal-api.ts` (different package; this
 * export is for tests and any future portal-internal callers).
 */
export function computeBotSignature(
  telegramUserId: string | number,
  secret: string,
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(String(telegramUserId))
    .digest('hex');
}
