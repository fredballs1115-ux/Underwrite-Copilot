// The sensitivity grids, defined ONCE and consumed by both the in-app Model
// tab and the Excel builder — the app promises "same math as the Excel table",
// and sharing the definition makes that true by construction. No `server-only`
// import: the Model tab renders this client-side.

import { computeModel, type ModelInputs } from "./compute";

export const SENSITIVITY_PRICE_FACTORS = [0.9, 0.95, 1, 1.05, 1.1];
export const SENSITIVITY_EXIT_DELTAS = [-0.5, -0.25, 0, 0.25, 0.5]; // pct points
export const SENSITIVITY_RATE_DELTAS_BPS = [-50, -25, 0, 25, 50];
export const SENSITIVITY_HOLD_YEARS = [3, 5, 7, 10];

export interface SensitivityCell {
  price: number;
  irrPct: number | null;
  isBase: boolean;
}
export interface SensitivityRow {
  exitCapPct: number;
  isBaseRow: boolean;
  cells: SensitivityCell[];
}

/** Levered IRR across exit cap × purchase price, re-running the engine. */
export function computeSensitivityGrid(base: ModelInputs): SensitivityRow[] {
  return SENSITIVITY_EXIT_DELTAS.map((ed) => {
    const exitCapPct = base.exitCapPct + ed;
    return {
      exitCapPct,
      isBaseRow: ed === 0,
      cells: SENSITIVITY_PRICE_FACTORS.map((pf) => {
        const inp: ModelInputs = {
          ...base,
          exitCapPct,
          purchasePrice: base.purchasePrice * pf,
          loan: { ...base.loan },
        };
        return {
          price: base.purchasePrice * pf,
          irrPct: computeModel(inp).returns.leveredIrrPct,
          isBase: ed === 0 && pf === 1,
        };
      }),
    };
  });
}

/** The debt deal-killer: levered IRR at rate −50…+50 bps. */
export function computeRateStrip(
  base: ModelInputs,
): { deltaBps: number; ratePct: number; irrPct: number | null; isBase: boolean }[] {
  return SENSITIVITY_RATE_DELTAS_BPS.map((d) => {
    const ratePct = base.loan.ratePct + d / 100;
    const inp: ModelInputs = { ...base, loan: { ...base.loan, ratePct } };
    return {
      deltaBps: d,
      ratePct,
      irrPct: computeModel(inp).returns.leveredIrrPct,
      isBase: d === 0,
    };
  });
}

/** Hold-period strip: IRR and equity multiple at 3 / 5 / 7 / 10 years. */
export function computeHoldStrip(
  base: ModelInputs,
): { holdYears: number; irrPct: number | null; equityMultiple: number | null; isBase: boolean }[] {
  return SENSITIVITY_HOLD_YEARS.map((h) => {
    const inp: ModelInputs = { ...base, holdYears: h, loan: { ...base.loan } };
    const r = computeModel(inp).returns;
    return {
      holdYears: h,
      irrPct: r.leveredIrrPct,
      equityMultiple: r.equityMultiple,
      isBase: h === base.holdYears,
    };
  });
}
