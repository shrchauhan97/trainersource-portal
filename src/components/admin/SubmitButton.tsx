'use client';

import { useFormStatus } from 'react-dom';

import { cn } from '@/components/admin/shared';

export function SubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
  className,
  disabled,
}: {
  label: string;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || Boolean(disabled)}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' &&
          'bg-hyrox-orange text-white shadow-lg shadow-[#FF5722]/30 hover:bg-[#e64b1b]',
        variant === 'secondary' &&
          'bg-clinical-slate text-white shadow-lg shadow-[#2D4F67]/25 hover:bg-[#264458]',
        variant === 'ghost' &&
          'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
        variant === 'danger' &&
          'bg-rose-600 text-white shadow-lg shadow-rose-600/20 hover:bg-rose-700',
        className,
      )}
    >
      {pending ? pendingLabel ?? label : label}
    </button>
  );
}
