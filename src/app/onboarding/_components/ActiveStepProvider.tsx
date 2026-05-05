'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { OnboardingStep } from '../_lib/types';
import { ONBOARDING_STEP_PATHS } from '../_lib/types';

// Resolves the active step from the current URL path so the Stepper knows
// which card to highlight even when the trainer has free-navigation rights
// (visiting an earlier completed step).
function resolveActiveStep(pathname: string): OnboardingStep {
  for (const [step, path] of Object.entries(ONBOARDING_STEP_PATHS)) {
    if (pathname.startsWith(path)) return step as OnboardingStep;
  }
  return 'application';
}

export function ActiveStepProvider({
  children,
}: {
  children: (activeStep: OnboardingStep) => ReactNode;
}) {
  const pathname = usePathname();
  const active = resolveActiveStep(pathname ?? '/onboarding/application');
  return <>{children(active)}</>;
}
