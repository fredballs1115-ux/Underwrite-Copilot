// The report's sensitivity pages (Feature 5): levered IRR / equity multiple
// swept over the levers that decide a screen — exit cap × rent growth, and
// price × exit cap (the retrade grid). PURE — built on the same tested lever
// geometry and scenario runner as the Sensitivity Playground, so the PDF and
// the on-screen sliders can never disagree.

import { withArticle } from "@/lib/article";
import { findingWithholdsReturns, type PlausibilityFinding } from "@/lib/deal-strategy";
import { moneyCompact } from "@/lib/plan-facts";
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
 *  modelled price) × exit cap (columns, the same stops as the cap/growth
 *  grid). This is the page's second question — "what does paying less do?" */
export interface PriceCapGrid {
  /** dollar price per row + its % delta vs the modelled base */
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
 * One plain-English line an IC can lift verbatim: along the BASE growth
 * column, how much exit-cap expansion the deal survives; along the BASE cap
 * row, how little growth still clears the hurdle. Two full clauses, each
 * with its own subject: "The deal no tested exit cap clears 13% at base
 * growth" printed wherever the base missed the hurdle at every tested cap
 * or cleared it at every one (research pass 35).
 *
 * `subject` names what the grids are of where the price did not buy the
 * building — a note's collateral, a position's building, an equity's whole
 * (the report's `gridSubjectOf`) — and leads the line, so it is never
 * called "the deal"; null for the deal itself.
 */
export function gridTakeaway(
  grid: CapGrowthGrid,
  hurdlePct: number,
  /** what the growth axis grows: a hotel's is its RevPAR, not a rent */
  growth = "rent growth",
  subject: string | null = null,
): string {
  const p = (n: number) => `${Number(n.toFixed(1))}%`;
  const hurdle = p(hurdlePct);
  const baseRow = grid.cells[grid.baseRow];
  const growthsClearing = grid.growthCols.filter((_, c) =>
    clears(baseRow[c], hurdlePct),
  );
  const capsClearing = grid.capRows.filter((_, r) =>
    clears(grid.cells[r][grid.baseCol], hurdlePct),
  );
  // Named once: the deal in the first clause that needs a subject, or the
  // subject that leads the line; "it" after that.
  const named = subject ? "it" : "the deal";

  // WinAnsi-safe wording (no "≥" — it isn't printable in the PDF's Helvetica).
  const capSome = capsClearing.length > 0 && capsClearing.length < grid.capRows.length;
  const capPart =
    capsClearing.length === 0
      ? `no tested exit cap clears ${hurdle}`
      : !capSome
        ? `every tested exit cap clears ${hurdle}`
        : `${named} holds ${hurdle}+ up to ${withArticle(fmtPctPt(Math.max(...capsClearing), 2))} exit cap`;
  // After a clause with a subject, the hurdle is said again rather than as
  // an "it" that could be the deal.
  const target = capSome ? hurdle : "it";
  const growthPart =
    growthsClearing.length === 0
      ? `no tested ${growth} clears ${target}`
      : growthsClearing.length === grid.growthCols.length
        ? `every tested growth rate clears ${target}`
        : `${capSome || subject ? "it" : "the deal"} needs at least ${fmtPctPt(Math.min(...growthsClearing))} ${growth}`;

  const line = `at base growth, ${capPart}; at the base exit cap, ${growthPart}.`;
  return subject ? `${subject[0].toUpperCase()}${subject.slice(1)}: ${line}` : `${line[0].toUpperCase()}${line.slice(1)}`;
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
  /** on a leasehold, the levered IRR at that price on the lease's term
   *  (`SensitivityOptions.termRead`, decimal; null where the sale there does
   *  not repay the loan) — the bid itself is solved on the model's
   *  capitalised exit; absent where no term was read */
  onTerm?: { irr: number | null } | null;
}

/** The floors a max bid was solved on, and whose they are: the buy box's
 *  (every floor it sets, as the deal page solves) or the screening
 *  hurdle's IRR alone, where the box sets none. */
export interface MaxBidFloors {
  floors: BidFloors;
  from: "buybox" | "screening";
}

/**
 * Where no price clears the buy box's floors together, which floor never
 * clears and which clear on their own (research pass 35: the hotel's report
 * listed three floors and named none, under a grid whose IRR cleared at 10%
 * off). Each floor solved alone, over the same range and under the same
 * levers as the bid; and the one reason the engine can prove for a
 * cash-on-cash floor: year 1's cash flow before debt service negative
 * whatever the price, since neither its NOI nor its capital spending moves
 * with the price.
 */
export interface NoBidRead {
  alone: { key: keyof BidFloors; price: number | null; unbounded: boolean }[];
  /** year 1's NOI is under its capital spending and reserves, so its cash
   *  flow is negative at every price */
  yearOneNegative: boolean;
  /** year 1's capital budget where it is what turns year 1 negative — the
   *  year's NOI covers its other capital lines; null otherwise */
  yearOneCapital: number | null;
}

const FLOOR_ORDER = ["minIrr", "minCoc", "minCap"] as const;

export function noBidRead(inputs: UnderwriteInputs, floors: BidFloors, levers: Partial<PlaygroundLevers>): NoBidRead {
  const set = FLOOR_ORDER.filter((k) => floors[k] != null);
  const alone = set.map((key) => {
    const one = set.length === 1 ? { price: null, unbounded: false } : solveMaxBid(inputs, { [key]: floors[key] }, levers);
    return { key, price: one.price, unbounded: one.unbounded };
  });
  const y1 = computeUnderwrite({ ...inputs, expenseLines: inputs.expenseLines.map((l) => ({ ...l })), ...levers }).cashFlow[0];
  const yearOneNegative = !!y1 && y1.noi - y1.totalCapEx < 0;
  const yearOneCapital =
    yearOneNegative && y1.capitalImprovements > 0 && y1.noi - (y1.totalCapEx - y1.capitalImprovements) >= 0 ? y1.capitalImprovements : null;
  return { alone, yearOneNegative, yearOneCapital };
}

/**
 * The levers the deal page's max bid is solved under at rest: each
 * slider's base stop — the base clamped into the lever's range, which for
 * a route-derived model is the base itself (the vacancy lever reaches the
 * model's own 99%, research pass 38: at a 95% stop the report solved its
 * bid at a vacancy its grids did not run) — so the report's bid is the
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
  /** where the buy box's floors clear at no price together, each floor's
   *  own solve (`noBidRead`); null where a bid solved or the box set none */
  noBid?: NoBidRead | null;
  /** why no max bid is solved, said in its place (`nearlyVacantReason`: a
   *  building the model runs at 90% vacancy or more); null or absent where
   *  one is */
  maxBidWithheld?: string | null;
  /** why the report leaves the model's returns out, or null where it may
   *  print them (`placeholderReturnsLine`); null where no sources were given */
  withheld?: string | null;
  /** what the modelled price is — the ask, a share grossed up to the whole,
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
  /** the exit cap, decimal, with its source — the grids' bold row, and on a
   *  deal whose memorandum states no cap the model's default (research
   *  pass 35: the base case named neither) */
  exitCap: number;
  exitCapSource: InputSource | null;
  /** what every year's cash flow carries below the NOI, each with its
   *  source: the asset-management fee (decimal of equity a year) and the
   *  capital reserves ($ a square foot a year, grown with expenses) */
  amFee: number;
  amFeeSource: InputSource | null;
  reservesPsf: number;
  reservesSource: InputSource | null;
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
    exitCap: inputs.exitCapPct,
    exitCapSource: sources.exitCapPct ?? null,
    amFee: inputs.amFeePctEquity,
    amFeeSource: sources.amFeePctEquity ?? null,
    reservesPsf: inputs.reservesPsf,
    reservesSource: sources.reservesPsf ?? null,
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
  /** a leasehold's exit on its term — the caller's lib/leasehold-exit
   *  `readLeaseholdExit` at the inputs given, its levered IRR as a decimal,
   *  or null where the lease leaves no term to price at the sale. The max
   *  bid is solved on the model's capitalised exit, a perpetuity's, so the
   *  report says what the bid returns on the term too (research pass 35),
   *  by the term block's own arithmetic, never a second formula. */
  termRead?: ((inputs: UnderwriteInputs) => { irr: number | null } | null) | null;
  /** the occupancy the model read, decimal (the derived model's
   *  `meta.occupancyPct`): where the model runs the building 90% vacant or
   *  more, the max bid is withheld and the sentence names the occupancy
   *  stated (`nearlyVacantReason`) */
  occupancyPct?: number | null;
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
 * this line claims. A figure the memorandum states that the model does not
 * run (`InputSource.notRun`: a leased fee's ground rent, its income) is
 * named, never said to be unread.
 */
export function placeholderReturnsLine(inputs: UnderwriteInputs, sources: ModelSources | null | undefined): string | null {
  const reason = placeholderReason(inputs, sources);
  return reason ? `The IRR grids and the max bid are left out: ${reason}` : null;
}

/**
 * Why the model's returns are a placeholder's, in the words after a
 * surface's own opening — the one rule the report, the deal page's
 * sensitivity playground and the workbook's Deal Summary each say it by:
 * "no price was read from the memorandum, so the model runs on a
 * $10,000,000 placeholder and its returns would be the placeholder's."
 * `printed`: the workbook prints the returns (live, so the reader can enter
 * the figure), so they "are" the placeholder's; the report and the page
 * withhold them, so they "would be". `priceEntered`: the reader typed a
 * price over the placeholder (the playground), which lifts the price's half
 * — an assumed NOI stays the assumption's whatever price is typed. Null
 * where the model assumed neither.
 */
export function placeholderReason(
  inputs: UnderwriteInputs,
  sources: ModelSources | null | undefined,
  opts: { priceEntered?: boolean; printed?: boolean } = {},
): string | null {
  if (!sources) return null;
  const price = !opts.priceEntered && sources.purchasePrice?.provenance === "assumption";
  const noi = sources.inPlaceRentAnnual?.provenance === "assumption";
  const notRun = sources.inPlaceRentAnnual?.notRun ?? null;
  const be = opts.printed ? "are" : "would be";
  if (price && noi) {
    return notRun
      ? `no price was read from the memorandum, and the model does not run its ${usd0(notRun.value)} ${notRun.label} as its year-1 income, so the model runs on ${withArticle(`${usd0(inputs.purchasePrice)} placeholder price`)} and an assumed NOI, and its returns ${be} a placeholder's.`
      : `no price was read from the memorandum, nor a year-1 NOI the model could run on, so the model runs on ${withArticle(`${usd0(inputs.purchasePrice)} placeholder price`)} and an assumed NOI, and its returns ${be} a placeholder's.`;
  }
  if (price) {
    return `no price was read from the memorandum, so the model runs on ${withArticle(`${usd0(inputs.purchasePrice)} placeholder`)} and its returns ${be} the placeholder's.`;
  }
  if (noi) {
    return notRun
      ? `the model does not run the memorandum's ${usd0(notRun.value)} ${notRun.label} as its year-1 income, so it runs on an assumed NOI and its returns ${be} the assumption's.`
      : `no year-1 NOI the model could run on was read from the memorandum, so the model runs on an assumed one and its returns ${be} the assumption's.`;
  }
  return null;
}

/**
 * The deal page's sensitivity playground, over its tiles: the returns it
 * withholds and why, the report's own reason — and, while the price is the
 * placeholder's, how to lift it, since the price field is right there. The
 * max bid is named only where a buy box floor would have solved one. Null
 * where the returns stand.
 */
export function placeholderPageLine(
  inputs: UnderwriteInputs,
  sources: ModelSources | null | undefined,
  o: { priceEntered: boolean; maxBid: boolean },
): string | null {
  const reason = placeholderReason(inputs, sources, { priceEntered: o.priceEntered });
  if (!reason) return null;
  const typeIt = !o.priceEntered && sources?.purchasePrice?.provenance === "assumption";
  return `The returns${o.maxBid ? " and the max bid" : ""} are withheld: ${reason}${typeIt ? " Type the price you would pay above to run the model on it." : ""}`;
}

/**
 * The workbook's Deal Summary, under its headline tiles: the same reason,
 * said of returns it prints — and, where the price is the placeholder, the
 * input to replace it in. Null where the model assumed neither.
 */
export function placeholderWorkbookLine(inputs: UnderwriteInputs, sources: ModelSources | null | undefined): string | null {
  const reason = placeholderReason(inputs, sources, { printed: true });
  if (!reason) return null;
  const price = sources?.purchasePrice?.provenance === "assumption";
  return `${reason[0].toUpperCase()}${reason.slice(1)}${price ? " Enter the price you would pay as the Purchase Price on the Assumptions tab." : ""}`;
}

/**
 * The vacancy at and past which the model's returns are not set beside a
 * vacancy lever, and no bid is solved on them (research pass 38). The model
 * reads a stated occupancy as its vacancy and grosses its year-1 revenue up
 * through it into the rent line (lib/underwrite/inputs), so a building 3%
 * occupied carries that space's revenue times thirty-three, and its expense
 * line, a share of the revenue, stands still while a step of the lever
 * moves the revenue by a multiple: from 97% to 95% vacancy the NOI of a
 * deal the report read at 13.3% put the page's tiles at 55%.
 */
export const NEARLY_VACANT = 0.9;

/** A share as a sentence says it: "3%", "0.5%", "97%". */
const shareWords = (dec: number) => `${Number((dec * 100).toFixed(1))}%`;

/** What a withheld tile and the cap field say after "n/a — " where the
 *  model runs the building nearly vacant: "97% vacant". Null under
 *  `NEARLY_VACANT`. */
export function nearlyVacantWord(inputs: Pick<UnderwriteInputs, "vacancyPct">): string | null {
  return inputs.vacancyPct >= NEARLY_VACANT ? `${shareWords(inputs.vacancyPct)} vacant` : null;
}

/**
 * Why a nearly vacant building's returns and bids are withheld, in the words
 * after a surface's own opening — the deal page's playground and the
 * report's max bid say it alike: "stated 3% occupied, the model's rent line
 * is that space's revenue grossed up through 97% vacancy, so a step of
 * vacancy moves the NOI by a multiple — run a lease-up." `occupancy` is the
 * occupancy the model read (decimal), named where it is given. Null under
 * `NEARLY_VACANT`.
 */
export function nearlyVacantReason(
  inputs: Pick<UnderwriteInputs, "vacancyPct">,
  occupancy?: number | null,
): string | null {
  if (!(inputs.vacancyPct >= NEARLY_VACANT)) return null;
  const through = `${shareWords(inputs.vacancyPct)} vacancy`;
  const occ = occupancy != null && Number.isFinite(occupancy) && occupancy >= 0 ? occupancy : null;
  const lead = occ != null ? `stated ${shareWords(occ)} occupied` : `run at ${through}`;
  // A building stated empty has no occupied space whose revenue it is: the
  // model's floor is its own 1%.
  const what = occ != null && occ > 0 ? "that space's revenue" : "its year-1 revenue";
  return `${lead}, the model's rent line is ${what} grossed up through ${through}, so a step of vacancy moves the NOI by a multiple — run a lease-up.`;
}

/**
 * The deal page's playground, over its tiles, where the model runs the
 * building nearly vacant: what it withholds — the returns, the cap on year-1
 * NOI and, where a buy box floor would solve one, the max bid — and why.
 * Null under `NEARLY_VACANT`.
 */
export function nearlyVacantPageLine(
  inputs: Pick<UnderwriteInputs, "vacancyPct">,
  occupancy: number | null | undefined,
  o: { maxBid: boolean },
): string | null {
  const reason = nearlyVacantReason(inputs, occupancy);
  if (!reason) return null;
  const what = o.maxBid ? "The returns, the cap on year-1 NOI and the max bid" : "The returns and the cap on year-1 NOI";
  return `${what} are withheld: ${reason}`;
}

/** What a withheld tile says after "n/a — " while a finding stands against
 *  the returns (`misreadPageLine`). */
export const MISREAD_WORD = "figures don't tie";

/**
 * The deal page's playground, over its tiles, while the plausibility check
 * finds the figures the returns run on do not tie (lib/deal-strategy
 * `findingWithholdsReturns`: a high finding, or an implied cap under the
 * floor — an NOI stated a month at a time had printed "Equity multiple
 * −1.53x" and "DSCR 0.16x" bare, research pass 38): the returns, and the max
 * bid where a buy box floor would solve one, withheld with the finding's own
 * claim, as a placeholder's are. Null where no such finding stands.
 */
export function misreadPageLine(
  findings: readonly Pick<PlausibilityFinding, "code" | "severity" | "title">[] | null | undefined,
  o: { maxBid: boolean },
): string | null {
  const f = (findings ?? []).find(findingWithholdsReturns);
  if (!f) return null;
  return `The returns${o.maxBid ? " and the max bid" : ""} are withheld: ${f.title}, and returns built on figures that do not tie would be a misread's.`;
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
  const levers = pageBaseLevers(inputs);
  // A building the model runs nearly vacant has no bid worth solving: the
  // deal page withholds its own, and the report says why in its place.
  const vacant = nearlyVacantReason(inputs, opts.occupancyPct);
  const solved = vacant ? null : solveMaxBid(inputs, maxBidFloors.floors, levers);
  return {
    grid,
    priceGrid,
    hurdlePct: hurdle,
    hurdleSource: hurdlePct != null && Number.isFinite(hurdlePct) && hurdlePct > 0 ? "buybox" : "default",
    takeaway: gridTakeaway(grid, hurdle),
    maxBid:
      solved && solved.price != null && solved.deltaPct != null
        ? {
            price: solved.price,
            deltaPct: solved.deltaPct,
            unbounded: solved.unbounded,
            binding: solved.binding,
            at: solved.at,
            // The bid's own price under the bid's own levers, on the term.
            ...(opts.termRead
              ? { onTerm: opts.termRead({ ...inputs, expenseLines: inputs.expenseLines.map((l) => ({ ...l })), ...levers, purchasePrice: solved.price }) }
              : {}),
          }
        : null,
    maxBidFloors,
    // No price clears the box's floors together: which one never clears,
    // and which clear on their own, so the sentence names them.
    noBid: box && solved && solved.price == null ? noBidRead(inputs, box, levers) : null,
    maxBidWithheld: vacant,
    withheld: placeholderReturnsLine(inputs, opts.sources),
    priceSource: opts.sources?.purchasePrice ?? null,
    baseCase: opts.sources ? buildBaseCase(inputs, opts.sources) : null,
  };
}

const pct1 = (d: number | null | undefined, dp = 1) => (d == null || !Number.isFinite(d) ? "—" : `${(d * 100).toFixed(dp)}%`);

/**
 * Where no price clears the box's floors together, the sentence that names
 * them from each floor's own solve (`noBidRead`): the floor that clears at
 * no tested price, with the reason the engine proves for a cash-on-cash
 * floor, then how far each other floor clears on its own. Null where there
 * is nothing to name beyond the floors themselves — every floor fails even
 * alone — and the caller's sentence stands.
 */
function noBidSentence(floors: BidFloors, nb: NoBidRead | null): string | null {
  if (!nb || nb.alone.length === 0) return null;
  const words = (k: keyof BidFloors) => floorWords(k, floors);
  const never = nb.alone.filter((a) => a.price == null);
  const alone = nb.alone.filter((a) => a.price != null);
  const clearsAlone = alone.map(
    (a, i) => `your ${words(a.key)} floor alone ${i === 0 ? "clears " : ""}${a.unbounded ? "at every tested price" : `up to ${fmtBid(a.price!)}`}`,
  );
  const aloneLine = clearsAlone.length > 0 ? `${clearsAlone.join(", and ").replace(/^y/, "Y")}.` : "";
  if (never.length === 0) {
    // Each floor clears on its own, never all of them at one price.
    return `No price inside the tested range clears your buy box's floors together. ${aloneLine}`;
  }
  if (never.length > 1 && alone.length === 0) return null;
  const because =
    never.some((a) => a.key === "minCoc") && nb.yearOneNegative
      ? nb.yearOneCapital != null
        ? `year 1 carries ${moneyCompact(nb.yearOneCapital)} of capital, which leaves its cash flow negative at any price`
        : "year 1's cash flow is negative at any price"
      : "";
  const list = never.map((a) => words(a.key));
  const named = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
  const head = `No price inside the tested range clears your ${named} floor`;
  const why = because ? (never.length === 1 ? `: ${because}` : ` (the cash-on-cash because ${because})`) : "";
  if (alone.length === 0) {
    // The box's one floor: the reason where the engine proves one.
    return because ? `${head}${why}.` : null;
  }
  return `${head}${why}. ${aloneLine}`;
}

/**
 * The max bid in the deal page's words (the playground's max-bid card): the
 * floors it clears and whose they are, the bid as the page prints it
 * (rounded down, `fmtBid`), its distance from the modelled price, the floor
 * that binds, and the model's IRR, year-1 cash-on-cash and going-in cap at
 * that price. A bundle with no recorded floors reads as the screening
 * hurdle's IRR, which is what it was solved on.
 */
export function maxBidSentence(
  s: Pick<SensitivityData, "maxBid" | "maxBidFloors" | "hurdlePct" | "hurdleSource" | "noBid" | "maxBidWithheld">,
): string {
  // Withheld rather than solved (a building the model runs nearly vacant):
  // the deal page's own reason, in the bid's place.
  if (s.maxBidWithheld) return `No max bid: ${s.maxBidWithheld}`;
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
    if (!box) return `No price inside the tested range holds ${what} under these assumptions.`;
    return noBidSentence(f.floors, s.noBid ?? null) ?? `No price inside the tested range clears ${what} under these assumptions: the deal's economics, not its price, are the blocker.`;
  }
  if (bid.unbounded) {
    return box
      ? `Max bid: ${what} hold even at twice the modelled price, so the box is not the constraint on this deal.`
      : `Max bid holding ${what}: clears at every tested price — the constraint never binds inside the search range.`;
  }
  const delta = `${bid.deltaPct > 0 ? "+" : ""}${(bid.deltaPct * 100).toFixed(1)}% vs the modelled price`;
  const binds = box && bid.binding ? `; your ${floorWords(bid.binding, f.floors)} floor binds` : "";
  const at = bid.at
    ? ` At that price: IRR ${pct1(bid.at.irr)}, year-1 cash-on-cash ${pct1(bid.at.coc)}, going-in cap ${pct1(bid.at.cap, 2)}.`
    : "";
  return `Max bid ${box ? "clearing" : "holding"} ${what}: ${fmtBid(bid.price)} (${delta})${binds}.${at}`;
}
