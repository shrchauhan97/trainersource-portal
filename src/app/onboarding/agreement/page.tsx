import { loadTrainerOnboardingState } from '../_lib/state';
import { AgreementScreen } from './AgreementScreen';

// Step 3 server entry. Loads onboarding state then hands off to the client
// shell. Env-driven asset URLs (welcome video + agreement PDF) are read here
// so the client never sees the raw process.env access.
export default async function OnboardingAgreementPage() {
  const state = await loadTrainerOnboardingState();
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
