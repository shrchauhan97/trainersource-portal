'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  checkEmailAllowed,
  sendMagicLinkAction,
  signInRedirect,
  type CheckEmailResult,
  type SendMagicLinkResult,
} from './actions';

const callbackErrorMessages: Record<string, string> = {
  auth_callback_failed:
    "The sign-in link didn't work. It may have expired or already been used. Request a new magic link and open it promptly.",
  not_authorized: 'Your email is not authorized to access TrainerSource.',
  suspended: 'Your account has been suspended. Contact support to restore access.',
};

const checkErrorMessages: Record<
  NonNullable<Exclude<CheckEmailResult, { allowed: true }>['reason']>,
  string
> = {
  not_authorized: 'Your email is not authorized to access TrainerSource.',
  suspended: 'Your account has been suspended. Contact support to restore access.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  invalid: 'Enter a valid email address.',
  server_error: 'Something went wrong. Please try again in a moment.',
};

const magicLinkErrorMessages: Record<
  NonNullable<Exclude<SendMagicLinkResult, { ok: true }>['reason']>,
  string
> = {
  not_authorized: 'Your email is not authorized to access TrainerSource.',
  suspended: 'Your account has been suspended. Contact support to restore access.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  invalid: 'Enter a valid email address.',
  server_error: 'Something went wrong. Please try again in a moment.',
  send_failed: "We couldn't send the magic link. Please try again in a moment.",
};

type Step = 'email' | 'password';

type LoginFormProps = {
  errorKey?: string;
};

export default function LoginForm({ errorKey }: LoginFormProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const callbackError = useMemo(() => {
    if (!errorKey) return null;
    return callbackErrorMessages[errorKey] ?? 'Something went wrong. Please try again.';
  }, [errorKey]);

  function resetMessages() {
    setError(null);
    setInfo(null);
    setMagicSent(false);
  }

  async function handleEmailSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    resetMessages();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await checkEmailAllowed(normalizedEmail);
      if (!result.allowed) {
        setError(checkErrorMessages[result.reason]);
        return;
      }
      setEmail(normalizedEmail);
      setHasPassword(result.hasPassword);
      if (result.hasPassword) {
        setStep('password');
      } else {
        await sendMagicLink(normalizedEmail);
      }
    } catch {
      setError('Something went wrong. Please try again in a moment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function sendMagicLink(addr: string, intent?: 'reset') {
    setIsSubmitting(true);
    resetMessages();
    try {
      const result = await sendMagicLinkAction(addr, intent);
      if (!result.ok) {
        setError(magicLinkErrorMessages[result.reason]);
        return;
      }
      setMagicSent(true);
      setInfo(
        intent === 'reset'
          ? 'Check your email for a link to reset your password.'
          : 'Check your email for a link to finish signing in.',
      );
    } catch {
      setError('Something went wrong. Please try again in a moment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    resetMessages();
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setIsSubmitting(true);
    const formData = new FormData();
    formData.set('email', email);
    formData.set('password', password);
    const result = await signInRedirect(formData);
    setIsSubmitting(false);
    if (result?.error) {
      setError(result.error);
    }
    // On success, signInRedirect calls Next's redirect() which throws —
    // navigation happens server-side, this code never reaches the next line.
  }

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
            {step === 'email' ? 'Sign in with your email' : 'Welcome back'}
          </h1>
          <p className="text-sm leading-6 text-clinical-slate/70 sm:text-base">
            {step === 'email'
              ? 'Enter the email connected to your admin or trainer account.'
              : hasPassword
                ? `Signing in as ${email}.`
                : `We've sent a magic link to ${email}. Open it to finish setting up your account.`}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="mt-8 space-y-5">
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-clinical-slate/15 bg-surface px-4 py-3 text-base text-clinical-slate outline-none transition placeholder:text-clinical-slate/40 focus:border-hyrox-orange focus:ring-4 focus:ring-hyrox-orange/15"
                disabled={isSubmitting}
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-hyrox-orange px-4 py-3 font-semibold text-white transition hover:bg-[#e64a19] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="mt-8 space-y-5">
            {hasPassword ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-semibold text-clinical-slate">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Your password"
                    className="w-full rounded-2xl border border-clinical-slate/15 bg-surface px-4 py-3 text-base text-clinical-slate outline-none transition placeholder:text-clinical-slate/40 focus:border-hyrox-orange focus:ring-4 focus:ring-hyrox-orange/15"
                    disabled={isSubmitting}
                    required
                    minLength={12}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-hyrox-orange px-4 py-3 font-semibold text-white transition hover:bg-[#e64a19] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? 'Signing in…' : 'Sign in'}
                </button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => sendMagicLink(email)}
                    disabled={isSubmitting}
                    className="font-medium text-hyrox-orange hover:underline disabled:opacity-50"
                  >
                    Email me a link instead
                  </button>
                  <button
                    type="button"
                    onClick={() => sendMagicLink(email, 'reset')}
                    disabled={isSubmitting}
                    className="font-medium text-clinical-slate/70 hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3 text-sm text-clinical-slate/70">
                <p>
                  No password is set on this account yet. We&apos;ve emailed you a magic link — open it to
                  finish setting up.
                </p>
                <button
                  type="button"
                  onClick={() => sendMagicLink(email)}
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-clinical-slate/15 px-4 py-3 font-semibold text-clinical-slate transition hover:border-hyrox-orange hover:text-hyrox-orange disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? 'Sending…' : magicSent ? 'Resend magic link' : 'Send magic link'}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setStep('email');
                setPassword('');
                setHasPassword(false);
                setMagicSent(false);
                resetMessages();
              }}
              className="text-xs font-medium uppercase tracking-[0.18em] text-clinical-slate/50 hover:text-clinical-slate"
            >
              ← Use a different email
            </button>
          </form>
        )}

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

        {info ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {info}
          </div>
        ) : null}
      </div>
    </main>
  );
}
