/**
 * BOV Reconciler — decompose the gap between two opinions of value.
 *
 * JLL says $71.5M, Eastdil says $65M. The $6.5M question is WHERE the gap
 * lives: a different Year-1 NOI, a different cap rate, a different capex
 * deduction, or something neither document explains.
 *
 * Core identity is `value = NOI / cap`, with deductions below the line. A
 * naive "hold cap constant, then hold NOI constant" split gives a different
 * answer depending on which you apply first, so the split here is the
 * SYMMETRIC (two-factor Shapley) one, which is order-independent and sums
 * EXACTLY to the capitalized-value delta:
 *
 *   noiEffect = ½ [ (NOI_B − NOI_A)/cap_A  +  (NOI_B − NOI_A)/cap_B ]
 *   capEffect = ½ [ NOI_A(1/cap_B − 1/cap_A) + NOI_B(1/cap_B − 1/cap_A) ]
 *
 * Pure: no I/O, no LLM.
 */
import {
  FIELD_LABELS,
  VALUATION_FIELDS,
  type ValuationFacts,
  type ValuationField,
} from "./types";

/** A cap rate is either stated on the page or backed out of value and NOI.
 *  The two are NOT interchangeable and the UI labels them differently — a
 *  derived cap tells you nothing the value and NOI didn't already. */
export interface ResolvedCap {
  value: number | null;
  basis: "stated" | "derived" | "missing";
}

export function resolveGoingInCap(v: ValuationFacts): ResolvedCap {
  if (v.goingInCap != null && v.goingInCap > 0) return { value: v.goingInCap, basis: "stated" };
  if (
    v.year1Noi != null &&
    v.headlineValue != null &&
    v.headlineValue > 0 &&
    v.year1Noi > 0
  ) {
    return { value: v.year1Noi / v.headlineValue, basis: "derived" };
  }
  return { value: null, basis: "missing" };
}

export interface BridgeComponent {
  key: "noi" | "cap" | "deduction" | "residual";
  label: string;
  /** dollars of value; positive means it pushed B's value ABOVE A's */
  amount: number;
  /** share of |ΔV|, decimal; null when ΔV is ~0 */
  share: number | null;
}

export interface ValuationBridgeOk {
  ok: true;
  fromLabel: string;
  toLabel: string;
  fromValue: number;
  toValue: number;
  /** headline B − headline A */
  totalDelta: number;
  /** NOI_B/cap_B − NOI_A/cap_A — what the identity explains before deductions */
  capitalizedDelta: number;
  components: BridgeComponent[];
  /** how each side's cap rate was obtained, so a derived one is never shown
   *  as if the document stated it */
  fromCapBasis: ResolvedCap["basis"];
  toCapBasis: ResolvedCap["basis"];
}

export interface ValuationBridgeError {
  ok: false;
  /** user-facing, names the side and the field */
  error: string;
  missing: { side: "from" | "to"; field: ValuationField | "cap" }[];
}

export type ValuationBridge = ValuationBridgeOk | ValuationBridgeError;

export interface NamedValuation extends ValuationFacts {
  sourceLabel: string;
}

/**
 * Decompose `V_B − V_A`. Returns a typed error — never NaN, never a silent
 * zero — when either side lacks a cap rate, an NOI, or a headline value.
 */
export function reconcileValuations(
  a: NamedValuation,
  b: NamedValuation,
): ValuationBridge {
  const missing: ValuationBridgeError["missing"] = [];
  const capA = resolveGoingInCap(a);
  const capB = resolveGoingInCap(b);

  if (a.headlineValue == null) missing.push({ side: "from", field: "headlineValue" });
  if (b.headlineValue == null) missing.push({ side: "to", field: "headlineValue" });
  if (a.year1Noi == null) missing.push({ side: "from", field: "year1Noi" });
  if (b.year1Noi == null) missing.push({ side: "to", field: "year1Noi" });
  if (capA.value == null) missing.push({ side: "from", field: "cap" });
  if (capB.value == null) missing.push({ side: "to", field: "cap" });

  if (missing.length) {
    const describe = (m: (typeof missing)[number]) =>
      `${m.side === "from" ? a.sourceLabel : b.sourceLabel} is missing ${
        m.field === "cap" ? "a cap rate (and has no value + NOI to back one out of)" : FIELD_LABELS[m.field].toLowerCase()
      }`;
    return {
      ok: false,
      error: `${[...new Set(missing.map(describe))].join("; ")}. Fill it in and the bridge will build.`,
      missing,
    };
  }

  const noiA = a.year1Noi!;
  const noiB = b.year1Noi!;
  const cA = capA.value!;
  const cB = capB.value!;

  const noiEffect = 0.5 * ((noiB - noiA) / cA + (noiB - noiA) / cB);
  const capEffect = 0.5 * (noiA * (1 / cB - 1 / cA) + noiB * (1 / cB - 1 / cA));
  // More capex deducted lowers value, so the effect carries the opposite sign
  // of the deduction difference. A null deduction is "not stated" and does not
  // become a zero deduction — the pair only contributes when BOTH sides state
  // one, and otherwise the difference lands in the residual, visibly.
  const deductionComparable = a.capexDeduction != null && b.capexDeduction != null;
  const deductionEffect = deductionComparable
    ? -(b.capexDeduction! - a.capexDeduction!)
    : 0;

  const totalDelta = b.headlineValue! - a.headlineValue!;
  const capitalizedDelta = noiB / cB - noiA / cA;
  const residual = totalDelta - (noiEffect + capEffect + deductionEffect);

  const denom = Math.abs(totalDelta);
  const share = (x: number) => (denom < 1e-9 ? null : x / totalDelta);

  const components: BridgeComponent[] = [
    { key: "noi", label: "Year-1 NOI", amount: noiEffect, share: share(noiEffect) },
    { key: "cap", label: "Cap rate", amount: capEffect, share: share(capEffect) },
    {
      key: "deduction",
      label: deductionComparable ? "Capex / TI-LC treatment" : "Capex (not stated by both)",
      amount: deductionEffect,
      share: share(deductionEffect),
    },
    { key: "residual", label: "Unexplained", amount: residual, share: share(residual) },
  ];

  return {
    ok: true,
    fromLabel: a.sourceLabel,
    toLabel: b.sourceLabel,
    fromValue: a.headlineValue!,
    toValue: b.headlineValue!,
    totalDelta,
    capitalizedDelta,
    components,
    fromCapBasis: capA.basis,
    toCapBasis: capB.basis,
  };
}

// ---------------------------------------------------------------------------
// Aggressiveness tally
// ---------------------------------------------------------------------------

/**
 * Which direction counts as optimistic for each field. `+1` means a HIGHER
 * number is the more aggressive assumption; `-1` means a lower one is.
 * Headline value is excluded deliberately — it's the OUTPUT of the other
 * assumptions, not an assumption, and counting it would double-count them.
 */
const AGGRESSIVE_DIRECTION: Partial<Record<ValuationField, 1 | -1>> = {
  year1Noi: 1,
  goingInCap: -1,
  exitCap: -1,
  rentGrowth: 1,
  vacancyAssumption: -1,
  capexDeduction: -1,
  discountRate: -1,
};

export interface AggressivenessRow {
  field: ValuationField;
  label: string;
  aValue: number | null;
  bValue: number | null;
  /** which side is more optimistic; 'tie' when equal, null when not comparable */
  moreAggressive: "a" | "b" | "tie" | null;
  /** b − a, null when either side is unstated */
  delta: number | null;
}

export interface AggressivenessTally {
  rows: AggressivenessRow[];
  /** counts over the comparable rows only */
  aCount: number;
  bCount: number;
  comparable: number;
}

/**
 * Per-field "who is more optimistic", with a plain tally. No composite score
 * and no letter grade — the count is the finding; a single number would hide
 * which four of six inputs it came from.
 */
export function scoreAggressiveness(
  a: NamedValuation,
  b: NamedValuation,
): AggressivenessTally {
  const rows: AggressivenessRow[] = [];
  let aCount = 0;
  let bCount = 0;
  let comparable = 0;

  for (const field of VALUATION_FIELDS) {
    const dir = AGGRESSIVE_DIRECTION[field];
    if (!dir) continue;
    const av = a[field];
    const bv = b[field];
    if (av == null || bv == null) {
      rows.push({ field, label: FIELD_LABELS[field], aValue: av, bValue: bv, moreAggressive: null, delta: null });
      continue;
    }
    comparable++;
    const delta = bv - av;
    let moreAggressive: AggressivenessRow["moreAggressive"] = "tie";
    if (Math.abs(delta) > 1e-9) {
      const bIsMore = dir === 1 ? bv > av : bv < av;
      moreAggressive = bIsMore ? "b" : "a";
      if (bIsMore) bCount++;
      else aCount++;
    }
    rows.push({ field, label: FIELD_LABELS[field], aValue: av, bValue: bv, moreAggressive, delta });
  }

  return { rows, aCount, bCount, comparable };
}

// ---------------------------------------------------------------------------
// The copy-able one-liner
// ---------------------------------------------------------------------------

const usd = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
};

/**
 * "The $6.5M gap is 71% cap rate, 24% Year-1 NOI, 5% capex treatment."
 *
 * Shares are of the signed total, so a component that pushed the OTHER way
 * reads as a negative share rather than silently inflating the others.
 */
export function bridgeSummaryLine(bridge: ValuationBridgeOk): string {
  const gap = Math.abs(bridge.totalDelta);
  if (gap < 1) {
    return `${bridge.fromLabel} and ${bridge.toLabel} land on the same value.`;
  }
  const parts = bridge.components
    .filter((c) => c.share != null && Math.abs(c.share) >= 0.005)
    .sort((x, y) => Math.abs(y.share!) - Math.abs(x.share!))
    .map((c) => `${Math.round(c.share! * 100)}% ${c.label.toLowerCase()}`);
  const direction = bridge.totalDelta > 0 ? "above" : "below";
  return `The ${usd(gap)} gap — ${bridge.toLabel} ${direction} ${bridge.fromLabel} — is ${parts.join(
    ", ",
  )}.`;
}
