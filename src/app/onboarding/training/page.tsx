import { loadTrainerOnboardingState } from '../_lib/state';
import { requireStepAccess } from '../_lib/stepGate';
import { TrainingScreen } from './TrainingScreen';

// Step 2 — Training. Loads server state then hands off to the client wrapper
// so the SubTabs (Videos / Quiz) can manage local UI state. requireStepAccess
// bounces a trainer back to step 1 if they haven't submitted their application.
export default async function OnboardingTrainingPage() {
  const state = await loadTrainerOnboardingState();
  requireStepAccess(state, 'training');
  return <TrainingScreen state={state} />;
}
