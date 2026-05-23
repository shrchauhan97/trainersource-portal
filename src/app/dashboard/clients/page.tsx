import type { Metadata } from 'next';
import { getTrainerClients } from '../actions';
import { DashboardTable } from '@/components/dashboard/DashboardTable';

export const metadata: Metadata = { title: 'Clients' };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default async function DashboardClientsPage() {
  const clients = await getTrainerClients();

  return (
    <div className="space-y-6">
      <DashboardTable
        title="Attributed clients"
        description="Clients linked to your consumed trainer codes and attributed orders."
        columns={['Name', 'Email', 'Country', 'City', 'Order Count', 'Joined Date']}
        emptyState="No clients attributed yet. Once a customer uses your code, they will show here."
      >
        {clients.map((client) => (
          <tr key={client.id} className="border-t border-[#2D4F67]/8 align-top">
            <td className="px-6 py-4 text-sm font-semibold text-[#173041]">{client.name}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{client.email}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{client.country}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{client.city}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{client.orderCount}</td>
            <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{formatDate(client.created_at)}</td>
          </tr>
        ))}
      </DashboardTable>
    </div>
  );
}
