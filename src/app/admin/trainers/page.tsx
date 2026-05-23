import type { Metadata } from 'next';
import Link from 'next/link';

import { changeTrainerStatus, createTrainer } from '@/app/admin/actions';
import { AdminSection } from '@/components/admin/AdminSection';
import { SubmitButton } from '@/components/admin/SubmitButton';
import { StatusBadge } from '@/components/admin/StatusBadge';
import {
  formatCurrency,
  formatPercent,
  getSearchValue,
  getTrainerDirectory,
  trainerStatusOptions,
} from '@/components/admin/data';

export const metadata: Metadata = { title: 'Trainers' };

type TrainersPageProps = {
  searchParams: Promise<{
    status?: string | string[];
    country?: string | string[];
  }>;
};

export default async function AdminTrainersPage({ searchParams }: TrainersPageProps) {
  const params = await searchParams;
  const status = getSearchValue(params.status);
  const country = getSearchValue(params.country);
  const { rows, countries } = await getTrainerDirectory({ status, country });

  return (
    <div className="space-y-8">
      <AdminSection
        eyebrow="Trainer management"
        title="Partner pipeline"
        description="Create trainer records, filter the roster, move applications through the status journey, and jump into a full detail view for edits."
      >
        <div className="grid gap-8 xl:grid-cols-[1.2fr,2fr]">
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

          <div className="space-y-5">
            <form className="grid gap-4 rounded-[1.8rem] border border-slate-200 bg-white p-5 md:grid-cols-[1fr,1fr,auto]">
              <select name="status" defaultValue={status ?? ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate">
                <option value="">All statuses</option>
                {trainerStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select name="country" defaultValue={country ?? ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate">
                <option value="">All countries</option>
                {countries.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <div className="flex gap-3">
                <SubmitButton label="Apply filters" pendingLabel="Filtering" variant="secondary" className="w-full md:w-auto" />
                <Link href="/admin/trainers" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50">
                  Reset
                </Link>
              </div>
            </form>

            <div className="overflow-x-auto rounded-[1.8rem] border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50/80 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Trainer</th>
                    <th className="px-5 py-4">Location</th>
                    <th className="px-5 py-4">Tier</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Clients</th>
                    <th className="px-5 py-4">Commission</th>
                    <th className="px-5 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 text-sm text-slate-700">
                  {rows.map((trainer) => (
                    <tr key={trainer.id} className="align-top hover:bg-slate-50/60">
                      <td className="px-5 py-5">
                        <Link href={`/admin/trainers/${trainer.id}`} className="block">
                          <p className="font-semibold text-slate-900 transition hover:text-hyrox-orange">{trainer.name}</p>
                          <p className="mt-1 text-slate-500">{trainer.email}</p>
                        </Link>
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-medium text-slate-900">{trainer.country}</p>
                        <p className="mt-1 text-slate-500">{trainer.city}</p>
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-medium text-slate-900">{trainer.tier.replace('_', ' ')}</p>
                        <p className="mt-1 text-slate-500">{formatPercent(Number(trainer.commission_rate ?? 0))} first sale</p>
                      </td>
                      <td className="px-5 py-5">
                        <StatusBadge label={trainer.status} />
                      </td>
                      <td className="px-5 py-5 font-medium text-slate-900">{trainer.clientsCount}</td>
                      <td className="px-5 py-5 font-medium text-slate-900">{formatCurrency(trainer.commissionEarned)}</td>
                      <td className="px-5 py-5">
                        <div className="flex flex-wrap gap-2">
                          {trainer.status === 'applied' ? (
                            <form action={changeTrainerStatus}>
                              <input type="hidden" name="trainerId" value={trainer.id} />
                              <input type="hidden" name="status" value="onboarding" />
                              <SubmitButton label="Approve" pendingLabel="Approving" variant="primary" />
                            </form>
                          ) : null}
                          {trainer.status !== 'active' ? (
                            <form action={changeTrainerStatus}>
                              <input type="hidden" name="trainerId" value={trainer.id} />
                              <input type="hidden" name="status" value="active" />
                              <SubmitButton label="Activate" pendingLabel="Activating" variant="secondary" />
                            </form>
                          ) : null}
                          {trainer.status !== 'suspended' ? (
                            <form action={changeTrainerStatus}>
                              <input type="hidden" name="trainerId" value={trainer.id} />
                              <input type="hidden" name="status" value="suspended" />
                              <SubmitButton label="Suspend" pendingLabel="Suspending" variant="ghost" />
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">No trainers match the current filters.</div>
              ) : null}
            </div>
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
