'use client';

import { useState } from 'react';

import { reasonOptions } from '@/lib/lifecycle';
import { cn } from '@/components/admin/shared';
import { SubmitButton } from '@/components/admin/SubmitButton';

export interface LifecycleActionFormProps {
  action: (form: FormData) => Promise<void>;
  idField: 'customerId' | 'trainerId';
  idValue: string;
  verb: 'suspend' | 'remove' | 'restore';
  label: string;
  requiresConfirm?: boolean;
}

export function LifecycleActionForm(props: LifecycleActionFormProps) {
  const { action, idField, idValue, verb, label, requiresConfirm } = props;
  const [open, setOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] transition',
          verb === 'remove' &&
            'bg-rose-600 text-white shadow-lg shadow-rose-600/20 hover:bg-rose-700',
          verb === 'suspend' &&
            'bg-amber-500 text-white shadow-lg shadow-amber-500/25 hover:bg-amber-600',
          verb === 'restore' &&
            'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700',
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(45,79,103,0.35)]"
    >
      <input type="hidden" name={idField} value={idValue} />
      <label className="block text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">
        Reason
        <select
          name="reasonCategory"
          required
          defaultValue=""
          className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate"
        >
          <option value="" disabled>
            Select a reason…
          </option>
          {reasonOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">
        Note (optional)
        <textarea
          name="reasonNote"
          rows={2}
          className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate"
          placeholder="Free-text context for the audit log"
        />
      </label>
      {requiresConfirm ? (
        <label className="block text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-rose-600">
          Type REMOVE to confirm
          <input
            name="confirm"
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            className="mt-2 block w-full rounded-2xl border border-rose-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-rose-500"
            autoComplete="off"
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <SubmitButton
          label={label}
          pendingLabel={`${label}…`}
          variant={verb === 'remove' ? 'danger' : 'primary'}
          disabled={Boolean(requiresConfirm) && confirmValue !== 'REMOVE'}
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmValue('');
          }}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
