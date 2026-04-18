import { getTrainerCodes } from '../actions';
import { DashboardTable } from '@/components/dashboard/DashboardTable';
import { GenerateCodeForm } from '@/components/dashboard/GenerateCodeForm';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === 'consumed') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  if (status === 'expired') {
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }

  return 'bg-orange-50 text-orange-700 border-orange-200';
}

export default async function DashboardCodesPage() {
  const codes = await getTrainerCodes();

  return (
    <div className="space-y-6">
      <GenerateCodeForm />

      <DashboardTable
        title="Generated access codes"
        description="Every trainer code with expiry and consumption status."
        columns={['Code', 'Status', 'Created At', 'Expires At', 'Consumed By']}
        emptyState="No codes generated yet. Start by creating one above."
      >
        {codes.map((code) => (
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
    </div>
  );
}
