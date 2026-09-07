import { describe, expect, it } from "vitest";
import { WORKS_OPEX_SHARE, computeModel, planCaveats, planOf, type ModelInputs } from "./compute";

/** A plain stabilized garden-apartment deal — the classic model. */
const STABILIZED: ModelInputs = {
  units: 248,
  purchasePrice: 68_000_000,
  closingCostPct: 2,
  loanFeePct: 1,
  year1Gpr: 7_150_000,
  vacancyPct: 9,
  otherIncomeAnnual: 300_000,
  year1Opex: 3_100_000,
  capexReserveAnnual: 74_400,
  rentGrowthPct: 3,
  expenseGrowthPct: 3,
  otherIncomeGrowthPct: 3,
  exitCapPct: 5.5,
  sellingCostPct: 2,
  holdYears: 5,
  loan: { ltvPct: 60, ratePct: 6, amortYears: 30, ioYears: 1 },
};

/** The deal that started this: a $20M office building converted to 612
 *  apartments over two dark years, a $160M budget, one lease-up year, and
 *  the finished building's $21M NOI reached in year four. */
const CONVERSION: ModelInputs = {
  units: 612,
  purchasePrice: 20_000_000,
  closingCostPct: 2,
  loanFeePct: 0,
  year1Gpr: 33_000_000, // stabilized potential rent, today's dollars
  vacancyPct: 5,
  otherIncomeAnnual: 1_000_000,
  year1Opex: 11_350_000, // stabilized opex → NOI ≈ 33.0×0.95 + 1.0 − 11.35 = 21.0M
  capexReserveAnnual: 150_000,
  rentGrowthPct: 0,
  expenseGrowthPct: 0,
  otherIncomeGrowthPct: 0,
  exitCapPct: 5.5,
  sellingCostPct: 2,
  holdYears: 6,
  loan: { ltvPct: 0, ratePct: 6, amortYears: 30, ioYears: 0 },
  strategy: "conversion",
  capitalBudget: 160_000_000,
  constructionYears: 2,
  leaseUpYears: 1,
  inPlaceGprDuringWorks: 0,
  worksOpexAnnual: 1_200_000,
  leaseUpStartOccupancyPct: 0,
};

describe("computeModel — without a plan, the classic model", () => {
  const { cashFlow, returns } = computeModel(STABILIZED);

  it("is stabilized from day one: no capital spend, full occupancy, one phase", () => {
    expect(planOf(STABILIZED).active).toBe(false);
    for (const c of cashFlow) {
      expect(c.capitalSpend).toBe(0);
      expect(c.phase).toBe("stabilized");
      expect(c.occupancy).toBeCloseTo(0.91, 6);
    }
  });

  it("reports the going-in cap as NOI ÷ price and no plan yardsticks", () => {
    const y1 = cashFlow[0];
    expect(y1.noi).toBeCloseTo(7_150_000 * 0.91 + 300_000 - 3_100_000, 0);
    expect(returns.goingInCapPct).toBeCloseTo((y1.noi / 68_000_000) * 100, 6);
    expect(returns.capitalBudget).toBe(0);
    expect(returns.totalCost).toBeCloseTo(68_000_000 * 1.02, 0);
    expect(returns.stabilizedYear).toBeNull();
    expect(returns.stabilizedNoi).toBeNull();
    expect(returns.yieldOnCostPct).toBeNull();
    expect(planCaveats(STABILIZED)).toEqual([]);
  });

  it("treats null plan fields exactly like absent ones", () => {
    const withNulls: ModelInputs = {
      ...STABILIZED,
      capitalBudget: null,
      constructionYears: null,
      leaseUpYears: null,
      inPlaceGprDuringWorks: null,
      worksOpexAnnual: null,
      leaseUpStartOccupancyPct: null,
    };
    expect(computeModel(withNulls)).toEqual(computeModel(STABILIZED));
  });
});

describe("computeModel — a conversion climbs to its stabilized income", () => {
  const { cashFlow, returns } = computeModel(CONVERSION);

  it("is dark through the works: no rent, the carrying costs, the budget going out", () => {
    for (const y of [0, 1]) {
      expect(cashFlow[y].phase).toBe("works");
      expect(cashFlow[y].gpr).toBe(0);
      expect(cashFlow[y].occupancy).toBe(0);
      expect(cashFlow[y].noi).toBeCloseTo(-1_200_000, 0);
      expect(cashFlow[y].capitalSpend).toBeCloseTo(80_000_000, 0);
    }
  });

  it("leases up in year three, half-way to stabilized occupancy on a one-year straight line", () => {
    // One lease-up year: k/leaseUp = 1 at the end of it, so the year is
    // booked at the stabilized level — a straight line that ARRIVES.
    expect(cashFlow[2].phase).toBe("lease_up");
    expect(cashFlow[2].occupancy).toBeCloseTo(0.95, 6);
    expect(cashFlow[2].capitalSpend).toBe(0);
  });

  it("earns the finished building's NOI from year four — the $21M, where it belongs", () => {
    expect(cashFlow[3].phase).toBe("stabilized");
    expect(cashFlow[3].noi).toBeCloseTo(21_000_000, -3);
    expect(returns.stabilizedYear).toBe(4);
    expect(returns.stabilizedNoi).toBeCloseTo(21_000_000, -3);
  });

  it("never calls the $21M a going-in cap on the $20M price", () => {
    // Year 1 is dark: the going-in cap is NEGATIVE, which is the truth.
    expect(returns.year1Noi).toBeCloseTo(-1_200_000, 0);
    expect(returns.goingInCapPct).toBeLessThan(0);
    expect(returns.goingInCapPct).toBeGreaterThan(-10);
  });

  it("judges the plan on yield on total cost: stabilized NOI over price + closing + budget", () => {
    expect(returns.capitalBudget).toBe(160_000_000);
    expect(returns.totalCost).toBeCloseTo(20_000_000 * 1.02 + 160_000_000, 0);
    expect(returns.yieldOnCostPct).toBeCloseTo((21_000_000 / returns.totalCost) * 100, 1);
    expect(returns.yieldOnCostPct).toBeGreaterThan(11);
    expect(returns.yieldOnCostPct).toBeLessThan(12);
  });

  it("carries the spend in the cash flows, so the returns pay for the plan", () => {
    // Year-1 levered cash flow: −1.2M NOI − 0.15M reserve − 80M spend, no debt.
    expect(cashFlow[0].cashFlow).toBeCloseTo(-1_200_000 - 150_000 - 80_000_000, 0);
    // Unlevered: $20.4M in, then −81.35M, −81.35M, then income, then ~$382M exit.
    // A ~$180M all-in basis earning $21M and sold at a 5.5% cap is a strong
    // unlevered return — but a sane one, not 105%.
    expect(returns.unleveredIrrPct).not.toBeNull();
    expect(returns.unleveredIrrPct!).toBeGreaterThan(10);
    expect(returns.unleveredIrrPct!).toBeLessThan(40);
  });

  it("caps a short hold on the mid-ramp forward NOI, not the stabilized figure", () => {
    const short = computeModel({ ...CONVERSION, holdYears: 2 }); // sold going into the lease-up year
    expect(short.returns.exitNoi).toBeCloseTo(cashFlow[2].noi, 0);
    const shorter = computeModel({ ...CONVERSION, holdYears: 1 }); // sold going into year 2, still dark
    expect(shorter.returns.exitNoi).toBeCloseTo(-1_200_000, 0);
    expect(shorter.returns.exitValue).toBeLessThan(0);
  });
});

describe("computeModel — plan shapes", () => {
  it("spends a budget with no works years up front, in year 1, and still counts it in total cost", () => {
    const valueAdd: ModelInputs = { ...STABILIZED, strategy: "value_add", capitalBudget: 6_000_000 };
    const { cashFlow, returns } = computeModel(valueAdd);
    expect(cashFlow[0].capitalSpend).toBe(6_000_000);
    expect(cashFlow[1].capitalSpend).toBe(0);
    expect(returns.totalCost).toBeCloseTo(68_000_000 * 1.02 + 6_000_000, 0);
    // No ramp: the plan is judged on year-1 NOI over total cost.
    expect(returns.stabilizedYear).toBeNull();
    expect(returns.yieldOnCostPct).toBeCloseTo((cashFlow[0].noi / returns.totalCost) * 100, 6);
    // And the spend costs the equity real money vs the stabilized case.
    expect(returns.leveredIrrPct!).toBeLessThan(computeModel(STABILIZED).returns.leveredIrrPct!);
  });

  it("ramps a lease-up in a straight line from the stated starting occupancy", () => {
    const leaseUp: ModelInputs = {
      ...STABILIZED,
      strategy: "lease_up",
      leaseUpYears: 2,
      leaseUpStartOccupancyPct: 40,
    };
    const { cashFlow, returns } = computeModel(leaseUp);
    // 40% → 91% over two years: 65.5% after the first, 91% at the second.
    expect(cashFlow[0].phase).toBe("lease_up");
    expect(cashFlow[0].occupancy).toBeCloseTo(0.655, 6);
    expect(cashFlow[1].occupancy).toBeCloseTo(0.91, 6);
    expect(cashFlow[2].phase).toBe("stabilized");
    // Full stabilized opex from the first lease-up year — staffed before full.
    expect(cashFlow[0].opex).toBeCloseTo(3_100_000, 0);
    expect(returns.stabilizedYear).toBe(3);
    expect(cashFlow[0].noi).toBeLessThan(cashFlow[2].noi);
  });

  it("keeps in-place income and its share of other income through a partial-occupancy renovation", () => {
    const heavyValueAdd: ModelInputs = {
      ...STABILIZED,
      strategy: "value_add",
      capitalBudget: 12_000_000,
      constructionYears: 1,
      inPlaceGprDuringWorks: 3_575_000, // half the building stays occupied
      worksOpexAnnual: 2_000_000,
      leaseUpYears: 1,
      leaseUpStartOccupancyPct: 50,
    };
    const { cashFlow } = computeModel(heavyValueAdd);
    expect(cashFlow[0].phase).toBe("works");
    expect(cashFlow[0].gpr).toBeCloseTo(3_575_000, 0);
    expect(cashFlow[0].otherIncome).toBeCloseTo(300_000 * (0.5 / 0.91), 0);
    expect(cashFlow[0].opex).toBeCloseTo(2_000_000, 0);
    expect(cashFlow[0].capitalSpend).toBe(12_000_000);
    expect(cashFlow[1].phase).toBe("lease_up");
    expect(cashFlow[1].occupancy).toBeCloseTo(0.91, 6);
  });
});

describe("planOf / planCaveats — the defaults are labelled, never silent", () => {
  it("models a works year dark at a documented share of stabilized opex when nothing was stated", () => {
    const inp: ModelInputs = { ...STABILIZED, capitalBudget: 5_000_000, constructionYears: 1 };
    const p = planOf(inp);
    expect(p.worksGpr).toBe(0);
    expect(p.worksOpex).toBeCloseTo(WORKS_OPEX_SHARE * 3_100_000, 0);
    const caveats = planCaveats(inp);
    expect(caveats.some((c) => /modelled dark/.test(c))).toBe(true);
    expect(caveats.some((c) => /35% of stabilized opex/.test(c))).toBe(true);
    expect(caveats.some((c) => /\$5\.0M capital budget/.test(c))).toBe(true);
  });

  it("starts an unstated lease-up from empty and says so", () => {
    const p = planOf({ ...STABILIZED, leaseUpYears: 2 });
    expect(p.startOcc).toBe(0);
    expect(p.assumed.some((a) => /starts from empty/.test(a))).toBe(true);
  });

  it("ignores nonsense: negative or absurd years and budgets", () => {
    const p = planOf({ ...STABILIZED, constructionYears: -3, leaseUpYears: 400, capitalBudget: -1 });
    expect(p.works).toBe(0);
    expect(p.leaseUp).toBe(15);
    expect(p.budget).toBe(0);
  });
});
