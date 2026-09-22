import { describe, expect, it } from "vitest";
import { REALTOR_CREDIT, REALTOR_METRICS, marketDirection, realtorFor } from "./realtor";
import type { BenchRow } from "./zori";

/** Rows as scripts/fetch-realtor.mjs writes them — Dallas's August 2026 figures, from the runner's probe. */
const ROWS: BenchRow[] = [
  { metric: "rdc_median_list_price", metro: "Dallas-Fort Worth", low: 425000, as_of: "2026-08-01", note: "Realtor.com inventory, Dallas-Fort Worth-Arlington, TX metro area, August 2026. Data: Realtor.com." },
  { metric: "rdc_median_list_price_yoy", metro: "Dallas-Fort Worth", low: -1.2, as_of: "2026-08-01", note: null },
  { metric: "rdc_active_listings", metro: "Dallas-Fort Worth", low: 29549, as_of: "2026-08-01", note: null },
  { metric: "rdc_active_listings_yoy", metro: "Dallas-Fort Worth", low: -4.4, as_of: "2026-08-01", note: null },
  { metric: "rdc_days_on_market", metro: "Dallas-Fort Worth", low: 58, as_of: "2026-08-01", note: null },
  { metric: "rdc_days_on_market_yoy", metro: "Dallas-Fort Worth", low: 0, as_of: "2026-08-01", note: null },
  { metric: "zori_rent", metro: "Dallas-Fort Worth", low: 1659, as_of: "2026-08-31", note: null },
];

describe("a metro's for-sale market", () => {
  it("reads the price, the listings and the days on market with their changes", () => {
    const r = realtorFor(ROWS, "Dallas-Fort Worth")!;
    expect(r.medianListPrice).toBe(425_000);
    expect(r.medianListPriceYoyPct).toBe(-1.2);
    expect(r.activeListings).toBe(29_549);
    expect(r.activeListingsYoyPct).toBe(-4.4);
    expect(r.daysOnMarket).toBe(58);
    expect(r.daysOnMarketYoyPct).toBe(0);
    expect(r.asOf).toBe("2026-08-01");
    expect(r.shared).toBe(false);
    // Fewer listings but no faster to sell: not clearly either way.
    expect(r.direction).toBe("mixed");
  });

  it("calls the direction only with both flow changes, and never from the price", () => {
    expect(marketDirection(3.1, 8.0)).toBe("loosening");
    expect(marketDirection(-4.4, -6.0)).toBe("tightening");
    expect(marketDirection(-4.4, 6.0)).toBe("mixed");
    expect(marketDirection(0, 6.0)).toBe("mixed");
    expect(marketDirection(null, 6.0)).toBeNull();
    expect(marketDirection(3.1, null)).toBeNull();
    const priceOnly = realtorFor(ROWS.filter((x) => x.metric.startsWith("rdc_median")), "Dallas-Fort Worth")!;
    expect(priceOnly.activeListings).toBeNull();
    expect(priceOnly.daysOnMarket).toBeNull();
    expect(priceOnly.direction).toBeNull();
  });

  it("answers null for a metro with no row, or a row with no figure, and never reads a Zillow row as its own", () => {
    expect(realtorFor(ROWS, "Tulsa")).toBeNull();
    expect(realtorFor([{ ...ROWS[0], low: null }], "Dallas-Fort Worth")).toBeNull();
    expect(realtorFor([{ ...ROWS[0], low: 0 }], "Dallas-Fort Worth")).toBeNull();
    expect(realtorFor([{ ...ROWS[0], as_of: null }], "Dallas-Fort Worth")).toBeNull();
    expect(realtorFor(ROWS.filter((x) => x.metric.startsWith("zori_")), "Dallas-Fort Worth")).toBeNull();
  });

  it("says when the figures are the MSA's, shared with a suburb", () => {
    const shared = realtorFor(
      [{ ...ROWS[0], metro: "Northern Virginia", note: "Realtor.com inventory, Washington-Arlington-Alexandria, DC-VA-MD-WV metro area, August 2026 — the Washington metro area's figure, shared with the MSA. Data: Realtor.com." }],
      "Northern Virginia",
    )!;
    expect(shared.shared).toBe(true);
  });

  it("carries Realtor.com's condition for use, and one list of metrics", () => {
    expect(REALTOR_CREDIT).toBe("Data: Realtor.com");
    expect([...REALTOR_METRICS]).toEqual([
      "rdc_median_list_price",
      "rdc_median_list_price_yoy",
      "rdc_active_listings",
      "rdc_active_listings_yoy",
      "rdc_days_on_market",
      "rdc_days_on_market_yoy",
    ]);
  });
});
