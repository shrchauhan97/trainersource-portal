'use client';

import { LivePill } from '@/components/admin/LivePill';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { SubmitButton } from '@/components/admin/SubmitButton';
import {
  formatCurrency,
  formatDate,
  formatPercent,
} from '@/components/admin/shared';
import type { CommissionRow } from '@/components/admin/shared';
import { useRealtimeTable } from '@/lib/realtime/use-realtime-table';

export function CommissionsTableLive({
  initialRows,
  approveAction,
}: {
  initialRows: CommissionRow[];
  approveAction: (formData: FormData) => Promise<void>;
}) {
  const { rows, isLive } = useRealtimeTable<CommissionRow>('commissions', initialRows);

  return (
    <>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-400">
          {rows.length} {rows.length === 1 ? 'line' : 'lines'}
        </p>
        <LivePill isLive={isLive} />
      </div>

      <form action={approveAction} className="mt-3 space-y-5">
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
                  <td className="px-5 py-5 font-medium text-slate-900">{commission.trainerName || 'Loading…'}</td>
                  <td className="px-5 py-5 text-slate-900">#{commission.orderReference || commission.order_id.slice(0, 8)}</td>
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
    </>
  );
}
