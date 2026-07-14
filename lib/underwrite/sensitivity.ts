/**
 * Sensitivity grids for the Deal Summary tab (Feature 1). Pure: each cell is a
 * full re-underwrite with one or two inputs perturbed, so the grids are exactly
 * consistent with the base case (the center cell equals the base IRR/EM). The
 * workbook mirrors these in a hidden engine tab with live formulas; this module
 * both feeds a static cross-check and documents the exact perturbations.
 */
import { computeUnderwrite, type UnderwriteInputs } from "./engine";

export interface SensAxis {
  label: string;
  /** display values along the axis (decimals for rates, months/$ otherwise) */
  values: number[];
  /** index of the base-case value (bolded in the workbook) */
  baseIndex: number;
}
export interface SensCell {
  irrPct: number | null; // levered IRR, decimal
  emx: number | null; // levered equity multiple
}
export interface SensGrid {
  key: string;
  title: string;
  rowAxis: SensAxis;
  colAxis: SensAxis;
  /** cells[rowIndex][colIndex] */
  cells: SensCell[][];
}

export interface SensIncrements {
  capStep: number; // 0.0025
  monthsStep: number; // 12
  priceStep: number; // ~1.5% of price, rounded
  ltcStep: number; // 0.025
  rateStep: number; // 0.0025
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Default increments. Price step defaults to $500K but scales toward ~1.5%
 *  of price so it stays meaningful on very large or very small deals. */
export function defaultIncrements(inp: UnderwriteInputs): SensIncrements {
  const priceStep = roundTo(clamp(inp.purchasePrice * 0.015, 250_000, 2_000_000), 50_000);
  return { capStep: 0.0025, monthsStep: 12, priceStep, ltcStep: 0.025, rateStep: 0.0025 };
}

/** Five values centered on `base`: base−2step … base+2step (min-clamped). */
function centeredAxis(label: string, base: number, step: number, min = -Infinity): SensAxis {
  const values = [-2, -1, 0, 1, 2].map((k) => Math.max(min, base + k * step));
  return { label, values, baseIndex: 2 };
}

const cellFor = (inp: UnderwriteInputs): SensCell => {
  const r = computeUnderwrite(inp).returns;
  return { irrPct: r.leveredIrrPct, emx: r.leveredEquityMultiple };
};

export function buildSensitivityGrids(
  inp: UnderwriteInputs,
  inc: SensIncrements = defaultIncrements(inp),
): SensGrid[] {
  // 1. Exit Cap (cols) × Hold Period (rows)
  const capAxis = centeredAxis("Exit Cap", inp.exitCapPct, inc.capStep, 0.0025);
  const holdAxis = centeredAxis("Hold (months)", inp.holdMonths, inc.monthsStep, 12);
  const grid1: SensGrid = {
    key: "capHold",
    title: "Exit Cap × Hold Period",
    rowAxis: holdAxis,
    colAxis: capAxis,
    cells: holdAxis.values.map((hold) =>
      capAxis.values.map((cap) => cellFor({ ...inp, exitCapPct: cap, holdMonths: hold })),
    ),
  };

  // 2. Exit Cap (cols) × Purchase Price (rows)
  const priceAxis = centeredAxis("Purchase Price", inp.purchasePrice, inc.priceStep, 0);
  const grid2: SensGrid = {
    key: "capPrice",
    title: "Exit Cap × Purchase Price",
    rowAxis: priceAxis,
    colAxis: capAxis,
    cells: priceAxis.values.map((price) =>
      capAxis.values.map((cap) => cellFor({ ...inp, exitCapPct: cap, purchasePrice: price })),
    ),
  };

  // 3. Leverage/LTC (cols) × All-in Rate (rows)
  const ltcAxis = centeredAxis("LTC", inp.ltc, inc.ltcStep, 0);
  const rateAxis = centeredAxis("All-in Rate", inp.allInRatePct, inc.rateStep, 0.0025);
  const grid3: SensGrid = {
    key: "leverageRate",
    title: "Leverage × Rate",
    rowAxis: rateAxis,
    colAxis: ltcAxis,
    cells: rateAxis.values.map((rate) =>
      ltcAxis.values.map((ltc) => cellFor({ ...inp, ltc, allInRatePct: rate })),
    ),
  };

  return [grid1, grid2, grid3];
}

/** "18.4% / 2.1x" — the combined string each grid cell displays. */
export function formatSensCell(c: SensCell): string {
  const irr = c.irrPct == null ? "n/a" : `${(c.irrPct * 100).toFixed(1)}%`;
  const em = c.emx == null ? "n/a" : `${c.emx.toFixed(1)}x`;
  return `${irr} / ${em}`;
}
