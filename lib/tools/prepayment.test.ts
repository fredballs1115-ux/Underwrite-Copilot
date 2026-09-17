import { describe, expect, it } from "vitest";
import { readPrepayment, remainingPayments, type PrepayTerms } from "./prepayment";

/**
 * The seeded loan, which is also what `/tools` renders: $20M at 3.75%
 * struck when rates were low, thirty months from maturity, in a world
 * where the matching Treasury now pays 4.75%. Chosen because it is the
 * case that reverses the answer — yield maintenance sits on its floor
 * and defeasance is a gain.
 */
const SEED: PrepayTerms = {
  balance: 20_000_000,
  loanRatePct: 3.75,
  monthsRemaining: 30,
  amortYears: 30,
  treasuryRatePct: 4.75,
  floorPct: 1,
  defeasanceCosts: 75_000,
  monthsToOpen: 24,
  marketLoanRatePct: 6.5,
};

/** The same loan in a world where rates fell instead. */
const FALLEN: PrepayTerms = { ...SEED, treasuryRatePct: 2.5 };

describe("the schedule it prices", () => {
  it("runs the loan's own payment and balloon", () => {
    const r = readPrepayment(SEED);
    expect(r.payment).toBe(92_623.12);
    expect(r.balloon).toBe(19_054_138);
  });

  it("pays the balloon with the last payment, never after it", () => {
    const stream = remainingPayments(20_000_000, 3.75, 30, 92_623.12);
    expect(stream.length).toBe(30);
    // Twenty-nine level payments, then one that carries the balloon.
    expect(new Set(stream.slice(0, 29)).size).toBe(1);
    expect(stream[29]).toBeGreaterThan(stream[0] * 100);
  });

  it("makes an interest-only loan pay interest and the whole balance", () => {
    const r = readPrepayment({ ...SEED, amortYears: null });
    expect(r.payment).toBe(round2((20_000_000 * 0.0375) / 12));
    expect(r.balloon).toBe(20_000_000);
  });
});

describe("rule 1 — yield maintenance is cheap when rates have risen", () => {
  it("floors out entirely when the Treasury is above the coupon", () => {
    const r = readPrepayment(SEED);
    // The lender can reinvest at 4.75% instead of 3.75%, so there is no
    // loss at all and the 1% floor is the whole penalty.
    expect(r.yieldMaintenanceRaw).toBe(0);
    expect(r.floorAmount).toBe(200_000);
    expect(r.yieldMaintenance).toBe(200_000);
    expect(r.atFloor).toBe(true);
    expect(r.note).toContain("the lender loses nothing by being repaid");
  });

  it("is a real loss when the Treasury is below the coupon", () => {
    const r = readPrepayment(FALLEN);
    expect(r.atFloor).toBe(false);
    expect(r.yieldMaintenance).toBe(591_795);
    expect(r.yieldMaintenance!).toBeGreaterThan(r.floorAmount!);
  });

  it("rises as the Treasury falls, monotonically", () => {
    const at = (t: number) => readPrepayment({ ...SEED, treasuryRatePct: t }).yieldMaintenance!;
    const ladder = [5, 4, 3.75, 3, 2, 1].map(at);
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i]).toBeGreaterThanOrEqual(ladder[i - 1]);
    }
    // At the coupon itself there is exactly no loss.
    expect(readPrepayment({ ...SEED, treasuryRatePct: 3.75 }).yieldMaintenanceRaw).toBe(0);
  });

  it("has no floor to fall back on when none is stated", () => {
    const r = readPrepayment({ ...SEED, floorPct: null });
    expect(r.floorAmount).toBe(0);
    expect(r.yieldMaintenance).toBe(0);
    expect(r.atFloor).toBe(false);
  });
});

describe("rule 3 — defeasance is a purchase, and can be a gain", () => {
  it("costs less than the balance when rates have risen", () => {
    const r = readPrepayment(SEED);
    expect(r.defeasancePortfolio).toBe(19_539_787);
    expect(r.defeasanceSpread).toBe(-460_213);
    // A gain even after the hard costs.
    expect(r.defeasance).toBe(-385_213);
    expect(r.note).toContain("LESS than the balance it retires");
  });

  it("is exactly yield maintenance plus the hard costs when the floor does not bind", () => {
    // The identity that shows the two are one calculation read two ways:
    // where the lender has a real loss, the Treasury portfolio's surplus
    // over the balance IS that loss, and defeasance differs only by what
    // the accountants and trustee charge.
    const r = readPrepayment(FALLEN);
    expect(r.atFloor).toBe(false);
    expect(r.defeasance).toBe(r.yieldMaintenance! + 75_000);
    expect(r.defeasanceSpread).toBe(r.yieldMaintenanceRaw);
  });

  it("beats yield maintenance in a risen-rate world and loses in a fallen one", () => {
    // The whole point of drawing both: the order reverses.
    expect(readPrepayment(SEED).cheaper).toBe("defeasance");
    expect(readPrepayment(FALLEN).cheaper).toBe("yield maintenance");
  });

  it("charges the hard costs whatever the rates do", () => {
    const withCosts = readPrepayment(SEED);
    const without = readPrepayment({ ...SEED, defeasanceCosts: null });
    expect(withCosts.defeasance! - without.defeasance!).toBe(75_000);
    expect(withCosts.defeasanceSpread).toBe(without.defeasanceSpread);
  });
});

describe("rule 4 — the open window costs nothing", () => {
  it("is free once the loan is open", () => {
    const r = readPrepayment({ ...SEED, monthsToOpen: 0 });
    expect(r.cheaper).toBe("the open window");
    expect(r.cost).toBe(0);
    expect(r.costOfNotWaiting).toBeNull();
    expect(r.note).toContain("prepays at par");
  });

  it("prices closing sooner as a monthly rate", () => {
    const r = readPrepayment(FALLEN);
    expect(r.cost).toBe(591_795);
    expect(r.costOfNotWaiting).toBe(round0(591_795 / 24));
  });

  it("says nothing per month when leaving early pays", () => {
    // A rate per month of waiting bought back is meaningless when there
    // is nothing to buy back.
    const r = readPrepayment(SEED);
    expect(r.cost!).toBeLessThan(0);
    expect(r.costOfNotWaiting).toBeNull();
  });
});

describe("rule 2 — the same move makes the loan worth more", () => {
  it("prices what a buyer assuming it would be getting", () => {
    const r = readPrepayment(SEED);
    expect(r.debtMarkToMarket).toBe(1_238_275);
  });

  it("does not move with the Treasury, only with the lending rate", () => {
    // The mark to market is against what the loan would cost to PLACE
    // today, which is a different rate from the one the lender reinvests
    // at — conflating them is the easy mistake here.
    expect(readPrepayment(FALLEN).debtMarkToMarket).toBe(
      readPrepayment(SEED).debtMarkToMarket,
    );
    expect(readPrepayment({ ...SEED, marketLoanRatePct: 8 }).debtMarkToMarket!).toBeGreaterThan(
      1_238_275,
    );
  });

  it("pulls the opposite way from the penalty, and says so", () => {
    const r = readPrepayment(SEED);
    expect(r.debtMarkToMarket!).toBeGreaterThan(0);
    expect(r.cost!).toBeLessThan(0);
    expect(r.note).toContain("Both are worth having; only one can be had");
  });

  it("is nothing when the loan is already at market", () => {
    const r = readPrepayment({ ...SEED, marketLoanRatePct: 3.75 });
    expect(r.debtMarkToMarket).toBe(0);
  });

  it("says nothing about it without a market rate", () => {
    expect(readPrepayment({ ...SEED, marketLoanRatePct: null }).debtMarkToMarket).toBeNull();
  });
});

describe("what it says with nothing to go on", () => {
  it("asks for the balance first", () => {
    const r = readPrepayment({ ...SEED, balance: null });
    expect(r.payment).toBeNull();
    expect(r.note).toBe("Enter what is outstanding on the loan.");
  });

  it("asks for the rate and the term next", () => {
    expect(readPrepayment({ ...SEED, monthsRemaining: null }).note).toContain(
      "months left to maturity",
    );
  });

  it("draws the schedule without a Treasury and asks for one", () => {
    const r = readPrepayment({ ...SEED, treasuryRatePct: null });
    expect(r.payment).toBe(92_623.12);
    expect(r.balloon).toBe(19_054_138);
    expect(r.yieldMaintenance).toBeNull();
    expect(r.defeasance).toBeNull();
    expect(r.note).toContain("Enter the Treasury rate");
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round0(n: number): number {
  return Math.round(n);
}
