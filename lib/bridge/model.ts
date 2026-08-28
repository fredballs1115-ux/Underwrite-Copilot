/**
 * The bridge's view of the underwriting engine.
 *
 * Phase 1's rule: ONE pure `runModel(assumptions) -> ModelResult`, no side
 * effects, no DB. `computeUnderwrite` in lib/underwrite/engine.ts already is
 * exactly that, so the bridge WRAPS it rather than reimplementing or
 * refactoring the math — this module is the adapter that turns a full
 * UnderwriteResult into the four scalars attribution walks over.
 */
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";

/** The bridge's assumption set is the engine's input set. */
export type Assumptions = UnderwriteInputs;

/** The metrics a bridge attributes. All four come from ONE model run. */
export interface BridgeMetrics {
  /** decimal (0.193 = 19.3%) */
  leveredIrr: number;
  unleveredIrr: number;
  leveredEquityMultiple: number;
  /** year-1 levered cash flow, dollars */
  year1CashFlow: number;
}

export type ModelRunner = (a: Assumptions) => BridgeMetrics;

/**
 * A cash-flow stream with no IRR root (a total wipeout, or a stream that never
 * changes sign) has no number to attribute. Shapley needs a value function
 * defined on EVERY intermediate scenario, so an undefined IRR is floored to
 * the engine's own scan floor — the worst rate `irr()` can report — and the
 * bridge counts how often that happened so the UI can say the walk passed
 * through scenarios that don't price.
 */
export const NULL_IRR_FLOOR = -0.9;

const floorIrr = (v: number | null): { value: number; defined: boolean } =>
  v == null || !Number.isFinite(v)
    ? { value: NULL_IRR_FLOOR, defined: false }
    : { value: v, defined: true };

/** How many of the four metrics came back undefined on this run. */
export interface RunOutcome {
  metrics: BridgeMetrics;
  /** true when either IRR had no root and was floored */
  floored: boolean;
}

export function runModelOutcome(a: Assumptions): RunOutcome {
  const r = computeUnderwrite(a);
  const lev = floorIrr(r.returns.leveredIrrPct);
  const unlev = floorIrr(r.returns.unleveredIrrPct);
  return {
    metrics: {
      leveredIrr: lev.value,
      unleveredIrr: unlev.value,
      leveredEquityMultiple: Number.isFinite(r.returns.leveredEquityMultiple ?? NaN)
        ? (r.returns.leveredEquityMultiple as number)
        : 0,
      year1CashFlow: r.cashFlow[0]?.leveredCashFlow ?? 0,
    },
    floored: !lev.defined || !unlev.defined,
  };
}

/** The default runner: the engine, adapted, nothing else. */
export const runModel: ModelRunner = (a) => runModelOutcome(a).metrics;

/** The headline levered IRR for a set of assumptions — null when it has no
 *  root, so the UI can say so rather than printing the floor as a return. */
export function leveredIrrOf(a: Assumptions): number | null {
  return computeUnderwrite(a).returns.leveredIrrPct;
}
