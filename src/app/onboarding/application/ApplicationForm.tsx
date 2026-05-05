'use client';

import { useState, useTransition } from 'react';
import type { TrainerOnboardingState } from '../_lib/types';
import { ContactForm } from './contact-form';
import { QualificationsForm } from './qualifications-form';
import { SalesGoalsForm } from './sales-goals-form';
import { submitApplicationFinal } from './actions';

const TABS = [
  { key: 'contact', label: 'Contact' },
  { key: 'qualifications', label: 'Qualifications' },
  { key: 'sales_goals', label: 'Sales Goals' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// Step 1 — three-tab Application form. The active tab is owned here so a
// successful per-tab save can advance the user to the next tab. The NEXT
// button on the Sales Goals tab calls `submitApplicationFinal`, which moves
// onboarding_step to 'training' and redirects.
//
// We intentionally render the tab ribbon inline (rather than via the
// `<SubTabs>` primitive) because that primitive owns its own active state
// internally — we need cross-tab control here so saves can navigate forward.
// The visual styling mirrors `<SubTabs>` exactly to stay design-consistent.
export function ApplicationForm({ initial }: { initial: TrainerOnboardingState }) {
  const [active, setActive] = useState<TabKey>('contact');
  const [finalError, setFinalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function goNext() {
    if (active === 'contact') setActive('qualifications');
    else if (active === 'qualifications') setActive('sales_goals');
  }

  function finishApplication() {
    setFinalError(null);
    startTransition(async () => {
      try {
        await submitApplicationFinal();
      } catch (err) {
        // `redirect()` throws a NEXT_REDIRECT control-flow signal — let it
        // bubble so Next can handle the navigation.
        if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
        setFinalError(err instanceof Error ? err.message : 'Could not submit application.');
      }
    });
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2D4F67]/56">
          Step 1 — Application
        </p>
        <h2 className="text-2xl font-black tracking-tight text-[#173041]">Tell us about you</h2>
      </header>

      <div>
        <TabsRibbon active={active} onChange={setActive} />
        <div className="rounded-[1.25rem] rounded-tl-none border border-[#41627B]/20 bg-white p-6 shadow-[0_18px_44px_rgba(45,79,103,0.08)]">
          {active === 'contact' ? (
            <ContactForm initial={initial} onSaved={goNext} />
          ) : null}
          {active === 'qualifications' ? (
            <QualificationsForm
              initial={initial}
              onSaved={goNext}
              onBack={() => setActive('contact')}
            />
          ) : null}
          {active === 'sales_goals' ? (
            <SalesGoalsForm
              initial={initial}
              onFinalize={finishApplication}
              onBack={() => setActive('qualifications')}
              submitting={pending}
              finalError={finalError}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Same visuals as `<SubTabs>` but controlled by the parent.
function TabsRibbon({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <div className="-mb-px flex flex-wrap items-end gap-1">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
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
  );
}
