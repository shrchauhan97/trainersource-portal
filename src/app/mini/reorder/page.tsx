'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MiniAppBackButton from '../MiniAppBackButton';
import { OrderCard, type OrderCardData } from './OrderCard';

// Minimal Telegram WebApp typing used by this page. Cast at use-sites to avoid
// merge conflicts with other files that also augment `window.Telegram` (e.g.
// MiniAppThemeBridge declares a narrower shape for theme-only purposes).
interface ReorderTelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  openLink: (url: string) => void;
  MainButton: {
    setText: (text: string) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  themeParams: Record<string, string>;
}

function getTg(): ReorderTelegramWebApp | undefined {
  return window.Telegram?.WebApp as ReorderTelegramWebApp | undefined;
}

interface OrdersResponse {
  first_name: string;
  orders: OrderCardData[];
}

type UiState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: OrdersResponse }
  | { kind: 'not-linked' }
  | { kind: 'auth-error' }
  | { kind: 'server-error'; message: string };

export default function ReorderPage() {
  const [state, setState] = useState<UiState>({ kind: 'loading' });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [checkingOut, setCheckingOut] = useState(false);

  // Boot Telegram WebApp
  useEffect(() => {
    const tg = getTg();
    if (!tg) return;
    tg.ready();
    tg.expand();
  }, []);

  // Fetch orders
  useEffect(() => {
    const tg = getTg();
    const initData = tg?.initData ?? '';
    if (!initData) {
      setState({ kind: 'auth-error' });
      return;
    }
    fetch('/api/reorder/orders', {
      headers: { 'X-Telegram-Init-Data': initData },
    })
      .then(async (res) => {
        if (res.status === 401) {
          setState({ kind: 'auth-error' });
          return;
        }
        if (res.status === 404) {
          setState({ kind: 'not-linked' });
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'unknown' }));
          setState({
            kind: 'server-error',
            message: body.error ?? `error ${res.status}`,
          });
          return;
        }
        const data = (await res.json()) as OrdersResponse;
        setState({ kind: 'loaded', data });
      })
      .catch((e) => {
        setState({ kind: 'server-error', message: String(e) });
      });
  }, []);

  const totalSelected = useMemo(() => {
    if (state.kind !== 'loaded') return 0;
    return state.data.orders
      .filter((o) => selected.has(o.id))
      .reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
  }, [state, selected]);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCheckout = useCallback(async () => {
    const tg = getTg();
    if (!tg) return;
    if (selected.size === 0) return;
    if (checkingOut) return;
    setCheckingOut(true);
    tg.MainButton.showProgress(true);
    tg.MainButton.disable();
    try {
      const res = await fetch('/api/reorder/checkout', {
        method: 'POST',
        headers: {
          'X-Telegram-Init-Data': tg.initData,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selected_order_ids: Array.from(selected),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'unknown' }));
        alert(`Checkout failed: ${body.error ?? res.status}`);
        return;
      }
      const { checkout_url } = (await res.json()) as { checkout_url: string };
      if (tg.openLink) {
        tg.openLink(checkout_url);
      } else {
        window.location.href = checkout_url;
      }
    } catch (e) {
      alert(`Checkout failed: ${String(e)}`);
    } finally {
      setCheckingOut(false);
      tg.MainButton.hideProgress();
      tg.MainButton.enable();
    }
  }, [selected, checkingOut]);

  // Keep MainButton in sync with selection
  useEffect(() => {
    const tg = getTg();
    if (!tg) return;
    if (selected.size === 0) {
      tg.MainButton.hide();
      return;
    }
    tg.MainButton.setText(
      `🛒 Checkout selected — $${totalSelected.toFixed(2)}`,
    );
    tg.MainButton.show();
    tg.MainButton.enable();
    tg.MainButton.onClick(handleCheckout);
    return () => {
      tg.MainButton.offClick(handleCheckout);
    };
  }, [selected.size, totalSelected, handleCheckout]);

  // Render
  return (
    <main
      className="min-h-screen px-4 py-6"
      style={{
        background: '#14202b',
        color: '#e8eefa',
      }}
    >
      <MiniAppBackButton />
      <header className="mb-6">
        <h1 className="text-2xl font-bold mb-1">🛒 Reorder</h1>
        {state.kind === 'loaded' ? (
          <p className="text-[15px] text-[var(--tg-theme-hint-color,#6b7280)]">
            Welcome back, {state.data.first_name}.
          </p>
        ) : null}
      </header>

      {state.kind === 'loading' ? (
        <div className="space-y-3">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : null}

      {state.kind === 'not-linked' ? (
        <EmptyState
          title="Not linked yet"
          body="Go back to the concierge bot and run /link to connect your Ultimate Peptides account. Then reopen this Mini App."
        />
      ) : null}

      {state.kind === 'auth-error' ? (
        <EmptyState
          title="Session expired"
          body="Reopen this Mini App from a fresh message in the Ultimate Peptides concierge."
        />
      ) : null}

      {state.kind === 'server-error' ? (
        <EmptyState
          title="Couldn't load your orders"
          body={state.message}
        />
      ) : null}

      {state.kind === 'loaded' ? (
        state.data.orders.length === 0 ? (
          <EmptyState
            title="No recent orders"
            body="When you place an order on ultimate-peptides.com, it'll show up here for easy reordering."
          />
        ) : (
          <div>
            {state.data.orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                selected={selected.has(o.id)}
                onToggle={toggle}
              />
            ))}
            {selected.size === 0 ? (
              <p className="text-center text-[13px] text-[var(--tg-theme-hint-color,#6b7280)] mt-6">
                Tap an order above to select it.
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </main>
  );
}

function Skeleton() {
  return (
    <div
      className="rounded-2xl h-[104px] animate-pulse"
      style={{
        background:
          'var(--tg-theme-secondary-bg-color, rgba(203, 213, 225, 0.3))',
      }}
    />
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-3">📭</div>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-[15px] text-[var(--tg-theme-hint-color,#6b7280)] leading-relaxed">
        {body}
      </p>
    </div>
  );
}
