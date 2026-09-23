// Leverage check: the deal's going-in cap against a debt-cost benchmark —
// deterministic code, not a model call. The 1989 lesson made concrete:
// negative leverage means the deal loses money on every borrowed dollar
// until growth bails it out, so it gets named, not buried.
//
// The benchmark we can source daily is the 30-yr fixed (FRED PMMS) — an
// owner-occupier rate. Investor debt on small multifamily prices ABOVE it,
// so the honest read is one-sided: negative at the benchmark is certainly
// negative in practice, while "positive" at the benchmark still needs the
// real quote. THIN_BPS draws that line.

export interface LeverageRead {
  /** cap minus benchmark, in basis points (rounded) */
  spreadBps: number;
  tone: "negative" | "thin" | "positive";
  /** one-line human read, e.g. "Negative leverage: 80 bps below the 30-yr fixed" */
  label: string;
}

/** Spreads under this (but not negative) count as thin: investor pricing
 *  above the benchmark likely erases them. */
export const THIN_BPS = 75;

export function leverageRead(
  capPct: number,
  benchmarkPct: number,
  /** what the benchmark is called in the label — the 30-yr fixed by
   *  default; "today's index plus the class spread" when the benchmark is
   *  the screening rate the model was seeded with (lib/debt-index) */
  benchmarkName = "the 30-yr fixed",
): LeverageRead | null {
  if (
    !Number.isFinite(capPct) ||
    !Number.isFinite(benchmarkPct) ||
    capPct <= 0 ||
    capPct > 25 ||
    benchmarkPct <= 0 ||
    benchmarkPct > 25
  ) {
    return null;
  }
  const spreadBps = Math.round((capPct - benchmarkPct) * 100);
  if (spreadBps < 0) {
    return {
      spreadBps,
      tone: "negative",
      label: `Negative leverage: going-in cap sits ${Math.abs(spreadBps)} bps below ${benchmarkName}`,
    };
  }
  if (spreadBps < THIN_BPS) {
    return {
      spreadBps,
      tone: "thin",
      label: `Thin spread: going-in cap only ${spreadBps} bps above ${benchmarkName}`,
    };
  }
  return {
    spreadBps,
    tone: "positive",
    label: `Positive leverage at the benchmark: ${spreadBps} bps above ${benchmarkName}`,
  };
}

/**
 * The cap rate's spread over the 10-year Treasury — the one figure every
 * buyer, seller and lender quotes a cap against, and a fact rather than a
 * read: the 10-year is published daily and the spread is arithmetic. No
 * tone, because what a normal spread is depends on the class and the year
 * and is not something this module asserts; the label says the figure and
 * its direction, and the page prints the 10-year's own date beside it.
 */
export interface CapSpreadRead {
  /** cap minus the 10-year, in basis points (rounded); negative is a cap under the Treasury */
  spreadBps: number;
  /** "46 bps over the 10-year Treasury" / "12 bps under the 10-year Treasury" / "level with the 10-year Treasury" */
  label: string;
}

export function capSpreadRead(capPct: number, tenYearPct: number): CapSpreadRead | null {
  if (
    !Number.isFinite(capPct) ||
    !Number.isFinite(tenYearPct) ||
    capPct <= 0 ||
    capPct > 25 ||
    tenYearPct <= 0 ||
    tenYearPct > 25
  ) {
    return null;
  }
  const spreadBps = Math.round((capPct - tenYearPct) * 100);
  const label =
    spreadBps === 0
      ? "level with the 10-year Treasury"
      : `${Math.abs(spreadBps)} bps ${spreadBps > 0 ? "over" : "under"} the 10-year Treasury`;
  return { spreadBps, label };
}
