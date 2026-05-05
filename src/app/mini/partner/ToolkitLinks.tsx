// src/app/mini/partner/ToolkitLinks.tsx
'use client';

function getTg(): TelegramWebAppM3 | null {
  if (typeof window === 'undefined') return null;
  return (window.Telegram?.WebApp as TelegramWebAppM3 | undefined) ?? null;
}

type ToolkitItem = {
  label: string;
  href: string;
};

const ITEMS: ToolkitItem[] = [
  { label: 'One-pager PDF', href: '/toolkit/one-pager.pdf' },
  { label: 'Cheat sheets', href: '/toolkit/cheat-sheets.pdf' },
  { label: 'WhatsApp scripts', href: '/toolkit/whatsapp-scripts.pdf' },
  { label: 'Objection guide', href: '/toolkit/objection-guide.pdf' },
];

export default function ToolkitLinks() {
  function openPdf(href: string) {
    const url = `${window.location.origin}${href}`;
    // Use openLink — Telegram in-app browser handles PDFs cleanly on both iOS
    // and Android. Fall back to window.open if WebApp is unavailable.
    const tg = getTg();
    if (tg) {
      tg.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  }

  return (
    <section className="rounded-2xl border border-[#243444] bg-[#1a2a3a] p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#cc8218]">
        Toolkit
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {ITEMS.map((item) => (
          <button
            key={item.href}
            onClick={() => openPdf(item.href)}
            className="rounded-xl border border-[#2f4459] bg-[#14202b] p-3 text-left text-sm text-[#cbd5e1] transition-colors active:border-[#cc8218] active:bg-[#1e3145]"
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
