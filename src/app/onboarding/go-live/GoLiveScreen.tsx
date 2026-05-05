'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ONBOARDING_STEP_PATHS, type OnboardingStep } from '../_lib/types';
import { completeOnboardingV2 } from './actions';

type GoLiveScreenProps = {
  trainerId: string;
};

type FeedbackState = {
  message: string;
  incompleteStep?: OnboardingStep;
} | null;

export function GoLiveScreen({ trainerId }: GoLiveScreenProps) {
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isPending, startTransition] = useTransition();

  // The action redirects on success, so the component effectively unmounts
  // before we'd ever observe a `{ ok: true }` return — feedback only ever
  // shows the failure case.
  const handleGoLive = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await completeOnboardingV2(trainerId);
      if (result && !result.ok) {
        setFeedback({
          message: result.error,
          incompleteStep: result.incompleteStep,
        });
      }
    });
  };

  return (
    <div className="rounded-[1.75rem] border border-[#41627B]/15 bg-white px-6 py-12 text-[#173041] shadow-[0_24px_60px_rgba(45,79,103,0.10)] sm:px-12 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#FF5722]">
          Step 4 — Go Live
        </p>

        <h2 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
          You’ve applied, trained and signed.
        </h2>

        <p className="mt-5 text-base leading-7 text-[#2D4F67]/80 sm:text-lg">
          Just hit “go live” and you’ll start your Affiliate selling journey.
        </p>

        <p className="mt-4 text-base leading-7 text-[#2D4F67]/80 sm:text-lg">
          You’ll receive a welcome pack and a few free samples, along with more
          onboarding material (aka how to generate codes, etc).
        </p>

        <p className="mt-4 text-base leading-7 text-[#2D4F67]/80 sm:text-lg">
          Remember – new affiliates have five weeks to reach their first
          (minimum) five sales, so start referring clients right away after
          going live.
        </p>

        {feedback ? (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">
            <p>{feedback.message}</p>
            {feedback.incompleteStep ? (
              <Link
                href={ONBOARDING_STEP_PATHS[feedback.incompleteStep]}
                className="mt-2 inline-flex items-center gap-1 text-sm font-bold uppercase tracking-[0.16em] text-red-800 underline-offset-4 hover:underline"
              >
                Finish that step →
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={handleGoLive}
            aria-disabled={isPending}
            className={`inline-flex items-center justify-center rounded-full px-12 py-5 text-lg font-black uppercase tracking-[0.22em] text-white shadow-[0_24px_50px_rgba(255,87,34,0.32)] transition ${
              isPending
                ? 'cursor-not-allowed bg-[#FF5722]/60'
                : 'bg-[#FF5722] hover:bg-[#e64a19]'
            }`}
          >
            {isPending ? 'Going live…' : 'Go Live'}
          </button>
        </div>
      </div>
    </div>
  );
}
