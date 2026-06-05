'use client';

import { useState } from 'react';
import { createTrainer } from '@/app/admin/actions';
import { SubmitButton } from '@/components/admin/SubmitButton';
import { trainerStatusOptions } from '@/components/admin/shared';

export function CreateTrainerDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
      >
        {isOpen ? '✕ Close form' : '+ New Application'}
      </button>

      {isOpen && <CreateTrainerForm />}
    </div>
  );
}

function CreateTrainerForm() {
  return (
    <form action={createTrainer} className="space-y-4 rounded-[1.8rem] border border-slate-200 bg-slate-50/80 p-5">
      <div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-slate-400">Create trainer</p>
        <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">New partner profile</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <input name="name" placeholder="Full name" required className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
        <input name="email" type="email" placeholder="Email" required className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
        <input name="country" placeholder="Country" required className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
        <input name="city" placeholder="City" required className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
        <input name="phone" placeholder="Phone" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
        <input name="slug" placeholder="Custom slug" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
        <select name="tier" defaultValue="trainer" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate">
          <option value="trainer">Trainer</option>
          <option value="lead">Lead</option>
          <option value="network_partner">Network Partner</option>
        </select>
        <select name="status" defaultValue="applied" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate">
          {trainerStatusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input name="commission_rate" type="number" min="0" max="1" step="0.01" defaultValue="0.2" placeholder="Commission rate" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
        <input name="reorder_commission_rate" type="number" min="0" max="1" step="0.01" defaultValue="0.1" placeholder="Reorder rate" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
        <input name="max_clients" type="number" min="1" step="1" defaultValue="100" placeholder="Max clients" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
        <input name="wise_account" placeholder="Wise account" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
      </div>

      <input name="niche" placeholder="Niche" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
      <input name="social_media" placeholder="Social profile" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />

      <SubmitButton label="Create trainer" pendingLabel="Creating trainer" className="w-full" />
    </form>
  );
}