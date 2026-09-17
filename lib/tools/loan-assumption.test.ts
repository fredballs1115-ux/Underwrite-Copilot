import { describe, expect, it } from "vitest";
import { readAssumption, type AssumptionTerms } from "./loan-assumption";

/**
 * A $20M multifamily building carrying a 2021 loan: $9.6M left at 3.50%,
 * five years to the balloon, against a 6.50% market. The case the whole
 * 2026 market is made of.
 */
const SEED: AssumptionTerms = {
  price: 20_000_000,
  noi: 1_100_000,
  noiGrowthPct: 3,
  exitCapPct: 5.75,
  holdYears: 5,
  closingCostPct: 1.5,
  assumedBalance: 9_600_000,
  assumedRatePct: 3.5,
  assumedAmortYears: 25,
  assumedRemainingYears: 5,
  assumptionFeePct: 1,
  marketRatePct: 6.5,
  newLoanLtvPct: 60,
  newLoanAmortYears: 30,
  newLoanFeePct: 1,
};

describe("readAssumption — rule 1, the two halves pull opposite ways", () => {
  it("assuming is the LARGER cheque, not the smaller", () => {
    const r = readAssumption(SEED);
    expect(r.assume!.loan).toBe(9_600_000);
    expect(r.newLoan!.loan).toBe(12_000_000);
    expect(r.assume!.equity).toBe(10_796_000);
    expect(r.newLoan!.equity).toBe(8_420_000);
    expect(r.extraEquity).toBe(2_376_000);
    // Which is the whole point: the "cheap" loan costs $2.4M more up front.
    expect(r.extraEquity).toBeGreaterThan(0);
  });

  it("and the cheaper one, by $333,460 a year", () => {
    const r = readAssumption(SEED);
    expect(r.assume!.debtService).toBe(576_718);
    expect(r.newLoan!.debtService).toBe(910_178);
    expect(r.annualDebtServiceSaved).toBe(333_460);
  });

  it("neither half answers it — the two complete positions do", () => {
    const r = readAssumption(SEED);
    expect(r.assume!.irrPct).toBe(10.1);
    expect(r.newLoan!.irrPct).toBe(8.1);
    expect(r.irrGapPts).toBe(2);
  });

  it("a wonderful rate on a small balance is worth almost nothing", () => {
    // $4M at 3.00% saves MORE debt service than the seed's $9.6M at 3.50%
    // and is worth a tenth as much, because the equity swamps it.
    const r = readAssumption({ ...SEED, assumedBalance: 4_000_000, assumedRatePct: 3 });
    expect(r.annualDebtServiceSaved).toBeGreaterThan(
      readAssumption(SEED).annualDebtServiceSaved!,
    );
    expect(r.extraEquity).toBe(7_920_000);
    expect(r.pricePremium).toBeLessThan(100_000);
    expect(r.pricePremiumPctOfPrice).toBeLessThan(1);
  });

  it("a loan at today's rate is worth LESS than a new one, not the same", () => {
    // Same coupon, but a smaller balance over a shorter amortisation — so
    // less leverage on a deal where leverage is accretive.
    const r = readAssumption({ ...SEED, assumedRatePct: 6.5 });
    expect(r.irrGapPts).toBeLessThan(0);
    expect(r.pricePremium).toBeNull();
    // And the sentence never credits the coupon for a saving that is the
    // balance's — the error this card exists to correct.
    expect(r.note).not.toContain("the coupon saves");
    expect(r.note).toContain("debt service is");
    expect(r.note).toContain("the cheque is");
  });
});

describe("readAssumption — the premium, solved", () => {
  it("prices the loan at $934,223 of price", () => {
    const r = readAssumption(SEED);
    expect(r.pricePremium).toBe(934_223);
    expect(r.pricePremiumPctOfPrice).toBe(4.7);
    expect(r.note).toContain("A seller who does not ask for that hands it over");
  });

  it("and the answer round-trips: pay it and the two paths meet", () => {
    const base = readAssumption(SEED);
    const at = readAssumption({ ...SEED, price: SEED.price! + base.pricePremium! });
    // Assuming at the premium price returns what a NEW loan returned at the
    // asking price — which is the definition the bisection solves for.
    expect(at.assume!.irrPct).toBe(base.newLoan!.irrPct);
  });

  it("refuses to report a premium it could not bracket", () => {
    // A loan whose rate is at market has nothing to pay up for.
    expect(readAssumption({ ...SEED, assumedRatePct: 6.5 }).pricePremium).toBeNull();
  });
});

describe("readAssumption — rule 2, you are buying the overlap", () => {
  it("a term past the hold adds nothing at all", () => {
    const five = readAssumption({ ...SEED, assumedRemainingYears: 5 });
    const seven = readAssumption({ ...SEED, assumedRemainingYears: 7 });
    const ten = readAssumption({ ...SEED, assumedRemainingYears: 10 });
    expect(seven.pricePremium).toBe(five.pricePremium);
    expect(ten.pricePremium).toBe(five.pricePremium);
    expect(seven.yearsThatCount).toBe(5);
    expect(seven.termExceedsHold).toBe(true);
    expect(five.termExceedsHold).toBe(false);
    expect(ten.note).toContain("Only 5 of its remaining years are being bought");
  });

  it("and a term shorter than the hold is worth roughly its overlap", () => {
    const by = [1, 2, 3, 5].map(
      (assumedRemainingYears) =>
        readAssumption({ ...SEED, assumedRemainingYears }).pricePremium!,
    );
    expect(by).toEqual([130_918, 363_766, 573_992, 934_223]);
    for (let i = 1; i < by.length; i += 1) expect(by[i]).toBeGreaterThan(by[i - 1]);
  });

  it("a loan that balloons inside the hold is refinanced at the market rate", () => {
    const r = readAssumption({ ...SEED, assumedRemainingYears: 2 });
    expect(r.assume!.refinanced).toBe(true);
    expect(r.newLoan!.refinanced).toBe(false);
    expect(r.yearsThatCount).toBe(2);
  });

  it("a term exactly the hold never counts as refinanced", () => {
    expect(readAssumption(SEED).assume!.refinanced).toBe(false);
  });
});

describe("readAssumption — rule 3, the fee is a use at closing", () => {
  it("goes into the cheque, never out of the loan", () => {
    const r = readAssumption(SEED);
    expect(r.assumptionFee).toBe(96_000);
    // The loan is the balance, untouched by the fee.
    expect(r.assume!.loan).toBe(9_600_000);
    // And the cheque is price + closing + fee − loan, to the dollar.
    expect(r.assume!.equity).toBe(20_000_000 + 300_000 + 96_000 - 9_600_000);
  });

  it("a larger fee costs equity and nothing else", () => {
    const r = readAssumption({ ...SEED, assumptionFeePct: 3 });
    expect(r.assumptionFee).toBe(288_000);
    expect(r.assume!.loan).toBe(9_600_000);
    expect(r.assume!.equity).toBe(10_796_000 + 192_000);
    expect(r.assume!.irrPct).toBeLessThan(readAssumption(SEED).assume!.irrPct!);
  });

  it("no fee stated is no fee, not a default one", () => {
    const r = readAssumption({ ...SEED, assumptionFeePct: null });
    expect(r.assumptionFee).toBe(0);
    expect(r.assume!.equity).toBe(10_700_000);
  });
});

describe("readAssumption — rule 4, it buys coverage too", () => {
  it("1.91x against 1.21x, which no IRR shows", () => {
    const r = readAssumption(SEED);
    expect(r.assume!.dscr).toBe(1.91);
    expect(r.newLoan!.dscr).toBe(1.21);
    expect(r.dscrGap).toBe(0.7);
  });

  it("the coverage gap survives a coupon that kills the IRR gap", () => {
    // Even at today's rate the assumed loan is smaller, so it covers better
    // — the reason a marginal deal can be financeable one way only.
    const r = readAssumption({ ...SEED, assumedRatePct: 6.5 });
    expect(r.irrGapPts).toBeLessThan(0);
    expect(r.dscrGap).toBeGreaterThan(0);
  });
});

describe("readAssumption — refusals", () => {
  it("names the missing price", () => {
    expect(readAssumption({ ...SEED, price: null }).note).toContain("asking price");
  });

  it("names the missing NOI", () => {
    expect(readAssumption({ ...SEED, noi: null }).note).toContain("year-one NOI");
  });

  it("names the missing balance", () => {
    expect(readAssumption({ ...SEED, assumedBalance: null }).note).toContain(
      "outstanding balance",
    );
  });

  it("names the missing market rate", () => {
    expect(readAssumption({ ...SEED, marketRatePct: null }).note).toContain(
      "today's lending rate",
    );
  });

  it("refuses a hold under a year rather than reporting a schedule that never ran", () => {
    expect(readAssumption({ ...SEED, holdYears: 0 }).note).toContain("at least a year");
    expect(readAssumption({ ...SEED, holdYears: 0 }).assume).toBeNull();
  });

  it("names what is missing downstream rather than guessing at it", () => {
    expect(readAssumption({ ...SEED, exitCapPct: null }).note).toContain("exit cap");
    expect(readAssumption({ ...SEED, assumedRemainingYears: null }).note).toContain(
      "remaining term",
    );
  });

  it("a blank is null, never zero", () => {
    const r = readAssumption({ ...SEED, price: null });
    expect(r.assume).toBeNull();
    expect(r.newLoan).toBeNull();
    expect(r.extraEquity).toBeNull();
    expect(r.pricePremium).toBeNull();
  });
});
