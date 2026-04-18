'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { adminNavigation, cn } from '@/components/admin/shared';
import type { Admin } from '@/lib/types';

export function AdminSidebar({ admin }: { admin: Admin }) {
  const pathname = usePathname();

  return (
    <aside className="flex min-h-screen w-full max-w-xs flex-col border-r border-white/10 bg-clinical-slate text-white shadow-2xl shadow-[#2D4F67]/30">
      <div className="border-b border-white/10 px-6 py-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-hyrox-orange text-sm font-black uppercase tracking-[0.35em] text-white shadow-lg shadow-[#FF5722]/30">
            TS
          </div>
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-white/55">TrainerSource</p>
            <h1 className="text-xl font-bold uppercase tracking-[0.14em]">Admin Panel</h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        <p className="px-3 text-[0.7rem] uppercase tracking-[0.35em] text-white/45">Navigation</p>
        <nav className="mt-4 space-y-2">
          {adminNavigation.map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition-all duration-200',
                  isActive
                    ? 'border-white/25 bg-white text-clinical-slate shadow-lg'
                    : 'border-transparent bg-white/5 text-white/78 hover:border-white/15 hover:bg-white/10 hover:text-white',
                )}
              >
                <span>{item.label}</span>
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-full transition-colors',
                    isActive ? 'bg-hyrox-orange' : 'bg-white/25 group-hover:bg-white/60',
                  )}
                />
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto px-6 py-8">
        <div className="rounded-3xl border border-white/15 bg-white/8 p-5 backdrop-blur-sm">
          <p className="text-[0.65rem] uppercase tracking-[0.35em] text-white/45">Signed in</p>
          <p className="mt-3 text-lg font-semibold text-white">{admin.name}</p>
          <p className="mt-1 text-sm text-white/65">{admin.email}</p>
          <p className="mt-4 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-white/80">
            {admin.role}
          </p>
        </div>
      </div>
    </aside>
  );
}
