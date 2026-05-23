import type { Metadata } from 'next';
import { getTrainerCommissions } from '../actions';
import { DashboardTable } from '@/components/dashboard/DashboardTable';

export const metadata: Metadata = { title: 'Commissions' };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function statusTone(status: string) {
  if (status === 'paid') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  if (status === 'approved') {
    return 'bg-sky-50 text-sky-700 border-sky-200';
  }

  return 'bg-orange-50 text-orange-700 border-orange-200';
}

export default async function DashboardCommissionsPage() {
  const { commissions, summary } = await getTrainerCommissions();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.75rem] border border-[#2D4F67]/10 bg-white p-6 shadow-[0_24px_60px_rgba(45,79,103,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D4F67]/58">Pending</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#173041]">{formatCurrency(summary.pending)}</p>
        </div>
        <div className="rounded-[1.75rem] border border-[#2D4F67]/10 bg-white p-6 shadow-[0_24px_60px_rgba(45,79,103,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D4F67]/58">Approved</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#173041]">{formatCurrency(summary.approved)}</p>
        </div>
        <div className="rounded-[1.75rem] border border-[#2D4F67]/10 bg-white p-6 shadow-[0_24px_60px_rgba(45,79,103,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D4F67]/58">Paid</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#173041]">{formatCurrency(summary.paid)}</p>
        </div>
      </section>

      <DashboardTable
        title="Commission ledger"
        description="Track every order payout event from first sale through reorder commission."
        columns={['Order ID', 'Customer', 'Amount', 'Type', 'Rate', 'Status', 'Date']}
        emptyState="No commissions recorded yet."
      >
        {commissions.map((commission) => (
          <tr key={commission.id} className="border-t border-[#2D4F67]/8 align-top">
            <td className="px-6 py-4 text-sm font-semibold text-[#173041]">{commission.bigcommerceOrderId}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{commission.customerName}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{formatCurrency(Number(commission.amount))}</td>
            <td className="px-6 py-4 text-sm uppercase tracking-[0.14em] text-[#2D4F67]/74">{commission.commission_type.replace('_', ' ')}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{Number(commission.rate_snapshot) * 100}%</td>
            <td className="px-6 py-4">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusTone(commission.status)}`}>
                {commission.status}
              </span>
            </td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{formatDate(commission.created_at)}</td>
          </tr>
        ))}
      </DashboardTable>
    </div>
  );
}
