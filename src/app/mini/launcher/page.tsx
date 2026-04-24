'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';

type App = 'calc' | 'reorder' | 'partner';
const VALID_APPS: readonly App[] = ['calc', 'reorder', 'partner'];

function isValidApp(value: string | null): value is App {
  return value !== null && (VALID_APPS as readonly string[]).includes(value);
}

type Haptic = { impactOccurred: (style: string) => void };
type TelegramWebApp = {
  close: () => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: Haptic;
};

function getTg(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } })
    .Telegram?.WebApp;
}

function tapHaptic() {
  getTg()?.HapticFeedback?.impactOccurred('light');
}

// Slash commands aren't natively fireable from a menu-button Mini App, but
// `t.me/<bot>?start=cmd_<name>` is: Telegram closes the Mini App, opens the
// chat, and sends `/start cmd_<name>`. The bot's /start handler parses that
// payload and re-dispatches the real /<name> command. See
// trainersource-bot/src/handlers/commands.ts.
const BOT_USERNAME = 'peptidebutlerbot';

function fireSlashCommand(cmd: string) {
  tapHaptic();
  const name = cmd.startsWith('/') ? cmd.slice(1) : cmd;
  const url = `https://t.me/${BOT_USERNAME}?start=cmd_${name}`;
  const tg = getTg();
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.location.href = url;
  }
}

type Tile = {
  slug: App;
  title: string;
  desc: string;
  glyph: string;
  accent: 'gold' | 'teal' | 'rust';
};

const MINI_APP_TILES: Tile[] = [
  {
    slug: 'calc',
    title: 'Reconstitution calculator',
    desc: 'Dose math on a U-100 insulin syringe',
    glyph: '⚗',
    accent: 'gold',
  },
  {
    slug: 'partner',
    title: 'Partner dashboard',
    desc: 'Earnings, referral codes, toolkit',
    glyph: '◆',
    accent: 'teal',
  },
  {
    slug: 'reorder',
    title: 'Reorder',
    desc: 'Past orders, one-tap checkout',
    glyph: '↻',
    accent: 'rust',
  },
];

const ACCENT: Record<
  Tile['accent'],
  { bg: string; fg: string; border: string; glow: string }
> = {
  gold: {
    bg: 'linear-gradient(135deg, #e6c875 0%, #cc8218 100%)',
    fg: '#14202b',
    border: '#cc8218',
    glow: 'rgba(204, 130, 24, 0.18)',
  },
  teal: {
    bg: 'linear-gradient(135deg, #2db5a3 0%, #259a8a 100%)',
    fg: '#06281f',
    border: '#259a8a',
    glow: 'rgba(45, 181, 163, 0.18)',
  },
  rust: {
    bg: 'linear-gradient(135deg, #c95c2d 0%, #671800 100%)',
    fg: '#fff',
    border: '#92400e',
    glow: 'rgba(201, 92, 45, 0.18)',
  },
};

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

  const openTile = useCallback(
    (slug: App) => {
      tapHaptic();
      router.push(`/mini/${slug}`);
    },
    [router],
  );

  const runCommand = useCallback((cmd: string) => {
    fireSlashCommand(cmd);
  }, []);

  const closeAndChat = useCallback(() => {
    tapHaptic();
    // Route to the bot chat explicitly instead of just closing — if the user
    // launched the Mini App from another chat's menu button, tg.close() drops
    // them back where they were. openTelegramLink forces them into the
    // concierge chat so the CTA actually lands them at the prompt.
    const tg = getTg();
    const url = `https://t.me/${BOT_USERNAME}`;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
    } else {
      window.location.href = url;
    }
  }, []);

  if (status === 'routing') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#14202b]">
        <p className="text-sm text-[#94a3b8]">Loading…</p>
      </main>
    );
  }

  if (status === 'unavailable') {
    return (
      <main className="mx-auto max-w-md px-5 py-10 text-center">
        <h1 className="text-lg font-semibold text-[#e6c875]">Coming soon</h1>
        <p className="mt-2 text-sm text-[#94a3b8]">
          This Mini App is still under construction. Check back shortly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-10 pt-7">
      <header className="flex flex-col items-center gap-2 pb-7">
        <Image
          src="/assets/up-logo-transparent.png"
          alt="Ultimate Peptides"
          width={320}
          height={135}
          priority
          className="h-auto w-[230px] object-contain"
        />
        <p className="text-[10px] uppercase tracking-[0.36em] text-[#cc8218]">
          Concierge
        </p>
      </header>

      <section className="flex flex-col gap-3">
        {MINI_APP_TILES.map((tile) => {
          const accent = ACCENT[tile.accent];
          return (
            <button
              key={tile.slug}
              type="button"
              onClick={() => openTile(tile.slug)}
              className="group relative overflow-hidden rounded-2xl border border-[#243444] bg-[#1a2a3a] px-5 py-4 text-left transition-all active:scale-[0.99] active:bg-[#1e3145]"
              style={{ boxShadow: `0 1px 0 0 ${accent.glow} inset` }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl"
                  style={{
                    background: accent.bg,
                    color: accent.fg,
                    border: `1px solid ${accent.border}`,
                  }}
                >
                  <span aria-hidden>{tile.glyph}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-[#f8fafc]">
                    {tile.title}
                  </div>
                  <div className="text-xs text-[#94a3b8]">{tile.desc}</div>
                </div>
                <span
                  aria-hidden
                  className="text-lg text-[#597083] transition-colors group-hover:text-[#cc8218]"
                >
                  ›
                </span>
              </div>
            </button>
          );
        })}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#cc8218]">
            Slash commands
          </h2>
          <span className="text-[10px] uppercase tracking-widest text-[#597083]">
            Tap to run
          </span>
        </div>
        <ul className="divide-y divide-[#243444] overflow-hidden rounded-2xl border border-[#243444] bg-[#1a2a3a]">
          {SLASH_COMMANDS.map((item) => (
            <li key={item.cmd}>
              <button
                type="button"
                onClick={() => runCommand(item.cmd)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[#1e3145]"
              >
                <code className="min-w-[96px] rounded-md border border-[#2f4459] bg-[#14202b] px-2 py-0.5 font-mono text-[12px] text-[#e6c875]">
                  {item.cmd}
                </code>
                <span className="flex-1 text-xs text-[#cbd5e1]">
                  {item.desc}
                </span>
                <span className="text-xs text-[#597083]" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={closeAndChat}
        className="mt-7 w-full rounded-2xl px-5 py-3.5 text-sm font-semibold transition-opacity active:opacity-80"
        style={{
          background: 'linear-gradient(135deg, #e6c875 0%, #cc8218 100%)',
          color: '#14202b',
          boxShadow: '0 1px 0 rgba(255, 255, 255, 0.15) inset',
        }}
      >
        Ask the concierge anything →
      </button>

      <footer className="mt-8 text-center text-[10px] uppercase tracking-[0.24em] text-[#597083]">
        Research use only · Ultimate Peptides
      </footer>
    </main>
  );
}

export default function LauncherPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#14202b]">
          <p className="text-sm text-[#94a3b8]">Loading…</p>
        </main>
      }
    >
      <LauncherInner />
    </Suspense>
  );
}
