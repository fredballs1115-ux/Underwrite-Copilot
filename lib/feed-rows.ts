/**
 * The rows a feed pull writes into `benchmarks`, and the rule that they are
 * the pull's alone.
 *
 * Three publishers' figures reach the table on schedules of their own —
 * Zillow's (scripts/fetch-zori.mjs), Realtor.com's (scripts/fetch-realtor.mjs)
 * and HUD's fair market rents (scripts/fetch-fmr.mjs, and the seed script
 * from the research files, both through lib/fmr's `fmrRows`) — beside the
 * research rows the seed script writes. A feed row is dated by its
 * publisher and replaced by the next run. Nothing else may re-date it or
 * change its figure.
 *
 * The nightly steward broke that (the audit of 2026-09-30). It re-verified
 * the three OLDEST rows in the table against a web search every night, and
 * the oldest were always Realtor.com's year-ago hotness ranks, dated a year
 * back by design. A "confirmed" verdict moved a publisher's observation to
 * today; a "corrected" one wrote whatever the search found over Zillow's,
 * Realtor.com's or HUD's own figure; and the year-ago rows kept the
 * 180-day research count tripped every night whatever else was true.
 *
 * So this is the one list of what the pulls write: the pulls refuse to
 * write a metric it does not name, the reads ask for exactly these, and the
 * steward leaves every one of them alone — in its query, in its writes and
 * again in its own hands. The year-ago rows are named apart, for the count.
 *
 * Imports nothing at run time: the pulls and the steward load it under
 * plain Node, where an `@/` import cannot resolve.
 */

/** Zillow's metrics: the pull writes these and no other, and the read asks
 *  for exactly these (re-exported by lib/zori). */
export const ZILLOW_METRICS = [
  "zori_rent",
  "zori_rent_yoy",
  "zori_mfr_rent",
  "zori_mfr_rent_yoy",
  "zhvi",
  "zhvi_yoy",
] as const;

/** Realtor.com's metrics: the pull writes these and no other, and the read
 *  asks for exactly these (re-exported by lib/realtor). */
export const REALTOR_METRICS = [
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
] as const;

/** Rows a pull dates a year before its run on purpose: the hotness rank the
 *  same month a year earlier, the other half of the move it reads. Always
 *  past 180 days, so the research rule's count cannot read them. */
export const YEAR_AGO_METRICS = ["rdc_hotness_rank_prior"] as const;

/** HUD's fair market rents, one metric a fiscal year and bedroom count —
 *  the shape lib/fmr's `fmrMetric` writes, which a test holds this to. */
const FMR_METRIC = /^hud_fmr_fy\d{4}_[0-4]br$/;

const LISTED: ReadonlySet<string> = new Set<string>([...ZILLOW_METRICS, ...REALTOR_METRICS]);

/** A metric a feed pull writes — the pull's to date and to replace, never
 *  the steward's to re-verify, re-date or correct. */
export function isFeedMetric(metric: string): boolean {
  return LISTED.has(metric) || FMR_METRIC.test(metric);
}

/** A metric a pull dates a year back by design. */
export function isYearAgoMetric(metric: string): boolean {
  return (YEAR_AGO_METRICS as readonly string[]).includes(metric);
}

/** A PostgREST `in` list, each value quoted: `("zori_rent","zhvi")`. */
function inList(values: readonly string[]): string {
  return `(${values.map((v) => `"${v}"`).join(",")})`;
}

/** The listed feed metrics as PostgREST's `not.in` takes them. */
export const FEED_METRICS_IN = inList([...ZILLOW_METRICS, ...REALTOR_METRICS]);
/** HUD's fair market rents as PostgREST's `not.like` takes them. */
export const FMR_METRICS_LIKE = "hud_fmr_fy%";
/** The year-ago metrics as PostgREST's `not.in` takes them. */
export const YEAR_AGO_METRICS_IN = inList(YEAR_AGO_METRICS);

/** The one method of a PostgREST query builder the filters below use. */
interface Negatable<Q> {
  not(column: string, operator: string, value: string): Q;
}

/**
 * A `benchmarks` query — a select, a count or an update — with every feed
 * row left out IN THE DATABASE: the steward's "three oldest" must be three
 * research rows, not three feed rows filtered away after the fact, and an
 * update so filtered cannot touch a feed row whatever id it is handed.
 */
export function withoutFeedRows<Q extends Negatable<Q>>(query: Q): Q {
  return query.not("metric", "in", FEED_METRICS_IN).not("metric", "like", FMR_METRICS_LIKE);
}

/** A `benchmarks` query with the year-ago rows left out — the 180-day
 *  research count's, which they would trip every night. */
export function withoutYearAgoRows<Q extends Negatable<Q>>(query: Q): Q {
  return query.not("metric", "in", YEAR_AGO_METRICS_IN);
}
