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

      {state.message ? (
        <p className={`text-sm ${state.success ? 'text-[#2D4F67]' : 'text-red-600'}`}>{state.message}</p>
      ) : null}
    </form>
  );
}
