// The report's sensitivity heatmap (Feature 5): levered IRR / equity multiple
// across exit cap (rows) × rent growth (columns). PURE — built on the same
// tested lever geometry and scenario runner as the Sensitivity Playground, so
// the PDF's grid and the on-screen sliders can never disagree.

import type { UnderwriteInputs } from "./engine";
import { leverValues, runScenario } from "./playground";

export interface HeatCell {
  irrPct: number | null; // decimal
  em: number | null;
}

export interface CapGrowthGrid {
  /** exit cap per row (decimals) — the base sits at baseRow */
  capRows: number[];
  /** rent growth per column (decimals) — the base sits at baseCol */
  growthCols: number[];
  /** cells[row][col] */
  cells: HeatCell[][];
  baseRow: number;
  baseCol: number;
}

/** Clamped stops can collide when the base sits at a lever bound — drop the
 *  exact duplicates so the printed grid never repeats a row/column. (Stops
 *  arrive sorted; duplicates are bitwise-equal clamp results.) */
const uniqueStops = (vals: number[]): number[] =>
  vals.filter((v, i) => i === 0 || v !== vals[i - 1]);

/** Up to 5×5: exit cap ±2×25bps down the rows, rent growth ±2×50bps across.
 *  The bordered "base" is the CLAMPED base — identical to the playground's
 *  effective base. For route-derived inputs the clamp is the identity, so it
 *  also equals the raw engine base; only direct callers with out-of-range
 *  inputs see the difference. */
export function buildCapGrowthGrid(inputs: UnderwriteInputs): CapGrowthGrid {
  const rawCaps = leverValues("exitCapPct", inputs.exitCapPct);
  const rawGrowths = leverValues("rentGrowthPct", inputs.rentGrowthPct);
  const capRows = uniqueStops(rawCaps);
  const growthCols = uniqueStops(rawGrowths);
  const cells = capRows.map((cap) =>
    growthCols.map((g) => {
      const m = runScenario(inputs, { exitCapPct: cap, rentGrowthPct: g });
      return { irrPct: m.leveredIrrPct, em: m.leveredEquityMultiple };
    }),
  );
  return {
    capRows,
    growthCols,
    cells,
    // rawCaps[2]/rawGrowths[2] IS the clamped base (leverValues clamps the
    // base before spreading stops), so the index lookup can't miss.
    baseRow: capRows.indexOf(rawCaps[2]),
    baseCol: growthCols.indexOf(rawGrowths[2]),
  };
}

export type HeatBucket = "green" | "yellow" | "orange" | "red" | "none";

/** The IC color scale (per spec): green >15% IRR, yellow 10–15%, orange
 *  5–10%, red <5%; gray when no IRR exists. Backgrounds are print-soft so the
 *  ink text stays readable. Bucketed from the SAME 0.1-point precision the
 *  cell prints (toFixed(1) of the percent), so a cell's color can never
 *  contradict its printed number at a band edge. */
export function heatBucket(irrPct: number | null): HeatBucket {
  if (irrPct == null || !Number.isFinite(irrPct)) return "none";
  const r = Number((irrPct * 100).toFixed(1)) / 100;
  if (r > 0.15) return "green";
  if (r >= 0.1) return "yellow";
  if (r >= 0.05) return "orange";
  return "red";
}

export const HEAT_BG: Record<HeatBucket, string> = {
  green: "#d7ecdf",
  yellow: "#f3ead0",
  orange: "#f6ddc6",
  red: "#f4cfca",
  none: "#eef0ef",
};

export const HEAT_LEGEND: { bucket: HeatBucket; label: string }[] = [
  { bucket: "green", label: "IRR > 15%" },
  { bucket: "yellow", label: "10–15%" },
  { bucket: "orange", label: "5–10%" },
  { bucket: "red", label: "< 5%" },
];

/** "15.2% / 1.9x" — the compact cell text ("—" when a leg is uncomputable). */
export function heatCellText(cell: HeatCell): string {
  let irr = "—";
  if (cell.irrPct != null && Number.isFinite(cell.irrPct)) {
    const pct = (cell.irrPct * 100).toFixed(1);
    // toFixed keeps the sign of a tiny negative ("-0.0") — print it as zero.
    irr = `${pct === "-0.0" ? "0.0" : pct}%`;
  }
  const em =
    cell.em == null || !Number.isFinite(cell.em) ? "—" : `${cell.em.toFixed(1)}x`;
  return `${irr} / ${em}`;
}
