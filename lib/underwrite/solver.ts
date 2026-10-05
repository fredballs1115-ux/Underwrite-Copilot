// Max-bid solver: the highest purchase price that still clears the buy box's
// return floors. PURE — repeated runs of the tested underwriting engine plus
// a bracketed bisection; no LLM anywhere near this path. Price is the honest
// lever: the engine re-sizes debt (LTC off loan basis), closing costs, fees,
// and equity from it, so "max bid" means the whole capital stack still works,
// not just a cap-rate division.

import { computeUnderwrite, type UnderwriteInputs } from "./engine";
import type { PlaygroundLevers } from "./playground";
import { compactUsd } from "@/lib/money";

/** Return floors as DECIMALS (0.13 = a 13% IRR floor). The buy box stores
 *  percent-points (minIrrPct: 13) — callers divide by 100. */
export interface BidFloors {
  minIrr?: number;
  minCoc?: number;
  minCap?: number;
}

/**
 * The buy box's return floors as the solver takes them — the deal page's
 * own mapping (the sensitivity playground's max bid): each floor the box
 * sets, percent points over 100, and nothing it leaves blank. Null where
 * the box sets no floor at all, which is no max bid on the page either.
 */
export function bidFloors(
  box: { minIrrPct?: number | null; minCoCPct?: number | null; minCapPct?: number | null } | null | undefined,
): BidFloors | null {
  if (!box) return null;
  const floors: BidFloors = {
    ...(box.minIrrPct != null ? { minIrr: box.minIrrPct / 100 } : {}),
    ...(box.minCoCPct != null ? { minCoc: box.minCoCPct / 100 } : {}),
    ...(box.minCapPct != null ? { minCap: box.minCapPct / 100 } : {}),
  };
  return floors.minIrr == null && floors.minCoc == null && floors.minCap == null ? null : floors;
}

/** A solved bid as the deal page prints it: rounded DOWN at display
 *  precision, so the printed bid still clears the floors — "$9.74M" never
 *  stands for a solved $9,738,000. */
export function fmtBid(n: number): string {
  if (n >= 1e9) return `$${(Math.floor(n / 1e7) / 100).toFixed(2)}B`;
  if (n >= 1e6) return `$${(Math.floor(n / 1e4) / 100).toFixed(2)}M`;
  return `$${Math.floor(n / 1e3).toLocaleString("en-US")}k`;
}

const floorPct = (d: number) => `${Number((d * 100).toFixed(2))}%`;

/** One floor in words: "13% IRR", "5% cash-on-cash", "5.75% going-in cap". */
export function floorWords(key: keyof BidFloors, floors: BidFloors): string {
  const v = floors[key];
  if (v == null) return "";
  return key === "minIrr" ? `${floorPct(v)} IRR` : key === "minCoc" ? `${floorPct(v)} cash-on-cash` : `${floorPct(v)} going-in cap`;
}

/** Every floor set, in the page's order: "13% IRR, 5% cash-on-cash, 5.75% going-in cap". */
export function floorsWords(floors: BidFloors): string {
  return (["minIrr", "minCoc", "minCap"] as const)
    .map((k) => floorWords(k, floors))
    .filter(Boolean)
    .join(", ");
}

export interface BidMetrics {
  irr: number | null;
  coc: number | null;
  cap: number | null;
}

export interface MaxBidSolution {
  /** Highest price that clears every floor; null when even the search floor
   *  (5% of the modeled price) fails — i.e. no sane price rescues the deal
   *  under these assumptions. */
  price: number | null;
  /** (price − modeled price) / modeled price, decimal; null with price. */
  deltaPct: number | null;
  /** The floor with the thinnest margin at the solution — the one that gives
   *  first if you pay a dollar more. */
  binding: keyof BidFloors | null;
  /** True when every floor still clears at the top of the range searched
   *  (`MAX_BID_SEARCH_X` times the modeled price): the box isn't the
   *  constraint, and `price` holds that top — the bid is AT LEAST it, and the
   *  model's own ceiling lies above the range searched. */
  unbounded: boolean;
  /** Engine metrics at the solved price (what you'd underwrite to there). */
  at: BidMetrics | null;
}

// Search window and resolution. The window opens at twice the modelled
// price and doubles while every floor still clears at its top (research pass
// 40, H2: an auction's modelled price is its opening floor, and a model whose
// own ceiling at the hurdle was $7.31M all-in was said to set none past
// $5.25M, twice the floor), up to `MAX_BID_SEARCH_X`. The grid pass then
// brackets the feasibility edge inside the last doubling (robust even if a
// metric wiggles locally); bisection sharpens the bracket to well under $1k
// on any realistic deal size. A window that never doubles is searched
// exactly as before.
const FLOOR_X = 0.05;
const CEILING_X = 2;
/** The top of the range the max bid is searched over, as a multiple of the
 *  modelled price: past it, the bid is said as "at least" the top, never as
 *  a ceiling the model does not set. */
export const MAX_BID_SEARCH_X = 64;
const GRID = 48;
const BISECT_ITERS = 40;

/** A multiple of the modelled price in words: "twice", "64 times". */
export function timesWords(x: number): string {
  const n = Number(x.toFixed(x < 10 ? 1 : 0));
  return n === 2 ? "twice" : `${n} times`;
}

function metricsAt(
  base: UnderwriteInputs,
  levers: Partial<PlaygroundLevers>,
  price: number,
): BidMetrics {
  const r = computeUnderwrite({
    ...base,
    expenseLines: base.expenseLines.map((l) => ({ ...l })),
    ...(levers.exitCapPct != null ? { exitCapPct: levers.exitCapPct } : {}),
    ...(levers.rentGrowthPct != null
      ? { rentGrowthPct: levers.rentGrowthPct }
      : {}),
    ...(levers.vacancyPct != null ? { vacancyPct: levers.vacancyPct } : {}),
    purchasePrice: price,
  });
  const y1 = r.cashFlow[0];
  const equity = r.sourcesUses.equity;
  return {
    irr: r.returns.leveredIrrPct,
    coc: y1 && equity > 0 ? y1.leveredCashFlow / equity : null,
    cap: r.returns.goingInCapPct,
  };
}

// A hair of float tolerance so "solve for the base IRR" accepts the base
// price itself instead of bisecting one ulp below it.
const EPS = 1e-12;

function clears(m: BidMetrics, floors: BidFloors): boolean {
  if (floors.minIrr != null && !(m.irr != null && m.irr >= floors.minIrr - EPS))
    return false;
  if (floors.minCoc != null && !(m.coc != null && m.coc >= floors.minCoc - EPS))
    return false;
  if (floors.minCap != null && !(m.cap != null && m.cap >= floors.minCap - EPS))
    return false;
  return true;
}

function bindingFloor(m: BidMetrics, floors: BidFloors): keyof BidFloors | null {
  let best: keyof BidFloors | null = null;
  let bestMargin = Infinity;
  const consider = (key: keyof BidFloors, metric: number | null, floor?: number) => {
    if (floor == null) return;
    const margin = metric == null ? -Infinity : metric - floor;
    if (margin < bestMargin) {
      bestMargin = margin;
      best = key;
    }
  };
  consider("minIrr", m.irr, floors.minIrr);
  consider("minCoc", m.coc, floors.minCoc);
  consider("minCap", m.cap, floors.minCap);
  return best;
}

/**
 * Solve for the max bid under the given floors, with the playground's levers
 * (if any) applied first — so the answer moves with the sliders: "if exit cap
 * is really 6.25%, my number drops to …".
 */
export function solveMaxBid(
  base: UnderwriteInputs,
  floors: BidFloors,
  levers: Partial<PlaygroundLevers> = {},
): MaxBidSolution {
  const none: MaxBidSolution = {
    price: null,
    deltaPct: null,
    binding: null,
    unbounded: false,
    at: null,
  };
  if (
    (floors.minIrr == null && floors.minCoc == null && floors.minCap == null) ||
    !(base.purchasePrice > 0)
  ) {
    return none;
  }

  let lo0 = base.purchasePrice * FLOOR_X;
  let hi0 = base.purchasePrice * CEILING_X;
  const top = base.purchasePrice * MAX_BID_SEARCH_X;
  const at = (p: number) => metricsAt(base, levers, p);

  // Still feasible at the window's top → double it, until a top fails or the
  // range reaches its stated maximum. A top that fails brackets the edge
  // between it and the last top that cleared; the maximum still clearing
  // means the box isn't the constraint inside the range searched.
  let ceilingMetrics = at(hi0);
  while (clears(ceilingMetrics, floors)) {
    if (hi0 >= top) {
      return {
        price: hi0,
        deltaPct: (hi0 - base.purchasePrice) / base.purchasePrice,
        binding: null,
        unbounded: true,
        at: ceilingMetrics,
      };
    }
    lo0 = hi0;
    hi0 = Math.min(hi0 * 2, top);
    ceilingMetrics = at(hi0);
  }

  // Grid pass: find the LAST feasible stop so bisection brackets the highest
  // feasibility edge even if a metric misbehaves locally somewhere below it.
  // The floor stop need not clear: on a high-yield deal (an auction's
  // starting bid on an 18% cap, #456) the return at 5% of the price is
  // past the IRR routine's reach and reads as none, and a stop further up
  // still clears. Only a grid on which NO stop clears has nothing to report.
  let prev: number | null = clears(at(lo0), floors) ? lo0 : null;
  for (let i = 1; i <= GRID; i++) {
    const p = lo0 + ((hi0 - lo0) * i) / GRID;
    if (clears(at(p), floors)) {
      prev = p;
    }
  }
  if (prev == null) return none;
  let lo = prev; // feasible by construction
  let hi: number;
  // First infeasible grid stop AFTER the last feasible one:
  hi = Math.min(hi0, lo + (hi0 - lo0) / GRID);

  for (let i = 0; i < BISECT_ITERS; i++) {
    const mid = (lo + hi) / 2;
    if (clears(at(mid), floors)) lo = mid;
    else hi = mid;
  }

  const solvedMetrics = at(lo);
  return {
    price: lo,
    deltaPct: (lo - base.purchasePrice) / base.purchasePrice,
    binding: bindingFloor(solvedMetrics, floors),
    unbounded: false,
    at: solvedMetrics,
  };
}

/**
 * Where no price clears the buy box's floors together, which floor never
 * clears and which clear on their own (research pass 35: the hotel's report
 * listed three floors and named none, under a grid whose IRR cleared at 10%
 * off). Each floor solved alone, over the same range and under the same
 * levers as the bid; and the one reason the engine can prove for a
 * cash-on-cash floor: year 1's cash flow before debt service negative
 * whatever the price, since neither its NOI nor its capital spending moves
 * with the price. Beside the solve, so the deal page's max-bid card and the
 * report read one sentence for one deal (audit C3a, MED-7).
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
 * Where no price clears the box's floors together, the sentence that names
 * them from each floor's own solve (`noBidRead`): the floor that clears at
 * no tested price, with the reason the engine proves for a cash-on-cash
 * floor, then how far each other floor clears on its own. Null where there
 * is nothing to name beyond the floors themselves — every floor fails even
 * alone — and the caller's sentence stands.
 */
export function noBidSentence(floors: BidFloors, nb: NoBidRead | null): string | null {
  if (!nb || nb.alone.length === 0) return null;
  const words = (k: keyof BidFloors) => floorWords(k, floors);
  const never = nb.alone.filter((a) => a.price == null);
  const alone = nb.alone.filter((a) => a.price != null);
  const clearsAlone = alone.map(
    (a, i) => `your ${words(a.key)} floor alone ${i === 0 ? "clears " : ""}${a.unbounded ? `at every price searched, up to ${timesWords(MAX_BID_SEARCH_X)} the modelled price` : `up to ${fmtBid(a.price!)}`}`,
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
        ? `year 1 carries ${compactUsd(nb.yearOneCapital)} of capital, which leaves its cash flow negative at any price`
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
