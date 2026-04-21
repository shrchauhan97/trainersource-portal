import Link from 'next/link';
import { getTrainerClients, getTrainerCodes, getTrainerCommissions } from './actions';
import { DashboardTable } from '@/components/dashboard/DashboardTable';
import { ConnectTelegramBanner } from '@/components/ConnectTelegramBanner';

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
  if (status === 'consumed' || status === 'paid') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  if (status === 'expired') {
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }

  if (status === 'approved') {
    return 'bg-sky-50 text-sky-700 border-sky-200';
  }

  return 'bg-orange-50 text-orange-700 border-orange-200';
}

export default async function DashboardOverviewPage() {
  const [codes, clients, commissionData] = await Promise.all([
    getTrainerCodes(),
    getTrainerClients(),
    getTrainerCommissions(),
  ]);

  const latestCodes = codes.slice(0, 4);
  const latestClients = clients.slice(0, 4);
  const latestCommissions = commissionData.commissions.slice(0, 4);

  return (
    <div className="space-y-6">
      <ConnectTelegramBanner />
      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[1.75rem] border border-[#2D4F67]/10 bg-white p-6 shadow-[0_24px_60px_rgba(45,79,103,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D4F67]/58">Overview</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-[#173041]">Stay ahead of client momentum</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#2D4F67]/72">
            Your dashboard updates from Supabase on every request, so fresh code activity, new client attribution, and payout progress stay visible without manual refresh workflows.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard/codes"
              className="rounded-full bg-[#FF5722] px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#e45120]"
            >
              Manage Codes
            </Link>
            <Link
              href="/dashboard/commissions"
              className="rounded-full border border-[#2D4F67]/16 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-[#173041] transition hover:border-[#2D4F67]/28 hover:bg-[#f6fbff]"
            >
              Review Commissions
            </Link>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-[#2D4F67]/10 bg-[#173041] p-6 text-white shadow-[0_24px_60px_rgba(45,79,103,0.16)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/54">Commission snapshot</p>
          <div className="mt-5 space-y-4">
            <div className="rounded-[1.25rem] border border-white/10 bg-white/6 p-4">
              <p className="text-sm text-white/68">Pending</p>
              <p className="mt-2 text-2xl font-black tracking-tight">{formatCurrency(commissionData.summary.pending)}</p>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/6 p-4">
              <p className="text-sm text-white/68">Approved</p>
              <p className="mt-2 text-2xl font-black tracking-tight">{formatCurrency(commissionData.summary.approved)}</p>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/6 p-4">
              <p className="text-sm text-white/68">Paid</p>
              <p className="mt-2 text-2xl font-black tracking-tight">{formatCurrency(commissionData.summary.paid)}</p>
            </div>
          </div>
        </div>
      </section>

      <DashboardTable
        title="Recent codes"
        description="Newest trainer codes and their live status."
        columns={['Code', 'Status', 'Created', 'Expires', 'Consumed By']}
        emptyState="Generate your first code to start attributing clients."
      >
        {latestCodes.map((code) => (
          <tr key={code.id} className="border-t border-[#2D4F67]/8 align-top">
            <td className="px-6 py-4 font-mono text-sm font-bold tracking-[0.2em] text-[#173041]">{code.code}</td>
            <td className="px-6 py-4">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusTone(code.displayStatus)}`}>
                {code.displayStatus}
              </span>
            </td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{formatDate(code.created_at)}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{formatDate(code.expires_at)}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{code.consumedByName ?? '—'}</td>
          </tr>
        ))}
      </DashboardTable>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardTable
          title="Newest clients"
          description="Clients most recently attributed to you."
          columns={['Client', 'Location', 'Orders', 'Joined']}
          emptyState="Clients will appear here after a code is consumed."
        >
          {latestClients.map((client) => (
            <tr key={client.id} className="border-t border-[#2D4F67]/8 align-top">
              <td className="px-6 py-4">
                <div>
                  <p className="text-sm font-semibold text-[#173041]">{client.name}</p>
                  <p className="text-sm text-[#2D4F67]/64">{client.email}</p>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-[#2D4F67]/74">
                {client.city}, {client.country}
              </td>
              <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{client.orderCount}</td>
              <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{formatDate(client.created_at)}</td>
            </tr>
          ))}
        </DashboardTable>

        <DashboardTable
          title="Latest commissions"
          description="Fresh commission events linked to your orders."
          columns={['Order ID', 'Customer', 'Amount', 'Status']}
          emptyState="Commission events will appear after attributed orders land."
        >
          {latestCommissions.map((commission) => (
            <tr key={commission.id} className="border-t border-[#2D4F67]/8 align-top">
              <td className="px-6 py-4 text-sm font-semibold text-[#173041]">{commission.bigcommerceOrderId}</td>
              <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{commission.customerName}</td>
              <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{formatCurrency(Number(commission.amount))}</td>
              <td className="px-6 py-4">
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusTone(commission.status)}`}>
                  {commission.status}
                </span>
              </td>
            </tr>
          ))}
        </DashboardTable>
      </div>
    </div>
  );
}
