import { normalizeSessionEmail } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Admin, Trainer, TrainerStatus } from '@/lib/types';

type UpdateTrainerBody = {
  trainerId?: string;
  status?: TrainerStatus;
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const sessionEmail = normalizeSessionEmail(user?.email);
  if (authError || !sessionEmail) {
    return { supabase, admin: null };
  }

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('*')
    .eq('email', sessionEmail)
    .maybeSingle<Admin>();

  if (adminError) {
    throw adminError;
  }

  return { supabase, admin };
}

export async function GET() {
  try {
    const { supabase, admin } = await requireAdmin();

    if (!admin) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { data, error } = await supabase
      .from('trainers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return json({ trainers: (data ?? []) as Trainer[] });
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

    const body = (await request.json()) as UpdateTrainerBody;
    const trainerId = body.trainerId?.trim();
    const status = body.status;
    const validStatuses: TrainerStatus[] = ['applied', 'onboarding', 'active', 'suspended'];

    if (!trainerId || !status || !validStatuses.includes(status)) {
      return json({ error: 'Invalid payload' }, 400);
    }

    const { data, error } = await supabase
      .from('trainers')
      .update({ status })
      .eq('id', trainerId)
      .select('*')
      .single<Trainer>();

    if (error) {
      throw error;
    }

    return json({ trainer: data });
  } catch (error) {
    console.error(error);
    return json({ error: 'Internal server error' }, 500);
  }
}
