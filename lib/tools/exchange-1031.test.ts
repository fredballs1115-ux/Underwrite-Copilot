import { describe, expect, it } from "vitest";
import {
  EXCHANGE_DAYS,
  IDENTIFY_DAYS,
  exchangeClock,
  readExchange,
  type ExchangeTerms,
} from "./exchange-1031";

/**
 * The seeded deal, which is also what `/tools` renders: a $26M sale rolled
 * into a $30M replacement with MORE debt on it. It clears the price test
 * comfortably and still owes tax, which is the single thing this card
 * exists to show.
 */
const SEED: ExchangeTerms = {
  salePrice: 26_000_000,
  sellingCosts: 780_000,
  adjustedBasis: 14_500_000,
  depreciationTaken: 5_500_000,
  mortgagePayoff: 12_000_000,
  replacementPrice: 30_000_000,
  newMortgage: 18_000_000,
  closing: "2026-11-15",
  recaptureRatePct: 25,
  capGainsRatePct: 20,
};

describe("the gain, and what an exchange does to it", () => {
  it("realises the gain net of the costs of selling", () => {
    const r = readExchange(SEED);
    expect(r.amountRealized).toBe(25_220_000);
    expect(r.realizedGain).toBe(10_720_000);
  });

  it("splits the gain into what is taxed now and what is rolled forward", () => {
    const r = readExchange(SEED);
    expect(r.recognizedGain).toBe(1_220_000);
    expect(r.deferredGain).toBe(9_500_000);
    // The whole gain is accounted for. Nothing evaporates in an exchange.
    expect(r.recognizedGain! + r.deferredGain!).toBe(r.realizedGain);
  });

  it("carries the deferred gain into the replacement's basis, not its price", () => {
    const r = readExchange(SEED);
    // RULE THREE, stated as arithmetic: $30M of property with a $20.5M
    // basis. The depreciation on the new building runs on that, and the
    // $9.5M is standing there at the next sale.
    expect(r.newBasis).toBe(20_500_000);
    expect(r.newBasis).toBe(SEED.replacementPrice! - r.deferredGain!);
  });
});

describe("boot", () => {
  it("taxes debt relief even when every dollar of cash is reinvested", () => {
    // RULE ONE. Sell $10M carrying $6M, buy $9M carrying $4M with all $4M
    // of proceeds going in. No cash is touched anywhere — and $2M of debt
    // was walked away from, so $2M is recognised.
    const r = readExchange({
      ...SEED,
      salePrice: 10_000_000,
      sellingCosts: 0,
      adjustedBasis: 3_000_000,
      depreciationTaken: 0,
      mortgagePayoff: 6_000_000,
      replacementPrice: 8_000_000,
      newMortgage: 4_000_000,
    });
    expect(r.netEquity).toBe(4_000_000);
    expect(r.equityReinvested).toBe(4_000_000);
    expect(r.cashBoot).toBe(0);
    expect(r.mortgageBoot).toBe(2_000_000);
    expect(r.recognizedGain).toBe(2_000_000);
  });

  it("lets cash added to the replacement offset the debt walked away from", () => {
    // The same trade, but $2M of the buyer's own money goes in on top of
    // the proceeds. Economically identical to replacing the loan, and
    // treated that way: no boot.
    const r = readExchange({
      ...SEED,
      salePrice: 10_000_000,
      sellingCosts: 0,
      adjustedBasis: 3_000_000,
      depreciationTaken: 0,
      mortgagePayoff: 6_000_000,
      replacementPrice: 10_000_000,
      newMortgage: 4_000_000,
    });
    expect(r.addedCash).toBe(2_000_000);
    expect(r.mortgageBoot).toBe(0);
    expect(r.cashBoot).toBe(0);
    expect(r.recognizedGain).toBe(0);
    expect(r.deferredGain).toBe(7_000_000);
  });

  it("does NOT let fresh borrowing cure cash taken off the table", () => {
    // RULE TWO, and the asymmetry that makes the price test worth keeping:
    // the replacement costs $4.78M more than this one realised, and the
    // $1.22M pocketed is still taxable.
    const r = readExchange(SEED);
    expect(r.cashBoot).toBe(1_220_000);
    expect(r.mortgageBoot).toBe(0);
    expect(r.tests[0].met, "the price test passes").toBe(true);
    expect(r.recognizedGain).toBe(1_220_000);
    expect(r.note).toContain("STILL boot");
  });

  it("never recognises more gain than there was", () => {
    // Boot of $5M against a $1M gain recognises $1M. Boot is a ceiling on
    // the gain, not a second source of it.
    const r = readExchange({
      ...SEED,
      salePrice: 10_000_000,
      sellingCosts: 0,
      adjustedBasis: 9_000_000,
      depreciationTaken: 0,
      mortgagePayoff: 0,
      replacementPrice: 5_000_000,
      newMortgage: 0,
    });
    expect(r.realizedGain).toBe(1_000_000);
    expect(r.cashBoot).toBe(5_000_000);
    expect(r.recognizedGain).toBe(1_000_000);
    expect(r.deferredGain).toBe(0);
  });

  it("says plainly when there is no gain to defer", () => {
    const r = readExchange({
      ...SEED,
      salePrice: 12_000_000,
      sellingCosts: 0,
      adjustedBasis: 14_500_000,
      replacementPrice: 12_000_000,
      mortgagePayoff: 0,
      newMortgage: 0,
    });
    expect(r.realizedGain).toBe(-2_500_000);
    expect(r.recognizedGain).toBe(0);
    expect(r.deferredGain).toBe(0);
    expect(r.note).toContain("no gain to defer");
    expect(r.note).toContain("a loss is not recognised");
  });
});

describe("the bill", () => {
  it("fills the recognised gain recapture-first, at the higher rate", () => {
    const r = readExchange(SEED);
    // $1.22M of boot against $5.5M of depreciation taken is all
    // unrecaptured 1250 — none of it reaches the capital gains rate.
    expect(r.tax!.unrecaptured1250).toBe(1_220_000);
    expect(r.tax!.capitalGain).toBe(0);
    expect(r.tax!.total).toBe(305_000);
    // Run at the capital gains rate it would read $244,000 — a quarter
    // light, on the first dollars out.
    expect(r.tax!.total).toBeGreaterThan(1_220_000 * 0.2);
  });

  it("prices the plain sale for the comparison, and says the difference", () => {
    const r = readExchange(SEED);
    // $5.5M recaptured at 25% plus $5.22M at 20%.
    expect(r.taxIfSold).toBe(1_375_000 + 1_044_000);
    expect(r.taxDeferred).toBe(2_419_000 - 305_000);
  });

  it("defers the whole bill when all three tests are met", () => {
    const r = readExchange({ ...SEED, replacementPrice: 30_000_000, newMortgage: 16_780_000 });
    expect(r.totalBoot).toBe(0);
    expect(r.tax!.total).toBe(0);
    expect(r.taxDeferred).toBe(r.taxIfSold);
    expect(r.binding).toBeNull();
    expect(r.tests.every((x) => x.met)).toBe(true);
  });
});

describe("the three tests", () => {
  it("names the one that fails by the most", () => {
    const r = readExchange(SEED);
    expect(r.binding?.label).toBe("Reinvest all the equity");
    expect(r.binding?.shortfall).toBe(1_220_000);
  });

  it("reports each test's requirement against what the replacement side does", () => {
    const r = readExchange(SEED);
    expect(r.tests.map((x) => x.label)).toEqual([
      "Trade up in price",
      "Reinvest all the equity",
      "Replace the debt",
    ]);
    expect(r.tests[0].required).toBe(25_220_000);
    expect(r.tests[0].actual).toBe(30_000_000);
    expect(r.tests[1].required).toBe(13_220_000);
    expect(r.tests[1].actual).toBe(12_000_000);
    // The debt test counts cash put in beside the new loan, which is what
    // makes it a debt-REPLACEMENT test rather than a borrowing test.
    expect(r.tests[2].required).toBe(12_000_000);
    expect(r.tests[2].actual).toBe(18_000_000);
  });

  it("puts each test's shortfall on the boot it causes", () => {
    const r = readExchange({
      ...SEED,
      replacementPrice: 20_000_000,
      newMortgage: 9_000_000,
    });
    expect(r.tests[1].shortfall).toBe(r.cashBoot);
    expect(r.tests[2].shortfall).toBe(r.mortgageBoot);
    expect(r.tests[1].shortfall! + r.tests[2].shortfall!).toBe(r.totalBoot);
  });
});

describe("the clock", () => {
  it("runs both windows from the same day", () => {
    // Not 45 and then another 180. The commonest scheduling error on an
    // exchange, and it costs the deal rather than a number.
    const c = exchangeClock("2026-03-02")!;
    expect(c.identifyBy).toBe("2026-04-16");
    expect(c.fullCloseBy).toBe("2026-08-29");
    expect(c.cutShort).toBe(false);
    expect(c.closeBy).toBe(c.fullCloseBy);
    expect(c.closeDays).toBe(EXCHANGE_DAYS);
  });

  it("cuts the window short at the return's due date on a late-year sale", () => {
    const c = exchangeClock("2026-11-15")!;
    expect(c.identifyBy).toBe("2026-12-30");
    expect(c.fullCloseBy).toBe("2027-05-14");
    expect(c.returnDueBy).toBe("2027-04-15");
    expect(c.cutShort).toBe(true);
    expect(c.closeBy).toBe("2027-04-15");
    expect(c.closeDays).toBe(151);
    expect(EXCHANGE_DAYS - c.closeDays).toBe(29);
  });

  it("counts the identification window as 45 days exactly", () => {
    const c = exchangeClock("2026-01-01")!;
    const start = Date.parse("2026-01-01T00:00:00Z");
    const id = Date.parse(`${c.identifyBy}T00:00:00Z`);
    expect((id - start) / 86_400_000).toBe(IDENTIFY_DAYS);
  });

  it("refuses a date that is not a real day", () => {
    expect(exchangeClock("2026-02-31")).toBeNull();
    expect(exchangeClock("15/11/2026")).toBeNull();
    expect(exchangeClock(null)).toBeNull();
  });

  it("answers the clock even when the figures are not set yet", () => {
    // The dates are useful on their own — a seller often knows the closing
    // date before anything else about the replacement.
    const r = readExchange({ ...SEED, salePrice: null });
    expect(r.clock?.identifyBy).toBe("2026-12-30");
    expect(r.amountRealized).toBeNull();
    expect(r.note).toContain("Set what the property being sold is worth");
  });
});

describe("a blank is null, never zero", () => {
  it("asks for the basis rather than assuming one", () => {
    const r = readExchange({ ...SEED, adjustedBasis: null });
    expect(r.realizedGain).toBeNull();
    expect(r.note).toContain("adjusted basis");
  });

  it("answers the sale side before the replacement is known", () => {
    const r = readExchange({ ...SEED, replacementPrice: null });
    expect(r.amountRealized).toBe(25_220_000);
    expect(r.realizedGain).toBe(10_720_000);
    expect(r.netEquity).toBe(13_220_000);
    expect(r.recognizedGain).toBeNull();
    expect(r.tests).toEqual([]);
    expect(r.note).toContain("replacement property's price");
  });

  it("treats an unstated loan as no loan on either side", () => {
    const r = readExchange({
      ...SEED,
      mortgagePayoff: null,
      newMortgage: null,
      sellingCosts: null,
      replacementPrice: 26_000_000,
    });
    expect(r.amountRealized).toBe(26_000_000);
    expect(r.netEquity).toBe(26_000_000);
    expect(r.equityReinvested).toBe(26_000_000);
    expect(r.totalBoot).toBe(0);
  });

  it("falls back to the federal rates when they are not stated", () => {
    const r = readExchange({ ...SEED, recaptureRatePct: null, capGainsRatePct: null });
    expect(r.tax!.total).toBe(305_000);
  });
});
