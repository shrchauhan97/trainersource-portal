import { loadTrainerOnboardingState } from '../_lib/state';
import { requireStepAccess } from '../_lib/stepGate';
import { GoLiveScreen } from './GoLiveScreen';

// Step 4 — gates trainers who haven't reached this step server-side so the
// browser address bar can't be used to skip Application/Training/Agreement.
export default async function OnboardingGoLivePage() {
  const state = await loadTrainerOnboardingState();
  requireStepAccess(state, 'go_live');
  return <GoLiveScreen trainerId={state.trainerId} />;
}
