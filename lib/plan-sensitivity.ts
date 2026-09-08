/**
 * Yield on total cost, stressed — the sensitivity a plan deal is actually
 * judged on.
 *
 * A conversion, development, lease-up or value-add is not bought for its
 * going-in cap; it is built for the spread between what the finished project
 * yields on everything it cost and the cap rate that product trades at once
 * it is done. Two things erode that spread, and an OM tends to present both
 * at their best: the stabilized NOI coming in under the pro forma, and the
 * budget running over. So the grid stresses exactly those two — NOI down the
 * rows, budget across the columns — and each cell reports the yield on total
 * cost and its spread over a reference cap in basis points.
 *
 * The reference cap is the caller's: the model's exit-cap assumption, with
 * its provenance, so the spread is measured against a number the reader can
 * see and change. Pure — no I/O, no LLM, no defaults invented for a figure
 * the OM did not state (a missing budget or NOI yields null, never a grid).
 */
import type { PlanSummary } from "./deal-strategy";

/** stabilized NOI against the OM's pro forma, down the rows */
export const NOI_STOPS: readonly number[] = [-0.2, -0.1, 0, 0.1, 0.2];
/** budget against the OM's, across the columns — overruns get more room than
 *  savings, because that is the direction budgets move */
export const BUDGET_STOPS: readonly number[] = [-0.1, 0, 0.1, 0.2, 0.3];

export interface YocCell {
  /** stabilized NOI ÷ (price + budget), decimal */
  yieldOnCost: number;
  /** yield on cost less the reference cap, in basis points (rounded) */
  spreadBps: number;
}

export interface YocGrid {
  noiRows: { delta: number; noi: number }[];
  budgetCols: { delta: number; budget: number; totalCost: number }[];
  /** cells[row][col] */
  cells: YocCell[][];
  baseRow: number;
  baseCol: number;
  /** the cap the spread is measured against, decimal */
  refCapPct: number;
}

/** The three figures every function here needs, or null when the OM did not
 *  state one of them — a blank is null, never zero, and never a grid. */
function planFigures(
  plan: PlanSummary | null,
  refCapPct: number,
): { noi: number; price: number; budget: number } | null {
  if (!plan) return null;
  const noi = plan.stabilizedNoi?.value ?? null;
  const price = plan.price;
  const budget = plan.budget?.budget ?? null;
  if (noi == null || !(noi > 0)) return null;
  if (price == null || !(price > 0)) return null;
  if (budget == null || !(budget > 0)) return null;
  if (!Number.isFinite(refCapPct) || !(refCapPct > 0)) return null;
  return { noi, price, budget };
}

export function buildYieldOnCostGrid(plan: PlanSummary | null, refCapPct: number): YocGrid | null {
  const f = planFigures(plan, refCapPct);
  if (!f) return null;
  const noiRows = NOI_STOPS.map((d) => ({ delta: d, noi: f.noi * (1 + d) }));
  const budgetCols = BUDGET_STOPS.map((d) => {
    const budget = f.budget * (1 + d);
    return { delta: d, budget, totalCost: f.price + budget };
  });
  const cells = noiRows.map((r) =>
    budgetCols.map((c) => {
      const yieldOnCost = r.noi / c.totalCost;
      return { yieldOnCost, spreadBps: Math.round((yieldOnCost - refCapPct) * 10_000) };
    }),
  );
  return {
    noiRows,
    budgetCols,
    cells,
    baseRow: NOI_STOPS.indexOf(0),
    baseCol: BUDGET_STOPS.indexOf(0),
    refCapPct,
  };
}

/**
 * Development-spread bands. 150–200 bps of yield on cost over the cap the
 * finished product trades at is the conventional ask for taking construction
 * and lease-up risk; under 75 bps the plan is being built for the market's
 * cap rate rather than for a return on the risk of building; below the cap
 * the finished project is worth less than it cost.
 */
export type SpreadBucket = "wide" | "adequate" | "thin" | "none" | "negative";

export function spreadBucket(spreadBps: number): SpreadBucket {
  if (!Number.isFinite(spreadBps)) return "none";
  if (spreadBps >= 200) return "wide";
  if (spreadBps >= 150) return "adequate";
  if (spreadBps >= 75) return "thin";
  if (spreadBps >= 0) return "none";
  return "negative";
}

export const SPREAD_LABEL: Record<SpreadBucket, string> = {
  wide: "200+ bps over the cap",
  adequate: "150–199 bps",
  thin: "75–149 bps",
  none: "0–74 bps — built for the market's cap, not for the risk",
  negative: "below the cap — worth less finished than it cost",
};

export interface PlanBreakevens {
  /** the stabilized NOI at which yield on total cost just equals the reference cap */
  noiAtRefCap: number;
  /** how far under the OM's stabilized NOI that floor sits, decimal
   *  (0.486 = the NOI can miss by 48.6% before the spread is gone);
   *  negative = the pro forma already yields less than the cap */
  noiCushion: number;
  /** the budget overrun (decimal) that brings the yield down to the reference
   *  cap; null when the base yield is already at or below the cap */
  overrunToRefCap: number | null;
}

/** Closed form, so the two sentences under the grid are exact, not read off
 *  the nearest cell. */
export function planBreakevens(plan: PlanSummary | null, refCapPct: number): PlanBreakevens | null {
  const f = planFigures(plan, refCapPct);
  if (!f) return null;
  const totalCost = f.price + f.budget;
  const noiAtRefCap = refCapPct * totalCost;
  const noiCushion = 1 - noiAtRefCap / f.noi;
  // yield = noi / (price + budget·(1+c)) = refCap  ⇒  c = (noi/refCap − price)/budget − 1
  const overrun = (f.noi / refCapPct - f.price) / f.budget - 1;
  return {
    noiAtRefCap,
    noiCushion,
    overrunToRefCap: overrun > 0 ? overrun : null,
  };
}
