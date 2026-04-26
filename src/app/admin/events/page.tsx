import Link from 'next/link';
import { AdminSection } from '@/components/admin/AdminSection';
import { formatDate, getRecentLifecycleEvents } from '@/components/admin/data';

function entityHref(entityType: string, entityId: string): string | null {
  if (entityType === 'customer') return `/admin/customers/${entityId}`;
  if (entityType === 'trainer') return `/admin/trainers/${entityId}`;
  return null;
}

export default async function AdminEventsPage() {
  const events = await getRecentLifecycleEvents();
  return (
    <div className="space-y-8">
      <AdminSection
        eyebrow="Audit"
        title={`Lifecycle events (latest ${events.length})`}
        description="Every Suspend, Remove, and Restore action across customers, trainers, and access codes. Newest first."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                <th className="pb-3">When</th>
                <th className="pb-3">Actor</th>
                <th className="pb-3">Entity</th>
                <th className="pb-3">Change</th>
                <th className="pb-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const href = entityHref(e.entity_type, e.entity_id);
                const shortId = e.entity_id.slice(0, 8);
                return (
                  <tr key={e.id} className="border-t border-slate-200/60 align-top">
                    <td className="py-3 pr-3 text-slate-600">{formatDate(e.created_at)}</td>
                    <td className="py-3 pr-3 text-slate-600">{e.actor_name}</td>
                    <td className="py-3 pr-3 font-mono text-xs">
                      {href ? (
                        <Link href={href} className="text-slate-900 hover:text-hyrox-orange">
                          {e.entity_type} {shortId}
                        </Link>
                      ) : (
                        <span className="text-slate-600">{e.entity_type} {shortId}</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs text-slate-900">
                      {e.from_status ?? '—'} → {e.to_status}
                    </td>
                    <td className="py-3 pr-3 text-slate-600">
                      {e.reason_category}
                      {e.reason_note ? <span className="text-slate-500"> · {e.reason_note}</span> : null}
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No lifecycle events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSection>
    </div>
  );
}
