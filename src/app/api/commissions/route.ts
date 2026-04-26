import { createClient } from '@/lib/supabase/server';
import type { Admin, Trainer } from '@/lib/types';

type CommissionFilters = {
  trainer_id?: string;
  status?: 'pending' | 'approved' | 'paid';
  payout_id?: string;
};

type BulkApproveBody = {
  commissionIds?: string[];
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return { supabase, admin: null, trainer: null };
  }

  const [adminResult, trainerResult] = await Promise.all([
    supabase.from('admins').select('*').eq('email', user.email).maybeSingle<Admin>(),
    supabase.from('trainers').select('*').eq('email', user.email).maybeSingle<Trainer>(),
  ]);

  if (adminResult.error) {
    throw adminResult.error;
  }

  if (trainerResult.error) {
    throw trainerResult.error;
  }

  return { supabase, admin: adminResult.data, trainer: trainerResult.data };
}

export async function GET(request: Request) {
  try {
    const { supabase, admin, trainer } = await getActor();

    if (!admin && !trainer) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { searchParams } = new URL(request.url);
    const filters: CommissionFilters = {
      trainer_id: searchParams.get('trainer_id') ?? undefined,
      status: (searchParams.get('status') as CommissionFilters['status'] | null) ?? undefined,
      payout_id: searchParams.get('payout_id') ?? undefined,
    };

    let query = supabase.from('commissions').select('*').order('created_at', { ascending: false });

    if (admin) {
      if (filters.trainer_id) {
        query = query.eq('trainer_id', filters.trainer_id);
      }
    } else if (trainer) {
      query = query.eq('trainer_id', trainer.id);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.payout_id) {
      query = query.eq('payout_id', filters.payout_id);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return json({ commissions: data ?? [] });
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, admin } = await getActor();

    if (!admin) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = (await request.json()) as BulkApproveBody;
    const commissionIds = (body.commissionIds ?? []).filter(
      (commissionId): commissionId is string => typeof commissionId === 'string' && commissionId.length > 0
    );

    if (commissionIds.length === 0) {
      return json({ error: 'Invalid payload' }, 400);
    }

    const { data, error } = await supabase
      .from('commissions')
      .update({ status: 'approved' })
      .in('id', commissionIds)
      .eq('status', 'pending')
      .select('*');

    if (error) {
      throw error;
    }

    return json({ commissions: data ?? [] });
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
}
