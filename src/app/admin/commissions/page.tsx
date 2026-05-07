import { approveSelectedCommissions } from '@/app/admin/actions';
import { AdminSection } from '@/components/admin/AdminSection';
import { SubmitButton } from '@/components/admin/SubmitButton';
import {
  commissionStatusOptions,
  getCommissionDirectory,
  getSearchValue,
} from '@/components/admin/data';

import { CommissionsTableLive } from './commissions-table-live';

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

        <CommissionsTableLive initialRows={rows} approveAction={approveSelectedCommissions} />
      </AdminSection>
    </div>
  );
}
