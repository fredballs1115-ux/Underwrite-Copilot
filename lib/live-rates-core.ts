/**
 * The table-free half of lib/live-rates: the shapes of a series and of a
 * read figure, and every reading of one that needs no list of series —
 * ages and moves, the year-over-year change, a year of permits, how a figure
 * is said and dated, the curve, the seeds and the tenor a clause names.
 *
 * Apart because a client component imports from here. lib/live-rates
 * parses data/fred-series.json at its top, and a module a client imports by
 * value is sent to the browser whole, with everything it imports: research
 * pass 25 (2026-10-05) found the 313 KB table in the JavaScript of /tools,
 * /demo and every deal page, for three helpers and two types.
 * lib/client-bundle-tables.test.ts holds every client module to reaching no
 * data table. lib/live-rates re-exports all of this, so a server module
 * imports either.
 */

import { HVS_RATES_URL } from "@/lib/hvs-tables";
import { NY_FED_SERIES } from "@/lib/data-notices";

/** How often a series publishes; `annual` is the Housing Vacancy Survey's
 *  state figure, dated the first of its year and published the March after
 *  the year ends — current for a year after that. */
export type Cadence = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

/**
 * What the stored figure is — which decides how it is shown and how it
 * moves. `count` is thousands at an annual rate (the national starts),
 * shown with its unit ("344k/yr");
 * `units` is a plain count of things (a metro's permits in a month).
 */
export type Unit = "pct" | "spread" | "pts" | "count" | "units";

export type GroupId =
  | "curve"
  | "money"
  | "credit"
  | "mortgage"
  | "inflation"
  | "economy"
  | "housing"
  | "metro";

/**
 * The five things published for a metro that a screen turns on: the four
 * FRED carries for every covered market, and the CPI's rent of primary
 * residence — what sitting tenants pay across the area's leases, the in-place
 * rent the asking rent on the same page is set against.
 */
/**
 * Payrolls in the supersector that fills each kind of building, against a
 * year ago — the BLS's state-and-area employment for the MSA, by
 * supersector: professional and business services (the office-using
 * sector), education and health services (medical offices, senior
 * housing), transportation, warehousing and utilities (warehouses), retail
 * trade (stores), leisure and hospitality (hotels). Total nonfarm is what
 * an apartment reads; a commercial deal reads the sector that fills ITS
 * kind, and the market check says which (`sectorJobsFor` in
 * lib/live-market-brief).
 */
export type SectorJobsMetric =
  | "jobs_pbs_yoy"
  | "jobs_eduhealth_yoy"
  | "jobs_transport_yoy"
  | "jobs_retail_yoy"
  | "jobs_leisure_yoy";

export type MetroMetric =
  | "unemployment"
  | "jobs_yoy"
  | SectorJobsMetric
  | "permits"
  /** the single-family part of the same count (FRED's 1-unit series) —
   *  the total less this is the units in buildings of two or more, which
   *  FRED publishes for no metro or state directly (probed 2026-09-23:
   *  `BP5FH` and `BP24FH` exist for none), so the multi-unit figure is
   *  computed on read from the two published counts and said as such */
  | "permits_1unit"
  | "hpi_yoy"
  | "rent_cpi_yoy"
  /** the Housing Vacancy Survey's own rental vacancy for the metro area —
   *  one of the 75 largest MSAs, quarterly, from the survey's workbook,
   *  with the survey's margin of error beside it, because a sample's
   *  quarterly figure for one metro is wide */
  | "rental_vacancy_msa"
  /** the same survey's ANNUAL figure for a state — the grain a deal
   *  outside the covered metros reads, filed under the state's market id */
  | "rental_vacancy_state"
  /** the same survey's rate for the Census region the metro sits in —
   *  the steadier figure, shown beside the metro's own and named as the
   *  region's */
  | "rental_vacancy";

/**
 * Where a series is pulled from. FRED for nearly everything; the BLS's own
 * API for the CPI areas the BLS redrew in 2018 — Washington, Baltimore, Los
 * Angeles, San Francisco — which FRED does not carry: its search returns only
 * the DISCONTINUED pre-2018 series for them, and the S-coded ids answer "does
 * not exist" (both from the runner, rates run 35751861027 and 35752361935).
 * A BLS series is stored under its BLS id, as the level, untransformed; the
 * page derives the change, as it does for Boston's payrolls.
 *
 * And the Census Bureau's own workbooks for what neither carries: the
 * Housing Vacancy Survey's quarterly rental vacancy for the 75 largest
 * metro areas, published as .xlsx on census.gov and nowhere else
 * (`scripts/fetch-hvs.mjs`). A Census series is stored under an id of ours
 * (`HVS_RVR_<cbsa>`), as the rate, with a companion series for the survey's
 * margin of error (`moe`), and the row is matched in the workbook by the
 * metro area's name (`census`, a prefix) — printed by the dry run beside
 * each metro, so a wrong name is visible rather than silently another city.
 */
export type SeriesSource = "fred" | "bls" | "census";

/** Where the Census Bureau publishes the Housing Vacancy Survey's rate tables
 *  — the one address the tiles link and the pull reads the tables' names
 *  from (lib/hvs-tables). */
export { HVS_RATES_URL };

export interface SeriesMeta {
  /** The key in the `rates` table. */
  id: string;
  /** The FRED series it is fetched from — the same as `id` unless transformed. */
  fred: string;
  /** FRED, the BLS for a series FRED does not carry, or the Census Bureau's workbook. */
  source: SeriesSource;
  /** A companion series holding the figure's margin of error (a Census
   *  survey figure), read beside it; null where the source states none. */
  moe: string | null;
  /** For a Census workbook series: the prefix of the metro area's name the
   *  pull matches a row by ("Washington-Arlington-Alexandria"). */
  census: string | null;
  /** FRED's transform, where the stored figure is not the level (`pc1`). */
  units: string | null;
  /**
   * A figure derived on READ from the stored level: `yoy` is the change
   * from the observation twelve months earlier, for a series FRED refuses
   * its own transform on (Boston's payrolls answer "units is not one of
   * ch1, chg, lin" to `pc1`). The table holds the level under FRED's own
   * id, since it IS the level; the page shows the change.
   */
  derived: "yoy" | null;
  /** What the strip calls it. */
  short: string;
  /** Roughly what FRED calls it, for the title attribute. */
  label: string;
  group: GroupId;
  cadence: Cadence;
  /**
   * Past this many days old the series has stopped, and the figure stops
   * seeding a field. One full publication cycle plus its release lag plus
   * margin — for a daily series that is a long holiday weekend, for a
   * monthly one it is the month plus the eight weeks core PCE takes to
   * publish, for a quarterly one it is the quarter's own span plus the lag
   * before it is released.
   */
  freshDays: number;
  unit: Unit;
  /**
   * Whether a loan document references this rate by name. Only a contract
   * rate may pre-fill a calculator field — see rule 1 above.
   */
  contractRate: boolean;
  /** A Treasury tenor's maturity in months; null for everything else. */
  tenorMonths: number | null;
}

/**
 * A covered metro's own series — the same row shape, filed under the metro
 * rather than a strip group, with the area FRED publishes it for (which is
 * an MSA, and for a county that has no series of its own, the MSA it sits
 * in — said on the page rather than passed off as the county's).
 */
export interface MetroSeriesMeta extends SeriesMeta {
  /** The `id` in data/research/metros.json. */
  metro: string;
  metric: MetroMetric;
  /** What FRED's own title calls the area. */
  area: string;
}

export interface SeriesGroup {
  id: GroupId;
  label: string;
}


/**
 * The sector payroll metrics, in the order a panel draws them — one
 * picture (five signed bars against total nonfarm) rather than five tiles,
 * and the market check reads the one that fills the deal's kind of
 * building (`sectorJobsFor` in lib/live-market-brief).
 */
export const SECTOR_JOBS_METRICS: readonly SectorJobsMetric[] = [
  "jobs_pbs_yoy",
  "jobs_eduhealth_yoy",
  "jobs_transport_yoy",
  "jobs_retail_yoy",
  "jobs_leisure_yoy",
];

export function isSectorJobsMetric(metric: string): metric is SectorJobsMetric {
  return (SECTOR_JOBS_METRICS as readonly string[]).includes(metric);
}

/** What each sector metric's payroll count is called, for a bar's label. */
export const SECTOR_JOBS_LABEL: Record<SectorJobsMetric, string> = {
  jobs_pbs_yoy: "Professional & business services",
  jobs_eduhealth_yoy: "Education & health services",
  jobs_transport_yoy: "Transportation, warehousing & utilities",
  jobs_retail_yoy: "Retail trade",
  jobs_leisure_yoy: "Leisure & hospitality",
};

/** A row as the `rates` table stores it. */
export interface RateRow {
  series_id: string;
  obs_date: string;
  value: number;
}

export interface Observation {
  obsDate: string;
  value: number;
}

/** How a move since the observation before is stated — by the series' unit. */
export type MoveUnit = "bps" | "pt" | "pct";

export interface LiveRate {
  meta: SeriesMeta;
  /** The observation's own date, which is not the day it was pulled. */
  obsDate: string;
  value: number;
  ageDays: number;
  /** Young enough for its own cadence. */
  fresh: boolean;
  /**
   * Move since the previous observation of the same series: basis points
   * for a rate or a spread, points for a share, percent for a count. Null
   * where the table holds only one observation — a blank is null, never
   * zero, because zero says "unchanged" and that is a claim.
   */
  move: number | null;
  moveUnit: MoveUnit;
  /** The observations on hand, OLDEST first, the newest last. */
  history: readonly Observation[];
  /**
   * The newest figure's margin of error, in the series' own unit, read
   * from its companion series for the same date — a Census survey figure
   * carries one; everything else is null, which is "none stated", never
   * "none".
   */
  moe: number | null;
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

export function moveUnitOf(unit: Unit): MoveUnit {
  switch (unit) {
    case "pct":
    case "spread":
      return "bps";
    case "pts":
      return "pt";
    case "count":
    case "units":
      return "pct";
  }
}

/** The move from `prior` to `now`, in the series' own move unit. */
export function moveBetween(unit: Unit, now: number, prior: number): number {
  switch (moveUnitOf(unit)) {
    case "bps":
      return Math.round((now - prior) * 100);
    case "pt":
      return Math.round((now - prior) * 10) / 10;
    case "pct":
      return prior === 0 ? 0 : Math.round(((now - prior) / Math.abs(prior)) * 1000) / 10;
  }
}

/** The first of the month twelve months before a first-of-the-month date. */
function yearBefore(obsDate: string): string {
  const at = new Date(`${obsDate}T00:00:00Z`);
  at.setUTCFullYear(at.getUTCFullYear() - 1);
  return at.toISOString().slice(0, 10);
}

/**
 * Each observation's percent change from the one dated exactly a year
 * earlier — what FRED's `pc1` would have said, computed here for a series
 * it refuses the transform on. Newest first in, newest first out; a point
 * with no partner a year back is dropped rather than compared to whatever
 * is nearest, and a zero or negative base cannot be a percentage of.
 */
export function yearOverYear(newestFirst: readonly Observation[]): Observation[] {
  const byDate = new Map(newestFirst.map((o) => [o.obsDate, o.value]));
  const out: Observation[] = [];
  for (const o of newestFirst) {
    const base = byDate.get(yearBefore(o.obsDate));
    if (base === undefined || base <= 0) continue;
    out.push({ obsDate: o.obsDate, value: Math.round(((o.value / base) - 1) * 100_000) / 1000 });
  }
  return out;
}

/** Twelve months of monthly permits summed — one year, so the seasons cancel. */
export const PERMIT_WINDOW_MONTHS = 12;

/**
 * Building permits over the trailing twelve months, against the twelve
 * before them.
 *
 * FRED publishes a metro's permits as one month's count, not seasonally
 * adjusted, so a single month is mostly the season: March is not a supply
 * signal against February. A year of them is, and a year against the year
 * before is the pipeline's direction. Null where the history does not
 * reach — a partial year is not a year, and saying so beats scaling it.
 */
export function permitsTrailingYear(
  r: Pick<LiveRate, "history">,
): { units: number; priorUnits: number | null; changePct: number | null; from: string; to: string } | null {
  const h = r.history;
  if (h.length < PERMIT_WINDOW_MONTHS) return null;
  const last = h.slice(-PERMIT_WINDOW_MONTHS);
  const units = Math.round(last.reduce((a, o) => a + o.value, 0));
  const prior =
    h.length >= 2 * PERMIT_WINDOW_MONTHS
      ? Math.round(
          h.slice(-2 * PERMIT_WINDOW_MONTHS, -PERMIT_WINDOW_MONTHS).reduce((a, o) => a + o.value, 0),
        )
      : null;
  return {
    units,
    priorUnits: prior,
    changePct: prior === null || prior === 0 ? null : Math.round(((units - prior) / prior) * 1000) / 10,
    from: last[0].obsDate,
    to: last[last.length - 1].obsDate,
  };
}

// ── How a figure is said ───────────────────────────────────────────────────

const THIN_MINUS = "−";

function signed(n: number, digits: number): string {
  const s = Math.abs(n).toFixed(digits);
  return n < 0 ? `${THIN_MINUS}${s}` : s;
}

/**
 * The figure as the strip prints it: a rate to two places, a spread as whole
 * basis points, a share or a change to one place (signed — a net share of
 * banks EASING is negative and must read so), a count with its thousands.
 */
export function formatValue(r: Pick<LiveRate, "value" | "meta">): string {
  switch (r.meta.unit) {
    case "pct":
      return `${signed(r.value, 2)}%`;
    case "spread":
      return `${signed(Math.round(r.value * 100), 0)} bps`;
    case "pts":
      return `${signed(r.value, 1)}%`;
    case "count":
      // Thousands of units at an annual rate (FRED's "seasonally adjusted
      // annual rate"): the month's pace, a year of it. Bare, "344k" read as
      // a count of something with its unit in a hover title alone; the unit
      // is on the figure (the research pass of 2026-10-01).
      return `${Math.round(r.value).toLocaleString("en-US")}k/yr`;
    case "units":
      return Math.round(r.value).toLocaleString("en-US");
  }
}

/** "13 bps", "0.3 pt", "2.4%" — the magnitude of a move with its unit. */
export function formatMove(r: Pick<LiveRate, "move" | "moveUnit">): string | null {
  if (r.move === null) return null;
  const n = Math.abs(r.move);
  switch (r.moveUnit) {
    case "bps":
      return `${n} bps`;
    case "pt":
      return `${n.toFixed(1)} pt`;
    case "pct":
      return `${n.toFixed(1)}%`;
  }
}

// ── The curve ──────────────────────────────────────────────────────────────

/** Fewer fresh tenors than this and there is no curve to draw, only dots. */
export const MIN_CURVE_POINTS = 4;
/** A slope inside this band either way is flat; beyond it, normal or inverted. */
export const FLAT_BAND_BPS = 10;
/** Observations back for "a week ago" on a daily series: five business days. */
export const WEEK_OBSERVATIONS = 5;

export interface CurvePoint {
  id: string;
  short: string;
  tenorMonths: number;
  value: number;
  obsDate: string;
  /** The same tenor five observations earlier, where the history reaches. */
  weekAgo: number | null;
}

export type CurveShape = "normal" | "flat" | "inverted";

export interface YieldCurve {
  /** Fresh tenors, shortest first. */
  points: CurvePoint[];
  /** The newest observation date among them. */
  asOf: string;
  /** 10-year less 2-year from the drawn points, in basis points; null without both. */
  slopeBps: number | null;
  shape: CurveShape | null;
  /** Every drawn tenor has a week-ago figure, so the second line can be drawn. */
  weekAgoDrawable: boolean;
}

/**
 * The Treasury curve as the page can draw it: every FRESH tenor, in tenor
 * order, with the same tenor a week earlier beside it. A stale tenor is left
 * off rather than drawn — a curve with one point from last month in it is a
 * picture of nothing — and under four points there is no curve at all.
 *
 * The slope is taken from the drawn points and not from FRED's own
 * `T10Y2Y`, because a figure beside a picture has to be the picture's: the
 * spread series posts on its own schedule and a day apart from the tenors
 * it is made of, and two slopes on one card two basis points apart would be
 * a question rather than a fact.
 */
export function yieldCurve(rates: readonly LiveRate[]): YieldCurve | null {
  const points = rates
    .filter((r) => r.meta.tenorMonths !== null && r.fresh)
    .sort((a, b) => a.meta.tenorMonths! - b.meta.tenorMonths!)
    .map((r): CurvePoint => {
      const back = r.history.length - 1 - WEEK_OBSERVATIONS;
      return {
        id: r.meta.id,
        short: r.meta.short,
        tenorMonths: r.meta.tenorMonths!,
        value: r.value,
        obsDate: r.obsDate,
        weekAgo: back >= 0 ? r.history[back].value : null,
      };
    });
  if (points.length < MIN_CURVE_POINTS) return null;
  const two = points.find((p) => p.tenorMonths === 24);
  const ten = points.find((p) => p.tenorMonths === 120);
  const slopeBps = two && ten ? Math.round((ten.value - two.value) * 100) : null;
  const shape: CurveShape | null =
    slopeBps === null
      ? null
      : slopeBps > FLAT_BAND_BPS
        ? "normal"
        : slopeBps < -FLAT_BAND_BPS
          ? "inverted"
          : "flat";
  return {
    points,
    asOf: points.map((p) => p.obsDate).sort().at(-1)!,
    slopeBps,
    shape,
    weekAgoDrawable: points.every((p) => p.weekAgo !== null),
  };
}

// ── What may become a number in a box ──────────────────────────────────────

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

/** One Treasury tenor a clause could name, with the date behind it. */
export interface CurveSeed {
  id: string;
  short: string;
  tenorMonths: number;
  pct: number;
  asOf: string;
}

/** The seeds `/tools` passes into its cards. Null for any that did not qualify. */
export interface RateSeeds {
  treasury10yPct: number | null;
  sofrPct: number | null;
  /** The observation date behind whichever seeds were given, for the note. */
  treasury10yAsOf: string | null;
  sofrAsOf: string | null;
  /** Every Treasury tenor that qualified, shortest first. */
  curve: CurveSeed[];
}

export function rateSeeds(rates: readonly LiveRate[]): RateSeeds {
  const asOf = (id: string) => {
    const r = rates.find((x) => x.meta.id === id);
    return r && seedRate(rates, id) !== null ? r.obsDate : null;
  };
  const curve = rates
    .filter((r) => r.meta.tenorMonths !== null && seedRate(rates, r.meta.id) !== null)
    .sort((a, b) => a.meta.tenorMonths! - b.meta.tenorMonths!)
    .map((r): CurveSeed => ({
      id: r.meta.id,
      short: r.meta.short,
      tenorMonths: r.meta.tenorMonths!,
      pct: r.value,
      asOf: r.obsDate,
    }));
  return {
    treasury10yPct: seedRate(rates, "DGS10"),
    sofrPct: seedRate(rates, "SOFR"),
    treasury10yAsOf: asOf("DGS10"),
    sofrAsOf: asOf("SOFR"),
    curve,
  };
}

export const NO_SEEDS: RateSeeds = {
  treasury10yPct: null,
  sofrPct: null,
  treasury10yAsOf: null,
  sofrAsOf: null,
  curve: [],
};

/**
 * The Treasury a yield-maintenance clause prices off: the tenor whose
 * maturity is NEAREST the remaining term, which is what the clause says.
 * On a tie the shorter tenor, which on a normal curve is the lower yield
 * and so the larger penalty — the side a buyer would rather be wrong on.
 * Null with no term, or no tenor to name.
 */
export function treasuryForTerm(curve: readonly CurveSeed[], months: number | null): CurveSeed | null {
  if (months === null || !Number.isFinite(months) || months <= 0) return null;
  let best: CurveSeed | null = null;
  for (const c of curve) {
    if (!best) {
      best = c;
      continue;
    }
    const gap = Math.abs(c.tenorMonths - months);
    const bestGap = Math.abs(best.tenorMonths - months);
    if (gap < bestGap || (gap === bestGap && c.tenorMonths < best.tenorMonths)) best = c;
  }
  return best;
}

/**
 * A figure's date by its cadence, the year always in it: a daily or weekly
 * figure its day ("Sep 17, 2026"), a monthly one its month ("Aug 2026"), a
 * quarterly one its quarter ("Q2 2026"), an annual one its year ("2025").
 *
 * The one formatter every live figure is dated through. FRED dates a monthly
 * figure the first of its month and a quarterly one the first of its quarter,
 * so a day says a Q2 figure is an April morning's ("CRE delinquency as of Apr
 * 1"), and a day with no year says a series that stopped in 2024 is this
 * year's ("Tampa Bay FL 7.7% (Oct 1)" for the fourth quarter of 2024) — the
 * strip and the boards printed both until 2026-10-01.
 */
export function periodLabel(obsDate: string, cadence: Cadence): string {
  const at = Date.parse(`${obsDate}T00:00:00Z`);
  if (!Number.isFinite(at)) return obsDate;
  const d = new Date(at);
  if (cadence === "quarterly") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (cadence === "annual") return String(d.getUTCFullYear());
  if (cadence === "monthly") return monthOf(obsDate);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The period a live figure is for: its own date, said by its own cadence. */
export function periodOf(r: { obsDate: string; meta: Pick<SeriesMeta, "cadence"> }): string {
  return periodLabel(r.obsDate, r.meta.cadence);
}

/**
 * The series FRED carries for a publisher that is not FRED, by id, with
 * the publisher a tile credits (research pass 31, C8: the strip had said
 * "· FRED" over figures FRED only carries). SOFR and its 30-day average are
 * the New York Fed's reference-rate data — FRED's own page tags SOFR
 * "Copyrighted: Citation Required" (zori probe run 37262488972) — and the
 * HQM corporate curve is the U.S. Treasury's.
 */
const CARRIED_FOR: Readonly<Record<string, string>> = {
  ...Object.fromEntries(NY_FED_SERIES.map((id) => [id, "New York Fed"])),
  HQMCB10YR: "U.S. Treasury",
};

/**
 * Who publishes a figure, where a tile names it beside its link: the BLS or
 * the Census Bureau for a series pulled from them; for a series FRED
 * carries for someone else, that publisher with FRED as the channel — "New
 * York Fed via FRED" over SOFR, "U.S. Treasury via FRED" over the HQM
 * curve, "Freddie Mac via FRED" over its mortgage survey, whose own label
 * says whose it is. Null for everything else, which the strip's heading and
 * the link itself credit to FRED.
 */
export function publisherTag(meta: Pick<SeriesMeta, "source" | "label"> & { id?: string }): string | null {
  if (meta.source === "bls") return "BLS";
  if (meta.source === "census") return "Census";
  const carried = meta.id ? CARRIED_FOR[meta.id] : undefined;
  if (carried) return `${carried} via FRED`;
  if (/^Freddie Mac\b/.test(meta.label)) return "Freddie Mac via FRED";
  return null;
}

/** "Aug 2026" — a month, since the figure is a month's (lib/zori re-exports
 *  it, where the asking rents first needed it). */
export function monthOf(asOf: string): string {
  const at = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(at)) return asOf;
  return new Date(at).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** A series' own page on FRED, from its row — the level's page for a
 *  transformed series. */
export function fredUrlOf(meta: Pick<SeriesMeta, "id" | "fred">): string {
  return `https://fred.stlouisfed.org/series/${meta.fred || meta.id}`;
}

/**
 * A series' own page at its source, from its row: FRED's, or the BLS's for a
 * series FRED does not carry, or the Census Bureau's tables. What every tile
 * links to, so a figure is never credited to a source that does not publish
 * it; `seriesUrl` in lib/live-rates finds the row by its id.
 */
export function seriesUrlOf(meta: Pick<SeriesMeta, "id" | "fred" | "source">): string {
  if (meta.source === "bls") return `https://data.bls.gov/timeseries/${meta.id}`;
  if (meta.source === "census") return HVS_RATES_URL;
  return fredUrlOf(meta);
}
