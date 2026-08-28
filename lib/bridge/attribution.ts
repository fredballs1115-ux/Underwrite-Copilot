/**
 * The Assumption Bridge — attribute a change in returns to the specific inputs
 * that caused it.
 *
 * A user re-runs a deal and levered IRR moves from 6.6% to 19.3%. Two things
 * changed: the price came down and the exit cap tightened. "Which one did the
 * work?" has no answer from a one-at-a-time walk, because the answer depends
 * on the order you apply the changes — cutting price is worth more AFTER the
 * cap tightens than before it. The order-independent answer is the SHAPLEY
 * VALUE: average each field's marginal effect over every order the changes
 * could have been applied in.
 *
 * Two properties make this the right tool and both are asserted in the tests:
 *   - EFFICIENCY  — the contributions sum exactly to the total move, so the
 *                   waterfall's bars land on the headline number.
 *   - SYMMETRY    — the result does not depend on the diff's ordering.
 *
 * Cost is controlled by memoizing on the COALITION (which fields have been
 * switched to B), not the permutation: an exact walk over 6 fields is 720
 * permutations but only 2^6 = 64 distinct model runs.
 *
 * Pure: no I/O, no DB, no LLM. The engine is injected so tests can drive the
 * math with a closed-form stand-in.
 */
import {
  changedPaths,
  fieldFormat,
  fieldLabel,
  formatFieldDelta,
  formatFieldValue,
  getPath,
  setPath,
  type FieldPath,
  type LeafValue,
} from "./fields";
import {
  NULL_IRR_FLOOR,
  runModel as defaultRunner,
  type Assumptions,
  type BridgeMetrics,
  type ModelRunner,
} from "./model";

/** Above this many changed fields, exact Shapley stops being affordable and
 *  the walk switches to sampling. */
export const EXACT_FIELD_LIMIT = 6;

/** Permutations drawn in the sampled path. */
export const MONTE_CARLO_SAMPLES = 2000;

export type BridgeStep = {
  /** dotted leaf path, e.g. 'purchasePrice' or 'expenseLines.0.annual' */
  field: FieldPath;
  label: string;
  fromValue: number | string;
  toValue: number | string;
  /** contribution to the levered IRR move, in basis points */
  leveredIrrBps: number;
  unleveredIrrBps: number;
  equityMultipleDelta: number;
  /** contribution to year-1 levered cash flow, in dollars */
  year1CashFlowDelta: number;
  /** signed share of the total levered-IRR move, decimal; null when the total
   *  move is ~0 (a share of nothing is not a number, it's a divide-by-zero) */
  shareOfMove: number | null;
};

export type Bridge = {
  /** decimals; null when that scenario's cash-flow stream has no IRR root */
  fromIrr: number | null;
  toIrr: number | null;
  fromUnleveredIrr: number | null;
  toUnleveredIrr: number | null;
  fromEquityMultiple: number | null;
  toEquityMultiple: number | null;
  /** sorted by |leveredIrrBps| desc */
  steps: BridgeStep[];
  method: "exact" | "sampled";
  /** per-field standard error on the levered-IRR contribution (sampled only) */
  standardErrorBps?: Record<FieldPath, number>;
  /** total move minus the sum of contributions; asserted < 1 bp */
  unexplainedBps: number;
  /** model runs performed — the honest cost of the walk */
  scenariosEvaluated: number;
  /** scenarios along the walk whose cash flows had no IRR root and were
   *  floored (see model.ts). 0 in the normal case. */
  flooredScenarios: number;
};

// ---------------------------------------------------------------------------
// Deterministic PRNG — a sampled bridge must be reproducible, or the cached
// bridge and a recomputed one would disagree and the user would see the
// numbers twitch on reload.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from the changed field names, so the same diff always draws
 *  the same permutations regardless of when it runs. */
function seedFrom(paths: FieldPath[]): number {
  let h = 2166136261;
  for (const p of paths.join("|")) {
    h ^= p.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const METRIC_KEYS = [
  "leveredIrr",
  "unleveredIrr",
  "leveredEquityMultiple",
  "year1CashFlow",
] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

const zeroMetrics = (): Record<MetricKey, number> => ({
  leveredIrr: 0,
  unleveredIrr: 0,
  leveredEquityMultiple: 0,
  year1CashFlow: 0,
});

/** Factorials up to EXACT_FIELD_LIMIT — small, exact in float64. */
const FACT: number[] = (() => {
  const f = [1];
  for (let i = 1; i <= 21; i++) f.push(f[i - 1] * i);
  return f;
})();

interface Walk {
  contributions: Map<FieldPath, Record<MetricKey, number>>;
  base: BridgeMetrics;
  full: BridgeMetrics;
  method: "exact" | "sampled";
  standardErrorBps?: Record<FieldPath, number>;
  scenariosEvaluated: number;
  flooredScenarios: number;
}

/**
 * Shapley attribution over the changed fields.
 *
 * @param from     assumption set A
 * @param to       assumption set B
 * @param paths    the changed leaf paths (the coalition members)
 * @param run      the model, injected
 */
function shapleyWalk(
  from: Assumptions,
  to: Assumptions,
  paths: FieldPath[],
  run: ModelRunner,
): Walk {
  const n = paths.length;
  const targets: LeafValue[] = paths.map((p) => getPath(to, p));

  // v(S): the model with exactly the fields in S switched from A's value to
  // B's. Memoized on the coalition bitmask — permutations reuse coalitions
  // heavily, and this is what keeps the exact walk to 2^n runs.
  const memo = new Map<number, BridgeMetrics>();
  let evaluated = 0;
  let floored = 0;
  const evaluate = (mask: number): BridgeMetrics => {
    const hit = memo.get(mask);
    if (hit) return hit;
    let scenario = from;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) scenario = setPath(scenario, paths[i], targets[i]);
    }
    const metrics = run(scenario);
    evaluated++;
    // The floor is an exact sentinel (model.ts), so an equality test is a
    // reliable "this scenario's cash flows had no IRR root".
    if (metrics.leveredIrr === NULL_IRR_FLOOR || metrics.unleveredIrr === NULL_IRR_FLOOR) floored++;
    memo.set(mask, metrics);
    return metrics;
  };

  const contributions = new Map<FieldPath, Record<MetricKey, number>>();
  for (const p of paths) contributions.set(p, zeroMetrics());

  const fullMask = n === 0 ? 0 : (1 << n) - 1;

  if (n === 0) {
    const base = evaluate(0);
    return {
      contributions,
      base,
      full: base,
      method: "exact",
      scenariosEvaluated: evaluated,
      flooredScenarios: floored,
    };
  }

  if (n <= EXACT_FIELD_LIMIT) {
    // Exact: Σ over coalitions S not containing i of
    //   |S|!(n−|S|−1)!/n! · [v(S∪{i}) − v(S)]
    for (let mask = 0; mask <= fullMask; mask++) {
      const size = popcount(mask);
      const withoutWeight = (FACT[size] * FACT[n - size - 1]) / FACT[n];
      for (let i = 0; i < n; i++) {
        const bit = 1 << i;
        if (mask & bit) continue;
        const before = evaluate(mask);
        const after = evaluate(mask | bit);
        const acc = contributions.get(paths[i])!;
        for (const k of METRIC_KEYS) acc[k] += withoutWeight * (after[k] - before[k]);
      }
    }
    return {
      contributions,
      base: evaluate(0),
      full: evaluate(fullMask),
      method: "exact",
      scenariosEvaluated: evaluated,
      flooredScenarios: floored,
    };
  }

  // Sampled: draw permutations, walk A → B one field at a time along each,
  // average the marginals. Each permutation's marginals telescope exactly to
  // v(full) − v(empty), so the AVERAGE does too — the sampled bridge still
  // sums to the headline move; only the split between fields carries error.
  const rand = mulberry32(seedFrom(paths));
  const sumSq = new Map<FieldPath, number>(paths.map((p) => [p, 0]));
  const order = paths.map((_, i) => i);

  for (let s = 0; s < MONTE_CARLO_SAMPLES; s++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let mask = 0;
    let prev = evaluate(0);
    for (const idx of order) {
      mask |= 1 << idx;
      const cur = evaluate(mask);
      const acc = contributions.get(paths[idx])!;
      for (const k of METRIC_KEYS) acc[k] += cur[k] - prev[k];
      const d = cur.leveredIrr - prev.leveredIrr;
      sumSq.set(paths[idx], sumSq.get(paths[idx])! + d * d);
      prev = cur;
    }
  }

  const standardErrorBps: Record<FieldPath, number> = {};
  for (const p of paths) {
    const acc = contributions.get(p)!;
    const meanIrr = acc.leveredIrr / MONTE_CARLO_SAMPLES;
    const variance = Math.max(
      0,
      (sumSq.get(p)! - MONTE_CARLO_SAMPLES * meanIrr * meanIrr) / (MONTE_CARLO_SAMPLES - 1),
    );
    standardErrorBps[p] = Math.sqrt(variance / MONTE_CARLO_SAMPLES) * 10_000;
    for (const k of METRIC_KEYS) acc[k] /= MONTE_CARLO_SAMPLES;
  }

  return {
    contributions,
    base: evaluate(0),
    full: evaluate(fullMask),
    method: "sampled",
    standardErrorBps,
    scenariosEvaluated: evaluated,
    flooredScenarios: floored,
  };
}

function popcount(x: number): number {
  let c = 0;
  let v = x;
  while (v) {
    v &= v - 1;
    c++;
  }
  return c;
}

const displayValue = (v: LeafValue): number | string =>
  typeof v === "number" || typeof v === "string" ? v : v == null ? "—" : String(v);

export interface BuildBridgeOptions {
  /** injected for tests; defaults to the underwriting engine */
  run?: ModelRunner;
}

/**
 * Build the bridge from assumption set A to assumption set B.
 *
 * No changed fields → an empty bridge with a zero delta, not a crash.
 */
export function buildBridge(
  from: Assumptions,
  to: Assumptions,
  options: BuildBridgeOptions = {},
): Bridge {
  const run = options.run ?? defaultRunner;
  const paths = changedPaths(from, to);
  const walk = shapleyWalk(from, to, paths, run);

  const totalLeveredBps = (walk.full.leveredIrr - walk.base.leveredIrr) * 10_000;

  const steps: BridgeStep[] = paths.map((p) => {
    const c = walk.contributions.get(p)!;
    return {
      field: p,
      label: fieldLabel(p, from),
      fromValue: displayValue(getPath(from, p)),
      toValue: displayValue(getPath(to, p)),
      leveredIrrBps: c.leveredIrr * 10_000,
      unleveredIrrBps: c.unleveredIrr * 10_000,
      equityMultipleDelta: c.leveredEquityMultiple,
      year1CashFlowDelta: c.year1CashFlow,
      shareOfMove:
        Math.abs(totalLeveredBps) < 1e-9 ? null : (c.leveredIrr * 10_000) / totalLeveredBps,
    };
  });

  steps.sort((a, b) => Math.abs(b.leveredIrrBps) - Math.abs(a.leveredIrrBps));

  const summedBps = steps.reduce((s, x) => s + x.leveredIrrBps, 0);

  const defined = (v: number): number | null => (v <= -0.8999999 ? null : v);

  return {
    fromIrr: defined(walk.base.leveredIrr),
    toIrr: defined(walk.full.leveredIrr),
    fromUnleveredIrr: defined(walk.base.unleveredIrr),
    toUnleveredIrr: defined(walk.full.unleveredIrr),
    fromEquityMultiple: walk.base.leveredEquityMultiple,
    toEquityMultiple: walk.full.leveredEquityMultiple,
    steps,
    method: walk.method,
    standardErrorBps: walk.standardErrorBps,
    unexplainedBps: totalLeveredBps - summedBps,
    scenariosEvaluated: walk.scenariosEvaluated,
    flooredScenarios: walk.flooredScenarios,
  };
}

// ---------------------------------------------------------------------------
// The generated sentence — the thing that actually gets pasted into an email.
// ---------------------------------------------------------------------------

const pct1 = (v: number | null): string => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

/** Verb that matches the direction of travel for a given field. */
function movementPhrase(step: BridgeStep): string {
  const fmt = fieldFormat(step.field);
  const from = step.fromValue;
  const to = step.toValue;
  if (typeof from !== "number" || typeof to !== "number") {
    return `Changing ${step.label.toLowerCase()} from ${from} to ${to}`;
  }
  const rose = to > from;
  if (fmt === "pct") {
    return `${rose ? "Widening" : "Tightening"} ${step.label.toLowerCase()} from ${formatFieldValue(
      from,
      fmt,
    )} to ${formatFieldValue(to, fmt)}`;
  }
  if (fmt === "usd") {
    return `${rose ? "Raising" : "Cutting"} ${step.label.toLowerCase()} by ${formatFieldDelta(
      from,
      to,
      fmt,
    ).replace(/^[+−-]/, "")}`;
  }
  return `Moving ${step.label.toLowerCase()} from ${formatFieldValue(from, fmt)} to ${formatFieldValue(
    to,
    fmt,
  )}`;
}

/**
 * Plain-English summary, one clause per driver:
 * "Levered IRR went from 6.6% to 19.3%. Cutting purchase price by $1.7M added
 *  740 bps. Tightening exit cap from 8.00% to 6.50% added 520 bps."
 *
 * Drivers worth under 1 bp are rolled into a trailing "other assumptions"
 * clause rather than printed — a sentence with fourteen clauses gets pasted
 * into an email by nobody.
 */
export function bridgeSentence(bridge: Bridge, maxDrivers = 4): string {
  const head =
    bridge.fromIrr == null || bridge.toIrr == null
      ? `Levered IRR ${bridge.fromIrr == null ? "had no solution" : `was ${pct1(bridge.fromIrr)}`} and ${
          bridge.toIrr == null ? "has none now" : `is now ${pct1(bridge.toIrr)}`
        }.`
      : `Levered IRR went from ${pct1(bridge.fromIrr)} to ${pct1(bridge.toIrr)}.`;

  const material = bridge.steps.filter((s) => Math.abs(s.leveredIrrBps) >= 1);
  if (material.length === 0) return `${head} No single assumption moved it materially.`;

  const shown = material.slice(0, maxDrivers);
  const rest = material.slice(maxDrivers);

  const clauses = shown.map((s) => {
    const bps = Math.round(Math.abs(s.leveredIrrBps));
    return `${movementPhrase(s)} ${s.leveredIrrBps >= 0 ? "added" : "cost"} ${bps} bps.`;
  });

  if (rest.length) {
    const restBps = Math.round(rest.reduce((a, s) => a + s.leveredIrrBps, 0));
    clauses.push(
      `${rest.length} other assumption${rest.length === 1 ? "" : "s"} ${
        restBps >= 0 ? "added" : "cost"
      } ${Math.abs(restBps)} bps.`,
    );
  }

  return [head, ...clauses].join(" ");
}
