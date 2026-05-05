'use client';

import { useState, useTransition } from 'react';
import { SubTabs } from '../_components/SubTabs';
import type { TrainerAgreement, TrainerPayoutDetails } from '../_lib/types';
import { WelcomeVideoTab } from './welcome-video-tab';
import { AgreementTab } from './agreement-tab';
import { submitAgreementFinal } from './actions';

const TABS = [
  { key: 'welcome', label: 'Welcome Video' },
  { key: 'agreement', label: 'Info & Agreement' },
];

// Step 3 client shell. Owns SubTabs and the bottom-right NEXT button.
// Final submit calls submitAgreementFinal which validates payout details +
// signed-agreement upload, advances onboarding_step to go_live, and redirects.
export function AgreementScreen({
  trainerId,
  welcomeVideoUrl,
  agreementPdfUrl,
  payout,
  agreement,
}: {
  trainerId: string;
  welcomeVideoUrl: string | null;
  agreementPdfUrl: string | null;
  payout: TrainerPayoutDetails | null;
  agreement: TrainerAgreement | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleNext = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitAgreementFinal();
      if (result?.error) {
        setError(result.error);
      }
      // On success the action calls redirect(), which throws, so we never
      // reach a "happy path" branch on this side — pending stays true until
      // navigation.
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2D4F67]/56">Step 3 — Agreement</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-[#173041]">
          Welcome video, payout details, and your signed agreement
        </h2>
      </div>

      <SubTabs tabs={TABS} initialKey="welcome">
        {(active) =>
          active === 'welcome' ? (
            <WelcomeVideoTab
              trainerId={trainerId}
              videoUrl={welcomeVideoUrl}
              payout={payout}
              videoAlreadyWatched={Boolean(agreement?.welcome_video_watched_at)}
            />
          ) : (
            <AgreementTab
              trainerId={trainerId}
              pdfUrl={agreementPdfUrl}
              agreement={agreement}
            />
          )
        }
      </SubTabs>

      <div className="flex flex-col items-end gap-2">
        {error ? (
          <p className="text-sm font-semibold text-[#b3261e]">{error}</p>
        ) : null}
        <button
          type="button"
          onClick={handleNext}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full bg-[#FF5722] px-8 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-[0_18px_44px_rgba(255,87,34,0.32)] transition hover:bg-[#e44a18] disabled:opacity-60"
        >
          {pending ? 'Submitting…' : 'Next'}
        </button>
      </div>
    </div>
  );
}
