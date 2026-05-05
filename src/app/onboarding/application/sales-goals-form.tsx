'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { saveSalesGoals, type SalesGoalsState } from './actions';
import type { TrainerOnboardingState } from '../_lib/types';
import { Cell, TextInput } from './contact-form';

const initial: SalesGoalsState = { ok: false };

const HEARD_ABOUT_OPTIONS = [
  { value: 'friend', label: 'Friend' },
  { value: 'social_media', label: 'Social media' },
  { value: 'search', label: 'Search' },
  { value: 'other', label: 'Other' },
] as const;

// SALES GOALS tab — final tab in Step 1.
//
// Save and finalize is a two-step action:
//   1. `saveSalesGoals` (form action) persists fields + uploads selfie video.
//   2. On `ok`, the parent's `onFinalize` runs `submitApplicationFinal`,
//      which stamps `application_submitted_at`, advances onboarding_step to
//      'training', and redirects to /onboarding/training.
//
// We split it because the file upload needs FormData; the finalize call is a
// pure side-effect with no body. Splitting keeps each server action focused.
export function SalesGoalsForm({
  initial: state,
  onFinalize,
  onBack,
  submitting,
  finalError,
}: {
  initial: TrainerOnboardingState;
  onFinalize: () => void;
  onBack: () => void;
  submitting: boolean;
  finalError: string | null;
}) {
  const [actionState, formAction] = useActionState(saveSalesGoals, initial);
  const previousOk = useRef(false);

  useEffect(() => {
    if (actionState.ok && !previousOk.current) {
      previousOk.current = true;
      onFinalize();
    }
    if (!actionState.ok) previousOk.current = false;
  }, [actionState, onFinalize]);

  const a = state.application;

  return (
    <form action={formAction} className="space-y-5" encType="multipart/form-data">
      <p className="text-sm leading-6 text-[#2D4F67]/80">
        Share your goals and motivations, so we can best understand how to support you.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Cell label="Client base — clients per month">
          <TextInput
            name="client_base_per_month"
            type="number"
            min={0}
            defaultValue={a?.client_base_per_month?.toString() ?? ''}
            placeholder="How many clients do you currently service per month?"
          />
        </Cell>
        <Cell label="Sales goal — products per month">
          <TextInput
            name="sales_goal_per_month"
            type="number"
            min={0}
            defaultValue={a?.sales_goal_per_month?.toString() ?? ''}
            placeholder="How many products from your chosen program might your clients need?"
          />
        </Cell>
      </div>

      <Cell label="How did you hear about TrainerSource?">
        <select
          name="heard_about_source"
          defaultValue={a?.heard_about_source ?? ''}
          className="w-full bg-transparent text-sm text-[#173041] outline-none"
        >
          <option value="">Select…</option>
          {HEARD_ABOUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Cell>

      <Cell label="Selfie video upload">
        <div className="space-y-2">
          <p className="text-xs text-[#2D4F67]/70">
            We&apos;d love to hear or see a short clip from you, describing your motivation in
            joining TrainerSource.
          </p>
          <input
            type="file"
            name="selfie_video"
            accept="video/*"
            className="block w-full text-xs text-[#173041]"
          />
          {a?.selfie_video_path ? (
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#2D4F67]/60">
              Existing upload on file — re-upload to replace.
            </p>
          ) : null}
        </div>
      </Cell>

      {actionState.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionState.error}</p>
      ) : null}
      {finalError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{finalError}</p>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-[#41627B]/30 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[#173041] transition hover:bg-[#eff6fb]"
        >
          Back
        </button>
        <NextButton finalizing={submitting} />
      </div>
    </form>
  );
}

function NextButton({ finalizing }: { finalizing: boolean }) {
  const { pending } = useFormStatus();
  const busy = pending || finalizing;
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex items-center justify-center rounded-full bg-[#173041] px-7 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#0f2230] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? 'Submitting…' : 'Next'}
    </button>
  );
}
