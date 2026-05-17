'use client';

import { useState, useTransition } from 'react';

import { setPassword } from './actions';
import { PASSWORD_HINT, PASSWORD_REGEX } from './password-policy';

type SetPasswordFormProps = {
  email: string;
  next: string;
};

export default function SetPasswordForm({ email, next }: SetPasswordFormProps) {
  const [password, setPasswordValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const passesPolicy = PASSWORD_REGEX.test(password);
  const matches = password.length > 0 && password === confirm;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-16 text-clinical-slate">
      <div className="w-full max-w-md rounded-3xl border border-clinical-slate/10 bg-white p-8 shadow-[0_24px_80px_rgba(45,79,103,0.12)] sm:p-10">
        <div className="space-y-3">
          <div className="inline-flex rounded-full bg-hyrox-orange/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-hyrox-orange">
            Set a Password
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-clinical-slate sm:text-4xl">
            Pick a password
          </h1>
          <p className="text-sm leading-6 text-clinical-slate/70 sm:text-base">
            Setting up access for <span className="font-semibold text-clinical-slate">{email}</span>. Next
            time you sign in, you can skip the magic link.
          </p>
        </div>

        <form
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            setError(null);
            if (!passesPolicy) {
              setError(PASSWORD_HINT);
              return;
            }
            if (!matches) {
              setError('Passwords do not match.');
              return;
            }
            const formData = new FormData();
            formData.set('password', password);
            formData.set('confirm', confirm);
            formData.set('next', next);
            startTransition(async () => {
              const result = await setPassword(formData);
              if (result?.error) {
                setError(result.error);
              }
            });
          }}
          className="mt-8 space-y-5"
        >
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-semibold text-clinical-slate">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPasswordValue(e.target.value);
                setError(null);
              }}
              minLength={12}
              required
              disabled={isPending}
              className="w-full rounded-2xl border border-clinical-slate/15 bg-surface px-4 py-3 text-base text-clinical-slate outline-none transition placeholder:text-clinical-slate/40 focus:border-hyrox-orange focus:ring-4 focus:ring-hyrox-orange/15"
            />
            <p className="text-xs text-clinical-slate/60">{PASSWORD_HINT}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm" className="text-sm font-semibold text-clinical-slate">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              minLength={12}
              required
              disabled={isPending}
              className="w-full rounded-2xl border border-clinical-slate/15 bg-surface px-4 py-3 text-base text-clinical-slate outline-none transition placeholder:text-clinical-slate/40 focus:border-hyrox-orange focus:ring-4 focus:ring-hyrox-orange/15"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || !passesPolicy || !matches}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-hyrox-orange px-4 py-3 font-semibold text-white transition hover:bg-[#e64a19] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? 'Saving…' : 'Save password'}
          </button>
        </form>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}
