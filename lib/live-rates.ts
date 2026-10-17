/**
 * Today's rates, and which of them may become a number in a box.
 *
 * Every figure on the site that moves with the market comes through one
 * table: the Treasury curve, SOFR and its averages, the policy rates,
 * corporate credit, the mortgage survey, bank CRE lending and its standards,
 * inflation and the cost of building, jobs, and the multifamily supply
 * pipeline — the fifty national FRED series the weekday cron writes
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

import { withArticle } from "@/lib/article";
import table from "@/data/fred-series.json";
import {
  SECTOR_JOBS_METRICS,
  ageDays,
  fredUrlOf,
  moveBetween,
  moveUnitOf,
  seriesUrlOf,
  yearOverYear,
  type Cadence,
  type GroupId,
  type LiveRate,
  type MetroMetric,
  type MetroSeriesMeta,
  type Observation,
  type RateRow,
  type SeriesGroup,
  type SeriesMeta,
  type Unit,
} from "@/lib/live-rates-core";

/** Everything that needs no table: lib/live-rates-core, re-exported so a
 *  server module imports either. A client module imports the core. */
export * from "@/lib/live-rates-core";

const CADENCES: readonly Cadence[] = ["daily", "weekly", "monthly", "quarterly", "annual"];
const UNITS: readonly Unit[] = ["pct", "spread", "pts", "count", "units"];

const METRO_METRICS: readonly MetroMetric[] = [
  "unemployment",
  "jobs_yoy",
  ...SECTOR_JOBS_METRICS,
  "permits",
  "permits_1unit",
  "hpi_yoy",
  "rent_cpi_yoy",
  "rental_vacancy_msa",
  "rental_vacancy_state",
  "rental_vacancy",
];

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
  if (o.source !== undefined && o.source !== "fred" && o.source !== "bls" && o.source !== "census") {
    throw new Error(`${where}: source must be "fred", "bls" or "census"`);
  }
  // FRED's transforms cannot apply to a series FRED does not have: a BLS
  // series is the level, under the BLS id, and the page derives the change.
  if (o.source === "bls" && (typeof o.units === "string" || (o.fred !== undefined && o.fred !== o.id))) {
    throw new Error(`${where}: a BLS series is stored under its own id, untransformed`);
  }
  // A Census workbook series is matched by the metro area's name and has
  // no FRED id to transform; its margin of error, where it carries one, is
  // a series of its own.
  if (o.source === "census") {
    if (typeof o.census !== "string" || !o.census.trim()) {
      throw new Error(`${where}: a Census series needs the metro area's name prefix (census)`);
    }
    if (typeof o.units === "string" || (o.fred !== undefined && o.fred !== o.id) || o.derived !== undefined) {
      throw new Error(`${where}: a Census series is stored under its own id, untransformed`);
    }
  } else if (o.census !== undefined) {
    throw new Error(`${where}: only a Census series names a metro area to match`);
  }
  if (o.moe !== undefined && (typeof o.moe !== "string" || !o.moe || o.moe === o.id)) {
    throw new Error(`${where}: moe must name a companion series of its own`);
  }
  // A derived figure is computed from the stored LEVEL, so the table row is
  // the level and must be filed under the level's own id, untransformed.
  if (o.derived === "yoy" && (typeof o.units === "string" || (o.fred !== undefined && o.fred !== o.id))) {
    throw new Error(`${where}: a derived series stores the level under FRED's own id, with no transform`);
  }
  return {
    id: o.id,
    fred: typeof o.fred === "string" ? o.fred : o.id,
    source: o.source === "bls" ? "bls" : o.source === "census" ? "census" : "fred",
    moe: typeof o.moe === "string" ? o.moe : null,
    census: typeof o.census === "string" ? o.census.trim() : null,
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
  /** The Census regions' series — `metro` is the region's id, never a
   *  covered metro's — for the figures the survey publishes at no finer
   *  grain, borrowed by every metro in the region and named as the region's. */
  regionSeries: MetroSeriesMeta[];
  /** Each covered metro's Census region. */
  metroRegions: Record<string, string>;
  /** Each state's own series — `metro` is the state's market id
   *  (`state:PA`), never a covered metro's — the grain a deal outside the
   *  covered metros reads, said as the state's. */
  stateSeries: MetroSeriesMeta[];
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
    if (seenMetro.has(k)) throw new Error(`${where}: ${o.metro} already has ${withArticle(String(o.metric))} series`);
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
  // The regions' series, the same shape filed under a region rather than a
  // metro; a region series is never also a strip or a metro series.
  const regionRaw = t.regionSeries === undefined ? [] : t.regionSeries;
  if (!Array.isArray(regionRaw)) throw new Error("fred-series: regionSeries must be an array");
  const seenRegion = new Set<string>();
  const regionSeries: MetroSeriesMeta[] = regionRaw.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const where = `fred-series: region series ${i} (${String(o.id ?? "?")})`;
    if (typeof o.metro !== "string" || !o.metro) throw new Error(`${where}: needs a region`);
    if (!METRO_METRICS.includes(o.metric as MetroMetric)) throw new Error(`${where}: bad metric`);
    if (typeof o.area !== "string" || !o.area) throw new Error(`${where}: needs the area FRED names`);
    const m = readSeriesEntry({ ...o, group: "metro", contractRate: false }, where, new Set(["metro"]));
    const k = `${o.metro}|${o.metric}`;
    if (seenRegion.has(k)) throw new Error(`${where}: ${o.metro} already has ${withArticle(String(o.metric))} series`);
    seenRegion.add(k);
    if (seen.has(m.id) || metroSeries.some((x) => x.id === m.id)) {
      throw new Error(`${where}: id is already a strip or metro series`);
    }
    return { ...m, metro: o.metro, metric: o.metric as MetroMetric, area: o.area };
  });
  const regionsRaw = t.metroRegions === undefined ? {} : t.metroRegions;
  if (!regionsRaw || typeof regionsRaw !== "object" || Array.isArray(regionsRaw)) {
    throw new Error("fred-series: metroRegions must be an object");
  }
  const metroRegions: Record<string, string> = {};
  for (const [metro, region] of Object.entries(regionsRaw as Record<string, unknown>)) {
    if (typeof region !== "string") throw new Error(`fred-series: region of ${metro} must name a region`);
    if (!regionSeries.some((r) => r.metro === region)) {
      throw new Error(`fred-series: ${metro} → ${region}, but ${region} has no series`);
    }
    metroRegions[metro] = region;
  }
  // The states' series: the same shape, filed by (state, metric) under the
  // state's market id, so a reader that takes a market id works unchanged.
  // A state series is never also a strip, a metro or a region series.
  const stateRaw = t.stateSeries === undefined ? [] : t.stateSeries;
  if (!Array.isArray(stateRaw)) throw new Error("fred-series: stateSeries must be an array");
  const seenState = new Set<string>();
  const stateSeries: MetroSeriesMeta[] = stateRaw.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const where = `fred-series: state series ${i} (${String(o.id ?? "?")})`;
    if (typeof o.state !== "string" || !/^[A-Z]{2}$/.test(o.state)) throw new Error(`${where}: needs a two-letter state`);
    if (!METRO_METRICS.includes(o.metric as MetroMetric)) throw new Error(`${where}: bad metric`);
    if (typeof o.area !== "string" || !o.area) throw new Error(`${where}: needs the area FRED names`);
    const m = readSeriesEntry({ ...o, group: "metro", contractRate: false }, where, new Set(["metro"]));
    const k = `${o.state}|${o.metric}`;
    if (seenState.has(k)) throw new Error(`${where}: ${o.state} already has ${withArticle(String(o.metric))} series`);
    seenState.add(k);
    if (seen.has(m.id) || metroSeries.some((x) => x.id === m.id) || regionSeries.some((x) => x.id === m.id)) {
      throw new Error(`${where}: id is already a strip, metro or region series`);
    }
    return { ...m, metro: `state:${o.state}`, metric: o.metric as MetroMetric, area: o.area };
  });
  // A margin-of-error series is a companion, never a series of the table's
  // own: its id collides with nothing, and two figures never share one.
  const everyId = new Set([...series, ...metroSeries, ...regionSeries, ...stateSeries].map((m) => m.id));
  const seenMoe = new Set<string>();
  for (const m of [...series, ...metroSeries, ...regionSeries, ...stateSeries]) {
    if (m.moe === null) continue;
    if (everyId.has(m.moe) || seenMoe.has(m.moe)) {
      throw new Error(`fred-series: ${m.id}: moe ${m.moe} is already a series`);
    }
    seenMoe.add(m.moe);
  }
  return { historyRows, groups, series, metroSeries, metroAliases, regionSeries, metroRegions, stateSeries };
}

const TABLE = readSeriesTable(table);

/** The series the cron pulls, in the order the strip shows them. */
export const SERIES: readonly SeriesMeta[] = TABLE.series;
/** The strip's groups, in order. */
export const GROUPS: readonly SeriesGroup[] = TABLE.groups;
/** Each covered metro's own series. */
export const METRO_SERIES: readonly MetroSeriesMeta[] = TABLE.metroSeries;
/** The Census regions' series, borrowed by every metro in the region. */
export const REGION_SERIES: readonly MetroSeriesMeta[] = TABLE.regionSeries;
/**
 * Each state's own series, filed under the state's market id (`state:PA`)
 * — the grain a deal outside the covered metros reads. The same shape as
 * a metro's, so every reader that takes a market id works unchanged; a
 * state has no alias and borrows nothing, and it is never a row on the
 * market page's boards, which rank the covered metros alone.
 */
export const STATE_SERIES: readonly MetroSeriesMeta[] = TABLE.stateSeries;
/**
 * How many observations per series the cron writes and the read fetches —
 * one number, so the page reads back exactly the path the cron backfilled.
 */
export const HISTORY_ROWS: number = TABLE.historyRows;
/**
 * The metro a suburb borrows from (`metroAliases`: Montgomery County's is
 * Washington's), or null for a market that borrows nothing. The pipeline's
 * cards read it for a photograph as the series read it for a figure (#438).
 */
export function metroAliasOf(metroId: string): string | null {
  return TABLE.metroAliases[metroId] ?? null;
}

export function seriesMeta(id: string): SeriesMeta | null {
  return (
    SERIES.find((s) => s.id === id) ??
    METRO_SERIES.find((s) => s.id === id) ??
    REGION_SERIES.find((s) => s.id === id) ??
    STATE_SERIES.find((s) => s.id === id) ??
    null
  );
}

/** The prefix a state's market id wears (`state:PA`) — lib/market-match's. */
const STATE_ID_PREFIX = "state:";

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
  // A state's market: its own series, nothing borrowed, in the same order.
  if (metroId.startsWith(STATE_ID_PREFIX)) {
    const series = STATE_SERIES.filter((m) => m.metro === metroId).sort(
      (a, b) => METRO_METRIC_ORDER.indexOf(a.metric) - METRO_METRIC_ORDER.indexOf(b.metric),
    );
    return { metro: metroId, series, borrowed: [] };
  }
  const own = METRO_SERIES.filter((m) => m.metro === metroId);
  const alias = TABLE.metroAliases[metroId];
  const fromAlias = alias
    ? METRO_SERIES.filter(
        (m) => m.metro === alias && !own.some((o) => o.metric === m.metric),
      )
    : [];
  // The Census region's, for what the survey publishes at no finer grain:
  // filed under the region's id, so the tile wears the region's name and
  // a metro's row never claims a figure it does not have.
  const region = TABLE.metroRegions[metroId];
  const fromRegion = region
    ? REGION_SERIES.filter(
        (m) =>
          m.metro === region &&
          !own.some((o) => o.metric === m.metric) &&
          !fromAlias.some((o) => o.metric === m.metric),
      )
    : [];
  const series = [...own, ...fromAlias, ...fromRegion].sort(
    (a, b) => METRO_METRIC_ORDER.indexOf(a.metric) - METRO_METRIC_ORDER.indexOf(b.metric),
  );
  return { metro: metroId, series, borrowed: [...fromAlias, ...fromRegion].map((m) => m.metric) };
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

/**
 * One metric across every metro that has it — the sector leaderboard's
 * read (`liveSectorRates`): the fourteen MSAs' payrolls in one sector, or
 * their total nonfarm, read the same way as everything else.
 */
export function readMetricRates(metric: MetroMetric, rows: readonly RateRow[], now: Date): LiveRate[] {
  return readRatesOf(metricSeries(metric), rows, now);
}

/** The metro series filed under one metric, every metro's own (never a borrowed copy). */
export function metricSeries(metric: MetroMetric): MetroSeriesMeta[] {
  return METRO_SERIES.filter((s) => s.metric === metric);
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
    // The companion's row for the SAME date, or nothing — a margin from
    // another quarter is not this figure's.
    const moeRow = meta.moe
      ? rows.find((r) => r.series_id === meta.moe && r.obs_date === head.obsDate && Number.isFinite(r.value))
      : undefined;
    out.push({
      meta,
      obsDate: head.obsDate,
      value: head.value,
      ageDays: age,
      fresh: age <= meta.freshDays,
      move: prior ? moveBetween(meta.unit, head.value, prior.value) : null,
      moveUnit: moveUnitOf(meta.unit),
      history: byDate.slice(0, HISTORY_ROWS).reverse(),
      moe: moeRow ? moeRow.value : null,
    });
  }
  return out;
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

/** The series' own page on FRED — the level's page for a transformed series. */
export function fredUrl(id: string): string {
  const meta = seriesMeta(id);
  return meta ? fredUrlOf(meta) : `https://fred.stlouisfed.org/series/${id}`;
}

/**
 * The series' own page at its source: FRED's, or the BLS's for a series FRED
 * does not carry. What every tile links to, so a figure is never credited to
 * a source that does not publish it.
 */
export function seriesUrl(id: string): string {
  const meta = seriesMeta(id);
  return meta ? seriesUrlOf(meta) : fredUrl(id);
}
