'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

const errorMessages: Record<string, string> = {
  auth_callback_failed: 'We could not complete sign in. Please request a new magic link.',
  not_authorized: 'Your email is not authorized to access TrainerSource.',
  suspended: 'Your account has been suspended. Contact support to restore access.',
};

type LoginFormProps = {
  errorKey?: string;
};

export default function LoginForm({ errorKey }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const callbackError = useMemo(() => {
    if (!errorKey) {
      return null;
    }

    return errorMessages[errorKey] ?? 'Something went wrong. Please try again.';
  }, [errorKey]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-16 text-clinical-slate">
      <div className="w-full max-w-md rounded-3xl border border-clinical-slate/10 bg-white p-8 shadow-[0_24px_80px_rgba(45,79,103,0.12)] sm:p-10">
        <div className="space-y-3">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-clinical-slate/70 transition hover:text-clinical-slate"
          >
            ← Back to home
          </Link>
          <div className="inline-flex rounded-full bg-hyrox-orange/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-hyrox-orange">
            TrainerSource Access
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-clinical-slate sm:text-4xl">
            Sign in with your email
          </h1>
          <p className="text-sm leading-6 text-clinical-slate/70 sm:text-base">
            Enter the email connected to your admin or trainer account and we&apos;ll send you a secure magic link.
          </p>
        </div>

        <form
          onSubmit={async (event) => {
            event.preventDefault();

            const normalizedEmail = email.trim().toLowerCase();

            if (!normalizedEmail) {
              setError('Enter your email address to receive a magic link.');
              setIsSuccess(false);
              return;
            }

            setIsLoading(true);
            setError(null);
            setIsSuccess(false);

            const supabase = createClient();
            const redirectTo = `${window.location.origin}/auth/callback`;
            const { error: signInError } = await supabase.auth.signInWithOtp({
              email: normalizedEmail,
              options: {
                emailRedirectTo: redirectTo,
              },
            });

            if (signInError) {
              setError(signInError.message);
              setIsLoading(false);
              return;
            }

            setIsSuccess(true);
            setEmail(normalizedEmail);
            setIsLoading(false);
          }}
          className="mt-8 space-y-5"
        >
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-semibold text-clinical-slate">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-clinical-slate/15 bg-surface px-4 py-3 text-base text-clinical-slate outline-none transition placeholder:text-clinical-slate/40 focus:border-hyrox-orange focus:ring-4 focus:ring-hyrox-orange/15"
              disabled={isLoading}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-hyrox-orange px-4 py-3 font-semibold text-white transition hover:bg-[#e64a19] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Sending magic link...' : 'Send Magic Link'}
          </button>
        </form>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!error && callbackError ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {callbackError}
          </div>
        ) : null}

        {isSuccess ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Check your email for the magic link. Open it on this device to finish signing in.
          </div>
        ) : null}
      </div>
    </main>
  );
}
