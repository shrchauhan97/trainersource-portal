'use client';

import { cn } from '@/components/admin/shared';

/**
 * Small pill that flips green when a Realtime channel is SUBSCRIBED. Intended
 * to live next to a section heading so admins can tell at a glance whether
 * the table they're staring at is actually live or stale.
 */
export function LivePill({ isLive }: { isLive: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.28em] transition-colors',
        isLive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-500',
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          isLive ? 'animate-pulse bg-emerald-500' : 'bg-slate-300',
        )}
      />
      {isLive ? 'Live' : 'Connecting'}
    </span>
  );
}
