import { redirect } from 'next/navigation';
import { loadTrainerOnboardingState } from './_lib/state';
import { ONBOARDING_STEP_PATHS } from './_lib/types';

// Bare /onboarding redirects to whichever step the trainer is currently on.
// The layout takes care of auth/state checks before this runs.
export default async function OnboardingIndexPage() {
  const state = await loadTrainerOnboardingState();
  redirect(ONBOARDING_STEP_PATHS[state.currentStep]);
}
