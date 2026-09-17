import { describe, expect, it } from "vitest";
import {
  DEFAULT_FFE_RESERVE_PCT,
  LEVER_LIFT_PCT,
  readHotel,
  type HotelTerms,
} from "./hotel";

/**
 * A 150-key select-service hotel that out-rates its competitive set and
 * under-fills it — the position a single RevPAR index cannot see, and the
 * one where reading it wrong costs the most.
 */
const SEED: HotelTerms = {
  keys: 150,
  adr: 185,
  occupancyPct: 62,
  compAdr: 170,
  compOccupancyPct: 75,
  otherRevenuePerOccupiedRoom: 22,
  variableCostPerOccupiedRoom: 32,
  fixedOperatingCost: 2_600_000,
  franchiseRoyaltyPct: 5,
  marketingFeePct: 4,
  managementFeePct: 3,
  taxesAndInsurance: 480_000,
  ffeReservePct: 4,
  capRatePct: 8,
};

describe("readHotel — rule 1, RevPAR is two levers and they are not the same", () => {
  it("both levers reach exactly the same RevPAR", () => {
    const r = readHotel(SEED);
    expect(r.revpar).toBe(114.7);
    // 10% on either factor is 10% on the product.
    expect(r.revparAfterLift).toBe(126.17);
    expect(r.revparAfterLift! / r.revpar!).toBeCloseTo(1 + LEVER_LIFT_PCT / 100, 4);
  });

  it("and land in different places at the bottom line", () => {
    const r = readHotel(SEED);
    expect(r.noiIfRateRises).toBe(2_330_833);
    expect(r.noiIfOccupancyRises).toBe(2_291_660);
    expect(r.leverGap).toBe(39_173);
    expect(r.leverThatWins).toBe("rate");
    // Which is where it actually lands: half a million of value for the
    // same RevPAR growth.
    expect(r.leverGapValue).toBe(489_657);
  });

  it("occupancy wins where ancillary spend clears the crossing", () => {
    const r = readHotel({ ...SEED, otherRevenuePerOccupiedRoom: 40 });
    expect(r.leverThatWins).toBe("occupancy");
    expect(r.noiIfOccupancyRises).toBeGreaterThan(r.noiIfRateRises!);
  });

  it("the crossing is NOT ancillary against variable cost — the fees take a bite", () => {
    const r = readHotel(SEED);
    // $32 of housekeeping needs $34.41 of ancillary spend, because the
    // management fee (3% of TOTAL revenue) and the reserve (4%) are struck
    // on the ancillary revenue and not on the cost of earning it.
    expect(r.leverCrossingPerRoom).toBe(34.41);
    expect(r.leverCrossingPerRoom).toBeGreaterThan(SEED.variableCostPerOccupiedRoom!);
    // Fed back, the two levers land on top of each other.
    const at = readHotel({ ...SEED, otherRevenuePerOccupiedRoom: r.leverCrossingPerRoom });
    expect(Math.abs(at.leverGap!)).toBeLessThan(50);
  });

  it("and the crossing does not move with ancillary spend — it is a property of the cost", () => {
    const across = [0, 10, 22, 40, 60].map(
      (otherRevenuePerOccupiedRoom) =>
        readHotel({ ...SEED, otherRevenuePerOccupiedRoom }).leverCrossingPerRoom,
    );
    expect(new Set(across).size).toBe(1);
  });

  it("names no winner when the occupancy lift would pass 100% full", () => {
    const r = readHotel({ ...SEED, occupancyPct: 95 });
    expect(r.occupancyLiftClamped).toBe(true);
    // The two paths no longer reach the same RevPAR, so the test the
    // comparison rests on does not hold — and the figures stay.
    expect(r.leverThatWins).toBeNull();
    expect(r.noiIfOccupancyRises).not.toBeNull();
    // The index read outranks it in the note — a finding beats an
    // explanation — so the sentence itself is checked where there is no
    // comp set to report on.
    expect(
      readHotel({ ...SEED, occupancyPct: 95, compAdr: null, compOccupancyPct: null }).note,
    ).toContain("past 100% full");
  });

  it("a hotel with room to fill is compared normally", () => {
    expect(readHotel(SEED).occupancyLiftClamped).toBe(false);
  });
});

describe("readHotel — rule 2, the index says whether you are the problem", () => {
  it("takes the RevPAR index apart into its two halves", () => {
    const r = readHotel(SEED);
    expect(r.compRevpar).toBe(127.5);
    expect(r.revparIndex).toBe(90);
    expect(r.adrIndex).toBe(108.8);
    expect(r.occupancyIndex).toBe(82.7);
  });

  it("and says so: the shortfall is rooms, not rate", () => {
    const r = readHotel(SEED);
    expect(r.note).toContain("the whole shortfall is empty rooms");
    expect(r.note).toContain("cutting rate to chase the index would give away");
    // Parity at TODAY's rate, which is the honest statement of the gap.
    expect(r.occupancyForParityPct).toBe(68.9);
  });

  it("a hotel short on both levers is a positioning problem", () => {
    const r = readHotel({ ...SEED, adr: 150 });
    expect(r.adrIndex).toBe(88.2);
    expect(r.revparIndex).toBe(72.9);
    expect(r.note).toContain("positioning problem");
  });

  it("an index above 100 asks a different question", () => {
    const r = readHotel({ ...SEED, occupancyPct: 82 });
    expect(r.revparIndex).toBeGreaterThan(100);
    expect(r.note).toContain("more than its fair share");
  });

  it("no comp set, no index — and the lever sentence takes over", () => {
    const r = readHotel({ ...SEED, compAdr: null, compOccupancyPct: null });
    expect(r.revparIndex).toBeNull();
    expect(r.adrIndex).toBeNull();
    expect(r.occupancyIndex).toBeNull();
    expect(r.occupancyForParityPct).toBeNull();
    expect(r.note).toContain("Enter the comp set");
  });

  it("parity occupancy never asks for more than a full hotel", () => {
    // A comp set far ahead of a hotel whose rate is far behind cannot be
    // reached on occupancy alone; the figure clamps rather than printing
    // an impossible 140%.
    const r = readHotel({ ...SEED, adr: 90, compAdr: 200, compOccupancyPct: 80 });
    expect(r.occupancyForParityPct).toBe(100);
  });
});

describe("readHotel — rule 3, the reserve is struck on revenue and it is real cash", () => {
  it("reports both sides of it", () => {
    const r = readHotel(SEED);
    expect(r.totalRevenue).toBe(7_026_615);
    expect(r.ffeReserve).toBe(281_065);
    expect(r.noiBeforeReserve).toBe(2_084_392);
    expect(r.noi).toBe(1_803_327);
    // The displayed figures subtract to the displayed figure.
    expect(r.noiBeforeReserve! - r.ffeReserve!).toBe(r.noi);
  });

  it("and both caps, because a hotel NOI is quoted both ways", () => {
    const r = readHotel(SEED);
    // The price is set on the honest NOI; the flattering cap is what the
    // same price looks like against the figure before the reserve.
    expect(r.capPct).toBe(8);
    expect(r.capBeforeReservePct).toBe(9.25);
    expect(r.valueOfReserveOmitted).toBe(3_513_313);
    // And the identity closes: the flattering value IS the honest one plus
    // the reserve's own price at the same cap. Each of the three rounds to
    // the dollar on its own, so this is asserted within one — forcing an
    // equality here would be asserting a rounding bug (proration's rule).
    expect(
      Math.abs(r.value! + r.valueOfReserveOmitted! - r.noiBeforeReserve! / 0.08),
    ).toBeLessThanOrEqual(1);
  });

  it("defaults to 4% when the deck does not state one", () => {
    const stated = readHotel(SEED);
    const unstated = readHotel({ ...SEED, ffeReservePct: null });
    expect(DEFAULT_FFE_RESERVE_PCT).toBe(4);
    expect(unstated.ffeReserve).toBe(stated.ffeReserve);
  });

  it("a zero reserve is a stated zero, not a missing one", () => {
    const r = readHotel({ ...SEED, ffeReservePct: 0 });
    expect(r.ffeReserve).toBe(0);
    expect(r.noi).toBe(r.noiBeforeReserve);
  });
});

describe("readHotel — rule 4, three fees on two bases", () => {
  it("strikes the franchise and marketing fees on ROOMS revenue", () => {
    const r = readHotel(SEED);
    expect(r.roomsRevenue).toBe(6_279_825);
    expect(r.franchiseFee).toBe(Math.round(6_279_825 * 0.05));
    expect(r.marketingFee).toBe(Math.round(6_279_825 * 0.04));
  });

  it("and the management fee on TOTAL revenue, ancillary included", () => {
    const r = readHotel(SEED);
    expect(r.managementFee).toBe(Math.round(7_026_615 * 0.03));
    // Which is why quoting the stack as one percentage misses: it is 12.4%
    // of rooms revenue and 11.0% of total, and neither is 12%.
    expect(r.feesPctOfRoomsRevenue).toBe(12.4);
    expect(r.feesPctOfTotalRevenue).toBe(11);
  });

  it("the three add to the total", () => {
    const r = readHotel(SEED);
    expect(r.franchiseFee! + r.marketingFee! + r.managementFee!).toBe(r.totalFees);
  });

  it("ancillary revenue moves the management fee and nothing else", () => {
    const none = readHotel({ ...SEED, otherRevenuePerOccupiedRoom: 0 });
    const some = readHotel(SEED);
    expect(none.franchiseFee).toBe(some.franchiseFee);
    expect(none.marketingFee).toBe(some.marketingFee);
    expect(none.managementFee).toBeLessThan(some.managementFee!);
  });
});

describe("readHotel — the operating line", () => {
  it("runs revenue through to a value per key", () => {
    const r = readHotel(SEED);
    expect(r.roomNightsSold).toBe(33_945);
    expect(r.otherRevenue).toBe(746_790);
    expect(r.grossOperatingProfit).toBe(2_564_392);
    expect(r.gopMarginPct).toBe(36.5);
    expect(r.value).toBe(22_541_588);
    expect(r.valuePerKey).toBe(150_277);
  });

  it("no cap rate leaves it unpriced but the operations standing", () => {
    const r = readHotel({ ...SEED, capRatePct: null });
    expect(r.value).toBeNull();
    expect(r.valuePerKey).toBeNull();
    expect(r.leverGapValue).toBeNull();
    expect(r.noi).toBe(1_803_327);
    expect(r.revparIndex).toBe(90);
  });
});

describe("readHotel — refusals", () => {
  it("names the missing key count", () => {
    expect(readHotel({ ...SEED, keys: null }).note).toContain("key count");
  });

  it("names the missing rate", () => {
    expect(readHotel({ ...SEED, adr: null }).note).toContain("average daily rate");
  });

  it("refuses an occupancy outside 0–100 rather than computing one", () => {
    expect(readHotel({ ...SEED, occupancyPct: 120 }).note).toContain("between 0 and 100");
    expect(readHotel({ ...SEED, occupancyPct: 120 }).revpar).toBeNull();
    expect(readHotel({ ...SEED, occupancyPct: null }).revpar).toBeNull();
  });

  it("a blank is null, never zero", () => {
    const r = readHotel({ ...SEED, keys: null });
    expect(r.noi).toBeNull();
    expect(r.totalRevenue).toBeNull();
    expect(r.leverThatWins).toBeNull();
  });
});
