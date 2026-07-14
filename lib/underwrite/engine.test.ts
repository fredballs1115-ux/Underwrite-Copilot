import { describe, it, expect } from "vitest";
import {
  computeUnderwrite,
  computeSourcesUses,
  annualDebtService,
  loanBalanceAtExit,
  monthlyPayment,
  irr,
  type UnderwriteInputs,
} from "./engine";
import { buildSensitivityGrids } from "./sensitivity";

/**
 * Known-answer fixtures. The base fixture is deliberately a par bond: a flat
 * 6% NOI yield sold at a 6% exit cap with no growth and no debt must return
 * exactly 6% IRR and a 1.3x multiple over a 5-year hold — a number verifiable
 * by hand, so a regression in the engine can't hide behind "looks plausible".
 */
function baseInputs(over: Partial<UnderwriteInputs> = {}): UnderwriteInputs {
  return {
    purchasePrice: 10_000_000,
    holdMonths: 60,
    acqFeePct: 0,
    acqFeeCap: 0,
    transferTaxPct: 0,
    recordationTaxPct: 0,
    generalHoldPct: 0,
    buyerLegal: 0,
    lenderLegal: 0,
    thirdPartyReports: 0,
    miscClosing: 0,
    inPlaceRentAnnual: 1_000_000,
    expenseRecoveriesAnnual: 0,
    otherRevenueAnnual: 0,
    vacancyPct: 0,
    rentGrowthPct: 0,
    expenseLines: [{ label: "Operating expenses", annual: 400_000 }],
    mgmtFeePct: 0,
    expenseGrowthPct: 0,
    rsf: 100_000,
    reservesPsf: 0,
    capitalImprovementsYr1: 0,
    tiPsf: 0,
    lcPct: 0,
    amFeePctEquity: 0,
    ltc: 0,
    allInRatePct: 0.06,
    ioMonths: 999,
    amortMonths: 360,
    financingCostPct: 0,
    exitCapPct: 0.06,
    saleCostPct: 0,
    ...over,
  };
}

describe("irr (bisection)", () => {
  it("prices a par 6% bond at 6%", () => {
    expect(irr([-100, 6, 6, 6, 6, 106])!).toBeCloseTo(0.06, 5);
  });
  it("returns null when there is no sign change", () => {
    expect(irr([100, 6, 6])).toBeNull();
  });
  it("returns null for a degenerate all-zero vector (not the scan floor)", () => {
    expect(irr([0, 0, 0, 0])).toBeNull();
  });
});

describe("capex / TI / LC are operating, not capitalized (no double-count)", () => {
  it("a capital-improvements budget does not change the loan or equity", () => {
    const withCapex = computeUnderwrite(baseInputs({ ltc: 0.6, capitalImprovementsYr1: 1_000_000 }));
    const noCapex = computeUnderwrite(baseInputs({ ltc: 0.6 }));
    expect(withCapex.sourcesUses.loanAmount).toBeCloseTo(noCapex.sourcesUses.loanAmount, 3);
    expect(withCapex.sourcesUses.equity).toBeCloseTo(noCapex.sourcesUses.equity, 3);
  });
  it("it is counted exactly once — as a year-1 operating outflow", () => {
    const withCapex = computeUnderwrite(baseInputs({ ltc: 0.6, capitalImprovementsYr1: 1_000_000 }));
    const noCapex = computeUnderwrite(baseInputs({ ltc: 0.6 }));
    const delta =
      noCapex.cashFlow[0].leveredCashFlow - withCapex.cashFlow[0].leveredCashFlow;
    expect(delta).toBeCloseTo(1_000_000, 3);
  });
});

describe("base fixture — par bond, no debt", () => {
  const r = computeUnderwrite(baseInputs());
  it("year-1 NOI is 600k", () => expect(r.cashFlow[0].noi).toBeCloseTo(600_000, 3));
  it("going-in cap is 6.0%", () => expect(r.returns.goingInCapPct).toBeCloseTo(0.06, 6));
  it("levered IRR is exactly 6%", () =>
    expect(r.returns.leveredIrrPct!).toBeCloseTo(0.06, 4));
  it("unlevered IRR equals levered with no debt", () =>
    expect(r.returns.unleveredIrrPct!).toBeCloseTo(r.returns.leveredIrrPct!, 6));
  it("equity multiple is 1.3x", () =>
    expect(r.returns.leveredEquityMultiple!).toBeCloseTo(1.3, 4));
  it("Sources = Uses", () => expect(r.sourcesUses.balanced).toBe(true));
  it("hold resolves to 5 years", () => expect(r.holdYears).toBe(5));
});

describe("IO = 999 (full-term interest-only)", () => {
  const inp = baseInputs({ ltc: 0.6 });
  const r = computeUnderwrite(inp);
  const loan = r.sourcesUses.loanAmount;
  it("loan is 60% of a 10M cost basis", () => expect(loan).toBeCloseTo(6_000_000, 3));
  it("debt service is interest-only every year", () => {
    for (let y = 1; y <= r.holdYears; y++) {
      expect(annualDebtService(loan, inp, y)).toBeCloseTo(6_000_000 * 0.06, 3);
    }
  });
  it("no principal amortizes — exit balance equals the loan", () =>
    expect(loanBalanceAtExit(loan, inp)).toBeCloseTo(6_000_000, 3));
  it("DSCR and debt yield are the hand values", () => {
    expect(r.cashFlow[0].dscrNoi!).toBeCloseTo(600_000 / 360_000, 4);
    expect(r.cashFlow[0].debtYield!).toBeCloseTo(0.1, 6);
  });
  it("levered IRR still 6% (rate = cap, no leverage benefit)", () =>
    expect(r.returns.leveredIrrPct!).toBeCloseTo(0.06, 3));
});

describe("amortizing debt contrasts with full IO", () => {
  it("a fully-amortizing loan pays down principal by exit", () => {
    const inp = baseInputs({ ltc: 0.6, ioMonths: 0 });
    const loan = computeUnderwrite(inp).sourcesUses.loanAmount;
    const bal = loanBalanceAtExit(loan, inp);
    expect(bal).toBeLessThan(loan); // principal came down
    expect(annualDebtService(loan, inp, 1)).toBeGreaterThan(loan * 0.06); // P&I > interest
  });
  it("monthlyPayment matches a textbook amortization", () => {
    // $1,000,000 at 6%/yr over 360 months ≈ $5,995.51/mo
    expect(monthlyPayment(1_000_000, 0.06, 360)).toBeCloseTo(5995.51, 1);
  });
});

describe("acceptance: exit cap drives IRR", () => {
  it("a 25bp higher exit cap lowers levered IRR", () => {
    const base = computeUnderwrite(baseInputs({ ltc: 0.6 })).returns.leveredIrrPct!;
    const higher = computeUnderwrite(baseInputs({ ltc: 0.6, exitCapPct: 0.0625 }))
      .returns.leveredIrrPct!;
    expect(higher).toBeLessThan(base);
  });
});

describe("Sources = Uses holds with real costs", () => {
  it("balances with closing costs, an acq fee (min-of-cap), and financing", () => {
    const su = computeSourcesUses(
      baseInputs({
        ltc: 0.6,
        transferTaxPct: 0.01,
        buyerLegal: 50_000,
        thirdPartyReports: 30_000,
        acqFeePct: 0.01,
        acqFeeCap: 75_000, // 1% of 10M = 100k, capped at 75k
        financingCostPct: 0.01,
      }),
    );
    expect(su.acqFee).toBe(75_000); // MIN(100k, 75k)
    expect(su.balanced).toBe(true);
    expect(Math.round(su.totalSources)).toBe(Math.round(su.totalUses));
  });
});

describe("acceptance: sensitivity center cell equals the base case", () => {
  const inp = baseInputs({ ltc: 0.6 });
  const base = computeUnderwrite(inp).returns;
  const grids = buildSensitivityGrids(inp);
  it("all three grids center on the base IRR/EM", () => {
    for (const g of grids) {
      const c = g.cells[g.rowAxis.baseIndex][g.colAxis.baseIndex];
      expect(c.irrPct!).toBeCloseTo(base.leveredIrrPct!, 6);
      expect(c.emx!).toBeCloseTo(base.leveredEquityMultiple!, 6);
    }
  });
});
