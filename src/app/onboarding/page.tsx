import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadTrainerOnboardingState } from './_lib/state';
import { ONBOARDING_STEP_PATHS } from './_lib/types';
import { UnderReviewScreen } from './UnderReviewScreen';

// Bare /onboarding redirects to whichever step the trainer is currently on.
// When onboarding is complete but activation is pending, show the review screen.
export default async function OnboardingIndexPage() {
  // Quick status check before loading full state — the full loader rejects
  // non-'onboarding' statuses, so we need to intercept 'onboarding_completed'
  // first to show the under-review screen.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user?.email) {
    const { data: trainer } = await supabase
      .from('trainers')
      .select('status')
      .eq('email', user.email)
      .maybeSingle();

    if (trainer?.status === 'onboarding_completed') {
      return <UnderReviewScreen />;
    }
  }

  const state = await loadTrainerOnboardingState();
  redirect(ONBOARDING_STEP_PATHS[state.currentStep]);
}
