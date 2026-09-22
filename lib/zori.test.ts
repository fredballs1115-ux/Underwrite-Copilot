import { describe, expect, it } from "vitest";
import { ZILLOW_METRICS, ZORI_CREDIT, monthOf, zoriFor, type BenchRow } from "./zori";

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
  { metric: "hud_fmr_fy2026_2br", metro: "Washington DC", low: 2100, as_of: "2026-09-03", note: null },
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
    const z = zoriFor(ROWS, "Washington DC")!;
    expect(z.rent).toBe(2412);
    expect(z.yoyPct).toBe(2.3);
    expect(z.asOf).toBe("2026-08-31");
    expect(z.shared).toBe(false);
  });

  it("says when the figure is the MSA's, shared with a suburb", () => {
    const z = zoriFor(ROWS, "Prince George's County MD")!;
    expect(z.rent).toBe(2412);
    expect(z.shared).toBe(true);
    // No y/y row was written for the suburb in this fixture — null, not zero.
    expect(z.yoyPct).toBeNull();
  });

  it("answers null for a metro with no row, or a row with no figure", () => {
    expect(zoriFor(ROWS, "Tulsa")).toBeNull();
    expect(zoriFor([{ ...ROWS[0], low: null }], "Washington DC")).toBeNull();
    expect(zoriFor([{ ...ROWS[0], low: 0 }], "Washington DC")).toBeNull();
    expect(zoriFor([{ ...ROWS[0], as_of: null }], "Washington DC")).toBeNull();
  });

  it("never mistakes the FMR row for the asking rent", () => {
    expect(zoriFor(ROWS.filter((r) => r.metric.startsWith("hud_")), "Washington DC")).toBeNull();
  });

  it("reads the apartment rent and the home value where the pull had them, and says the price-to-rent in years", () => {
    const z = zoriFor([...ROWS, ...MORE], "Washington DC")!;
    expect(z.mfrRent).toBe(2150);
    expect(z.mfrYoyPct).toBe(1.1);
    expect(z.homeValue).toBe(612_300);
    expect(z.homeValueYoyPct).toBe(-0.4);
    // 612,300 / (12 × 2,412) = 21.15… years of the all-homes asking rent.
    expect(z.priceToRentYears).toBe(21.2);
  });

  it("leaves a figure the pull did not write null, never zero", () => {
    const z = zoriFor(ROWS, "Washington DC")!;
    expect(z.mfrRent).toBeNull();
    expect(z.mfrYoyPct).toBeNull();
    expect(z.homeValue).toBeNull();
    expect(z.homeValueYoyPct).toBeNull();
    expect(z.priceToRentYears).toBeNull();
    // A zero or negative figure is not a figure either.
    const bad = zoriFor([...ROWS, { ...MORE[0], low: 0 }, { ...MORE[2], low: -1 }], "Washington DC")!;
    expect(bad.mfrRent).toBeNull();
    expect(bad.homeValue).toBeNull();
    expect(bad.priceToRentYears).toBeNull();
    // And the list the read asks for is the list the pull writes.
    expect([...ZILLOW_METRICS]).toEqual(["zori_rent", "zori_rent_yoy", "zori_mfr_rent", "zori_mfr_rent_yoy", "zhvi", "zhvi_yoy"]);
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
