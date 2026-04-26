import type { ReactNode } from 'react';
import { getTrainerStats } from './actions';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const stats = await getTrainerStats();

  return <DashboardShell stats={stats}>{children}</DashboardShell>;
}
