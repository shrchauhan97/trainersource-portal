'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import type { TrainerPayoutDetails } from '../_lib/types';
import { markWelcomeVideoWatched, savePayoutDetails } from './actions';

const FIELD_LABEL_CLASS =
  'flex h-11 items-center bg-[#173041] px-4 text-[11px] font-bold uppercase tracking-[0.18em] text-white';
const FIELD_INPUT_CLASS =
  'h-11 w-full bg-white px-4 text-sm text-[#173041] placeholder:text-[#2D4F67]/40 focus:outline-none focus:ring-2 focus:ring-[#FF5722]/40';

type Row1Field = 'legal_first_name' | 'legal_last_name' | 'street1' | 'street2' | 'city' | 'country' | 'zip';
type Row2Field = 'bank_name' | 'branch_code' | 'account_number' | 'swift_code';

const ROW_1: { name: Row1Field; label: string }[] = [
  { name: 'legal_first_name', label: 'First Name' },
  { name: 'legal_last_name', label: 'Last Name' },
  { name: 'street1', label: 'Street 1' },
  { name: 'street2', label: 'Street 2' },
  { name: 'city', label: 'City' },
  { name: 'country', label: 'Country' },
  { name: 'zip', label: 'Zip' },
];

const ROW_2: { name: Row2Field; label: string }[] = [
  { name: 'bank_name', label: 'Bank Name' },
  { name: 'branch_code', label: 'Branch Code' },
  { name: 'account_number', label: 'Account Number' },
  { name: 'swift_code', label: 'SWIFT Code' },
];

type SaveState = { error?: string; success?: boolean } | null;

async function savePayoutAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  return savePayoutDetails(formData);
}

// Tab 1 of Step 3. Renders the welcome video plus the payout details form.
// The video's onPlay handler fires once to stamp welcome_video_watched_at;
// after that we don't bother re-firing because the action is idempotent.
export function WelcomeVideoTab({
  trainerId,
  videoUrl,
  payout,
  videoAlreadyWatched,
}: {
  trainerId: string;
  videoUrl: string | null;
  payout: TrainerPayoutDetails | null;
  videoAlreadyWatched: boolean;
}) {
  const [hasMarkedWatched, setHasMarkedWatched] = useState(videoAlreadyWatched);
  const [, startWatchTransition] = useTransition();
  const watchFiredRef = useRef(false);

  const [saveState, saveFormAction, savePending] = useActionState<SaveState, FormData>(
    savePayoutAction,
    null,
  );

  const handlePlay = () => {
    if (watchFiredRef.current || hasMarkedWatched) return;
    watchFiredRef.current = true;
    setHasMarkedWatched(true);
    startWatchTransition(async () => {
      const result = await markWelcomeVideoWatched();
      if (result.error) {
        // Roll back so a transient error lets the next play retry.
        watchFiredRef.current = false;
        setHasMarkedWatched(false);
      }
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm leading-6 text-[#173041]">
          We can&apos;t wait to work with you. We&apos;re so excited, we&apos;ve even made a video to welcome you aboard!
        </p>
      </div>

      <div className="overflow-hidden rounded-[1rem] border border-[#41627B]/20 bg-[#0f2230]">
        {videoUrl ? (
          <video
            controls
            preload="metadata"
            onPlay={handlePlay}
            className="aspect-video w-full bg-black"
            src={videoUrl}
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-[#0f2230] text-sm text-white/70">
            Welcome video coming soon.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm leading-6 text-[#173041]">
          To ensure you&apos;re paid, fill out the below information. Make sure the address and name you use perfectly matches your bank or crypto wallet records.
        </p>
        {hasMarkedWatched ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2D4F67]/72">
            Welcome video watched.
          </p>
        ) : null}
      </div>

      <form action={saveFormAction} className="space-y-6">
        <input type="hidden" name="trainerId" value={trainerId} />

        <PayoutGrid columns={ROW_1.length}>
          {ROW_1.map((field) => (
            <PayoutCell key={field.name} label={field.label}>
              <input
                name={field.name}
                defaultValue={(payout?.[field.name] as string | null) ?? ''}
                className={FIELD_INPUT_CLASS}
                autoComplete="off"
              />
            </PayoutCell>
          ))}
        </PayoutGrid>

        <PayoutGrid columns={ROW_2.length}>
          {ROW_2.map((field) => (
            <PayoutCell key={field.name} label={field.label}>
              <input
                name={field.name}
                defaultValue={(payout?.[field.name] as string | null) ?? ''}
                className={FIELD_INPUT_CLASS}
                autoComplete="off"
              />
            </PayoutCell>
          ))}
        </PayoutGrid>

        <PayoutGrid columns={1}>
          <PayoutCell label="Crypto Wallet Address">
            <input
              name="crypto_wallet_address"
              defaultValue={payout?.crypto_wallet_address ?? ''}
              className={FIELD_INPUT_CLASS}
              autoComplete="off"
            />
          </PayoutCell>
        </PayoutGrid>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {saveState?.error ? (
              <span className="font-semibold text-[#b3261e]">{saveState.error}</span>
            ) : saveState?.success ? (
              <span className="font-semibold text-[#1d6f42]">Payout details saved.</span>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={savePending}
            className="inline-flex items-center justify-center rounded-full border border-[#41627B]/30 bg-white px-6 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[#173041] transition hover:bg-[#bfe1fe]/60 disabled:opacity-60"
          >
            {savePending ? 'Saving…' : 'Save payout details'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PayoutGrid({ columns, children }: { columns: number; children: React.ReactNode }) {
  // Use inline grid-template-columns since arbitrary repeat counts don't exist
  // on the Tailwind preset. The dark navy header strip + white input strip
  // mimics the PDF "table" look.
  return (
    <div className="overflow-hidden rounded-[0.75rem] border border-[#41627B]/30">
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {children}
      </div>
    </div>
  );
}

function PayoutCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col border-r border-[#41627B]/20 last:border-r-0">
      <div className={FIELD_LABEL_CLASS}>{label}</div>
      <div className="border-t border-[#41627B]/15">{children}</div>
    </div>
  );
}
