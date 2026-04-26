// src/app/mini/partner/EarningsSummary.tsx
'use client';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

// Next payout: compute next upcoming Friday (matches portal payout cadence from
// spec §9.5). Purely display — actual payout runs are Tim-driven via ACH batch,
// not schedule-driven.
function nextPayoutLabel(now: Date = new Date()): string {
  const day = now.getDay(); // 0 = Sun, 5 = Fri
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilFriday);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(next);
}

type Props = {
  earnings: { pending: number; approved: number; paid: number };
};

export default function EarningsSummary({ earnings }: Props) {
  return (
    <section className="rounded-2xl border border-[#243444] bg-[#1a2a3a] p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#cc8218]">
        This period
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-[#94a3b8]">Pending</p>
          <p className="text-2xl font-black text-[#e6c875]">
            {formatCurrency(earnings.pending)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#94a3b8]">Paid (last)</p>
          <p className="text-2xl font-black text-[#2db5a3]">
            {formatCurrency(earnings.paid)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-[#94a3b8]">
        Next payout: <span className="text-[#cbd5e1]">{nextPayoutLabel()}</span>
      </p>
    </section>
  );
}
