import { describe, expect, it } from "vitest";
import { ageDays } from "./live-rates";
import { ZILLOW_FILES, ZILLOW_FRESH_DAYS, ZILLOW_METRICS, ZORI_CREDIT, monthOf, zillowAreaOf, zillowFileMonths, zillowFresh, zoriFor, type BenchRow } from "./zori";

/** The day the fixture is read on: the pull of Sep 20 wrote August, dated its last day. */
const NOW = new Date("2026-09-23T12:00:00Z");

/** Two rows as scripts/fetch-zori.mjs writes them. */
const ROWS: BenchRow[] = [
  {
    metric: "zori_rent",
    metro: "Washington DC",
    low: 2412,
    as_of: "2026-08-31",
    note: "Zillow Observed Rent Index (ZORI), all homes, smoothed, Washington, DC metro area, month ending 2026-08-31. Data: Zillow Research.",
  },
  { metric: "zori_rent_yoy", metro: "Washington DC", low: 2.3, as_of: "2026-08-31", note: "ZORI change from 2025-08-31 to 2026-08-31, Washington, DC metro area. Data: Zillow Research." },
  {
    metric: "zori_rent",
    metro: "Prince George's County MD",
    low: 2412,
    as_of: "2026-08-31",
    note: "Zillow Observed Rent Index (ZORI), all homes, smoothed, Washington, DC metro area, month ending 2026-08-31 — the Washington, DC metro area's figure, shared with the MSA. Data: Zillow Research.",
  },
  { metric: "hud_fmr_fy2027_2br", metro: "Washington DC area", low: 2438, as_of: "2026-09-30", note: null },
];

/** The two further files' rows, as the same pull writes them. */
const MORE: BenchRow[] = [
  { metric: "zori_mfr_rent", metro: "Washington DC", low: 2150, as_of: "2026-08-31", note: "Zillow Observed Rent Index (ZORI), multifamily listings only, smoothed, Washington, DC metro area, month ending 2026-08-31. Data: Zillow Research." },
  { metric: "zori_mfr_rent_yoy", metro: "Washington DC", low: 1.1, as_of: "2026-08-31", note: null },
  { metric: "zhvi", metro: "Washington DC", low: 612300, as_of: "2026-08-31", note: "Zillow Home Value Index (ZHVI), all homes, mid-tier, smoothed and seasonally adjusted, Washington, DC metro area, month ending 2026-08-31. Data: Zillow Research." },
  { metric: "zhvi_yoy", metro: "Washington DC", low: -0.4, as_of: "2026-08-31", note: null },
];

describe("a metro's asking rent", () => {
  it("reads the rent and its change from the two rows", () => {
    const z = zoriFor(ROWS, "Washington DC", NOW)!;
    expect(z.rent).toBe(2412);
    expect(z.yoyPct).toBe(2.3);
    expect(z.asOf).toBe("2026-08-31");
    expect(z.shared).toBe(false);
  });

  it("says when the figure is the MSA's, shared with a suburb", () => {
    const z = zoriFor(ROWS, "Prince George's County MD", NOW)!;
    expect(z.rent).toBe(2412);
    expect(z.shared).toBe(true);
    // No y/y row was written for the suburb in this fixture — null, not zero.
    expect(z.yoyPct).toBeNull();
  });

  it("names Zillow's own metro area out of the row's note, so the line can say whose figure it is", () => {
    expect(zoriFor(ROWS, "Washington DC", NOW)!.area).toBe("Washington, DC");
    // A suburb's row names the MSA it shares, not the suburb.
    expect(zoriFor(ROWS, "Prince George's County MD", NOW)!.area).toBe("Washington, DC");
    // The note as scripts/fetch-zori.mjs writes it, for every shape of
    // RegionName the pull carries (a period in the city included).
    for (const region of ["St. Louis, MO", "Virginia Beach, VA", "Salt Lake City, UT", "New York, NY"]) {
      const note = `Zillow Observed Rent Index (ZORI), all homes, smoothed, ${region} metro area, month ending 2026-08-31. Data: Zillow Research.`;
      expect(zillowAreaOf(note)).toBe(region);
    }
    // A note that names no area names none — never a guess.
    expect(zillowAreaOf("")).toBeNull();
    expect(zillowAreaOf("Zillow Observed Rent Index (ZORI). Data: Zillow Research.")).toBeNull();
    expect(zoriFor([{ ...ROWS[0], note: null }], "Washington DC", NOW)!.area).toBeNull();
  });

  it("answers null for a metro with no row, or a row with no figure", () => {
    expect(zoriFor(ROWS, "Tulsa", NOW)).toBeNull();
    expect(zoriFor([{ ...ROWS[0], low: null }], "Washington DC", NOW)).toBeNull();
    expect(zoriFor([{ ...ROWS[0], low: 0 }], "Washington DC", NOW)).toBeNull();
    expect(zoriFor([{ ...ROWS[0], as_of: null }], "Washington DC", NOW)).toBeNull();
  });

  it("never mistakes the FMR row for the asking rent", () => {
    expect(zoriFor(ROWS.filter((r) => r.metric.startsWith("hud_")), "Washington DC", NOW)).toBeNull();
  });

  it("reads the apartment rent and the home value where the pull had them, and says the price-to-rent in years", () => {
    const z = zoriFor([...ROWS, ...MORE], "Washington DC", NOW)!;
    expect(z.mfrRent).toBe(2150);
    expect(z.mfrYoyPct).toBe(1.1);
    expect(z.homeValue).toBe(612_300);
    expect(z.homeValueYoyPct).toBe(-0.4);
    // 612,300 / (12 × 2,412) = 21.15… years of the all-homes asking rent.
    expect(z.priceToRentYears).toBe(21.2);
  });

  it("leaves a figure the pull did not write null, never zero", () => {
    const z = zoriFor(ROWS, "Washington DC", NOW)!;
    expect(z.mfrRent).toBeNull();
    expect(z.mfrYoyPct).toBeNull();
    expect(z.homeValue).toBeNull();
    expect(z.homeValueYoyPct).toBeNull();
    expect(z.priceToRentYears).toBeNull();
    // A zero or negative figure is not a figure either.
    const bad = zoriFor([...ROWS, { ...MORE[0], low: 0 }, { ...MORE[2], low: -1 }], "Washington DC", NOW)!;
    expect(bad.mfrRent).toBeNull();
    expect(bad.homeValue).toBeNull();
    expect(bad.priceToRentYears).toBeNull();
    // And the list the read asks for is the list the pull writes.
    expect([...ZILLOW_METRICS]).toEqual(["zori_rent", "zori_rent_yoy", "zori_mfr_rent", "zori_mfr_rent_yoy", "zhvi", "zhvi_yoy"]);
  });

  it("says a figure only while it is current — the feeds card's limit, on the reader's day", () => {
    const on = (day: string) => zoriFor([...ROWS, ...MORE], "Washington DC", new Date(`${day}T12:00:00Z`));
    // August's figure (Aug 31) is replaced by the pull of Oct 20, when it is
    // 50 days old; a missed pull leaves it standing, and past the grace it
    // is no longer said.
    expect(on("2026-10-20")?.rent).toBe(2412);
    expect(on("2026-10-25")?.rent).toBe(2412);
    expect(on("2026-10-26")).toBeNull();
    expect(ageDays("2026-08-31", new Date("2026-10-25T00:00:00Z"))).toBe(ZILLOW_FRESH_DAYS);
    expect(zillowFresh("2026-08-31", new Date("2026-10-25T00:00:00Z"))).toBe(true);
    expect(zillowFresh("2026-08-31", new Date("2026-10-26T00:00:00Z"))).toBe(false);
    // A March figure a dead file left behind is not said in September at all.
    expect(zoriFor([{ ...ROWS[0], as_of: "2026-03-31" }], "Washington DC", NOW)).toBeNull();
  });

  it("reads every other figure only where its own row is of the rent's month, never under the rent's month", () => {
    // The apartment file failed in April and the home value file last month:
    // their rows stand, dated their own months, beside this month's rent.
    const stale = [
      ...ROWS,
      { ...MORE[0], as_of: "2026-03-31" },
      { ...MORE[1], as_of: "2026-03-31" },
      { ...MORE[2], as_of: "2026-07-31" },
      { ...MORE[3], as_of: "2026-07-31" },
    ];
    const z = zoriFor(stale, "Washington DC", NOW)!;
    expect(z.rent).toBe(2412);
    expect(z.asOf).toBe("2026-08-31");
    expect(z.mfrRent).toBeNull();
    expect(z.mfrYoyPct).toBeNull();
    expect(z.homeValue).toBeNull();
    expect(z.homeValueYoyPct).toBeNull();
    expect(z.priceToRentYears).toBeNull();
    // A year-ago change the file could not compute this month is not last month's.
    const oldChange = zoriFor([ROWS[0], { ...ROWS[1], as_of: "2026-07-31", low: 9.9 }], "Washington DC", NOW)!;
    expect(oldChange.yoyPct).toBeNull();
  });

  it("gives the feeds card each file's month, current or not, and no row as null", () => {
    const rows = [...ROWS, { ...MORE[0], as_of: "2026-03-31" }];
    expect(zillowFileMonths(rows, "Washington DC")).toEqual([
      { label: "asking rent", asOf: "2026-08-31" },
      { label: "apartment asking rent", asOf: "2026-03-31" },
      { label: "home value", asOf: null },
    ]);
    // Every file the card judges is one the read asks for.
    for (const f of ZILLOW_FILES) expect(ZILLOW_METRICS as readonly string[]).toContain(f.metric);
  });

  it("names the month the figure is for, in UTC", () => {
    expect(monthOf("2026-08-31")).toBe("Aug 2026");
    expect(monthOf("2026-01-31")).toBe("Jan 2026");
    expect(monthOf("whenever")).toBe("whenever");
  });

  it("carries Zillow's condition for use", () => {
    expect(ZORI_CREDIT).toBe("Data: Zillow Research");
  });
});
