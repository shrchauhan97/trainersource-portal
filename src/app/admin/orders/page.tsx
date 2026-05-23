import type { Metadata } from 'next';
import { AdminSection } from '@/components/admin/AdminSection';
import { SubmitButton } from '@/components/admin/SubmitButton';
import {
  getOrdersDirectory,
  getSearchValue,
  orderStatusOptions,
} from '@/components/admin/data';

export const metadata: Metadata = { title: 'Orders' };

import { OrdersTableLive } from './orders-table-live';

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

        <OrdersTableLive initialRows={rows} />
      </AdminSection>
    </div>
  );
}
