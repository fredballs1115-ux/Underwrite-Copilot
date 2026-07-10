import { describe, it, expect } from "vitest";
import {
  consolidateRentRoll,
  summarizeT12,
  compareNoi,
  severityForNoiDelta,
} from "./analyze";
import type { RentRollRow, RentRollExtraction, T12Extraction } from "./types";

function row(o: Partial<RentRollRow>): RentRollRow {
  return {
    tenant: o.tenant ?? "Tenant",
    suiteUnit: o.suiteUnit ?? "100",
    sf: o.sf ?? null,
    leaseExpiry: o.leaseExpiry ?? "",
    inPlaceRentMonthly: o.inPlaceRentMonthly ?? null,
    rentPsf: o.rentPsf ?? null,
    occupied: o.occupied ?? true,
    freeRentMonths: o.freeRentMonths ?? null,
    tiPsf: o.tiPsf ?? null,
    page: o.page ?? "",
  };
}
const roll = (rows: RentRollRow[], asOfDate = "2026-06-01", truncated = false): RentRollExtraction => ({
  asOfDate,
  rows,
  truncated,
  page: "p. 4",
});

describe("consolidateRentRoll", () => {
  const s = consolidateRentRoll(
    roll([
      row({ sf: 10_000, leaseExpiry: "2027-06-01", rentPsf: 20 }), // ~1yr, $20/SF
      row({ sf: 5_000, leaseExpiry: "2030-06-01", inPlaceRentMonthly: 12_500 }), // 4yr, $30/SF derived
      row({ sf: 5_000, occupied: false }), // vacant
    ]),
  );

  it("counts units and SF, occupied vs total", () => {
    expect(s.unitCount).toBe(3);
    expect(s.occupiedUnits).toBe(2);
    expect(s.totalSf).toBe(20_000);
    expect(s.occupiedSf).toBe(15_000);
    expect(s.sfWeightedOccupancy).toBeCloseTo(0.75, 6);
  });

  it("computes SF-weighted WALT from the as-of date", () => {
    // (10,000·~1.0 + 5,000·4.0) / 15,000 ≈ 2.0 years
    expect(s.waltYears).toBeCloseTo(2.0, 1);
  });

  it("computes SF-weighted in-place rent PSF (stated + derived)", () => {
    // (10,000·$20 + 5,000·$30) / 15,000 = $23.33/SF
    expect(s.weightedAvgRentPsf).toBeCloseTo(23.3333, 3);
  });

  it("buckets lease expiry as % of the occupied SF that carried a date", () => {
    expect(s.expiryCoveredSf).toBe(15_000);
    expect(s.expiryBuckets!.next12mo).toBeCloseTo(10_000 / 15_000, 4); // ~0.667
    expect(s.expiryBuckets!.y3to5).toBeCloseTo(5_000 / 15_000, 4); // ~0.333
    expect(s.expiryBuckets!.y1to3).toBe(0);
    expect(s.expiryBuckets!.y5plus).toBe(0);
  });

  it("is null-safe with no SF and no as-of date", () => {
    const z = consolidateRentRoll(
      roll([row({ sf: null, leaseExpiry: "2028-01-01" })], ""),
    );
    expect(z.sfWeightedOccupancy).toBeNull();
    expect(z.waltYears).toBeNull();
    expect(z.expiryBuckets).toBeNull();
    expect(z.weightedAvgRentPsf).toBeNull();
  });

  it("carries the truncated flag through", () => {
    expect(consolidateRentRoll(roll([row({ sf: 100 })], "2026-06-01", true)).truncated).toBe(true);
  });
});

describe("summarizeT12", () => {
  const base: T12Extraction = {
    periodEndDate: "2026-05-31",
    collectedRent: null,
    vacancyLoss: null,
    otherIncome: null,
    egi: null,
    opex: [],
    totalOpex: null,
    noi: null,
    page: "p. 2",
  };

  it("keeps a stated NOI as-is", () => {
    const s = summarizeT12({ ...base, egi: 1_000_000, totalOpex: 400_000, noi: 600_000 });
    expect(s.noi).toBe(600_000);
    expect(s.noiDerived).toBe(false);
  });

  it("derives NOI = EGI − opex when the bottom line is missing", () => {
    const s = summarizeT12({ ...base, egi: 1_000_000, totalOpex: 400_000, noi: null });
    expect(s.noi).toBe(600_000);
    expect(s.noiDerived).toBe(true);
  });

  it("reconstructs EGI, total opex, and NOI from the parts", () => {
    const s = summarizeT12({
      ...base,
      collectedRent: 1_100_000,
      vacancyLoss: 100_000,
      otherIncome: 50_000,
      opex: [
        { key: "taxes", label: "Real estate taxes", amount: 250_000, page: "p. 2" },
        { key: "insurance", label: "Insurance", amount: 150_000, page: "p. 2" },
      ],
    });
    expect(s.egi).toBe(1_050_000); // 1.1M − 100k + 50k
    expect(s.totalOpex).toBe(400_000); // 250k + 150k
    expect(s.noi).toBe(650_000); // 1.05M − 400k
    expect(s.noiDerived).toBe(true);
  });
});

describe("compareNoi — OM assumed vs T-12 actual", () => {
  it("severity: 4% in line, 7% material, 12% red flag", () => {
    expect(compareNoi(1_040_000, 1_000_000).severity).toBe("in_line");
    expect(compareNoi(1_070_000, 1_000_000).severity).toBe("material");
    expect(compareNoi(1_120_000, 1_000_000).severity).toBe("red_flag");
  });

  it("thresholds are strict (>5%, >10%)", () => {
    expect(severityForNoiDelta(0.05)).toBe("in_line"); // exactly 5% is not > 5%
    expect(severityForNoiDelta(0.10)).toBe("material"); // exactly 10% is not > 10%
    expect(severityForNoiDelta(0.1001)).toBe("red_flag");
  });

  it("direction + signed delta reflect OM vs actual", () => {
    const hot = compareNoi(1_070_000, 1_000_000);
    expect(hot.direction).toBe("above");
    expect(hot.deltaPct).toBeCloseTo(0.07, 6);
    expect(compareNoi(930_000, 1_000_000).direction).toBe("below");
  });
});
