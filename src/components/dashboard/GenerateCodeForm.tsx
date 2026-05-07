'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { generateAccessCode, type GenerateCodeActionState } from '@/app/dashboard/actions';

const initialState: GenerateCodeActionState = {
  success: false,
  message: null,
  code: null,
};

function GenerateButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-full bg-[#FF5722] px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#e45120] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Generating...' : 'Generate New Code'}
    </button>
  );
}

export function GenerateCodeForm() {
  const [state, formAction] = useActionState(generateAccessCode, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-[1.75rem] border border-[#2D4F67]/10 bg-white p-6 shadow-[0_24px_60px_rgba(45,79,103,0.10)]">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D4F67]/60">Code generator</p>
        <h2 className="text-2xl font-black tracking-tight text-[#173041]">Create a fresh trainer access code</h2>
        <p className="max-w-2xl text-sm leading-6 text-[#2D4F67]/74">
          Each code is {8} characters long, stays live for {7} days, and can be consumed once.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <GenerateButton />
        {state.code ? (
          <div className="rounded-full border border-[#FF5722]/20 bg-[#FF5722]/8 px-4 py-2 text-sm font-bold tracking-[0.18em] text-[#FF5722] uppercase">
            {state.code}
          </div>
        ) : null}
      </div>

      {state.code ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#2D4F67]/10 bg-white p-5 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={`QR for code ${state.code}`}
            src={`/api/qr/${state.code}`}
            className="h-40 w-40 rounded-md border border-[#2D4F67]/10 bg-white"
            width={160}
            height={160}
          />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2D4F67]/60">Share with your client</p>
            <p className="text-sm text-[#2D4F67]/80 leading-6 max-w-md">
              Send this QR via WhatsApp / iMessage. Scanning lands the client on the storefront with the code pre-attached. The code stays valid for 7 days and is single-use.
            </p>
            <a
              href={`/api/qr/${state.code}`}
              download={`trainersource-${state.code}.png`}
              className="inline-flex w-fit items-center justify-center rounded-full bg-[#173041] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#2D4F67]"
            >
              Download QR
            </a>
          </div>
        </div>
      ) : null}

      {state.message ? (
        <p className={`text-sm ${state.success ? 'text-[#2D4F67]' : 'text-red-600'}`}>{state.message}</p>
      ) : null}
    </form>
  );
}
