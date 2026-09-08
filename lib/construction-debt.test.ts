import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRAW_PROFILE,
  mortgageConstant,
  sizeConstructionDebt,
  takeOutCapacity,
  worksYearsFromTimeline,
  type ConstructionDebtInputs,
} from "./construction-debt";

// The conversion: $20M shell, $160M of works, $21M stabilized NOI, three
// years to take-out. Construction money at 8% to 60% of cost; permanent
// take-out at 6.25% / 30-yr, 1.25x DSCR, 8% debt yield, 65% LTV at a 6% cap.
const BASE: ConstructionDebtInputs = {
  price: 20_000_000,
  budget: 160_000_000,
  stabilizedNoi: 21_000_000,
  worksYears: 3,
  ratePct: 8,
  maxLtcPct: 60,
  takeOut: { ratePct: 6.25, amortYears: 30, minDscr: 1.25, minDebtYieldPct: 8, maxLtvPct: 65, exitCapPct: 6 },
};

describe("sizeConstructionDebt — the loan is sized to cost, with the carry inside it", () => {
  const r = sizeConstructionDebt(BASE)!;

  it("solves the interest reserve in closed form so the loan is exactly LTC of total cost", () => {
    expect(r).not.toBeNull();
    expect(r.hardSoftCost).toBe(180_000_000);
    // L = ltc · (C + reserve) and reserve = L · r · t · p — both hold at once.
    expect(r.constructionLoan).toBeCloseTo(0.6 * r.totalCost, 6);
    expect(r.interestReserve).toBeCloseTo(r.constructionLoan * 0.08 * 3 * DEFAULT_DRAW_PROFILE, 6);
    expect(r.totalCost).toBeCloseTo(r.hardSoftCost + r.interestReserve, 6);
    // Sanity on the size of the carry: ~$15–16M on a ~$118M loan over three years.
    expect(r.interestReserve).toBeGreaterThan(14_000_000);
    expect(r.interestReserve).toBeLessThan(17_000_000);
  });

  it("reports equity as total cost less the construction loan, and yield on cost on the full cost", () => {
    expect(r.equity).toBeCloseTo(r.totalCost - r.constructionLoan, 6);
    expect(r.equityPctOfCost).toBeCloseTo(0.4, 6);
    expect(r.yieldOnCost).toBeCloseTo(21_000_000 / r.totalCost, 9);
    expect(r.yieldOnCost).toBeLessThan(21 / 180); // the carry dilutes the OM's 11.7%
    expect(r.stabilizedValue).toBeCloseTo(350_000_000, 6);
  });

  it("the take-out carries the construction loan here: no refinance gap, LTC binds", () => {
    // DSCR loan ≈ 21M / 1.25 / k(6.25%, 30y) ≈ $227M; debt yield 21/0.08 = $262.5M;
    // LTV 0.65 × 350M = $227.5M — all above the ~$118M construction loan.
    expect(r.takeOut.loan).toBeGreaterThan(r.constructionLoan);
    expect(r.refinanceGap).toBe(0);
    expect(r.binding).toBe("ltc");
    expect(r.maxLoan).toBeCloseTo(r.constructionLoan, 6);
  });

  it("names the cash-in refinance when the finished NOI cannot carry the construction loan", () => {
    // Half the NOI, a tighter take-out: the loan sized to cost exceeds what income can carry.
    const thin = sizeConstructionDebt({
      ...BASE,
      stabilizedNoi: 8_000_000,
      maxLtcPct: 70,
      takeOut: { ...BASE.takeOut, minDscr: 1.35, minDebtYieldPct: 9 },
    })!;
    expect(thin.takeOut.loan).toBeLessThan(thin.constructionLoan);
    expect(thin.refinanceGap).toBeCloseTo(thin.constructionLoan - thin.takeOut.loan, 6);
    expect(thin.refinanceGap).toBeGreaterThan(0);
    expect(thin.binding).toBe("take_out");
    expect(thin.maxLoan).toBeCloseTo(thin.takeOut.loan, 6);
  });

  it("a higher rate or a longer road means a bigger reserve, more cost and a lower yield", () => {
    const dearer = sizeConstructionDebt({ ...BASE, ratePct: 10 })!;
    const longer = sizeConstructionDebt({ ...BASE, worksYears: 4 })!;
    expect(dearer.interestReserve).toBeGreaterThan(r.interestReserve);
    expect(longer.interestReserve).toBeGreaterThan(r.interestReserve);
    expect(dearer.yieldOnCost).toBeLessThan(r.yieldOnCost);
    expect(longer.yieldOnCost).toBeLessThan(r.yieldOnCost);
  });

  it("is null on every blank or impossible input — never a guessed loan", () => {
    expect(sizeConstructionDebt({ ...BASE, budget: 0 })).toBeNull();
    expect(sizeConstructionDebt({ ...BASE, stabilizedNoi: 0 })).toBeNull();
    expect(sizeConstructionDebt({ ...BASE, price: Number.NaN })).toBeNull();
    expect(sizeConstructionDebt({ ...BASE, worksYears: 0 })).toBeNull();
    expect(sizeConstructionDebt({ ...BASE, maxLtcPct: 0 })).toBeNull();
    // A loan that would finance its own carry: ltc · r · t · p ≥ 1.
    expect(sizeConstructionDebt({ ...BASE, ratePct: 80, worksYears: 5, maxLtcPct: 90 })).toBeNull();
    // Zero rate is legal: no reserve, loan = LTC of hard and soft cost.
    const free = sizeConstructionDebt({ ...BASE, ratePct: 0 })!;
    expect(free.interestReserve).toBe(0);
    expect(free.constructionLoan).toBeCloseTo(0.6 * 180_000_000, 6);
  });
});

describe("takeOutCapacity", () => {
  it("takes the smallest of DSCR, debt yield and LTV, and names it", () => {
    const t = takeOutCapacity(21_000_000, BASE.takeOut)!;
    const k = mortgageConstant(6.25, 30);
    expect(t.dscrLoan).toBeCloseTo(21_000_000 / 1.25 / k, 6);
    expect(t.debtYieldLoan).toBeCloseTo(262_500_000, 6);
    expect(t.ltvLoan).toBeCloseTo(0.65 * 350_000_000, 6);
    expect(t.loan).toBe(Math.min(t.dscrLoan!, t.debtYieldLoan!, t.ltvLoan!));
    expect(["dscr", "debt_yield", "ltv"]).toContain(t.binding);
  });

  it("skips LTV without an exit cap, and is null without a usable NOI or constraint", () => {
    const noCap = takeOutCapacity(21_000_000, { ...BASE.takeOut, exitCapPct: null })!;
    expect(noCap.ltvLoan).toBeNull();
    expect(noCap.binding).not.toBe("ltv");
    expect(takeOutCapacity(0, BASE.takeOut)).toBeNull();
    expect(
      takeOutCapacity(21_000_000, { ratePct: 6, amortYears: 30, minDscr: 0, minDebtYieldPct: 0, exitCapPct: null }),
    ).toBeNull();
  });
});

describe("worksYearsFromTimeline — the OM's own words", () => {
  it("sums construction and lease-up months, reads a stated stabilization year, rounds to quarters", () => {
    expect(worksYearsFromTimeline("24 months of construction, 12 months of lease-up")).toBe(3);
    expect(worksYearsFromTimeline("30-month build, stabilized in year 4")).toBe(4);
    expect(worksYearsFromTimeline("18 months to complete")).toBe(1.5);
    expect(worksYearsFromTimeline("2 years of works then a one-year lease-up")).toBe(2);
    expect(worksYearsFromTimeline("stabilized by year 3")).toBe(3);
  });

  it("is null for no duration, blanks and nonsense — the caller supplies its own default", () => {
    expect(worksYearsFromTimeline("")).toBeNull();
    expect(worksYearsFromTimeline(null)).toBeNull();
    expect(worksYearsFromTimeline("to be determined")).toBeNull();
    expect(worksYearsFromTimeline("400 months")).toBeNull();
  });
});
