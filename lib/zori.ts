/**
 * A covered metro's asking rent, from Zillow's Observed Rent Index.
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
 * Pure: the page reads the two `benchmarks` rows the monthly pull writes
 * (`scripts/fetch-zori.mjs`) and hands them in. Nothing here is fetched.
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
  /** Dollars a month, whole. */
  rent: number;
  /** Change from a year ago, percent, one place; null where the pull had no year behind it. */
  yoyPct: number | null;
  /** The month the figure is for — Zillow dates it the month's last day. */
  asOf: string;
  /** The row's own note: the metro area named, and whether it is shared. */
  note: string;
  /** The figure is the MSA's, shown for a suburb that shares it. */
  shared: boolean;
}

/** Zillow's condition for using the data: say where it came from. */
export const ZORI_CREDIT = "Data: Zillow Research";
export const ZORI_SOURCE_URL = "https://www.zillow.com/research/data/";

export function zoriFor(rows: readonly BenchRow[], metroName: string): ZoriRead | null {
  const rent = rows.find((r) => r.metro === metroName && r.metric === "zori_rent");
  if (!rent || typeof rent.low !== "number" || !Number.isFinite(rent.low) || rent.low <= 0 || !rent.as_of) {
    return null;
  }
  const yoy = rows.find((r) => r.metro === metroName && r.metric === "zori_rent_yoy");
  return {
    rent: Math.round(rent.low),
    yoyPct: yoy && typeof yoy.low === "number" && Number.isFinite(yoy.low) ? yoy.low : null,
    asOf: rent.as_of,
    note: rent.note ?? "",
    shared: /shared with the MSA/i.test(rent.note ?? ""),
  };
}

/** "Aug 2026" — a month, since the figure is a month's. */
export function monthOf(asOf: string): string {
  const at = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(at)) return asOf;
  return new Date(at).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
