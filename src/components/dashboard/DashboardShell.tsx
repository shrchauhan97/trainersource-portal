import Link from 'next/link';
import type { ReactNode } from 'react';
import { logout, type DashboardStats } from '@/app/dashboard/actions';
import type { TrainerStatus } from '@/lib/types';
import { DashboardTabs } from './DashboardTabs';
import { StatCard } from './StatCard';

type DashboardShellProps = {
  stats: DashboardStats;
  children: ReactNode;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function DashboardShell({ stats, children }: DashboardShellProps) {
  const trainerStatus: TrainerStatus = stats.trainer.status;
  const isOnboarding = trainerStatus !== 'active';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,87,34,0.12),_transparent_30%),linear-gradient(180deg,#0f2230_0%,#173041_20%,#eff6fb_20%,#eff6fb_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#173041] px-6 py-6 text-white shadow-[0_30px_80px_rgba(15,34,48,0.34)] sm:px-8">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(255,87,34,0.22),_transparent_62%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/78">
                <span className="h-2 w-2 rounded-full bg-[#FF5722]" />
                Trainer dashboard
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{stats.trainer.name}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                  Monitor your code inventory, attributed clients, and commission flow from one clinical control room.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
                <span className="rounded-full border border-[#FF5722]/30 bg-[#FF5722]/14 px-4 py-2 font-semibold uppercase tracking-[0.18em] text-[#ffd5c8]">
                  {stats.trainer.status}
                </span>
                <span>{stats.trainer.email}</span>
                <span className="text-white/35">•</span>
                <span>
                  {stats.trainer.city}, {stats.trainer.country}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start lg:flex-col lg:items-end">
              {isOnboarding ? (
                <Link
                  href="/onboarding"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF5722] px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-[0_18px_34px_rgba(255,87,34,0.32)] transition hover:bg-[#e64a19]"
                >
                  My Onboarding
                  <span aria-hidden="true">→</span>
                </Link>
              ) : null}

              <form action={logout}>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/14"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>

          <div className="relative mt-6">
            <DashboardTabs disabled={isOnboarding} />
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Clients" value={String(stats.totalClients)} accent="#2D4F67" />
          <StatCard label="Active Codes" value={String(stats.activeCodes)} accent="#FF5722" />
          <StatCard label="Pending Commission" value={formatCurrency(stats.pendingCommission)} accent="#FF5722" />
          <StatCard label="Total Earned" value={formatCurrency(stats.totalEarned)} accent="#2D4F67" />
        </section>

        <main className="pb-10">{children}</main>
      </div>
    </div>
  );
}
