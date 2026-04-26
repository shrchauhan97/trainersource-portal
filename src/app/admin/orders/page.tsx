import { AdminSection } from '@/components/admin/AdminSection';
import { SubmitButton } from '@/components/admin/SubmitButton';
import { StatusBadge } from '@/components/admin/StatusBadge';
import {
  formatCurrency,
  formatDate,
  getOrdersDirectory,
  getSearchValue,
  orderStatusOptions,
} from '@/components/admin/data';

type OrdersPageProps = {
  searchParams: Promise<{
    status?: string | string[];
    country?: string | string[];
    trainerId?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
  }>;
};

export default async function AdminOrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const status = getSearchValue(params.status);
  const country = getSearchValue(params.country);
  const trainerId = getSearchValue(params.trainerId);
  const startDate = getSearchValue(params.startDate);
  const endDate = getSearchValue(params.endDate);
  const { rows, countries, trainers } = await getOrdersDirectory({
    status,
    country,
    trainerId,
    startDate,
    endDate,
  });

  return (
    <div className="space-y-8">
      <AdminSection
        eyebrow="Order visibility"
        title="Full order ledger"
        description="Slice orders by region, trainer, date range, and delivery status to understand where demand and fulfillment are moving."
      >
        <form className="grid gap-4 rounded-[1.8rem] border border-slate-200 bg-slate-50/80 p-5 xl:grid-cols-[1fr,1fr,1fr,1fr,1fr,auto]">
          <select name="country" defaultValue={country ?? ''} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate">
            <option value="">All regions</option>
            {countries.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select name="trainerId" defaultValue={trainerId ?? ''} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate">
            <option value="">All trainers</option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.name}
              </option>
            ))}
          </select>
          <input name="startDate" type="date" defaultValue={startDate ?? ''} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate" />
          <input name="endDate" type="date" defaultValue={endDate ?? ''} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate" />
          <select name="status" defaultValue={status ?? ''} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-clinical-slate">
            <option value="">All statuses</option>
            {orderStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <SubmitButton label="Filter" pendingLabel="Filtering" variant="secondary" />
        </form>

        <div className="mt-6 overflow-x-auto rounded-[1.8rem] border border-slate-200 bg-white">
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
                    <p className="font-medium text-slate-900">{order.customerName}</p>
                    <p className="mt-1 text-slate-500">{order.customerEmail}</p>
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
      </AdminSection>
    </div>
  );
}
