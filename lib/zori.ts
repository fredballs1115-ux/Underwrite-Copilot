/**
 * A covered metro's asking rent, apartment asking rent and typical home
 * value, from Zillow's indices.
 *
 * The FMR row on the market brief is what HUD will PAY — a fair market rent
 * set once a year from survey data two years old by the time it applies.
 * The ZORI figure is what landlords are ASKING this month, across the
 * listings Zillow sees, refreshed monthly. They are different numbers
 * about different things, which is why both are shown and neither stands
 * in for the other: an underwrite that takes the FMR for the market rent
 * is a year or two behind, and one that takes the asking rent for the
 * achievable rent has not priced the concessions.
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
 * The rent is an MSA figure. The four Washington suburbs and Newark share
 * their MSA's row, and the row's note says so — the page repeats it.
 */

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
  /** The month the figure is for — Zillow dates it the month's last day. */
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

function figure(rows: readonly BenchRow[], metroName: string, metric: string): number | null {
  const r = rows.find((x) => x.metro === metroName && x.metric === metric);
  return r && typeof r.low === "number" && Number.isFinite(r.low) ? r.low : null;
}

export function zoriFor(rows: readonly BenchRow[], metroName: string): ZoriRead | null {
  const rent = rows.find((r) => r.metro === metroName && r.metric === "zori_rent");
  if (!rent || typeof rent.low !== "number" || !Number.isFinite(rent.low) || rent.low <= 0 || !rent.as_of) {
    return null;
  }
  const mfr = figure(rows, metroName, "zori_mfr_rent");
  const home = figure(rows, metroName, "zhvi");
  const rentWhole = Math.round(rent.low);
  return {
    rent: rentWhole,
    yoyPct: figure(rows, metroName, "zori_rent_yoy"),
    asOf: rent.as_of,
    note: rent.note ?? "",
    shared: /shared with the MSA/i.test(rent.note ?? ""),
    mfrRent: mfr !== null && mfr > 0 ? Math.round(mfr) : null,
    mfrYoyPct: figure(rows, metroName, "zori_mfr_rent_yoy"),
    homeValue: home !== null && home > 0 ? Math.round(home) : null,
    homeValueYoyPct: figure(rows, metroName, "zhvi_yoy"),
    priceToRentYears: home !== null && home > 0 ? Math.round((home / (12 * rentWhole)) * 10) / 10 : null,
  };
}

/** "Aug 2026" — a month, since the figure is a month's. */
export function monthOf(asOf: string): string {
  const at = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(at)) return asOf;
  return new Date(at).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
