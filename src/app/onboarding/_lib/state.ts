import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type {
  OnboardingStep,
  TrainerOnboardingState,
} from './types';
import { ONBOARDING_STEP_ORDER } from './types';

// Loads everything an onboarding screen needs in one trip. Each step page
// calls this in its server component and renders its slice. Returns null when
// the user is unauthenticated, redirects when their status doesn't permit
// onboarding (already active, or suspended, or never applied).
export async function loadTrainerOnboardingState(): Promise<TrainerOnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: trainer } = await supabase
    .from('trainers')
    .select(
      'id, name, email, city, country, status, onboarding_step',
    )
    .eq('email', user.email)
    .maybeSingle();

  if (!trainer) {
    redirect('/apply');
  }

  if (trainer.status === 'active') {
    redirect('/dashboard');
  }

  if (trainer.status !== 'onboarding') {
    redirect('/onboarding/pending');
  }

  const [application, qualifications, training, payout, agreement] = await Promise.all([
    supabase
      .from('trainer_application_details')
      .select('*')
      .eq('trainer_id', trainer.id)
      .maybeSingle(),
    supabase
      .from('trainer_qualifications')
      .select('*')
      .eq('trainer_id', trainer.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('trainer_training_progress')
      .select('*')
      .eq('trainer_id', trainer.id),
    supabase
      .from('trainer_payout_details')
      .select('*')
      .eq('trainer_id', trainer.id)
      .maybeSingle(),
    supabase
      .from('trainer_agreement')
      .select('*')
      .eq('trainer_id', trainer.id)
      .maybeSingle(),
  ]);

  return {
    trainerId: trainer.id,
    trainerName: trainer.name,
    trainerEmail: trainer.email,
    trainerCity: trainer.city,
    trainerCountry: trainer.country,
    status: trainer.status,
    currentStep: (trainer.onboarding_step as OnboardingStep) ?? 'application',
    application: application.data ?? null,
    qualifications: qualifications.data ?? [],
    trainingProgress: training.data ?? [],
    payoutDetails: payout.data ?? null,
    agreement: agreement.data ?? null,
  };
}

// Updates onboarding_step. Step actions call this when the user finishes
// their step. We never advance backwards — a trainer who reaches go_live
// shouldn't accidentally drop back to training because they re-rendered an
// older form.
export async function advanceOnboardingStep(
  trainerId: string,
  to: OnboardingStep,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from('trainers')
    .select('onboarding_step')
    .eq('id', trainerId)
    .maybeSingle();

  if (!current) return { error: 'Trainer not found.' };

  const fromIdx = ONBOARDING_STEP_ORDER.indexOf(current.onboarding_step);
  const toIdx = ONBOARDING_STEP_ORDER.indexOf(to);

  if (toIdx < 0) return { error: 'Invalid step.' };
  if (toIdx <= fromIdx) return {}; // no-op when not advancing

  const { error } = await supabase
    .from('trainers')
    .update({ onboarding_step: to })
    .eq('id', trainerId);

  if (error) return { error: error.message };
  return {};
}
