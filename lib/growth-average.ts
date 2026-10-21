// A growth row's longer view (the review of 2026-10-21): the stress test's
// rent- and expense-growth rows are decided by ONE trailing year of a
// published series (the owner's rule), and a single year is a poor proxy for
// a rate run every year of a five-year hold. Where the stored history of the
// very series that decides holds two or more year-over-year changes a whole
// year apart, their compound average a year is shown beside it, deciding
// nothing: (1 + y₁)(1 + y₂)…(1 + yₙ) is the series' level now over its level
// n years earlier, so the n-th root less one is its average change a year
// over those n years — an average of published figures, never a forecast.
//
// What is held: the rates table keeps `HISTORY_ROWS` (data/fred-series.json
// `historyRows`, 40) observations a series as the read returns them. A
// series FRED transforms to its change from a year ago (`units: pc1`, the
// CPI's, a lessor index's) holds 40 monthly changes, so four a whole year
// apart (four years); one stored as its level and derived on read (`derived:
// "yoy"`, a metro's CPI rent) holds 28 changes, so three. Zillow's asking
// rents keep the newest month alone (one `benchmarks` row a metric, upserted
// on its key), so no average is ever struck on them. Nothing here fetches.
//
// Pure: no imports.

/** Under this many whole years no average is struck: one year is the
 *  deciding figure itself. */
export const GROWTH_AVERAGE_MIN_YEARS = 2;

export interface GrowthAverage {
  /** how many year-over-year changes, a whole year apart, the average is of */
  years: number;
  /** the compound average change a year, percent */
  pct: number;
  /** the newest change's date, ISO: the period the average runs to */
  to: string;
  /** the changes compounded, newest first, each the published figure as
   *  stored (percent against a year earlier) on its own date */
  changes: { obsDate: string; value: number }[];
}

/**
 * The compound average a year of a series' year-over-year changes, from its
 * newest observation back a whole year at a time while each year's same
 * month (or quarter) is held: a gap ends the run, so no year is skipped and
 * none is taken from a neighbouring month. Null under
 * `GROWTH_AVERAGE_MIN_YEARS`, on a date that is no ISO day, or where a change
 * of −100% or less makes the product no level.
 */
export function compoundYearOverYear(r: { obsDate: string; history: readonly { obsDate: string; value: number }[] }): GrowthAverage | null {
  const m = /^(\d{4})(-\d{2}-\d{2})$/.exec(r.obsDate);
  if (!m) return null;
  const byDate = new Map<string, number>();
  for (const o of r.history) if (Number.isFinite(o.value)) byDate.set(o.obsDate, o.value);
  const changes: GrowthAverage["changes"] = [];
  for (let k = 0; ; k++) {
    const d = `${Number(m[1]) - k}${m[2]}`;
    const v = byDate.get(d);
    if (v == null) break;
    changes.push({ obsDate: d, value: v });
  }
  if (changes.length < GROWTH_AVERAGE_MIN_YEARS) return null;
  const product = changes.reduce((p, c) => p * (1 + c.value / 100), 1);
  if (!(product > 0)) return null;
  const pct = (product ** (1 / changes.length) - 1) * 100;
  return Number.isFinite(pct) ? { years: changes.length, pct, to: r.obsDate, changes } : null;
}
