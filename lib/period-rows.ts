/**
 * The research rows in `benchmarks` whose `as_of` is the PERIOD their figure
 * is for — never the day the figure was read or last checked — and the rule
 * that the nightly steward leaves them alone.
 *
 * Most research rows carry `as_of` as the day the research was read, so a
 * re-verification that confirms one may fairly move it to today. These do
 * not:
 *
 *   - the 2–4 unit figures from the research file's on-market block (the
 *     median sale price, the closed sales a month and the active listings):
 *     single-month figures from Redfin's tracker, dated the last day of the
 *     month they are for (lib/research-data `twoToFourMedian`). The deal
 *     page names the median's month off `as_of` ("Median sale price of a 2–4
 *     unit property, May 2026", research-panel `benchRowLabel`), and the
 *     market page dates the 2–4 unit table by it;
 *   - the 30-year mortgage survey's checked-in snapshot: the week Freddie Mac
 *     published it, which the leverage check prints as the survey's date
 *     (lib/debt-index `benchmark30`).
 *
 * A "confirmed" verdict wrote today into `as_of`, so May's median read as
 * October's and an August survey week as today's; a "corrected" one wrote a
 * web search's figure over the publisher's under today's date. The period's
 * figure is the period's: a newer month is a new row from its source, never
 * an old row re-dated. So the steward leaves these out of its query, out of
 * its writes and once more in hand, beside the feed rows (lib/feed-rows).
 *
 * Imports nothing at run time: the steward loads it under plain Node.
 */

/** The metrics whose `as_of` is the period their figure is for. Held by a
 *  test to every metric a reader reads a period off. */
export const PERIOD_METRICS = [
  "median_sale_price_2_4_unit",
  "monthly_sales_2_4_unit",
  "active_listings_2_4_unit",
  "pmms_30y_fixed",
] as const;

/** A metric whose `as_of` is its figure's period — never the steward's to
 *  re-date or correct. */
export function isPeriodMetric(metric: string): boolean {
  return (PERIOD_METRICS as readonly string[]).includes(metric);
}

/** The period metrics as PostgREST's `not.in` takes them. */
export const PERIOD_METRICS_IN = `(${PERIOD_METRICS.map((m) => `"${m}"`).join(",")})`;

/** The one method of a PostgREST query builder the filter uses. */
interface Negatable<Q> {
  not(column: string, operator: string, value: string): Q;
}

/**
 * A `benchmarks` query — a select or an update — with every period row left
 * out IN THE DATABASE, so the steward's oldest rows are rows it may re-date,
 * and an update so filtered cannot touch a period row whatever id it is
 * handed.
 */
export function withoutPeriodRows<Q extends Negatable<Q>>(query: Q): Q {
  return query.not("metric", "in", PERIOD_METRICS_IN);
}
