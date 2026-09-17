import { describe, it, expect } from "vitest";
import { readLeaseUp, MAX_MONTHS, COMPARE_MONTH, type LeaseUpInput } from "@/lib/tools/lease-up";

/**
 * A 120,000-foot flex building delivering 20% pre-leased, underwritten to
 * 92%, at 4,000 feet a month and $34 — with six months free on every lease,
 * $83 a foot of allowance and commission, and $11 of operating expense of
 * which two thirds runs whether or not anyone is in the building.
 *
 * Every figure here is ordinary. What is not ordinary is where the money
 * goes, which is the whole point.
 */
const SEED: LeaseUpInput = {
  buildingSf: 120_000,
  preLeasedSf: 24_000,
  stabilizedOccupancyPct: 92,
  absorptionSfPerMonth: 4_000,
  rentPerSf: 34,
  freeRentMonths: 6,
  tiPerSf: 65,
  lcPerSf: 18,
  opexPerSf: 11,
  fixedOpexSharePct: 65,
  monthlyDebtService: null,
  maxMonths: 60,
};

const run = (over: Partial<LeaseUpInput> = {}) => readLeaseUp({ ...SEED, ...over });

describe("rule 4 — the trough is not at delivery", () => {
  it("is deep into a lease-up that is going well", () => {
    // Month 22 is the month the building FILLS. That is when the cash need
    // is worst, because the allowance and the commission are due at signing
    // and the rent they buy is six months behind.
    const r = run();
    expect(r.peakFundingMonth).toBe(22);
    expect(r.peakFunding).toBe(6_200_437);
    expect(r.monthsToStabilize).toBe(22);
  });

  it("says it, because the month is the surprising part", () => {
    expect(run().note).toBe(
      "The worst month is 22, not month one: $6,200,437 of cash out before the building carries itself.",
    );
  });

  it("is deeper than the leasing capital alone, and shallower than its total", () => {
    // The trough is not just the TI and LC — the operating expense on empty
    // space adds to it — but it is less than their sum, because rent from
    // the early leases is arriving while the later ones are still signing.
    const r = run();
    expect(r.totalLeasingCapital).toBe(7_171_200);
    expect(r.peakFunding!).toBeLessThan(r.totalLeasingCapital!);
    expect(r.peakFunding!).toBeGreaterThan(r.totalLeasingCapital! * 0.8);
  });

  it("names the month it stops bleeding, and the month the cash comes back", () => {
    const r = run();
    expect(r.breakEvenMonth).toBe(23);
    expect(r.paybackMonth).toBe(53);
    // Two and a half years between the two, which is the shape of the curve.
    expect(r.paybackMonth! - r.breakEvenMonth!).toBe(30);
  });

  it("needs no funding at all when the building was leased before it was built", () => {
    const r = run({ preLeasedSf: 110_400, freeRentMonths: 0, tiPerSf: 0, lcPerSf: 0 });
    expect(r.peakFunding).toBe(0);
    expect(r.peakFundingMonth).toBeNull();
    expect(r.note).toContain("leased before it was built");
  });
});

describe("rule 1 — a slower lease-up does not show up in the reserve", () => {
  it("makes the trough SHALLOWER, which is the trap", () => {
    // The finding this module exists for. Slipping six months spends the
    // leasing capital slower, so the worst month is $525,648 BETTER. A
    // sponsor stress-testing absorption against the lease-up reserve sees
    // the reserve hold and concludes the slippage is survivable.
    const r = run();
    expect(r.peakIfSixMonthsSlower).toBe(5_674_789);
    expect(r.peakIfSixMonthsSlower!).toBeLessThan(r.peakFunding!);
  });

  it("and costs real money, which only a common date shows", () => {
    const r = run();
    expect(r.compareMonth).toBe(36);
    expect(r.cumulativeAtCompare).toBe(-3_465_450);
    expect(r.cumulativeIfSixMonthsSlower).toBe(-4_158_892);
    expect(r.cumulativeAtCompare! - r.cumulativeIfSixMonthsSlower!).toBe(693_442);
  });

  it("costs more than the rent miss everyone argues about instead", () => {
    // $693,442 against $363,460 — the slippage is 1.9x the 5% rent haircut,
    // on the same building, read at the same date.
    const r = run();
    expect(r.cumulativeIfRentFivePctLower).toBe(-3_828_910);
    const slip = r.cumulativeAtCompare! - r.cumulativeIfSixMonthsSlower!;
    const rent = r.cumulativeAtCompare! - r.cumulativeIfRentFivePctLower!;
    expect(slip).toBeGreaterThan(rent * 1.5);
  });

  it("reads both shocks at the same month, never at their own", () => {
    // Comparing each schedule at its own stabilization month compares two
    // different dates and says nothing about either.
    const r = run();
    expect(r.compareMonth).toBe(COMPARE_MONTH);
    expect(run({ maxMonths: 24 }).compareMonth).toBe(24);
    expect(run({ maxMonths: 24 }).cumulativeIfSixMonthsSlower).not.toBeNull();
  });

  it("reports the position signed, so a paid-back schedule is not printed as zero", () => {
    const r = run({ preLeasedSf: 110_400, freeRentMonths: 0, tiPerSf: 0, lcPerSf: 0 });
    expect(r.cumulativeAtCompare!).toBeGreaterThan(0);
  });
});

describe("rule 2 — an empty building still costs money to own", () => {
  it("runs the expense from delivery, not from stabilization", () => {
    // Month one: nothing is leased but 23% of the space, and the building
    // is already paying.
    const r = run();
    expect(r.months[0].opex).toBe(80_483);
    expect(r.months[0].occupancyPct).toBe(23.3);
  });

  it("prices what leaving it out would have hidden", () => {
    // $2,016,437 of the trough is operating expense — a third of it.
    const r = run();
    const noOpex = run({ opexPerSf: 0 });
    expect(r.peakFunding! - noOpex.peakFunding!).toBe(2_016_437);
  });

  it("splits it, so the fixed share runs on empty space and the rest does not", () => {
    // Treating the whole expense as variable understates the trough by
    // $656,370, which is the part that runs whatever the occupancy.
    const r = run();
    const allVariable = run({ fixedOpexSharePct: 0 });
    expect(allVariable.peakFunding).toBe(5_544_067);
    expect(r.peakFunding! - allVariable.peakFunding!).toBe(656_370);
  });

  it("charges the variable share against space OCCUPIED, not space paying", () => {
    // A tenant inside its free-rent period is still running the lights.
    const r = run();
    const m = r.months[0];
    expect(m.leasedSf).toBeGreaterThan(m.payingSf);
    expect(m.opex).toBeGreaterThan(Math.round(((120_000 * 11) / 12) * 0.65));
  });
});

describe("rule 3 — leased is not paying", () => {
  it("answers both dates, six months apart", () => {
    const r = run();
    expect(r.monthsToStabilize).toBe(22);
    expect(r.monthsToFullPay).toBe(28);
    expect(r.freeRentLagMonths).toBe(6);
  });

  it("collapses to one date when nothing is free", () => {
    const r = run({ freeRentMonths: 0 });
    expect(r.monthsToStabilize).toBe(r.monthsToFullPay);
    expect(r.freeRentLagMonths).toBe(0);
  });

  it("prices the concession — it is most of a million and a half of trough", () => {
    const r = run();
    const noFree = run({ freeRentMonths: 0 });
    expect(noFree.peakFunding).toBe(4_885_650);
    expect(r.peakFunding! - noFree.peakFunding!).toBe(1_314_787);
  });

  it("pays pre-leased space from month one", () => {
    // A tenant already in occupancy at delivery burned its free rent during
    // construction; dating it from the certificate of occupancy would charge
    // the project twice for the same concession.
    const r = run();
    expect(r.months[0].payingSf).toBe(24_000);
    expect(r.months[0].revenue).toBe(Math.round((24_000 * 34) / 12));
  });
});

describe("the schedule", () => {
  it("stops signing once the plan's occupancy is reached", () => {
    const r = run();
    const after = r.months.filter((m) => m.month > 22);
    expect(after.every((m) => m.leasedSf === 110_400)).toBe(true);
    expect(after.every((m) => m.leasingCapital === 0)).toBe(true);
  });

  it("holds the target to the stabilized occupancy, not to the building", () => {
    expect(run().targetSf).toBe(110_400);
    expect(run({ stabilizedOccupancyPct: 100 }).targetSf).toBe(120_000);
  });

  it("carries a funded loan's debt service when one is given", () => {
    const r = run({ monthlyDebtService: 60_000 });
    expect(r.months[0].debtService).toBe(60_000);
    expect(r.peakFunding!).toBeGreaterThan(run().peakFunding!);
  });

  it("is unlevered by default, because the construction loan funds its own", () => {
    expect(run().months[0].debtService).toBe(0);
  });

  it("states the NOI the plan is underwritten to", () => {
    expect(run().stabilizedNoi).toBe(2_470_560);
  });
});

describe("what it refuses", () => {
  it("answers with a prompt without a size, a pace or a rent", () => {
    expect(run({ buildingSf: 0 }).months).toEqual([]);
    expect(run({ absorptionSfPerMonth: 0 }).note).toContain("how fast the space leases");
    expect(run({ rentPerSf: 0 }).months).toEqual([]);
  });

  it("says a building does not fill rather than pretending it does", () => {
    const r = run({ absorptionSfPerMonth: 100 });
    expect(r.monthsToStabilize).toBeNull();
    expect(r.note).toContain("does not fill within 60 months");
    // …and the slippage shock is withheld, since there is no pace to slip.
    expect(r.peakIfSixMonthsSlower).toBeNull();
  });

  it("never runs past the limit", () => {
    expect(run({ maxMonths: 200 }).months).toHaveLength(MAX_MONTHS);
    expect(MAX_MONTHS).toBe(60);
  });

  it("treats pre-leasing beyond the target as fully pre-leased", () => {
    const r = run({ preLeasedSf: 200_000 });
    expect(r.monthsToStabilize).toBe(1);
    expect(r.months[0].leasedSf).toBe(110_400);
  });

  it("counts a month in singular", () => {
    // "fills in 1 months" is the kind of thing that makes a page look
    // generated, and the probe found it.
    const r = run({ preLeasedSf: 110_400, freeRentMonths: 0, tiPerSf: 0, lcPerSf: 0 });
    expect(r.note).toContain("fills in 1 month and");
    expect(r.note).not.toContain("1 months");
  });
});
