import { cn } from '@/components/admin/shared';

const palette: Record<string, string> = {
  applied: 'border-amber-200 bg-amber-50 text-amber-700',
  onboarding: 'border-sky-200 bg-sky-50 text-sky-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  suspended: 'border-rose-200 bg-rose-50 text-rose-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-sky-200 bg-sky-50 text-sky-700',
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sent: 'border-orange-200 bg-orange-50 text-orange-700',
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  shipped: 'border-sky-200 bg-sky-50 text-sky-700',
  consumed: 'border-slate-200 bg-slate-100 text-slate-600',
  expired: 'border-rose-200 bg-rose-50 text-rose-700',
  founder: 'border-orange-200 bg-orange-50 text-orange-700',
  organic: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  trainer: 'border-slate-200 bg-slate-100 text-slate-700',
};

export function StatusBadge({ label }: { label: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em]',
        palette[label] ?? 'border-slate-200 bg-slate-50 text-slate-600',
      )}
    >
      {label.replace('_', ' ')}
    </span>
  );
}
