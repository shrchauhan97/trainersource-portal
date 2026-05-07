'use client';

import { LivePill } from '@/components/admin/LivePill';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { formatCurrency, formatDate } from '@/components/admin/shared';
import type { OrderRow } from '@/components/admin/shared';
import { useRealtimeTable } from '@/lib/realtime/use-realtime-table';

export function OrdersTableLive({ initialRows }: { initialRows: OrderRow[] }) {
  const { rows, isLive } = useRealtimeTable<OrderRow>('orders', initialRows);

  return (
    <>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-400">
          {rows.length} {rows.length === 1 ? 'order' : 'orders'}
        </p>
        <LivePill isLive={isLive} />
      </div>

      <div className="mt-3 overflow-x-auto rounded-[1.8rem] border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50/80 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-slate-400">
            <tr>
              <th className="px-5 py-4">Order</th>
              <th className="px-5 py-4">Customer</th>
              <th className="px-5 py-4">Trainer</th>
              <th className="px-5 py-4">Total</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Region</th>
              <th className="px-5 py-4">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 text-sm text-slate-700">
            {rows.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-5">
                  <p className="font-semibold text-slate-900">#{order.bigcommerce_order_id}</p>
                  <p className="mt-1 text-slate-500">{order.payment_method}</p>
                </td>
                <td className="px-5 py-5">
                  <p className="font-medium text-slate-900">{order.customerName || 'Loading…'}</p>
                  <p className="mt-1 text-slate-500">{order.customerEmail || '—'}</p>
                </td>
                <td className="px-5 py-5 text-slate-900">{order.trainerName ?? 'Unattributed'}</td>
                <td className="px-5 py-5 font-medium text-slate-900">{formatCurrency(Number(order.total ?? 0))}</td>
                <td className="px-5 py-5"><StatusBadge label={order.status} /></td>
                <td className="px-5 py-5">
                  <p className="font-medium text-slate-900">{order.country ?? 'Unknown'}</p>
                  <p className="mt-1 text-slate-500">{order.city ?? 'Unknown'}</p>
                </td>
                <td className="px-5 py-5 text-slate-500">{formatDate(order.placed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">No orders found for the selected filters.</div>
        ) : null}
      </div>
    </>
  );
}
