import { describe, it, expect } from "vitest";
import { readInsurance, type InsuranceInput } from "@/lib/tools/insurance";

/**
 * A 240-unit Florida apartment, 260,000 feet, $52M to rebuild. The
 * memorandum carries the seller's expiring premium of $420,000 — $1,750 a
 * unit — and the buyer's broker comes back at $780,000.
 *
 * Nothing in the memorandum is false. It is describing someone else's
 * policy.
 */
const SEED: InsuranceInput = {
  sellerPremium: 420_000,
  quotedPremium: 780_000,
  statedNoi: 2_900_000,
  advertisedCapPct: 5.25,
  buildingSf: 260_000,
  units: 240,
  insuredValue: 52_000_000,
  namedStormDeductiblePct: 5,
  alternativeDeductiblePct: 10,
  alternativePremium: 620_000,
};

const run = (over: Partial<InsuranceInput> = {}) => readInsurance({ ...SEED, ...over });

describe("rule 1 — the premium in the memorandum is not yours", () => {
  it("says both premiums in the units a broker quotes them in", () => {
    const r = run();
    expect(r.sellerPerUnit).toBe(1_750);
    expect(r.quotedPerUnit).toBe(3_250);
    expect(r.sellerPerSf).toBe(1.62);
    expect(r.quotedPerSf).toBe(3);
  });

  it("names the gap and the multiple", () => {
    const r = run();
    expect(r.premiumGap).toBe(360_000);
    expect(r.premiumMultiple).toBe(1.86);
  });

  it("takes the whole gap out of the NOI, because insurance is fixed", () => {
    // It does not scale away with occupancy and it is not managed down.
    const r = run();
    expect(r.adjustedNoi).toBe(2_540_000);
    expect(SEED.statedNoi! - r.adjustedNoi!).toBe(r.premiumGap);
  });

  it("reports a quote that comes in UNDER the expiring premium as one", () => {
    const r = run({ quotedPremium: 380_000 });
    expect(r.premiumGap).toBe(-40_000);
    expect(r.adjustedNoi!).toBeGreaterThan(SEED.statedNoi!);
    expect(r.capGapBps).toBe(-7);
  });
});

describe("rule 2 — the cap rate capitalises it", () => {
  it("charges the real premium against the memorandum's own price", () => {
    const r = run();
    expect(r.advertisedPrice).toBe(55_238_095);
    expect(r.adjustedCapPct).toBe(4.6);
    expect(r.capGapBps).toBe(65);
  });

  it("says the gap as a price", () => {
    // $360,000 a year at the advertised 5.25% is $6,857,143 — which is the
    // number to argue about, and the one nobody prints.
    expect(run().valueOfGap).toBe(6_857_143);
  });

  it("scales the price with the cap, not with the premium alone", () => {
    // The same gap is worth more at a tighter cap, which is the whole point
    // of capitalising it rather than quoting it.
    expect(run({ advertisedCapPct: 4 }).valueOfGap!).toBeGreaterThan(run().valueOfGap!);
  });

  it("withholds the price without an NOI and a cap to work from", () => {
    const r = run({ statedNoi: null, advertisedCapPct: null });
    expect(r.advertisedPrice).toBeNull();
    expect(r.adjustedCapPct).toBeNull();
    expect(r.valueOfGap).toBeNull();
    // …and still answers the half it can.
    expect(r.premiumMultiple).toBe(1.86);
    expect(r.note).toContain("Enter the NOI and the cap");
  });
});

describe("rule 3 — a named-storm deductible is a percentage", () => {
  it("strikes it against the insured value, never the price", () => {
    // 5% of $52,000,000 of replacement cost. Struck on a $55.2M purchase
    // price it would be a different and wronger number.
    const r = run();
    expect(r.namedStormDeductible).toBe(2_600_000);
    expect(r.namedStormDeductible).not.toBe(Math.round(r.advertisedPrice! * 0.05));
  });

  it("says it as years of NOI, which is the figure nobody writes down", () => {
    // Nine tenths of a year's income retained per event, before the policy
    // pays anything. No replacement reserve covers that.
    const r = run();
    expect(r.deductibleYearsOfNoi).toBe(0.9);
    expect(r.note).toBe(
      "One named-storm event retains 0.9 years of NOI before the policy pays anything.",
    );
  });

  it("leads with the deductible even where the premium came in fine", () => {
    // The premium is the figure people argue about; this is the one that
    // takes the building, and it is true whatever the quote did.
    const r = run({ quotedPremium: 380_000 });
    expect(r.note).toContain("One named-storm event retains");
  });

  it("says nothing about a deductible that was not described", () => {
    const r = run({ insuredValue: null, namedStormDeductiblePct: null });
    expect(r.namedStormDeductible).toBeNull();
    expect(r.deductibleYearsOfNoi).toBeNull();
    expect(r.note).toContain("65bp of the advertised cap");
  });
});

describe("rule 4 — raising the deductible is a priceable trade", () => {
  it("prices the annual saving against the per-event risk", () => {
    const r = run();
    expect(r.alternativeSaving).toBe(160_000);
    expect(r.alternativeExtraRisk).toBe(2_600_000);
  });

  it("answers the frequency at which the two meet", () => {
    // Doubling the deductible pays only if a named-storm loss arrives less
    // often than once every 16.3 years.
    expect(run().breakEvenYearsBetweenEvents).toBe(16.3);
  });

  it("takes longer to pay the smaller the saving is", () => {
    expect(run({ alternativePremium: 740_000 }).breakEvenYearsBetweenEvents).toBe(65);
    expect(run({ alternativePremium: 500_000 }).breakEvenYearsBetweenEvents).toBe(9.3);
  });

  it("refuses the question when the alternative is a LOWER deductible", () => {
    // That is the opposite trade — more premium for less retained risk —
    // and the break-even frequency is not what answers it.
    const r = run({ alternativeDeductiblePct: 3, alternativePremium: 900_000 });
    expect(r.alternativeSaving!).toBeLessThan(0);
    expect(r.alternativeExtraRisk!).toBeLessThan(0);
    expect(r.breakEvenYearsBetweenEvents).toBeNull();
  });

  it("says nothing about an alternative that was not described", () => {
    const r = run({ alternativeDeductiblePct: null, alternativePremium: null });
    expect(r.alternativeSaving).toBeNull();
    expect(r.breakEvenYearsBetweenEvents).toBeNull();
    // …and the rest of the card still answers.
    expect(r.namedStormDeductible).toBe(2_600_000);
  });
});

describe("what it refuses", () => {
  it("answers with a prompt without both premiums", () => {
    expect(run({ sellerPremium: 0 }).premiumGap).toBeNull();
    expect(run({ quotedPremium: 0 }).note).toContain("the premium you have been quoted");
  });

  it("withholds a per-unit or per-foot figure it was not given the divisor for", () => {
    const r = run({ units: null, buildingSf: null });
    expect(r.sellerPerUnit).toBeNull();
    expect(r.quotedPerSf).toBeNull();
    expect(r.premiumGap).toBe(360_000);
  });

  it("says the expense line stands when the quote matches", () => {
    const r = run({ quotedPremium: 420_000, insuredValue: null, namedStormDeductiblePct: null });
    expect(r.premiumGap).toBe(0);
    expect(r.capGapBps).toBe(0);
    expect(r.note).toContain("the memorandum's expense line stands");
  });
});
