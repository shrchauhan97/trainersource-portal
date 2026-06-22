import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Confirm sign-in',
  robots: { index: false, follow: false },
};

type AuthConfirmPageProps = {
  searchParams: Promise<{
    token_hash?: string | string[];
    type?: string | string[];
    intent?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function AuthConfirmPage({ searchParams }: AuthConfirmPageProps) {
  const params = await searchParams;
  const tokenHash = firstParam(params.token_hash);
  const type = firstParam(params.type);
  const intent = firstParam(params.intent);
  const isReset = intent === 'reset';

  if (!tokenHash || !type) {
    return (
      <ConfirmShell
        title="This sign-in link is incomplete"
        description="The link may be broken or truncated. Request a new one from the login page."
      >
        <Link
          href="/login?error=auth_callback_failed"
          className="inline-flex w-full items-center justify-center rounded-2xl bg-hyrox-orange px-4 py-3 font-semibold text-white transition hover:bg-[#e64a19]"
        >
          Back to login
        </Link>
      </ConfirmShell>
    );
  }

  return (
    <ConfirmShell
      title={isReset ? 'Reset your password' : 'Finish signing in'}
      description={
        isReset
          ? 'Tap the button below to choose a new password for your TrainerSource account.'
          : 'Tap the button below to complete sign-in.'
      }
    >
      <form method="POST" action="/auth/callback" className="space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        {isReset ? <input type="hidden" name="intent" value="reset" /> : null}
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-2xl bg-hyrox-orange px-4 py-3 font-semibold text-white transition hover:bg-[#e64a19]"
        >
          {isReset ? 'Continue to reset password' : 'Sign in to TrainerSource'}
        </button>
      </form>
    </ConfirmShell>
  );
}

function ConfirmShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-16 text-clinical-slate">
      <div className="w-full max-w-md rounded-3xl border border-clinical-slate/10 bg-white p-8 shadow-[0_24px_80px_rgba(45,79,103,0.12)] sm:p-10">
        <div className="space-y-3">
          <div className="inline-flex rounded-full bg-hyrox-orange/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-hyrox-orange">
            TrainerSource Access
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-clinical-slate sm:text-4xl">
            {title}
          </h1>
          <p className="text-sm leading-6 text-clinical-slate/70 sm:text-base">{description}</p>
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
