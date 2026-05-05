import 'server-only';
import { redirect } from 'next/navigation';
import {
  ONBOARDING_STEP_ORDER,
  ONBOARDING_STEP_PATHS,
  type OnboardingStep,
} from './types';
import type { TrainerOnboardingState } from './types';

// Each step page calls this with its own step. If the trainer's currentStep
// is earlier than the requested page, we bounce them to where they actually
// are. Without this, a trainer could open /onboarding/go-live in a browser
// tab and skip training/agreement entirely.
export function requireStepAccess(
  state: TrainerOnboardingState,
  requested: OnboardingStep,
): void {
  const currentIdx = ONBOARDING_STEP_ORDER.indexOf(state.currentStep);
  const requestedIdx = ONBOARDING_STEP_ORDER.indexOf(requested);

  if (currentIdx < requestedIdx) {
    redirect(ONBOARDING_STEP_PATHS[state.currentStep]);
  }
}
