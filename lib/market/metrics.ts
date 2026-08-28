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
  if (best) {
    const from = best.points[0];
    const to = best.points[best.points.length - 1];
    const years = yearsBetween(from.period, to.period);
    if (years > 0 && from.value > 0 && to.value > 0) {
      cagr = Math.pow(to.value / from.value, 1 / years) - 1;
      cagrYears = years;
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
  /** sum of net absorption over the trailing four quarters (or 12 months) */
  sf: number | null;
  /** the periods it covered, so the figure is never an orphan number */
  periods: string[];
  quartersUsed: number;
}

/**
 * Trailing-12 net absorption: the most recent four quarterly periods, summed.
 *
 * With fewer than four quarters it sums what exists and says how many it used,
 * rather than annualizing a single quarter — extrapolating one quarter to a
 * year is how a lumpy market becomes a confident wrong number.
 */
export function trailing12Absorption(periods: SubmarketPeriod[]): TrailingAbsorption {
  const rows = sortPeriods(periods).filter((p) => p.netAbsorptionSf != null);
  if (!rows.length) return { sf: null, periods: [], quartersUsed: 0 };
  const window = rows.slice(-4);
  return {
    sf: window.reduce((s, p) => s + (p.netAbsorptionSf ?? 0), 0),
    periods: window.map((p) => p.period),
    quartersUsed: window.length,
  };
}

export type MonthsOfSupply =
  | { status: "ok"; months: number; ucSf: number; monthlyAbsorption: number }
  | { status: "supply_exceeds_demand"; ucSf: number; t12Absorption: number }
  | { status: "unknown"; reason: string };

/**
 * Months of supply = under-construction SF ÷ (T12 absorption ÷ 12).
 *
 * Where absorption is zero or negative the answer is NOT infinity and NOT a
 * large number — the market is giving space back while more is being built.
 * That's a different statement and it gets its own status.
 */
export function monthsOfSupply(
  underConstructionSf: number | null,
  t12AbsorptionSf: number | null,
): MonthsOfSupply {
  if (underConstructionSf == null) {
    return { status: "unknown", reason: "No under-construction SF in this submarket's data." };
  }
  if (t12AbsorptionSf == null) {
    return { status: "unknown", reason: "No net absorption in this submarket's data." };
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
      )} SF — a ${fmt(Math.abs(deltaSf))} SF ${deltaSf > 0 ? "shortfall in" : "excess in"} the list${
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
  troughVacancy: { value: number; period: string } | null;
  deliveries: DeliveryQuarter[];
  reconciliation: PipelineReconciliation;
}

export function submarketMetrics(
  periods: SubmarketPeriod[],
  properties: PipelineProperty[],
): SubmarketMetrics {
  const sorted = sortPeriods(periods);
  const latest = sorted[sorted.length - 1] ?? null;
  const absorption = trailing12Absorption(sorted);
  const vacancy = simpleTrend(sorted, "vacancyPct");

  const trough = vacancy.reduce<{ value: number; period: string } | null>(
    (best, p) => (best == null || p.value < best.value ? { value: p.value, period: p.period } : best),
    null,
  );

  return {
    latest,
    periodsCovered: sorted.length,
    rent: rentTrend(sorted),
    inventory: simpleTrend(sorted, "inventorySf"),
    vacancy,
    absorption,
    supply: monthsOfSupply(latest?.underConstructionSf ?? null, absorption.sf),
    ucShare: ucShareOfInventory(latest?.underConstructionSf ?? null, latest?.inventorySf ?? null),
    troughVacancy: trough,
    deliveries: deliverySchedule(properties),
    reconciliation: reconcilePipeline(latest?.underConstructionSf ?? null, properties),
  };
}
