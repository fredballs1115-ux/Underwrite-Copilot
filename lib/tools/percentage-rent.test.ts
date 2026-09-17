import { describe, expect, it } from "vitest";
import {
  naturalBreakpoint,
  readPercentageRent,
  type PercentageRentTerms,
} from "./percentage-rent";

/**
 * The seeded tenant, which is also what `/tools` renders: a seasonal
 * retailer in 3,000 SF at $40 a foot on a 6% lease. Its year lands just
 * UNDER the natural breakpoint, so the percentage rent owed is nothing —
 * and two months of Christmas blow straight through a twelfth of it. That
 * is the whole card: a lease that owes zero on the year collects $22,300
 * if it is billed monthly and never reconciled.
 */
const SEED: PercentageRentTerms = {
  baseRent: 120_000,
  ratePct: 6,
  statedBreakpoint: null,
  monthlySales: [
    90_000, 85_000, 110_000, 120_000, 130_000, 140_000,
    135_000, 130_000, 125_000, 150_000, 280_000, 425_000,
  ],
  recoveries: 58_000,
  tenantSf: 3_000,
  healthyCeilingPct: 10,
};

describe("the breakpoint", () => {
  it("derives it from the base rent and the rate", () => {
    // $120,000 at 6% is $2,000,000 of sales — the level at which the
    // percentage rent would equal the base rent, which is what makes it
    // the natural place for the landlord to start participating.
    expect(naturalBreakpoint(120_000, 6)).toBe(2_000_000);
    expect(readPercentageRent(SEED).naturalBreakpoint).toBe(2_000_000);
  });

  it("uses the natural one when the lease states none", () => {
    const r = readPercentageRent(SEED);
    expect(r.breakpointUsed).toBe(2_000_000);
    expect(r.artificial).toBe(false);
    expect(r.favours).toBe("neither");
  });

  it("names a stated breakpoint below natural as the landlord's", () => {
    // Participation starts sooner. On this tenant it turns a year owing
    // nothing into one owing $25,200.
    const r = readPercentageRent({ ...SEED, statedBreakpoint: 1_500_000 });
    expect(r.artificial).toBe(true);
    expect(r.favours).toBe("landlord");
    expect(r.overage).toBe(420_000);
    expect(r.percentageRent).toBe(25_200);
  });

  it("names one above natural as the tenant's", () => {
    const r = readPercentageRent({ ...SEED, statedBreakpoint: 2_500_000 });
    expect(r.artificial).toBe(true);
    expect(r.favours).toBe("tenant");
    expect(r.percentageRent).toBe(0);
  });

  it("does not call the natural breakpoint written down an artificial one", () => {
    const r = readPercentageRent({ ...SEED, statedBreakpoint: 2_000_000 });
    expect(r.artificial).toBe(false);
    expect(r.favours).toBe("neither");
  });

  it("refuses to guess a breakpoint with no rate to derive it from", () => {
    const r = readPercentageRent({ ...SEED, ratePct: null });
    expect(r.naturalBreakpoint).toBeNull();
    expect(r.note).toContain("no breakpoint to derive");
  });
});

describe("the year-end true-up", () => {
  it("owes nothing on a year that lands under the breakpoint", () => {
    const r = readPercentageRent(SEED);
    expect(r.annualSales).toBe(1_920_000);
    expect(r.overage).toBe(0);
    expect(r.percentageRent).toBe(0);
  });

  it("but collects $22,300 billed monthly with no reconciliation", () => {
    // November and December each breach a twelfth of $2M ($166,666.67);
    // the ten months below it give nothing back, because each month
    // stands alone. That asymmetry IS the missing true-up.
    const r = readPercentageRent(SEED);
    expect(r.monthsOver).toBe(2);
    expect(r.monthlyBasisRent).toBe(22_300);
    expect(r.trueUpOwed).toBe(22_300);
  });

  it("says so in words, because no single month's statement shows it", () => {
    expect(readPercentageRent(SEED).note).toContain("no year-end true-up");
  });

  it("costs a flat tenant nothing, which is why it goes unnoticed", () => {
    // The same lease, the same annual sales, spread evenly: no month
    // breaches, so the monthly basis and the annual one agree exactly.
    // A landlord billing this way looks correct until a seasonal tenant
    // signs.
    const flat = readPercentageRent({
      ...SEED,
      monthlySales: Array(12).fill(160_000),
    });
    expect(flat.annualSales).toBe(1_920_000);
    expect(flat.monthsOver).toBe(0);
    expect(flat.monthlyBasisRent).toBe(0);
    expect(flat.trueUpOwed).toBe(0);
    expect(flat.note).toContain("below the breakpoint");
  });

  it("never reports a true-up the tenant is owed", () => {
    // Over the breakpoint on the year, the annual figure is the larger
    // one and the monthly basis cannot exceed it — every month that
    // contributed is already counted in the annual overage.
    const r = readPercentageRent({
      ...SEED,
      monthlySales: Array(12).fill(300_000),
    });
    expect(r.annualSales).toBe(3_600_000);
    expect(r.percentageRent).toBe(96_000);
    expect(r.trueUpOwed).toBeLessThanOrEqual(0);
  });
});

describe("occupancy cost", () => {
  it("counts base, percentage and the recoveries against sales", () => {
    const r = readPercentageRent(SEED);
    expect(r.totalOccupancyCost).toBe(178_000);
    expect(r.occupancyCostPct).toBe(9.27);
  });

  it("says the rent per foot both ways", () => {
    const r = readPercentageRent(SEED);
    expect(r.baseRentPsf).toBe(40);
    expect(r.allInPsf).toBe(59.33);
  });

  it("solves for the sales that reach the ceiling, not a ratio of them", () => {
    // Below the breakpoint the cost is flat, so it is the simple ratio:
    // $178,000 at 10% is $1.78M, which this tenant has already passed.
    expect(readPercentageRent(SEED).salesToClearCeiling).toBe(1_780_000);
  });

  it("accounts for percentage rent when the ceiling sits past the breakpoint", () => {
    // At an 8% ceiling the answer is above $2M, where every further
    // dollar of sales brings 6c of rent with it. Treating the cost as
    // flat would say $2,225,000; the real answer is $2,900,000, and a
    // test pins the ratio there at exactly 8%.
    const r = readPercentageRent({ ...SEED, healthyCeilingPct: 8 });
    expect(r.salesToClearCeiling).toBe(2_900_000);
    const at = readPercentageRent({
      ...SEED,
      healthyCeilingPct: 8,
      monthlySales: Array(12).fill(2_900_000 / 12),
    });
    expect(at.occupancyCostPct).toBe(8);
  });

  it("answers null for a ceiling the lease can never reach", () => {
    // A 5% ceiling on a 6% lease: above the breakpoint the ratio falls
    // toward 6% and stops. There is no sales figure that gets there, and
    // printing one would be a lie.
    expect(readPercentageRent({ ...SEED, healthyCeilingPct: 5 }).salesToClearCeiling).toBeNull();
  });
});

describe("a blank is null, never zero", () => {
  it("asks for the base rent first", () => {
    const r = readPercentageRent({ ...SEED, baseRent: null });
    expect(r.naturalBreakpoint).toBeNull();
    expect(r.note).toContain("annual base rent");
  });

  it("answers the breakpoint before any sales are pasted", () => {
    // A breakpoint is a property of the lease, not of the year — useful
    // on its own, and the figure a reader most often came for.
    const r = readPercentageRent({ ...SEED, monthlySales: [] });
    expect(r.naturalBreakpoint).toBe(2_000_000);
    expect(r.breakpointUsed).toBe(2_000_000);
    expect(r.annualSales).toBeNull();
    expect(r.note).toContain("month by month");
  });

  it("says when the year is short rather than annualising it", () => {
    const r = readPercentageRent({ ...SEED, monthlySales: SEED.monthlySales.slice(0, 9) });
    expect(r.note).toContain("9 months of sales, not twelve");
    // And it does NOT scale up to a year — the figures cover what was
    // pasted, which the note says plainly.
    expect(r.annualSales).toBe(1_065_000);
  });

  it("treats unstated recoveries as none rather than as unknown", () => {
    const r = readPercentageRent({ ...SEED, recoveries: null });
    expect(r.totalOccupancyCost).toBe(120_000);
  });

  it("says the rent per foot only when the area is known", () => {
    const r = readPercentageRent({ ...SEED, tenantSf: null });
    expect(r.baseRentPsf).toBeNull();
    expect(r.allInPsf).toBeNull();
    // Everything that does not need the area still answers.
    expect(r.occupancyCostPct).toBe(9.27);
  });
});
