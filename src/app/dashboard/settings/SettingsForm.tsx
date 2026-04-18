'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  updateTrainerProfile,
  type TrainerProfileFormValues,
  type UpdateTrainerProfileActionState,
} from './actions';

type SettingsFormProps = {
  initialValues: TrainerProfileFormValues;
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-xl bg-[#FF5722] px-6 py-3 font-inter text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[#e64a19] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving...' : 'Save Changes'}
    </button>
  );
}

const initialState: UpdateTrainerProfileActionState = {
  success: false,
  message: null,
};

export function SettingsForm({ initialValues }: SettingsFormProps) {
  const [state, formAction] = useActionState(updateTrainerProfile, initialState);

  return (
    <form action={formAction} className="space-y-6 font-plus-jakarta-sans">
      {state.message ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            state.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-[#2D4F67]">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initialValues.phone}
            className="mt-2 block w-full rounded-xl border border-[#2D4F67]/14 bg-white px-4 py-3 text-[#173041] outline-none transition focus:border-[#FF5722] focus:ring-2 focus:ring-[#FF5722]/15"
          />
        </div>

        <div>
          <label htmlFor="niche" className="block text-sm font-medium text-[#2D4F67]">
            Niche
          </label>
          <input
            id="niche"
            name="niche"
            type="text"
            defaultValue={initialValues.niche}
            placeholder="e.g. HYROX, performance coaching, body recomposition"
            className="mt-2 block w-full rounded-xl border border-[#2D4F67]/14 bg-white px-4 py-3 text-[#173041] outline-none transition focus:border-[#FF5722] focus:ring-2 focus:ring-[#FF5722]/15"
          />
        </div>
      </div>

      <div>
        <label htmlFor="social_media" className="block text-sm font-medium text-[#2D4F67]">
          Social media
        </label>
        <input
          id="social_media"
          name="social_media"
          type="text"
          defaultValue={initialValues.social_media}
          placeholder="Instagram handle or profile URL"
          className="mt-2 block w-full rounded-xl border border-[#2D4F67]/14 bg-white px-4 py-3 text-[#173041] outline-none transition focus:border-[#FF5722] focus:ring-2 focus:ring-[#FF5722]/15"
        />
      </div>

      <div>
        <label htmlFor="wise_account" className="block text-sm font-medium text-[#2D4F67]">
          Wise account
        </label>
        <input
          id="wise_account"
          name="wise_account"
          type="text"
          defaultValue={initialValues.wise_account}
          placeholder="Email or payout reference used for transfers"
          className="mt-2 block w-full rounded-xl border border-[#2D4F67]/14 bg-white px-4 py-3 text-[#173041] outline-none transition focus:border-[#FF5722] focus:ring-2 focus:ring-[#FF5722]/15"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#2D4F67]/8 pt-6">
        <p className="max-w-xl text-sm leading-6 text-[#2D4F67]/70">
          Keep your contact and payout details current so commission communication and transfer workflows stay frictionless.
        </p>
        <SaveButton />
      </div>
    </form>
  );
}
