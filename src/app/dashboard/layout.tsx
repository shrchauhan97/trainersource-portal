import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTrainerStats } from './actions';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

export const dynamic = 'force-dynamic';

// T4.2/T4.3 — Authenticated trainer dashboard. title.template lets each
// subpage set a short title (e.g. "Codes") that renders as
// "Codes — TrainerSource Dashboard". noindex/nofollow so the page never gets
// indexed (it requires an authenticated trainer session).
export const metadata: Metadata = {
  title: {
    absolute: 'TrainerSource Dashboard',
    template: '%s — TrainerSource Dashboard',
  },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const stats = await getTrainerStats();

  return <DashboardShell stats={stats}>{children}</DashboardShell>;
}
