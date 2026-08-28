/**
 * Rent roll analytics (Phase 3). All deterministic, all pure — no LLM anywhere
 * near this layer, same rule as the underwriting engine.
 *
 * The two grounding cases the shapes are built for: a 130,493 SF office at 48%
 * leased where the whole thesis is whether one tenant renews, and a 19-tenant
 * office in lease-up where the rollover schedule IS the deal.
 *
 * Conventions:
 *  - A lease with no expiry is EXCLUDED from WALT and rollover rather than
 *    assumed to expire today. It shows up in the validation issues instead.
 *  - Vacant space is never a lease. It has its own lease-up curve.
 *  - WALT is reported two ways because they diverge: SF-weighted tells you how
 *    much of the building rolls, rent-weighted tells you how much of the income
 *    does. When the big tenant is cheap, those are different deals.
 */
import type { Lease } from "./schema";
import type { ProfileDraft } from "./profiles";

const DAY_MS = 86_400_000;
const DAYS_PER_YEAR = 365.25;

const toDate = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

/** Years from `asOf` to `expiry`, floored at zero (an already-expired lease is
 *  holdover, not negative term). */
export function yearsTo(expiry: string, asOf: string): number {
  const d = (toDate(expiry) - toDate(asOf)) / DAY_MS;
  return Math.max(0, d / DAYS_PER_YEAR);
}

export interface Walt {
  /** SF-weighted years to expiry over occupied SF that carries a date */
  bySf: number | null;
  /** rent-weighted years to expiry over rent that carries a date */
  byRent: number | null;
  /** the SF and rent those figures were measured over */
  coveredSf: number;
  coveredRent: number;
  /** occupied SF/rent EXCLUDED for want of an expiry date */
  excludedSf: number;
  excludedRent: number;
  asOf: string;
}

/** Weighted average lease term, both ways. */
export function computeWalt(leases: Lease[], asOf: string): Walt {
  let sfNum = 0;
  let sfDen = 0;
  let rentNum = 0;
  let rentDen = 0;
  let excludedSf = 0;
  let excludedRent = 0;

  for (const l of leases) {
    if (l.vacant) continue;
    const sf = l.sf ?? 0;
    const rent = l.baseRentAnnual ?? 0;
    if (!l.leaseExpiry) {
      excludedSf += sf;
      excludedRent += rent;
      continue;
    }
    const years = yearsTo(l.leaseExpiry, asOf);
    if (sf > 0) {
      sfNum += years * sf;
      sfDen += sf;
    }
    if (rent > 0) {
      rentNum += years * rent;
      rentDen += rent;
    }
  }

  return {
    bySf: sfDen > 0 ? sfNum / sfDen : null,
    byRent: rentDen > 0 ? rentNum / rentDen : null,
    coveredSf: sfDen,
    coveredRent: rentDen,
    excludedSf,
    excludedRent,
    asOf,
  };
}

// ---------------------------------------------------------------------------
// Rollover
// ---------------------------------------------------------------------------

export interface RolloverYear {
  /** calendar year of expiry */
  year: number;
  sfExpiring: number;
  /** sfExpiring ÷ NRA, decimal; null when NRA is unknown */
  pctOfNra: number | null;
  rentExpiring: number;
  leaseCount: number;
  tenants: string[];
}

export interface RolloverSchedule {
  years: RolloverYear[];
  nra: number | null;
  vacantSf: number;
  /** occupied SF with no expiry date — carried separately, never bucketed */
  undatedSf: number;
  totalSfExpiring: number;
}

/**
 * SF, rent and lease count expiring per calendar year.
 *
 * `nra` defaults to the roll's own total SF (leases + vacant), which is the
 * only NRA the file itself supports. Pass the building's stated NRA when you
 * have it — that's what the "% of NRA" column should really be against.
 */
export function rolloverSchedule(
  leases: Lease[],
  options: { nra?: number | null; throughYear?: number } = {},
): RolloverSchedule {
  const rolledSf = leases.reduce((s, l) => s + (l.sf ?? 0), 0);
  const nra = options.nra ?? (rolledSf > 0 ? rolledSf : null);
  const vacantSf = leases.filter((l) => l.vacant).reduce((s, l) => s + (l.sf ?? 0), 0);
  const undatedSf = leases
    .filter((l) => !l.vacant && !l.leaseExpiry)
    .reduce((s, l) => s + (l.sf ?? 0), 0);

  const buckets = new Map<number, RolloverYear>();
  let totalSfExpiring = 0;

  for (const l of leases) {
    if (l.vacant || !l.leaseExpiry) continue;
    const year = Number(l.leaseExpiry.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const bucket = buckets.get(year) ?? {
      year,
      sfExpiring: 0,
      pctOfNra: null,
      rentExpiring: 0,
      leaseCount: 0,
      tenants: [],
    };
    bucket.sfExpiring += l.sf ?? 0;
    bucket.rentExpiring += l.baseRentAnnual ?? 0;
    bucket.leaseCount += 1;
    if (l.tenant) bucket.tenants.push(l.tenant);
    buckets.set(year, bucket);
    totalSfExpiring += l.sf ?? 0;
  }

  const years = [...buckets.values()]
    .sort((a, b) => a.year - b.year)
    .filter((y) => (options.throughYear ? y.year <= options.throughYear : true))
    .map((y) => ({ ...y, pctOfNra: nra && nra > 0 ? y.sfExpiring / nra : null }));

  return { years, nra, vacantSf, undatedSf, totalSfExpiring };
}

// ---------------------------------------------------------------------------
// Mark to market
// ---------------------------------------------------------------------------

export interface MarkToMarketRow {
  sourceRow: number;
  suite: string;
  tenant: string;
  sf: number;
  inPlacePsf: number;
  marketPsf: number;
  /** market − in place, $/SF; positive means the space is under-rented */
  gapPsf: number;
  /** gapPsf × SF, annual dollars */
  gapAnnual: number;
}

export interface MarkToMarket {
  rows: MarkToMarketRow[];
  /** SF-weighted in-place and market rents over the priced leases */
  weightedInPlacePsf: number | null;
  weightedMarketPsf: number | null;
  weightedGapPsf: number | null;
  totalGapAnnual: number;
  pricedSf: number;
  /** occupied leases skipped for want of an SF, a rent, or a market rent */
  unpricedLeases: number;
}

/**
 * In-place vs market rent, per lease and weighted overall.
 *
 * `marketRentPsf` is a lookup by space type with a `default` fallback; a lease
 * whose type has no market rent is SKIPPED and counted, never priced at zero.
 * `spaceTypeOf` decides which key a lease uses — by default the lease basis, so
 * an NNN rent isn't compared against a full-service market rent.
 */
export function markToMarket(
  leases: Lease[],
  marketRentPsf: Record<string, number>,
  spaceTypeOf: (l: Lease) => string = (l) => (l.rentBasis === "unknown" ? "default" : l.rentBasis),
): MarkToMarket {
  const rows: MarkToMarketRow[] = [];
  let unpriced = 0;
  let sfSum = 0;
  let inPlaceWeighted = 0;
  let marketWeighted = 0;
  let totalGapAnnual = 0;

  for (const l of leases) {
    if (l.vacant) continue;
    const sf = l.sf ?? 0;
    const inPlacePsf = l.rentPsf ?? (sf > 0 && l.baseRentAnnual != null ? l.baseRentAnnual / sf : null);
    const key = spaceTypeOf(l);
    const market = marketRentPsf[key] ?? marketRentPsf.default;
    if (sf <= 0 || inPlacePsf == null || market == null || !Number.isFinite(market)) {
      unpriced++;
      continue;
    }
    const gapPsf = market - inPlacePsf;
    const gapAnnual = gapPsf * sf;
    rows.push({
      sourceRow: l.sourceRow,
      suite: l.suite,
      tenant: l.tenant,
      sf,
      inPlacePsf,
      marketPsf: market,
      gapPsf,
      gapAnnual,
    });
    sfSum += sf;
    inPlaceWeighted += inPlacePsf * sf;
    marketWeighted += market * sf;
    totalGapAnnual += gapAnnual;
  }

  rows.sort((a, b) => Math.abs(b.gapAnnual) - Math.abs(a.gapAnnual));

  return {
    rows,
    weightedInPlacePsf: sfSum > 0 ? inPlaceWeighted / sfSum : null,
    weightedMarketPsf: sfSum > 0 ? marketWeighted / sfSum : null,
    weightedGapPsf: sfSum > 0 ? (marketWeighted - inPlaceWeighted) / sfSum : null,
    totalGapAnnual,
    pricedSf: sfSum,
    unpricedLeases: unpriced,
  };
}

// ---------------------------------------------------------------------------
// Rollover cost forecast
// ---------------------------------------------------------------------------

export interface RolloverCostYear {
  year: number;
  sfExpiring: number;
  /** probability-weighted TI, LC, free rent and downtime, in dollars */
  tiCost: number;
  lcCost: number;
  freeRentCost: number;
  downtimeCost: number;
  totalCost: number;
  /** totalCost ÷ sfExpiring */
  costPerExpiringSf: number | null;
}

export interface RolloverCostForecast {
  years: RolloverCostYear[];
  totalCost: number;
  /** blended cost over all expiring SF in the horizon */
  blendedCostPerSf: number | null;
  profileName: string;
}

/**
 * What the rollover costs, year by year.
 *
 * Per expiring SF:
 *   renewal branch (probability p) — renewal TI + LC on the renewal term +
 *                                    renewal free rent
 *   new-deal branch (1 − p)        — new TI + LC on the new term + new free
 *                                    rent + downtime carried at market rent
 *
 * LC is a percentage of TOTAL TERM rent, the standard convention, with the
 * term's escalations compounded in rather than priced at year-1 rent.
 */
export function rolloverCostForecast(
  schedule: RolloverSchedule,
  profile: ProfileDraft,
  options: { throughYear?: number } = {},
): RolloverCostForecast {
  const { marketRentPsf: rent, termYears, escalationPct: esc } = profile;
  // Total rent over the term, per SF, with annual escalations compounded.
  const termRentPsf =
    esc === 0
      ? rent * termYears
      : rent * ((Math.pow(1 + esc, termYears) - 1) / esc);

  const p = profile.renewalProbability;
  const q = 1 - p;

  const years: RolloverCostYear[] = schedule.years
    .filter((y) => (options.throughYear ? y.year <= options.throughYear : true))
    .map((y) => {
      const sf = y.sfExpiring;
      const tiCost = sf * (p * profile.renewalTiPsf + q * profile.newTiPsf);
      const lcCost = sf * termRentPsf * (p * profile.renewalLcPct + q * profile.newLcPct);
      const freeRentCost =
        (sf * rent * (p * profile.renewalFreeRentMonths + q * profile.newFreeRentMonths)) / 12;
      const downtimeCost = (sf * rent * q * profile.downtimeMonths) / 12;
      const totalCost = tiCost + lcCost + freeRentCost + downtimeCost;
      return {
        year: y.year,
        sfExpiring: sf,
        tiCost,
        lcCost,
        freeRentCost,
        downtimeCost,
        totalCost,
        costPerExpiringSf: sf > 0 ? totalCost / sf : null,
      };
    });

  const totalCost = years.reduce((s, y) => s + y.totalCost, 0);
  const totalSf = years.reduce((s, y) => s + y.sfExpiring, 0);

  return {
    years,
    totalCost,
    blendedCostPerSf: totalSf > 0 ? totalCost / totalSf : null,
    profileName: profile.name,
  };
}

/** The blended per-SF cost the forecast prices each expiring SF at — exposed
 *  so the workbook can write it as one Assumptions input the user can flex. */
export function blendedRolloverCostPsf(profile: ProfileDraft): {
  renewalPsf: number;
  newPsf: number;
  blendedPsf: number;
  termRentPsf: number;
} {
  const { marketRentPsf: rent, termYears, escalationPct: esc } = profile;
  const termRentPsf =
    esc === 0 ? rent * termYears : rent * ((Math.pow(1 + esc, termYears) - 1) / esc);
  const renewalPsf =
    profile.renewalTiPsf +
    profile.renewalLcPct * termRentPsf +
    (rent * profile.renewalFreeRentMonths) / 12;
  const newPsf =
    profile.newTiPsf +
    profile.newLcPct * termRentPsf +
    (rent * profile.newFreeRentMonths) / 12 +
    (rent * profile.downtimeMonths) / 12;
  const p = profile.renewalProbability;
  return { renewalPsf, newPsf, blendedPsf: p * renewalPsf + (1 - p) * newPsf, termRentPsf };
}

// ---------------------------------------------------------------------------
// Lease-up
// ---------------------------------------------------------------------------

export interface LeaseUpMonth {
  month: number;
  sfLeased: number;
  cumulativeSfLeased: number;
  remainingVacantSf: number;
  occupancyPct: number | null;
}

export interface LeaseUpCurve {
  months: LeaseUpMonth[];
  vacantSf: number;
  /** month the building reaches stabilized occupancy; null if it never does */
  monthsToStabilize: number | null;
  absorptionSfPerMonth: number;
  stabilizedOccupancyPct: number;
}

/**
 * Absorption of the vacant SF at a stated pace, building-wide.
 *
 * `startingOccupiedSf / nra` is today; the curve leases `absorptionSfPerMonth`
 * each month until the vacancy is gone or the horizon runs out. A zero pace
 * returns a flat curve and a null stabilization month rather than dividing by
 * zero — "never" is the honest answer, not infinity.
 */
export function leaseUpCurve(options: {
  vacantSf: number;
  occupiedSf: number;
  nra: number;
  absorptionSfPerMonth: number;
  horizonMonths?: number;
  stabilizedOccupancyPct?: number;
}): LeaseUpCurve {
  const {
    vacantSf,
    occupiedSf,
    nra,
    absorptionSfPerMonth,
    horizonMonths = 60,
    stabilizedOccupancyPct = 0.95,
  } = options;

  const months: LeaseUpMonth[] = [];
  let cumulative = 0;
  let monthsToStabilize: number | null = null;

  for (let m = 1; m <= horizonMonths; m++) {
    const remainingBefore = Math.max(0, vacantSf - cumulative);
    const leased = Math.min(Math.max(0, absorptionSfPerMonth), remainingBefore);
    cumulative += leased;
    const remaining = Math.max(0, vacantSf - cumulative);
    const occupancy = nra > 0 ? (occupiedSf + cumulative) / nra : null;
    months.push({
      month: m,
      sfLeased: leased,
      cumulativeSfLeased: cumulative,
      remainingVacantSf: remaining,
      occupancyPct: occupancy,
    });
    if (monthsToStabilize == null && occupancy != null && occupancy >= stabilizedOccupancyPct) {
      monthsToStabilize = m;
    }
  }

  return {
    months,
    vacantSf,
    monthsToStabilize,
    absorptionSfPerMonth,
    stabilizedOccupancyPct,
  };
}

// ---------------------------------------------------------------------------
// Concentration flags
// ---------------------------------------------------------------------------

export type FlagSeverity = "warning" | "critical";

export interface ConcentrationFlag {
  code: "tenant_nra" | "tenant_income" | "rollover_year" | "walt_under_hold";
  severity: FlagSeverity;
  message: string;
  /** the figure that tripped it, decimal or years */
  value: number;
}

export interface ConcentrationOptions {
  nra?: number | null;
  holdYears?: number;
  /** single-tenant share of NRA or income that trips a flag */
  tenantThreshold?: number;
  /** share of NRA rolling in one year that trips a flag */
  yearThreshold?: number;
}

/** The three flags that should fire without being asked for. */
export function concentrationFlags(
  leases: Lease[],
  schedule: RolloverSchedule,
  walt: Walt,
  options: ConcentrationOptions = {},
): ConcentrationFlag[] {
  const tenantThreshold = options.tenantThreshold ?? 0.25;
  const yearThreshold = options.yearThreshold ?? 0.3;
  const holdYears = options.holdYears ?? 5;
  const nra = options.nra ?? schedule.nra;
  const flags: ConcentrationFlag[] = [];

  const totalRent = leases.reduce((s, l) => s + (l.baseRentAnnual ?? 0), 0);
  const bySf = new Map<string, number>();
  const byRent = new Map<string, number>();
  for (const l of leases) {
    if (l.vacant || !l.tenant) continue;
    bySf.set(l.tenant, (bySf.get(l.tenant) ?? 0) + (l.sf ?? 0));
    byRent.set(l.tenant, (byRent.get(l.tenant) ?? 0) + (l.baseRentAnnual ?? 0));
  }

  if (nra && nra > 0) {
    for (const [tenant, sf] of bySf) {
      const share = sf / nra;
      if (share > tenantThreshold) {
        flags.push({
          code: "tenant_nra",
          severity: share > 0.5 ? "critical" : "warning",
          message: `${tenant} occupies ${(share * 100).toFixed(0)}% of NRA. This deal turns on one renewal decision.`,
          value: share,
        });
      }
    }
  }

  if (totalRent > 0) {
    for (const [tenant, rent] of byRent) {
      const share = rent / totalRent;
      if (share > tenantThreshold) {
        flags.push({
          code: "tenant_income",
          severity: share > 0.5 ? "critical" : "warning",
          message: `${tenant} pays ${(share * 100).toFixed(0)}% of in-place income.`,
          value: share,
        });
      }
    }
  }

  if (nra && nra > 0) {
    for (const y of schedule.years) {
      const share = y.sfExpiring / nra;
      if (share > yearThreshold) {
        flags.push({
          code: "rollover_year",
          severity: share > 0.5 ? "critical" : "warning",
          message: `${(share * 100).toFixed(0)}% of NRA rolls in ${y.year} — ${y.leaseCount} lease${
            y.leaseCount === 1 ? "" : "s"
          }, ${Math.round(y.sfExpiring).toLocaleString("en-US")} SF.`,
          value: share,
        });
      }
    }
  }

  if (walt.bySf != null && walt.bySf < holdYears) {
    flags.push({
      code: "walt_under_hold",
      severity: walt.bySf < holdYears / 2 ? "critical" : "warning",
      message: `WALT of ${walt.bySf.toFixed(1)} years is shorter than the ${holdYears}-year hold — the tenants that pay for this deal roll inside it.`,
      value: walt.bySf,
    });
  }

  // De-duplicate the per-tenant flags to the worst one of each code, so a
  // 40-tenant roll doesn't produce a wall.
  const worstByCode = new Map<string, ConcentrationFlag>();
  const out: ConcentrationFlag[] = [];
  for (const f of flags) {
    if (f.code === "tenant_nra" || f.code === "tenant_income") {
      const cur = worstByCode.get(f.code);
      if (!cur || f.value > cur.value) worstByCode.set(f.code, f);
    } else {
      out.push(f);
    }
  }
  return [...worstByCode.values(), ...out];
}

// ---------------------------------------------------------------------------
// One roll-up
// ---------------------------------------------------------------------------

export interface RentRollAnalytics {
  leaseCount: number;
  occupiedCount: number;
  vacantCount: number;
  totalSf: number;
  occupiedSf: number;
  vacantSf: number;
  occupancyPct: number | null;
  inPlaceRentAnnual: number;
  weightedInPlacePsf: number | null;
  walt: Walt;
  rollover: RolloverSchedule;
  flags: ConcentrationFlag[];
  asOf: string;
}

export function analyzeRentRoll(
  leases: Lease[],
  options: { asOf: string; nra?: number | null; holdYears?: number },
): RentRollAnalytics {
  const totalSf = leases.reduce((s, l) => s + (l.sf ?? 0), 0);
  const vacantSf = leases.filter((l) => l.vacant).reduce((s, l) => s + (l.sf ?? 0), 0);
  const occupiedSf = totalSf - vacantSf;
  const inPlaceRentAnnual = leases.reduce((s, l) => s + (l.baseRentAnnual ?? 0), 0);
  const nra = options.nra ?? (totalSf > 0 ? totalSf : null);

  const walt = computeWalt(leases, options.asOf);
  const rollover = rolloverSchedule(leases, { nra });
  const flags = concentrationFlags(leases, rollover, walt, {
    nra,
    holdYears: options.holdYears,
  });

  return {
    leaseCount: leases.length,
    occupiedCount: leases.filter((l) => !l.vacant).length,
    vacantCount: leases.filter((l) => l.vacant).length,
    totalSf,
    occupiedSf,
    vacantSf,
    occupancyPct: nra && nra > 0 ? occupiedSf / nra : null,
    inPlaceRentAnnual,
    weightedInPlacePsf: occupiedSf > 0 ? inPlaceRentAnnual / occupiedSf : null,
    walt,
    rollover,
    flags,
    asOf: options.asOf,
  };
}
