import { describe, expect, it } from "vitest";
import {
  bridgeSummaryLine,
  reconcileValuations,
  resolveGoingInCap,
  scoreAggressiveness,
  type NamedValuation,
  type ValuationBridgeOk,
} from "./reconcile";
import { impliedReturns } from "./implied";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";

/** Relative closeness — at $70M scale, an absolute 1e-9 is finer than float64
 *  can represent, so "sums exactly" means to within a part in 10^9. */
const expectClose = (actual: number, expected: number, relTol = 1e-9) => {
  const scale = Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected) / scale).toBeLessThan(relTol);
};

/**
 * The grounding case: two brokers, the same asset, a $6.5M gap.
 * Both are internally consistent — headline = NOI/cap MINUS the capex
 * deduction, which is the identity the reconciler decomposes.
 */
const JLL: NamedValuation = {
  sourceLabel: "JLL BOV",
  headlineValue: 71_500_000,
  year1Noi: 4_320_000, // 72.0M capitalized, less the 0.5M deduction
  goingInCap: 0.06,
  exitCap: 0.0575,
  holdYears: 5,
  rentGrowth: 0.035,
  vacancyAssumption: 0.05,
  capexDeduction: 500_000,
  discountRate: 0.075,
};

const EASTDIL: NamedValuation = {
  sourceLabel: "Eastdil BOV",
  headlineValue: 65_000_000,
  year1Noi: 4_116_800, // 66.4M capitalized, less the 1.4M deduction
  goingInCap: 0.062,
  exitCap: 0.0625,
  holdYears: 5,
  rentGrowth: 0.025,
  vacancyAssumption: 0.07,
  capexDeduction: 1_400_000,
  discountRate: 0.085,
};

const ok = (b: ReturnType<typeof reconcileValuations>): ValuationBridgeOk => {
  if (!b.ok) throw new Error(`expected a bridge, got: ${b.error}`);
  return b;
};

describe("resolveGoingInCap", () => {
  it("prefers the stated cap", () => {
    expect(resolveGoingInCap(JLL)).toEqual({ value: 0.06, basis: "stated" });
  });

  it("backs a cap out of the CAPITALIZED value, not the headline", () => {
    const r = resolveGoingInCap({ ...JLL, goingInCap: null });
    expect(r.basis).toBe("derived");
    // headline = NOI/cap − deduction, so the deduction has to be added back
    // before dividing. Do that and the derivation recovers the stated 6.00%
    // exactly; divide by the headline alone and the deduction is folded into
    // the cap, where reconcileValuations then counts it a second time.
    expectClose(r.value!, JLL.year1Noi! / (JLL.headlineValue! + JLL.capexDeduction!));
    expect(r.value).toBeCloseTo(JLL.goingInCap!, 12);
    expect(r.value).not.toBeCloseTo(JLL.year1Noi! / JLL.headlineValue!, 5);
  });

  it("divides by the headline when no deduction is stated", () => {
    // Nothing to add back, and nothing invented: the unknown stays unknown
    // and surfaces later in the bridge's residual.
    const r = resolveGoingInCap({ ...JLL, goingInCap: null, capexDeduction: null });
    expect(r.basis).toBe("derived");
    expectClose(r.value!, JLL.year1Noi! / JLL.headlineValue!);
  });

  it("reports missing rather than guessing", () => {
    expect(resolveGoingInCap({ ...JLL, goingInCap: null, year1Noi: null })).toEqual({
      value: null,
      basis: "missing",
    });
  });
});

describe("reconcileValuations — the symmetric split", () => {
  it("NOI and cap effects sum exactly to the capitalized-value delta", () => {
    const bridge = ok(reconcileValuations(JLL, EASTDIL));
    const noi = bridge.components.find((c) => c.key === "noi")!.amount;
    const cap = bridge.components.find((c) => c.key === "cap")!.amount;
    expectClose(noi + cap, bridge.capitalizedDelta);
    expectClose(
      bridge.capitalizedDelta,
      EASTDIL.year1Noi! / EASTDIL.goingInCap! - JLL.year1Noi! / JLL.goingInCap!,
    );
  });

  it("every component including the residual sums to the headline delta", () => {
    const bridge = ok(reconcileValuations(JLL, EASTDIL));
    const summed = bridge.components.reduce((s, c) => s + c.amount, 0);
    expectClose(summed, bridge.totalDelta);
    expect(bridge.totalDelta).toBe(65_000_000 - 71_500_000);
  });

  it("does not depend on the order the two factors are applied", () => {
    // The naive alternatives — cap first, then NOI, or the reverse — bracket
    // the symmetric answer, which sits exactly between them.
    const bridge = ok(reconcileValuations(JLL, EASTDIL));
    const noi = bridge.components.find((c) => c.key === "noi")!.amount;
    const noiFirst = (EASTDIL.year1Noi! - JLL.year1Noi!) / JLL.goingInCap!;
    const noiLast = (EASTDIL.year1Noi! - JLL.year1Noi!) / EASTDIL.goingInCap!;
    expectClose(noi, (noiFirst + noiLast) / 2);
  });

  it("negates every component when A and B are reversed", () => {
    const forward = ok(reconcileValuations(JLL, EASTDIL));
    const backward = ok(reconcileValuations(EASTDIL, JLL));
    for (const c of forward.components) {
      const mirror = backward.components.find((x) => x.key === c.key)!;
      expectClose(mirror.amount, -c.amount);
    }
    expectClose(backward.totalDelta, -forward.totalDelta);
  });

  it("produces a zero bridge for identical valuations", () => {
    const bridge = ok(reconcileValuations(JLL, { ...JLL, sourceLabel: "JLL copy" }));
    expect(bridge.totalDelta).toBe(0);
    for (const c of bridge.components) expect(Math.abs(c.amount)).toBeLessThan(0.01);
    expect(bridgeSummaryLine(bridge)).toContain("land on the same value");
  });

  it("returns a clear error, not NaN, when one side has no cap rate", () => {
    const noCap: NamedValuation = {
      ...EASTDIL,
      goingInCap: null,
      year1Noi: null,
      headlineValue: 65_000_000,
    };
    const bridge = reconcileValuations(JLL, noCap);
    expect(bridge.ok).toBe(false);
    if (bridge.ok) throw new Error("unreachable");
    expect(bridge.error).toContain("Eastdil BOV");
    expect(bridge.error).toContain("cap rate");
    expect(bridge.missing.some((m) => m.field === "cap")).toBe(true);
  });

  it("labels a derived cap distinctly from a stated one", () => {
    const derivedSide: NamedValuation = { ...EASTDIL, goingInCap: null };
    const bridge = ok(reconcileValuations(JLL, derivedSide));
    expect(bridge.fromCapBasis).toBe("stated");
    expect(bridge.toCapBasis).toBe("derived");
  });

  it("does not count a stated deduction twice when the cap is derived", () => {
    // The regression this guards: derive Eastdil's cap off its headline and
    // the $1.4M deduction is baked into the cap AND added again as its own
    // term. The two components sum to $1.4M too much, the residual absorbs
    // the difference, and the summary line reports a fully-explained gap as
    // "-22% unexplained". Both sides are internally consistent here, so the
    // honest answer is that NOTHING is unexplained.
    const derivedSide: NamedValuation = { ...EASTDIL, goingInCap: null };
    const bridge = ok(reconcileValuations(JLL, derivedSide));

    const stated = ok(reconcileValuations(JLL, EASTDIL));
    for (const c of stated.components) {
      const mirror = bridge.components.find((x) => x.key === c.key)!;
      expectClose(mirror.amount, c.amount, 1e-9);
    }
    expect(
      Math.abs(bridge.components.find((c) => c.key === "residual")!.amount),
    ).toBeLessThan(0.01);
    expect(bridgeSummaryLine(bridge)).not.toContain("unexplained");
  });

  it("never turns an unstated capex deduction into a zero deduction", () => {
    const silent: NamedValuation = { ...EASTDIL, capexDeduction: null };
    const bridge = ok(reconcileValuations(JLL, silent));
    const deduction = bridge.components.find((c) => c.key === "deduction")!;
    expect(deduction.amount).toBe(0);
    expect(deduction.label).toContain("not stated");
    // With both sides stated the identity closes and nothing is unexplained…
    const withStated = ok(reconcileValuations(JLL, EASTDIL));
    expect(
      Math.abs(withStated.components.find((c) => c.key === "residual")!.amount),
    ).toBeLessThan(0.01);
    // …and with one side silent, the $900k of capex treatment surfaces as
    // unexplained instead of being quietly assumed away.
    const residual = bridge.components.find((c) => c.key === "residual")!;
    expectClose(residual.amount, -900_000, 1e-6);
  });
});

describe("bridgeSummaryLine", () => {
  it("reads as the copy-able one-liner", () => {
    const line = bridgeSummaryLine(ok(reconcileValuations(JLL, EASTDIL)));
    expect(line).toMatch(/^The \$6\.5M gap — Eastdil BOV below JLL BOV — is /);
    expect(line).toMatch(/\d+% cap rate/);
    expect(line).toMatch(/\d+% year-1 noi/);
  });
});

describe("scoreAggressiveness", () => {
  it("tallies which source is more optimistic per field", () => {
    const tally = scoreAggressiveness(JLL, EASTDIL);
    // JLL: higher NOI, tighter going-in and exit caps, faster growth, lower
    // vacancy, lighter capex, lower discount rate — aggressive on all seven.
    expect(tally.comparable).toBe(7);
    expect(tally.aCount).toBe(7);
    expect(tally.bCount).toBe(0);
  });

  it("marks a field not comparable when either side is silent", () => {
    const tally = scoreAggressiveness(JLL, { ...EASTDIL, rentGrowth: null });
    const row = tally.rows.find((r) => r.field === "rentGrowth")!;
    expect(row.moreAggressive).toBeNull();
    expect(row.delta).toBeNull();
    expect(tally.comparable).toBe(6);
  });

  it("excludes headline value — it is the output, not an assumption", () => {
    const tally = scoreAggressiveness(JLL, EASTDIL);
    expect(tally.rows.some((r) => r.field === "headlineValue")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Forward-looking layer
// ---------------------------------------------------------------------------

const BASE: UnderwriteInputs = {
  purchasePrice: 68_000_000,
  holdMonths: 60,
  acqFeePct: 0,
  acqFeeCap: 0,
  transferTaxPct: 0,
  recordationTaxPct: 0,
  generalHoldPct: 0.01,
  buyerLegal: 0,
  lenderLegal: 0,
  thirdPartyReports: 0,
  miscClosing: 0,
  inPlaceRentAnnual: 7_500_000,
  expenseRecoveriesAnnual: 0,
  otherRevenueAnnual: 0,
  vacancyPct: 0.05,
  rentGrowthPct: 0.03,
  expenseLines: [{ label: "Operating expenses", annual: 3_000_000 }],
  mgmtFeePct: 0.03,
  expenseGrowthPct: 0.03,
  rsf: 250_000,
  reservesPsf: 0.2,
  capitalImprovementsYr1: 0,
  tiPsf: 0,
  lcPct: 0,
  amFeePctEquity: 0.005,
  ltc: 0.6,
  allInRatePct: 0.06,
  ioMonths: 0,
  amortMonths: 360,
  financingCostPct: 0.01,
  exitCapPct: 0.06,
  saleCostPct: 0.02,
};

describe("impliedReturns", () => {
  it("lands year-1 NOI exactly on the valuation's stated figure", () => {
    const r = impliedReturns(BASE, JLL);
    expect(r.ok).toBe(true);
    expectClose(r.year1Noi!, JLL.year1Noi!, 1e-9);
    expectClose(r.goingInCapPct!, JLL.year1Noi! / JLL.headlineValue!, 1e-9);
  });

  it("prices the cheaper BOV at the higher return", () => {
    const jll = impliedReturns(BASE, JLL);
    const eastdil = impliedReturns(BASE, EASTDIL);
    expect(jll.leveredIrrPct).not.toBeNull();
    expect(eastdil.leveredIrrPct).not.toBeNull();
    // Eastdil is $6.5M cheaper but underwrites a wider exit and slower growth;
    // the point is that the model prices BOTH under one set of debt terms.
    expect(jll.assumptions!.ltc).toBe(BASE.ltc);
    expect(eastdil.assumptions!.ltc).toBe(BASE.ltc);
    expect(jll.assumptions!.purchasePrice).toBe(71_500_000);
    expect(eastdil.assumptions!.purchasePrice).toBe(65_000_000);
  });

  it("lists every assumption borrowed from the user's own model", () => {
    const bare: NamedValuation = {
      sourceLabel: "Seller guidance",
      headlineValue: 70_000_000,
      year1Noi: null,
      goingInCap: null,
      exitCap: null,
      holdYears: null,
      rentGrowth: null,
      vacancyAssumption: null,
      capexDeduction: null,
      discountRate: null,
    };
    const r = impliedReturns(BASE, bare);
    expect(r.ok).toBe(true);
    const labels = r.substitutions.map((s) => s.label);
    expect(labels).toContain("Year-1 NOI");
    expect(labels).toContain("Exit cap");
    expect(labels).toContain("Vacancy");
    expect(labels).toContain("Debt terms");
  });

  it("holds an unstated exit cap flat at the going-in cap and says so", () => {
    const r = impliedReturns(BASE, { ...JLL, exitCap: null });
    expect(r.assumptions!.exitCapPct).toBe(JLL.goingInCap!);
    expect(r.substitutions.find((s) => s.label === "Exit cap")!.reason).toContain("held flat");
  });

  it("refuses rather than guessing when there is no headline value", () => {
    const r = impliedReturns(BASE, { ...JLL, headlineValue: null });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no headline value");
    expect(r.leveredIrrPct).toBeNull();
  });
});
