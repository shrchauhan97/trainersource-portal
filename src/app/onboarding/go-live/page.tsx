import { loadTrainerOnboardingState } from '../_lib/state';
import { GoLiveScreen } from './GoLiveScreen';

export default async function OnboardingGoLivePage() {
  const state = await loadTrainerOnboardingState();
  return <GoLiveScreen trainerId={state.trainerId} />;
}
