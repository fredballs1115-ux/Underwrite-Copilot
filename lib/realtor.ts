/**
 * A covered metro's for-sale market this month, from Realtor.com's
 * inventory file: the median list price, the active listings, the days a
 * listing sits, each against a year ago.
 *
 * THE FOR-SALE MARKET IS THE OTHER SIDE OF THE RENTER'S DECISION, and the
 * Zillow line above it on the market brief already says the price side (a
 * typical home in years of rent). This is the flow: a market where
 * listings pile up and sit longer is loosening, and a loosening for-sale
 * market is one a renter can buy into; one where listings fall and clear
 * faster keeps them renting. Neither is a rent forecast — it is the demand
 * side an apartment underwrite is quietly assuming.
 *
 * Realtor.com publishes the file monthly, one month per file with the
 * year-ago change already in it as a fraction; the pull stores the figure
 * and the change as a percent, one place. Free to use with attribution,
 * which is why the credit is part of the component. Pure: the page reads
 * the `benchmarks` rows the pull writes (`scripts/fetch-realtor.mjs`) and
 * hands them in. A row the pull did not write is null — never zero.
 *
 * The figure is an MSA figure, matched by CBSA code and checked against
 * the title the file carries; the four Washington suburbs and Newark share
 * their MSA's row, and the row's note says so.
 */

import type { BenchRow } from "@/lib/zori";

export interface RealtorRead {
  /** Median list price, dollars, whole. */
  medianListPrice: number;
  medianListPriceYoyPct: number | null;
  /** Active listings in the month, a count. */
  activeListings: number | null;
  activeListingsYoyPct: number | null;
  /** Median days on market. */
  daysOnMarket: number | null;
  daysOnMarketYoyPct: number | null;
  /** The month the figures are for. */
  asOf: string;
  /** The row's own note: the metro area named, and whether it is shared. */
  note: string;
  shared: boolean;
  /** What the two flow figures say together, where both have a change. */
  direction: "loosening" | "tightening" | "mixed" | null;
}

/** Realtor.com's condition for using the data: say where it came from. */
export const REALTOR_CREDIT = "Data: Realtor.com";
export const REALTOR_SOURCE_URL = "https://www.realtor.com/research/data/";

/** The metrics the pull writes and this reads — one list, so the read cannot ask for a row the pull does not write. */
export const REALTOR_METRICS = [
  "rdc_median_list_price",
  "rdc_median_list_price_yoy",
  "rdc_active_listings",
  "rdc_active_listings_yoy",
  "rdc_days_on_market",
  "rdc_days_on_market_yoy",
] as const;

function figure(rows: readonly BenchRow[], metroName: string, metric: string): number | null {
  const r = rows.find((x) => x.metro === metroName && x.metric === metric);
  return r && typeof r.low === "number" && Number.isFinite(r.low) ? r.low : null;
}

/**
 * Loosening is more listings AND longer to sell; tightening is fewer and
 * faster. One of each is mixed, and without both changes there is no call
 * — a direction is a claim, and half the evidence is not enough for one.
 */
export function marketDirection(
  activeListingsYoyPct: number | null,
  daysOnMarketYoyPct: number | null,
): RealtorRead["direction"] {
  if (activeListingsYoyPct === null || daysOnMarketYoyPct === null) return null;
  if (activeListingsYoyPct > 0 && daysOnMarketYoyPct > 0) return "loosening";
  if (activeListingsYoyPct < 0 && daysOnMarketYoyPct < 0) return "tightening";
  return "mixed";
}

export function realtorFor(rows: readonly BenchRow[], metroName: string): RealtorRead | null {
  const price = rows.find((r) => r.metro === metroName && r.metric === "rdc_median_list_price");
  if (!price || typeof price.low !== "number" || !Number.isFinite(price.low) || price.low <= 0 || !price.as_of) {
    return null;
  }
  const listings = figure(rows, metroName, "rdc_active_listings");
  const dom = figure(rows, metroName, "rdc_days_on_market");
  const listingsYoy = figure(rows, metroName, "rdc_active_listings_yoy");
  const domYoy = figure(rows, metroName, "rdc_days_on_market_yoy");
  return {
    medianListPrice: Math.round(price.low),
    medianListPriceYoyPct: figure(rows, metroName, "rdc_median_list_price_yoy"),
    activeListings: listings !== null && listings >= 0 ? Math.round(listings) : null,
    activeListingsYoyPct: listingsYoy,
    daysOnMarket: dom !== null && dom >= 0 ? Math.round(dom) : null,
    daysOnMarketYoyPct: domYoy,
    asOf: price.as_of,
    note: price.note ?? "",
    shared: /shared with the MSA/i.test(price.note ?? ""),
    direction: marketDirection(listingsYoy, domYoy),
  };
}
