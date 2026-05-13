import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireBotSecret, computeBotSignature } from '@/lib/bot-auth';

const SECRET = 'test-secret-32-chars-long-abcdef';
const TG_USER_ID = '123456789';
const TRAINER_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.stubEnv('BOT_PORTAL_SHARED_SECRET', SECRET);
});

function sign(telegramUserId: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(telegramUserId).digest('hex');
}

function req(headers: Record<string, string>): Request {
  return new Request('https://x/api/trainer/codes', { headers });
}

/**
 * Build a minimal SupabaseClient stub for our two table calls. The real client
 * is a chain-builder; we mimic just the surface `requireBotSecret` uses.
 *
 * - `linkLookup === undefined` → no row found (not_linked).
 * - `linkLookup === Error` → lookup error.
 * - `trainerStatus === undefined` → no trainer row found.
 * - `trainerStatus === string` → trainer.status value.
 * - `trainerStatus === Error` → lookup error.
 */
type Stub = {
  linkLookup?: { trainer_id: string } | Error;
  trainerStatus?: string | Error;
};
function makeSupabase(stub: Stub): SupabaseClient {
  const client = {
    from(table: string) {
      if (table === 'trainer_telegram_links') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (stub.linkLookup instanceof Error) {
                  return { data: null, error: { message: stub.linkLookup.message } };
                }
                return { data: stub.linkLookup ?? null, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'trainers') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (stub.trainerStatus instanceof Error) {
                  return { data: null, error: { message: stub.trainerStatus.message } };
                }
                if (typeof stub.trainerStatus === 'string') {
                  return { data: { status: stub.trainerStatus }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  // The mock only exposes `.from()` — the surface requireBotSecret uses.
  // Cast through `unknown` to satisfy the full SupabaseClient interface
  // without faking the rest of it.
  return client as unknown as SupabaseClient;
}

describe('requireBotSecret', () => {
  it('happy path: valid secret + valid signature + linked active trainer', async () => {
    const supabase = makeSupabase({
      linkLookup: { trainer_id: TRAINER_ID },
      trainerStatus: 'active',
    });
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      }),
      supabase,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trainerId).toBe(TRAINER_ID);
      expect(result.telegramUserId).toBe(TG_USER_ID);
    }
  });

  it('rejects missing env secret', async () => {
    vi.stubEnv('BOT_PORTAL_SHARED_SECRET', '');
    const supabase = makeSupabase({});
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': 'anything',
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID, 'anything'),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('server-misconfigured');
  });

  it('rejects missing X-Bot-Secret', async () => {
    const supabase = makeSupabase({});
    const result = await requireBotSecret(
      req({
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-secret');
  });

  it('rejects wrong X-Bot-Secret (timing-safe)', async () => {
    const supabase = makeSupabase({});
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': 'wrong-secret-but-same-length-1234',
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-secret');
  });

  it('rejects malformed X-Telegram-User-Id (non-numeric)', async () => {
    const supabase = makeSupabase({});
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': 'not-a-number',
        'X-Bot-Sig': sign('not-a-number'),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-telegram-user-id');
  });

  it('rejects malformed X-Telegram-User-Id (leading zero)', async () => {
    const supabase = makeSupabase({});
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': '0123456',
        'X-Bot-Sig': sign('0123456'),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-telegram-user-id');
  });

  it('rejects missing X-Bot-Sig', async () => {
    const supabase = makeSupabase({});
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-signature');
  });

  it('rejects malformed X-Bot-Sig (wrong length)', async () => {
    const supabase = makeSupabase({});
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': 'deadbeef',
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-signature');
  });

  it('rejects forged X-Bot-Sig (right shape, wrong value)', async () => {
    const supabase = makeSupabase({});
    const wrongSig = sign(TG_USER_ID, 'attacker-guess'); // 64 hex chars, wrong key
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': wrongSig,
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-signature');
  });

  it('rejects signature computed over a different telegram_user_id (binding check)', async () => {
    const supabase = makeSupabase({
      linkLookup: { trainer_id: TRAINER_ID },
      trainerStatus: 'active',
    });
    // Caller sends user 123 in header but a signature valid for user 999.
    // This is the key attack the HMAC binds against — even with the secret,
    // the attacker can't reuse a signed-elsewhere user id.
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign('999888777'),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-signature');
  });

  it('rejects when telegram_user_id is not linked to any trainer', async () => {
    const supabase = makeSupabase({ linkLookup: undefined });
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-linked');
  });

  it('rejects when link lookup errors', async () => {
    const supabase = makeSupabase({ linkLookup: new Error('db down') });
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('lookup-failed');
  });

  it('rejects when trainer is not active (suspended)', async () => {
    const supabase = makeSupabase({
      linkLookup: { trainer_id: TRAINER_ID },
      trainerStatus: 'suspended',
    });
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('trainer-not-active');
  });

  it('rejects when trainer record is missing entirely', async () => {
    const supabase = makeSupabase({
      linkLookup: { trainer_id: TRAINER_ID },
      trainerStatus: undefined,
    });
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Telegram-User-Id': TG_USER_ID,
        'X-Bot-Sig': sign(TG_USER_ID),
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('trainer-not-active');
  });

  it('legacy X-Trainer-Id header is ignored (no longer trusted)', async () => {
    // Pre-T2.5 callers used X-Trainer-Id directly. The new contract drops it.
    // Without X-Telegram-User-Id + signature, the request must fail even
    // though it carries a "valid" trainer id and the right secret.
    const supabase = makeSupabase({
      linkLookup: { trainer_id: TRAINER_ID },
      trainerStatus: 'active',
    });
    const result = await requireBotSecret(
      req({
        'X-Bot-Secret': SECRET,
        'X-Trainer-Id': TRAINER_ID, // legacy — should be ignored
      }),
      supabase,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-telegram-user-id');
  });
});

describe('computeBotSignature', () => {
  it('is deterministic for (id, secret)', () => {
    expect(computeBotSignature('123', 'k')).toBe(computeBotSignature('123', 'k'));
  });

  it('changes when the id changes', () => {
    expect(computeBotSignature('123', 'k')).not.toBe(computeBotSignature('124', 'k'));
  });

  it('changes when the secret changes', () => {
    expect(computeBotSignature('123', 'k1')).not.toBe(computeBotSignature('123', 'k2'));
  });

  it('produces 64-char lowercase hex', () => {
    const sig = computeBotSignature('123', 'k');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts number id (stringified internally)', () => {
    expect(computeBotSignature(123, 'k')).toBe(computeBotSignature('123', 'k'));
  });
});
