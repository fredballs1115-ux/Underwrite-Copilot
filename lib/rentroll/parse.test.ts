import { describe, expect, it } from "vitest";
import {
  detectHeaderRow,
  parseCsv,
  parseDate,
  parseNumber,
  parsePercent,
  parseBasis,
  excelSerialToIso,
  isTotalsLabel,
  suggestMapping,
  toLeases,
  normalizeHeader,
} from "./parse";
import { rentPsfCeiling, validateLeases } from "./validate";
import { computeWalt } from "./analytics";
import {
  CLEAN_CSV,
  MESSY_CSV,
  MISSING_EXPIRIES_CSV,
  TOTAL_NAMED_TENANTS_CSV,
  apartmentCsv,
  fortyTenantCsv,
} from "./__fixtures__";

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

  it("reads a date day first where its first figure can only be a day, and refuses one that fits neither", () => {
    expect(parseDate("31/12/2028")).toBe("2028-12-31");
    expect(parseDate("12/31/2028")).toBe("2028-12-31");
    expect(parseDate("31.12.2028")).toBe("2028-12-31");
    // Either way round names a day: the file's convention decides.
    expect(parseDate("05/06/2028")).toBe("2028-05-06");
    expect(parseDate("05/06/2028", { dayFirst: true })).toBe("2028-06-05");
    // Neither way round names a day that exists — null, never "2028-31-12".
    for (const s of [
      "13/13/2028",
      "31/31/2028",
      "2/30/2027",
      "2028-13-05",
      "2028-31-12",
      "2027-02-30",
      "31-Feb-2027",
      "Feb 29, 2027",
    ]) {
      expect(parseDate(s), s).toBeNull();
    }
    expect(parseDate("Feb 29, 2028")).toBe("2028-02-29");
    expect(parseDate("Dec 31, 2028")).toBe("2028-12-31");
    expect(parseDate("2028-12")).toBe("2028-12-31");
    // A year alone names no day — as text or as a number, never serial 2028
    // (20 July 1905); a day with no year is no date either.
    expect(parseDate("2028")).toBeNull();
    expect(parseDate(2028)).toBeNull();
    expect(parseDate("12/31")).toBeNull();
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

  it("reads a whole file day first where its dates show it, and leaves a date that fits neither blank and said", () => {
    const parsed = leasesFrom(
      [
        "Suite,Tenant,SF,Commencement,Expiration,Annual Rent",
        "1,Ardent Co,1000,01/02/2020,31/12/2028,20000",
        "2,Birch LLC,1000,01/03/2021,05/06/2028,30000",
        "3,Cobalt Inc,1000,01/01/2022,31/31/2028,40000",
        "4,Delta Ltd,1000,,MTM,10000",
      ].join("\n"),
    );
    const by = (name: string) => parsed.leases.find((l) => l.tenant === name)!;
    expect(by("Ardent Co").leaseExpiry).toBe("2028-12-31");
    expect(by("Ardent Co").leaseStart).toBe("2020-02-01");
    expect(by("Birch LLC").leaseExpiry).toBe("2028-06-05");
    expect(by("Cobalt Inc").leaseExpiry).toBeNull();
    expect(parsed.dayFirst).toEqual({ text: "31/12/2028", date: "2028-12-31" });
    // "MTM" says there is no fixed expiry; "31/31/2028" is a date refused.
    expect(parsed.unreadDates).toEqual([{ row: 4, field: "leaseExpiry", text: "31/31/2028" }]);

    const issues = validateLeases(parsed.leases, { parse: parsed });
    expect(issues.find((i) => i.code === "unread_date")).toMatchObject({ severity: "warning", rows: [4] });
    expect(issues.find((i) => i.code === "dates_day_first")?.message).toContain("“31/12/2028” is 31 December 2028");
    // The refused expiry is said once, by the unread note; the blank one by
    // the missing-expiry warning.
    expect(issues.find((i) => i.code === "missing_expiry")?.rows).toEqual([5]);
    expect(Number.isFinite(computeWalt(parsed.leases, "2026-10-01").bySf!)).toBe(true);
  });

  it("reads a day-first date in a month-first file by its own figures", () => {
    const { leases, dayFirst } = leasesFrom(
      "Suite,Tenant,SF,Expiration,Annual Rent\n1,Acme Co,1000,12/31/2030,20000\n2,Northside Dental,4000,31/12/2028,148000\n",
    );
    expect(dayFirst).toBeNull();
    expect(leases.map((l) => l.leaseExpiry)).toEqual(["2030-12-31", "2028-12-31"]);
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

describe("an apartment roll maps the rent the resident pays, a month at a time", () => {
  const grid = parseCsv(apartmentCsv());
  const header = (col: number | undefined) => (col == null ? null : String(grid[0][col]));

  it("takes Actual Rent over Market Rent, and maps neither the market rent nor the unit type to anything", () => {
    const m = suggestMapping(grid);
    expect(header(m.columns.baseRentAnnual)).toBe("Actual Rent");
    expect(m.monthly).toEqual(["baseRentAnnual"]);
    const mapped = Object.values(m.columns).map(header);
    expect(mapped).not.toContain("Market Rent");
    expect(mapped).not.toContain("Unit Type");
    expect(m.columns.rentPsf).toBeUndefined();
    expect(m.columns.rentBasis).toBeUndefined();
    expect(header(m.columns.leaseStart)).toBe("Lease Start");
    expect(header(m.columns.tenant)).toBe("Resident");
  });

  it("reads the in-place rent a year at a time, so its rent per foot is an apartment's", () => {
    const { leases } = toLeases(grid, suggestMapping(grid));
    const first = leases[0];
    expect(first.baseRentAnnual).toBe((1650 - 50) * 12);
    expect(first.rentPsf).toBeCloseTo(((1650 - 50) * 12) / 720, 9);
    expect(leases.filter((l) => !l.vacant).every((l) => l.rentPsf! > 15 && l.rentPsf! < 40)).toBe(true);
    expect(validateLeases(leases, { assetClass: "multifamily" }).map((i) => i.code)).not.toContain(
      "rent_psf_implausible",
    );
  });

  it("flags the old mis-mapping — the monthly rent in the $/SF column — and corrects nothing", () => {
    const old = suggestMapping(grid);
    old.columns = { ...old.columns, baseRentAnnual: 4, rentPsf: 5 }; // Market Rent, Actual Rent
    old.monthly = [];
    const { leases } = toLeases(grid, old);
    const issues = validateLeases(leases, { assetClass: "multifamily" });
    const implausible = issues.find((i) => i.code === "rent_psf_implausible")!;
    expect(implausible.severity).toBe("error");
    expect(implausible.message).toContain("above $250/SF a year");
    expect(implausible.rows).toHaveLength(11);
    expect(issues.find((i) => i.code === "rent_psf_mismatch")?.severity).toBe("warning");
    // The figures stay as read: the check says, it never rewrites.
    expect(leases[0].rentPsf).toBe(1600);
  });
});

describe("a rent column's period is the header's to say", () => {
  const periodOf = (header: string, options?: { rentMonthly?: boolean }) =>
    suggestMapping(parseCsv(`Suite,Tenant,SF,Expiration,${header}\n1,A Co,1000,2030-12-31,5000\n`), 0, options).monthly;

  it("reads a month's figure where the header says month, and a year's where it says year", () => {
    expect(periodOf("Rent/Mo")).toEqual(["baseRentAnnual"]);
    expect(periodOf("Actual Rent (Monthly)")).toEqual(["baseRentAnnual"]);
    expect(periodOf("Rent PSF/Mo")).toEqual(["rentPsf"]);
    expect(periodOf("Annual Rent", { rentMonthly: true })).toEqual([]);
    expect(periodOf("Rent PSF/Yr", { rentMonthly: true })).toEqual([]);
  });

  it("reads a rent that names no period by the way the building leases", () => {
    expect(periodOf("Rent", { rentMonthly: true })).toEqual(["baseRentAnnual"]);
    expect(periodOf("Rent", { rentMonthly: false })).toEqual([]);
    expect(periodOf("Rent")).toEqual([]);
    // A rent per foot stays a year's; its base rent catches a monthly one.
    expect(periodOf("Rent PSF", { rentMonthly: true })).toEqual([]);
  });

  it("holds a lease's rent per foot to its base rent, and names a month read as a year", () => {
    const grid = parseCsv("Suite,Tenant,SF,Expiration,Monthly Rent,Rent PSF\n1,A Co,1000,2030-12-31,3000,3\n");
    const issue = validateLeases(toLeases(grid, suggestMapping(grid)).leases).find((i) => i.code === "rent_psf_mismatch");
    expect(issue?.message).toContain("one is a month's figure and the other a year's");
    expect(issue?.rows).toEqual([2]);
  });

  it("sets the ceiling by the class: rental housing by the unit, everything else by the dearest retail", () => {
    expect(rentPsfCeiling("multifamily")).toBe(250);
    expect(rentPsfCeiling("student_housing")).toBe(250);
    expect(rentPsfCeiling("mixed_use")).toBe(1_000);
    expect(rentPsfCeiling("office")).toBe(1_000);
    expect(rentPsfCeiling("")).toBe(1_000);
  });
});

describe("totals lines are read by their shape, never by their first word", () => {
  it("reads a whole totals label and refuses a name that only opens on the word", () => {
    for (const label of [
      "Total",
      "TOTALS:",
      "Grand Total",
      "Sub-total",
      "Weighted Average",
      "Total Occupied SF",
      "Vacant Total",
      "Building A Total",
      "Subtotal - Building A",
      "Total for Phase 2",
      "Totals (12 leases)",
    ]) {
      expect(isTotalsLabel(label), label).toBe(true);
    }
    for (const name of [
      "Total Wine & More",
      "Total Recall Media",
      "Sum Kitchen",
      "Average Joe's Coffee",
      "Total-Tel Communications",
      "Totally Kids",
      "",
    ]) {
      expect(isTotalsLabel(name), name).toBe(false);
    }
    expect(isTotalsLabel(42)).toBe(false);
  });

  it("keeps a tenant named Total, drops the totals line, and keeps a lease whose note opens on Total", () => {
    const { leases, skippedTotals, skippedTotalRows } = leasesFrom(TOTAL_NAMED_TENANTS_CSV);
    expect(leases.map((l) => l.tenant)).toEqual([
      "Acme Law LLP",
      "Total Wine & More",
      "Northside Dental",
      "",
      "Total Recall Media",
    ]);
    const wine = leases.find((l) => l.tenant === "Total Wine & More")!;
    expect(wine.sf).toBe(18_000);
    expect(wine.baseRentAnnual).toBe(522_000);
    expect(skippedTotalRows).toBe(1);
    expect(skippedTotals).toEqual([{ row: 7, label: "Total" }]);
  });

  it("keeps a Total-named tenant on a roll with no suite column, where its lease is dated", () => {
    const { leases, skippedTotals } = leasesFrom(
      "Tenant,SF,Expiration,Annual Rent\nAcme Co,5000,2030-12-31,150000\nTotal Wine & More,18000,2034-05-31,522000\nTotal,23000,,672000\n",
    );
    expect(leases.map((l) => l.tenant)).toEqual(["Acme Co", "Total Wine & More"]);
    expect(skippedTotals.map((s) => s.label)).toEqual(["Total"]);
  });

  it("drops a totals line in the tenant column, a qualified one, and one in an unmapped column", () => {
    const { leases, skippedTotals } = leasesFrom(
      [
        "Bldg,Suite,Tenant,SF,Expiration,Annual Rent",
        "A,101,Acme Co,5000,2030-12-31,150000",
        "A,102,Birch LLC,3000,2029-06-30,90000",
        "A,,Subtotal - Building A,8000,,240000",
        "B,201,Cobalt Inc,4000,2031-03-31,120000",
        "B,,Total Occupied,12000,,360000",
        "Total,,,12000,,360000",
      ].join("\n"),
    );
    expect(leases.map((l) => l.tenant)).toEqual(["Acme Co", "Birch LLC", "Cobalt Inc"]);
    expect(skippedTotals.map((s) => s.label)).toEqual(["Subtotal - Building A", "Total Occupied", "Total"]);
  });

  it("reads a label that only opens on Total by its figures: a sum of the rows above is a totals line, anything else a lease", () => {
    const head = "Tenant,SF,Expiration,Annual Rent";
    const sums = leasesFrom(
      `${head}\nAcme Co,5000,2030-12-31,150000\nBirch LLC,3000,2029-06-30,90000\nTotal Northgate Commerce Center,8000,,240000\n`,
    );
    expect(sums.leases).toHaveLength(2);
    expect(sums.skippedTotals.map((s) => s.label)).toEqual(["Total Northgate Commerce Center"]);

    const tenant = leasesFrom(
      `${head}\nAcme Co,5000,2030-12-31,150000\nBirch LLC,3000,2029-06-30,90000\nTotal Comfort HVAC,2500,,60000\n`,
    );
    expect(tenant.leases.map((l) => l.tenant)).toContain("Total Comfort HVAC");
    expect(tenant.skippedTotals).toEqual([]);
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

  it("stores the totals lines it left out as a note naming each row and label", () => {
    const parsed = leasesFrom(TOTAL_NAMED_TENANTS_CSV);
    const note = validateLeases(parsed.leases, { parse: parsed }).find((i) => i.code === "skipped_totals");
    expect(note?.severity).toBe("info");
    expect(note?.rows).toEqual([7]);
    expect(note?.message).toContain("Left out 1 totals line");
    expect(note?.message).toContain("“Total”");
    // Without the parse result there is nothing to say.
    expect(validateLeases(parsed.leases).some((i) => i.code === "skipped_totals")).toBe(false);
  });

  it("says so plainly when nothing parsed", () => {
    const issues = validateLeases([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("no_leases");
  });
});
