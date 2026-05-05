'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TrainerOnboardingState } from '../_lib/types';

const Ctx = createContext<TrainerOnboardingState | null>(null);

// Thin client-side wrapper so step pages and form components can read the
// full onboarding snapshot without re-fetching. Server components always
// re-fetch via loadTrainerOnboardingState; this just hydrates the tree.
export function OnboardingStateProvider({
  state,
  children,
}: {
  state: TrainerOnboardingState;
  children: ReactNode;
}) {
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useOnboardingState(): TrainerOnboardingState {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error('useOnboardingState must be used inside OnboardingStateProvider');
  }
  return value;
}
