import type { Metadata } from 'next';
import { AdminSection } from '@/components/admin/AdminSection';
import { AdminCodeGenerator } from '@/components/admin/AdminCodeGenerator';
import { SubmitButton } from '@/components/admin/SubmitButton';
import { StatusBadge } from '@/components/admin/StatusBadge';

export const metadata: Metadata = { title: 'Codes' };
import {
  codeStatusOptions,
  formatDate,
  getCodesDirectory,
  getSearchValue,
} from '@/components/admin/data';

type CodesPageProps = {
  searchParams: Promise<{
    status?: string | string[];
    type?: string | string[];
  }>;
};

export default async function AdminCodesPage({ searchParams }: CodesPageProps) {
  const params = await searchParams;
  const status = getSearchValue(params.status);
  const type = getSearchValue(params.type);
  const { rows } = await getCodesDirectory({ status, type });

  return (
    <div className="space-y-8">
      <AdminSection
        eyebrow="Code control"
        title="Founder and organic access codes"
        description="Generate non-trainer codes for founder access and organic traffic, then audit the full code inventory with filtering."
      >
        <div className="grid gap-8 xl:grid-cols-[0.95fr,1.05fr]">
          <AdminCodeGenerator />

          <div className="space-y-5">
            <form className="grid gap-4 rounded-[1.8rem] border border-slate-200 bg-white p-5 md:grid-cols-[1fr,1fr,auto]">
              <select name="type" defaultValue={type ?? ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate">
                <option value="">All types</option>
                <option value="founder">Founder</option>
                <option value="organic">Organic</option>
                <option value="trainer">Trainer</option>
              </select>
              <select name="status" defaultValue={status ?? ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate">
                <option value="">All statuses</option>
                {codeStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <SubmitButton label="Filter" pendingLabel="Filtering" variant="secondary" />
            </form>

            <div className="overflow-x-auto rounded-[1.8rem] border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50/80 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Code</th>
                    <th className="px-5 py-4">Type</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Trainer</th>
                    <th className="px-5 py-4">Created</th>
                    <th className="px-5 py-4">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 text-sm text-slate-700">
                  {rows.map((code) => (
                    <tr key={code.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-5 font-semibold text-slate-900">{code.code}</td>
                      <td className="px-5 py-5"><StatusBadge label={code.type} /></td>
                      <td className="px-5 py-5"><StatusBadge label={code.status} /></td>
                      <td className="px-5 py-5 text-slate-500">{code.trainerName ?? '—'}</td>
                      <td className="px-5 py-5 text-slate-500">{formatDate(code.created_at)}</td>
                      <td className="px-5 py-5 text-slate-500">{formatDate(code.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">No codes found for the selected filters.</div>
              ) : null}
            </div>
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
