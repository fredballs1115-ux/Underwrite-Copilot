import { describe, expect, it } from "vitest";
import {
  analyzeRentRoll,
  blendedRolloverCostPsf,
  computeWalt,
  concentrationFlags,
  leaseUpCurve,
  markToMarket,
  rolloverCostForecast,
  rolloverSchedule,
  yearsTo,
} from "./analytics";
import { parseCsv, suggestMapping, toLeases } from "./parse";
import { PROFILE_DEFAULTS, normalizeProfile } from "./profiles";
import { CLEAN_CSV, MISSING_EXPIRIES_CSV, fortyTenantCsv } from "./__fixtures__";
import type { Lease } from "./schema";

const leasesFrom = (csv: string): Lease[] => {
  const grid = parseCsv(csv);
  return toLeases(grid, suggestMapping(grid)).leases;
};

const CLEAN = leasesFrom(CLEAN_CSV);
const AS_OF = "2026-01-01";
const DAYS_PER_YEAR = 365.25;

describe("computeWalt", () => {
  /**
   * Day counts from 2026-01-01, worked out by hand:
   *   Ardent      → 2027-12-31 = 365 + 364        = 729 days
   *   Copperline  → 2026-06-30 = day-of-year 181−1 = 180 days
   *   Marrow      → 2029-02-28 = 365+365+366 + 58 = 1154 days
   */
  const DAYS = { ardent: 729, copperline: 180, marrow: 1154 };

  it("matches the hand-computed day counts", () => {
    expect(yearsTo("2027-12-31", AS_OF)).toBeCloseTo(DAYS.ardent / DAYS_PER_YEAR, 12);
    expect(yearsTo("2026-06-30", AS_OF)).toBeCloseTo(DAYS.copperline / DAYS_PER_YEAR, 12);
    expect(yearsTo("2029-02-28", AS_OF)).toBeCloseTo(DAYS.marrow / DAYS_PER_YEAR, 12);
  });

  it("weights by SF over occupied space only", () => {
    const walt = computeWalt(CLEAN, AS_OF);
    const expected =
      (40_000 * DAYS.ardent + 25_000 * DAYS.copperline + 20_000 * DAYS.marrow) /
      DAYS_PER_YEAR /
      85_000;
    expect(walt.bySf).toBeCloseTo(expected, 10);
    // The 15,000 SF vacancy carries no lease term and no weight.
    expect(walt.coveredSf).toBe(85_000);
  });

  it("weights by rent separately, and the two diverge", () => {
    const walt = computeWalt(CLEAN, AS_OF);
    const expected =
      (480_000 * DAYS.ardent + 325_000 * DAYS.copperline + 300_000 * DAYS.marrow) /
      DAYS_PER_YEAR /
      1_105_000;
    expect(walt.byRent).toBeCloseTo(expected, 10);
    expect(walt.byRent).not.toBeCloseTo(walt.bySf!, 3);
  });

  it("excludes leases with no expiry rather than assuming one, and says how much", () => {
    const leases = leasesFrom(MISSING_EXPIRIES_CSV);
    const walt = computeWalt(leases, AS_OF);
    expect(walt.excludedSf).toBe(5_000); // Aster Legal
    expect(walt.excludedRent).toBe(90_000);
    expect(walt.coveredSf).toBe(4_200);
  });

  it("treats an already-expired lease as holdover, not negative term", () => {
    expect(yearsTo("2020-01-01", AS_OF)).toBe(0);
  });

  it("returns null rather than 0 when nothing is datable", () => {
    const walt = computeWalt([], AS_OF);
    expect(walt.bySf).toBeNull();
    expect(walt.byRent).toBeNull();
  });
});

describe("rolloverSchedule", () => {
  it("buckets SF, rent and lease count by expiry year", () => {
    const s = rolloverSchedule(CLEAN);
    expect(s.years.map((y) => y.year)).toEqual([2026, 2027, 2029]);
    expect(s.years.find((y) => y.year === 2027)!.sfExpiring).toBe(40_000);
    expect(s.years.find((y) => y.year === 2026)!.rentExpiring).toBe(325_000);
    expect(s.years.every((y) => y.leaseCount === 1)).toBe(true);
  });

  it("expiring SF across all years plus vacant SF equals NRA", () => {
    const s = rolloverSchedule(CLEAN);
    expect(s.totalSfExpiring + s.vacantSf + s.undatedSf).toBe(s.nra);
    expect(s.nra).toBe(100_000);
  });

  it("holds the identity when some occupied space has no expiry", () => {
    const s = rolloverSchedule(leasesFrom(MISSING_EXPIRIES_CSV));
    expect(s.totalSfExpiring + s.vacantSf + s.undatedSf).toBe(s.nra);
  });

  it("computes % of NRA against the stated NRA, not the roll's own sum", () => {
    const s = rolloverSchedule(CLEAN, { nra: 120_000 });
    expect(s.years.find((y) => y.year === 2027)!.pctOfNra).toBeCloseTo(40_000 / 120_000, 12);
  });
});

describe("markToMarket", () => {
  it("prices each lease against its own basis and weights the total", () => {
    const mtm = markToMarket(CLEAN, { NNN: 14, default: 14 });
    expect(mtm.rows).toHaveLength(3);
    expect(mtm.pricedSf).toBe(85_000);
    // In-place: (480k + 325k + 300k) / 85k = $13.00/SF against $14.00 market.
    expect(mtm.weightedInPlacePsf).toBeCloseTo(1_105_000 / 85_000, 10);
    expect(mtm.weightedGapPsf).toBeCloseTo(14 - 1_105_000 / 85_000, 10);
    expect(mtm.totalGapAnnual).toBeCloseTo(14 * 85_000 - 1_105_000, 6);
  });

  it("skips a lease it can't price rather than pricing it at zero", () => {
    const leases: Lease[] = [
      { ...CLEAN[0] },
      { ...CLEAN[1], sf: null, rentPsf: null },
    ];
    const mtm = markToMarket(leases, { NNN: 14, default: 14 });
    expect(mtm.rows).toHaveLength(1);
    expect(mtm.unpricedLeases).toBe(1);
  });

  it("skips a basis with no market rent instead of falling back silently", () => {
    const mtm = markToMarket(CLEAN, { MG: 20 });
    expect(mtm.rows).toHaveLength(0);
    expect(mtm.unpricedLeases).toBe(3);
    expect(mtm.weightedGapPsf).toBeNull();
  });

  it("sorts the biggest dollar gaps first", () => {
    const mtm = markToMarket(CLEAN, { NNN: 20, default: 20 });
    const gaps = mtm.rows.map((r) => Math.abs(r.gapAnnual));
    expect([...gaps].sort((a, b) => b - a)).toEqual(gaps);
  });
});

describe("rolloverCostForecast", () => {
  const profile = normalizeProfile({ ...PROFILE_DEFAULTS.industrial, marketRentPsf: 14 });

  it("prices renewal and new-deal branches at the stated probability", () => {
    const { renewalPsf, newPsf, blendedPsf, termRentPsf } = blendedRolloverCostPsf(profile);
    // Total term rent per SF with escalations compounded, not year-1 rent × 5.
    const esc = profile.escalationPct;
    expect(termRentPsf).toBeCloseTo(
      14 * ((Math.pow(1 + esc, profile.termYears) - 1) / esc),
      10,
    );
    expect(renewalPsf).toBeCloseTo(
      profile.renewalTiPsf + profile.renewalLcPct * termRentPsf + (14 * profile.renewalFreeRentMonths) / 12,
      10,
    );
    expect(newPsf).toBeCloseTo(
      profile.newTiPsf +
        profile.newLcPct * termRentPsf +
        (14 * profile.newFreeRentMonths) / 12 +
        (14 * profile.downtimeMonths) / 12,
      10,
    );
    expect(blendedPsf).toBeCloseTo(
      profile.renewalProbability * renewalPsf + (1 - profile.renewalProbability) * newPsf,
      10,
    );
    // A new deal costs more than a renewal — if that inverts, the profile is wrong.
    expect(newPsf).toBeGreaterThan(renewalPsf);
  });

  it("lays the cost out by year and blends to the same per-SF figure", () => {
    const schedule = rolloverSchedule(CLEAN);
    const forecast = rolloverCostForecast(schedule, profile);
    expect(forecast.years.map((y) => y.year)).toEqual([2026, 2027, 2029]);
    const { blendedPsf } = blendedRolloverCostPsf(profile);
    expect(forecast.blendedCostPerSf).toBeCloseTo(blendedPsf, 8);
    for (const y of forecast.years) {
      expect(y.tiCost + y.lcCost + y.freeRentCost + y.downtimeCost).toBeCloseTo(y.totalCost, 6);
      expect(y.costPerExpiringSf).toBeCloseTo(blendedPsf, 8);
    }
  });

  it("carries no downtime on a 100%-renewal profile", () => {
    const certain = normalizeProfile({ ...profile, renewalProbability: 1 });
    const forecast = rolloverCostForecast(rolloverSchedule(CLEAN), certain);
    expect(forecast.years.every((y) => y.downtimeCost === 0)).toBe(true);
  });
});

describe("leaseUpCurve", () => {
  it("absorbs the vacancy at the stated pace and reports stabilization", () => {
    const curve = leaseUpCurve({
      vacantSf: 15_000,
      occupiedSf: 85_000,
      nra: 100_000,
      absorptionSfPerMonth: 2_500,
      stabilizedOccupancyPct: 0.95,
    });
    expect(curve.months[5].cumulativeSfLeased).toBe(15_000);
    expect(curve.months[5].remainingVacantSf).toBe(0);
    // 95% of 100,000 needs 10,000 SF absorbed → month 4 at 2,500/mo.
    expect(curve.monthsToStabilize).toBe(4);
  });

  it("never leases past the vacancy", () => {
    const curve = leaseUpCurve({
      vacantSf: 1_000,
      occupiedSf: 9_000,
      nra: 10_000,
      absorptionSfPerMonth: 5_000,
    });
    expect(curve.months[0].sfLeased).toBe(1_000);
    expect(curve.months[1].sfLeased).toBe(0);
  });

  it("answers 'never' rather than infinity at zero absorption", () => {
    const curve = leaseUpCurve({
      vacantSf: 20_000,
      occupiedSf: 80_000,
      nra: 100_000,
      absorptionSfPerMonth: 0,
    });
    expect(curve.monthsToStabilize).toBeNull();
    expect(curve.months.every((m) => m.sfLeased === 0)).toBe(true);
  });
});

describe("concentrationFlags", () => {
  it("fires on a tenant over 25% of NRA and of income", () => {
    const walt = computeWalt(CLEAN, AS_OF);
    const flags = concentrationFlags(CLEAN, rolloverSchedule(CLEAN), walt, { nra: 100_000 });
    const nra = flags.find((f) => f.code === "tenant_nra")!;
    expect(nra.message).toContain("Ardent Logistics");
    expect(nra.value).toBeCloseTo(0.4, 10);
    expect(flags.find((f) => f.code === "tenant_income")).toBeDefined();
  });

  it("fires on more than 30% of NRA rolling in one year", () => {
    const flags = concentrationFlags(
      CLEAN,
      rolloverSchedule(CLEAN),
      computeWalt(CLEAN, AS_OF),
      { nra: 100_000 },
    );
    const roll = flags.find((f) => f.code === "rollover_year")!;
    expect(roll.value).toBeCloseTo(0.4, 10);
    expect(roll.message).toContain("2027");
  });

  it("fires when WALT is shorter than the hold", () => {
    const walt = computeWalt(CLEAN, AS_OF);
    const flags = concentrationFlags(CLEAN, rolloverSchedule(CLEAN), walt, {
      nra: 100_000,
      holdYears: 5,
    });
    expect(flags.find((f) => f.code === "walt_under_hold")).toBeDefined();
  });

  it("reports one worst tenant rather than a wall on a 40-tenant roll", () => {
    const leases = leasesFrom(fortyTenantCsv());
    const schedule = rolloverSchedule(leases);
    const flags = concentrationFlags(leases, schedule, computeWalt(leases, AS_OF), {});
    expect(flags.filter((f) => f.code === "tenant_nra").length).toBeLessThanOrEqual(1);
  });
});

describe("analyzeRentRoll", () => {
  it("rolls the whole roll up in one pass", () => {
    const a = analyzeRentRoll(CLEAN, { asOf: AS_OF, nra: 100_000 });
    expect(a.leaseCount).toBe(4);
    expect(a.occupiedCount).toBe(3);
    expect(a.vacantCount).toBe(1);
    expect(a.totalSf).toBe(100_000);
    expect(a.occupiedSf).toBe(85_000);
    expect(a.occupancyPct).toBeCloseTo(0.85, 12);
    expect(a.inPlaceRentAnnual).toBe(1_105_000);
    expect(a.weightedInPlacePsf).toBeCloseTo(1_105_000 / 85_000, 10);
    expect(a.walt.bySf).not.toBeNull();
    expect(a.flags.length).toBeGreaterThan(0);
  });
});
