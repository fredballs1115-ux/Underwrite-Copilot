import { describe, expect, it } from "vitest";
import { buildBridge, bridgeSentence, EXACT_FIELD_LIMIT } from "../attribution";
import { changedPaths, setPath } from "../fields";
import { runModel, type Assumptions } from "../model";
import { computeUnderwrite } from "@/lib/underwrite/engine";

/**
 * A screening-grade industrial deal, roughly the shape of the case the phase
 * was written from: ~$13.7M at an 8.0% exit, levered mid-single-digit IRR.
 */
const BASE: Assumptions = {
  purchasePrice: 13_700_000,
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

  inPlaceRentAnnual: 1_500_000,
  expenseRecoveriesAnnual: 0,
  otherRevenueAnnual: 0,
  vacancyPct: 0.05,
  rentGrowthPct: 0.03,

  expenseLines: [{ label: "Operating expenses", annual: 420_000 }],
  mgmtFeePct: 0,
  expenseGrowthPct: 0.03,

  rsf: 150_000,
  reservesPsf: 0.15,
  capitalImprovementsYr1: 0,
  tiPsf: 0,
  lcPct: 0,

  amFeePctEquity: 0.005,

  ltc: 0.6,
  allInRatePct: 0.06,
  ioMonths: 0,
  amortMonths: 360,
  financingCostPct: 0.01,

  exitCapPct: 0.08,
  saleCostPct: 0.02,
};

const withFields = (base: Assumptions, patch: Record<string, number>): Assumptions =>
  Object.entries(patch).reduce((a, [k, v]) => setPath(a, k, v), base);

const totalLeveredBps = (a: Assumptions, b: Assumptions): number =>
  (runModel(b).leveredIrr - runModel(a).leveredIrr) * 10_000;

describe("changedPaths", () => {
  it("finds only the leaves that actually differ", () => {
    const b = withFields(BASE, { purchasePrice: 12_000_000, exitCapPct: 0.065 });
    expect(changedPaths(BASE, b)).toEqual(["exitCapPct", "purchasePrice"]);
  });

  it("ignores float noise below tolerance", () => {
    const b = setPath(BASE, "purchasePrice", 13_700_000 + 1e-7);
    expect(changedPaths(BASE, b)).toEqual([]);
  });

  it("collapses a re-shaped expense array to one atomic driver", () => {
    const b = setPath(BASE, "expenseLines", [
      { label: "Operating expenses", annual: 300_000 },
      { label: "Property taxes", annual: 120_000 },
    ]);
    expect(changedPaths(BASE, b)).toEqual(["expenseLines"]);
  });

  it("diffs an expense line in place when the shape is unchanged", () => {
    const b = setPath(BASE, "expenseLines.0.annual", 460_000);
    expect(changedPaths(BASE, b)).toEqual(["expenseLines.0.annual"]);
  });
});

describe("buildBridge — efficiency", () => {
  it("attributes a single changed field entirely to that field", () => {
    const b = setPath(BASE, "exitCapPct", 0.065);
    const bridge = buildBridge(BASE, b);
    expect(bridge.method).toBe("exact");
    expect(bridge.steps).toHaveLength(1);
    expect(bridge.steps[0].field).toBe("exitCapPct");
    expect(bridge.steps[0].leveredIrrBps).toBeCloseTo(totalLeveredBps(BASE, b), 9);
    expect(Math.abs(bridge.unexplainedBps)).toBeLessThan(1e-9);
  });

  it("two changed fields sum to the total delta within 1e-9", () => {
    const b = withFields(BASE, { purchasePrice: 12_000_000, exitCapPct: 0.065 });
    const bridge = buildBridge(BASE, b);
    const summed = bridge.steps.reduce((s, x) => s + x.leveredIrrBps, 0);
    expect(summed).toBeCloseTo(totalLeveredBps(BASE, b), 9);
    expect(Math.abs(bridge.unexplainedBps)).toBeLessThan(1e-9);
  });

  it("holds at the exact-path limit (6 fields), under 1 bp unexplained", () => {
    const b = withFields(BASE, {
      purchasePrice: 12_000_000,
      exitCapPct: 0.065,
      rentGrowthPct: 0.04,
      vacancyPct: 0.07,
      ltc: 0.65,
      allInRatePct: 0.055,
    });
    const bridge = buildBridge(BASE, b);
    expect(bridge.method).toBe("exact");
    expect(bridge.steps).toHaveLength(EXACT_FIELD_LIMIT);
    expect(Math.abs(bridge.unexplainedBps)).toBeLessThan(1);
    // 2^6 coalitions, not 6! permutations × 6 steps.
    expect(bridge.scenariosEvaluated).toBe(64);
  });

  it("also balances the unlevered IRR, multiple and Year-1 cash flow", () => {
    const b = withFields(BASE, { purchasePrice: 12_000_000, exitCapPct: 0.065 });
    const bridge = buildBridge(BASE, b);
    const a0 = runModel(BASE);
    const b0 = runModel(b);
    const sum = (k: "unleveredIrrBps" | "equityMultipleDelta" | "year1CashFlowDelta") =>
      bridge.steps.reduce((s, x) => s + x[k], 0);
    expect(sum("unleveredIrrBps")).toBeCloseTo((b0.unleveredIrr - a0.unleveredIrr) * 10_000, 8);
    expect(sum("equityMultipleDelta")).toBeCloseTo(
      b0.leveredEquityMultiple - a0.leveredEquityMultiple,
      9,
    );
    expect(sum("year1CashFlowDelta")).toBeCloseTo(b0.year1CashFlow - a0.year1CashFlow, 4);
  });
});

describe("buildBridge — symmetry and order independence", () => {
  it("does not depend on the order the fields appear in the assumption object", () => {
    // Same values, different key insertion order.
    const shuffled = Object.fromEntries(
      Object.entries(BASE).reverse(),
    ) as unknown as Assumptions;
    const target = withFields(BASE, { purchasePrice: 12_000_000, exitCapPct: 0.065 });
    const shuffledTarget = Object.fromEntries(
      Object.entries(target).reverse(),
    ) as unknown as Assumptions;

    const a = buildBridge(BASE, target);
    const b = buildBridge(shuffled, shuffledTarget);
    expect(b.steps.map((s) => s.field)).toEqual(a.steps.map((s) => s.field));
    a.steps.forEach((step, i) => {
      expect(b.steps[i].leveredIrrBps).toBeCloseTo(step.leveredIrrBps, 9);
    });
  });

  it("negates every contribution when A and B are reversed", () => {
    const target = withFields(BASE, {
      purchasePrice: 12_000_000,
      exitCapPct: 0.065,
      rentGrowthPct: 0.04,
    });
    const forward = buildBridge(BASE, target);
    const backward = buildBridge(target, BASE);
    for (const step of forward.steps) {
      const mirror = backward.steps.find((s) => s.field === step.field);
      expect(mirror).toBeDefined();
      expect(mirror!.leveredIrrBps).toBeCloseTo(-step.leveredIrrBps, 8);
      expect(mirror!.equityMultipleDelta).toBeCloseTo(-step.equityMultipleDelta, 9);
    }
  });
});

describe("buildBridge — sampled path", () => {
  const target = withFields(BASE, {
    purchasePrice: 12_000_000,
    exitCapPct: 0.065,
    rentGrowthPct: 0.04,
    vacancyPct: 0.07,
    ltc: 0.65,
    allInRatePct: 0.055,
    holdMonths: 84,
    saleCostPct: 0.015,
  });

  it("switches to sampling above the exact limit and stays within 5 bps", () => {
    const bridge = buildBridge(BASE, target);
    expect(bridge.method).toBe("sampled");
    expect(bridge.steps).toHaveLength(8);
    const summed = bridge.steps.reduce((s, x) => s + x.leveredIrrBps, 0);
    expect(Math.abs(summed - totalLeveredBps(BASE, target))).toBeLessThan(5);
    expect(Math.abs(bridge.unexplainedBps)).toBeLessThan(5);
  });

  it("reports a standard error per field", () => {
    const bridge = buildBridge(BASE, target);
    expect(bridge.standardErrorBps).toBeDefined();
    for (const step of bridge.steps) {
      expect(bridge.standardErrorBps![step.field]).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(bridge.standardErrorBps![step.field])).toBe(true);
    }
  });

  it("is deterministic — the same diff draws the same permutations", () => {
    const one = buildBridge(BASE, target);
    const two = buildBridge(BASE, target);
    one.steps.forEach((s, i) => {
      expect(two.steps[i].field).toBe(s.field);
      expect(two.steps[i].leveredIrrBps).toBe(s.leveredIrrBps);
    });
  });
});

describe("buildBridge — degenerate inputs", () => {
  it("returns an empty bridge with a zero delta when nothing changed", () => {
    const bridge = buildBridge(BASE, { ...BASE });
    expect(bridge.steps).toEqual([]);
    expect(bridge.unexplainedBps).toBe(0);
    expect(bridge.fromIrr).toBeCloseTo(bridge.toIrr!, 12);
    expect(bridgeSentence(bridge)).toContain("No single assumption moved it materially");
  });

  it("reports null IRR rather than the scan floor when a scenario doesn't price", () => {
    // A price so far above the income that no rate clears the stream.
    const broken = setPath(BASE, "purchasePrice", 400_000_000);
    expect(computeUnderwrite(broken).returns.leveredIrrPct).toBeNull();
    const bridge = buildBridge(BASE, broken);
    expect(bridge.toIrr).toBeNull();
    expect(bridge.flooredScenarios).toBeGreaterThan(0);
    expect(bridgeSentence(bridge)).toContain("has none now");
  });
});

describe("bridgeSentence", () => {
  it("reads as the clause-per-driver line that gets pasted into an email", () => {
    const target = withFields(BASE, { purchasePrice: 12_000_000, exitCapPct: 0.065 });
    const sentence = bridgeSentence(buildBridge(BASE, target));
    expect(sentence).toMatch(/^Levered IRR went from \d+\.\d% to \d+\.\d%\./);
    expect(sentence).toContain("Cutting purchase price by $1.70M");
    expect(sentence).toContain("Tightening exit cap from 8.00% to 6.50%");
    expect(sentence).toMatch(/added \d+ bps/);
  });

  it("rolls minor drivers into one trailing clause", () => {
    const target = withFields(BASE, {
      purchasePrice: 12_000_000,
      exitCapPct: 0.065,
      rentGrowthPct: 0.04,
      vacancyPct: 0.07,
      ltc: 0.65,
      allInRatePct: 0.055,
    });
    const sentence = bridgeSentence(buildBridge(BASE, target), 2);
    expect(sentence).toMatch(/\d other assumptions (added|cost) \d+ bps\./);
  });
});
