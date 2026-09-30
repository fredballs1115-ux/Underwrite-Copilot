/**
 * A covered metro's asking rent, apartment asking rent and typical home
 * value, from Zillow's indices.
 *
 * The FMR row on the market brief is HUD's fair market rent — a yearly
 * two-bedroom figure, utilities included, set from survey data two years old
 * by the time it applies; it is not what HUD pays, and the gap to an asking
 * rent is not a premium over it. The ZORI figure is what landlords are
 * ASKING this month, across the listings Zillow sees of every type and size,
 * before concessions, refreshed monthly. They are different numbers about
 * different things, which is why both are shown and neither stands in for
 * the other: an underwrite that takes the FMR for the market rent is a year
 * or two behind, and one that takes the asking rent for the achievable rent
 * has not priced the concessions.
 *
 * THE APARTMENT FIGURE IS ITS OWN NUMBER. Zillow's all-homes index runs
 * over houses, condos and apartments together, so in a market of dear
 * houses it sits well above what an apartment lets for; the multifamily
 * index is the same measure over apartment listings alone, and it is the
 * one an apartment underwrite should be reading. Both are shown and the
 * gap between them is a picture.
 *
 * THE HOME VALUE IS THE OTHER SIDE OF THE RENTER'S DECISION. A typical
 * home's price against a year of asking rent — the price-to-rent ratio,
 * said in years — is the arithmetic that keeps a renter renting, and it
 * belongs beside the rent rather than on a page of its own.
 *
 * Pure: the page reads the `benchmarks` rows the monthly pull writes
 * (`scripts/fetch-zori.mjs`) and hands them in. Nothing here is fetched.
 * A row the pull did not write is null — the multifamily and home value
 * files are pulled and verified separately from the all-homes one, and a
 * missing figure is a missing figure, never a zero.
 *
 * TWO RULES OF TIME, because the three files are written separately and a
 * file that fails leaves last month's rows standing beside this month's.
 * A figure is said only while it is CURRENT (`ZILLOW_FRESH_DAYS`, the limit
 * the feeds card judges the pull by), so a figure a dead pull left behind
 * drops off rather than reading as this month's. And every figure in a read
 * is said under the all-homes rent's month, so a figure is read only where
 * its OWN row is of that month: an apartment rent from March never prints
 * under "Aug 2026", and a year-ago change the file could not compute this
 * month is not last month's change passed off as this one's.
 *
 * The rent is an MSA figure. The four Washington suburbs and Newark share
 * their MSA's row, and the row's note says so — the page repeats it.
 */

import { ageDays } from "@/lib/live-rates";

/**
 * How long a Zillow figure is current. Zillow dates a month's figure its
 * LAST day and publishes it in the middle of the next month; the pull runs
 * on the 20th (zori.yml) and writes the month before, so the August figure
 * (Aug 31) is written on Sep 20 and replaced on Oct 20, when it is 50 days
 * old. The oldest a current figure gets is the month between at its longest
 * (31 days) and the 20 days to the pull: 51, the July figure on Sep 20. Four
 * more days are the grace a late release or a re-run is given before the
 * figure is called stale. The feeds card judges the pull by it and every
 * read here is gated on it, so the two cannot disagree.
 */
export const ZILLOW_FRESH_DAYS = 55;

/** A Zillow figure dated `asOf` is current on `now`. */
export function zillowFresh(asOf: string, now: Date): boolean {
  return ageDays(asOf, now) <= ZILLOW_FRESH_DAYS;
}

export interface BenchRow {
  metric: string;
  metro: string;
  low: number | null;
  as_of: string | null;
  note: string | null;
  source?: string | null;
}

export interface ZoriRead {
  /** Dollars a month, whole — the all-homes asking rent. */
  rent: number;
  /** Change from a year ago, percent, one place; null where the pull had no year behind it. */
  yoyPct: number | null;
  /** The month the figure is for — Zillow dates it the month's last day.
   *  Every figure in the read is of this month; one of another month is
   *  null here. */
  asOf: string;
  /** The row's own note: the metro area named, and whether it is shared. */
  note: string;
  /** The figure is the MSA's, shown for a suburb that shares it. */
  shared: boolean;
  /** The apartment asking rent — the index over multifamily listings alone — where the pull had the file. */
  mfrRent: number | null;
  mfrYoyPct: number | null;
  /** The typical (mid-tier) home value, dollars, where the pull had the file. */
  homeValue: number | null;
  homeValueYoyPct: number | null;
  /** Years of the all-homes asking rent one typical home costs, one place; null without both figures. */
  priceToRentYears: number | null;
}

/** Zillow's condition for using the data: say where it came from. */
export const ZORI_CREDIT = "Data: Zillow Research";
export const ZORI_SOURCE_URL = "https://www.zillow.com/research/data/";

/** The metrics the pull writes and this reads — one list, so the read cannot ask for a row the pull does not write. */
export const ZILLOW_METRICS = [
  "zori_rent",
  "zori_rent_yoy",
  "zori_mfr_rent",
  "zori_mfr_rent_yoy",
  "zhvi",
  "zhvi_yoy",
] as const;

/**
 * A row's figure, read only where the row is of `month` — the month the
 * read says it under. A row of any other month is one a file did not
 * rewrite this time (the file failed, or a year-ago column was blank), and
 * it is left out rather than said under a month it is not of. Shared with
 * the Realtor.com read, whose files are written the same way.
 */
export function figureOfMonth(rows: readonly BenchRow[], metroName: string, metric: string, month: string): number | null {
  const r = rows.find((x) => x.metro === metroName && x.metric === metric);
  return r && r.as_of === month && typeof r.low === "number" && Number.isFinite(r.low) ? r.low : null;
}

/** A metro's Zillow figures on `now`: null unless the all-homes rent is
 *  there and current, and every other figure only where its own row is of
 *  the rent's month. */
export function zoriFor(rows: readonly BenchRow[], metroName: string, now: Date): ZoriRead | null {
  const rent = rows.find((r) => r.metro === metroName && r.metric === "zori_rent");
  if (!rent || typeof rent.low !== "number" || !Number.isFinite(rent.low) || rent.low <= 0 || !rent.as_of) {
    return null;
  }
  if (!zillowFresh(rent.as_of, now)) return null;
  const month = rent.as_of;
  const mfr = figureOfMonth(rows, metroName, "zori_mfr_rent", month);
  const home = figureOfMonth(rows, metroName, "zhvi", month);
  const rentWhole = Math.round(rent.low);
  return {
    rent: rentWhole,
    yoyPct: figureOfMonth(rows, metroName, "zori_rent_yoy", month),
    asOf: month,
    note: rent.note ?? "",
    shared: /shared with the MSA/i.test(rent.note ?? ""),
    mfrRent: mfr !== null && mfr > 0 ? Math.round(mfr) : null,
    mfrYoyPct: figureOfMonth(rows, metroName, "zori_mfr_rent_yoy", month),
    homeValue: home !== null && home > 0 ? Math.round(home) : null,
    homeValueYoyPct: figureOfMonth(rows, metroName, "zhvi_yoy", month),
    priceToRentYears: home !== null && home > 0 ? Math.round((home / (12 * rentWhole)) * 10) / 10 : null,
  };
}

/** What a pull's file last wrote for a metro, as the feeds card judges it:
 *  the file, in words, and the month of its lead row — stale or not, since
 *  the card has to see a stale file to call it stale. */
export interface FileMonth {
  label: string;
  /** null where the file has written no row for the metro */
  asOf: string | null;
}

/** The three files the pull reads, each by the lead row it writes. They are
 *  fetched one after another and a file that fails leaves its rows as they
 *  were, so one can be a month behind the others. */
export const ZILLOW_FILES = [
  { metric: "zori_rent", label: "asking rent" },
  { metric: "zori_mfr_rent", label: "apartment asking rent" },
  { metric: "zhvi", label: "home value" },
] as const;

/** Each Zillow file's month for a metro, current or not (the feeds card's read). */
export function zillowFileMonths(rows: readonly BenchRow[], metroName: string): FileMonth[] {
  return ZILLOW_FILES.map((f) => ({
    label: f.label,
    asOf: rows.find((r) => r.metro === metroName && r.metric === f.metric)?.as_of ?? null,
  }));
}

/** "Aug 2026" — a month, since the figure is a month's. */
export function monthOf(asOf: string): string {
  const at = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(at)) return asOf;
  return new Date(at).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
