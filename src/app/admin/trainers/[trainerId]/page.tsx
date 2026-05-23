import type { Metadata } from 'next';
import Link from 'next/link';

import { suspendTrainer, removeTrainer, restoreTrainer, updateTrainer } from '@/app/admin/actions';

export const metadata: Metadata = { title: 'Trainer detail' };
import { AdminSection } from '@/components/admin/AdminSection';
import { LifecycleActionForm } from '@/components/admin/LifecycleActionForm';
import { StatCard } from '@/components/admin/StatCard';
import { SubmitButton } from '@/components/admin/SubmitButton';
import { StatusBadge } from '@/components/admin/StatusBadge';
import {
  formatCurrency,
  formatDate,
  formatPercent,
  getTrainerDetail,
  getTrainerLifecycleEvents,
  trainerStatusOptions,
} from '@/components/admin/data';

type TrainerDetailPageProps = {
  params: Promise<{
    trainerId: string;
  }>;
};

export default async function AdminTrainerDetailPage({ params }: TrainerDetailPageProps) {
  const { trainerId } = await params;
  const [data, events] = await Promise.all([
    getTrainerDetail(trainerId),
    getTrainerLifecycleEvents(trainerId),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200/70 bg-white/90 px-6 py-8 shadow-[0_30px_100px_-48px_rgba(45,79,103,0.5)] sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div>
          <Link href="/admin/trainers" className="text-[0.74rem] font-semibold uppercase tracking-[0.32em] text-slate-400 transition hover:text-hyrox-orange">
            Back to trainers
          </Link>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">{data.trainer.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>{data.trainer.email}</span>
            <span className="text-slate-300">•</span>
            <span>{data.trainer.country}, {data.trainer.city}</span>
            <StatusBadge label={data.trainer.status} />
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-hyrox-orange/15 bg-hyrox-orange/8 px-5 py-4 text-sm text-slate-600">
          <p className="font-semibold uppercase tracking-[0.22em] text-hyrox-orange">Commission profile</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {formatPercent(Number(data.trainer.commission_rate ?? 0))}
          </p>
          <p className="mt-1">Reorder {formatPercent(Number(data.trainer.reorder_commission_rate ?? 0))}</p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clients" value={String(data.clientsCount)} detail="Customers attributed to this trainer." />
        <StatCard label="Orders" value={String(data.totalOrders)} detail="Orders linked through attributed customers." accent="orange" />
        <StatCard label="Commission earned" value={formatCurrency(data.totalCommissionEarned)} detail="Lifetime commission value across all statuses." />
        <StatCard label="Active codes" value={String(data.activeCodes)} detail="Currently usable access codes tied to this trainer." accent="orange" />
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.15fr,0.85fr]">
        <AdminSection eyebrow="CRUD" title="Trainer record" description="Edit the core trainer profile, compensation setup, and payout details.">
          <form action={updateTrainer} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="trainerId" value={data.trainer.id} />
            <input name="name" defaultValue={data.trainer.name} required className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <input name="email" type="email" defaultValue={data.trainer.email} required className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <input name="phone" defaultValue={data.trainer.phone ?? ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <input name="slug" defaultValue={data.trainer.slug ?? ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <input name="country" defaultValue={data.trainer.country} required className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <input name="city" defaultValue={data.trainer.city} required className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <select name="tier" defaultValue={data.trainer.tier} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate">
              <option value="trainer">Trainer</option>
              <option value="lead">Lead</option>
              <option value="network_partner">Network Partner</option>
            </select>
            <select name="status" defaultValue={data.trainer.status} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate">
              {trainerStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input name="commission_rate" type="number" min="0" max="1" step="0.01" defaultValue={Number(data.trainer.commission_rate ?? 0)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <input name="reorder_commission_rate" type="number" min="0" max="1" step="0.01" defaultValue={Number(data.trainer.reorder_commission_rate ?? 0)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <input name="max_clients" type="number" min="1" step="1" defaultValue={data.trainer.max_clients} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <input name="wise_account" defaultValue={data.trainer.wise_account ?? ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate" />
            <input name="niche" defaultValue={data.trainer.niche ?? ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate md:col-span-2" />
            <input name="social_media" defaultValue={data.trainer.social_media ?? ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-slate md:col-span-2" />
            <div className="md:col-span-2">
              <SubmitButton label="Save trainer" pendingLabel="Saving trainer" variant="primary" />
            </div>
          </form>
          <div className="mt-4 flex flex-wrap gap-3">
            {data.trainer.status === 'active' ? (
              <LifecycleActionForm
                action={suspendTrainer}
                idField="trainerId"
                idValue={data.trainer.id}
                verb="suspend"
                label="Suspend trainer"
              />
            ) : null}
            {data.trainer.status === 'suspended' ? (
              <>
                <LifecycleActionForm
                  action={restoreTrainer}
                  idField="trainerId"
                  idValue={data.trainer.id}
                  verb="restore"
                  label="Restore trainer"
                />
                <LifecycleActionForm
                  action={removeTrainer}
                  idField="trainerId"
                  idValue={data.trainer.id}
                  verb="remove"
                  label="Remove trainer"
                  requiresConfirm
                />
              </>
            ) : null}
          </div>
        </AdminSection>

        <AdminSection eyebrow="Profile context" title="Operational notes" description="Quick context to support escalation and payout reviews.">
          <div className="space-y-5 text-sm text-slate-600">
            <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-slate-400">Created</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{formatDate(data.trainer.created_at)}</p>
            </div>
            <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-slate-400">Onboarding completed</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{data.trainer.onboarding_completed_at ? formatDate(data.trainer.onboarding_completed_at) : 'Not completed'}</p>
            </div>
            <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50/80 p-5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-slate-400">Referral slug</p>
              <p className="mt-2 text-lg font-bold text-slate-900">/{data.trainer.slug ?? 'pending'}</p>
            </div>
          </div>
        </AdminSection>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <AdminSection eyebrow="Recent orders" title="Latest attributed orders">
          <div className="space-y-3">
            {data.recentOrders.map((order) => (
              <div key={order.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">#{order.bigcommerce_order_id}</p>
                    <p className="mt-1 text-sm text-slate-500">{order.customerName} · {order.customerEmail}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge label={order.status} />
                    <p className="font-semibold text-slate-900">{formatCurrency(Number(order.total ?? 0))}</p>
                  </div>
                </div>
              </div>
            ))}
            {!data.recentOrders.length ? <p className="text-sm text-slate-500">No orders yet.</p> : null}
          </div>
        </AdminSection>

        <AdminSection eyebrow="Recent commissions" title="Latest earned commission lines">
          <div className="space-y-3">
            {data.recentCommissions.map((commission) => (
              <div key={commission.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">Order #{commission.orderReference}</p>
                    <p className="mt-1 text-sm text-slate-500">{commission.commission_type.replace('_', ' ')} at {formatPercent(Number(commission.rate_snapshot ?? 0))}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge label={commission.status} />
                    <p className="font-semibold text-slate-900">{formatCurrency(Number(commission.amount ?? 0))}</p>
                  </div>
                </div>
              </div>
            ))}
            {!data.recentCommissions.length ? <p className="text-sm text-slate-500">No commissions yet.</p> : null}
          </div>
        </AdminSection>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <AdminSection eyebrow="Access codes" title="Latest trainer codes">
          <div className="space-y-3">
            {data.recentCodes.map((code) => (
              <div key={code.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{code.code}</p>
                    <p className="mt-1 text-sm text-slate-500">Expires {formatDate(code.expires_at)}</p>
                  </div>
                  <StatusBadge label={code.status} />
                </div>
              </div>
            ))}
            {!data.recentCodes.length ? <p className="text-sm text-slate-500">No trainer codes yet.</p> : null}
          </div>
        </AdminSection>

        <AdminSection eyebrow="Payout history" title="Latest payout batches">
          <div className="space-y-3">
            {data.recentPayouts.map((payout) => (
              <div key={payout.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{formatCurrency(Number(payout.total ?? 0))}</p>
                    <p className="mt-1 text-sm text-slate-500">{payout.period_start} → {payout.period_end}</p>
                  </div>
                  <StatusBadge label={payout.status} />
                </div>
              </div>
            ))}
            {!data.recentPayouts.length ? <p className="text-sm text-slate-500">No payouts yet.</p> : null}
          </div>
        </AdminSection>
      </div>

      <AdminSection eyebrow="Audit" title={`Lifecycle events (${events.length})`}>
        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {e.from_status ?? '—'} → {e.to_status}
                  </span>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{e.reason_category}</span>
                </div>
                <span className="text-xs text-slate-500">{formatDate(e.created_at)} · {e.actor_name}</span>
              </div>
              {e.reason_note ? (
                <p className="mt-2 text-sm italic text-slate-600">&quot;{e.reason_note}&quot;</p>
              ) : null}
            </div>
          ))}
          {events.length === 0 ? <p className="text-sm text-slate-500">No lifecycle events yet.</p> : null}
        </div>
      </AdminSection>
    </div>
  );
}
