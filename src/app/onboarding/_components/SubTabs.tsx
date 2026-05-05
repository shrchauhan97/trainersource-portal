'use client';

import { useState, type ReactNode } from 'react';

// Ribbon-style sub-tabs (CONTACT / QUALIFICATIONS / SALES GOALS, etc).
// Pure UI primitive; each step screen owns its tab content.
export function SubTabs({
  tabs,
  initialKey,
  children,
}: {
  tabs: { key: string; label: string }[];
  initialKey?: string;
  children: (activeKey: string) => ReactNode;
}) {
  const [active, setActive] = useState<string>(initialKey ?? tabs[0]?.key ?? '');

  return (
    <>
      <div className="flex flex-wrap items-end gap-1">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={[
                'rounded-t-[1rem] border border-b-0 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] transition-all',
                isActive
                  ? 'border-[#41627B]/30 bg-white text-[#173041]'
                  : 'border-transparent bg-[#bfe1fe]/60 text-[#173041]/60 hover:bg-[#bfe1fe]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="rounded-[1.25rem] rounded-tl-none border border-[#41627B]/20 bg-white p-6 shadow-[0_18px_44px_rgba(45,79,103,0.08)]">
        {children(active)}
      </div>
    </>
  );
}
