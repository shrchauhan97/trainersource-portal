'use client';

import Image from 'next/image';

export interface OrderItem {
  sku: string | null;
  product_id: number;
  name: string;
  quantity: number;
  price: string;
}

export interface OrderCardData {
  id: number;
  placed_at: string; // RFC 2822 — we parse
  total: string;
  thumbnail: string | null;
  product_summary: string;
  items: OrderItem[];
}

export interface OrderCardProps {
  order: OrderCardData;
  selected: boolean;
  onToggle: (id: number) => void;
}

function daysAgo(rfcDate: string): string {
  const d = new Date(rfcDate);
  if (Number.isNaN(d.getTime())) return '';
  const ms = Date.now() - d.getTime();
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export function OrderCard({ order, selected, onToggle }: OrderCardProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(order.id)}
      className={`w-full text-left rounded-2xl border p-4 mb-3 transition-colors flex gap-3 items-center ${
        selected
          ? 'border-[var(--tg-theme-button-color,#3390ec)] bg-[var(--tg-theme-button-color,#3390ec)]/10'
          : 'border-[var(--tg-theme-hint-color,#cbd5e1)]/30 bg-[var(--tg-theme-secondary-bg-color,#f4f4f5)]'
      }`}
      aria-pressed={selected}
    >
      <div className="flex-shrink-0">
        {order.thumbnail ? (
          <Image
            src={order.thumbnail}
            alt={order.product_summary}
            width={72}
            height={72}
            className="rounded-lg object-cover"
            unoptimized
          />
        ) : (
          <div className="w-[72px] h-[72px] rounded-lg bg-[var(--tg-theme-hint-color,#cbd5e1)]/20 grid place-items-center text-2xl">
            💊
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] leading-snug mb-1 truncate">
          {order.product_summary}
        </div>
        <div className="text-[13px] text-[var(--tg-theme-hint-color,#6b7280)] mb-2">
          Ordered {daysAgo(order.placed_at)} · ${order.total}
        </div>
        <div
          className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${
            selected
              ? 'text-[var(--tg-theme-button-color,#3390ec)]'
              : 'text-[var(--tg-theme-hint-color,#6b7280)]'
          }`}
        >
          <span
            className={`w-4 h-4 rounded border inline-grid place-items-center ${
              selected
                ? 'bg-[var(--tg-theme-button-color,#3390ec)] border-[var(--tg-theme-button-color,#3390ec)] text-white'
                : 'border-[var(--tg-theme-hint-color,#cbd5e1)]'
            }`}
            aria-hidden="true"
          >
            {selected ? '✓' : ''}
          </span>
          {selected ? 'Selected' : 'Reorder'} — ${order.total}
        </div>
      </div>
    </button>
  );
}
