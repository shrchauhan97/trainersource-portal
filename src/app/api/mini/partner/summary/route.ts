// src/app/api/mini/partner/summary/route.ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyTelegramWebAppFresh } from '@/lib/telegram-auth';
import {
  fetchTrainerCodes,
  fetchTrainerCommissions,
} from '@/lib/trainer-data';
import type { Trainer } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SummaryResponse = {
  trainer: {
    id: string;
    name: string;
    status: string;
  };
  earnings: {
    pending: number;
    approved: number;
    paid: number;
  };
  codes: Array<{
    id: string;
    code: string;
    displayStatus: 'active' | 'consumed' | 'expired';
    consumedByName: string | null;
    created_at: string;
    expires_at: string;
  }>;
  activeCodeCount: number;
  recruitment: {
    unlocked: boolean;
    consumedCount: number;
    threshold: number;
  };
};

const RECRUITMENT_THRESHOLD = 5; // matches Plan 4 §7 contract

export async function GET(req: Request) {
  const initData = req.headers.get('x-telegram-init-data');
  if (!initData) {
    return NextResponse.json({ error: 'missing_init_data' }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[mini/partner/summary] TELEGRAM_BOT_TOKEN unset');
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

  const supabase = createServiceClient();

  // Look up trainer_id from trainer_telegram_links (Plan 4 table)
  const { data: link, error: linkErr } = await supabase
    .from('trainer_telegram_links')
    .select('trainer_id')
    .eq('telegram_user_id', tgUser.id)
    .maybeSingle();

  if (linkErr) {
    console.error('[mini/partner/summary] link lookup failed:', linkErr);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!link) {
    return NextResponse.json({ error: 'not_linked' }, { status: 403 });
  }

  const trainerId = (link as { trainer_id: string }).trainer_id;

  // Load trainer record + codes + commissions in parallel
  const [trainerRes, codes, commissions] = await Promise.all([
    supabase.from('trainers').select('*').eq('id', trainerId).single(),
    fetchTrainerCodes(supabase, trainerId),
    fetchTrainerCommissions(supabase, trainerId),
  ]);

  if (trainerRes.error || !trainerRes.data) {
    return NextResponse.json({ error: 'trainer_not_found' }, { status: 404 });
  }

  const trainer = trainerRes.data as Trainer;

  // Recruitment status — unlocked when trainer has ≥ threshold consumed codes
  const consumedCount = codes.filter((c) => c.displayStatus === 'consumed').length;
  const activeCodes = codes.filter((c) => c.displayStatus === 'active');

  const payload: SummaryResponse = {
    trainer: {
      id: trainer.id,
      name: trainer.name ?? trainer.email ?? 'Trainer',
      status: trainer.status,
    },
    earnings: commissions.summary,
    codes: activeCodes.map((c) => ({
      id: c.id,
      code: c.code,
      displayStatus: c.displayStatus,
      consumedByName: c.consumedByName,
      created_at: c.created_at,
      expires_at: c.expires_at,
    })),
    activeCodeCount: activeCodes.length,
    recruitment: {
      unlocked: consumedCount >= RECRUITMENT_THRESHOLD,
      consumedCount,
      threshold: RECRUITMENT_THRESHOLD,
    },
  };

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
