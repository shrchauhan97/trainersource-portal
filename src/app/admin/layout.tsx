import type { Metadata } from 'next';

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { getAdminPageContext } from '@/components/admin/data';

// T4.2/T4.3 — Admin shell sets a title.template so each admin subpage can set
// a short title like "Orders" and have it render as "Orders — TrainerSource
// Admin". noindex/nofollow on the whole admin tree — these pages require an
// admin session and shouldn't appear in search results even if someone leaks
// a URL.
export const metadata: Metadata = {
  title: {
    absolute: 'TrainerSource Admin',
    template: '%s — TrainerSource Admin',
  },
  description: 'Admin control center for trainers, orders, commissions, payouts, and codes.',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { admin } = await getAdminPageContext();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,87,34,0.14),_transparent_28%),linear-gradient(180deg,_#f4faff_0%,_#edf4f9_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col xl:flex-row">
        <div className="xl:sticky xl:top-0 xl:h-screen">
          <AdminSidebar admin={admin} />
        </div>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
