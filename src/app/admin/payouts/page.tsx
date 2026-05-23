import type { Metadata } from 'next';
import { createPayoutBatch, updatePayoutStatus } from '@/app/admin/actions';
import { AdminSection } from '@/components/admin/AdminSection';
import { SubmitButton } from '@/components/admin/SubmitButton';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { formatCurrency, getPayoutDirectory } from '@/components/admin/data';

export const metadata: Metadata = { title: 'Payouts' };

export default async function AdminPayoutsPage() {
  const { rows, payoutPreview } = await getPayoutDirectory();

  return (
    <div className="space-y-8">
      <AdminSection
        eyebrow="Payout batching"
        title="Commission-to-payout workflow"
        description="Create payout batches from approved commissions, then move each payout through pending, sent, and confirmed states without firing the Wise API yet."
      >
        <div className="grid gap-8 xl:grid-cols-[0.95fr,1.05fr]">
          <div className="space-y-5 rounded-[1.8rem] border border-slate-200 bg-slate-50/80 p-5">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-slate-400">Create payout batch</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Approved commission grouping</h3>
            </div>

            <form action={createPayoutBatch} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <input name="period_start" type="date" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate" />
                <input name="period_end" type="date" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate" />
              </div>
              <SubmitButton label="Create payout batch" pendingLabel="Creating batch" className="w-full" />
            </form>

            <div className="space-y-3">
              {payoutPreview.map((preview) => (
                <div key={`${preview.trainerName}-${preview.firstDate}`} className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{preview.trainerName}</p>
                      <p className="mt-1 text-sm text-slate-500">{preview.commissionCount} approved commissions ready</p>
                    </div>
                    <p className="text-lg font-black tracking-tight text-slate-950">{formatCurrency(preview.total)}</p>
                  </div>
                </div>
              ))}
              {!payoutPreview.length ? <p className="text-sm text-slate-500">No approved commissions are waiting for batching.</p> : null}
            </div>
          </div>

          <div className="overflow-x-auto rounded-[1.8rem] border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50/80 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-400">
                <tr>
                  <th className="px-5 py-4">Trainer</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Period</th>
                  <th className="px-5 py-4">Wise transfer id</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-sm text-slate-700">
                {rows.map((payout) => (
                  <tr key={payout.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-5 py-5 font-medium text-slate-900">{payout.trainerName}</td>
                    <td className="px-5 py-5 font-medium text-slate-900">{formatCurrency(Number(payout.total ?? 0))}</td>
                    <td className="px-5 py-5"><StatusBadge label={payout.status} /></td>
                    <td className="px-5 py-5 text-slate-500">{payout.period_start} → {payout.period_end}</td>
                    <td className="px-5 py-5 text-slate-500">{payout.wise_transfer_id ?? 'Not assigned'}</td>
                    <td className="px-5 py-5">
                      {payout.status === 'pending' ? (
                        <form action={updatePayoutStatus} className="space-y-2">
                          <input type="hidden" name="payoutId" value={payout.id} />
                          <input type="hidden" name="status" value="sent" />
                          <input name="wise_transfer_id" placeholder="Wise transfer id" className="w-44 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-clinical-slate" />
                          <SubmitButton label="Mark sent" pendingLabel="Marking sent" variant="secondary" />
                        </form>
                      ) : null}
                      {payout.status === 'sent' ? (
                        <form action={updatePayoutStatus}>
                          <input type="hidden" name="payoutId" value={payout.id} />
                          <input type="hidden" name="status" value="confirmed" />
                          <SubmitButton label="Confirm" pendingLabel="Confirming" variant="primary" />
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">No payout batches have been created yet.</div>
            ) : null}
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
