import { describe, it, expect } from "vitest";
import { computeUnderwrite, type UnderwriteInputs } from "./engine";
import {
  leverValues,
  sliderValues,
  runScenario,
  scenarioMetrics,
  fmtBpsDelta,
  fmtPtDelta,
  LEVER_STEPS,
} from "./playground";
import { scoreMandateFit } from "../mandate";

/** A realistic levered base case (60% LTC, 6% cap, growth, vacancy). */
function baseInputs(over: Partial<UnderwriteInputs> = {}): UnderwriteInputs {
  return {
    purchasePrice: 10_000_000,
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
    inPlaceRentAnnual: 1_100_000,
    expenseRecoveriesAnnual: 0,
    otherRevenueAnnual: 0,
    vacancyPct: 0.05,
    rentGrowthPct: 0.03,
    expenseLines: [{ label: "Operating expenses", annual: 420_000 }],
    mgmtFeePct: 0,
    expenseGrowthPct: 0.03,
    rsf: 100_000,
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
    ...over,
  };
}

describe("runScenario — the drag IS a model re-run", () => {
  const base = baseInputs();

  it("dragging exit cap +50bps matches an independent engine run exactly", () => {
    const dragged = runScenario(base, { exitCapPct: 0.065 });
    const independent = computeUnderwrite(baseInputs({ exitCapPct: 0.065 }));
    expect(dragged.leveredIrrPct).toBe(independent.returns.leveredIrrPct);
    expect(dragged.leveredEquityMultiple).toBe(
      independent.returns.leveredEquityMultiple,
    );
  });

  it("exit cap up → IRR and EM down; year-1 CoC and DSCR untouched", () => {
    const b = scenarioMetrics(base);
    const s = runScenario(base, { exitCapPct: 0.065 });
    expect(s.leveredIrrPct!).toBeLessThan(b.leveredIrrPct!);
    expect(s.leveredEquityMultiple!).toBeLessThan(b.leveredEquityMultiple!);
    // Exit assumptions can't change year-1 operations.
    expect(s.cocYr1Pct).toBe(b.cocYr1Pct);
    expect(s.dscrYr1).toBe(b.dscrYr1);
  });

  it("vacancy up → year-1 CoC, DSCR, and IRR all down", () => {
    const b = scenarioMetrics(base);
    const s = runScenario(base, { vacancyPct: 0.07 });
    expect(s.cocYr1Pct!).toBeLessThan(b.cocYr1Pct!);
    expect(s.dscrYr1!).toBeLessThan(b.dscrYr1!);
    expect(s.leveredIrrPct!).toBeLessThan(b.leveredIrrPct!);
  });

  it("rent growth down → IRR down, year-1 CoC unchanged (growth starts year 2)", () => {
    const b = scenarioMetrics(base);
    const s = runScenario(base, { rentGrowthPct: 0.02 });
    expect(s.leveredIrrPct!).toBeLessThan(b.leveredIrrPct!);
    expect(s.cocYr1Pct).toBe(b.cocYr1Pct);
  });

  it("all three levers compose", () => {
    const s = runScenario(base, {
      exitCapPct: 0.065,
      rentGrowthPct: 0.02,
      vacancyPct: 0.07,
    });
    const independent = computeUnderwrite(
      baseInputs({ exitCapPct: 0.065, rentGrowthPct: 0.02, vacancyPct: 0.07 }),
    );
    expect(s.leveredIrrPct).toBe(independent.returns.leveredIrrPct);
  });

  it("never mutates the base inputs", () => {
    const snapshot = JSON.stringify(base);
    runScenario(base, { exitCapPct: 0.065, vacancyPct: 0.07 });
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("is deterministic", () => {
    const a = runScenario(base, { exitCapPct: 0.0575, rentGrowthPct: 0.025 });
    const b = runScenario(base, { exitCapPct: 0.0575, rentGrowthPct: 0.025 });
    expect(a).toEqual(b);
  });

  it("recomputes the full 5×5×5 lever space fast (sub-100ms per drag budget)", () => {
    const caps = leverValues("exitCapPct", base.exitCapPct);
    const growths = leverValues("rentGrowthPct", base.rentGrowthPct);
    const vacs = leverValues("vacancyPct", base.vacancyPct);
    const t0 = performance.now();
    for (const c of caps)
      for (const g of growths)
        for (const v of vacs)
          runScenario(base, { exitCapPct: c, rentGrowthPct: g, vacancyPct: v });
    const elapsed = performance.now() - t0;
    // 125 full model runs; a single drag is one run. Generous CI bound.
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("leverValues — slider stops", () => {
  it("centers on the exact base with ±2 steps", () => {
    const v = leverValues("exitCapPct", 0.045);
    expect(v).toHaveLength(5);
    expect(v[2]).toBe(0.045);
    expect(v[0]).toBeCloseTo(0.04, 10);
    expect(v[4]).toBeCloseTo(0.05, 10);
  });
  it("clamps at the physical floor without moving the base stop", () => {
    const v = leverValues("vacancyPct", 0.01);
    expect(v[0]).toBe(0); // 0.01 − 0.02 clamped to 0
    expect(v[2]).toBe(0.01);
    expect(v[4]).toBeCloseTo(0.03, 10);
  });
  it("exit cap can never reach zero", () => {
    const v = leverValues("exitCapPct", LEVER_STEPS.exitCapPct.min);
    expect(Math.min(...v)).toBeGreaterThan(0);
  });
  it("an out-of-range base is clamped first — stops stay monotonic", () => {
    // A garbled 0% cap must not produce stops where dragging left RAISES it.
    const zero = leverValues("exitCapPct", 0);
    for (let i = 1; i < zero.length; i++) expect(zero[i]).toBeGreaterThanOrEqual(zero[i - 1]);
    expect(Math.min(...zero)).toBeGreaterThan(0);
    // …and a 35% "cap" clamps to the ceiling.
    const high = leverValues("exitCapPct", 0.35);
    expect(high[2]).toBe(LEVER_STEPS.exitCapPct.max);
    for (let i = 1; i < high.length; i++) expect(high[i]).toBeGreaterThanOrEqual(high[i - 1]);
  });
});

describe("sliderValues — the Bug-9 wide slider range", () => {
  it("exit cap sweeps ±400bps in 25bps steps around a mid-range base", () => {
    const { values, baseIdx } = sliderValues("exitCapPct", 0.06);
    expect(values).toHaveLength(33); // ±16 steps + base
    expect(values[baseIdx]).toBe(0.06);
    expect(values[0]).toBeCloseTo(0.02, 10); // −400bps
    expect(values[values.length - 1]).toBeCloseTo(0.1, 10); // +400bps
    // Strictly increasing — no dead zones on the slider.
    for (let i = 1; i < values.length; i++)
      expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it("rent growth ±150bps, vacancy ±3pt (the spec's example ranges)", () => {
    const g = sliderValues("rentGrowthPct", 0.025);
    expect(g.values[0]).toBeCloseTo(0.01, 10);
    expect(g.values[g.values.length - 1]).toBeCloseTo(0.04, 10);
    const v = sliderValues("vacancyPct", 0.05);
    expect(v.values[0]).toBeCloseTo(0.02, 10);
    expect(v.values[v.values.length - 1]).toBeCloseTo(0.08, 10);
  });

  it("collapses clamped duplicates at a bound and keeps baseIdx honest", () => {
    // Base at the vacancy floor: all 3 down-steps clamp onto the base.
    const { values, baseIdx } = sliderValues("vacancyPct", 0);
    expect(baseIdx).toBe(0);
    expect(values[0]).toBe(0);
    expect(values).toHaveLength(4); // base + 3 up-steps, duplicates dropped
    for (let i = 1; i < values.length; i++)
      expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it("a garbled out-of-range base clamps first (monotonic, never ≤0 cap)", () => {
    const { values, baseIdx } = sliderValues("exitCapPct", 0);
    expect(values[baseIdx]).toBe(LEVER_STEPS.exitCapPct.min);
    expect(baseIdx).toBe(0);
    expect(Math.min(...values)).toBeGreaterThan(0);
  });

  it("±400bps of exit cap actually flips the mandate verdict (Bug 9)", () => {
    // A deal that clears a 12% IRR floor at its 6% base exit cap…
    const base = baseInputs();
    const box = { minIrrPct: 12 };
    const verdictAt = (capPct: number) => {
      const m = runScenario(base, { exitCapPct: capPct });
      return scoreMandateFit(
        "multifamily",
        {
          assetClass: "multifamily",
          metrics: [
            { label: "IRR", value: `${((m.leveredIrrPct ?? 0) * 100).toFixed(1)}%` },
          ],
        },
        box,
      ).verdict;
    };
    const { values, baseIdx } = sliderValues("exitCapPct", base.exitCapPct);
    expect(verdictAt(values[baseIdx])).toBe("PURSUE");
    // …and reads PASS at the +400bps end of the slider — the verdict swings
    // across its whole range as the slider moves.
    expect(verdictAt(values[values.length - 1])).toBe("PASS");
    // The swing is dramatic, not marginal: ≥8pt of IRR across the range.
    const irrAt = (capPct: number) =>
      runScenario(base, { exitCapPct: capPct }).leveredIrrPct!;
    expect(
      irrAt(values[baseIdx]) - irrAt(values[values.length - 1]),
    ).toBeGreaterThan(0.08);
  });
});

describe("delta formatting", () => {
  it("bps deltas", () => {
    expect(fmtBpsDelta(0.0475, 0.045)).toBe("+25bps");
    expect(fmtBpsDelta(0.04, 0.045)).toBe("−50bps");
    expect(fmtBpsDelta(0.045, 0.045)).toBe("base");
  });
  it("vacancy point deltas", () => {
    expect(fmtPtDelta(0.07, 0.05)).toBe("+2.0pt");
    expect(fmtPtDelta(0.04, 0.05)).toBe("−1.0pt");
    expect(fmtPtDelta(0.05, 0.05)).toBe("base");
  });
});
