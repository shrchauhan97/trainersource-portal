// Pure functions for peptide reconstitution math — no DOM, no React.
// Exported so other surfaces (printable labels, dose sheets) can reuse the
// math without touching the calculator UI.

export interface DrawInput {
  vialMg: number;   // peptide mass in the vial (mg)
  waterMl: number;  // bacteriostatic water added (ml)
  doseMcg: number;  // desired dose per injection (mcg)
}

export interface DrawResult {
  drawUpMl: number;               // volume to draw (ml)
  drawUpUnits: number;            // same volume on U-100 insulin syringe (units)
  concentrationMcgPerMl: number;  // resulting concentration
  warning: string | null;
}

const MCG_PER_MG = 1000;
const UNITS_PER_ML_U100 = 100;

export function calculateDraw(input: DrawInput): DrawResult {
  const { vialMg, waterMl, doseMcg } = input;

  if (vialMg <= 0 || waterMl <= 0 || doseMcg <= 0) {
    return {
      drawUpMl: 0,
      drawUpUnits: 0,
      concentrationMcgPerMl: 0,
      warning: 'Invalid input — all values must be greater than zero.',
    };
  }

  const totalVialMcg = vialMg * MCG_PER_MG;
  const concentrationMcgPerMl = totalVialMcg / waterMl;
  const drawUpMl = (doseMcg / totalVialMcg) * waterMl;
  const drawUpUnits = drawUpMl * UNITS_PER_ML_U100;

  let warning: string | null = null;
  if (doseMcg > totalVialMcg) {
    warning =
      'Requested dose exceeds the total mass in this vial. ' +
      'Reduce the dose or use a larger vial.';
  } else if (drawUpUnits > UNITS_PER_ML_U100) {
    warning =
      'Draw volume exceeds a standard U-100 insulin syringe (100 units). ' +
      'Use a larger syringe or reconstitute with less water.';
  }

  return {
    drawUpMl,
    drawUpUnits,
    concentrationMcgPerMl,
    warning,
  };
}

export function formatMl(ml: number): string {
  return ml.toFixed(2);
}

export function formatUnits(units: number): string {
  return units.toFixed(1);
}
