import { loadTrainerOnboardingState } from '../_lib/state';
import { ApplicationForm } from './ApplicationForm';

// Step 1 — Application. Renders the 3 sub-tabs (CONTACT / QUALIFICATIONS /
// SALES GOALS) inside a single card. Server component only loads state and
// hands off to the client form component for tab switching + per-tab actions.
export default async function OnboardingApplicationPage() {
  const state = await loadTrainerOnboardingState();
  return <ApplicationForm initial={state} />;
}
