/**
 * Submarket metrics — traps 2 and 3, plus the analytics that make exit cap and
 * rent growth defensible.
 *
 * Trap 2 (rent basis inconsistency): overall rent and direct NNN rent are
 * DIFFERENT SERIES. In one quarter, sublease space contaminated an overall
 * figure badly enough to make the trend meaningless. So a rent trend here is
 * broken into segments at every basis change, and any comparison that spans
 * one is flagged rather than drawn as a single line.
 *
 * Trap 3 (pipeline that doesn't tie): under-construction SF in a summary grid
 * should equal the sum of the property-level list. When it doesn't, something
 * is double-counted or filtered inconsistently — so the delta is computed and
 * shown, not reconciled away.
 *
 * Pure.
 */
import { withArticle } from "@/lib/article";
import type { PipelineProperty, RentBasis, SubmarketPeriod } from "./types";
import { RENT_BASIS_LABEL } from "./types";

/** Ascending by period. */
export const sortPeriods = (periods: SubmarketPeriod[]): SubmarketPeriod[] =>
  [...periods].sort((a, b) => a.period.localeCompare(b.period));

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export interface TrendPoint {
  period: string;
  value: number;
  source: string;
  unverified: boolean;
}

/** A run of periods sharing one rent basis. A basis change starts a new one. */
export interface TrendSegment {
  basis: RentBasis | null;
  basisLabel: string;
  points: TrendPoint[];
}

export interface RentTrend {
  segments: TrendSegment[];
  /** true when the series changes basis at least once */
  basisChanged: boolean;
  /** plain-English flag for the UI when it did */
  basisFlag: string | null;
  /**
   * Compound annual growth on the LONGEST single-basis segment. Null when no
   * segment has two dated points — an honest "can't compute this" beats a
   * number spanning a basis change.
   */
  cagr: number | null;
  cagrBasis: RentBasis | null;
  cagrFrom: string | null;
  cagrTo: string | null;
  cagrYears: number | null;
  /** how many of the CAGR's two end points are unverified (web-sourced) —
   *  the figure is struck on those two alone, so they are what it includes */
  cagrUnverified: number;
}

const YEAR_MS = 365.25 * 86_400_000;

const yearsBetween = (a: string, b: string): number =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / YEAR_MS;

/**
 * The asking-rent trend, segmented on basis.
 *
 * A period with no rent, or with a rent but no stated basis, still gets a
 * segment of its own rather than being folded into the neighbouring one:
 * "basis not stated" is not the same claim as "same basis as last quarter".
 */
export function rentTrend(periods: SubmarketPeriod[]): RentTrend {
  const rows = sortPeriods(periods).filter((p) => p.askingRent != null);
  const segments: TrendSegment[] = [];
  let current: TrendSegment | null = null;

  for (const p of rows) {
    if (!current || current.basis !== p.rentBasis) {
      current = {
        basis: p.rentBasis,
        basisLabel: p.rentBasis ? RENT_BASIS_LABEL[p.rentBasis] : "basis not stated",
        points: [],
      };
      segments.push(current);
    }
    current.points.push({
      period: p.period,
      value: p.askingRent!,
      source: p.source,
      unverified: p.unverified,
    });
  }

  const distinctBases = new Set(rows.map((p) => p.rentBasis));
  const basisChanged = distinctBases.size > 1;

  // CAGR over the longest single-basis run — never across a break.
  let best: TrendSegment | null = null;
  for (const s of segments) {
    if (s.points.length < 2) continue;
    if (!best || s.points.length > best.points.length) best = s;
  }

  let cagr: number | null = null;
  let cagrYears: number | null = null;
  let cagrUnverified = 0;
  if (best) {
    const from = best.points[0];
    const to = best.points[best.points.length - 1];
    const years = yearsBetween(from.period, to.period);
    if (years > 0 && from.value > 0 && to.value > 0) {
      cagr = Math.pow(to.value / from.value, 1 / years) - 1;
      cagrYears = years;
      cagrUnverified = [from, to].filter((p) => p.unverified).length;
    }
  }

  return {
    segments,
    basisChanged,
    basisFlag: basisChanged
      ? `This series changes rent basis (${[...distinctBases]
          .map((b) => (b ? RENT_BASIS_LABEL[b] : "not stated"))
          .join(" → ")}). The trend line is broken at each change — comparing across one compares different things.`
      : null,
    cagr,
    cagrBasis: best?.basis ?? null,
    cagrFrom: best?.points[0]?.period ?? null,
    cagrTo: best?.points[best.points.length - 1]?.period ?? null,
    cagrYears,
    cagrUnverified,
  };
}

/** Inventory and vacancy need no basis handling — one series each. */
export function simpleTrend(
  periods: SubmarketPeriod[],
  key: "inventorySf" | "vacancyPct" | "underConstructionSf" | "netAbsorptionSf",
): TrendPoint[] {
  return sortPeriods(periods)
    .filter((p) => p[key] != null)
    .map((p) => ({
      period: p.period,
      value: p[key] as number,
      source: p.source,
      unverified: p.unverified,
    }));
}

// ---------------------------------------------------------------------------
// Absorption and supply
// ---------------------------------------------------------------------------

export interface TrailingAbsorption {
  /** net absorption over the twelve months to the newest loaded period —
   *  null when the loaded periods do not make up that year */
  sf: number | null;
  /** the periods inside that year with a net absorption, oldest first, so
   *  the figure is never an orphan number */
  periods: string[];
  /** the newest loaded period: the year runs to it */
  to: string | null;
  /** months between loaded periods — 3 for a quarterly grid, 12 for annual
   *  rows; null with fewer than two periods, which say nothing about it */
  cadenceMonths: number | null;
  /** why there is no trailing-year figure, when there is none */
  reason: string | null;
  /** how many of the periods summed are unverified (web-sourced) */
  unverified: number;
}

/** No row carries a net absorption at all — a blank, not a gap. */
export const NO_ABSORPTION = "No net absorption in this submarket's data.";

/** A period end's month on one count (year × 12 + month), so two period
 *  ends compare in whole months whatever day of the month each falls on. */
const monthIndex = (iso: string): number =>
  Number(iso.slice(0, 4)) * 12 + (Number(iso.slice(5, 7)) - 1);

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (mi: number): string => `${MONTH_ABBR[((mi % 12) + 12) % 12]} ${Math.floor(mi / 12)}`;

/** What one period of a series of this cadence is called, singular and
 *  plural: a quarterly grid's rows are quarters, annual rows are years. */
export function periodWords(cadenceMonths: number): [string, string] {
  switch (cadenceMonths) {
    case 1:
      return ["month", "months"];
    case 3:
      return ["quarter", "quarters"];
    case 6:
      return ["half-year", "half-years"];
    case 12:
      return ["year", "years"];
    default:
      return [`${cadenceMonths}-month period`, `${cadenceMonths}-month periods`];
  }
}

/**
 * The series' cadence: the shortest gap, in whole months, between two loaded
 * period ends — a quarterly grid's 3, annual rows' 12. Null with fewer than
 * two distinct period ends: one period end says nothing about how long the
 * period was, and a year-end date is a Q4 date too.
 */
export function periodCadenceMonths(periods: SubmarketPeriod[]): number | null {
  const months = [...new Set(periods.map((p) => monthIndex(p.period)))].sort((a, b) => a - b);
  let cadence: number | null = null;
  for (let i = 1; i < months.length; i++) {
    const gap = months[i] - months[i - 1];
    if (cadence == null || gap < cadence) cadence = gap;
  }
  return cadence;
}

/**
 * Trailing-12 net absorption: the twelve months to the newest loaded period,
 * taken by DATE, and given only where the loaded periods make up that year.
 *
 * A row's net absorption is its own period's — a quarter's on a quarterly
 * grid, a year's on annual rows (an import reads a bare "2025" as a year
 * end) — so summing "the last four rows" read four YEARS as twelve months on
 * annual data (months of supply a quarter of the truth, the flattering way)
 * and one quarter as a year (four times the truth). Here the series'
 * cadence is read off the gaps between its period ends, and the year is
 * summed only when a period with a net absorption sits at every step of it:
 * four quarters, twelve months, or one year-end row with the year before it
 * loaded. One period alone, a missing quarter, uneven spacing or two
 * periods in one month leave it null, with the reason — never a sum of
 * whatever exists, and never one quarter annualized.
 */
export function trailing12Absorption(periods: SubmarketPeriod[]): TrailingAbsorption {
  const sorted = sortPeriods(periods);
  const newest = sorted[sorted.length - 1] ?? null;
  const none = (reason: string): TrailingAbsorption => ({
    sf: null,
    periods: [],
    to: newest?.period ?? null,
    cadenceMonths: null,
    reason,
    unverified: 0,
  });
  if (!newest || !sorted.some((p) => p.netAbsorptionSf != null)) return none(NO_ABSORPTION);

  const end = monthIndex(newest.period);
  const inYear = sorted.filter((p) => monthIndex(p.period) > end - 12);
  const summed = inYear.filter((p) => p.netAbsorptionSf != null);
  const cadence = periodCadenceMonths(sorted);
  const partial = (reason: string): TrailingAbsorption => ({
    sf: null,
    periods: summed.map((p) => p.period),
    to: newest.period,
    cadenceMonths: cadence,
    reason,
    unverified: summed.filter((p) => p.unverified).length,
  });

  for (let i = 1; i < sorted.length; i++) {
    if (monthIndex(sorted[i].period) === monthIndex(sorted[i - 1].period)) {
      return partial(
        `Two periods end in ${monthLabel(monthIndex(sorted[i].period))} (${sorted[i - 1].period} and ${sorted[i].period}), so a trailing year would count that month twice.`,
      );
    }
  }
  if (cadence == null) {
    return partial(
      "One period loaded — nothing shows whether its absorption is a month's, a quarter's or a year's, so no trailing year can be read off it.",
    );
  }
  if (12 % cadence !== 0) {
    return partial(`The periods are ${cadence} months apart, which does not make up a year.`);
  }

  // The year's steps: the newest period end and every cadence before it,
  // back to (not including) the same month a year earlier.
  const steps = Array.from({ length: 12 / cadence }, (_, i) => end - 12 + cadence * (i + 1));
  if (inYear.some((p) => !steps.includes(monthIndex(p.period)))) {
    return partial("The loaded periods are not evenly spaced, so they do not make up the trailing year.");
  }
  const missing = steps.filter((m) => !summed.some((p) => monthIndex(p.period) === m));
  if (missing.length) {
    const [one, many] = periodWords(cadence);
    return partial(
      `No net absorption for the ${one} ending ${missing.map(monthLabel).join(", ")} — the year to ${monthLabel(end)} needs all ${steps.length} ${steps.length === 1 ? one : many}.`,
    );
  }

  return {
    sf: summed.reduce((s, p) => s + (p.netAbsorptionSf ?? 0), 0),
    periods: summed.map((p) => p.period),
    to: newest.period,
    cadenceMonths: cadence,
    reason: null,
    unverified: summed.filter((p) => p.unverified).length,
  };
}

/** "4 quarters to 2025-12-31", "1 year to 2025-12-31" — what a trailing
 *  year was summed from, for the line under the figure. */
export function trailingYearBasis(t: TrailingAbsorption): string {
  if (t.cadenceMonths == null || !t.to) return t.periods.join(", ");
  const [one, many] = periodWords(t.cadenceMonths);
  return `${t.periods.length} ${t.periods.length === 1 ? one : many} to ${t.to}`;
}

/** "includes 1 unverified period" — the mark a figure carries when a
 *  web-sourced period went into it; "" when none did. */
export function unverifiedMark(count: number): string {
  if (count <= 0) return "";
  return `includes ${count} unverified period${count === 1 ? "" : "s"}`;
}

export type MonthsOfSupply =
  | { status: "ok"; months: number; ucSf: number; monthlyAbsorption: number }
  | { status: "supply_exceeds_demand"; ucSf: number; t12Absorption: number }
  /** absorption is loaded, but not a whole trailing year of it */
  | { status: "not_computable"; reason: string }
  | { status: "unknown"; reason: string };

/**
 * Months of supply = under-construction SF ÷ (T12 absorption ÷ 12).
 *
 * Where absorption is zero or negative the answer is NOT infinity and NOT a
 * large number — the market is giving space back while more is being built.
 * That's a different statement and it gets its own status.
 *
 * `absorptionReason` is why there is no trailing year, when absorption is
 * loaded but does not make one up (`trailing12Absorption`'s reason): months
 * of supply is then NOT COMPUTABLE, and says why, rather than dividing by
 * whatever periods exist.
 */
export function monthsOfSupply(
  underConstructionSf: number | null,
  t12AbsorptionSf: number | null,
  absorptionReason?: string | null,
): MonthsOfSupply {
  if (underConstructionSf == null) {
    return { status: "unknown", reason: "No under-construction SF in this submarket's data." };
  }
  if (t12AbsorptionSf == null) {
    return absorptionReason && absorptionReason !== NO_ABSORPTION
      ? { status: "not_computable", reason: absorptionReason }
      : { status: "unknown", reason: NO_ABSORPTION };
  }
  if (t12AbsorptionSf <= 0) {
    return {
      status: "supply_exceeds_demand",
      ucSf: underConstructionSf,
      t12Absorption: t12AbsorptionSf,
    };
  }
  const monthly = t12AbsorptionSf / 12;
  return {
    status: "ok",
    months: underConstructionSf / monthly,
    ucSf: underConstructionSf,
    monthlyAbsorption: monthly,
  };
}

/** UC SF as a share of inventory. Null rather than a divide-by-zero. */
export function ucShareOfInventory(
  underConstructionSf: number | null,
  inventorySf: number | null,
): number | null {
  if (underConstructionSf == null || inventorySf == null || inventorySf <= 0) return null;
  return underConstructionSf / inventorySf;
}

// ---------------------------------------------------------------------------
// Delivery schedule
// ---------------------------------------------------------------------------

export interface DeliveryQuarter {
  /** "2027-Q2" */
  quarter: string;
  sf: number;
  count: number;
  names: string[];
  /** true when any building in the quarter is flagged stale */
  hasStale: boolean;
}

const quarterOf = (iso: string): string => {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  return `${y}-Q${Math.min(4, Math.max(1, Math.ceil(m / 3)))}`;
};

/**
 * Deliveries by quarter, from the property list — INCLUDED properties only.
 * A pipeline with an excluded data-center campus in it is exactly the schedule
 * that would have misled you.
 */
export function deliverySchedule(properties: PipelineProperty[]): DeliveryQuarter[] {
  const buckets = new Map<string, DeliveryQuarter>();
  for (const p of properties) {
    if (p.excluded || p.status === "delivered" || !p.expectedDelivery) continue;
    const q = quarterOf(p.expectedDelivery);
    const bucket = buckets.get(q) ?? { quarter: q, sf: 0, count: 0, names: [], hasStale: false };
    bucket.sf += p.sf ?? 0;
    bucket.count += 1;
    if (p.name) bucket.names.push(p.name);
    if (p.staleFlag) bucket.hasStale = true;
    buckets.set(q, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.quarter.localeCompare(b.quarter));
}

// ---------------------------------------------------------------------------
// Trap 3 — reconciliation
// ---------------------------------------------------------------------------

export interface PipelineReconciliation {
  /** UC SF as the summary grid states it for the latest period */
  gridSf: number | null;
  /** UC SF summed from the INCLUDED property-level list */
  listSf: number;
  /** grid − list; positive means the grid claims more than the list shows */
  deltaSf: number | null;
  /** |delta| ÷ grid, decimal */
  deltaPct: number | null;
  ties: boolean;
  /** SF the exclusion rules removed, the usual explanation for a gap */
  excludedSf: number;
  message: string;
}

/**
 * Reconcile the summary grid's under-construction SF against the sum of the
 * property list. `tolerancePct` is how close counts as tied — real exports
 * disagree by rounding, not by a building.
 */
export function reconcilePipeline(
  gridSf: number | null,
  properties: PipelineProperty[],
  tolerancePct = 0.02,
): PipelineReconciliation {
  const uc = properties.filter((p) => p.status === "under_construction");
  const listSf = uc.filter((p) => !p.excluded).reduce((s, p) => s + (p.sf ?? 0), 0);
  const excludedSf = uc.filter((p) => p.excluded).reduce((s, p) => s + (p.sf ?? 0), 0);

  if (gridSf == null) {
    return {
      gridSf: null,
      listSf,
      deltaSf: null,
      deltaPct: null,
      ties: false,
      excludedSf,
      message: `No grid figure to reconcile against — the property list shows ${Math.round(
        listSf,
      ).toLocaleString("en-US")} SF under construction.`,
    };
  }

  const deltaSf = gridSf - listSf;
  const deltaPct = gridSf !== 0 ? Math.abs(deltaSf) / Math.abs(gridSf) : null;
  const ties = deltaPct != null ? deltaPct <= tolerancePct : deltaSf === 0;

  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  const message = ties
    ? `Grid and property list tie at ${fmt(gridSf)} SF under construction.`
    : `Grid says ${fmt(gridSf)} SF under construction; the property list sums to ${fmt(
        listSf,
      )} SF — ${withArticle(fmt(Math.abs(deltaSf)))} SF ${deltaSf > 0 ? "shortfall in" : "excess in"} the list${
        excludedSf > 0
          ? `. ${fmt(excludedSf)} SF was removed by your exclusion rules, which explains ${
              Math.abs(deltaSf) > 0 ? `${Math.round((excludedSf / Math.abs(deltaSf)) * 100)}%` : "none"
            } of it`
          : ". Something is double-counted or filtered inconsistently"
      }.`;

  return { gridSf, listSf, deltaSf, deltaPct, ties, excludedSf, message };
}

// ---------------------------------------------------------------------------
// Roll-up
// ---------------------------------------------------------------------------

/**
 * How many unverified (web-sourced) periods went into each figure — the
 * mark every surface prints beside it (`unverifiedMark`), because a
 * web-sourced figure is never blended into an imported series silently.
 * Zero where a figure has no value.
 */
export interface UnverifiedCounts {
  /** the newest period's UC SF and the trailing year's absorption */
  supply: number;
  /** the newest period's UC SF and inventory */
  ucShare: number;
  /** the trailing year's periods */
  absorption: number;
  /** the CAGR's two end points */
  cagr: number;
  /** the trough's own period */
  trough: number;
  /** the newest period, whose UC SF the pipeline is reconciled against */
  latest: number;
}

export interface SubmarketMetrics {
  latest: SubmarketPeriod | null;
  periodsCovered: number;
  rent: RentTrend;
  inventory: TrendPoint[];
  vacancy: TrendPoint[];
  absorption: TrailingAbsorption;
  supply: MonthsOfSupply;
  ucShare: number | null;
  /** lowest vacancy in the series — the trough a stabilized assumption is
   *  measured against */
  troughVacancy: { value: number; period: string; unverified: boolean } | null;
  deliveries: DeliveryQuarter[];
  reconciliation: PipelineReconciliation;
  unverified: UnverifiedCounts;
}

export function submarketMetrics(
  periods: SubmarketPeriod[],
  properties: PipelineProperty[],
): SubmarketMetrics {
  const sorted = sortPeriods(periods);
  const latest = sorted[sorted.length - 1] ?? null;
  const absorption = trailing12Absorption(sorted);
  const vacancy = simpleTrend(sorted, "vacancyPct");
  const rent = rentTrend(sorted);

  const trough = vacancy.reduce<{ value: number; period: string; unverified: boolean } | null>(
    (best, p) =>
      best == null || p.value < best.value
        ? { value: p.value, period: p.period, unverified: p.unverified }
        : best,
    null,
  );

  const supply = monthsOfSupply(latest?.underConstructionSf ?? null, absorption.sf, absorption.reason);
  const ucShare = ucShareOfInventory(latest?.underConstructionSf ?? null, latest?.inventorySf ?? null);
  const latestUnverified = latest?.unverified ? 1 : 0;
  // The newest period is a step of the trailing year whenever the year was
  // summed, so it is already among the absorption's periods.
  const supplyUnverified =
    supply.status === "ok" || supply.status === "supply_exceeds_demand"
      ? absorption.unverified + (latest && !absorption.periods.includes(latest.period) ? latestUnverified : 0)
      : 0;

  return {
    latest,
    periodsCovered: sorted.length,
    rent,
    inventory: simpleTrend(sorted, "inventorySf"),
    vacancy,
    absorption,
    supply,
    ucShare,
    troughVacancy: trough,
    deliveries: deliverySchedule(properties),
    reconciliation: reconcilePipeline(latest?.underConstructionSf ?? null, properties),
    unverified: {
      supply: supplyUnverified,
      ucShare: ucShare == null ? 0 : latestUnverified,
      absorption: absorption.sf == null ? 0 : absorption.unverified,
      cagr: rent.cagr == null ? 0 : rent.cagrUnverified,
      trough: trough?.unverified ? 1 : 0,
      latest: latestUnverified,
    },
  };
}
