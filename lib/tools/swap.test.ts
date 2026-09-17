import { describe, expect, it } from "vitest";
import { MAX_TERM_YEARS, readSwap, type SwapTerms } from "./swap";

/**
 * A $20M bridge loan on SOFR plus 250, swapped two years ago to a 4.50%
 * fixed index. Rates have since come down to 3.00% — the direction nobody
 * stress-tests, because a swap is sold as protection against the other one.
 */
const SEED: SwapTerms = {
  loanAmount: 20_000_000,
  spreadPct: 2.5,
  amortYears: 30,
  ioYears: 2,
  loanTermYears: 5,
  contractRatePct: 4.5,
  swapTermYears: 5,
  monthsElapsed: 24,
  notional: "amortising",
  marketRatePct: 3,
  capPremium: 300_000,
};

describe("readSwap — rule 1, a swap settles both ways", () => {
  it("is a LIABILITY when rates have fallen", () => {
    const r = readSwap(SEED);
    expect(r.rateGapBps).toBe(-150);
    expect(r.markToMarket).toBe(-845_849);
    expect(r.breakageCost).toBe(845_849);
    expect(r.annualCostOfBeingWrong).toBe(300_000);
  });

  it("and an ASSET when they have risen — the half that gets remembered", () => {
    const r = readSwap({ ...SEED, marketRatePct: 6.5 });
    expect(r.rateGapBps).toBe(200);
    expect(r.markToMarket).toBe(1_070_419);
    expect(r.breakageCost).toBe(-1_070_419);
    expect(r.sameShapeAsYieldMaintenance).toBe(false);
    expect(r.note).toContain("the half of the instrument that gets remembered");
  });

  it("the position is monotone in the market rate, with no kink at the strike", () => {
    const by = [1.5, 3, 4, 4.5, 5, 6.5].map(
      (marketRatePct) => readSwap({ ...SEED, marketRatePct }).markToMarket!,
    );
    for (let i = 1; i < by.length; i += 1) expect(by[i]).toBeGreaterThan(by[i - 1]);
    // A cap, by contrast, is flat below its strike. The absence of a kink
    // IS the difference between an option and an obligation.
    expect(by).toEqual([-1_730_548, -845_849, -277_744, 0, 273_625, 1_070_419]);
  });

  it("struck exactly at today's market it is worth nothing at all", () => {
    const r = readSwap({ ...SEED, marketRatePct: 4.5 });
    expect(r.markToMarket).toBe(0);
    expect(r.breakageCost).toBe(0);
    expect(r.rateGapBps).toBe(0);
    expect(r.sameShapeAsYieldMaintenance).toBe(false);
    // And the sign is a real zero, never a negative one.
    expect(Object.is(r.markToMarket, -0)).toBe(false);
    expect(Object.is(r.breakageCost, -0)).toBe(false);
  });
});

describe("readSwap — rule 2, the breakage is the exit problem", () => {
  it("names it as the same shape as yield maintenance", () => {
    const r = readSwap(SEED);
    expect(r.sameShapeAsYieldMaintenance).toBe(true);
    expect(r.note).toContain("SAME exit problem yield maintenance creates");
    expect(r.note).toContain("$845,849");
  });

  it("which is the thing floating-plus-swap was chosen to avoid", () => {
    // Both instruments hurt in the SAME rate direction — down. A borrower
    // who took floating debt and swapped it, rather than a fixed loan with
    // yield maintenance, has the identical problem at the exit.
    expect(readSwap({ ...SEED, marketRatePct: 2 }).sameShapeAsYieldMaintenance).toBe(true);
    expect(readSwap({ ...SEED, marketRatePct: 6 }).sameShapeAsYieldMaintenance).toBe(false);
  });

  it("and the cap that was not bought is the comparison", () => {
    // A cap's whole cost is its premium, whatever rates do. So it wins
    // wherever the swap is under water by more than the premium.
    expect(readSwap({ ...SEED, marketRatePct: 2 }).capWouldHaveCostLess).toBe(true);
    expect(readSwap({ ...SEED, marketRatePct: 3 }).capWouldHaveCostLess).toBe(true);
    // $277,744 of breakage against a $300,000 premium: the swap still wins.
    expect(readSwap({ ...SEED, marketRatePct: 4 }).capWouldHaveCostLess).toBe(false);
    expect(readSwap({ ...SEED, marketRatePct: 6 }).capWouldHaveCostLess).toBe(false);
  });

  it("no cap was quoted, so no comparison is drawn", () => {
    const r = readSwap({ ...SEED, capPremium: null });
    expect(r.capPremium).toBeNull();
    expect(r.capWouldHaveCostLess).toBeNull();
    // Every other figure is untouched by its absence.
    expect(r.markToMarket).toBe(readSwap(SEED).markToMarket);
  });

  it("the longer the term left, the larger the position", () => {
    const by = [48, 36, 24, 12, 0].map(
      (monthsElapsed) => readSwap({ ...SEED, monthsElapsed }).breakageCost!,
    );
    for (let i = 1; i < by.length; i += 1) expect(by[i]).toBeGreaterThan(by[i - 1]);
    expect(by.at(-1)).toBe(1_378_300);
  });
});

describe("readSwap — rule 3, the spread rides on top", () => {
  it("the struck rate is never the coupon", () => {
    const r = readSwap(SEED);
    expect(r.allInRatePct).toBe(7);
    expect(r.marketAllInRatePct).toBe(5.5);
    // 4.50 swapped + 2.50 spread. Quoting the swap rate as the loan rate
    // understates the coupon by the whole spread.
    expect(r.allInRatePct).toBe(SEED.contractRatePct! + SEED.spreadPct!);
  });

  it("a larger spread moves the coupon and barely moves the position", () => {
    const wide = readSwap({ ...SEED, spreadPct: 4 });
    const none = readSwap({ ...SEED, spreadPct: 0 });
    expect(wide.allInRatePct).toBe(8.5);
    expect(none.allInRatePct).toBe(4.5);
    // The swap settles on the INDEX, so the spread reaches the position
    // only through the loan's amortisation — a few thousand dollars on
    // eight hundred, which is the point: it is a quoting rule, not an
    // arithmetic one.
    expect(Math.abs(wide.markToMarket! - none.markToMarket!)).toBeLessThan(20_000);
  });

  it("no spread given is no spread, never a guessed one", () => {
    expect(readSwap({ ...SEED, spreadPct: null }).allInRatePct).toBe(4.5);
  });
});

describe("readSwap — rule 4, the notional has to follow the balance", () => {
  it("a flat notional against an amortising loan hedges debt already repaid", () => {
    const r = readSwap({ ...SEED, notional: "flat" });
    expect(r.notionalAtHorizon).toBe(20_000_000);
    expect(r.balanceAtHorizon).toBe(19_345_393);
    expect(r.overHedgedFromAmortisation).toBe(654_607);
  });

  it("and more so where the loan amortises from the first month", () => {
    const withIo = readSwap({ ...SEED, notional: "flat" });
    const without = readSwap({ ...SEED, notional: "flat", ioYears: 0 });
    expect(without.overHedgedFromAmortisation).toBe(1_173_682);
    expect(without.overHedgedFromAmortisation).toBeGreaterThan(
      withIo.overHedgedFromAmortisation!,
    );
  });

  it("an amortising notional is over-hedged by nothing, which is the fix", () => {
    const r = readSwap(SEED);
    expect(r.overHedgedFromAmortisation).toBe(0);
    expect(r.notionalAtHorizon).toBe(r.balanceAtHorizon);
  });

  it("a swap that outlives the loan is a rate position, not a hedge", () => {
    const r = readSwap({ ...SEED, swapTermYears: 7 });
    expect(r.nakedMonths).toBe(24);
    expect(r.nakedNotional).toBe(19_345_393);
    expect(r.note).toContain("That is a rate position, not a hedge");
    // It outranks everything else in the note, because what a position is
    // worth matters less than whether it is a hedge at all.
    expect(r.markToMarket).toBeLessThan(0);
    expect(r.note).not.toContain("yield maintenance");
  });

  it("a swap inside the loan's term is naked for nothing", () => {
    const r = readSwap({ ...SEED, swapTermYears: 3 });
    expect(r.nakedMonths).toBe(0);
    expect(r.nakedNotional).toBeNull();
  });

  it("the notional keeps amortising past the balloon, rather than flatlining", () => {
    // The swap's schedule is fixed at inception and does not stop when the
    // loan ends. Built only to the loan's term it flatlined at the balloon
    // balance and overstated the naked position — the one figure that case
    // exists to report.
    const ten = readSwap({ ...SEED, swapTermYears: 10 });
    const seven = readSwap({ ...SEED, swapTermYears: 7 });
    expect(ten.markToMarket).toBe(-2_032_869);
    expect(seven.markToMarket).toBe(-1_353_098);
    // Longer naked stretch, larger position — but by less than a flat
    // notional would have given.
    expect(ten.nakedMonths).toBe(60);
    expect(ten.markToMarket).toBeLessThan(seven.markToMarket!);
  });

  it("with no loan term there is no naked period to report, not a zero", () => {
    const r = readSwap({ ...SEED, loanTermYears: null });
    expect(r.nakedMonths).toBeNull();
    expect(r.nakedNotional).toBeNull();
  });
});

describe("readSwap — an expired swap", () => {
  it("says it is over rather than marking a position that is gone", () => {
    const r = readSwap({ ...SEED, monthsElapsed: 60 });
    expect(r.monthsRemaining).toBe(0);
    expect(r.markToMarket).toBe(0);
    expect(r.annualCostOfBeingWrong).toBe(0);
    expect(r.sameShapeAsYieldMaintenance).toBe(false);
    expect(r.note).toContain("has run its term");
    // Before this branch it fell through to rule 3 and reported the coupon
    // of a loan whose hedge had already run off.
    expect(r.note).not.toContain("all in");
  });

  it("past its term is the same as at it", () => {
    expect(readSwap({ ...SEED, monthsElapsed: 120 }).monthsRemaining).toBe(0);
  });
});

describe("readSwap — the cost of being wrong, this year", () => {
  it("is struck on the notional outstanding, not the original loan", () => {
    // Four years in with no interest-only front end, the loan has
    // amortised: charging the rate gap against the original $20M would
    // read $300,000 on a notional that is no longer there.
    const r = readSwap({ ...SEED, ioYears: 0, monthsElapsed: 48 });
    expect(r.annualCostOfBeingWrong).toBe(286_424);
    expect(r.annualCostOfBeingWrong).toBeLessThan(300_000);
    // A flat notional IS the original loan, so there it reads $300,000.
    expect(
      readSwap({ ...SEED, ioYears: 0, monthsElapsed: 48, notional: "flat" })
        .annualCostOfBeingWrong,
    ).toBe(300_000);
  });

  it("and is signed the way the position is", () => {
    expect(readSwap({ ...SEED, marketRatePct: 6 }).annualCostOfBeingWrong).toBeLessThan(0);
  });
});

describe("readSwap — refusals and blanks", () => {
  it("names the missing loan", () => {
    expect(readSwap({ ...SEED, loanAmount: null }).note).toContain("the loan the swap sits on");
  });

  it("names the missing struck rate", () => {
    expect(readSwap({ ...SEED, contractRatePct: null }).note).toContain("fixed rate the swap");
  });

  it("names the missing market rate — the whole position is that difference", () => {
    const r = readSwap({ ...SEED, marketRatePct: null });
    expect(r.note).toContain("today's swap rate");
    expect(r.markToMarket).toBeNull();
  });

  it("names the missing swap term, and says it need not be the loan's", () => {
    expect(readSwap({ ...SEED, swapTermYears: null }).note).toContain("need not be the loan");
  });

  it("refuses a term that is a typo rather than running it", () => {
    expect(MAX_TERM_YEARS).toBe(30);
    const r = readSwap({ ...SEED, swapTermYears: 40 });
    expect(r.note).toContain("a typo rather than a term");
    expect(r.markToMarket).toBeNull();
  });

  it("a blank is null, never zero", () => {
    const r = readSwap({ ...SEED, loanAmount: null });
    expect(r.markToMarket).toBeNull();
    expect(r.allInRatePct).toBeNull();
    expect(r.nakedMonths).toBeNull();
    expect(r.overHedgedFromAmortisation).toBeNull();
    expect(r.sameShapeAsYieldMaintenance).toBe(false);
  });

  it("every figure is finite, at every edge", () => {
    const edges: SwapTerms[] = [
      SEED,
      { ...SEED, contractRatePct: 0, marketRatePct: 0 },
      { ...SEED, marketRatePct: -1 },
      { ...SEED, contractRatePct: 25, marketRatePct: 0.01 },
      { ...SEED, amortYears: null },
      { ...SEED, ioYears: 30 },
      { ...SEED, monthsElapsed: -12 },
      { ...SEED, loanAmount: 1, swapTermYears: MAX_TERM_YEARS },
      { ...SEED, spreadPct: 40 },
    ];
    for (const t of edges) {
      const r = readSwap(t);
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "number") {
          expect(Number.isFinite(v), `${k} is not finite`).toBe(true);
          expect(Object.is(v, -0), `${k} is negative zero`).toBe(false);
        }
      }
      expect(r.note.length).toBeGreaterThan(0);
    }
  });
});
