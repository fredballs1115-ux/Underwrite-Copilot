import { describe, expect, it } from "vitest";
import { loanConstant } from "./deal-math";
import { rateForConstant, readFloating, type FloatingTerms } from "./floating-rate";

/** The card's own seeded loan: a $20M bridge on SOFR + 300, capped at 4%. */
const SEED: FloatingTerms = {
  loanAmount: 20_000_000,
  indexPct: 3.64,
  spreadBps: 300,
  indexFloorPct: 3.0,
  capStrikePct: 4.0,
  capPremium: 300_000,
  capTermMonths: 24,
  amortYears: null,
  noi: 1_660_000,
  covenantDscr: 1.2,
  extensionNoi: 1_750_000,
};

describe("the loan today", () => {
  const r = readFloating(SEED);

  it("pays the index plus the spread", () => {
    expect(r.indexUsedPct).toBe(3.64);
    expect(r.allInRatePct).toBe(6.64);
    expect(r.atFloor).toBe(false);
    expect(r.atCap).toBe(false);
  });

  it("services the debt interest-only unless told otherwise", () => {
    expect(r.debtServiceAnnual).toBe(1_328_000);
    expect(r.paymentMonthly).toBe(110_666.67);
    expect(r.dscr).toBe(1.25);
  });

  it("answers nothing without a loan, an index and a spread", () => {
    for (const missing of ["loanAmount", "indexPct", "spreadBps"] as const) {
      const out = readFloating({ ...SEED, [missing]: null });
      expect(out.allInRatePct, missing).toBeNull();
      expect(out.dscr, missing).toBeNull();
      expect(out.note, missing).toBeNull();
    }
  });

  it("takes a zero spread, which is a figure and not a blank", () => {
    const r0 = readFloating({ ...SEED, spreadBps: 0 });
    expect(r0.allInRatePct).toBe(3.64);
  });
});

describe("amortisation, which is where most of the payment is", () => {
  it("costs far more than interest-only on the same rate", () => {
    const io = readFloating(SEED);
    const am = readFloating({ ...SEED, amortYears: 30 });
    expect(am.allInRatePct).toBe(io.allInRatePct);
    expect(am.debtServiceAnnual).toBe(1_539_127);
    expect(am.dscr).toBe(1.08);
  });

  it("moves the breach point below today's index", () => {
    // The same loan that clears its covenant interest-only is already
    // through it amortising, and the breach index goes negative-headroom.
    const am = readFloating({ ...SEED, amortYears: 30 });
    expect(am.breachIndexPct).toBe(2.64);
    expect(am.breachHeadroomBps).toBe(-100);
    expect(am.note).toContain("Already through the covenant");
  });
});

describe("the floor and the cap are different instruments", () => {
  it("lifts the rate to the floor when the index is under it", () => {
    const r = readFloating({ ...SEED, indexPct: 2.5 });
    expect(r.indexUsedPct).toBe(3);
    expect(r.atFloor).toBe(true);
    expect(r.allInRatePct).toBe(6);
  });

  it("pays the excess back when the index is over the strike", () => {
    const r = readFloating({ ...SEED, indexPct: 5.0 });
    expect(r.atCap).toBe(true);
    expect(r.indexUsedPct).toBe(4);
    // 100 bps over the strike on $20M.
    expect(r.capPayoffAnnual).toBe(200_000);
  });

  it("pays nothing at or under the strike", () => {
    expect(readFloating(SEED).capPayoffAnnual).toBe(0);
    expect(readFloating({ ...SEED, indexPct: 4.0 }).capPayoffAnnual).toBe(0);
  });

  it("has no payoff at all with no cap, which is not the same as zero", () => {
    expect(readFloating({ ...SEED, capStrikePct: null }).capPayoffAnnual).toBeNull();
  });

  it("keeps a floor above the strike from triggering a cap payment", () => {
    // The trap. Clamping the floored index into the band —
    // min(max(index, floor), strike) — hands this borrower a 50 bps
    // reduction that no cap paid for: the INDEX is 3.00, below the 4.00
    // strike, so the cap owes nothing, and the note's own 4.50 floor is
    // what gets paid.
    const r = readFloating({
      ...SEED,
      indexPct: 3.0,
      indexFloorPct: 4.5,
      capStrikePct: 4.0,
    });
    expect(r.indexUsedPct).toBe(4.5);
    expect(r.allInRatePct).toBe(7.5);
    expect(r.atFloor).toBe(true);
    expect(r.atCap).toBe(false);
    expect(r.capPayoffAnnual).toBe(0);
  });

  it("draws the band from the floor to the strike, not around today", () => {
    const r = readFloating(SEED);
    expect(r.rateBandLowPct).toBe(6);
    expect(r.rateBandHighPct).toBe(7);
    // Today's 6.64% is inside it, and nowhere near the middle.
    expect(r.allInRatePct).toBeGreaterThan(r.rateBandLowPct!);
    expect(r.allInRatePct).toBeLessThan(r.rateBandHighPct!);
  });

  it("has no ceiling to the band with no cap", () => {
    const r = readFloating({ ...SEED, capStrikePct: null });
    expect(r.rateBandHighPct).toBeNull();
    expect(r.worstCaseRatePct).toBeNull();
  });
});

describe("where the loan stops working", () => {
  it("solves the index at which DSCR is exactly the covenant", () => {
    const r = readFloating(SEED);
    expect(r.breachIndexPct).toBe(3.92);
    expect(r.breachHeadroomBps).toBe(28);
  });

  it("is a real solve: rebuilding at that index gives back the covenant", () => {
    // The check that the solver is not merely returning a plausible number.
    const r = readFloating(SEED);
    const at = readFloating({ ...SEED, indexPct: r.breachIndexPct, capStrikePct: null });
    expect(at.dscr).toBe(SEED.covenantDscr);
  });

  it("solves the amortising case the same way, through the constant", () => {
    const r = readFloating({ ...SEED, amortYears: 30 });
    const at = readFloating({
      ...SEED,
      amortYears: 30,
      indexPct: r.breachIndexPct,
      indexFloorPct: null,
      capStrikePct: null,
    });
    expect(at.dscr).toBe(SEED.covenantDscr);
  });

  it("measures headroom from the index, not from the floored rate", () => {
    // Both figures are quoted on the index's scale and a reader will
    // subtract them on the card, so the subtraction has to be the one they
    // can see: 3.92 less 2.50 is 142 bps.
    const r = readFloating({ ...SEED, indexPct: 2.5 });
    expect(r.breachIndexPct).toBe(3.92);
    expect(r.breachHeadroomBps).toBe(142);
  });

  it("reports negative headroom rather than clamping at zero", () => {
    const r = readFloating({ ...SEED, indexPct: 5.0 });
    expect(r.breachHeadroomBps).toBe(-108);
  });

  it("has no breach point without an NOI or a covenant", () => {
    expect(readFloating({ ...SEED, noi: null }).breachIndexPct).toBeNull();
    expect(readFloating({ ...SEED, covenantDscr: null }).breachIndexPct).toBeNull();
  });
});

describe("whether the cap reaches the breach", () => {
  it("is false when the strike sits above the breach point", () => {
    // The whole point of the card. The strike is 8 bps above the breach
    // point — it looks like it is right there, and it is on the wrong side.
    const r = readFloating(SEED);
    expect(r.breachIndexPct).toBe(3.92);
    expect(SEED.capStrikePct).toBe(4.0);
    expect(r.capProtects).toBe(false);
    expect(r.note).toBe(
      "The cap is struck at 4.00% and the covenant breaks at 3.92% — the loan fails before the cap pays anything.",
    );
  });

  it("shows up in the worst case: the capped rate still misses the test", () => {
    // The same claim said in DSCR rather than in rates, which is the check
    // that capProtects is not just comparing two unrelated numbers.
    const r = readFloating(SEED);
    expect(r.worstCaseRatePct).toBe(7);
    expect(r.worstCaseDscr).toBe(1.19);
    expect(r.worstCaseDscr!).toBeLessThan(SEED.covenantDscr!);
  });

  it("is true once the building earns enough to push the breach past it", () => {
    const r = readFloating({ ...SEED, noi: 2_000_000 });
    expect(r.breachIndexPct).toBe(5.33);
    expect(r.capProtects).toBe(true);
    expect(r.worstCaseDscr!).toBeGreaterThan(SEED.covenantDscr!);
    expect(r.note).toContain("engages before the covenant");
  });

  it("is false with no cap at all, and says why", () => {
    const r = readFloating({ ...SEED, capStrikePct: null, capPremium: null });
    expect(r.capProtects).toBe(false);
    expect(r.note).toContain("No cap");
  });

  it("cannot be judged without a breach point", () => {
    expect(readFloating({ ...SEED, noi: null }).capProtects).toBeNull();
  });
});

describe("what the cap costs, said as a rate", () => {
  it("turns the premium into basis points a year", () => {
    // $300,000 on $20M over two years.
    const r = readFloating(SEED);
    expect(r.capCostBps).toBe(75);
    expect(r.allInWithCapPct).toBe(7.39);
  });

  it("halves when the same premium buys twice the term", () => {
    expect(readFloating({ ...SEED, capTermMonths: 48 }).capCostBps).toBe(38);
  });

  it("doubles on half the loan, because it is a rate on the balance", () => {
    expect(readFloating({ ...SEED, loanAmount: 10_000_000 }).capCostBps).toBe(150);
  });

  it("is nothing without a premium or a term, never zero", () => {
    expect(readFloating({ ...SEED, capPremium: null }).capCostBps).toBeNull();
    expect(readFloating({ ...SEED, capTermMonths: null }).capCostBps).toBeNull();
    expect(readFloating({ ...SEED, capPremium: null }).allInWithCapPct).toBeNull();
  });

  it("leaves the bare rate alone, so the two can be read side by side", () => {
    const r = readFloating(SEED);
    expect(r.allInRatePct).toBe(6.64);
    expect(r.allInWithCapPct! - r.allInRatePct!).toBeCloseTo(0.75, 10);
  });
});

describe("the extension", () => {
  it("allows a higher strike when the plan delivers more NOI", () => {
    const r = readFloating(SEED);
    expect(r.extensionStrikePct).toBe(4.29);
    expect(r.extensionStrikePct!).toBeGreaterThan(r.breachIndexPct!);
  });

  it("demands a lower one when it does not", () => {
    // The case that kills deals: the business plan misses, so the lender's
    // test requires a strike below today's index — a cap struck in the
    // money, which is the expensive kind.
    const r = readFloating({ ...SEED, extensionNoi: 1_400_000 });
    expect(r.extensionStrikePct).toBe(2.83);
    expect(r.extensionStrikePct!).toBeLessThan(SEED.indexPct!);
  });

  it("is not tested where no extension NOI was given", () => {
    expect(readFloating({ ...SEED, extensionNoi: null }).extensionStrikePct).toBeNull();
  });

  it("is the same solve as the breach point on the same NOI", () => {
    const r = readFloating({ ...SEED, extensionNoi: SEED.noi });
    expect(r.extensionStrikePct).toBe(r.breachIndexPct);
  });
});

describe("the note names one state, worst first", () => {
  it("leads with being through the covenant already", () => {
    // Even though this loan's cap also fails to protect, the breach is the
    // fact about now and the cap is a fact about later.
    const r = readFloating({ ...SEED, amortYears: 30 });
    expect(r.capProtects).toBe(false);
    expect(r.note).toContain("Already through the covenant");
  });

  it("mentions the floor only when nothing worse is true", () => {
    const r = readFloating({ ...SEED, indexPct: 2.5, noi: 2_000_000 });
    expect(r.capProtects).toBe(true);
    expect(r.atFloor).toBe(true);
    expect(r.note).toContain("below the floor");
  });

  it("mentions the cap paying when it is", () => {
    const r = readFloating({ ...SEED, indexPct: 5.0, noi: 2_400_000 });
    expect(r.atCap).toBe(true);
    expect(r.note).toContain("cap is paying");
  });
});

describe("the constant solver behind all of it", () => {
  it("inverts interest-only exactly", () => {
    expect(rateForConstant(0.0664, null, true)).toBeCloseTo(6.64, 10);
  });

  it("round-trips an amortising constant", () => {
    const k = loanConstant(6.5, 30, false)!;
    expect(rateForConstant(k, 30, false)).toBeCloseTo(6.5, 6);
  });

  it("refuses a constant below what a zero-rate loan already costs", () => {
    // A 30-year loan repays 1/30th of itself a year at any rate, so no rate
    // produces a constant of 2%. Answering one would be inventing a
    // negative interest rate to fit.
    const floor = loanConstant(0, 30, false)!;
    expect(floor).toBeCloseTo(1 / 30, 10);
    expect(rateForConstant(floor * 0.9, 30, false)).toBeNull();
    expect(rateForConstant(floor, 30, false)).toBeNull();
  });

  it("refuses a target no sane rate reaches", () => {
    expect(rateForConstant(5, 30, false)).toBeNull();
  });

  it("refuses a non-figure", () => {
    expect(rateForConstant(0, 30, false)).toBeNull();
    expect(rateForConstant(-1, 30, false)).toBeNull();
    expect(rateForConstant(Number.NaN, 30, false)).toBeNull();
  });
});
