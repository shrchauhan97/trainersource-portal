'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/codes', label: 'My Codes' },
  { href: '/dashboard/clients', label: 'My Clients' },
  { href: '/dashboard/commissions', label: 'My Commissions' },
  { href: '/dashboard/settings', label: 'Settings' },
];

type DashboardTabsProps = {
  // When true, tabs render as inert spans with reduced opacity. Used during
  // onboarding so the chrome is visible but navigation is gated until the
  // trainer goes live (PDF screen 1).
  disabled?: boolean;
};

export function DashboardTabs({ disabled = false }: DashboardTabsProps) {
  const pathname = usePathname();

  return (
    <nav className="overflow-x-auto">
      <div
        className="inline-flex min-w-full gap-2 rounded-[1.5rem] border border-white/10 bg-[#173041] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        role="tablist"
        aria-disabled={disabled || undefined}
      >
        {tabs.map((tab) => {
          if (disabled) {
            return (
              <span
                key={tab.href}
                aria-disabled="true"
                className="cursor-not-allowed rounded-[1rem] px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/30 select-none"
              >
                {tab.label}
              </span>
            );
          }

          const isActive = pathname === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-[1rem] px-4 py-3 text-sm font-semibold tracking-[0.14em] uppercase transition-all ${
                isActive
                  ? 'bg-[#FF5722] text-white shadow-[0_18px_34px_rgba(255,87,34,0.26)]'
                  : 'text-white/70 hover:bg-white/6 hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
