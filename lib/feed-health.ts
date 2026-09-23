import { ageDays, type Cadence, type LiveRate, type SeriesSource } from "@/lib/live-rates";
import type { ZoriRead } from "@/lib/zori";
import type { RealtorRead } from "@/lib/realtor";

/**
 * What each feed last wrote — the operator's instrument for "the site is
 * never wrong": a dead pull is visible here before a visitor meets a stale
 * figure. Pure; the data-health page hands it the same reads the public
 * pages draw from.
 *
 * The nightly steward already files a "stale" issue when the WHOLE rates
 * table has no row newer than five days, and when benchmarks rows pass a
 * hundred and eighty. Neither sees a dead feed: the daily Treasury series
 * keep the table's newest date fresh while the monthly pull has stopped,
 * and a Zillow row sixty days old is a missed month long before it is a
 * research-rule problem. So this judges each FEED on its own cadence, the
 * way the strip judges each series (`LiveRate.fresh`), and names the
 * series that are stale rather than averaging them away.
 *
 * Per-metro feeds are judged on ONE metro's rows, named on the card
 * (`SAMPLE_METRO`, the buyer's home market and the one metro every source
 * covers — the BLS rent index, the Census survey, FRED's MSA series,
 * Zillow and Realtor.com); a pull that writes eighteen metros writes them
 * in one run, so one metro's rows are the run's. A blank is null: a feed
 * with no rows says "no rows", never "current".
 */
export interface FeedSpec {
  id: string;
  name: string;
  publisher: string;
  /** when the workflow runs, in words */
  schedule: string;
  /** the workflow file, for the operator to open */
  workflow: string;
}

export const SAMPLE_METRO = { id: "dc", name: "Washington DC" } as const;
/** The state the states' series are judged on — the sample deal's own,
 *  read under its market id the way a deal outside the covered metros
 *  reads it, so the card sees the state pull die the way it sees a metro's. */
export const SAMPLE_STATE = { id: "state:PA", name: "Pennsylvania" } as const;

export const FEEDS: readonly FeedSpec[] = [
  { id: "fred_daily", name: "Rates — daily series", publisher: "FRED", schedule: "weekdays, after the morning release", workflow: "rates.yml" },
  { id: "fred_weekly", name: "Rates — weekly surveys", publisher: "FRED", schedule: "weekdays; the survey posts on Thursdays", workflow: "rates.yml" },
  { id: "fred_monthly", name: "Rates — monthly series", publisher: "FRED", schedule: "weekdays; each series on its release day", workflow: "rates.yml" },
  { id: "fred_quarterly", name: "Rates — quarterly series", publisher: "FRED", schedule: "weekdays; about two months after the quarter ends", workflow: "rates.yml" },
  { id: "metro_fred", name: "Metro series", publisher: "FRED", schedule: "weekdays, with the rates pull", workflow: "rates.yml" },
  { id: "state_fred", name: "State series", publisher: "FRED", schedule: "weekdays, last in the rates pull", workflow: "rates.yml" },
  { id: "bls", name: "Metro rent index", publisher: "the BLS", schedule: "weekdays, with the rates pull", workflow: "rates.yml" },
  { id: "census_hvs", name: "Metro rental vacancy", publisher: "the Census Bureau", schedule: "the 6th of Feb, May, Aug and Nov", workflow: "hvs.yml" },
  { id: "zillow", name: "Asking rents and home values", publisher: "Zillow Research", schedule: "the 20th of each month", workflow: "zori.yml" },
  { id: "realtor", name: "For-sale market and hotness", publisher: "Realtor.com", schedule: "the 8th of each month", workflow: "realtor.yml" },
];

/** Zillow dates a month's figure its last day and publishes it around the
 *  17th of the next month; the pull runs the 20th, so on the eve of the
 *  next pull the figure is about fifty days old and current. */
export const ZILLOW_FRESH_DAYS = 55;
/** Realtor.com dates a month's figure its first day and publishes early
 *  the next month; the pull runs the 8th, so the figure is at most about
 *  forty days old while current. */
export const REALTOR_FRESH_DAYS = 45;

export interface FeedStatus {
  spec: FeedSpec;
  /** ISO date of the newest observation the feed holds; null with no rows */
  newest: string | null;
  ageDays: number | null;
  /** every series current for its own cadence; null with nothing to judge */
  fresh: boolean | null;
  seriesFresh: number;
  seriesTotal: number;
  /** the series that are stale, by their short names */
  stale: string[];
  /** the metro whose rows a per-metro feed was judged on */
  sample: string | null;
}

export interface FeedHealthInput {
  /** the national series (`liveRates`) */
  rates: readonly LiveRate[];
  /** the sample metro's series (`liveMetroRates(SAMPLE_METRO.id)`) */
  metro: readonly LiveRate[];
  /** the sample state's series (`liveMetroRates(SAMPLE_STATE.id)`) — the
   *  states' pull, judged on one state's rows; absent reads as no rows */
  state?: readonly LiveRate[];
  zori: ZoriRead | null;
  realtor: RealtorRead | null;
  now: Date;
}

function ofSeries(spec: FeedSpec, series: readonly LiveRate[], sample: string | null): FeedStatus {
  if (series.length === 0) {
    return { spec, newest: null, ageDays: null, fresh: null, seriesFresh: 0, seriesTotal: 0, stale: [], sample };
  }
  const newest = series.map((r) => r.obsDate).sort().at(-1) ?? null;
  const stale = series.filter((r) => !r.fresh).map((r) => r.meta.short);
  return {
    spec,
    newest,
    ageDays: Math.min(...series.map((r) => r.ageDays)),
    fresh: stale.length === 0,
    seriesFresh: series.length - stale.length,
    seriesTotal: series.length,
    stale,
    sample,
  };
}

function ofBench(spec: FeedSpec, asOf: string | null, freshDays: number, label: string, now: Date, sample: string): FeedStatus {
  if (!asOf) {
    return { spec, newest: null, ageDays: null, fresh: null, seriesFresh: 0, seriesTotal: 0, stale: [], sample };
  }
  const age = ageDays(asOf, now);
  const fresh = age <= freshDays;
  return { spec, newest: asOf, ageDays: age, fresh, seriesFresh: fresh ? 1 : 0, seriesTotal: 1, stale: fresh ? [] : [label], sample };
}

const spec = (id: string): FeedSpec => FEEDS.find((f) => f.id === id)!;
const cadenceOf = (r: LiveRate): Cadence => r.meta.cadence;
const sourceOf = (r: LiveRate): SeriesSource => (r.meta as { source?: SeriesSource }).source ?? "fred";

export function feedHealth(input: FeedHealthInput): FeedStatus[] {
  const { rates, metro, state = [], zori, realtor, now } = input;
  const sample = SAMPLE_METRO.name;
  return [
    ofSeries(spec("fred_daily"), rates.filter((r) => cadenceOf(r) === "daily"), null),
    ofSeries(spec("fred_weekly"), rates.filter((r) => cadenceOf(r) === "weekly"), null),
    ofSeries(spec("fred_monthly"), rates.filter((r) => cadenceOf(r) === "monthly"), null),
    ofSeries(spec("fred_quarterly"), rates.filter((r) => cadenceOf(r) === "quarterly"), null),
    ofSeries(spec("metro_fred"), metro.filter((r) => sourceOf(r) === "fred"), sample),
    ofSeries(spec("state_fred"), state.filter((r) => sourceOf(r) === "fred"), SAMPLE_STATE.name),
    ofSeries(spec("bls"), metro.filter((r) => sourceOf(r) === "bls"), sample),
    ofSeries(spec("census_hvs"), metro.filter((r) => sourceOf(r) === "census"), sample),
    ofBench(spec("zillow"), zori?.asOf ?? null, ZILLOW_FRESH_DAYS, "asking rent", now, sample),
    ofBench(spec("realtor"), realtor?.asOf ?? null, REALTOR_FRESH_DAYS, "median list price", now, sample),
  ];
}

/** One word for the row: current, stale (with the count), or no rows. */
export function feedStatusWord(s: FeedStatus): "current" | "stale" | "no rows" {
  if (s.fresh === null) return "no rows";
  return s.fresh ? "current" : "stale";
}
