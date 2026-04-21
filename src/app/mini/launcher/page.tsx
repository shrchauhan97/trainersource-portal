'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type App = 'calc' | 'reorder' | 'partner';
const VALID_APPS: readonly App[] = ['calc', 'reorder', 'partner'];

function isValidApp(value: string | null): value is App {
  return value !== null && (VALID_APPS as readonly string[]).includes(value);
}

function LauncherInner() {
  const router = useRouter();
  const params = useSearchParams();
  const app = params.get('app');
  const [status, setStatus] = useState<'routing' | 'menu' | 'unavailable'>(
    'routing',
  );

  useEffect(() => {
    if (!isValidApp(app)) {
      setStatus('menu');
      return;
    }
    if (app === 'calc') {
      const extra = new URLSearchParams(params.toString());
      extra.delete('app');
      const qs = extra.toString();
      router.replace(`/mini/calc${qs ? `?${qs}` : ''}`);
      return;
    }
    setStatus('unavailable');
  }, [app, router, params]);

  if (status === 'routing') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--tg-hint,#94a3b8)]">Loading…</p>
      </main>
    );
  }

  if (status === 'unavailable') {
    return (
      <main className="mx-auto max-w-md px-4 py-8 text-center">
        <h1 className="text-lg font-semibold">Coming soon</h1>
        <p className="mt-2 text-sm text-[var(--tg-hint,#94a3b8)]">
          This Mini App is still under construction. Check back shortly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8 flex flex-col gap-3">
      <h1 className="text-lg font-semibold">Peptide Butler Mini Apps</h1>
      <a
        href="/mini/calc"
        className="rounded-xl bg-[var(--tg-bg-2,#1e293b)] px-4 py-3 text-base"
      >
        Reconstitution calculator
      </a>
      <div className="rounded-xl bg-[var(--tg-bg-2,#1e293b)] px-4 py-3 text-base text-[var(--tg-hint,#94a3b8)]">
        Reorder (coming soon)
      </div>
      <div className="rounded-xl bg-[var(--tg-bg-2,#1e293b)] px-4 py-3 text-base text-[var(--tg-hint,#94a3b8)]">
        Partner dashboard (coming soon)
      </div>
    </main>
  );
}

// useSearchParams requires a Suspense boundary so the static page can
// pre-render without query params. Wrapping here keeps Next.js happy on build.
export default function LauncherPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-[var(--tg-hint,#94a3b8)]">Loading…</p>
        </main>
      }
    >
      <LauncherInner />
    </Suspense>
  );
}
