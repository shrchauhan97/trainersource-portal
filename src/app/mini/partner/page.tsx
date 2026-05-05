// src/app/mini/partner/page.tsx
'use client';

import { useEffect, useState } from 'react';
import MiniAppBackButton from '../MiniAppBackButton';
import CodesList from './CodesList';
import EarningsSummary from './EarningsSummary';
import ToolkitLinks from './ToolkitLinks';
import NewCodeFlow from './NewCodeFlow';

type SummaryResponse = {
  trainer: { id: string; name: string; status: string };
  earnings: { pending: number; approved: number; paid: number };
  codes: Array<{
    id: string;
    code: string;
    displayStatus: 'active' | 'consumed' | 'expired';
    consumedByName: string | null;
    created_at: string;
    expires_at: string;
  }>;
  activeCodeCount: number;
  recruitment: { unlocked: boolean; consumedCount: number; threshold: number };
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-telegram' }
  | { kind: 'not-linked' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: SummaryResponse };

function getTg(): TelegramWebAppM3 | null {
  if (typeof window === 'undefined') return null;
  return (window.Telegram?.WebApp as TelegramWebAppM3 | undefined) ?? null;
}

function portalUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/dashboard`;
  }
  return 'https://trainer-source.com/dashboard';
}

export default function PartnerDashboardPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const tg = getTg();
      if (!tg || !tg.initData) {
        if (!cancelled) setState({ kind: 'no-telegram' });
        return;
      }
      tg.ready();
      tg.expand();

      try {
        const res = await fetch('/api/mini/partner/summary', {
          headers: { 'X-Telegram-Init-Data': tg.initData },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (res.status === 403) {
          setState({ kind: 'not-linked' });
          return;
        }
        if (!res.ok) {
          const body = await res.text();
          setState({ kind: 'error', message: `${res.status} ${body.slice(0, 120)}` });
          return;
        }
        setState({ kind: 'ready', data: (await res.json()) as SummaryResponse });
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: (err as Error).message });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return (
    <main className="min-h-screen bg-[#14202b] text-[#e8eefa] p-5">
      <MiniAppBackButton />

      {state.kind === 'loading' && (
        <div className="pt-24 text-center text-sm text-[#94a3b8]">Loading dashboard…</div>
      )}

      {state.kind === 'no-telegram' && (
        <div className="pt-12 text-center space-y-2">
          <p className="text-base font-semibold text-[#f8fafc]">Open from Telegram</p>
          <p className="text-sm text-[#94a3b8]">
            This page only works inside the Ultimate Peptides concierge Mini App. Send
            /dashboard to the bot to open it.
          </p>
        </div>
      )}

      {state.kind === 'not-linked' && (
        <div className="pt-12 text-center space-y-3">
          <p className="text-base font-semibold text-[#f8fafc]">Trainer account not linked</p>
          <p className="text-sm text-[#94a3b8] max-w-xs mx-auto">
            Connect this Telegram account to your TrainerSource profile first. Send /iamtrainer to
            the bot, or link from the portal.
          </p>
          <button
            onClick={() => getTg()?.openLink(portalUrl())}
            className="mt-2 rounded-full px-5 py-2 text-sm font-semibold"
            style={{
              background: 'linear-gradient(135deg, #e6c875 0%, #cc8218 100%)',
              color: '#14202b',
            }}
          >
            Open full portal
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="pt-12 text-center space-y-2">
          <p className="text-base font-semibold text-[#f8fafc]">Couldn&apos;t load dashboard</p>
          <p className="text-xs text-[#94a3b8] font-mono break-all">{state.message}</p>
          <button
            onClick={() => {
              setState({ kind: 'loading' });
              setRefreshTick((t) => t + 1);
            }}
            className="mt-3 rounded-full border border-[#cc8218] bg-transparent text-[#e6c875] px-4 py-1.5 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="space-y-5 max-w-md mx-auto">
          <header>
            <p className="text-[10px] uppercase tracking-[0.36em] text-[#cc8218]">
              Partner
            </p>
            <h1 className="text-xl font-bold text-[#f8fafc] mt-1">TrainerSource</h1>
            <p className="text-sm text-[#94a3b8]">{state.data.trainer.name}</p>
          </header>

          <EarningsSummary earnings={state.data.earnings} />

          <CodesList codes={state.data.codes} total={state.data.activeCodeCount} />

          <NewCodeFlow onIssued={() => setRefreshTick((t) => t + 1)} />

          <ToolkitLinks />

          <button
            onClick={() => getTg()?.openLink(portalUrl(), { try_instant_view: false })}
            className="w-full rounded-2xl border border-[#243444] bg-[#1a2a3a] text-[#e8eefa] py-3 text-sm font-semibold active:bg-[#1e3145]"
          >
            Open full portal
          </button>

          {state.data.recruitment.unlocked && (
            <p className="text-xs text-center text-[#94a3b8]">
              Recruitment tier unlocked ({state.data.recruitment.consumedCount}/
              {state.data.recruitment.threshold})
            </p>
          )}
        </div>
      )}
    </main>
  );
}
