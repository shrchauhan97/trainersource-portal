import type { Metadata } from 'next';
import { loadTrainerOnboardingState } from '../_lib/state';
import { requireStepAccess } from '../_lib/stepGate';
import { AgreementScreen } from './AgreementScreen';

export const metadata: Metadata = { title: 'Agreement' };

// Step 3 server entry. Loads onboarding state then hands off to the client
// shell. Env-driven asset URLs (welcome video + agreement PDF) are read here
// so the client never sees the raw process.env access. requireStepAccess
// gates direct URL access from a trainer who hasn't completed training.
export default async function OnboardingAgreementPage() {
  const state = await loadTrainerOnboardingState();
  requireStepAccess(state, 'agreement');
  const welcomeVideoUrl = process.env.NEXT_PUBLIC_AGREEMENT_WELCOME_VIDEO ?? null;
  const agreementPdfUrl = process.env.NEXT_PUBLIC_AGREEMENT_PDF_URL ?? null;

  return (
    <AgreementScreen
      trainerId={state.trainerId}
      welcomeVideoUrl={welcomeVideoUrl}
      agreementPdfUrl={agreementPdfUrl}
      payout={state.payoutDetails}
      agreement={state.agreement}
    />
  );
}
