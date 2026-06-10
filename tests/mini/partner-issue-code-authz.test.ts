// tests/mini/partner-issue-code-authz.test.ts
//
// Regression coverage: POST /api/mini/partner/issue-code must enforce the same
// authorization as the web route (api/codes/generate) and the bot-secret route:
//   - only trainers.status === 'active' may mint codes
//   - the per-trainer customers >= max_clients cap is honored
// suspendTrainer/removeTrainer flip status but leave the trainer_telegram_links
// row live, so without these checks a suspended/removed trainer keeps minting
// attribution codes through the Mini App.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/telegram-auth', () => ({
  verifyTelegramWebAppFresh: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/issue-code', () => ({
  issueTrainerCode: vi.fn(),
}));

import { verifyTelegramWebAppFresh } from '@/lib/telegram-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { issueTrainerCode } from '@/lib/issue-code';
import { POST as issueCodePOST } from '@/app/api/mini/partner/issue-code/route';

// Table-aware Supabase stub. The route does three reads:
//   trainer_telegram_links → maybeSingle → { trainer_id }
//   trainers               → maybeSingle → { status, max_clients }
//   customers              → select(count, head) → eq → awaited → { count }
function makeSupabase(opts: {
  link: { trainer_id: string } | null;
  trainer: { status: string; max_clients: number } | null;
  customerCount: number;
}) {
  return {
    from(table: string) {
      const result =
        table === 'trainer_telegram_links'
          ? { data: opts.link, error: null }
          : table === 'trainers'
            ? { data: opts.trainer, error: null }
            : { count: opts.customerCount, error: null };
      // Builder is both chainable and awaitable (the customers count path awaits
      // .eq() directly; the link/trainer paths terminate in .maybeSingle()).
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => unknown) => resolve(result),
      };
      return builder;
    },
  };
}

function req(): Request {
  return new Request('http://localhost/api/mini/partner/issue-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-init-data': 'OK' },
    body: JSON.stringify({ label: 'Sarah yoga' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  vi.mocked(verifyTelegramWebAppFresh).mockReturnValue({
    ok: true,
    user: { id: 12345 },
  } as unknown as ReturnType<typeof verifyTelegramWebAppFresh>);
});

describe('POST /api/mini/partner/issue-code — authorization', () => {
  it('rejects a suspended trainer with 403 not_active and does NOT mint a code', async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeSupabase({
        link: { trainer_id: 'T1' },
        trainer: { status: 'suspended', max_clients: 100 },
        customerCount: 0,
      }) as unknown as ReturnType<typeof createServiceClient>,
    );

    const res = await issueCodePOST(req());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_active');
    expect(issueTrainerCode).not.toHaveBeenCalled();
  });

  it('rejects an active trainer at the max_clients cap with 403 and does NOT mint', async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeSupabase({
        link: { trainer_id: 'T1' },
        trainer: { status: 'active', max_clients: 100 },
        customerCount: 100,
      }) as unknown as ReturnType<typeof createServiceClient>,
    );

    const res = await issueCodePOST(req());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('max_clients_reached');
    expect(issueTrainerCode).not.toHaveBeenCalled();
  });

  it('mints a code for an active trainer under the cap', async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeSupabase({
        link: { trainer_id: 'T1' },
        trainer: { status: 'active', max_clients: 100 },
        customerCount: 5,
      }) as unknown as ReturnType<typeof createServiceClient>,
    );
    vi.mocked(issueTrainerCode).mockResolvedValue({
      ok: true,
      result: {
        id: 'c1',
        code: 'SARAH-YOGA-AB12',
        label: 'Sarah yoga',
        landing_url: 'https://ultimate-peptides.com?ref=SARAH-YOGA-AB12',
        deep_link: 'https://trainer-source.com/r/SARAH-YOGA-AB12',
        qr_url: 'https://trainer-source.com/api/qr/SARAH-YOGA-AB12',
        expires_at: '2027-05-25T00:00:00.000Z',
      },
    });

    const res = await issueCodePOST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).code).toBe('SARAH-YOGA-AB12');
    expect(issueTrainerCode).toHaveBeenCalledWith(expect.anything(), 'T1', 'Sarah yoga');
  });

  it('returns 403 not_linked when no telegram link exists', async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeSupabase({ link: null, trainer: null, customerCount: 0 }) as unknown as ReturnType<
        typeof createServiceClient
      >,
    );

    const res = await issueCodePOST(req());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_linked');
    expect(issueTrainerCode).not.toHaveBeenCalled();
  });
});
