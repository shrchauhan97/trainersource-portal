// src/app/api/mini/partner/issue-code/route.ts
//
// Mini-App-authenticated issue-code endpoint. Verifies Telegram Mini App
// initData, looks up the linked trainer_id, then delegates to the shared
// issueTrainerCode helper. Parallel to /api/trainer/issue-code (bot-secret
// auth) — both share the same insert logic.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyTelegramWebAppFresh } from '@/lib/telegram-auth';
import { issueTrainerCode } from '@/lib/issue-code';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const initData = request.headers.get('x-telegram-init-data');
  if (!initData) {
    return NextResponse.json({ error: 'missing_init_data' }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[mini/partner/issue-code] TELEGRAM_BOT_TOKEN unset');
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const verify = verifyTelegramWebAppFresh(initData, botToken);
  if (!verify.ok) {
    if (verify.reason === 'expired_auth_data') {
      return NextResponse.json(
        {
          error: 'expired_auth_data',
          message: 'Please reopen the Mini App',
        },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: 'invalid_init_data' }, { status: 401 });
  }
  const tgUser = verify.user;

  let body: { label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Resolve trainer_id via trainer_telegram_links
  const { data: link, error: linkErr } = await supabase
    .from('trainer_telegram_links')
    .select('trainer_id')
    .eq('telegram_user_id', tgUser.id)
    .maybeSingle();

  if (linkErr) {
    console.error('[mini/partner/issue-code] link lookup failed:', linkErr);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!link) {
    return NextResponse.json({ error: 'not_linked' }, { status: 403 });
  }

  const trainerId = (link as { trainer_id: string }).trainer_id;

  // Authorization: only ACTIVE trainers may mint codes. The web route
  // (api/codes/generate) and the bot-secret route (via requireBotSecret) both
  // enforce this; the Mini App path must too. suspendTrainer/removeTrainer flip
  // trainers.status but do NOT delete the trainer_telegram_links row, so the
  // link stays live — without this check a suspended/removed trainer keeps
  // minting attribution codes through the Mini App.
  const { data: trainer, error: trainerErr } = await supabase
    .from('trainers')
    .select('status, max_clients')
    .eq('id', trainerId)
    .maybeSingle<{ status: string; max_clients: number }>();

  if (trainerErr) {
    console.error('[mini/partner/issue-code] trainer lookup failed:', trainerErr);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!trainer) {
    return NextResponse.json({ error: 'trainer_not_found' }, { status: 404 });
  }
  if (trainer.status !== 'active') {
    return NextResponse.json({ error: 'not_active' }, { status: 403 });
  }

  // Enforce the per-trainer client cap, matching api/codes/generate.
  const { count, error: countErr } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', trainerId);

  if (countErr) {
    console.error('[mini/partner/issue-code] client count failed:', countErr);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if ((count ?? 0) >= trainer.max_clients) {
    return NextResponse.json({ error: 'max_clients_reached' }, { status: 403 });
  }

  const outcome = await issueTrainerCode(supabase, trainerId, body.label ?? '');

  if (!outcome.ok) {
    switch (outcome.error.kind) {
      case 'label-required':
        return NextResponse.json({ error: 'label-required' }, { status: 400 });
      case 'label-too-long':
        return NextResponse.json({ error: 'label-too-long' }, { status: 400 });
      case 'db-error':
        return NextResponse.json({ error: outcome.error.message }, { status: 500 });
      case 'uniqueness-exhausted':
        return NextResponse.json(
          { error: 'could-not-generate-unique-code' },
          { status: 500 },
        );
    }
  }

  return NextResponse.json(outcome.result);
}
