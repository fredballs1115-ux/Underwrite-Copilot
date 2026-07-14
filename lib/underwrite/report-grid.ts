// The report's sensitivity pages (Feature 5): levered IRR / equity multiple
// swept over the levers that decide a screen — exit cap × rent growth, and
// price × exit cap (the retrade grid). PURE — built on the same tested lever
// geometry and scenario runner as the Sensitivity Playground, so the PDF and
// the on-screen sliders can never disagree.

import type { UnderwriteInputs } from "./engine";
import { leverValues, runScenario } from "./playground";
import { solveMaxBid } from "./solver";

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

/** The retrade grid: purchase price (rows, ±10% in 5% steps around the
 *  modeled price) × exit cap (columns, the same stops as the cap/growth
 *  grid). This is the page's second question — "what does paying less do?" */
export interface PriceCapGrid {
  /** dollar price per row + its % delta vs the modeled base */
  priceRows: { price: number; deltaPct: number }[];
  capCols: number[];
  cells: HeatCell[][];
  baseRow: number;
  baseCol: number;
}

const PRICE_DELTAS = [-0.1, -0.05, 0, 0.05, 0.1];

export function buildPriceCapGrid(inputs: UnderwriteInputs): PriceCapGrid {
  const rawCaps = leverValues("exitCapPct", inputs.exitCapPct);
  const capCols = uniqueStops(rawCaps);
  const priceRows = PRICE_DELTAS.map((d) => ({
    price: inputs.purchasePrice * (1 + d),
    deltaPct: d,
  }));
  const cells = priceRows.map((p) =>
    capCols.map((cap) => {
      const m = runScenario(inputs, { purchasePrice: p.price, exitCapPct: cap });
      return { irrPct: m.leveredIrrPct, em: m.leveredEquityMultiple };
    }),
  );
  return {
    priceRows,
    capCols,
    cells,
    baseRow: PRICE_DELTAS.indexOf(0),
    baseCol: capCols.indexOf(rawCaps[2]),
  };
}

// ---------------------------------------------------------------------------
// The color scale. Diverging around the BUYER'S hurdle (their buy-box target
// IRR when set; 15% otherwise) instead of a hardcoded traffic light: greens
// deepen as the deal clears the hurdle by more, warms deepen as it misses by
// more, and lightness peaks at the boundary — so the story reads even in
// grayscale print or to color-blind readers, and the numbers are always
// printed in every cell regardless.
// ---------------------------------------------------------------------------

export type HeatBucket =
  | "well_above" //  ≥ hurdle + 6pt
  | "above" //       hurdle + 3 … + 6
  | "clears" //      hurdle … + 3
  | "close" //       hurdle − 3 … hurdle
  | "short" //       hurdle − 6 … − 3
  | "deep_short" //  < hurdle − 6
  | "none";

export const DEFAULT_HURDLE_PCT = 15;

/** Bucketed from the SAME 0.1-point precision the cell prints (toFixed(1) of
 *  the percent), so a cell's color can never contradict its printed number
 *  at a band edge. `hurdlePct` is percent points (13 = 13%). */
export function heatBucket(
  irrPct: number | null,
  hurdlePct: number = DEFAULT_HURDLE_PCT,
): HeatBucket {
  if (irrPct == null || !Number.isFinite(irrPct)) return "none";
  const r = Number((irrPct * 100).toFixed(1));
  const d = r - hurdlePct;
  if (d >= 6) return "well_above";
  if (d >= 3) return "above";
  if (d >= 0) return "clears";
  if (d >= -3) return "close";
  if (d >= -6) return "short";
  return "deep_short";
}

/** Print-soft but clearly stepped backgrounds — ink text stays readable on
 *  every one. Greens sit in the brand's teal family. */
export const HEAT_BG: Record<HeatBucket, string> = {
  well_above: "#7cc4a4",
  above: "#a6d9c0",
  clears: "#d4ecdf",
  close: "#fae5bd",
  short: "#f3c69b",
  deep_short: "#e69a8d",
  none: "#e9edeb",
};

/** Legend entries with ranges spelled out against the actual hurdle —
 *  "21%+", "18–21%", … for a 15% hurdle. (WinAnsi-safe: standard Helvetica
 *  in the PDF cannot print "≥" — it isn't in CP1252.) */
export function heatLegend(
  hurdlePct: number = DEFAULT_HURDLE_PCT,
): { bucket: HeatBucket; label: string }[] {
  const p = (n: number) => `${Number(n.toFixed(1))}%`;
  return [
    { bucket: "well_above", label: `IRR ${p(hurdlePct + 6)}+` },
    { bucket: "above", label: `${p(hurdlePct + 3)}–${p(hurdlePct + 6)}` },
    { bucket: "clears", label: `${p(hurdlePct)}–${p(hurdlePct + 3)}` },
    { bucket: "close", label: `${p(hurdlePct - 3)}–${p(hurdlePct)}` },
    { bucket: "short", label: `${p(hurdlePct - 6)}–${p(hurdlePct - 3)}` },
    { bucket: "deep_short", label: `< ${p(hurdlePct - 6)}` },
  ];
}

// ---- Cell text -------------------------------------------------------------

/** "15.2%" — the cell's headline line ("—" when no IRR exists). */
export function heatCellIrr(cell: HeatCell): string {
  if (cell.irrPct == null || !Number.isFinite(cell.irrPct)) return "—";
  const pct = (cell.irrPct * 100).toFixed(1);
  // toFixed keeps the sign of a tiny negative ("-0.0") — print it as zero.
  return `${pct === "-0.0" ? "0.0" : pct}%`;
}

/** "1.9x" — the cell's secondary line. */
export function heatCellEm(cell: HeatCell): string {
  return cell.em == null || !Number.isFinite(cell.em)
    ? "—"
    : `${cell.em.toFixed(1)}x`;
}

/** Legacy compact form, kept for anything still printing one line. */
export function heatCellText(cell: HeatCell): string {
  return `${heatCellIrr(cell)} / ${heatCellEm(cell)}`;
}

// ---- Takeaways -------------------------------------------------------------

const fmtPctPt = (dec: number, dp = 1): string => `${(dec * 100).toFixed(dp)}%`;

const clears = (cell: HeatCell, hurdlePct: number): boolean =>
  cell.irrPct != null &&
  Number.isFinite(cell.irrPct) &&
  Number((cell.irrPct * 100).toFixed(1)) >= hurdlePct;

/**
 * One plain-English line an IC can lift verbatim: along the BASE cap row,
 * how little growth still clears the hurdle; along the BASE growth column,
 * how much exit-cap expansion the deal survives.
 */
export function gridTakeaway(grid: CapGrowthGrid, hurdlePct: number): string {
  const p = (n: number) => `${Number(n.toFixed(1))}%`;
  const baseRow = grid.cells[grid.baseRow];
  const growthsClearing = grid.growthCols.filter((_, c) =>
    clears(baseRow[c], hurdlePct),
  );
  const capsClearing = grid.capRows.filter((_, r) =>
    clears(grid.cells[r][grid.baseCol], hurdlePct),
  );

  // WinAnsi-safe wording (no "≥" — it isn't printable in the PDF's Helvetica).
  const capPart =
    capsClearing.length === 0
      ? `no tested exit cap clears ${p(hurdlePct)} at base growth`
      : capsClearing.length === grid.capRows.length
        ? `every tested exit cap clears ${p(hurdlePct)} at base growth`
        : `holds ${p(hurdlePct)}+ up to a ${fmtPctPt(Math.max(...capsClearing), 2)} exit cap at base growth`;

  const growthPart =
    growthsClearing.length === 0
      ? `no tested rent growth clears it at the base exit cap`
      : growthsClearing.length === grid.growthCols.length
        ? `every tested growth rate clears it at the base exit cap`
        : `needs at least ${fmtPctPt(Math.min(...growthsClearing))} rent growth at the base exit cap`;

  return `The deal ${capPart}, and ${growthPart}.`;
}

// ---- The page's data bundle ------------------------------------------------

export interface MaxBidLine {
  price: number;
  deltaPct: number;
  unbounded: boolean;
}

export interface SensitivityData {
  grid: CapGrowthGrid;
  priceGrid: PriceCapGrid;
  /** percent points — the buy-box target IRR when set, else 15 */
  hurdlePct: number;
  hurdleSource: "buybox" | "default";
  takeaway: string;
  /** max price holding ≥ hurdle IRR (solver), null when unattainable */
  maxBid: MaxBidLine | null;
}

/** Everything the report's sensitivity page renders, in one pure build. */
export function buildSensitivityData(
  inputs: UnderwriteInputs,
  hurdlePct?: number | null,
): SensitivityData {
  const hurdle =
    hurdlePct != null && Number.isFinite(hurdlePct) && hurdlePct > 0
      ? hurdlePct
      : DEFAULT_HURDLE_PCT;
  const grid = buildCapGrowthGrid(inputs);
  const priceGrid = buildPriceCapGrid(inputs);
  const solved = solveMaxBid(inputs, { minIrr: hurdle / 100 });
  return {
    grid,
    priceGrid,
    hurdlePct: hurdle,
    hurdleSource: hurdlePct != null && Number.isFinite(hurdlePct) && hurdlePct > 0 ? "buybox" : "default",
    takeaway: gridTakeaway(grid, hurdle),
    maxBid:
      solved.price != null && solved.deltaPct != null
        ? { price: solved.price, deltaPct: solved.deltaPct, unbounded: solved.unbounded }
        : null,
  };
}
