import { describe, expect, it, vi } from 'vitest';

// next/navigation's redirect throws NEXT_REDIRECT to short-circuit the
// server component render. We mock it here so we can assert the call shape
// without setting up an actual Next request.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`__REDIRECT__:${url}`);
  }),
}));

vi.mock('server-only', () => ({}));

import { requireStepAccess } from '@/app/onboarding/_lib/stepGate';
import type {
  OnboardingStep,
  TrainerOnboardingState,
} from '@/app/onboarding/_lib/types';

function stateAt(currentStep: OnboardingStep): TrainerOnboardingState {
  return {
    trainerId: 't',
    trainerName: 'Tim',
    trainerEmail: 't@t.com',
    trainerCity: 'Singapore',
    trainerCountry: 'Singapore',
    status: 'onboarding',
    currentStep,
    application: null,
    qualifications: [],
    trainingProgress: [],
    payoutDetails: null,
    agreement: null,
  };
}

describe('requireStepAccess', () => {
  it('allows access when trainer is on the requested step', () => {
    expect(() => requireStepAccess(stateAt('training'), 'training')).not.toThrow();
  });

  it('allows access when trainer is past the requested step (revisiting)', () => {
    expect(() => requireStepAccess(stateAt('agreement'), 'application')).not.toThrow();
    expect(() => requireStepAccess(stateAt('go_live'), 'training')).not.toThrow();
  });

  it('redirects when trainer hasn’t reached the requested step yet', () => {
    expect(() => requireStepAccess(stateAt('application'), 'go_live')).toThrow(
      /__REDIRECT__:\/onboarding\/application/,
    );
    expect(() => requireStepAccess(stateAt('training'), 'agreement')).toThrow(
      /__REDIRECT__:\/onboarding\/training/,
    );
  });
});
