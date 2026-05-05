import Link from 'next/link';
import {
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEP_ORDER,
  ONBOARDING_STEP_PATHS,
  type OnboardingStep,
} from '../_lib/types';

type StepState = 'completed' | 'current' | 'locked';

function stepState(step: OnboardingStep, current: OnboardingStep): StepState {
  const stepIdx = ONBOARDING_STEP_ORDER.indexOf(step);
  const currentIdx = ONBOARDING_STEP_ORDER.indexOf(current);
  if (stepIdx < currentIdx) return 'completed';
  if (stepIdx === currentIdx) return 'current';
  return 'locked';
}

// 4-card stepper row matching the PDF mockup. Completed steps are filled
// blue; current is white with strong border; locked are pale blue. Locked
// steps render as inert spans, completed/current as Links.
export function Stepper({
  currentStep,
  activeStep,
}: {
  currentStep: OnboardingStep;
  activeStep: OnboardingStep;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {ONBOARDING_STEP_ORDER.map((step, idx) => {
        const state = stepState(step, currentStep);
        const isActiveScreen = step === activeStep;
        const label = ONBOARDING_STEP_LABELS[step];
        const path = ONBOARDING_STEP_PATHS[step];

        const className = [
          'relative rounded-[1.25rem] border px-5 py-5 text-left transition-all',
          isActiveScreen
            ? 'border-[#FF5722]/40 bg-white shadow-[0_18px_44px_rgba(45,79,103,0.16)]'
            : state === 'completed'
              ? 'border-[#41627B]/30 bg-[#bfe1fe] hover:bg-[#a8cbe7]'
              : state === 'current'
                ? 'border-[#41627B]/30 bg-white hover:bg-[#f6fbff]'
                : 'border-[#bfd9f0]/40 bg-[#bfe1fe]/40 cursor-not-allowed',
        ].join(' ');

        const content = (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D4F67]/56">
              Step {idx + 1}
            </p>
            <p className="mt-2 text-base font-extrabold uppercase tracking-tight text-[#173041]">
              {label}
            </p>
          </>
        );

        if (state === 'locked') {
          return (
            <span key={step} className={className} aria-disabled>
              {content}
            </span>
          );
        }

        return (
          <Link key={step} href={path} className={className}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
