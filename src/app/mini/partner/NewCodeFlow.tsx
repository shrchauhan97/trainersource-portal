// src/app/mini/partner/NewCodeFlow.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function getTg(): TelegramWebAppM3 | null {
  if (typeof window === 'undefined') return null;
  return (window.Telegram?.WebApp as TelegramWebAppM3 | undefined) ?? null;
}

type IssueCodeResponse = {
  id: string;
  code: string;
  label: string;
  landing_url: string;
  deep_link: string;
  qr_url: string;
  expires_at: string;
};

type FlowState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'issued'; data: IssueCodeResponse }
  | { kind: 'error'; message: string };

type Props = {
  onIssued?: () => void;
};

export default function NewCodeFlow({ onIssued }: Props) {
  const [state, setState] = useState<FlowState>({ kind: 'idle' });
  const handlerRef = useRef<(() => void) | null>(null);

  const issueCode = useCallback(
    async (label: string) => {
      const tg = getTg();
      if (!tg) return;
      tg.MainButton.showProgress();
      setState({ kind: 'submitting' });
      try {
        const res = await fetch('/api/mini/partner/issue-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': tg.initData,
          },
          body: JSON.stringify({ label }),
        });
        if (!res.ok) {
          const body = await res.text();
          setState({ kind: 'error', message: `${res.status} ${body.slice(0, 120)}` });
          tg.HapticFeedback?.notificationOccurred('error');
          return;
        }
        const data = (await res.json()) as IssueCodeResponse;
        setState({ kind: 'issued', data });
        tg.HapticFeedback?.notificationOccurred('success');
        onIssued?.();
      } catch (err) {
        setState({ kind: 'error', message: (err as Error).message });
        tg.HapticFeedback?.notificationOccurred('error');
      } finally {
        tg.MainButton.hideProgress();
      }
    },
    [onIssued],
  );

  const promptForLabel = useCallback(() => {
    const tg = getTg();
    if (!tg) return;
    // Telegram showPopup cannot collect free text — fall through to
    // window.prompt inside the webview (works on both iOS and Android since
    // Bot API 6.2).
    const label = window.prompt('Client name or label for this code:');
    if (!label || !label.trim()) return;
    void issueCode(label.trim());
  }, [issueCode]);

  useEffect(() => {
    const tg = getTg();
    if (!tg) return;

    const handler = () => {
      promptForLabel();
    };
    handlerRef.current = handler;

    tg.MainButton.setText('+ New code');
    tg.MainButton.show();
    tg.MainButton.enable();
    tg.MainButton.onClick(handler);

    return () => {
      if (handlerRef.current) tg.MainButton.offClick(handlerRef.current);
      tg.MainButton.hide();
    };
  }, [promptForLabel]);

  function shareCode() {
    if (state.kind !== 'issued') return;
    const tg = getTg();
    if (!tg) return;
    // switchInlineQuery opens the Telegram contact picker with a pre-filled
    // inline query. The user picks a chat; Telegram triggers the bot's inline
    // handler, which returns a share card. If the bot doesn't implement inline
    // mode, this is still the right UX primitive — it opens the share sheet.
    const msg = `Use my code ${state.data.code} — ${state.data.deep_link}`;
    tg.switchInlineQuery(msg, ['users', 'groups']);
  }

  if (state.kind === 'idle' || state.kind === 'submitting') {
    return (
      <section className="rounded-2xl border border-dashed border-[#2f4459] bg-[#14202b] p-4 text-center">
        <p className="text-xs text-[#94a3b8]">
          {state.kind === 'submitting'
            ? 'Issuing code…'
            : 'Tap the + New code button below to create a code.'}
        </p>
      </section>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className="rounded-2xl border border-[#7f1d1d] bg-[#2b1414] p-4 text-center">
        <p className="text-sm font-semibold text-[#fca5a5]">Couldn&apos;t issue code</p>
        <p className="mt-1 text-xs font-mono text-[#94a3b8] break-all">
          {state.message}
        </p>
        <button
          onClick={() => setState({ kind: 'idle' })}
          className="mt-2 text-xs text-[#cbd5e1] underline"
        >
          Try again
        </button>
      </section>
    );
  }

  // state.kind === 'issued'
  return (
    <section className="rounded-2xl border border-[#259a8a] bg-[#0e2b26] p-4 text-center space-y-2">
      <p className="text-sm font-semibold text-[#2db5a3]">Code created</p>
      <p className="font-mono text-xl tracking-wider text-[#e6c875]">
        {state.data.code}
      </p>
      <p className="text-xs text-[#94a3b8] break-all">{state.data.deep_link}</p>
      <div className="flex gap-2 justify-center pt-1">
        <button
          onClick={shareCode}
          className="rounded-full px-4 py-1.5 text-sm font-semibold"
          style={{
            background: 'linear-gradient(135deg, #e6c875 0%, #cc8218 100%)',
            color: '#14202b',
          }}
        >
          Share
        </button>
        <button
          onClick={() => setState({ kind: 'idle' })}
          className="rounded-full border border-[#2f4459] text-[#cbd5e1] px-4 py-1.5 text-sm"
        >
          Done
        </button>
      </div>
    </section>
  );
}
