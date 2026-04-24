'use client';

import { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';

type App = 'calc' | 'reorder' | 'partner';
const VALID_APPS: readonly App[] = ['calc', 'reorder', 'partner'];

function isValidApp(value: string | null): value is App {
  return value !== null && (VALID_APPS as readonly string[]).includes(value);
}

type TelegramWebApp = {
  close: () => void;
  HapticFeedback?: { impactOccurred: (style: string) => void };
};

function closeMiniApp() {
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } })
    .Telegram?.WebApp;
  tg?.HapticFeedback?.impactOccurred('light');
  tg?.close();
}

type Tile = {
  href: string;
  title: string;
  desc: string;
  glyph: string;
};

const MINI_APP_TILES: Tile[] = [
  {
    href: '/mini/calc',
    title: 'Reconstitution calculator',
    desc: 'Dose math on a U-100 insulin syringe',
    glyph: '⚗',
  },
  {
    href: '/mini/partner',
    title: 'Partner dashboard',
    desc: 'Earnings, codes, toolkit',
    glyph: '◆',
  },
  {
    href: '/mini/reorder',
    title: 'Reorder',
    desc: 'Past orders, one-tap checkout',
    glyph: '↻',
  },
];

type SlashCommand = { cmd: string; desc: string };

const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/start', desc: 'Welcome message' },
  { cmd: '/help', desc: 'What the concierge can help with' },
  { cmd: '/products', desc: 'Browse the catalogue' },
  { cmd: '/research', desc: 'Podcasts, papers, references' },
  { cmd: '/calculator', desc: 'Open the reconstitution calculator' },
  { cmd: '/partner', desc: 'TrainerSource partner programme' },
  { cmd: '/faq', desc: 'Shipping, COA, payment, codes' },
  { cmd: '/coa', desc: 'Certificate of Analysis for a compound' },
  { cmd: '/support', desc: 'Order and shipping contact' },
  { cmd: '/reset', desc: 'Clear our conversation history' },
];

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
    const extra = new URLSearchParams(params.toString());
    extra.delete('app');
    const qs = extra.toString();
    router.replace(`/mini/${app}${qs ? `?${qs}` : ''}`);
  }, [app, router, params]);

  if (status === 'routing') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-sm text-[#b8a26a]">Loading…</p>
      </main>
    );
  }

  if (status === 'unavailable') {
    return (
      <main className="mx-auto max-w-md px-5 py-10 text-center">
        <h1 className="text-lg font-semibold text-[#e6c875]">Coming soon</h1>
        <p className="mt-2 text-sm text-[#b8a26a]">
          This Mini App is still under construction. Check back shortly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-10 pt-8">
      <header className="flex flex-col items-center gap-3 pb-6">
        <Image
          src="/assets/ultimate-peptides-logo.jpg"
          alt="Ultimate Peptides"
          width={260}
          height={104}
          priority
          className="h-auto w-[220px] object-contain"
          style={{ mixBlendMode: 'screen' }}
        />
        <p className="text-xs uppercase tracking-[0.28em] text-[#b8a26a]">
          Concierge
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3">
        {MINI_APP_TILES.map((tile) => (
          <a
            key={tile.href}
            href={tile.href}
            className="group relative overflow-hidden rounded-2xl border border-[#3a2d14] bg-gradient-to-br from-[#141008] to-[#0a0a0a] px-5 py-4 transition-colors hover:border-[#c9a24a]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#c9a24a] to-[#8a6e2b] text-xl text-[#0a0a0a]">
                <span aria-hidden>{tile.glyph}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-[#f4e9cf]">
                  {tile.title}
                </div>
                <div className="text-xs text-[#b8a26a]">{tile.desc}</div>
              </div>
              <span
                aria-hidden
                className="text-lg text-[#c9a24a] opacity-60 transition-opacity group-hover:opacity-100"
              >
                ›
              </span>
            </div>
          </a>
        ))}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#c9a24a]">
            Slash commands
          </h2>
          <span className="text-[10px] uppercase tracking-widest text-[#6b5a30]">
            Tap to return to chat
          </span>
        </div>
        <ul className="divide-y divide-[#1e1810] rounded-2xl border border-[#3a2d14] bg-[#0f0b05]">
          {SLASH_COMMANDS.map((item) => (
            <li key={item.cmd}>
              <button
                type="button"
                onClick={closeMiniApp}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#16110a]"
              >
                <code className="min-w-[92px] rounded-md bg-[#1e1810] px-2 py-0.5 font-mono text-[12px] text-[#e6c875]">
                  {item.cmd}
                </code>
                <span className="flex-1 text-xs text-[#d6c48a]">
                  {item.desc}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={closeMiniApp}
        className="mt-6 w-full rounded-2xl border border-[#c9a24a] bg-gradient-to-br from-[#c9a24a] to-[#8a6e2b] px-5 py-3 text-sm font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90"
      >
        Ask the concierge anything
      </button>

      <footer className="mt-8 text-center text-[10px] uppercase tracking-[0.24em] text-[#6b5a30]">
        Research use only · Ultimate Peptides
      </footer>
    </main>
  );
}

export default function LauncherPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
          <p className="text-sm text-[#b8a26a]">Loading…</p>
        </main>
      }
    >
      <LauncherInner />
    </Suspense>
  );
}
