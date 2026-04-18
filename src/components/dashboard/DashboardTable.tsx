import type { ReactNode } from 'react';

type DashboardTableProps = {
  title: string;
  description?: string;
  columns: string[];
  children: ReactNode;
  emptyState?: string;
};

export function DashboardTable({ title, description, columns, children, emptyState }: DashboardTableProps) {
  const rows = Array.isArray(children) ? children : [children];
  const hasRows = rows.some(Boolean);

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-[#2D4F67]/10 bg-white shadow-[0_24px_60px_rgba(45,79,103,0.10)]">
      <div className="border-b border-[#2D4F67]/8 px-6 py-5">
        <h2 className="text-xl font-black tracking-tight text-[#173041]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[#2D4F67]/70">{description}</p> : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-[#f6fbff]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#2D4F67]/58"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hasRows ? (
              children
            ) : (
              <tr>
                <td className="px-6 py-12 text-sm text-[#2D4F67]/70" colSpan={columns.length}>
                  {emptyState ?? 'No data yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
