import { describe, expect, it } from "vitest";
import {
  SHORTER_STAY_PCT,
  breakEvenMoveOut,
  readStorage,
  type StorageTerms,
} from "./storage-ecri";

/**
 * A 650-unit facility, 585 let, averaging $135 a month against a $105
 * street rate — the gap a decade of increases builds, and the thing the
 * next increase is traded against.
 */
const SEED: StorageTerms = {
  occupiedUnits: 585,
  inPlaceRent: 135,
  streetRent: 105,
  ecriPct: 10,
  ecriReachPct: 70,
  moveOutPct: 5,
  downtimeMonths: 1,
  averageStayMonths: 11,
  freeMonths: 1,
  flowThroughPct: 90,
  capRatePct: 5.75,
  streetGrowthPct: 2,
  yearsAhead: 5,
  unitOccupancyPct: 90,
  sfOccupancyPct: 86,
};

describe("readStorage — rule 1, the trade has a closed form", () => {
  it("breaks even at a 25.8% move-out against the 5% assumed", () => {
    const r = readStorage(SEED);
    expect(r.breakEvenMoveOutPct).toBe(25.8);
    expect(r.headroomPts).toBe(20.8);
    expect(r.note).toContain("20.8 points of room");
  });

  it("and the increase pays $53,501 of revenue, $837,410 of value", () => {
    const r = readStorage(SEED);
    expect(r.revenueBefore).toBe(947_700);
    expect(r.revenueAfter).toBe(1_001_201);
    expect(r.revenueGain).toBe(53_501);
    expect(r.revenueGainPct).toBe(5.6);
    expect(r.noiGain).toBe(48_151);
    expect(r.valueOfIncrease).toBe(837_410);
  });

  it("the REACH cancels out of the break-even and scales only the gain", () => {
    // Raising half the book and raising all of it break even at the same
    // move-out rate, because both sides of the trade scale with the reach.
    const across = [30, 50, 70, 100].map((ecriReachPct) =>
      readStorage({ ...SEED, ecriReachPct }),
    );
    expect(new Set(across.map((r) => r.breakEvenMoveOutPct)).size).toBe(1);
    const gains = across.map((r) => r.revenueGain!);
    for (let i = 1; i < gains.length; i += 1) expect(gains[i]).toBeGreaterThan(gains[i - 1]);
  });

  it("fed the break-even move-out, the increase earns exactly nothing", () => {
    const base = readStorage(SEED);
    const at = readStorage({ ...SEED, moveOutPct: base.breakEvenMoveOutPct });
    // The rate is printed to a tenth, so the residue is a rounding one.
    expect(Math.abs(at.revenueGain!)).toBeLessThan(600);
    expect(at.headroomPts).toBe(0);
  });

  it("past it, the increase costs revenue and says so", () => {
    const r = readStorage({ ...SEED, moveOutPct: 35 });
    expect(r.revenueGain).toBeLessThan(0);
    expect(r.headroomPts).toBeLessThan(0);
    expect(r.note).toContain("costs revenue rather than earning it");
  });

  it("a street rate above the in-place rent is no trade at all, not a figure", () => {
    // Before the guard this printed a 736.4% break-even, which reads as a
    // number and is not one: a facility cannot lose more tenants than it has.
    expect(breakEvenMoveOut(10, 135, 160, 1)).toBeNull();
    const r = readStorage({ ...SEED, streetRent: 160 });
    expect(r.breakEvenMoveOutPct).toBeNull();
    expect(r.note).toContain("there is no trade to make");
  });
});

describe("readStorage — rule 2, the increase eats its own runway", () => {
  it("each year's break-even is lower than the last", () => {
    const r = readStorage(SEED);
    const by = r.schedule.map((y) => y.breakEvenMoveOutPct!);
    expect(by).toEqual([25.8, 24.2, 22.9, 21.7, 20.7]);
    for (let i = 1; i < by.length; i += 1) expect(by[i]).toBeLessThan(by[i - 1]);
    // Over the seed's five years; the eight-year run below is 7.3.
    expect(r.breakEvenDecayPts).toBe(5.1);
    // The decay IS the two ends' difference, rounded once as the card
    // prints it — asserted on the rounded pair, because 25.8 − 20.7 is
    // 5.100000000000001 in binary floating point and the module is right
    // to round it.
    expect(r.breakEvenDecayPts).toBeCloseTo(by[0] - by[by.length - 1], 6);
  });

  it("because the gap it is traded against widens every year", () => {
    const gaps = readStorage(SEED).schedule.map((y) => y.rateGapPct);
    expect(gaps).toEqual([28.6, 33.5, 38.4, 43.4, 48.4]);
  });

  it("and how fast is a RACE with the street rate, computed not asserted", () => {
    const decay = (streetGrowthPct: number) =>
      readStorage({ ...SEED, streetGrowthPct, yearsAhead: 8 }).breakEvenDecayPts!;
    // A flat street rate closes the runway more than twice as fast as one
    // growing 4% — which is why this is run rather than claimed.
    expect(decay(0)).toBe(9.4);
    expect(decay(2)).toBe(7.3);
    expect(decay(4)).toBe(4.3);
    expect(decay(0)).toBeGreaterThan(decay(4));
  });

  it("the run is capped rather than unbounded", () => {
    expect(readStorage({ ...SEED, yearsAhead: 50 }).schedule.length).toBe(20);
    expect(readStorage({ ...SEED, yearsAhead: null }).schedule.length).toBe(5);
  });
});

describe("readStorage — rule 3, street and in-place are two numbers", () => {
  it("names the gap between them", () => {
    const r = readStorage(SEED);
    expect(r.rateGapPct).toBe(28.6);
  });

  it("and prices the case nobody models: every tenant at today's ask", () => {
    const r = readStorage(SEED);
    expect(r.revenueAtStreet).toBe(737_100);
    expect(r.streetDownside).toBe(-210_600);
    // 22% of revenue, on a facility whose rent roll looks perfectly healthy.
    expect(Math.abs(r.streetDownside! / r.revenueBefore!)).toBeGreaterThan(0.2);
  });
});

describe("readStorage — rule 4, a free month costs what the tenancy is", () => {
  it("one month out of eleven is 9.1%, and a quarter shorter is 12.1%", () => {
    const r = readStorage(SEED);
    expect(SHORTER_STAY_PCT).toBe(25);
    expect(r.concessionCostPct).toBe(9.1);
    expect(r.concessionCostIfShortStayPct).toBe(12.1);
  });

  it("the same offer is three times dearer in a short-stay market", () => {
    const short = readStorage({ ...SEED, averageStayMonths: 8 }).concessionCostPct!;
    const long = readStorage({ ...SEED, averageStayMonths: 24 }).concessionCostPct!;
    expect(short).toBe(12.5);
    expect(long).toBe(4.2);
    expect(short / long).toBeGreaterThan(2.9);
  });

  it("no stay given, no concession figure — never a guessed one", () => {
    const r = readStorage({ ...SEED, averageStayMonths: null });
    expect(r.concessionCostPct).toBeNull();
    expect(r.concessionCostIfShortStayPct).toBeNull();
  });

  it("no free month is no cost, not a default one", () => {
    expect(readStorage({ ...SEED, freeMonths: 0 }).concessionCostPct).toBe(0);
  });
});

describe("readStorage — the two occupancies an OM quotes", () => {
  it("names the gap, because small units fill first", () => {
    expect(readStorage(SEED).occupancyGapPts).toBe(4);
  });

  it("and reports none where only one is given", () => {
    expect(readStorage({ ...SEED, sfOccupancyPct: null }).occupancyGapPts).toBeNull();
  });
});

describe("readStorage — refusals", () => {
  it("names the missing unit count", () => {
    expect(readStorage({ ...SEED, occupiedUnits: null }).note).toContain("how many units");
  });

  it("names the missing in-place rent", () => {
    expect(readStorage({ ...SEED, inPlaceRent: null }).note).toContain("sitting tenant pays");
  });

  it("names the missing street rate — the input the whole card turns on", () => {
    expect(readStorage({ ...SEED, streetRent: null }).note).toContain("street rate");
    expect(readStorage({ ...SEED, streetRent: null }).breakEvenMoveOutPct).toBeNull();
  });

  it("names the missing increase", () => {
    expect(readStorage({ ...SEED, ecriPct: null }).note).toContain("the increase");
  });

  it("a blank is null, never zero", () => {
    const r = readStorage({ ...SEED, occupiedUnits: null });
    expect(r.revenueBefore).toBeNull();
    expect(r.valueOfIncrease).toBeNull();
    expect(r.schedule).toEqual([]);
  });

  it("an unstated reach raises the whole book rather than none of it", () => {
    const all = readStorage({ ...SEED, ecriReachPct: null });
    const full = readStorage({ ...SEED, ecriReachPct: 100 });
    expect(all.revenueGain).toBe(full.revenueGain);
  });
});
