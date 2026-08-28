import { describe, expect, it } from "vitest";
import {
  detectHeaderRow,
  parseCsv,
  parseDate,
  parseNumber,
  parsePercent,
  parseBasis,
  excelSerialToIso,
  suggestMapping,
  toLeases,
  normalizeHeader,
} from "./parse";
import { validateLeases } from "./validate";
import { CLEAN_CSV, MESSY_CSV, MISSING_EXPIRIES_CSV, fortyTenantCsv } from "./__fixtures__";

const leasesFrom = (csv: string) => {
  const grid = parseCsv(csv);
  return toLeases(grid, suggestMapping(grid));
};

describe("parseCsv", () => {
  it("handles quoted fields with embedded commas", () => {
    const grid = parseCsv('a,"b, still b",c\n1,2,3\n');
    expect(grid[0]).toEqual(["a", "b, still b", "c"]);
    expect(grid[1]).toEqual(["1", "2", "3"]);
  });

  it("handles doubled quotes and CRLF", () => {
    const grid = parseCsv('name,note\r\n"He said ""hi""",ok\r\n');
    expect(grid[1][0]).toBe('He said "hi"');
  });

  it("distinguishes an empty field from an empty quoted string", () => {
    const grid = parseCsv('a,,""\n');
    expect(grid[0]).toEqual(["a", null, ""]);
  });
});

describe("value coercion", () => {
  it("parses money, parenthesised negatives and blanks", () => {
    expect(parseNumber("$1,234.56")).toBe(1234.56);
    expect(parseNumber("(500)")).toBe(-500);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("n/a")).toBeNull();
    // A blank is an ABSENT figure, not zero — the whole analytics layer
    // depends on this.
    expect(parseNumber("   ")).toBeNull();
  });

  it("reads percents whether or not the sign is present", () => {
    expect(parsePercent("3.0%")).toBeCloseTo(0.03, 12);
    expect(parsePercent(3)).toBeCloseTo(0.03, 12);
    expect(parsePercent(0.03)).toBeCloseTo(0.03, 12);
  });

  it("parses every date format a rent roll carries", () => {
    expect(parseDate("2027-12-31")).toBe("2027-12-31");
    expect(parseDate("12/31/2027")).toBe("2027-12-31");
    expect(parseDate("15-Mar-2021")).toBe("2021-03-15");
    expect(parseDate("3/31/26")).toBe("2026-03-31");
    // Month precision means END of month — a lease expiring in Jan 2029
    // expires on the 31st, and rounding to the 1st understates WALT.
    expect(parseDate("Jan-2029")).toBe("2029-01-31");
    expect(parseDate("Feb-2028")).toBe("2028-02-29");
    expect(parseDate("")).toBeNull();
    expect(parseDate("see note")).toBeNull();
  });

  it("reads Excel serial dates off the 1899-12-30 epoch", () => {
    expect(excelSerialToIso(45000)).toBe("2023-03-15");
    expect(parseDate(45000)).toBe("2023-03-15");
  });

  it("recognises lease bases", () => {
    expect(parseBasis("NNN")).toBe("NNN");
    expect(parseBasis("Triple Net")).toBe("NNN");
    expect(parseBasis("Full Service Gross")).toBe("FSG");
    expect(parseBasis("Modified Gross")).toBe("MG");
    expect(parseBasis("")).toBe("unknown");
  });
});

describe("header detection and mapping", () => {
  it("finds row 1 on a clean file", () => {
    expect(detectHeaderRow(parseCsv(CLEAN_CSV))).toBe(0);
  });

  it("skips a title block to find the real header", () => {
    const grid = parseCsv(MESSY_CSV);
    // Three title lines + a blank spacer, so the header is the 5th row.
    expect(detectHeaderRow(grid)).toBe(4);
    expect(normalizeHeader(grid[4][0])).toBe("ste");
  });

  it("maps broker-idiosyncratic column names", () => {
    const grid = parseCsv(MESSY_CSV);
    const mapping = suggestMapping(grid);
    expect(mapping.columns.tenant).toBe(1);
    expect(mapping.columns.sf).toBe(2);
    expect(mapping.columns.leaseStart).toBe(3);
    expect(mapping.columns.leaseExpiry).toBe(4);
    expect(mapping.columns.baseRentAnnual).toBe(5);
    expect(mapping.columns.escalationPct).toBe(6);
  });

  it("recognises a monthly rent column and annualizes it", () => {
    const { leases, mapping } = leasesFrom(MESSY_CSV);
    expect(mapping.monthly).toContain("baseRentAnnual");
    const bellweather = leases.find((l) => l.tenant.startsWith("Bellweather"))!;
    expect(bellweather.baseRentAnnual).toBeCloseTo(18_750 * 12, 6);
    expect(bellweather.rentPsf).toBeCloseTo((18_750 * 12) / 12_500, 9);
  });

  it("never assigns two canonical fields to the same source column", () => {
    const mapping = suggestMapping(parseCsv(CLEAN_CSV));
    const cols = Object.values(mapping.columns);
    expect(new Set(cols).size).toBe(cols.length);
  });
});

describe("toLeases", () => {
  it("normalizes a clean roll and marks the vacancy", () => {
    const { leases } = leasesFrom(CLEAN_CSV);
    expect(leases).toHaveLength(4);
    const vacant = leases.find((l) => l.vacant)!;
    expect(vacant.suite).toBe("120");
    expect(vacant.tenant).toBe("");
    expect(vacant.sf).toBe(15_000);
    expect(vacant.baseRentAnnual).toBeNull();
  });

  it("drops the totals row rather than counting the building twice", () => {
    const { leases, skippedTotalRows } = leasesFrom(MESSY_CSV);
    expect(skippedTotalRows).toBe(1);
    expect(leases.some((l) => /total/i.test(l.suite))).toBe(false);
    expect(leases).toHaveLength(4);
  });

  it("drops blank spacer rows", () => {
    const { skippedBlankRows } = leasesFrom(MESSY_CSV);
    expect(skippedBlankRows).toBeGreaterThanOrEqual(1);
  });

  it("keeps a missing expiry null instead of inventing one", () => {
    const { leases } = leasesFrom(MISSING_EXPIRIES_CSV);
    const aster = leases.find((l) => l.tenant === "Aster Legal")!;
    expect(aster.leaseExpiry).toBeNull();
    expect(aster.vacant).toBe(false);
  });

  it("handles a 40-tenant roll", () => {
    const { leases } = leasesFrom(fortyTenantCsv());
    expect(leases).toHaveLength(40);
    expect(leases.every((l) => l.sf != null && l.leaseExpiry != null)).toBe(true);
  });
});

describe("validateLeases", () => {
  it("flags SF summing past a stated NRA", () => {
    const { leases } = leasesFrom(CLEAN_CSV);
    const issues = validateLeases(leases, { nra: 90_000 });
    expect(issues.find((i) => i.code === "sf_exceeds_nra")).toBeDefined();
  });

  it("flags an expiry before its start", () => {
    const grid = parseCsv(
      "Suite,Tenant,SF,Lease Start,Lease Expiration,Annual Rent\n1,Backwards Co,1000,2027-01-01,2025-01-01,20000\n",
    );
    const issues = validateLeases(toLeases(grid, suggestMapping(grid)).leases);
    expect(issues.find((i) => i.code === "expiry_before_start")?.rows).toEqual([2]);
  });

  it("flags an order-of-magnitude rent outlier", () => {
    const { leases } = leasesFrom(MISSING_EXPIRIES_CSV);
    const issue = validateLeases(leases).find((i) => i.code === "rent_psf_outlier");
    expect(issue).toBeDefined();
    // Cinder Works at $1.50/SF against a median near $18–35.
    expect(issue!.rows).toContain(4);
  });

  it("flags duplicate suites and blank expiries on occupied space", () => {
    const grid = parseCsv(
      "Suite,Tenant,SF,Lease Expiration,Annual Rent\n100,A Co,1000,2027-01-01,20000\n100,B Co,1000,,20000\n",
    );
    const issues = validateLeases(toLeases(grid, suggestMapping(grid)).leases);
    expect(issues.map((i) => i.code)).toContain("duplicate_suite");
    expect(issues.map((i) => i.code)).toContain("missing_expiry");
  });

  it("flags a roll that mixes lease bases", () => {
    const { leases } = leasesFrom(MESSY_CSV);
    expect(validateLeases(leases).map((i) => i.code)).toContain("mixed_rent_basis");
  });

  it("says so plainly when nothing parsed", () => {
    const issues = validateLeases([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("no_leases");
  });
});
