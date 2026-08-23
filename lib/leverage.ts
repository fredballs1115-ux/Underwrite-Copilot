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
      label: `Negative leverage: going-in cap sits ${Math.abs(spreadBps)} bps below the 30-yr fixed`,
    };
  }
  if (spreadBps < THIN_BPS) {
    return {
      spreadBps,
      tone: "thin",
      label: `Thin spread: going-in cap only ${spreadBps} bps above the 30-yr fixed`,
    };
  }
  return {
    spreadBps,
    tone: "positive",
    label: `Positive leverage at the benchmark: ${spreadBps} bps above the 30-yr fixed`,
  };
}
