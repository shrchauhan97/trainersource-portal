import { approveSelectedCommissions } from '@/app/admin/actions';
import { AdminSection } from '@/components/admin/AdminSection';
import { SubmitButton } from '@/components/admin/SubmitButton';
import { StatusBadge } from '@/components/admin/StatusBadge';
import {
  commissionStatusOptions,
  formatCurrency,
  formatDate,
  formatPercent,
  getCommissionDirectory,
  getSearchValue,
} from '@/components/admin/data';

type CommissionsPageProps = {
  searchParams: Promise<{
    status?: string | string[];
  }>;
};

export default async function AdminCommissionsPage({ searchParams }: CommissionsPageProps) {
  const params = await searchParams;
  const status = getSearchValue(params.status);
  const { rows } = await getCommissionDirectory({ status });
  const pendingCount = rows.filter((row) => row.status === 'pending').length;

  return (
    <div className="space-y-8">
      <AdminSection
        eyebrow="Commission approval"
        title="Review commission lines"
        description="Approve pending commission lines in bulk, then move them into payout batching once finance is ready."
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <form className="flex w-full max-w-sm gap-3">
            <select name="status" defaultValue={status ?? ''} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate">
              <option value="">All statuses</option>
              {commissionStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <SubmitButton label="Filter" pendingLabel="Filtering" variant="secondary" />
          </form>
          <div className="rounded-[1.6rem] border border-hyrox-orange/15 bg-hyrox-orange/8 px-5 py-4 text-sm text-slate-600">
            <p className="font-semibold uppercase tracking-[0.22em] text-hyrox-orange">Pending approval</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{pendingCount}</p>
          </div>
        </div>

        <form action={approveSelectedCommissions} className="mt-6 space-y-5">
          <div className="overflow-x-auto rounded-[1.8rem] border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50/80 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-400">
                <tr>
                  <th className="px-5 py-4">Select</th>
                  <th className="px-5 py-4">Trainer</th>
                  <th className="px-5 py-4">Order</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Rate</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-sm text-slate-700">
                {rows.map((commission) => (
                  <tr key={commission.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-5">
                      {commission.status === 'pending' ? (
                        <input
                          type="checkbox"
                          name="commissionIds"
                          value={commission.id}
                          className="h-4 w-4 rounded border-slate-300 text-hyrox-orange focus:ring-hyrox-orange"
                        />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-5 font-medium text-slate-900">{commission.trainerName}</td>
                    <td className="px-5 py-5 text-slate-900">#{commission.orderReference}</td>
                    <td className="px-5 py-5 font-medium text-slate-900">{formatCurrency(Number(commission.amount ?? 0))}</td>
                    <td className="px-5 py-5 text-slate-500">{commission.commission_type.replace('_', ' ')}</td>
                    <td className="px-5 py-5 text-slate-500">{formatPercent(Number(commission.rate_snapshot ?? 0))}</td>
                    <td className="px-5 py-5"><StatusBadge label={commission.status} /></td>
                    <td className="px-5 py-5 text-slate-500">{formatDate(commission.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">No commissions found.</div>
            ) : null}
          </div>

          <div className="flex justify-end">
            <SubmitButton label="Approve selected" pendingLabel="Approving selected" className="min-w-52" />
          </div>
        </form>
      </AdminSection>
    </div>
  );
}
