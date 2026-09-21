/**
 * Today's rates, and which of them may become a number in a box.
 *
 * Every figure on the site that moves with the market comes through one
 * table: the Treasury curve, SOFR and its averages, the policy rates, the
 * credit spreads, the mortgage survey, bank CRE lending and its standards,
 * inflation and the cost of building, jobs, and the multifamily supply
 * pipeline — forty-odd FRED series the weekday cron writes
 * (`scripts/fetch-rates.mjs` → the `rates` table) and this module reads back
 * for the strip across the top of `/tools` and the bottom of `/market`, and
 * for the seeds that pre-fill a calculator field.
 *
 * The list itself is `data/fred-series.json`, imported by the cron script
 * and by this file, so the two cannot disagree about what a series is. This
 * module is the pure half: what the series are, how old a figure is, its
 * move since the observation before, the shape of the curve, and the two
 * rules that decide what may be done with a figure.
 *
 * **Rule 1 — a benchmark is not a quote.** A handful of these are rates a
 * loan document actually references: a yield-maintenance clause prices off
 * the Treasury with the maturity nearest the remaining term, a floating-rate
 * note floats over SOFR or its 30-day average by name, a bank line is priced
 * at prime plus. Everything else is context. The 30-year mortgage survey is
 * an owner-occupier residential rate — `lib/leverage.ts` is already careful
 * that investor debt prices ABOVE it, which is why its read there is
 * deliberately one-sided — and a delinquency rate, an inflation print or a
 * count of housing starts is a condition, not a price. So only a
 * `contractRate` may be SEEDED into a field: putting a residential survey
 * into a box labelled "loan rate" would be wrong by a spread nobody typed,
 * and wrong invisibly, because the figure would look like it came from
 * somewhere authoritative.
 *
 * **Rule 2 — stale is per series, because the cadence is.** A uniform
 * threshold is wrong in both directions at once. The Treasury and SOFR post
 * every business day, so a figure a week old means the pull is broken; the
 * mortgage survey posts weekly, so a seven-day-old figure is the current one;
 * a monthly index is dated the FIRST of the month it describes and published
 * two to eight weeks after that month ends, so the newest CPI can be seventy
 * days old and the newest core PCE past eighty, both current; and the CRE
 * delinquency rate is QUARTERLY, dated the quarter's first day and published
 * about two months after the quarter ENDS, so the April figure is the newest
 * one available until late November, by which time it is eight months old and
 * still current. Judge all of them at five days and most are permanently
 * broken; judge all of them at a quarter and a dead daily feed goes unnoticed
 * until the next season. So the threshold is a property of the series.
 *
 * A stale figure still SHOWS, with its date — an analyst who can see that the
 * Treasury stopped updating a fortnight ago has learned something. It just
 * stops seeding, because a date beside a figure is read and a figure inside a
 * form field is not.
 *
 * **What a figure IS is a property of the series too.** A rate is shown as a
 * percent and moves in basis points; a credit spread is quoted in percent
 * points by ICE and shown as basis points, because nobody says "0.77% over";
 * a share or a change — inflation from a year ago, the net share of banks
 * tightening, a vacancy rate — is a percent that moves in POINTS, since "CPI
 * up 10 bps" is a sentence nobody says either; and a count of housing units
 * moves in percent. An index never reaches the page as a level: the cron asks
 * FRED for its own percent-change-from-a-year-ago transform (`units: pc1`)
 * and stores it under a `_YOY` id, so a reader of the table cannot mistake a
 * transformed figure for the level FRED's own page shows.
 *
 * **Every id was verified from the runner, never from memory.** The sandbox
 * cannot reach FRED, so a dry run of the rates workflow prints each series'
 * own title beside its id before the id is trusted — and the first list paid
 * for that rule at once: `DRTSCLCC`, remembered as the pre-2013 CRE
 * standards series, is "Net Percentage of Domestic Banks Tightening Standards
 * for Credit Card Loans". It would have sat on the page under a CRE label,
 * wrong every quarter, with nothing to catch it.
 */

import table from "@/data/fred-series.json";

export type Cadence = "daily" | "weekly" | "monthly" | "quarterly";

/**
 * What the stored figure is — which decides how it is shown and how it
 * moves. `count` is thousands at an annual rate (the national starts);
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

/** The four things FRED publishes for a metro that a screen turns on. */
export type MetroMetric = "unemployment" | "jobs_yoy" | "permits" | "hpi_yoy";

export interface SeriesMeta {
  /** The key in the `rates` table. */
  id: string;
  /** The FRED series it is fetched from — the same as `id` unless transformed. */
  fred: string;
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

const CADENCES: readonly Cadence[] = ["daily", "weekly", "monthly", "quarterly"];
const UNITS: readonly Unit[] = ["pct", "spread", "pts", "count", "units"];
const METRO_METRICS: readonly MetroMetric[] = ["unemployment", "jobs_yoy", "permits", "hpi_yoy"];

/** One entry's shape, held; the two lists differ only in what files it. */
function readSeriesEntry(o: Record<string, unknown>, where: string, groupIds: Set<string>): SeriesMeta {
  if (typeof o.id !== "string" || !o.id) throw new Error(`${where}: needs an id`);
  if (typeof o.short !== "string" || typeof o.label !== "string") {
    throw new Error(`${where}: needs short and label`);
  }
  if (typeof o.group !== "string" || !groupIds.has(o.group)) {
    throw new Error(`${where}: group must be one of the table's groups`);
  }
  if (!CADENCES.includes(o.cadence as Cadence)) throw new Error(`${where}: bad cadence`);
  if (!UNITS.includes(o.unit as Unit)) throw new Error(`${where}: bad unit`);
  if (typeof o.freshDays !== "number" || o.freshDays <= 0) {
    throw new Error(`${where}: freshDays must be positive`);
  }
  if (typeof o.contractRate !== "boolean") throw new Error(`${where}: contractRate must be boolean`);
  if (o.fred !== undefined && typeof o.fred !== "string") throw new Error(`${where}: fred must be a string`);
  if (o.units !== undefined && typeof o.units !== "string") throw new Error(`${where}: units must be a string`);
  if (o.tenorMonths !== undefined && (typeof o.tenorMonths !== "number" || o.tenorMonths <= 0)) {
    throw new Error(`${where}: tenorMonths must be positive`);
  }
  // A transformed figure must carry its own id: storing FRED's percent
  // change under FRED's own id is how a reader of the table mistakes 3.4
  // for an index level.
  if (typeof o.units === "string" && (o.fred === undefined || o.fred === o.id)) {
    throw new Error(`${where}: a transformed series needs its own id, distinct from its FRED id`);
  }
  if (o.derived !== undefined && o.derived !== "yoy") throw new Error(`${where}: derived must be "yoy"`);
  // A derived figure is computed from the stored LEVEL, so the table row is
  // the level and must be filed under the level's own id, untransformed.
  if (o.derived === "yoy" && (typeof o.units === "string" || (o.fred !== undefined && o.fred !== o.id))) {
    throw new Error(`${where}: a derived series stores the level under FRED's own id, with no transform`);
  }
  return {
    id: o.id,
    fred: typeof o.fred === "string" ? o.fred : o.id,
    units: typeof o.units === "string" ? o.units : null,
    derived: o.derived === "yoy" ? "yoy" : null,
    short: o.short,
    label: o.label,
    group: o.group as GroupId,
    cadence: o.cadence as Cadence,
    freshDays: o.freshDays,
    unit: o.unit as Unit,
    contractRate: o.contractRate,
    tenorMonths: typeof o.tenorMonths === "number" ? o.tenorMonths : null,
  };
}

/**
 * The table, read with its shape held.
 *
 * A malformed entry is refused rather than skipped, because a skipped entry
 * is a series that silently vanishes from the page while the cron goes on
 * writing it — the same way a malformed skyline candidate once disabled the
 * only check that could catch a dead photograph.
 */
export function readSeriesTable(raw: unknown): {
  historyRows: number;
  groups: SeriesGroup[];
  series: SeriesMeta[];
  metroSeries: MetroSeriesMeta[];
  /** A metro with no series of its own, and the metro whose figures it shows. */
  metroAliases: Record<string, string>;
} {
  if (!raw || typeof raw !== "object") throw new Error("fred-series: not an object");
  const t = raw as Record<string, unknown>;
  const historyRows = t.historyRows;
  if (typeof historyRows !== "number" || !Number.isInteger(historyRows) || historyRows < 2) {
    throw new Error("fred-series: historyRows must be an integer of at least 2");
  }
  if (!Array.isArray(t.groups) || !Array.isArray(t.series)) {
    throw new Error("fred-series: groups and series must be arrays");
  }
  const groups: SeriesGroup[] = t.groups.map((g, i) => {
    const o = (g ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.label !== "string") {
      throw new Error(`fred-series: group ${i} needs an id and a label`);
    }
    return { id: o.id as GroupId, label: o.label };
  });
  const groupIds = new Set<string>(groups.map((g) => g.id));
  const seen = new Set<string>();
  const series: SeriesMeta[] = t.series.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const where = `fred-series: series ${i} (${String(o.id ?? "?")})`;
    const m = readSeriesEntry(o, where, groupIds);
    if (seen.has(m.id)) throw new Error(`${where}: duplicate id`);
    seen.add(m.id);
    if (m.group === "metro") throw new Error(`${where}: a metro series belongs in metroSeries`);
    return m;
  });
  // The metro list is optional and filed by (metro, metric) rather than by
  // id: two suburbs of one MSA legitimately read the same series.
  const metroRaw = t.metroSeries === undefined ? [] : t.metroSeries;
  if (!Array.isArray(metroRaw)) throw new Error("fred-series: metroSeries must be an array");
  const seenMetro = new Set<string>();
  const metroSeries: MetroSeriesMeta[] = metroRaw.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const where = `fred-series: metro series ${i} (${String(o.id ?? "?")})`;
    if (typeof o.metro !== "string" || !o.metro) throw new Error(`${where}: needs a metro`);
    if (!METRO_METRICS.includes(o.metric as MetroMetric)) throw new Error(`${where}: bad metric`);
    if (typeof o.area !== "string" || !o.area) throw new Error(`${where}: needs the area FRED names`);
    const m = readSeriesEntry({ ...o, group: "metro", contractRate: false }, where, new Set(["metro"]));
    const k = `${o.metro}|${o.metric}`;
    if (seenMetro.has(k)) throw new Error(`${where}: ${o.metro} already has a ${o.metric} series`);
    seenMetro.add(k);
    if (seen.has(m.id)) throw new Error(`${where}: id is already a strip series`);
    return { ...m, metro: o.metro, metric: o.metric as MetroMetric, area: o.area };
  });
  const aliasesRaw = t.metroAliases === undefined ? {} : t.metroAliases;
  if (!aliasesRaw || typeof aliasesRaw !== "object" || Array.isArray(aliasesRaw)) {
    throw new Error("fred-series: metroAliases must be an object");
  }
  const metroAliases: Record<string, string> = {};
  for (const [from, to] of Object.entries(aliasesRaw as Record<string, unknown>)) {
    if (typeof to !== "string") throw new Error(`fred-series: alias ${from} must name a metro`);
    if (!metroSeries.some((m) => m.metro === to)) {
      throw new Error(`fred-series: alias ${from} → ${to}, but ${to} has no series`);
    }
    if (metroAliases[to] !== undefined || to === from) {
      throw new Error(`fred-series: alias ${from} → ${to} must name a metro with its own series`);
    }
    metroAliases[from] = to;
  }
  return { historyRows, groups, series, metroSeries, metroAliases };
}

const TABLE = readSeriesTable(table);

/** The series the cron pulls, in the order the strip shows them. */
export const SERIES: readonly SeriesMeta[] = TABLE.series;
/** The strip's groups, in order. */
export const GROUPS: readonly SeriesGroup[] = TABLE.groups;
/** Each covered metro's own series. */
export const METRO_SERIES: readonly MetroSeriesMeta[] = TABLE.metroSeries;
/**
 * How many observations per series the cron writes and the read fetches —
 * one number, so the page reads back exactly the path the cron backfilled.
 */
export const HISTORY_ROWS: number = TABLE.historyRows;

export function seriesMeta(id: string): SeriesMeta | null {
  return SERIES.find((s) => s.id === id) ?? METRO_SERIES.find((s) => s.id === id) ?? null;
}

const METRO_METRIC_ORDER: readonly MetroMetric[] = METRO_METRICS;

/**
 * A metro's series, metric by metric: its own where FRED publishes for it,
 * and for the metrics it lacks, the MSA it sits in — a suburb has its own
 * unemployment rate and nothing else at this cadence, Newark its own house
 * price index and nothing else. A borrowed series keeps the MSA's `metro`
 * and `area`, so the page can name whose figure it is rather than passing
 * it off as the county's. Empty for a metro the table does not cover.
 */
export function metroSeriesFor(metroId: string): {
  metro: string;
  series: MetroSeriesMeta[];
  /** The metrics shown from the MSA rather than the metro's own series. */
  borrowed: MetroMetric[];
} {
  const own = METRO_SERIES.filter((m) => m.metro === metroId);
  const alias = TABLE.metroAliases[metroId];
  const fromAlias = alias
    ? METRO_SERIES.filter(
        (m) => m.metro === alias && !own.some((o) => o.metric === m.metric),
      )
    : [];
  const series = [...own, ...fromAlias].sort(
    (a, b) => METRO_METRIC_ORDER.indexOf(a.metric) - METRO_METRIC_ORDER.indexOf(b.metric),
  );
  return { metro: metroId, series, borrowed: fromAlias.map((m) => m.metric) };
}

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

/**
 * The newest observation per known series, with its age, its freshness,
 * its move since the observation before it, and its recent path.
 *
 * Rows arrive newest-first from the query, but nothing here depends on that:
 * they are sorted per series, so a query that changes its order cannot
 * quietly start reporting the oldest figure as today's. A series the table
 * holds but this table of series does not is dropped, so adding a series
 * to the cron without adding it here shows nothing rather than an
 * unlabelled row.
 */
export function readRates(rows: readonly RateRow[], now: Date): LiveRate[] {
  return readRatesOf(SERIES, rows, now);
}

/** A metro's series read the same way, in the table's order. */
export function readMetroRates(metroId: string, rows: readonly RateRow[], now: Date): LiveRate[] {
  return readRatesOf(metroSeriesFor(metroId).series, rows, now);
}

function readRatesOf(metas: readonly SeriesMeta[], rows: readonly RateRow[], now: Date): LiveRate[] {
  const out: LiveRate[] = [];
  for (const meta of metas) {
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
    // One observation per date: the cron upserts on (series_id, obs_date),
    // so a duplicate should be impossible — but if one arrived, comparing
    // a day against itself would report a flat market on every series.
    let byDate: Observation[] = [];
    for (const r of mine) {
      if (byDate.length && byDate[byDate.length - 1].obsDate === r.obs_date) continue;
      byDate.push({ obsDate: r.obs_date, value: r.value });
    }
    if (meta.derived === "yoy") {
      byDate = yearOverYear(byDate);
      if (byDate.length === 0) continue;
    }
    const head = byDate[0];
    const prior = byDate[1];
    const age = ageDays(head.obsDate, now);
    out.push({
      meta,
      obsDate: head.obsDate,
      value: head.value,
      ageDays: age,
      fresh: age <= meta.freshDays,
      move: prior ? moveBetween(meta.unit, head.value, prior.value) : null,
      moveUnit: moveUnitOf(meta.unit),
      history: byDate.slice(0, HISTORY_ROWS).reverse(),
    });
  }
  return out;
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

/** The rates by the strip's groups, in order, empty groups left out. */
export function groupRates(
  rates: readonly LiveRate[],
): { group: SeriesGroup; rates: LiveRate[] }[] {
  return GROUPS.map((group) => ({
    group,
    rates: rates.filter((r) => r.meta.group === group.id),
  })).filter((g) => g.rates.length > 0);
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
      return `${Math.round(r.value).toLocaleString("en-US")}k`;
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

/** The series' own page on FRED — the level's page for a transformed series. */
export function fredUrl(id: string): string {
  return `https://fred.stlouisfed.org/series/${seriesMeta(id)?.fred ?? id}`;
}
