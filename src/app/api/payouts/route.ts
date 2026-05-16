import { normalizeEmail } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Admin, Commission, Payout, PayoutStatus } from '@/lib/types';

type CreatePayoutBatchBody = {
  period_start?: string;
  period_end?: string;
};

type UpdatePayoutBody = {
  payoutId?: string;
  status?: PayoutStatus;
  wise_transfer_id?: string | null;
};

type ApprovedCommissionRow = Pick<Commission, 'id' | 'trainer_id' | 'amount' | 'created_at'>;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return { supabase, admin: null };
  }

  // T2.13: case-insensitive lookup for historic mixed-case admin rows.
  const email = normalizeEmail(user.email) ?? user.email;
  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('*')
    .ilike('email', email)
    .maybeSingle<Admin>();

  if (adminError) {
    throw adminError;
  }

  return { supabase, admin };
}

export async function POST(request: Request) {
  try {
    const { supabase, admin } = await requireAdmin();

    if (!admin) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = (await request.json()) as CreatePayoutBatchBody;
    const periodStart = body.period_start?.trim();
    const periodEnd = body.period_end?.trim();

    if (!periodStart || !periodEnd) {
      return json({ error: 'Invalid payload' }, 400);
    }

    const { data: commissions, error: commissionsError } = await supabase
      .from('commissions')
      .select('id, trainer_id, amount, created_at')
      .eq('status', 'approved')
      .is('payout_id', null)
      .gte('created_at', `${periodStart}T00:00:00.000Z`)
      .lte('created_at', `${periodEnd}T23:59:59.999Z`);

    if (commissionsError) {
      throw commissionsError;
    }

    const grouped = new Map<string, ApprovedCommissionRow[]>();

    for (const commission of (commissions ?? []) as ApprovedCommissionRow[]) {
      const trainerCommissions = grouped.get(commission.trainer_id) ?? [];
      trainerCommissions.push(commission);
      grouped.set(commission.trainer_id, trainerCommissions);
    }

    const createdPayouts: Payout[] = [];

    for (const [trainerId, trainerCommissions] of grouped.entries()) {
      const total = trainerCommissions.reduce((sum, commission) => sum + Number(commission.amount), 0);

      const { data: payout, error: payoutError } = await supabase
        .from('payouts')
        .insert({
          trainer_id: trainerId,
          total: Number(total.toFixed(2)),
          status: 'pending',
          period_start: periodStart,
          period_end: periodEnd,
        })
        .select('*')
        .single<Payout>();

      if (payoutError) {
        throw payoutError;
      }

      const commissionIds = trainerCommissions.map((commission) => commission.id);
      const { error: updateCommissionsError } = await supabase
        .from('commissions')
        .update({ payout_id: payout.id })
        .in('id', commissionIds);

      if (updateCommissionsError) {
        throw updateCommissionsError;
      }

      createdPayouts.push(payout);
    }

    return json({ payouts: createdPayouts });
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, admin } = await requireAdmin();

    if (!admin) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = (await request.json()) as UpdatePayoutBody;
    const payoutId = body.payoutId?.trim();
    const status = body.status;
    const validStatuses: PayoutStatus[] = ['pending', 'sent', 'confirmed'];

    if (!payoutId || !status || !validStatuses.includes(status)) {
      return json({ error: 'Invalid payload' }, 400);
    }

    const updatePayload: { status: PayoutStatus; wise_transfer_id?: string | null } = { status };

    if (Object.hasOwn(body, 'wise_transfer_id')) {
      updatePayload.wise_transfer_id = body.wise_transfer_id ?? null;
    }

    const { data, error } = await supabase
      .from('payouts')
      .update(updatePayload)
      .eq('id', payoutId)
      .select('*')
      .single<Payout>();

    if (error) {
      throw error;
    }

    return json({ payout: data });
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
}
