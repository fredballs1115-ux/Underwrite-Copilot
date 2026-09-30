import { describe, expect, it } from "vitest";
import { HOTNESS_METROS, REALTOR_CREDIT, REALTOR_FILES, REALTOR_METRICS, hotnessFor, hotnessMove, marketDirection, realtorFileMonths, realtorFor } from "./realtor";
import type { BenchRow } from "./zori";

/** The day the fixtures are read on: the pull of Sep 8 wrote August, dated its first day. */
const NOW = new Date("2026-09-23T12:00:00Z");

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
    const r = realtorFor(ROWS, "Dallas-Fort Worth", NOW)!;
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
    const priceOnly = realtorFor(ROWS.filter((x) => x.metric.startsWith("rdc_median")), "Dallas-Fort Worth", NOW)!;
    expect(priceOnly.activeListings).toBeNull();
    expect(priceOnly.daysOnMarket).toBeNull();
    expect(priceOnly.direction).toBeNull();
  });

  it("answers null for a metro with no row, or a row with no figure, and never reads a Zillow row as its own", () => {
    expect(realtorFor(ROWS, "Tulsa", NOW)).toBeNull();
    expect(realtorFor([{ ...ROWS[0], low: null }], "Dallas-Fort Worth", NOW)).toBeNull();
    expect(realtorFor([{ ...ROWS[0], low: 0 }], "Dallas-Fort Worth", NOW)).toBeNull();
    expect(realtorFor([{ ...ROWS[0], as_of: null }], "Dallas-Fort Worth", NOW)).toBeNull();
    expect(realtorFor(ROWS.filter((x) => x.metric.startsWith("zori_")), "Dallas-Fort Worth", NOW)).toBeNull();
  });

  it("says when the figures are the MSA's, shared with a suburb", () => {
    const shared = realtorFor(
      [{ ...ROWS[0], metro: "Northern Virginia", note: "Realtor.com inventory, Washington-Arlington-Alexandria, DC-VA-MD-WV metro area, August 2026 — the Washington metro area's figure, shared with the MSA. Data: Realtor.com." }],
      "Northern Virginia",
      NOW,
    )!;
    expect(shared.shared).toBe(true);
  });

  it("says the for-sale market only while it is current — the feeds card's limit, on the reader's day", () => {
    const on = (day: string) => realtorFor(ROWS, "Dallas-Fort Worth", new Date(`${day}T12:00:00Z`));
    // August's figures (Aug 1) are replaced by the pull of Oct 8; on Sep 30,
    // 60 days on, they are current, where the old 45-day limit had them stale.
    expect(on("2026-09-30")?.medianListPrice).toBe(425_000);
    // Past its successor's day by the grace, it is no longer said.
    expect(on("2026-10-13")?.medianListPrice).toBe(425_000);
    expect(on("2026-10-14")).toBeNull();
    // A January figure a dead pull left behind is not said in September.
    expect(realtorFor(ROWS.map((x) => ({ ...x, as_of: "2026-01-01" })), "Dallas-Fort Worth", NOW)).toBeNull();
  });

  it("reads each inventory figure only where its own row is of the list price's month", () => {
    // The listings and their change were not in this month's file for the
    // metro, so last month's rows stand beside this month's price.
    const mixed = ROWS.map((x) => (x.metric.startsWith("rdc_active_listings") ? { ...x, as_of: "2026-07-01", low: 999 } : x));
    const r = realtorFor(mixed, "Dallas-Fort Worth", NOW)!;
    expect(r.asOf).toBe("2026-08-01");
    expect(r.medianListPrice).toBe(425_000);
    expect(r.activeListings).toBeNull();
    expect(r.activeListingsYoyPct).toBeNull();
    expect(r.daysOnMarket).toBe(58);
    // Half the flow evidence is not a call.
    expect(r.direction).toBeNull();
  });

  it("gives the feeds card each file's month, current or not", () => {
    expect(realtorFileMonths(ROWS, "Dallas-Fort Worth")).toEqual([
      { label: "inventory", asOf: "2026-08-01" },
      { label: "hotness rank", asOf: null },
    ]);
    for (const f of REALTOR_FILES) expect(REALTOR_METRICS as readonly string[]).toContain(f.metric);
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
      "rdc_hotness_rank",
      "rdc_hotness_rank_prior",
      "rdc_views_per_listing_vs_us",
      "rdc_days_on_market_vs_us",
    ]);
  });
});

/** The hotness rows as the pull writes them — Washington's August 2026 row
 *  from the runner's probe: rank 154, 0.649 views per property against the
 *  U.S., 17 fewer days on market; the rank a year earlier is the history's. */
const HOT: BenchRow[] = [
  { metric: "rdc_median_list_price", metro: "Washington DC", low: 565000, as_of: "2026-08-01", note: "Realtor.com inventory, Washington-Arlington-Alexandria, DC-VA-MD-WV metro area, August 2026. Data: Realtor.com." },
  { metric: "rdc_hotness_rank", metro: "Washington DC", low: 154, as_of: "2026-08-01", note: "Realtor.com hotness rank of the 300 largest metros, Washington-Arlington-Alexandria, DC-VA-MD-WV metro area, August 2026. Data: Realtor.com." },
  { metric: "rdc_hotness_rank_prior", metro: "Washington DC", low: 142, as_of: "2025-08-01", note: null },
  { metric: "rdc_views_per_listing_vs_us", metro: "Washington DC", low: 0.649, as_of: "2026-08-01", note: null },
  { metric: "rdc_days_on_market_vs_us", metro: "Washington DC", low: -17, as_of: "2026-08-01", note: null },
];

describe("a metro's hotness rank, and which way it moved", () => {
  it("reads the rank, the year-ago rank and the two parts, and subtracts the move itself", () => {
    const h = hotnessFor(HOT, "Washington DC", NOW)!;
    expect(h.rank).toBe(154);
    expect(h.priorRank).toBe(142);
    // 142 → 154 is twelve places DOWN the ranking: cooler.
    expect(h.move).toEqual({ places: -12, direction: "cooler" });
    expect(h.viewsVsUs).toBe(0.649);
    expect(h.domVsUsDays).toBe(-17);
    expect(h.asOf).toBe("2026-08-01");
    expect(realtorFor(HOT, "Washington DC", NOW)?.hotness?.rank).toBe(154);
  });

  it("a smaller rank is hotter, which is the easy thing to get backwards", () => {
    expect(hotnessMove(120, 142)).toEqual({ places: 22, direction: "hotter" });
    expect(hotnessMove(142, 142)).toEqual({ places: 0, direction: "unchanged" });
    expect(hotnessMove(154, null)).toBeNull();
    expect(hotnessMove(null, 142)).toBeNull();
  });

  it("answers null with no rank, and only what the pull had otherwise", () => {
    expect(hotnessFor(HOT.filter((x) => x.metric !== "rdc_hotness_rank"), "Washington DC", NOW)).toBeNull();
    expect(hotnessFor(HOT.map((x) => (x.metric === "rdc_hotness_rank" ? { ...x, low: HOTNESS_METROS + 1 } : x)), "Washington DC", NOW)).toBeNull();
    expect(hotnessFor(HOT.map((x) => (x.metric === "rdc_hotness_rank" ? { ...x, as_of: null } : x)), "Washington DC", NOW)).toBeNull();
    const rankOnly = hotnessFor(HOT.filter((x) => x.metric === "rdc_hotness_rank"), "Washington DC", NOW)!;
    expect(rankOnly.priorRank).toBeNull();
    expect(rankOnly.move).toBeNull();
    expect(rankOnly.viewsVsUs).toBeNull();
    expect(rankOnly.domVsUsDays).toBeNull();
    // The for-sale read still stands without a rank.
    expect(realtorFor(HOT.slice(0, 1), "Washington DC", NOW)?.hotness).toBeNull();
  });

  it("keeps the rank's own month, which its own file can leave a month behind the inventory's", () => {
    // The hotness history had not moved on when the pull of Sep 8 ran:
    // July's rank beside August's inventory, read two days later.
    const july = HOT.map((x) =>
      x.metric === "rdc_hotness_rank_prior" ? { ...x, as_of: "2025-07-01" } : x.metric === "rdc_median_list_price" ? x : { ...x, as_of: "2026-07-01" },
    );
    const r = realtorFor(july, "Washington DC", new Date("2026-09-10T12:00:00Z"))!;
    expect(r.asOf).toBe("2026-08-01");
    expect(r.hotness?.asOf).toBe("2026-07-01");
    expect(r.hotness?.move).toEqual({ places: -12, direction: "cooler" });
    // July's rank was due to be replaced on Sep 8; past the grace it is not
    // said, whatever the inventory's month, and the inventory still is.
    expect(hotnessFor(july, "Washington DC", new Date("2026-09-12T12:00:00Z"))?.rank).toBe(154);
    expect(hotnessFor(july, "Washington DC", new Date("2026-09-13T12:00:00Z"))).toBeNull();
    const later = realtorFor(july, "Washington DC", NOW)!;
    expect(later.medianListPrice).toBe(565_000);
    expect(later.hotness).toBeNull();
  });

  it("reads the parts only of the rank's month, and a move only from ranks a year apart", () => {
    // The prior rank a run could not find this month stands from an earlier
    // run: July 2025's beside August 2026's rank is no year's move.
    const stalePrior = HOT.map((x) => (x.metric === "rdc_hotness_rank_prior" ? { ...x, as_of: "2025-07-01" } : x));
    const h = hotnessFor(stalePrior, "Washington DC", NOW)!;
    expect(h.rank).toBe(154);
    expect(h.priorRank).toBeNull();
    expect(h.move).toBeNull();
    // Views and days against the U.S. of another month are not this rank's parts.
    const staleParts = HOT.map((x) => (x.metric.endsWith("_vs_us") ? { ...x, as_of: "2026-07-01" } : x));
    const parts = hotnessFor(staleParts, "Washington DC", NOW)!;
    expect(parts.viewsVsUs).toBeNull();
    expect(parts.domVsUsDays).toBeNull();
    expect(parts.priorRank).toBe(142);
  });
});
