import Link from 'next/link';
import {
  suspendCustomer, removeCustomer, restoreCustomer,
} from '@/app/admin/actions';
import { AdminSection } from '@/components/admin/AdminSection';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { LifecycleActionForm } from '@/components/admin/LifecycleActionForm';
import { formatDate, getCustomerDetail } from '@/components/admin/data';

type Props = { params: Promise<{ customerId: string }> };

export default async function AdminCustomerDetailPage({ params }: Props) {
  const { customerId } = await params;
  const { customer, events } = await getCustomerDetail(customerId);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200/70 bg-white/90 px-6 py-8 shadow-[0_30px_100px_-48px_rgba(45,79,103,0.5)] sm:px-8">
        <Link href="/admin/customers" className="text-[0.74rem] font-semibold uppercase tracking-[0.32em] text-slate-400 transition hover:text-hyrox-orange">
          Back to customers
        </Link>
        <h1 className="text-4xl font-black tracking-tight text-slate-950">{customer.name}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <span>{customer.email}</span>
          <span className="text-slate-300">•</span>
          <span>{customer.country}, {customer.city}</span>
          <StatusBadge label={customer.status} />
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <div><strong>Trainer:</strong> {customer.trainer?.name ?? '—'}</div>
          <div><strong>Access code:</strong> {customer.access_code?.code ?? '—'} ({customer.access_code?.status ?? '—'})</div>
          <div><strong>BC id:</strong> {customer.bigcommerce_customer_id ?? '—'}</div>
        </div>
      </div>

      <AdminSection
        eyebrow="Lifecycle actions"
        title="Suspend · Remove · Restore"
        description={
          customer.status === 'removed'
            ? 'This customer has been removed. No further actions available.'
            : 'Destructive actions require a reason and, for Remove, type the confirmation phrase.'
        }
      >
        <div className="flex flex-wrap gap-3">
          {customer.status === 'active' ? (
            <LifecycleActionForm
              action={suspendCustomer}
              idField="customerId"
              idValue={customer.id}
              verb="suspend"
              label="Suspend"
            />
          ) : null}
          {customer.status === 'suspended' ? (
            <LifecycleActionForm
              action={restoreCustomer}
              idField="customerId"
              idValue={customer.id}
              verb="restore"
              label="Restore"
            />
          ) : null}
          {customer.status !== 'removed' ? (
            <LifecycleActionForm
              action={removeCustomer}
              idField="customerId"
              idValue={customer.id}
              verb="remove"
              label="Remove"
              requiresConfirm
            />
          ) : (
            <p className="text-sm text-slate-500">Customer removed — no further actions.</p>
          )}
        </div>
      </AdminSection>

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
