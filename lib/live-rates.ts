/**
 * Today's rates, and which of them may become a number in a box.
 *
 * The site pulls four FRED series on a weekday cron (`scripts/fetch-rates.mjs`
 * → the `rates` table). Until now they were shown on `/market` and read by the
 * deal page's leverage check. `/tools` — the page whose whole purpose is that
 * an analyst never leaves the site — was still asking that analyst to type a
 * Treasury rate it already knew.
 *
 * This module is the pure half: what the series are, how old a figure is, and
 * the two rules that decide what may be done with it.
 *
 * **Rule 1 — a benchmark is not a quote.** Two of the four are rates a loan
 * document actually references: a yield-maintenance clause prices off the
 * Treasury by name, and a floating-rate note floats over SOFR by name. The
 * other two are context. The 30-year mortgage survey is an owner-occupier
 * residential rate — `lib/leverage.ts` is already careful that investor debt
 * prices ABOVE it, which is why its read there is deliberately one-sided — and
 * the delinquency rate is a condition statistic, not a price. So PMMS and the
 * delinquency rate are SHOWN and never SEEDED: putting a residential survey
 * into a field labelled "loan rate" would be wrong by a spread nobody typed,
 * and wrong invisibly, because the figure would look like it came from
 * somewhere authoritative. `contractRate` draws that line.
 *
 * **Rule 2 — stale is per series, because the cadence is.** A uniform
 * threshold is wrong in both directions at once. The Treasury and SOFR post
 * every business day, so a figure a week old means the pull is broken; the
 * mortgage survey posts weekly, so a seven-day-old figure is the current one;
 * the CRE delinquency rate is QUARTERLY, so the April observation that a
 * September pull returns is perfectly fresh and five months old. Judge all
 * four at five days and three of them are permanently broken. Judge all four
 * at a quarter and a dead daily feed goes unnoticed until the next season.
 * So the threshold is a property of the series.
 *
 * The quarterly one is worth spelling out, because the obvious number is
 * wrong and was written here first. A quarterly observation is dated the
 * FIRST day of the quarter it describes, and it publishes about two months
 * after that quarter ENDS — so the Q2 figure dated April 1 is the newest one
 * available from late August until late November, by which time it is eight
 * months old and still current. A threshold of one quarter would have
 * reported the feed broken on the day it shipped.
 *
 * A stale figure still SHOWS, with its date — an analyst who can see that the
 * Treasury stopped updating a fortnight ago has learned something. It just
 * stops seeding, because a date beside a figure is read and a figure inside a
 * form field is not.
 */

export type Cadence = "daily" | "weekly" | "quarterly";

export interface SeriesMeta {
  /** FRED series id, and the primary key in the `rates` table. */
  id: string;
  /** What the strip calls it. */
  short: string;
  /** Roughly what FRED calls it, for the title attribute. */
  label: string;
  cadence: Cadence;
  /**
   * Past this many days old the series has stopped, and the figure stops
   * seeding a field. One full publication cycle plus margin — for a daily
   * series that is a long holiday weekend, for a quarterly one it is the
   * quarter's own span plus the lag before it is released.
   */
  freshDays: number;
  /**
   * Whether a loan document references this rate by name. Only a contract
   * rate may pre-fill a calculator field — see rule 1 above.
   */
  contractRate: boolean;
}

/** The four the cron pulls, in the order the strip shows them. */
export const SERIES: readonly SeriesMeta[] = [
  {
    id: "DGS10",
    short: "10-yr Treasury",
    label: "10-Year Treasury Constant Maturity",
    cadence: "daily",
    // Six, not one: the pull runs mid-morning Eastern, before the day's
    // release, so a Tuesday read after a holiday Monday legitimately returns
    // the previous Thursday's figure.
    freshDays: 6,
    contractRate: true,
  },
  {
    id: "SOFR",
    short: "SOFR",
    label: "Secured Overnight Financing Rate",
    cadence: "daily",
    freshDays: 6,
    contractRate: true,
  },
  {
    id: "MORTGAGE30US",
    short: "30-yr fixed",
    label: "Freddie Mac PMMS 30-Year Fixed — a residential survey, not a CRE quote",
    cadence: "weekly",
    freshDays: 10,
    contractRate: false,
  },
  {
    id: "DRCRELEXFACBS",
    short: "CRE delinquency",
    label: "CRE Loan Delinquency Rate, All Commercial Banks",
    cadence: "quarterly",
    // Dated the quarter's first day, published about two months after that
    // quarter ends: the April figure is the newest one available until late
    // November, at which point it is eight months old and current. Only past
    // a whole further cycle has the feed actually stopped.
    freshDays: 300,
    contractRate: false,
  },
] as const;

export function seriesMeta(id: string): SeriesMeta | null {
  return SERIES.find((s) => s.id === id) ?? null;
}

/** A row as the `rates` table stores it. */
export interface RateRow {
  series_id: string;
  obs_date: string;
  value: number;
}

export interface LiveRate {
  meta: SeriesMeta;
  /** The observation's own date, which is not the day it was pulled. */
  obsDate: string;
  value: number;
  ageDays: number;
  /** Young enough for its own cadence. */
  fresh: boolean;
  /**
   * Move since the previous observation of the same series, in basis points.
   * Null where the table holds only one — a blank is null, never zero.
   */
  moveBps: number | null;
}

const DAY = 86_400_000;

/**
 * Whole days between an observation date and now, in UTC.
 *
 * FRED dates are plain calendar days with no zone, so they are compared at
 * UTC midnight. A negative age (an observation dated tomorrow) is clamped to
 * zero rather than treated as an error: it is what a timezone edge looks
 * like, and it is not worth refusing a good figure over.
 */
export function ageDays(obsDate: string, now: Date): number {
  const at = Date.parse(`${obsDate}T00:00:00Z`);
  if (!Number.isFinite(at)) return Number.POSITIVE_INFINITY;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - at) / DAY));
}

/**
 * The newest observation per known series, with its age, its freshness and
 * its move since the observation before it.
 *
 * Rows arrive newest-first from the query, but nothing here depends on that:
 * they are sorted per series, so a query that changes its order cannot
 * quietly start reporting the oldest figure as today's.
 */
export function readRates(rows: readonly RateRow[], now: Date): LiveRate[] {
  const out: LiveRate[] = [];
  for (const meta of SERIES) {
    const mine = rows
      .filter(
        (r) =>
          r.series_id === meta.id &&
          typeof r.obs_date === "string" &&
          Number.isFinite(r.value),
      )
      .sort((a, b) => (a.obs_date < b.obs_date ? 1 : a.obs_date > b.obs_date ? -1 : 0));
    const newest = mine[0];
    if (!newest) continue;
    const prior = mine.find((r) => r.obs_date !== newest.obs_date);
    const age = ageDays(newest.obs_date, now);
    out.push({
      meta,
      obsDate: newest.obs_date,
      value: newest.value,
      ageDays: age,
      fresh: age <= meta.freshDays,
      moveBps: prior ? Math.round((newest.value - prior.value) * 100) : null,
    });
  }
  return out;
}

/**
 * The figure a field may start from: a contract rate, fresh for its own
 * cadence, and inside the range a rate can plausibly take.
 *
 * Everything else answers null and the field keeps its worked example. A
 * seed is a claim about today, so it is made only where all three hold.
 */
export function seedRate(rates: readonly LiveRate[], id: string): number | null {
  const found = rates.find((r) => r.meta.id === id);
  if (!found || !found.meta.contractRate || !found.fresh) return null;
  if (!Number.isFinite(found.value) || found.value <= 0 || found.value > 25) return null;
  return found.value;
}

/** The seeds `/tools` passes into its cards. Null for any that did not qualify. */
export interface RateSeeds {
  treasury10yPct: number | null;
  sofrPct: number | null;
  /** The observation date behind whichever seeds were given, for the note. */
  treasury10yAsOf: string | null;
  sofrAsOf: string | null;
}

export function rateSeeds(rates: readonly LiveRate[]): RateSeeds {
  const asOf = (id: string) => {
    const r = rates.find((x) => x.meta.id === id);
    return r && seedRate(rates, id) !== null ? r.obsDate : null;
  };
  return {
    treasury10yPct: seedRate(rates, "DGS10"),
    sofrPct: seedRate(rates, "SOFR"),
    treasury10yAsOf: asOf("DGS10"),
    sofrAsOf: asOf("SOFR"),
  };
}

export const NO_SEEDS: RateSeeds = {
  treasury10yPct: null,
  sofrPct: null,
  treasury10yAsOf: null,
  sofrAsOf: null,
};

/** "Sep 14" — the strip has no room for a year and the figures are all recent. */
export function shortDate(obsDate: string): string {
  const at = Date.parse(`${obsDate}T00:00:00Z`);
  if (!Number.isFinite(at)) return obsDate;
  return new Date(at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function fredUrl(id: string): string {
  return `https://fred.stlouisfed.org/series/${id}`;
}
