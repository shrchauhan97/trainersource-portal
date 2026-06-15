'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { normalizeSessionEmail } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { notifyAdminsOfOnboardingCompletion } from './notify-admins';
import type { OnboardingStep } from '../_lib/types';

// Distinct quiz questions the trainer must have answered correctly to pass
// the training step. Mirrors the modules defined in the training step.
const REQUIRED_QUIZ_DISTINCT_CORRECT = 5;
const REQUIRED_TRAINING_MODULES: ReadonlyArray<string> = [
  'peptides_intro',
  'retatrutide',
  'copper',
  'purity',
  'never_selling',
];

export type GoLiveResult =
  | { ok: true }
  | { ok: false; error: string; incompleteStep?: OnboardingStep };

// Server Action that flips a trainer from 'onboarding' → 'onboarding_completed'
// once every prior step is complete. Admin activation happens later.
export async function completeOnboardingV2(trainerId: string): Promise<GoLiveResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sessionEmail = normalizeSessionEmail(user?.email);
  if (!sessionEmail) {
    return { ok: false, error: 'You must be signed in to go live.' };
  }

  // Verify the trainer record belongs to the signed-in user before mutating
  // anything; the trainerId arrives from the client and must be authenticated.
  const { data: trainer, error: trainerLookupError } = await supabase
    .from('trainers')
    .select('id, name, email, city, status')
    .eq('id', trainerId)
    .eq('email', sessionEmail)
    .maybeSingle();

  if (trainerLookupError || !trainer) {
    return { ok: false, error: 'Unable to verify your onboarding session.' };
  }

  if (trainer.status === 'active') {
    redirect('/dashboard');
  }

  if (trainer.status === 'onboarding_completed') {
    redirect('/onboarding');
  }

  if (trainer.status !== 'onboarding') {
    return {
      ok: false,
      error: 'Your onboarding status is no longer eligible for completion.',
    };
  }

  

  // Pull every gating record in parallel — completion validation needs all of
  // them and we'd rather pay one round trip than four.
  const [application, training, quiz, payout, agreement] = await Promise.all([
    supabase
      .from('trainer_application_details')
      .select('application_submitted_at')
      .eq('trainer_id', trainerId)
      .maybeSingle(),
    supabase
      .from('trainer_training_progress')
      .select('module_id, watched_at')
      .eq('trainer_id', trainerId),
    supabase
      .from('trainer_quiz_attempts')
      .select('question_key, is_correct')
      .eq('trainer_id', trainerId)
      .eq('is_correct', true),
    supabase
      .from('trainer_payout_details')
      .select('account_number, crypto_wallet_address')
      .eq('trainer_id', trainerId)
      .maybeSingle(),
    supabase
      .from('trainer_agreement')
      .select('signed_agreement_path')
      .eq('trainer_id', trainerId)
      .maybeSingle(),
  ]);

  // Distinguish a real DB/RLS error from "row not found". Treating a
  // transient failure as "incomplete step" silently misroutes the trainer
  // back to a step they already finished.
  if (
    application.error ||
    training.error ||
    quiz.error ||
    payout.error ||
    agreement.error
  ) {
    return {
      ok: false,
      error:
        'We could not load your onboarding state. Please try again, or contact support if this keeps happening.',
    };
  }

  if (!application.data?.application_submitted_at) {
    return {
      ok: false,
      error: 'You haven’t submitted your application yet.',
      incompleteStep: 'application',
    };
  }

  const watchedModuleIds = new Set(
    (training.data ?? [])
      .filter((row) => Boolean(row.watched_at))
      .map((row) => row.module_id),
  );
  const allModulesWatched = REQUIRED_TRAINING_MODULES.every((moduleId) =>
    watchedModuleIds.has(moduleId),
  );

  if (!allModulesWatched) {
    return {
      ok: false,
      error: 'You still have training modules to watch.',
      incompleteStep: 'training',
    };
  }

  const distinctCorrect = new Set(
    (quiz.data ?? []).map((attempt) => attempt.question_key),
  );

  if (distinctCorrect.size < REQUIRED_QUIZ_DISTINCT_CORRECT) {
    return {
      ok: false,
      error: 'Finish the knowledge check before going live.',
      incompleteStep: 'training',
    };
  }

  const hasPayout = Boolean(
    payout.data?.account_number || payout.data?.crypto_wallet_address,
  );

  if (!hasPayout) {
    return {
      ok: false,
      error: 'Add bank or crypto payout details before going live.',
      incompleteStep: 'agreement',
    };
  }

  if (!agreement.data?.signed_agreement_path) {
    return {
      ok: false,
      error: 'Sign the Affiliate Agreement before going live.',
      incompleteStep: 'agreement',
    };
  }

  const { error: updateError } = await supabase
    .from('trainers')
    .update({
      status: 'onboarding_completed',
      onboarding_step: 'go_live',
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', trainerId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await notifyAdminsOfOnboardingCompletion({
    trainerId: trainer.id,
    trainerName: trainer.name,
    trainerEmail: trainer.email,
    city: trainer.city,
    signedAgreementPath: agreement.data?.signed_agreement_path ?? '',
  });

  revalidatePath('/onboarding');
  revalidatePath('/dashboard');

  redirect('/onboarding');
}
