'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { safeError } from '../_lib/errors';
import { uploadOnboardingFile } from '../_lib/storage';
import { advanceOnboardingStep } from '../_lib/state';
import { ONBOARDING_STEP_PATHS } from '../_lib/types';

// Resolves the current onboarding trainer from the auth session. We never
// accept a client-supplied trainerId for writes — it's always derived from
// the authenticated email match. This blocks "operate on another trainer's
// row by passing their UUID" in every step-3 action.
async function resolveOnboardingTrainer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'You must be signed in.' as const };

  const { data: trainer } = await supabase
    .from('trainers')
    .select('id, status')
    .eq('email', user.email)
    .maybeSingle();

  if (!trainer) return { error: 'Unable to verify your onboarding session.' as const };
  if (trainer.status !== 'onboarding') {
    return { error: 'Your onboarding status is no longer eligible.' as const };
  }
  return { supabase, trainerId: trainer.id as string };
}

// Stamps welcome_video_watched_at the first time the trainer presses play.
// Idempotent: skip the upsert if already stamped.
export async function markWelcomeVideoWatched(): Promise<{ error?: string }> {
  const session = await resolveOnboardingTrainer();
  if ('error' in session) return { error: session.error };
  const { supabase, trainerId } = session;

  const { data: existing } = await supabase
    .from('trainer_agreement')
    .select('welcome_video_watched_at')
    .eq('trainer_id', trainerId)
    .maybeSingle();

  if (existing?.welcome_video_watched_at) {
    return {};
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('trainer_agreement')
    .upsert(
      {
        trainer_id: trainerId,
        welcome_video_watched_at: now,
        updated_at: now,
      },
      { onConflict: 'trainer_id' },
    );

  if (error) return { error: safeError('markWelcomeVideoWatched', error) };

  revalidatePath('/onboarding/agreement');
  return {};
}

// Upserts payout details. We accept partial fields — final validation happens
// at submitAgreementFinal, since trainers may save and come back.
export async function savePayoutDetails(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await resolveOnboardingTrainer();
  if ('error' in session) return { error: session.error };
  const { supabase, trainerId } = session;

  const str = (key: string) => {
    const value = formData.get(key);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const payload = {
    trainer_id: trainerId,
    legal_first_name: str('legal_first_name'),
    legal_last_name: str('legal_last_name'),
    street1: str('street1'),
    street2: str('street2'),
    city: str('city'),
    country: str('country'),
    zip: str('zip'),
    bank_name: str('bank_name'),
    branch_code: str('branch_code'),
    account_number: str('account_number'),
    swift_code: str('swift_code'),
    crypto_wallet_address: str('crypto_wallet_address'),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('trainer_payout_details')
    .upsert(payload, { onConflict: 'trainer_id' });

  if (error) return { error: safeError('savePayoutDetails', error) };

  revalidatePath('/onboarding/agreement');
  return { success: true };
}

// Uploads the signed PDF to storage and stamps the row. PDF-only via the
// validateUpload allowlist; trainerId always resolved from session.
export async function uploadSignedAgreement(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await resolveOnboardingTrainer();
  if ('error' in session) return { error: session.error };
  const { supabase, trainerId } = session;

  const file = formData.get('signed_agreement');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Please choose a file.' };
  }

  const upload = await uploadOnboardingFile(trainerId, file, 'signed_agreement');
  if ('error' in upload) return { error: upload.error };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('trainer_agreement')
    .upsert(
      {
        trainer_id: trainerId,
        signed_agreement_path: upload.path,
        signed_at: now,
        updated_at: now,
      },
      { onConflict: 'trainer_id' },
    );

  if (error) return { error: safeError('uploadSignedAgreement', error) };

  revalidatePath('/onboarding/agreement');
  return { success: true };
}

// Final submission. Validates that payout details have either a bank pair
// (bank_name + account_number) OR a crypto wallet, and that the signed
// agreement is uploaded. On success, advances the trainer to go_live.
export async function submitAgreementFinal(): Promise<{ error?: string }> {
  const session = await resolveOnboardingTrainer();
  if ('error' in session) return { error: session.error };
  const { supabase, trainerId } = session;

  const [{ data: payout }, { data: agreement }] = await Promise.all([
    supabase
      .from('trainer_payout_details')
      .select('bank_name, account_number, crypto_wallet_address')
      .eq('trainer_id', trainerId)
      .maybeSingle(),
    supabase
      .from('trainer_agreement')
      .select('signed_agreement_path')
      .eq('trainer_id', trainerId)
      .maybeSingle(),
  ]);

  const bankPairOk = Boolean(
    payout?.bank_name && payout.bank_name.trim().length > 0 &&
    payout?.account_number && payout.account_number.trim().length > 0,
  );
  const cryptoOk = Boolean(
    payout?.crypto_wallet_address && payout.crypto_wallet_address.trim().length > 0,
  );

  if (!bankPairOk && !cryptoOk) {
    return {
      error: 'Add either bank details (bank name + account number) or a crypto wallet address.',
    };
  }
  if (!agreement?.signed_agreement_path) {
    return { error: 'Upload your signed agreement before continuing.' };
  }

  const advance = await advanceOnboardingStep(trainerId, 'go_live');
  if (advance.error) return { error: advance.error };

  revalidatePath('/onboarding');
  redirect(ONBOARDING_STEP_PATHS.go_live);
}
