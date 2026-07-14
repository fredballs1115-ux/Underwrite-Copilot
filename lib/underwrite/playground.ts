// The Sensitivity Playground (Feature 2): drag exit cap / rent growth /
// vacancy and watch the returns move. PURE — a thin perturbation layer over
// the tested underwriting engine, so a slider is exactly "re-run the model
// with one input changed". No LLM anywhere near this path, and fast enough
// (an annual model over a 5-year hold) to recompute on every drag tick.

import { computeUnderwrite, type UnderwriteInputs } from "./engine";

/** The levers the playground exposes. Percents are decimals (0.045 = 4.5%);
 *  purchasePrice is dollars. Price is the deep lever: the engine re-sizes the
 *  loan basis, debt, financing costs, fees, and equity from it, so a price
 *  change moves every downstream metric — not just the cap-rate division. */
export interface PlaygroundLevers {
  exitCapPct: number;
  rentGrowthPct: number;
  vacancyPct: number;
  purchasePrice: number;
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

/** Lever geometry: `span` steps each way builds the compact ±2-step grid
 *  (PDF heatmap); `sliderSpan` steps each way builds the on-screen slider's
 *  range — deliberately much wider (Bug 9: ±50bps couldn't flip a verdict on
 *  most deals; the exit-cap slider now sweeps ±400bps at 25bps resolution). */
/** The stepped percent levers — price is a free input, not a slider. */
export type PercentLever = "exitCapPct" | "rentGrowthPct" | "vacancyPct";

export const LEVER_STEPS: Record<
  PercentLever,
  { step: number; span: number; sliderSpan: number; min: number; max: number }
> = {
  // 25bps steps; slider ±16 steps = ±400bps
  exitCapPct: { step: 0.0025, span: 2, sliderSpan: 16, min: 0.0025, max: 0.25 },
  // 50bps steps; slider ±3 steps = ±150bps (the spec's 1.0–4.0% example)
  rentGrowthPct: { step: 0.005, span: 2, sliderSpan: 3, min: -0.05, max: 0.15 },
  // 1.0pt steps; slider ±3 steps = ±3pt (the spec's 2–8% example)
  vacancyPct: { step: 0.01, span: 2, sliderSpan: 3, min: 0, max: 0.95 },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Stops `span` steps either side of the base, clamped to the lever's
 *  physical range. The base itself is clamped FIRST — a degenerate derived
 *  input (e.g. a 0% cap read off a garbled extraction) must not produce
 *  non-monotonic stops where dragging left raises the value. */
function stops(
  lever: PercentLever,
  base: number,
  span: number,
): number[] {
  const { step, min, max } = LEVER_STEPS[lever];
  const b = clamp(Number.isFinite(base) ? base : min, min, max);
  const out: number[] = [];
  for (let i = -span; i <= span; i++) {
    out.push(i === 0 ? b : clamp(b + i * step, min, max));
  }
  return out;
}

/** The compact ±2-step stop list (PDF heatmap grid). Index `span` (2) is the
 *  (clamped) base. */
export function leverValues(
  lever: PercentLever,
  base: number,
): number[] {
  return stops(lever, base, LEVER_STEPS[lever].span);
}

/**
 * The SLIDER's stop list (Bug 9 range): `sliderSpan` steps each way, with
 * clamped duplicates at the range ends collapsed so the slider has no dead
 * zones. `baseIdx` locates the (clamped) base — "reset" and the "base" label
 * key off the index, never value equality.
 */
export function sliderValues(
  lever: PercentLever,
  base: number,
): { values: number[]; baseIdx: number } {
  const raw = stops(lever, base, LEVER_STEPS[lever].sliderSpan);
  const values = raw.filter((v, i) => i === 0 || v !== raw[i - 1]);
  // The base was pushed unclamped-duplicates-first, so the first occurrence
  // of its value IS the base stop.
  const { min, max } = LEVER_STEPS[lever];
  const b = clamp(Number.isFinite(base) ? base : min, min, max);
  return { values, baseIdx: values.indexOf(b) };
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
 * Recompute the model with the playground's levers applied. Only the levers
 * are touched; everything else — debt terms, expenses, capex — is the base
 * model verbatim, so the comparison against base is apples-to-apples. (When
 * the price lever is set, debt/equity/fees re-derive from it, because that's
 * what a price change means.)
 */
export function runScenario(
  base: UnderwriteInputs,
  levers: Partial<PlaygroundLevers>,
): ScenarioMetrics {
  return scenarioMetrics(scenarioInputs(base, levers));
}

/** The base inputs with the playground's levers applied — shared by the
 *  metric runs and the year-one NOI read so they can never disagree. */
function scenarioInputs(
  base: UnderwriteInputs,
  levers: Partial<PlaygroundLevers>,
): UnderwriteInputs {
  return {
    ...base,
    // never share the array reference with the base inputs
    expenseLines: base.expenseLines.map((l) => ({ ...l })),
    ...(levers.exitCapPct != null ? { exitCapPct: levers.exitCapPct } : {}),
    ...(levers.rentGrowthPct != null ? { rentGrowthPct: levers.rentGrowthPct } : {}),
    ...(levers.vacancyPct != null ? { vacancyPct: levers.vacancyPct } : {}),
    ...(levers.purchasePrice != null && levers.purchasePrice > 0
      ? { purchasePrice: levers.purchasePrice }
      : {}),
  };
}

/**
 * Year-one NOI under the given levers. Price never enters NOI (income and
 * expenses are property facts), which is exactly why price ⇄ going-in cap is
 * a clean inversion: cap = yearOneNoi / price, price = yearOneNoi / cap.
 */
export function yearOneNoi(
  base: UnderwriteInputs,
  levers: Partial<PlaygroundLevers> = {},
): number {
  return computeUnderwrite(scenarioInputs(base, levers)).cashFlow[0]?.noi ?? 0;
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
