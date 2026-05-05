import Link from 'next/link';
import { AdminSection } from '@/components/admin/AdminSection';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { formatDate, getCustomersList } from '@/components/admin/data';

export default async function AdminCustomersPage() {
  const customers = await getCustomersList();
  return (
    <div className="space-y-8">
      <AdminSection
        eyebrow="Lifecycle"
        title="Customers"
        description="Every customer onboarded via an access code. Click a row to suspend, remove, or restore."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                <th className="pb-3">Name</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Trainer</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-slate-200/60 align-top">
                  <td className="py-3 pr-3">
                    <Link href={`/admin/customers/${c.id}`} className="font-semibold text-slate-900 hover:text-hyrox-orange">
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-3 text-slate-600">{c.email}</td>
                  <td className="py-3 pr-3 text-slate-600">{c.trainer_name ?? '—'}</td>
                  <td className="py-3 pr-3"><StatusBadge label={c.status} /></td>
                  <td className="py-3 pr-3 text-slate-600">{formatDate(c.created_at)}</td>
                </tr>
              ))}
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No customers yet.
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
