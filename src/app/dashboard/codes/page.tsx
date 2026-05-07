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
        columns={['Code', 'QR', 'Status', 'Created At', 'Expires At', 'Consumed By']}
        emptyState="No codes generated yet. Start by creating one above."
      >
        {codes.map((code) => {
          const isShareable = code.displayStatus === 'active';
          return (
            <tr key={code.id} className="border-t border-[#2D4F67]/8 align-top">
              <td className="px-6 py-4 font-mono text-sm font-bold tracking-[0.2em] text-[#173041]">{code.code}</td>
              <td className="px-6 py-4">
                {isShareable ? (
                  <a
                    href={`/api/qr/${code.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open QR for ${code.code} in a new tab — right-click to save`}
                    className="inline-flex items-center gap-2 rounded-md border border-[#2D4F67]/10 bg-white p-1 transition hover:border-[#FF5722]/40 hover:shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={`QR for ${code.code}`}
                      src={`/api/qr/${code.code}`}
                      className="h-12 w-12"
                      width={48}
                      height={48}
                    />
                    <span className="pr-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#2D4F67]/74">Open</span>
                  </a>
                ) : (
                  <span className="text-xs text-[#2D4F67]/40">—</span>
                )}
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusTone(code.displayStatus)}`}>
                  {code.displayStatus}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{formatDate(code.created_at)}</td>
              <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{formatDate(code.expires_at)}</td>
              <td className="px-6 py-4 text-sm text-[#2D4F67]/74">{code.consumedByName ?? '—'}</td>
            </tr>
          );
        })}
      </DashboardTable>
    </div>
  );
}
