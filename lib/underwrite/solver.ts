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
  /** True when every floor still clears at the search ceiling (2× the modeled
   *  price): the box isn't the constraint, and `price` holds the ceiling. */
  unbounded: boolean;
  /** Engine metrics at the solved price (what you'd underwrite to there). */
  at: BidMetrics | null;
}

// Search window and resolution. The grid pass brackets the feasibility edge
// (robust even if a metric wiggles locally); bisection then sharpens the
// bracket to well under $1k on any realistic deal size.
const FLOOR_X = 0.05;
const CEILING_X = 2;
const GRID = 48;
const BISECT_ITERS = 40;

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

  const lo0 = base.purchasePrice * FLOOR_X;
  const hi0 = base.purchasePrice * CEILING_X;
  const at = (p: number) => metricsAt(base, levers, p);

  // Even the search floor fails → nothing to report.
  if (!clears(at(lo0), floors)) return none;

  // Still feasible at the ceiling → the box isn't the constraint.
  const ceilingMetrics = at(hi0);
  if (clears(ceilingMetrics, floors)) {
    return {
      price: hi0,
      deltaPct: (hi0 - base.purchasePrice) / base.purchasePrice,
      binding: null,
      unbounded: true,
      at: ceilingMetrics,
    };
  }

  // Grid pass: find the LAST feasible stop so bisection brackets the highest
  // feasibility edge even if a metric misbehaves locally somewhere below it.
  let lo = lo0;
  let hi = hi0;
  let prev = lo0;
  for (let i = 1; i <= GRID; i++) {
    const p = lo0 + ((hi0 - lo0) * i) / GRID;
    if (clears(at(p), floors)) {
      prev = p;
    }
  }
  lo = prev; // feasible by construction
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
