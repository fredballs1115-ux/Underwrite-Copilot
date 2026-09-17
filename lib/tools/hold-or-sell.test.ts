import { describe, it, expect } from "vitest";
import { readHold, MAX_HORIZON, type HoldInput } from "@/lib/tools/hold-or-sell";

/**
 * A stabilized building someone has owned for a while: worth $34M today
 * against $1.87M of forward NOI (a 5.50% cap), a $18.5M loan at 4.25%
 * amortising over thirty years, 3% rent growth, and a sponsor whose next
 * deal would earn 12.5% on the equity.
 *
 * Nothing about it is a problem. That is the point: the answer changes
 * while the building does not.
 */
const SEED: HoldInput = {
  currentValue: 34_000_000,
  nextYearNoi: 1_870_000,
  noiGrowthPct: 3,
  exitCapPct: 5.5,
  sellingCostPct: 2,
  reinvestmentRatePct: 12.5,
  loanBalance: 18_500_000,
  ratePct: 4.25,
  amortYears: 30,
  prepaymentPenalty: 0,
  taxOnSaleNow: 0,
  horizonYears: 10,
};

const run = (over: Partial<HoldInput> = {}) => readHold({ ...SEED, ...over });

describe("rule 2 — the capital at stake is the cheque", () => {
  it("is the price less the cost of selling and the loan payoff", () => {
    const r = run();
    expect(r.sellingCostNow).toBe(680_000);
    expect(r.loanPayoffNow).toBe(18_500_000);
    expect(r.netProceedsNow).toBe(14_820_000);
  });

  it("is neither the property's value nor the original equity", () => {
    const r = run();
    expect(r.netProceedsNow).not.toBe(SEED.currentValue);
    expect(r.netProceedsNow).toBeLessThan(SEED.currentValue - SEED.loanBalance);
  });

  it("takes the prepayment penalty and the tax off it too", () => {
    const r = run({ prepaymentPenalty: 400_000, taxOnSaleNow: 1_100_000 });
    expect(r.netProceedsNow).toBe(14_820_000 - 400_000 - 1_100_000);
  });

  it("says so rather than dividing when the sale leaves nothing", () => {
    const r = run({ loanBalance: 34_000_000, ratePct: 4.25 });
    expect(r.netProceedsNow!).toBeLessThanOrEqual(0);
    expect(r.nextYearReturnPct).toBeNull();
    expect(r.note).toContain("no equity to redeploy");
  });
});

describe("rule 1 — the decision is marginal", () => {
  it("answers the hold year on its own terms", () => {
    // $777,893 of cash plus $1,311,485 of equity built, on $14,820,000 of
    // capital sitting in the building.
    const r = run();
    expect(r.nextYearReturnPct).toBe(14.1);
    expect(r.years[0].cashFlow).toBe(777_893);
    expect(r.years[0].netProceeds).toBe(16_131_485);
  });

  it("is that year's cash plus the change in the cheque, over the cheque", () => {
    const r = run();
    const y = r.years[0];
    expect(y.marginalReturnPct).toBe(
      Math.round(((y.cashFlow + y.netProceeds - r.netProceedsNow!) / r.netProceedsNow!) * 1000) / 10,
    );
  });

  it("compares each later year against the year before it, not against today", () => {
    const r = run();
    for (let i = 1; i < r.years.length; i++) {
      const y = r.years[i];
      const prior = r.years[i - 1].netProceeds;
      expect(y.marginalReturnPct).toBe(
        Math.round(((y.cashFlow + y.netProceeds - prior) / prior) * 1000) / 10,
      );
    }
  });
});

describe("rule 3 — selling costs are paid whenever you sell", () => {
  it("charges them in both years, so they mostly cancel", () => {
    const r = run();
    // Year 1's proceeds carry their own 2%, exactly as today's do.
    expect(r.years[0].netProceeds).toBe(
      r.years[0].value - Math.round(r.years[0].value * 0.02) - r.years[0].loanBalance,
    );
  });

  it("prices the error of charging them against the hold year", () => {
    // 18.8% against an honest 14.1%. On a 12.5% hurdle the naive figure
    // says hold and keeps saying it for years.
    const r = run();
    expect(r.naiveNextYearReturnPct).toBe(18.8);
    expect(r.nextYearReturnPct).toBe(14.1);
  });

  it("always flatters — that is why it survives", () => {
    for (const costPct of [1, 2, 4, 6]) {
      const r = run({ sellingCostPct: costPct });
      expect(r.naiveNextYearReturnPct!).toBeGreaterThan(r.nextYearReturnPct!);
    }
  });

  it("and the two agree exactly when selling is free", () => {
    const r = run({ sellingCostPct: 0 });
    expect(r.naiveNextYearReturnPct).toBe(r.nextYearReturnPct);
  });
});

describe("rule 4 — the marginal return decays on its own", () => {
  it("falls every single year, with nothing going wrong", () => {
    const r = run();
    const rates = r.years.map((y) => y.marginalReturnPct!);
    expect(rates[0]).toBe(14.1);
    expect(rates[rates.length - 1]).toBe(11);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
    }
  });

  it("decays because the equity grows faster than the cash flow does", () => {
    // The mechanism, asserted rather than asserted about: the numerator
    // grows with rents, the denominator with rents AND amortisation.
    const r = run();
    const cashGrowth = r.years[5].cashFlow / r.years[0].cashFlow;
    const equityGrowth = r.years[5].netProceeds / r.years[0].netProceeds;
    expect(equityGrowth).toBeGreaterThan(cashGrowth);
  });

  it("decays faster the more leveraged the building is", () => {
    // More debt, more equity growth per dollar of equity, quicker decay.
    const levered = run({ loanBalance: 24_000_000 });
    const unlevered = run({ loanBalance: 0, ratePct: 0, amortYears: 30 });
    const drop = (x: ReturnType<typeof run>) =>
      x.years[0].marginalReturnPct! - x.years[4].marginalReturnPct!;
    expect(drop(levered)).toBeGreaterThan(drop(unlevered));
  });
});

describe("rule 5 — the hurdle is an input, and the answer is a year", () => {
  it("names the year the marginal return falls under it", () => {
    const r = run();
    expect(r.sellYear).toBe(5);
    expect(r.years[3].clears).toBe(true);
    expect(r.years[4].clears).toBe(false);
  });

  it("says to sell later when the money has nowhere better to go", () => {
    expect(run({ reinvestmentRatePct: 11.5 }).sellYear).toBe(8);
    expect(run({ reinvestmentRatePct: 8 }).sellYear).toBeNull();
  });

  it("says to sell now when the hold year is already under it", () => {
    const r = run({ reinvestmentRatePct: 16 });
    expect(r.sellYear).toBe(1);
    expect(r.note).toContain("the year to sell is now");
  });

  it("says nothing here says to sell when none of the years falls under", () => {
    const r = run({ reinvestmentRatePct: 8 });
    expect(r.note).toContain("stays above the hurdle for all 10 years");
  });

  it("would have kept holding on the naive figure — the error changes the answer", () => {
    // 18.8% naive against a 12.5% hurdle reads as an easy hold, while the
    // honest schedule says four more years. This is what rule 3 costs.
    const r = run();
    expect(r.naiveNextYearReturnPct!).toBeGreaterThan(SEED.reinvestmentRatePct);
    expect(r.sellYear).toBe(5);
  });
});

describe("the exit capitalises the forward NOI", () => {
  it("values the end of each year on the NEXT year's NOI", () => {
    const r = run();
    // Year 1 ends holding a building whose buyer purchases year 2's NOI.
    expect(r.years[0].value).toBe(Math.round((1_870_000 * 1.03) / 0.055));
    expect(r.years[1].value).toBe(Math.round((1_870_000 * 1.03 * 1.03) / 0.055));
  });

  it("earns this year's NOI while owning it, which is not the one capitalised", () => {
    const r = run();
    expect(r.years[0].noi).toBe(1_870_000);
    expect(r.years[0].value).not.toBe(Math.round(1_870_000 / 0.055));
  });

  it("names the cap today's value implies, so a difference reads as a claim", () => {
    const r = run();
    expect(r.impliedCapNowPct).toBe(5.5);
    expect(r.capMovementBps).toBe(0);
  });

  it("shows a cap assumption as basis points of movement", () => {
    // Believing you can sell at $34M today but underwriting a 5.75% exit is
    // assuming 25bp of widening, and the first hold year absorbs it.
    const r = run({ exitCapPct: 5.75 });
    expect(r.capMovementBps).toBe(25);
    expect(r.years[0].marginalReturnPct!).toBeLessThan(run().years[0].marginalReturnPct!);
  });
});

describe("the loan", () => {
  it("amortises through the schedule rather than sitting still", () => {
    const r = run();
    expect(r.years[0].loanBalance).toBeLessThan(SEED.loanBalance);
    for (let i = 1; i < r.years.length; i++) {
      expect(r.years[i].loanBalance).toBeLessThan(r.years[i - 1].loanBalance);
    }
  });

  it("holds the balance flat when there is no loan to run", () => {
    const r = run({ loanBalance: 0 });
    expect(r.years.every((y) => y.loanBalance === 0)).toBe(true);
    expect(r.netProceedsNow).toBe(34_000_000 - 680_000);
  });

  it("takes the whole NOI as cash when there is no debt service", () => {
    const r = run({ loanBalance: 0 });
    expect(r.years[0].cashFlow).toBe(1_870_000);
  });
});

describe("what it refuses", () => {
  it("answers with a prompt without a value or an NOI", () => {
    expect(readHold({ ...SEED, currentValue: 0 }).years).toEqual([]);
    expect(readHold({ ...SEED, currentValue: 0 }).note).toContain("worth today");
  });

  it("refuses a cap of nothing rather than dividing by it", () => {
    const r = readHold({ ...SEED, exitCapPct: 0 });
    expect(r.years).toEqual([]);
    expect(r.note).toContain("the next buyer would pay");
  });

  it("refuses a selling cost that is not a percentage", () => {
    expect(readHold({ ...SEED, sellingCostPct: 120 }).note).toContain("percentage of the price");
    expect(readHold({ ...SEED, sellingCostPct: -1 }).years).toEqual([]);
  });

  it("holds the horizon to something a hold decision can survive", () => {
    expect(readHold({ ...SEED, horizonYears: 40 }).years).toHaveLength(MAX_HORIZON);
    expect(MAX_HORIZON).toBe(10);
  });

  it("runs five years when no horizon is given", () => {
    expect(readHold({ ...SEED, horizonYears: null }).years).toHaveLength(5);
  });

  it("runs a flat building rather than requiring growth", () => {
    const r = run({ noiGrowthPct: 0 });
    expect(r.years.every((y) => y.noi === 1_870_000)).toBe(true);
    // Still decays, because amortisation alone grows the denominator.
    expect(r.years[4].marginalReturnPct!).toBeLessThan(r.years[0].marginalReturnPct!);
  });

  it("runs a shrinking building and reports the loss as one", () => {
    const r = run({ noiGrowthPct: -4 });
    expect(r.years[0].marginalReturnPct!).toBeLessThan(0);
    expect(r.sellYear).toBe(1);
  });
});
