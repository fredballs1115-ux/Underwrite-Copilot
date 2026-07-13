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

/** 5×5: exit cap ±2×25bps down the rows, rent growth ±2×50bps across. */
export function buildCapGrowthGrid(inputs: UnderwriteInputs): CapGrowthGrid {
  const capRows = leverValues("exitCapPct", inputs.exitCapPct);
  const growthCols = leverValues("rentGrowthPct", inputs.rentGrowthPct);
  const cells = capRows.map((cap) =>
    growthCols.map((g) => {
      const m = runScenario(inputs, { exitCapPct: cap, rentGrowthPct: g });
      return { irrPct: m.leveredIrrPct, em: m.leveredEquityMultiple };
    }),
  );
  return { capRows, growthCols, cells, baseRow: 2, baseCol: 2 };
}

export type HeatBucket = "green" | "yellow" | "orange" | "red" | "none";

/** The IC color scale (per spec): green >15% IRR, yellow 10–15%, orange
 *  5–10%, red <5%; gray when no IRR exists. Backgrounds are print-soft so the
 *  ink text stays readable. */
export function heatBucket(irrPct: number | null): HeatBucket {
  if (irrPct == null || !Number.isFinite(irrPct)) return "none";
  if (irrPct > 0.15) return "green";
  if (irrPct >= 0.1) return "yellow";
  if (irrPct >= 0.05) return "orange";
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
  const irr =
    cell.irrPct == null || !Number.isFinite(cell.irrPct)
      ? "—"
      : `${(cell.irrPct * 100).toFixed(1)}%`;
  const em =
    cell.em == null || !Number.isFinite(cell.em) ? "—" : `${cell.em.toFixed(1)}x`;
  return `${irr} / ${em}`;
}
