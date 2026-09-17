import { describe, expect, it } from "vitest";
import {
  impliedRate,
  readReassessment,
  type ReassessmentInputs,
} from "./tax-reassessment";

/**
 * The seeded deal, which is also what `/tools` renders: an ordinary
 * $25M building whose seller has held it long enough for the assessment
 * to fall a long way behind the market. Every figure in the memorandum
 * is true and the 6% cap is real — for the seller. The buyer gets 5.34%,
 * and the reassessment is worth $2.2M in the negotiation.
 */
const SEED: ReassessmentInputs = {
  price: 25_000_000,
  currentAssessed: 14_000_000,
  currentTax: 210_000,
  assessmentRatioPct: 100,
  taxRatePct: 1.5,
  reassessesOnSale: true,
  phaseInYears: 3,
  omNoi: 1_500_000,
};

describe("the bill after closing", () => {
  it("strikes the new assessment on the price, not on the seller's basis", () => {
    const r = readReassessment(SEED);
    expect(r.newAssessed).toBe(25_000_000);
    expect(r.newTax).toBe(375_000);
    expect(r.increase).toBe(165_000);
  });

  it("assesses at the jurisdiction's ratio when it is not full value", () => {
    // Assessed at 40% of market — the bill is 40% of what a full-value
    // reading of the same rate would say, which is the whole reason the
    // ratio is kept apart from the rate.
    const r = readReassessment({ ...SEED, assessmentRatioPct: 40 });
    expect(r.newAssessed).toBe(10_000_000);
    expect(r.newTax).toBe(150_000);
  });

  it("treats a blank ratio as full value rather than as nothing", () => {
    const r = readReassessment({ ...SEED, assessmentRatioPct: null });
    expect(r.newAssessed).toBe(25_000_000);
    expect(r.newTax).toBe(375_000);
  });

  it("derives the rate the current bill implies", () => {
    expect(impliedRate(210_000, 14_000_000)).toBe(1.5);
    expect(readReassessment(SEED).impliedRatePct).toBe(1.5);
    expect(readReassessment(SEED).rateDisagrees).toBe(false);
  });

  it("says so when the implied rate and the stated one disagree", () => {
    // A bill of $280,000 on a $14M assessment is 2%, not the 1.5% typed —
    // usually a special district, sometimes a stale assessment. Either
    // way the figure that was typed is not what is being charged.
    const r = readReassessment({ ...SEED, currentTax: 280_000 });
    expect(r.impliedRatePct).toBe(2);
    expect(r.rateDisagrees).toBe(true);
    expect(r.note).toContain("special district");
  });
});

describe("a phase-in is a deferral, not a discount", () => {
  it("steps the increase in and keeps the stabilized bill as the headline", () => {
    const r = readReassessment(SEED);
    // A third of the $165,000 increase lands in year one.
    expect(r.year1Tax).toBe(265_000);
    expect(r.newTax).toBe(375_000);
    expect(r.year1Noi).toBe(1_445_000);
    expect(r.stabilizedNoi).toBe(1_335_000);
  });

  it("puts the whole increase in year one where there is no phase-in", () => {
    const r = readReassessment({ ...SEED, phaseInYears: null });
    expect(r.year1Tax).toBe(375_000);
    expect(r.year1Noi).toBe(r.stabilizedNoi);
  });

  it("says in words that the stabilized bill is the one that prices the exit", () => {
    expect(readReassessment(SEED).note).toContain("prices the exit");
  });
});

describe("what it costs, said as a cap and as a price", () => {
  it("takes 66 basis points off the advertised cap", () => {
    const r = readReassessment(SEED);
    expect(r.omCapPct).toBe(6);
    expect(r.realCapPct).toBe(5.34);
    expect(r.capLostBps).toBe(66);
  });

  it("solves for the price at which the advertised cap is true", () => {
    expect(readReassessment(SEED).priceForOmCap).toBe(22_800_000);
    expect(readReassessment(SEED).overpayment).toBe(2_200_000);
  });

  it("and that price really does deliver the advertised cap", () => {
    // The claim the module exists to make checkable. Pay $22.8M and the
    // reassessment at THAT price still leaves a 6% cap — which is why
    // the price has to be solved rather than scaled down by the cap
    // shortfall, since a lower price lowers the tax that caused it.
    const at = readReassessment({ ...SEED, price: 22_800_000 });
    expect(at.realCapPct).toBe(6);
  });

  it("scaling instead would have overstated the discount", () => {
    // The tempting approximation: capitalise the stabilized NOI at the
    // advertised cap. $1,335,000 / 6% is $22,250,000 — $550,000 below
    // the real answer, because it charges the buyer tax on a price they
    // are no longer paying.
    const naive = 1_335_000 / 0.06;
    const solved = readReassessment(SEED).priceForOmCap!;
    expect(Math.round(naive)).toBe(22_250_000);
    expect(solved).toBeGreaterThan(naive);
  });
});

describe("a jurisdiction that does not reassess", () => {
  it("answers zero rather than nothing, because that is the answer", () => {
    const r = readReassessment({ ...SEED, reassessesOnSale: false });
    expect(r.increase).toBe(0);
    expect(r.capLostBps).toBe(0);
    expect(r.overpayment).toBe(0);
    expect(r.stabilizedNoi).toBe(1_500_000);
    expect(r.realCapPct).toBe(6);
    expect(r.priceForOmCap).toBe(25_000_000);
  });

  it("names it as a fact about the place, not about the deal", () => {
    const r = readReassessment({ ...SEED, reassessesOnSale: false });
    expect(r.note).toContain("does not reassess on transfer");
    expect(r.note).toContain("fact about the place");
  });
});

describe("the reassessment that goes the other way", () => {
  it("reports a lower bill as a lower bill", () => {
    // The seller is over-assessed relative to what you are paying — rarer
    // than the other direction, and worth catching, because it is a
    // credit the memorandum will not be advertising.
    const r = readReassessment({ ...SEED, currentTax: 500_000 });
    expect(r.increase).toBe(-125_000);
    expect(r.stabilizedNoi).toBe(1_625_000);
    expect(r.note).toContain("LOWERS the bill");
  });
});

describe("a blank is null, never zero", () => {
  it("asks for the price first", () => {
    const r = readReassessment({ ...SEED, price: null });
    expect(r.newTax).toBeNull();
    expect(r.note).toContain("price you are paying");
  });

  it("asks for the rate, and offers the one the bill implies", () => {
    const r = readReassessment({ ...SEED, taxRatePct: null });
    expect(r.newTax).toBeNull();
    expect(r.note).toContain("implies 1.5%");
  });

  it("gives the new bill before the memorandum's tax line is known", () => {
    // The bill after closing needs only the price and the rate. It is
    // the INCREASE that needs the seller's figure, so the rest answers.
    const r = readReassessment({ ...SEED, currentTax: null });
    expect(r.newTax).toBe(375_000);
    expect(r.increase).toBeNull();
    expect(r.note).toContain("current tax line");
  });

  it("gives the increase before the NOI is known", () => {
    const r = readReassessment({ ...SEED, omNoi: null });
    expect(r.increase).toBe(165_000);
    expect(r.omCapPct).toBeNull();
    expect(r.note).toContain("adds");
  });
});

describe("the numbers on the card add up", () => {
  it("derives every difference from the rounded pair", () => {
    // The debt schedule's rule. A card whose figures do not reconcile
    // reads as broken whatever the arithmetic behind it.
    const r = readReassessment(SEED);
    expect(r.newTax! - r.increase!).toBe(210_000);
    expect(r.omCapPct! - r.realCapPct!).toBeCloseTo(r.capLostBps! / 100, 10);
    expect(r.priceForOmCap! + r.overpayment!).toBe(25_000_000);
  });
});
