import { describe, it, expect } from "vitest";
import { irr } from "@/lib/underwrite/engine";
import { readBid, type BidInput } from "@/lib/tools/max-bid";

/**
 * A stabilized building throwing off $1.65M next year, held five years at
 * 3% growth, sold at a 6.00% cap — against ordinary agency-ish debt and an
 * equity that wants 15%.
 *
 * The answer is a PRICE, which is the only thing on `/tools` that is.
 */
const SEED: BidInput = {
  year1Noi: 1_650_000,
  noiGrowthPct: 3,
  holdYears: 5,
  exitCapPct: 6,
  sellingCostPct: 1.5,
  targetLeveredIrrPct: 15,
  maxLtvPct: 65,
  minDscr: 1.25,
  minDebtYieldPct: 9,
  ratePct: 6.5,
  amortYears: 30,
  ioYears: 0,
  loanFeePct: 1,
  closingCostPct: 1.5,
};

const run = (over: Partial<BidInput> = {}) => readBid({ ...SEED, ...over });

describe("the solve", () => {
  it("answers with a price and the cap it implies", () => {
    const r = run();
    expect(r.maxPrice).toBe(25_542_335);
    expect(r.capAtMaxPricePct).toBe(6.46);
  });

  it("is a real solve — the stream rebuilt at that price returns the target", () => {
    // The check the module exists to make checkable, through `irr` from
    // lib/underwrite/engine, the one behind the Excel export.
    const r = run();
    expect(r.checkIrrPct).toBe(15);
    expect(Math.round(irr(r.flows)! * 1000) / 10).toBe(15);
  });

  it("is the MAXIMUM — a dollar more misses", () => {
    // Monotonicity, asserted rather than assumed: this is what makes the
    // bisection exact rather than approximately right.
    const r = run();
    const higher = run({ targetLeveredIrrPct: 15.0001 });
    expect(higher.maxPrice!).toBeLessThan(r.maxPrice!);
  });

  it("pays less for a higher required return, and more for a lower one", () => {
    expect(run({ targetLeveredIrrPct: 18 }).maxPrice!).toBeLessThan(run().maxPrice!);
    expect(run({ targetLeveredIrrPct: 12 }).maxPrice!).toBeGreaterThan(run().maxPrice!);
  });

  it("cannot be reached by scaling, which is why it is solved", () => {
    // The circularity: a 20% higher target does not move the price 20%,
    // because the loan and therefore the debt service move with it.
    const base = run().maxPrice!;
    const harder = run({ targetLeveredIrrPct: 18 }).maxPrice!;
    const naive = base * (15 / 18);
    expect(Math.abs(harder - naive)).toBeGreaterThan(1_000_000);
  });

  it("re-solves when the exit moves, since the exit is most of the return", () => {
    expect(run({ exitCapPct: 6.5 }).maxPrice!).toBeLessThan(run().maxPrice!);
    expect(run({ exitCapPct: 5.5 }).maxPrice!).toBeGreaterThan(run().maxPrice!);
  });
});

describe("rule 1 — the binding test moves with the price", () => {
  it("names the test that governs at the solved price", () => {
    expect(run().bindingTest).toBe("Loan to value");
  });

  it("solves for where the answer changes hands", () => {
    // 65% of $26.77M is exactly the $17.40M the coverage tests allow.
    const r = run();
    expect(r.bindingFlipPrice).toBe(26_774_139);
    const coverage = Math.min(...r.tests.filter((t) => t.key !== "ltv").map((t) => t.maxLoan));
    expect(Math.round(coverage / 0.65)).toBe(r.bindingFlipPrice);
  });

  it("says LTV gives way ABOVE the crossing, because LTV grows with the price", () => {
    const r = run();
    expect(r.maxPrice!).toBeLessThan(r.bindingFlipPrice!);
    expect(r.note).toContain("Loan to value governs");
    expect(r.note).toContain("Above $26.77M the coverage tests take over");
  });

  it("and says loan-to-value takes over BELOW it when coverage is binding", () => {
    // The other direction, which is the one that was written backwards
    // first: looser LTV and tighter coverage flips which test governs.
    const r = run({ targetLeveredIrrPct: 11, maxLtvPct: 75, minDscr: 1.35, minDebtYieldPct: 9.5 });
    expect(r.bindingTest).toBe("Debt service coverage");
    expect(r.maxPrice!).toBeGreaterThan(r.bindingFlipPrice!);
    expect(r.note).toContain("Below $21.49M loan-to-value takes over");
  });

  it("has no crossing to report when only loan-to-value is set", () => {
    const r = run({ minDscr: null, minDebtYieldPct: null });
    expect(r.bindingFlipPrice).toBeNull();
    expect(r.bindingTest).toBe("Loan to value");
    expect(r.note).toContain("governs the loan at this price");
  });
});

describe("rule 3 — the cheque is not the price less the loan", () => {
  it("funds the closing costs and the loan fee at closing", () => {
    const r = run();
    expect(r.closingCosts).toBe(Math.round(r.maxPrice! * 0.015));
    expect(r.loanFee).toBe(Math.round(r.loan! * 0.01));
    expect(r.equity).toBe(r.maxPrice! - r.loan! + r.closingCosts! + r.loanFee!);
  });

  it("bids LESS because of them — leaving them out overstates the bid", () => {
    // The direction that loses money, priced: free closing is worth
    // nearly a million dollars of bid.
    const withCosts = run().maxPrice!;
    const without = run({ closingCostPct: 0, loanFeePct: 0 }).maxPrice!;
    expect(without).toBeGreaterThan(withCosts);
    expect(without - withCosts).toBeGreaterThan(500_000);
  });

  it("puts the whole equity into year zero and nothing else there", () => {
    const r = run();
    expect(r.flows[0]).toBe(-r.equity!);
    expect(r.flows).toHaveLength(6);
  });

  it("adds the sale to the final year rather than giving it a year of its own", () => {
    const r = run();
    const last = r.years[r.years.length - 1];
    expect(r.flows[5]).toBe(last.cashFlow + r.netSaleProceeds!);
  });
});

describe("the exit", () => {
  it("capitalises the FORWARD NOI — year six, what the next buyer buys", () => {
    const r = run();
    expect(r.exitValue).toBe(Math.round((1_650_000 * Math.pow(1.03, 5)) / 0.06));
  });

  it("takes the cost of selling and the balance owed off it", () => {
    const r = run();
    const owed = r.years[r.years.length - 1].loanBalance;
    expect(r.netSaleProceeds).toBe(Math.round(r.exitValue! - r.exitValue! * 0.015 - owed));
  });

  it("amortises the loan through the hold rather than holding it flat", () => {
    const r = run();
    expect(r.years[4].loanBalance).toBeLessThan(r.loan!);
    for (let i = 1; i < r.years.length; i++) {
      expect(r.years[i].loanBalance).toBeLessThan(r.years[i - 1].loanBalance);
    }
  });

  it("leaves the balance where it started under full-term interest-only", () => {
    const r = run({ ioYears: 5 });
    expect(r.years[4].loanBalance).toBe(r.loan);
    // …and the bid goes UP, because nothing is paid down out of cash flow.
    expect(r.maxPrice!).toBeGreaterThan(run().maxPrice!);
  });
});

describe("what it refuses", () => {
  it("answers with a prompt without an NOI or a target", () => {
    expect(readBid({ ...SEED, year1Noi: 0 }).maxPrice).toBeNull();
    expect(readBid({ ...SEED, year1Noi: 0 }).note).toContain("the return the equity needs");
  });

  it("refuses an exit cap of nothing rather than dividing by it", () => {
    const r = run({ exitCapPct: 0 });
    expect(r.maxPrice).toBeNull();
    expect(r.note).toContain("the next buyer would pay");
  });

  it("refuses a hold it cannot run", () => {
    expect(run({ holdYears: 0 }).note).toContain("one and thirty years");
    expect(run({ holdYears: 45 }).maxPrice).toBeNull();
  });

  it("answers an absurd target with an absurd price rather than refusing", () => {
    // 60% levered IS reachable — at $11.05M, a 14.9% going-in cap. That is
    // a true and useful answer: buy cheap enough and the return is
    // anything. Refusing here would be the module deciding what a sensible
    // deal looks like, which is not its job.
    const r = run({ targetLeveredIrrPct: 60 });
    expect(r.maxPrice).toBe(11_053_478);
    expect(r.capAtMaxPricePct!).toBeGreaterThan(14);
    expect(r.checkIrrPct).toBe(60);
  });

  it("names the missing LTV rather than blaming the target", () => {
    // Coverage tests are fixed by the NOI and do not scale with the price,
    // so with no loan-to-value cap the low end of the search sizes a loan
    // bigger than the building. That is a missing input, and calling it an
    // unreachable return would send someone to renegotiate the wrong thing.
    const r = run({ maxLtvPct: null });
    expect(r.maxPrice).toBeNull();
    expect(r.note).toContain("larger than the building");
    expect(r.note).not.toContain("out of reach");
  });

  it("solves normally the moment a loan-to-value cap is there", () => {
    expect(run({ maxLtvPct: 65 }).maxPrice).not.toBeNull();
  });

  it("widens the search rather than reporting its own ceiling as the answer", () => {
    // The bound started fixed at 100x the NOI, which looked safe and was
    // not: at a 0.5% exit cap the exit is worth over 200x the NOI, a
    // modest target clears at the bound, and the bisection converged ON
    // the bound — returning exactly $100,000,000 while checkIrrPct quietly
    // said 31.8% against a 6% target. A ceiling presented as a solve, in
    // the overstating direction.
    const r = readBid({
      year1Noi: 1_000_000,
      noiGrowthPct: 3,
      holdYears: 5,
      exitCapPct: 0.5,
      sellingCostPct: 1.5,
      targetLeveredIrrPct: 6,
      maxLtvPct: 65,
      minDscr: null,
      minDebtYieldPct: null,
      ratePct: 5,
      amortYears: 30,
      ioYears: 0,
      loanFeePct: 0,
      closingCostPct: 0,
    });
    expect(r.maxPrice!).toBeGreaterThan(100_000_000);
    expect(r.maxPrice).not.toBe(100_000_000);
    // The round trip is the check that caught it, so it is the check that
    // pins the fix.
    expect(r.checkIrrPct).toBe(6);
  });

  it("still lands well inside the bound on an ordinary deal", () => {
    // The widening must not perturb the normal case.
    expect(run().maxPrice!).toBeLessThan(SEED.year1Noi * 100);
    expect(run().maxPrice).toBe(25_542_335);
  });

  it("runs an all-cash bid when no lender test is set", () => {
    const r = run({ maxLtvPct: null, minDscr: null, minDebtYieldPct: null });
    expect(r.loan).toBe(0);
    expect(r.equity).toBe(r.maxPrice! + r.closingCosts!);
    expect(r.note).toContain("all-cash bid");
    // …and it bids far less, because the return is unlevered now.
    expect(r.maxPrice!).toBeLessThan(run().maxPrice!);
  });
});
