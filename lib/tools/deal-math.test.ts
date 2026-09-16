import { describe, expect, it } from "vitest";
import {
  breakEvenOccupancyPct,
  capRatePct,
  grossFromNet,
  loanConstant,
  netFromGross,
  noiFromCap,
  per,
  rentQuote,
  sizeLoan,
  valueFromCap,
  yieldOnCost,
} from "./deal-math";

describe("the cap rate triangle", () => {
  it("gives the third figure from any two", () => {
    expect(capRatePct(1_200_000, 20_000_000)).toBeCloseTo(6, 10);
    expect(valueFromCap(1_200_000, 6)).toBeCloseTo(20_000_000, 6);
    expect(noiFromCap(20_000_000, 6)).toBeCloseTo(1_200_000, 6);
  });

  it("round-trips without drift", () => {
    const cap = capRatePct(987_654, 14_321_000);
    expect(valueFromCap(987_654, cap)).toBeCloseTo(14_321_000, 4);
  });

  it("reads a negative NOI as a negative cap rather than hiding it", () => {
    // A building losing money has a cap rate. It is just not one anybody
    // quotes, and that is the caller's to say — not ours to swallow.
    expect(capRatePct(-200_000, 10_000_000)).toBeCloseTo(-2, 10);
    // But it cannot be capitalised into a value: a negative price is not an
    // answer, it is arithmetic running off the end of its meaning.
    expect(valueFromCap(-200_000, 6)).toBeNull();
  });

  it("treats a blank as absent, never as zero", () => {
    expect(capRatePct(null, 20_000_000)).toBeNull();
    expect(capRatePct(1_200_000, null)).toBeNull();
    expect(capRatePct(1_200_000, 0)).toBeNull();
    expect(valueFromCap(1_200_000, 0)).toBeNull();
    expect(noiFromCap(null, 6)).toBeNull();
    expect(per(20_000_000, 0)).toBeNull();
    expect(per(20_000_000, null)).toBeNull();
  });

  it("divides a price by whatever the deal is counted in", () => {
    expect(per(20_000_000, 120)).toBeCloseTo(166_666.67, 2);
    expect(per(20_000_000, 100_000)).toBe(200);
  });
});

describe("the mortgage constant", () => {
  it("is the rate itself when the loan is interest only", () => {
    expect(loanConstant(6.5, 30, true)).toBeCloseTo(0.065, 12);
    // Amortisation is irrelevant to an IO loan, so it need not be given.
    expect(loanConstant(6.5, null, true)).toBeCloseTo(0.065, 12);
  });

  it("amortises on the standard formula", () => {
    expect(loanConstant(6.5, 30, false)).toBeCloseTo(0.07585, 4);
    expect(loanConstant(6.5, 25, false)).toBeGreaterThan(loanConstant(6.5, 30, false)!);
  });

  it("degrades to principal only at a zero rate instead of dividing by zero", () => {
    expect(loanConstant(0, 30, false)).toBeCloseTo(12 / 360, 12);
    expect(Number.isFinite(loanConstant(0, 30, false)!)).toBe(true);
  });

  it("has no answer without the terms", () => {
    expect(loanConstant(null, 30, false)).toBeNull();
    expect(loanConstant(6.5, null, false)).toBeNull();
    expect(loanConstant(6.5, 0, false)).toBeNull();
    expect(loanConstant(-1, 30, false)).toBeNull();
  });
});

describe("sizing a loan", () => {
  const base = {
    price: 20_000_000,
    noi: 1_200_000,
    ratePct: 6.5,
    amortYears: 30,
    io: false,
    maxLtvPct: 65,
    minDscr: 1.25,
    minDebtYieldPct: 9,
  };

  it("names the test that governs, not just the number", () => {
    const s = sizeLoan(base);
    // LTV allows 13.00M, debt yield 13.33M, coverage 12.66M — coverage is
    // the one doing the work, and that is the sentence an analyst wants.
    expect(s.tests.map((t) => t.key)).toEqual(["ltv", "dscr", "debtYield"]);
    expect(s.tests.find((t) => t.binding)?.key).toBe("dscr");
    expect(s.loan).toBeCloseTo(12_656_866, -2);
  });

  it("lands exactly on the binding test's floor", () => {
    const s = sizeLoan(base);
    expect(s.dscr).toBeCloseTo(1.25, 8);
    // and comfortably clear of the tests that did not bind
    expect(s.debtYieldPct!).toBeGreaterThan(9);
    expect(s.ltvPct!).toBeLessThan(65);
  });

  it("switches the binding test when the floors move", () => {
    const loose = sizeLoan({ ...base, minDscr: 1.0 });
    expect(loose.tests.find((t) => t.binding)?.key).toBe("ltv");
    expect(loose.loan).toBeCloseTo(13_000_000, 6);
    expect(loose.ltvPct).toBeCloseTo(65, 8);

    const tightYield = sizeLoan({ ...base, minDebtYieldPct: 10 });
    expect(tightYield.tests.find((t) => t.binding)?.key).toBe("debtYield");
    expect(tightYield.loan).toBeCloseTo(12_000_000, 6);
    expect(tightYield.debtYieldPct).toBeCloseTo(10, 8);
  });

  it("drops a test nobody set instead of sizing it at zero", () => {
    // A deal with no stated LTV cap is not a deal capped at 0% LTV.
    const s = sizeLoan({ ...base, maxLtvPct: null });
    expect(s.tests.map((t) => t.key)).toEqual(["dscr", "debtYield"]);
    expect(s.loan).toBeCloseTo(12_656_866, -2);
  });

  it("has nothing to say when no test was set", () => {
    const s = sizeLoan({ ...base, maxLtvPct: null, minDscr: null, minDebtYieldPct: null });
    expect(s.tests).toEqual([]);
    expect(s.loan).toBeNull();
    expect(s.equity).toBeNull();
    // the constant still stands on its own — it only needs the terms
    expect(s.constant).toBeCloseTo(0.07585, 4);
  });

  it("refuses both coverage tests on a building with no income", () => {
    // Dividing by a negative NOI would size a NEGATIVE loan, and a negative
    // number is smaller than every real test — it would silently become the
    // binding constraint and report a loan nobody could draw.
    const s = sizeLoan({ ...base, noi: -50_000 });
    expect(s.tests.map((t) => t.key)).toEqual(["ltv"]);
    expect(s.loan).toBeCloseTo(13_000_000, 6);
  });

  it("sizes off coverage alone when there is no price yet", () => {
    const s = sizeLoan({ ...base, price: null });
    expect(s.tests.map((t) => t.key)).toEqual(["dscr", "debtYield"]);
    expect(s.equity).toBeNull();
    expect(s.ltvPct).toBeNull();
    expect(s.loan).toBeCloseTo(12_656_866, -2);
  });

  it("puts the equity and the annual debt service beside the loan", () => {
    const s = sizeLoan(base);
    expect(s.equity).toBeCloseTo(20_000_000 - s.loan!, 6);
    expect(s.annualDebtService).toBeCloseTo(s.loan! * s.constant!, 6);
    // coverage at 1.25x means NOI is 1.25 times the debt service
    expect(1_200_000 / s.annualDebtService!).toBeCloseTo(1.25, 8);
  });

  it("quotes each test in the unit that test is set in", () => {
    const s = sizeLoan(base);
    expect(s.tests.find((t) => t.key === "ltv")?.setAt).toBe("65%");
    expect(s.tests.find((t) => t.key === "dscr")?.setAt).toBe("1.25x");
    expect(s.tests.find((t) => t.key === "debtYield")?.setAt).toBe("9%");
  });
});

describe("break-even occupancy", () => {
  it("is the share of gross rent the building has to keep to pay its way", () => {
    expect(breakEvenOccupancyPct(2_000_000, 700_000, 900_000)).toBeCloseTo(80, 10);
  });

  it("says so when the building does not cover even when it is full", () => {
    // Over 100% is a real answer — clamping it would hide the only thing
    // worth knowing about the deal.
    expect(breakEvenOccupancyPct(2_000_000, 900_000, 1_400_000)).toBeCloseTo(115, 10);
  });

  it("needs gross potential rent to mean anything", () => {
    expect(breakEvenOccupancyPct(null, 700_000, 900_000)).toBeNull();
    expect(breakEvenOccupancyPct(0, 700_000, 900_000)).toBeNull();
    expect(breakEvenOccupancyPct(2_000_000, null, 900_000)).toBeNull();
  });
});

describe("yield on cost", () => {
  const stack = { land: 5_000_000, hardCost: 30_000_000, softCost: 6_000_000, contingencyPct: 5 };

  it("carries contingency against hard cost, which is the convention", () => {
    const y = yieldOnCost(stack, 2_975_000, 5.5);
    expect(y.contingency).toBeCloseTo(1_500_000, 6);
    expect(y.totalCost).toBeCloseTo(42_500_000, 6);
  });

  it("is the return on every dollar it takes to build", () => {
    const y = yieldOnCost(stack, 2_975_000, 5.5);
    expect(y.yieldOnCostPct).toBeCloseTo(7, 10);
  });

  it("draws the spread over the exit cap in basis points", () => {
    expect(yieldOnCost(stack, 2_975_000, 5.5).spreadBps).toBe(150);
    // Build at a 7 and sell at a 7 and there is no reason to take the risk.
    expect(yieldOnCost(stack, 2_975_000, 7).spreadBps).toBe(0);
    // A negative spread is the answer, and it is the important one.
    expect(yieldOnCost(stack, 2_975_000, 7.5).spreadBps).toBe(-50);
  });

  it("adds up the parts that were entered and refuses to invent the rest", () => {
    const partial = yieldOnCost(
      { land: 5_000_000, hardCost: null, softCost: null, contingencyPct: 5 },
      null,
      null,
    );
    // No hard cost means no contingency — 5% of nothing is not $0 of a
    // number nobody gave.
    expect(partial.contingency).toBeNull();
    expect(partial.totalCost).toBeCloseTo(5_000_000, 6);
    expect(partial.yieldOnCostPct).toBeNull();
    expect(partial.spreadBps).toBeNull();
  });

  it("has no total at all when nothing was entered", () => {
    const empty = yieldOnCost(
      { land: null, hardCost: null, softCost: null, contingencyPct: null },
      2_975_000,
      5.5,
    );
    expect(empty.totalCost).toBeNull();
    expect(empty.yieldOnCostPct).toBeNull();
  });
});

describe("one rent, said four ways", () => {
  it("carries a per-foot annual rent into the other three", () => {
    const q = rentQuote({ perSfYear: 36, sf: 100_000, units: 120 });
    expect(q.perSfMonth).toBeCloseTo(3, 10);
    expect(q.annualTotal).toBeCloseTo(3_600_000, 6);
    expect(q.perUnitMonth).toBeCloseTo(2_500, 6);
  });

  it("comes back the other way through the average unit", () => {
    const q = rentQuote({ perUnitMonth: 2_500, units: 120, sf: 100_000 });
    expect(q.perSfYear).toBeCloseTo(36, 10);
    expect(q.perSfMonth).toBeCloseTo(3, 10);
    expect(q.annualTotal).toBeCloseTo(3_600_000, 6);
  });

  it("reads an industrial quote given per foot per month", () => {
    const q = rentQuote({ perSfMonth: 1.15, sf: 250_000 });
    expect(q.perSfYear).toBeCloseTo(13.8, 10);
    expect(q.annualTotal).toBeCloseTo(3_450_000, 6);
    // No unit count, so no per-unit rent — not a per-unit rent of zero.
    expect(q.perUnitMonth).toBeNull();
  });

  it("still totals a per-unit rent when no area was given", () => {
    const q = rentQuote({ perUnitMonth: 2_500, units: 120 });
    expect(q.perSfYear).toBeNull();
    expect(q.perUnitMonth).toBeCloseTo(2_500, 6);
    expect(q.annualTotal).toBeCloseTo(3_600_000, 6);
  });

  it("returns nothing rather than zero when nothing was entered", () => {
    const q = rentQuote({});
    expect(q.perSfYear).toBeNull();
    expect(q.perSfMonth).toBeNull();
    expect(q.perUnitMonth).toBeNull();
    expect(q.annualTotal).toBeNull();
  });
});

describe("gross and net", () => {
  it("puts a triple-net rent and a gross rent on the same side of the expenses", () => {
    expect(grossFromNet(28, 12.5)).toBeCloseTo(40.5, 10);
    expect(netFromGross(40.5, 12.5)).toBeCloseTo(28, 10);
  });

  it("needs the expense load before it will answer", () => {
    expect(grossFromNet(28, null)).toBeNull();
    expect(netFromGross(null, 12.5)).toBeNull();
  });
});
