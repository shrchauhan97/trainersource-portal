import { AdminSection } from '@/components/admin/AdminSection';
import { StatCard } from '@/components/admin/StatCard';
import { StatusBadge } from '@/components/admin/StatusBadge';
import {
  formatCurrency,
  formatDateTime,
  getDashboardData,
} from '@/components/admin/data';

export default async function AdminDashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] border border-slate-200/70 bg-white/80 px-6 py-8 shadow-[0_30px_100px_-48px_rgba(45,79,103,0.55)] backdrop-blur-sm sm:px-8 lg:px-10">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.38em] text-slate-400">Operations overview</p>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Full platform visibility for TrainerSource.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-500 sm:text-lg">
              Monitor partner movement, commission readiness, payout momentum, and order flow from one clinical command center.
            </p>
          </div>
          <div className="rounded-[1.6rem] border border-hyrox-orange/15 bg-hyrox-orange/8 px-5 py-4 text-sm text-slate-600 shadow-inner shadow-hyrox-orange/10">
            <p className="font-semibold uppercase tracking-[0.22em] text-hyrox-orange">Pending commissions</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              {formatCurrency(data.pendingCommissions)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Applied trainers"
          value={String(data.trainerCounts.applied)}
          detail="New applications waiting for administrative review."
        />
        <StatCard
          label="Onboarding trainers"
          value={String(data.trainerCounts.onboarding)}
          detail="Approved partners actively moving through onboarding."
          accent="orange"
        />
        <StatCard
          label="Active trainers"
          value={String(data.trainerCounts.active)}
          detail="Live partner accounts currently able to generate sales."
        />
        <StatCard
          label="Total revenue"
          value={formatCurrency(data.totalRevenue)}
          detail={`${data.totalOrders} orders captured across the full catalog.`}
          accent="orange"
        />
      </div>

      <AdminSection
        eyebrow="Activity stream"
        title="Recent operational movement"
        description="A blended feed of the latest trainer, order, commission, and payout activity."
      >
        <div className="space-y-4">
          {data.recentActivity.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-4 rounded-[1.6rem] border border-slate-200/80 bg-slate-50/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-4">
                <div
                  className={item.tone === 'orange'
                    ? 'mt-1 h-3 w-3 rounded-full bg-hyrox-orange shadow-[0_0_0_6px_rgba(255,87,34,0.12)]'
                    : 'mt-1 h-3 w-3 rounded-full bg-clinical-slate shadow-[0_0_0_6px_rgba(45,79,103,0.12)]'}
                />
                <div>
                  <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge label={item.tone === 'orange' ? 'pending' : 'active'} />
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {formatDateTime(item.occurredAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </AdminSection>
    </div>
  );
}
