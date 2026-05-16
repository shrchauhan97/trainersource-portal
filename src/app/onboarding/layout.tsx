import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { loadTrainerOnboardingState } from './_lib/state';
import { OnboardingHeader } from './_components/OnboardingHeader';
import { Stepper } from './_components/Stepper';
import { OnboardingStateProvider } from './_components/OnboardingStateProvider';

export const dynamic = 'force-dynamic';

// T4.2/T4.3 — Onboarding is an authenticated multi-step flow. title.template
// lets each step page set a short title that resolves as e.g.
// "Application — TrainerSource Onboarding". noindex/nofollow because the URLs
// only resolve for the logged-in trainer they belong to.
export const metadata: Metadata = {
  title: {
    absolute: 'TrainerSource Onboarding',
    template: '%s — TrainerSource Onboarding',
  },
  robots: { index: false, follow: false },
};

// Layout is a server component. We used to wrap children in an
// ActiveStepProvider that took a render-prop function child, but Next.js 16
// rejects passing functions across the server/client boundary ("Functions
// cannot be passed directly to Client Components"). Stepper now reads the
// active step from usePathname internally — no render prop needed.
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const state = await loadTrainerOnboardingState();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,87,34,0.12),_transparent_30%),linear-gradient(180deg,#0f2230_0%,#173041_20%,#eff6fb_20%,#eff6fb_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <OnboardingHeader state={state} />

        <OnboardingStateProvider state={state}>
          <Stepper currentStep={state.currentStep} />
          <main className="pb-10">{children}</main>
        </OnboardingStateProvider>
      </div>
    </div>
  );
}
