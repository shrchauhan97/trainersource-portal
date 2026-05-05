'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { saveContactDetails, type ContactState } from './actions';
import type { TrainerOnboardingState } from '../_lib/types';

const initial: ContactState = { ok: false };

// CONTACT tab — first half of Step 1.
//
// Layout matches the PDF: a 2-column "table" where each column has a dark
// navy header cell with white uppercase text, and a light-bg input cell
// directly underneath. We render multiple rows of these (Name, Location,
// Profession, Socials).
export function ContactForm({
  initial: state,
  onSaved,
}: {
  initial: TrainerOnboardingState;
  onSaved: () => void;
}) {
  const [actionState, formAction] = useActionState(saveContactDetails, initial);
  // Avoid bouncing the user forward on the very first render before they
  // ever submit. We only advance after a successful action result.
  const previousOk = useRef(false);
  useEffect(() => {
    if (actionState.ok && !previousOk.current) {
      previousOk.current = true;
      onSaved();
    }
    if (!actionState.ok) previousOk.current = false;
  }, [actionState, onSaved]);

  const a = state.application;

  return (
    <form action={formAction} className="space-y-6">
      <Row>
        <Cell label="First name">
          <TextInput name="first_name" defaultValue={a?.first_name ?? ''} required />
        </Cell>
        <Cell label="Last name">
          <TextInput name="last_name" defaultValue={a?.last_name ?? ''} required />
        </Cell>
      </Row>

      <Row cols={3}>
        <Cell label="Country">
          <TextInput name="country" defaultValue={state.trainerCountry ?? ''} required />
        </Cell>
        <Cell label="City">
          <TextInput name="city" defaultValue={state.trainerCity ?? ''} required />
        </Cell>
        <Cell label="Zip / Postcode">
          <TextInput name="zip" defaultValue={a?.zip ?? ''} />
        </Cell>
      </Row>

      <Row cols={3}>
        <Cell label="Profession">
          <TextInput name="profession" defaultValue={a?.profession ?? ''} />
        </Cell>
        <Cell label="Experience (years)">
          <TextInput
            name="experience_years"
            type="number"
            min={0}
            defaultValue={a?.experience_years?.toString() ?? ''}
          />
        </Cell>
        <Cell label="Specialty (optional)">
          <TextInput name="specialty" defaultValue={a?.specialty ?? ''} />
        </Cell>
      </Row>

      <Row>
        <Cell label="Years in current city">
          <TextInput
            name="years_in_current_city"
            type="number"
            min={0}
            defaultValue={a?.years_in_current_city?.toString() ?? ''}
          />
        </Cell>
        <div />
      </Row>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2D4F67]/72">Socials</p>
        <Row cols={4} className="mt-2">
          <Cell label="Instagram">
            <TextInput name="instagram" defaultValue={a?.instagram ?? ''} placeholder="@handle" />
          </Cell>
          <Cell label="Facebook / Other">
            <TextInput
              name="facebook_or_other"
              defaultValue={a?.facebook_or_other ?? ''}
              placeholder="URL or handle"
            />
          </Cell>
          <Cell label="TikTok">
            <TextInput name="tiktok" defaultValue={a?.tiktok ?? ''} placeholder="@handle" />
          </Cell>
          <Cell label="LinkedIn">
            <TextInput name="linkedin" defaultValue={a?.linkedin ?? ''} placeholder="URL" />
          </Cell>
        </Row>
      </div>

      {actionState.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionState.error}</p>
      ) : null}

      <div className="flex items-center justify-end pt-2">
        <NextButton />
      </div>
    </form>
  );
}

function NextButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-full bg-[#173041] px-7 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#0f2230] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Next'}
    </button>
  );
}

// --- shared cell primitives -------------------------------------------------

function Row({
  cols = 2,
  className,
  children,
}: {
  cols?: 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  const gridClass =
    cols === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : cols === 3
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2';
  return <div className={['grid gap-3', gridClass, className ?? ''].join(' ')}>{children}</div>;
}

export function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#41627B]/20">
      <div className="bg-[#173041] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
        {label}
      </div>
      <div className="bg-[#eff6fb] px-3 py-2">{children}</div>
    </div>
  );
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        'w-full bg-transparent text-sm text-[#173041] placeholder-[#2D4F67]/40 outline-none',
        className ?? '',
      ].join(' ')}
    />
  );
}
