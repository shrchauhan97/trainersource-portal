'use client';

import { useMemo, useState } from 'react';
import { CATALOG, getProduct } from '@/lib/catalog';
import {
  calculateDraw,
  formatMl,
  formatUnits,
} from '@/lib/reconstitution';
import MiniAppBackButton from '../MiniAppBackButton';
import SyringeVisualization from './SyringeVisualization';

// Marek Health's "How To Reconstitute And Inject Peptides" — reputable clinic,
// topic-specific end-to-end. ?t=0 because whole video is on-topic.
const RECONSTITUTION_VIDEO_URL = 'https://www.youtube.com/watch?v=tcEWjyQfDLc';

const DEFAULT_SKU = 'UP-BPC157';
const DEFAULT_WATER_ML = 2;
const DEFAULT_DOSE_MCG = 250;
const WATER_STEP_ML = 0.5;
const WATER_MIN_ML = 0.5;
const WATER_MAX_ML = 5;

export default function CalculatorPage() {
  const [sku, setSku] = useState<string>(DEFAULT_SKU);
  const [waterMl, setWaterMl] = useState<number>(DEFAULT_WATER_ML);
  const [doseMcg, setDoseMcg] = useState<number>(DEFAULT_DOSE_MCG);

  const product = useMemo(() => getProduct(sku), [sku]);
  const vialMg = product?.vialMg ?? 10;

  const result = useMemo(
    () => calculateDraw({ vialMg, waterMl, doseMcg }),
    [vialMg, waterMl, doseMcg],
  );

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5 flex flex-col gap-5">
      <MiniAppBackButton />
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Reconstitution Calculator</h1>
        <p className="text-sm text-[var(--tg-hint,#94a3b8)]">
          Pick your compound, set water volume, enter the dose — we&apos;ll show
          the exact draw on a U-100 insulin syringe.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-xl bg-[var(--tg-bg-2,#1e293b)] p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--tg-hint,#94a3b8)]">
            Compound
          </span>
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full rounded-lg bg-[var(--tg-bg,#0f1115)] border border-[var(--tg-hint,#475569)] px-3 py-2 text-base"
          >
            {CATALOG.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name} — {p.vialMg}mg vial
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-[var(--tg-hint,#94a3b8)]">
            Vial
          </span>
          <span className="text-base font-medium">{vialMg} mg</span>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--tg-hint,#94a3b8)]">
            Bacteriostatic water
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease water"
              onClick={() =>
                setWaterMl((v) =>
                  Math.max(WATER_MIN_ML, Number((v - WATER_STEP_ML).toFixed(2))),
                )
              }
              className="h-10 w-10 rounded-lg bg-[var(--tg-bg,#0f1115)] border border-[var(--tg-hint,#475569)] text-lg font-medium"
            >
              −
            </button>
            <div className="flex-1 rounded-lg bg-[var(--tg-bg,#0f1115)] border border-[var(--tg-hint,#475569)] px-3 py-2 text-center text-base">
              {waterMl.toFixed(1)} ml
            </div>
            <button
              type="button"
              aria-label="Increase water"
              onClick={() =>
                setWaterMl((v) =>
                  Math.min(WATER_MAX_ML, Number((v + WATER_STEP_ML).toFixed(2))),
                )
              }
              className="h-10 w-10 rounded-lg bg-[var(--tg-bg,#0f1115)] border border-[var(--tg-hint,#475569)] text-lg font-medium"
            >
              +
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--tg-hint,#94a3b8)]">
            Desired dose (mcg)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={10}
            value={doseMcg}
            onChange={(e) => setDoseMcg(Number(e.target.value) || 0)}
            className="w-full rounded-lg bg-[var(--tg-bg,#0f1115)] border border-[var(--tg-hint,#475569)] px-3 py-2 text-base"
          />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-[var(--tg-bg-2,#1e293b)] p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--tg-hint,#94a3b8)]">
            Draw up
          </span>
          <p className="text-2xl font-semibold">
            {formatUnits(result.drawUpUnits)} units
            <span className="ml-2 text-base font-normal text-[var(--tg-hint,#94a3b8)]">
              ({formatMl(result.drawUpMl)} ml)
            </span>
          </p>
          <p className="text-xs text-[var(--tg-hint,#94a3b8)]">
            Concentration: {Math.round(result.concentrationMcgPerMl)} mcg/ml
          </p>
        </div>

        <SyringeVisualization
          drawUpUnits={result.drawUpUnits}
          warning={result.warning}
        />

        {result.warning && (
          <div className="rounded-lg bg-amber-900/40 border border-amber-700/60 px-3 py-2 text-sm text-amber-200">
            {result.warning}
          </div>
        )}
      </section>

      <a
        href={RECONSTITUTION_VIDEO_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center justify-center gap-2 rounded-xl bg-[var(--tg-btn,#3b82f6)] px-4 py-3 text-base font-medium text-[var(--tg-btn-fg,#ffffff)]"
      >
        How to reconstitute a vial
      </a>

      <p className="mt-2 text-center text-[11px] text-[var(--tg-hint,#94a3b8)]">
        For research purposes only. Not for human consumption. 21+.
      </p>
    </main>
  );
}
