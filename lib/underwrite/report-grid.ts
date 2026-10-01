// The report's sensitivity pages (Feature 5): levered IRR / equity multiple
// swept over the levers that decide a screen — exit cap × rent growth, and
// price × exit cap (the retrade grid). PURE — built on the same tested lever
// geometry and scenario runner as the Sensitivity Playground, so the PDF and
// the on-screen sliders can never disagree.

import { withArticle } from "@/lib/article";
import { computeUnderwrite, type UnderwriteInputs } from "./engine";
import { costAssumptionsLine } from "./cost-note";
import type { DerivedModel, InputSource } from "./inputs";
import { leverValues, runScenario, sliderValues, type PlaygroundLevers } from "./playground";
import { floorWords, floorsWords, fmtBid, solveMaxBid, type BidFloors, type BidMetrics } from "./solver";

/** Where each of the model's inputs came from (lib/underwrite/inputs). */
export type ModelSources = DerivedModel["sources"];

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

/** "1.9x" — the cell's secondary line. An equity multiple is distributions
 *  over equity, so a figure at or below zero is not a multiple of anything:
 *  the cell shows a dash rather than stating "-17.9x" as a fact. */
export function heatCellEm(cell: HeatCell): string {
  return cell.em == null || !Number.isFinite(cell.em) || cell.em <= 0
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
export function gridTakeaway(
  grid: CapGrowthGrid,
  hurdlePct: number,
  /** what the growth axis grows: a hotel's is its RevPAR, not a rent */
  growth = "rent growth",
): string {
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
        : `holds ${p(hurdlePct)}+ up to ${withArticle(fmtPctPt(Math.max(...capsClearing), 2))} exit cap at base growth`;

  const growthPart =
    growthsClearing.length === 0
      ? `no tested ${growth} clears it at the base exit cap`
      : growthsClearing.length === grid.growthCols.length
        ? `every tested growth rate clears it at the base exit cap`
        : `needs at least ${fmtPctPt(Math.min(...growthsClearing))} ${growth} at the base exit cap`;

  return `The deal ${capPart}, and ${growthPart}.`;
}

// ---- The page's data bundle ------------------------------------------------

export interface MaxBidLine {
  price: number;
  deltaPct: number;
  unbounded: boolean;
  /** the floor that gives first at the solved price (the deal page's
   *  "your 5% cash-on-cash floor binds"); null where it is unbounded */
  binding?: keyof BidFloors | null;
  /** the model's IRR, year-1 cash-on-cash and going-in cap at that price */
  at?: BidMetrics | null;
}

/** The floors a max bid was solved on, and whose they are: the buy box's
 *  (every floor it sets, as the deal page solves) or the screening
 *  hurdle's IRR alone, where the box sets none. */
export interface MaxBidFloors {
  floors: BidFloors;
  from: "buybox" | "screening";
}

/**
 * The levers the deal page's max bid is solved under at rest: each
 * slider's base stop — the base clamped into the lever's range, which for
 * a route-derived model is the base itself — so the report's bid is the
 * page's own call on the same inputs.
 */
export function pageBaseLevers(inputs: UnderwriteInputs): Partial<PlaygroundLevers> {
  const base = (lever: "exitCapPct" | "rentGrowthPct" | "vacancyPct") => {
    const s = sliderValues(lever, inputs[lever]);
    return s.values[s.baseIdx];
  };
  return { exitCapPct: base("exitCapPct"), rentGrowthPct: base("rentGrowthPct"), vacancyPct: base("vacancyPct") };
}

export interface SensitivityData {
  grid: CapGrowthGrid;
  priceGrid: PriceCapGrid;
  /** percent points — the buy-box target IRR when set, else 15 */
  hurdlePct: number;
  hurdleSource: "buybox" | "default";
  takeaway: string;
  /** the highest price that clears the floors (solver), null when none in
   *  the searched range does */
  maxBid: MaxBidLine | null;
  /** what the max bid was solved on; absent on a bundle built before it
   *  was recorded, which solved the hurdle's IRR alone */
  maxBidFloors?: MaxBidFloors;
  /** why the report leaves the model's returns out, or null where it may
   *  print them (`placeholderReturnsLine`); null where no sources were given */
  withheld?: string | null;
  /** what the modeled price is — the ask, a share grossed up to the whole,
   *  an auction's floor, NOI over the going-in cap — as the derived model
   *  marks it; null where no sources were given */
  priceSource?: ModelSources["purchasePrice"] | null;
  /** the model's base case the grids are struck around; null where no
   *  sources were given, which cannot say what is a default */
  baseCase?: BaseCase | null;
}

/**
 * The base case the grids are struck around, as the workbook's Deal Summary
 * holds it: the price, the loan, the equity, the hold and year 1's NOI, each
 * input with where it came from (so a default never reads as the sponsor's
 * case); the returns the ink-bordered cells show and year 1's coverage; and
 * the sources and uses. Every figure is the engine's (`computeUnderwrite`),
 * every source the derived model's own.
 */
export interface BaseCase {
  price: number;
  priceSource: InputSource | null;
  loan: number;
  /** loan to cost, decimal — the engine sizes the loan off the price plus
   *  closing costs and the acquisition fee */
  ltc: number;
  ltcSource: InputSource | null;
  equity: number;
  holdYears: number;
  holdSource: InputSource | null;
  noiY1: number;
  noiSource: InputSource | null;
  /** the all-in rate, decimal, with its source — dated where today's
   *  curve seeded it */
  rate: number;
  rateSource: InputSource | null;
  amortYears: number;
  /** months of interest-only; 999 is the whole term */
  ioMonths: number;
  leveredIrr: number | null;
  equityMultiple: number | null;
  cocY1: number | null;
  dscrY1: number | null;
  debtYieldY1: number | null;
  closingCosts: number;
  acqFee: number;
  financingCosts: number;
  totalUses: number;
  /** what the returns carry for buying and selling (lib/underwrite/cost-note) */
  costLine: string;
}

export function buildBaseCase(inputs: UnderwriteInputs, sources: ModelSources): BaseCase {
  const uw = computeUnderwrite(inputs);
  const su = uw.sourcesUses;
  const y1 = uw.cashFlow[0];
  return {
    price: inputs.purchasePrice,
    priceSource: sources.purchasePrice ?? null,
    loan: su.loanAmount,
    ltc: inputs.ltc,
    ltcSource: sources.ltc ?? null,
    equity: su.equity,
    holdYears: uw.holdYears,
    holdSource: sources.holdMonths ?? null,
    noiY1: y1?.noi ?? 0,
    noiSource: sources.inPlaceRentAnnual ?? null,
    rate: inputs.allInRatePct,
    rateSource: sources.allInRatePct ?? null,
    amortYears: inputs.amortMonths / 12,
    ioMonths: inputs.ioMonths,
    leveredIrr: uw.returns.leveredIrrPct,
    equityMultiple: uw.returns.leveredEquityMultiple,
    cocY1: y1 && su.equity > 0 ? y1.leveredCashFlow / su.equity : null,
    dscrY1: y1?.dscrNoi ?? null,
    debtYieldY1: y1?.debtYield ?? null,
    closingCosts: su.closingCosts,
    acqFee: su.acqFee,
    financingCosts: su.financingCosts,
    totalUses: su.totalUses,
    costLine: costAssumptionsLine(inputs),
  };
}

/** What the caller knows beside the inputs. */
export interface SensitivityOptions {
  /** where each input came from — the derived model's own sources, which
   *  say whether the price and the year-1 NOI are the documents' or
   *  placeholders */
  sources?: ModelSources | null;
  /** the buy box's return floors (lib/underwrite/solver `bidFloors`): the
   *  max bid is solved on every one set, the deal page's own call; none set
   *  solves the screening hurdle's IRR alone */
  floors?: BidFloors | null;
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Why the report leaves the model's returns out, or null where it may print
 * them. A price or a year-1 NOI the model had to assume (lib/underwrite/inputs
 * marks it "assumption": the $10M placeholder price where none was read, an
 * assumed 6% going-in NOI where no NOI the price supports was) makes every
 * IRR and every bid solved on it the placeholder's — printed beside a real
 * deal's grids, "$10M (ask)" read as the ask. Said from the sources alone:
 * an assumed price means no price was read from the memorandum, which is all
 * this line claims.
 */
export function placeholderReturnsLine(inputs: UnderwriteInputs, sources: ModelSources | null | undefined): string | null {
  if (!sources) return null;
  const price = sources.purchasePrice?.provenance === "assumption";
  const noi = sources.inPlaceRentAnnual?.provenance === "assumption";
  const out = "The IRR grids and the max bid are left out:";
  if (price && noi) {
    return `${out} no price was read from the memorandum, nor a year-1 NOI the model could run on, so the model runs on ${withArticle(`${usd0(inputs.purchasePrice)} placeholder price`)} and an assumed NOI, and its returns would be a placeholder's.`;
  }
  if (price) {
    return `${out} no price was read from the memorandum, so the model runs on ${withArticle(`${usd0(inputs.purchasePrice)} placeholder`)} and its returns would be the placeholder's.`;
  }
  if (noi) {
    return `${out} no year-1 NOI the model could run on was read from the memorandum, so the model runs on an assumed one and its returns would be the assumption's.`;
  }
  return null;
}

/** Everything the report's sensitivity page renders, in one pure build. */
export function buildSensitivityData(
  inputs: UnderwriteInputs,
  hurdlePct?: number | null,
  opts: SensitivityOptions = {},
): SensitivityData {
  const hurdle =
    hurdlePct != null && Number.isFinite(hurdlePct) && hurdlePct > 0
      ? hurdlePct
      : DEFAULT_HURDLE_PCT;
  const grid = buildCapGrowthGrid(inputs);
  const priceGrid = buildPriceCapGrid(inputs);
  // The deal page solves its max bid on every floor the buy box sets — an
  // IRR, a cash-on-cash, a going-in cap — under the sliders' base stops,
  // and names the one that binds. The report makes the same call, so the
  // two never print different bids for one deal; only a box with no floor
  // falls back to the screening hurdle's IRR the grids are graded on.
  const box = opts.floors && (opts.floors.minIrr != null || opts.floors.minCoc != null || opts.floors.minCap != null) ? opts.floors : null;
  const maxBidFloors: MaxBidFloors = box ? { floors: box, from: "buybox" } : { floors: { minIrr: hurdle / 100 }, from: "screening" };
  const solved = solveMaxBid(inputs, maxBidFloors.floors, pageBaseLevers(inputs));
  return {
    grid,
    priceGrid,
    hurdlePct: hurdle,
    hurdleSource: hurdlePct != null && Number.isFinite(hurdlePct) && hurdlePct > 0 ? "buybox" : "default",
    takeaway: gridTakeaway(grid, hurdle),
    maxBid:
      solved.price != null && solved.deltaPct != null
        ? { price: solved.price, deltaPct: solved.deltaPct, unbounded: solved.unbounded, binding: solved.binding, at: solved.at }
        : null,
    maxBidFloors,
    withheld: placeholderReturnsLine(inputs, opts.sources),
    priceSource: opts.sources?.purchasePrice ?? null,
    baseCase: opts.sources ? buildBaseCase(inputs, opts.sources) : null,
  };
}

const pct1 = (d: number | null | undefined, dp = 1) => (d == null || !Number.isFinite(d) ? "—" : `${(d * 100).toFixed(dp)}%`);

/**
 * The max bid in the deal page's words (the playground's max-bid card): the
 * floors it clears and whose they are, the bid as the page prints it
 * (rounded down, `fmtBid`), its distance from the modeled price, the floor
 * that binds, and the model's IRR, year-1 cash-on-cash and going-in cap at
 * that price. A bundle with no recorded floors reads as the screening
 * hurdle's IRR, which is what it was solved on.
 */
export function maxBidSentence(s: Pick<SensitivityData, "maxBid" | "maxBidFloors" | "hurdlePct" | "hurdleSource">): string {
  const f = s.maxBidFloors ?? { floors: { minIrr: s.hurdlePct / 100 }, from: "screening" as const };
  const box = f.from === "buybox";
  const hurdle = `${Number(s.hurdlePct.toFixed(1))}%`;
  const what = box
    ? `your buy box's floors (${floorsWords(f.floors)})`
    : s.hurdleSource === "buybox"
      ? `your ${hurdle} IRR target`
      : `the ${hurdle} screening hurdle`;
  const bid = s.maxBid;
  if (!bid) {
    return box
      ? `No price inside the tested range clears ${what} under these assumptions: the deal's economics, not its price, are the blocker.`
      : `No price inside the tested range holds ${what} under these assumptions.`;
  }
  if (bid.unbounded) {
    return box
      ? `Max bid: ${what} hold even at twice the modeled price, so the box is not the constraint on this deal.`
      : `Max bid holding ${what}: clears at every tested price — the constraint never binds inside the search range.`;
  }
  const delta = `${bid.deltaPct > 0 ? "+" : ""}${(bid.deltaPct * 100).toFixed(1)}% vs the modeled price`;
  const binds = box && bid.binding ? `; your ${floorWords(bid.binding, f.floors)} floor binds` : "";
  const at = bid.at
    ? ` At that price: IRR ${pct1(bid.at.irr)}, year-1 cash-on-cash ${pct1(bid.at.coc)}, going-in cap ${pct1(bid.at.cap, 2)}.`
    : "";
  return `Max bid ${box ? "clearing" : "holding"} ${what}: ${fmtBid(bid.price)} (${delta})${binds}.${at}`;
}
