// src/lib/issue-code.ts
//
// Shared helper for issuing a bot-sourced trainer referral code. Extracted from
// src/app/api/trainer/issue-code/route.ts so both the bot-secret-authenticated
// REST endpoint AND the Mini App initData-authenticated endpoint can share one
// slug/suffix/uniqueness-loop implementation.
//
// Behaviour-preserving extraction — changes to the algorithm here propagate to
// both routes. Do not change the semantics without updating both callers'
// tests.
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const RANDOM_SUFFIX_LEN = 4;
const SLUG_MAX = 24;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const EXPIRY_DAYS = 365;
const MAX_ATTEMPTS = 10;

export function slugFromLabel(label: string): string {
  const ascii = label
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '') // strip non-ASCII
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
  return ascii.length >= 2 ? ascii : 'CLIENT';
}

function randomSuffix(): string {
  const bytes = randomBytes(RANDOM_SUFFIX_LEN);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export type IssueTrainerCodeResult = {
  id: string;
  code: string;
  label: string;
  landing_url: string;
  deep_link: string;
  qr_url: string;
  expires_at: string;
};

export type IssueTrainerCodeError =
  | { kind: 'label-required' }
  | { kind: 'label-too-long' }
  | { kind: 'db-error'; message: string }
  | { kind: 'uniqueness-exhausted' };

export type IssueTrainerCodeOutcome =
  | { ok: true; result: IssueTrainerCodeResult }
  | { ok: false; error: IssueTrainerCodeError };

/**
 * Insert a new bot-sourced access_code row for the given trainer, retrying on
 * unique-violation (error code 23505) up to MAX_ATTEMPTS times with a fresh
 * random suffix. Callers are responsible for auth — this helper trusts the
 * trainerId it's given.
 */
export async function issueTrainerCode(
  supabase: SupabaseClient,
  trainerId: string,
  rawLabel: string,
): Promise<IssueTrainerCodeOutcome> {
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
  if (!label) return { ok: false, error: { kind: 'label-required' } };
  if (label.length > 200) return { ok: false, error: { kind: 'label-too-long' } };

  const slug = slugFromLabel(label);
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = `${slug}-${randomSuffix()}`;
    const { data, error } = await supabase
      .from('access_codes')
      .insert({
        code,
        type: 'trainer',
        trainer_id: trainerId,
        status: 'active',
        issued_via: 'bot',
        label,
        expires_at: expiresAt,
      })
      .select('id, code, label, expires_at')
      .single<{ id: string; code: string; label: string; expires_at: string }>();

    if (!error && data) {
      const portalBase =
        process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? 'https://trainer-source.com';
      const upBase = process.env.NEXT_PUBLIC_UP_BASE_URL ?? 'https://ultimate-peptides.com';
      // Behaviour-preserving: the original route returned the freshly-generated
      // `code` (local variable) rather than the row's `data.code`. We keep that
      // semantic so existing tests and callers stay stable.
      return {
        ok: true,
        result: {
          id: data.id,
          code,
          label: data.label,
          landing_url: `${upBase}?ref=${code}`,
          deep_link: `${upBase}/code/${code}`,
          qr_url: `${portalBase}/api/qr/${code}`,
          expires_at: data.expires_at,
        },
      };
    }

    // 23505 = unique-violation. Loop and retry with fresh suffix.
    if (error && (error as { code?: string }).code !== '23505') {
      return { ok: false, error: { kind: 'db-error', message: error.message } };
    }
  }

  return { ok: false, error: { kind: 'uniqueness-exhausted' } };
}
