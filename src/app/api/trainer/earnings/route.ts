// src/app/api/trainer/earnings/route.ts
import { NextResponse } from 'next/server';
import { requireBotSecret } from '@/lib/bot-auth';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

function currentPeriodStart(ref: Date = new Date()): Date {
  // Bi-weekly periods anchored to Mondays. Find the most recent Monday
  // with (weeks-since-epoch) even → period-start; otherwise back up one more week.
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dow = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  const weekIdx = Math.floor((monday.getTime() - Date.UTC(2024, 0, 1)) / (7 * 86400 * 1000));
  if (weekIdx % 2 !== 0) monday.setUTCDate(monday.getUTCDate() - 7);
  return monday;
}

function nextPayoutDate(ref: Date = new Date()): Date {
  const start = currentPeriodStart(ref);
  const next = new Date(start);
  next.setUTCDate(start.getUTCDate() + 14);
  return next;
}

export async function GET(request: Request) {
  const supabase = createServiceClient();
  const auth = await requireBotSecret(request, supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const periodStart = currentPeriodStart().toISOString();

  const { data: commissions, error: commErr } = await supabase
    .from('commissions')
    .select('amount, status, created_at')
    .eq('trainer_id', auth.trainerId)
    .gte('created_at', periodStart) as unknown as {
      data: { amount: number; status: string; created_at: string }[] | null;
      error: { message: string } | null;
    };
  if (commErr) return NextResponse.json({ error: commErr.message }, { status: 500 });

  const currentPeriodTotal = (commissions ?? []).reduce(
    (sum, c) => sum + Number(c.amount ?? 0),
    0,
  );

  const { data: lastPayout } = await supabase
    .from('payouts')
    .select('total, period_start, period_end, status')
    .eq('trainer_id', auth.trainerId)
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle<{
      total: number;
      period_start: string;
      period_end: string;
      status: string;
    }>();

  return NextResponse.json({
    current_period_total: Number(currentPeriodTotal.toFixed(2)),
    current_period_start: periodStart,
    last_payout: lastPayout
      ? {
          total: Number(lastPayout.total),
          period_start: lastPayout.period_start,
          period_end: lastPayout.period_end,
          status: lastPayout.status,
        }
      : null,
    next_payout_date: nextPayoutDate().toISOString().slice(0, 10),
  });
}
