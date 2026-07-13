// The Sensitivity Playground (Feature 2): drag exit cap / rent growth /
// vacancy and watch the returns move. PURE — a thin perturbation layer over
// the tested underwriting engine, so a slider is exactly "re-run the model
// with one input changed". No LLM anywhere near this path, and fast enough
// (an annual model over a 5-year hold) to recompute on every drag tick.

import { computeUnderwrite, type UnderwriteInputs } from "./engine";

/** The three levers the playground exposes. All decimals (0.045 = 4.5%). */
export interface PlaygroundLevers {
  exitCapPct: number;
  rentGrowthPct: number;
  vacancyPct: number;
}

export interface ScenarioMetrics {
  /** decimal, null when the cash-flow vector has no IRR root */
  leveredIrrPct: number | null;
  leveredEquityMultiple: number | null;
  /** year-1 levered cash flow ÷ initial equity, decimal */
  cocYr1Pct: number | null;
  /** year-1 NOI ÷ year-1 debt service, null when unlevered */
  dscrYr1: number | null;
}

/** Slider geometry per lever: ±`span` steps of `step` around the base. */
export const LEVER_STEPS: Record<
  keyof PlaygroundLevers,
  { step: number; span: number; min: number; max: number }
> = {
  exitCapPct: { step: 0.0025, span: 2, min: 0.0025, max: 0.25 }, // 25bps steps
  rentGrowthPct: { step: 0.005, span: 2, min: -0.05, max: 0.15 }, // 50bps steps
  vacancyPct: { step: 0.01, span: 2, min: 0, max: 0.95 }, // 1.0% steps
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The slider's stop values for one lever: `span` steps either side of the
 * base, clamped to the lever's physical range. Index `span` is always the
 * base itself, so "reset" is exact, not rounded.
 */
export function leverValues(
  lever: keyof PlaygroundLevers,
  base: number,
): number[] {
  const { step, span, min, max } = LEVER_STEPS[lever];
  const out: number[] = [];
  for (let i = -span; i <= span; i++) {
    out.push(i === 0 ? base : clamp(base + i * step, min, max));
  }
  return out;
}

/** The four headline metrics of one computed scenario. */
export function scenarioMetrics(inputs: UnderwriteInputs): ScenarioMetrics {
  const r = computeUnderwrite(inputs);
  const y1 = r.cashFlow[0];
  const equity = r.sourcesUses.equity;
  return {
    leveredIrrPct: r.returns.leveredIrrPct,
    leveredEquityMultiple: r.returns.leveredEquityMultiple,
    cocYr1Pct: y1 && equity > 0 ? y1.leveredCashFlow / equity : null,
    dscrYr1: y1 ? y1.dscrNoi : null,
  };
}

/**
 * Recompute the model with the playground's levers applied. Only the three
 * levers are touched; everything else — price, debt, expenses, capex — is the
 * base model verbatim, so the comparison against base is apples-to-apples.
 */
export function runScenario(
  base: UnderwriteInputs,
  levers: Partial<PlaygroundLevers>,
): ScenarioMetrics {
  const inputs: UnderwriteInputs = {
    ...base,
    // never share the array reference with the base inputs
    expenseLines: base.expenseLines.map((l) => ({ ...l })),
    ...(levers.exitCapPct != null ? { exitCapPct: levers.exitCapPct } : {}),
    ...(levers.rentGrowthPct != null ? { rentGrowthPct: levers.rentGrowthPct } : {}),
    ...(levers.vacancyPct != null ? { vacancyPct: levers.vacancyPct } : {}),
  };
  return scenarioMetrics(inputs);
}

// ---- Display helpers (pure formatting, shared with tests) -----------------

export const fmtPct = (dec: number | null, digits = 1): string =>
  dec == null || !Number.isFinite(dec) ? "—" : `${(dec * 100).toFixed(digits)}%`;

export const fmtX = (x: number | null, digits = 2): string =>
  x == null || !Number.isFinite(x) ? "—" : `${x.toFixed(digits)}x`;

/** "+25bps" / "−50bps" / "base" for the cap & growth levers. */
export function fmtBpsDelta(value: number, base: number): string {
  const bps = Math.round((value - base) * 10_000);
  if (bps === 0) return "base";
  return `${bps > 0 ? "+" : "−"}${Math.abs(bps)}bps`;
}

/** "+1.0pt" / "−2.0pt" / "base" for the vacancy lever. */
export function fmtPtDelta(value: number, base: number): string {
  const pts = (value - base) * 100;
  if (Math.round(pts * 10) === 0) return "base";
  return `${pts > 0 ? "+" : "−"}${Math.abs(pts).toFixed(1)}pt`;
}
