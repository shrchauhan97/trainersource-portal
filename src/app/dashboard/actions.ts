'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CODE_EXPIRY_DAYS, CODE_LENGTH } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import {
  fetchTrainerClients,
  fetchTrainerCodes,
  fetchTrainerCommissions,
  type TrainerClientRow,
  type TrainerCodeRow,
  type TrainerCommissionRow,
  type TrainerCommissionSummary,
  type TrainerCommissionsPayload,
} from '@/lib/trainer-data';
import type { Trainer } from '@/lib/types';

export type GenerateCodeActionState = {
  success: boolean;
  message: string | null;
  code: string | null;
};

export type DashboardStats = {
  trainer: Trainer;
  totalClients: number;
  activeCodes: number;
  pendingCommission: number;
  totalEarned: number;
};

// Re-export for backward compatibility — existing UI imports these names.
export type DashboardCodeRow = TrainerCodeRow;
export type DashboardClientRow = TrainerClientRow;
export type DashboardCommissionRow = TrainerCommissionRow;
export type DashboardCommissionSummary = TrainerCommissionSummary;

const initialGenerateCodeState: GenerateCodeActionState = {
  success: false,
  message: null,
  code: null,
};

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));

  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

async function getTrainerBySession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect('/login');
  }

  const { data: trainer, error } = await supabase
    .from('trainers')
    .select('*')
    .eq('email', user.email)
    .single();

  if (error || !trainer) {
    redirect('/apply');
  }

  return { supabase, trainer: trainer as Trainer };
}

// Returns the signed-in trainer regardless of activation status. The dashboard
// shell renders for onboarding trainers too — tabs are greyed and a MY
// ONBOARDING CTA leads them back to /onboarding (PDF screen 1). Mutating
// actions still gate themselves on `trainer.status === 'active'`.
export async function requireTrainerSession() {
  const { supabase, trainer } = await getTrainerBySession();
  return { supabase, trainer };
}

// Strict variant — throws if the signed-in trainer is not active. Reach for
// this in any mutation/action that should not run during onboarding (e.g.
// generating codes, editing settings).
export async function requireActiveTrainer() {
  const { supabase, trainer } = await getTrainerBySession();
  if (trainer.status !== 'active') {
    throw new Error('Finish onboarding before performing this action.');
  }
  return { supabase, trainer };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function generateAccessCode(
  _previousState: GenerateCodeActionState = initialGenerateCodeState
) {
  const { supabase, trainer } = await requireTrainerSession();

  if (trainer.status !== 'active') {
    return {
      success: false,
      message: 'Finish onboarding before generating codes.',
      code: null,
    } satisfies GenerateCodeActionState;
  }

  let generatedCode = '';

  for (let attempt = 0; attempt < 10; attempt += 1) {
    generatedCode = randomCode();

    const { data: existingCode } = await supabase
      .from('access_codes')
      .select('id')
      .eq('code', generatedCode)
      .maybeSingle();

    if (!existingCode) {
      break;
    }
  }

  if (!generatedCode) {
    return {
      success: false,
      message: 'Unable to generate a unique code right now.',
      code: null,
    } satisfies GenerateCodeActionState;
  }

  const expiresAt = addDays(new Date(), CODE_EXPIRY_DAYS).toISOString();

  const { error } = await supabase.from('access_codes').insert({
    code: generatedCode,
    type: 'trainer',
    trainer_id: trainer.id,
    expires_at: expiresAt,
    status: 'active',
  });

  if (error) {
    return {
      success: false,
      message: error.message,
      code: null,
    } satisfies GenerateCodeActionState;
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/codes');

  return {
    success: true,
    message: `Code ${generatedCode} is live for ${CODE_EXPIRY_DAYS} days.`,
    code: generatedCode,
  } satisfies GenerateCodeActionState;
}

export async function getTrainerStats(): Promise<DashboardStats> {
  const { supabase, trainer } = await requireTrainerSession();
  const nowIso = new Date().toISOString();

  const [{ count: totalClients }, { count: activeCodesCount }, { data: commissions, error: commissionsError }] =
    await Promise.all([
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', trainer.id),
      supabase
        .from('access_codes')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', trainer.id)
        .eq('status', 'active')
        .gt('expires_at', nowIso),
      supabase.from('commissions').select('amount, status').eq('trainer_id', trainer.id),
    ]);

  if (commissionsError) {
    throw new Error(commissionsError.message);
  }

  const pendingCommission = (commissions ?? []).reduce((total, commission) => {
    return commission.status === 'pending' ? total + Number(commission.amount) : total;
  }, 0);

  const totalEarned = (commissions ?? []).reduce((total, commission) => {
    return total + Number(commission.amount);
  }, 0);

  return {
    trainer,
    totalClients: totalClients ?? 0,
    activeCodes: activeCodesCount ?? 0,
    pendingCommission,
    totalEarned,
  };
}

export async function getTrainerCodes(): Promise<DashboardCodeRow[]> {
  const { supabase, trainer } = await requireTrainerSession();
  return fetchTrainerCodes(supabase, trainer.id);
}

export async function getTrainerClients(): Promise<DashboardClientRow[]> {
  const { supabase, trainer } = await requireTrainerSession();
  return fetchTrainerClients(supabase, trainer.id);
}

export async function getTrainerCommissions(): Promise<TrainerCommissionsPayload> {
  const { supabase, trainer } = await requireTrainerSession();
  return fetchTrainerCommissions(supabase, trainer.id);
}
