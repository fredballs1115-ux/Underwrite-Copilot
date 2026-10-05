// Max-bid solver: the highest purchase price that still clears the buy box's
// return floors. PURE — repeated runs of the tested underwriting engine plus
// a bracketed bisection; no LLM anywhere near this path. Price is the honest
// lever: the engine re-sizes debt (LTC off loan basis), closing costs, fees,
// and equity from it, so "max bid" means the whole capital stack still works,
// not just a cap-rate division.

import { computeUnderwrite, type UnderwriteInputs } from "./engine";
import type { PlaygroundLevers } from "./playground";

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
