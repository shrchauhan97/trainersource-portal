import { describe, it, expect } from 'vitest';
import {
  calculateDraw,
  formatMl,
  formatUnits,
} from '@/lib/reconstitution';

describe('calculateDraw', () => {
  it('classic BPC-157 example: 10mg vial, 2ml water, 250mcg dose', () => {
    const r = calculateDraw({ vialMg: 10, waterMl: 2, doseMcg: 250 });
    // 10mg = 10000mcg; 250/10000 = 0.025; 0.025 * 2ml = 0.05ml
    expect(r.drawUpMl).toBeCloseTo(0.05, 4);
    // 0.05 ml on U-100 = 5 units
    expect(r.drawUpUnits).toBeCloseTo(5, 1);
    expect(r.concentrationMcgPerMl).toBe(5000);
    expect(r.warning).toBeNull();
  });

  it('retatrutide example: 10mg, 2ml water, 2mg dose', () => {
    const r = calculateDraw({ vialMg: 10, waterMl: 2, doseMcg: 2000 });
    // 2000/10000 = 0.2; 0.2 * 2 = 0.4ml → 40 units
    expect(r.drawUpMl).toBeCloseTo(0.4, 3);
    expect(r.drawUpUnits).toBeCloseTo(40, 1);
  });

  it('returns a warning when the requested dose exceeds the vial', () => {
    const r = calculateDraw({ vialMg: 5, waterMl: 2, doseMcg: 6000 });
    // 6mg requested from a 5mg vial — the dose cannot come from this vial
    expect(r.warning).toMatch(/exceeds/i);
  });

  it('returns a warning when draw exceeds 100 units (above U-100 scale)', () => {
    const r = calculateDraw({ vialMg: 2, waterMl: 1, doseMcg: 2000 });
    // 2000/2000 = 1.0; 1.0 * 1ml = 1.0ml = 100 units (exactly at top, no warning)
    expect(r.drawUpUnits).toBeCloseTo(100, 1);
    // Push above U-100 scale: larger water for same dose → bigger volume
    const r2 = calculateDraw({ vialMg: 2, waterMl: 2, doseMcg: 1500 });
    // 1500/2000 = 0.75; 0.75 * 2ml = 1.5ml → 150 units
    expect(r2.drawUpUnits).toBeCloseTo(150, 1);
    expect(r2.warning).toMatch(/exceeds/i);
  });

  it('rejects zero or negative inputs with warning, does not divide by zero', () => {
    const r = calculateDraw({ vialMg: 0, waterMl: 2, doseMcg: 250 });
    expect(r.warning).toMatch(/invalid/i);
    expect(Number.isFinite(r.drawUpMl)).toBe(true);
  });
});

describe('formatMl', () => {
  it('rounds to 2 decimal places', () => {
    expect(formatMl(0.049999)).toBe('0.05');
    expect(formatMl(0.4)).toBe('0.40');
    expect(formatMl(1)).toBe('1.00');
  });
});

describe('formatUnits', () => {
  it('rounds to 1 decimal place', () => {
    expect(formatUnits(4.95)).toBe('5.0');
    expect(formatUnits(40)).toBe('40.0');
    expect(formatUnits(3.14159)).toBe('3.1');
  });
});
