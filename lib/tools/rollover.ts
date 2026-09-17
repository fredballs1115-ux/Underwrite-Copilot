// A rent roll's rollover schedule, and the cliff inside the average — PURE.
//
// Every office, industrial and retail memorandum prints a weighted average
// lease term and calls it WALT. It is the single figure a screening decision
// turns on, because it says how long the income stands up without being
// re-leased — and it is quoted four different ways that give four different
// answers about the same building.
//
// Four rules.
//
// 1. WEIGHT BY RENT, NOT BY AREA. They are different numbers, and the
//    memorandum quotes whichever is longer — usually the area-weighted one,
//    because the long leases in a building are the cheap ones. The seeded
//    roll runs 7.0 years by area and 5.1 by rent, on the strength of one
//    60,000-foot distribution tenant twelve years out at $8.50. It is the
//    INCOME that rolls, so it is the income that has to be weighted.
//
// 2. A BREAK OPTION IS AN EXPIRY. A ten-year lease with a tenant option to
//    leave in year three is a three-year lease that might run ten. The
//    landlord cannot make the tenant stay and the lender will not assume it,
//    so the memorandum's "term to expiry" and the term anyone underwrites are
//    different figures. `waltToBreak` is the one to bid on.
//
// 3. AN AVERAGE HIDES A CLIFF. Two buildings with the same six-year WALT are
//    not the same building: one rolls a sixth of itself a year, the other
//    rolls 55% in a single year. The mean cannot see the difference and the
//    schedule can, which is why this module reports a YEAR-BY-YEAR table and
//    names the worst one.
//
// 4. THE CLIFF'S COST IS CAPITAL AND DOWNTIME, NOT RENT. The year the income
//    rolls is the year the tenant improvement allowance and the commission
//    fall due, in one cheque, and neither is in the NOI. On the seeded roll
//    year 4 owes $1,530,000 of leasing capital against $1,292,000 of rent
//    rolling — the cheque is LARGER than the income at risk, and the cash
//    flow does not fund it. `below-the-line` prices the same cost as a run
//    rate over an average year; this prices it in the year it lands.
//
// The rent roll is also not the building: it lists LEASED space, so summing
// it and calling that the size reports 100% occupancy for every property
// ever screened. Enter the building's own square footage and the vacancy is
// the difference.
//
// Pure, no I/O.

import { readFigure } from "@/lib/money";
import { cellsOf } from "@/lib/tools/unit-mix";

/** A rollover schedule past fifteen years is not a screening question. */
export const MAX_YEARS = 15;
const DEFAULT_HOLD = 5;

const real = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
const positive = (n: number | null | undefined): n is number => real(n) && n > 0;
const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** One lease, as read off the roll. */
export interface LeaseRow {
  tenant: string;
  sf: number;
  /** annual rent per square foot — null when the roll states none */
  rentPerSf: number | null;
  /** years from today until the lease expires; 0 or less is holdover */
  expiryYears: number;
  /** years until a tenant option to leave, when the roll states one */
  breakYears: number | null;
}

export interface RollRead {
  rows: LeaseRow[];
  /** lines that could not be read as a lease, verbatim */
  skipped: string[];
  /** the expiry column held calendar years (2029) rather than years remaining */
  expiryWasCalendar: boolean;
  /** the rent column held total annual rent rather than rent per foot */
  rentWasTotal: boolean;
}

/**
 * Reads a pasted rent roll.
 *
 * The shape is a tenant name then numbers, POSITIONALLY:
 *
 *     tenant, square feet, rent per SF, years to expiry [, years to break]
 *
 * Two numbers is (SF, expiry) — a roll that states no rent, which contributes
 * to the area-weighted term and not to the rent-weighted one. Three is
 * (SF, rent, expiry). Four adds the break.
 *
 * Columns split on the same precedence `unit-mix` uses — tab, pipe, runs of
 * spaces, then comma — because a comma is both a separator and a thousands
 * mark and accepting both at once turns 12,000 square feet into 12.
 *
 * Two columns are read as a property of the TABLE rather than of a row, for
 * the reason `unit-mix` decides its three-number shape once: a column is a
 * column, and a single odd row must not flip its neighbours.
 */
export function readRoll(text: string, asOfYear: number): RollRead {
  const read: { tenant: string; nums: number[] }[] = [];
  const skipped: string[] = [];

  for (const line of text.split(/[\n\r]+/)) {
    const raw = line.trim();
    if (!raw) continue;

    const cells = cellsOf(raw);
    if (cells.length < 3) {
      skipped.push(raw);
      continue;
    }

    const tenant = cells[0];
    // A row opening with a figure has no tenant name. Read it anyway — a
    // roll pasted without its first column is still a roll.
    const numeric = readFigure(tenant) !== null;
    const body = numeric ? cells : cells.slice(1);
    const nums = body.map(cellFigure).filter((n): n is number => n !== null);

    if (nums.length < 2 || !positive(nums[0])) {
      skipped.push(raw);
      continue;
    }
    read.push({ tenant: numeric ? `${round(nums[0]).toLocaleString("en-US")} SF` : tenant, nums });
  }

  const rentWasTotal = rentColumnIsTotal(read.map((r) => r.nums));
  const expiryWasCalendar = expiryColumnIsCalendar(read.map((r) => r.nums));

  const rows = read.map(({ tenant, nums }) => {
    const sf = nums[0];
    const hasRent = nums.length >= 3;
    const rentRaw = hasRent ? nums[1] : null;
    const expiryRaw = hasRent ? nums[2] : nums[1];
    const breakRaw = nums.length >= 4 ? nums[3] : null;
    const toYears = (v: number | null): number | null =>
      v === null ? null : expiryWasCalendar ? v - asOfYear : v;

    return {
      tenant,
      sf,
      rentPerSf:
        rentRaw === null || !positive(rentRaw)
          ? null
          : rentWasTotal
            ? Math.round((rentRaw / sf) * 100) / 100
            : rentRaw,
      expiryYears: toYears(expiryRaw) ?? 0,
      breakYears: toYears(breakRaw),
    };
  });

  return { rows, skipped, expiryWasCalendar, rentWasTotal };
}

/**
 * One cell's figure, taking the year out of a date.
 *
 * A roll pasted out of a spreadsheet carries "12/31/2029" where an analyst
 * typing it carries "2029" or "3.5". `readFigure` is strict about the whole
 * string by design, so a date would be dropped and the lease with it — which
 * is worse than reading it to the year, because a dropped lease silently
 * shortens every figure this module reports.
 */
function cellFigure(cell: string): number | null {
  const direct = readFigure(cell);
  if (direct !== null) return direct;
  if (/[/-]/.test(cell)) {
    const year = cell.match(/\b((?:19|20)\d{2})\b/);
    if (year) return Number(year[1]);
  }
  return null;
}

/**
 * Is the rent column a TOTAL annual rent rather than a rent per foot?
 *
 * Both are printed on rent rolls and the error is silent and enormous: read
 * $336,000 of annual rent as a per-foot rent on 12,000 square feet and the
 * building's income comes back four billion dollars.
 *
 * The signal is unambiguous. A per-foot rent divided by the square footage
 * is a small fraction; a total rent divided by it is the per-foot rent
 * itself. A ratio at or above 1 would mean a lease of under one square foot.
 */
function rentColumnIsTotal(all: number[][]): boolean {
  const ratios = all
    .filter((n) => n.length >= 3 && positive(n[0]) && positive(n[1]))
    .map((n) => n[1] / n[0])
    .sort((a, b) => a - b);
  if (ratios.length === 0) return false;
  return ratios[Math.floor(ratios.length / 2)] >= 1;
}

/** Is the expiry column calendar years (2029) or years remaining (3.5)? */
function expiryColumnIsCalendar(all: number[][]): boolean {
  const vals = all
    .map((n) => (n.length >= 3 ? n[2] : n[1]))
    .filter((v): v is number => real(v))
    .sort((a, b) => a - b);
  if (vals.length === 0) return false;
  return vals[Math.floor(vals.length / 2)] >= 1900;
}

// ---------------------------------------------------------------------------

export interface RollYear {
  /** 1 is the next twelve months */
  year: number;
  sfExpiring: number;
  /** annual rent rolling off in this year */
  rentExpiring: number;
  /** that rent as a share of the roll's total, 0–100 */
  sharePct: number;
  /** everything rolled off by the end of this year, 0–100 */
  cumulativePct: number;
  /** the TI and commission falling due — rule 4 */
  capital: number;
  /** rent lost while the space sits empty, on the share that leaves */
  downtime: number;
}

export interface RollResult {
  leaseCount: number;
  /** square feet on the roll — LEASED space, never the building */
  leasedSf: number;
  /** annual rent across the leases that state one */
  totalRent: number;
  /** leases that state a rent, which is what the rent-weighted figures cover */
  rentedLeases: number;
  occupancyPct: number | null;
  vacantSf: number | null;
  /** rule 1 — the longer of the two, and the one usually quoted */
  waltByArea: number | null;
  waltByRent: number | null;
  /** rule 2 — the rent-weighted term, run to the break */
  waltToBreak: number | null;
  /** how many years of the quoted term the break options give away */
  breakGivesUpYears: number | null;
  years: RollYear[];
  /** rule 3 — the single worst year in the schedule */
  worstYear: RollYear | null;
  /** …against an even roll over the same span, for scale */
  evenYearSharePct: number | null;
  /** share of rent rolling before the sale */
  rollWithinHoldPct: number | null;
  /** share of rent still standing at the end of the hold */
  topTenant: string | null;
  topTenantPct: number | null;
  /** rule 4 — capital over the hold, and in the worst single year */
  capitalOverHold: number | null;
  capitalWorstYear: number | null;
  downtimeOverHold: number | null;
  note: string;
}

const EMPTY: RollResult = {
  leaseCount: 0,
  leasedSf: 0,
  totalRent: 0,
  rentedLeases: 0,
  occupancyPct: null,
  vacantSf: null,
  waltByArea: null,
  waltByRent: null,
  waltToBreak: null,
  breakGivesUpYears: null,
  years: [],
  worstYear: null,
  evenYearSharePct: null,
  rollWithinHoldPct: null,
  topTenant: null,
  topTenantPct: null,
  capitalOverHold: null,
  capitalWorstYear: null,
  downtimeOverHold: null,
  note: "Paste the rent roll — tenant, square feet, rent per SF, years to expiry.",
};

export interface RollInput {
  rows: LeaseRow[];
  /** the building's own size, so the vacancy is the difference */
  buildingSf?: number | null;
  /** the buyer's horizon; the schedule runs at least this far */
  holdYears?: number | null;
  /** blended TI and commission per square foot of space re-leased */
  capitalPerSf?: number | null;
  /** months the space sits empty between tenants */
  downtimeMonths?: number | null;
  /** how often a rolling tenant stays — downtime falls on the rest */
  renewalProbabilityPct?: number | null;
}

/**
 * Reads the roll into the schedule.
 *
 * A lease expiring at 3.5 years rolls in YEAR 4 — the year during which the
 * expiry falls — and a lease already expired rolls in year 1, because a
 * tenant in holdover is a tenant who can leave. Anything past the schedule's
 * last year is counted in the totals and not in the table.
 */
export function readRollover(t: RollInput): RollResult {
  const rows = t.rows.filter((r) => positive(r.sf));
  if (rows.length === 0) return EMPTY;

  const hold = positive(t.holdYears) ? Math.min(Math.round(t.holdYears), MAX_YEARS) : DEFAULT_HOLD;
  const leasedSf = rows.reduce((a, r) => a + r.sf, 0);
  const rentOf = (r: LeaseRow) => (positive(r.rentPerSf) ? r.sf * r.rentPerSf : 0);
  const withRent = rows.filter((r) => positive(r.rentPerSf));
  const totalRent = round(withRent.reduce((a, r) => a + rentOf(r), 0));

  // Rule 2: the term anyone underwrites runs to whichever comes first.
  const termOf = (r: LeaseRow) =>
    Math.max(0, positive(r.breakYears) ? Math.min(r.expiryYears, r.breakYears) : r.expiryYears);

  // Rule 1: the same average, weighted two ways. Area covers every lease;
  // rent covers only the leases that state one, which the note says.
  const waltByArea = leasedSf > 0
    ? round1(rows.reduce((a, r) => a + r.sf * Math.max(0, r.expiryYears), 0) / leasedSf)
    : null;
  const rentDenom = withRent.reduce((a, r) => a + rentOf(r), 0);
  const waltByRent =
    rentDenom > 0
      ? round1(withRent.reduce((a, r) => a + rentOf(r) * Math.max(0, r.expiryYears), 0) / rentDenom)
      : null;
  const waltToBreak =
    rentDenom > 0
      ? round1(withRent.reduce((a, r) => a + rentOf(r) * termOf(r), 0) / rentDenom)
      : null;
  const breakGivesUpYears =
    waltByRent !== null && waltToBreak !== null ? round1(waltByRent - waltToBreak) : null;

  // The schedule buckets by the break, because that is when the space is at
  // risk — the figure the year-by-year table exists to show.
  const capPerSf = positive(t.capitalPerSf) ? t.capitalPerSf : 0;
  const downMonths = positive(t.downtimeMonths) ? t.downtimeMonths : 0;
  const renew = real(t.renewalProbabilityPct)
    ? Math.max(0, Math.min(100, t.renewalProbabilityPct)) / 100
    : 0.5;

  const buckets = new Map<number, { sf: number; rent: number }>();
  let beyondRent = 0;
  for (const r of rows) {
    const bucket = Math.max(1, Math.ceil(termOf(r) || 1));
    if (bucket > hold) {
      beyondRent += rentOf(r);
      continue;
    }
    const cur = buckets.get(bucket) ?? { sf: 0, rent: 0 };
    cur.sf += r.sf;
    cur.rent += rentOf(r);
    buckets.set(bucket, cur);
  }

  const years: RollYear[] = [];
  let cumulative = 0;
  for (let y = 1; y <= hold; y++) {
    const b = buckets.get(y) ?? { sf: 0, rent: 0 };
    cumulative += b.rent;
    years.push({
      year: y,
      sfExpiring: round(b.sf),
      rentExpiring: round(b.rent),
      sharePct: totalRent > 0 ? round1((b.rent / totalRent) * 100) : 0,
      cumulativePct: totalRent > 0 ? round1((cumulative / totalRent) * 100) : 0,
      // Rule 4. The capital lands in the year the space rolls, whole.
      capital: round(b.sf * capPerSf),
      downtime: round(b.rent * (downMonths / 12) * (1 - renew)),
    });
  }

  // The worst year is the one where the most INCOME rolls — except on a roll
  // that states no rents at all, where every year would tie at zero and the
  // first one would be reported as the cliff. There, area is all there is.
  const byRent = totalRent > 0;
  const worstYear = years.reduce<RollYear | null>((best, y) => {
    if (best === null) return y;
    return (byRent ? y.rentExpiring > best.rentExpiring : y.sfExpiring > best.sfExpiring)
      ? y
      : best;
  }, null);
  const rollWithinHoldPct =
    totalRent > 0 ? round1(((totalRent - beyondRent) / totalRent) * 100) : null;

  // Rule 3's scale: what one year would carry if the same roll were even
  // over the term it actually spans.
  const span = Math.max(1, Math.ceil(Math.max(...rows.map(termOf), 1)));
  const evenYearSharePct = round1(100 / Math.min(span, MAX_YEARS));

  const biggest = withRent.length
    ? withRent.reduce((best, r) => (rentOf(r) > rentOf(best) ? r : best))
    : null;

  const buildingSf = positive(t.buildingSf) ? t.buildingSf : null;
  const occupancyPct =
    buildingSf !== null ? round1(Math.min(100, (leasedSf / buildingSf) * 100)) : null;

  const capitalOverHold = capPerSf > 0 ? years.reduce((a, y) => a + y.capital, 0) : null;
  const downtimeOverHold = downMonths > 0 ? years.reduce((a, y) => a + y.downtime, 0) : null;

  return {
    leaseCount: rows.length,
    leasedSf: round(leasedSf),
    totalRent,
    rentedLeases: withRent.length,
    occupancyPct,
    vacantSf: buildingSf !== null ? round(Math.max(0, buildingSf - leasedSf)) : null,
    waltByArea,
    waltByRent,
    waltToBreak,
    breakGivesUpYears,
    years,
    worstYear,
    evenYearSharePct,
    rollWithinHoldPct,
    topTenant: biggest ? biggest.tenant : null,
    topTenantPct:
      biggest && totalRent > 0 ? round1((rentOf(biggest) / totalRent) * 100) : null,
    capitalOverHold,
    capitalWorstYear: capPerSf > 0 && worstYear ? worstYear.capital : null,
    downtimeOverHold,
    note: noteFor({
      rows,
      withRent: withRent.length,
      waltByArea,
      waltByRent,
      waltToBreak,
      breakGivesUpYears,
      worstYear,
      evenYearSharePct,
      hold,
      leasedSf,
      buildingSf,
    }),
  };
}

/**
 * The one sentence, naming whichever of the four rules this roll actually
 * trips — the break first, because it is the one the memorandum's own figure
 * is wrong about rather than merely silent on.
 *
 * Ahead of all of them sits the case where the two INPUTS disagree: a roll
 * carrying more square feet than the building has means one of the two
 * figures is wrong, and every figure below it is then suspect. Occupancy
 * clamps at 100% so it does not read as a bug, which is exactly why the
 * disagreement has to be said out loud rather than absorbed.
 */
function noteFor(x: {
  rows: LeaseRow[];
  withRent: number;
  waltByArea: number | null;
  waltByRent: number | null;
  waltToBreak: number | null;
  breakGivesUpYears: number | null;
  worstYear: RollYear | null;
  evenYearSharePct: number | null;
  hold: number;
  leasedSf: number;
  buildingSf: number | null;
}): string {
  if (x.buildingSf !== null && x.leasedSf > x.buildingSf * 1.005) {
    return `The roll carries ${round(x.leasedSf).toLocaleString("en-US")} SF against a building of ${round(x.buildingSf).toLocaleString("en-US")} — one of the two is wrong.`;
  }
  if (x.withRent === 0) {
    return "No rents stated, so the term is area-weighted only — the figure a memorandum quotes.";
  }
  if (x.breakGivesUpYears !== null && x.breakGivesUpYears >= 0.5 && x.waltToBreak !== null) {
    return `Break options give up ${x.breakGivesUpYears} years of the quoted term, leaving ${x.waltToBreak}.`;
  }
  if (
    x.worstYear !== null &&
    x.evenYearSharePct !== null &&
    x.worstYear.sharePct >= x.evenYearSharePct * 1.5
  ) {
    return `Year ${x.worstYear.year} rolls ${x.worstYear.sharePct}% of the income, against ${x.evenYearSharePct}% on an even roll.`;
  }
  if (x.waltByArea !== null && x.waltByRent !== null && x.waltByArea - x.waltByRent >= 0.5) {
    return `Weighted by area the term is ${x.waltByArea} years; weighted by rent, which is what rolls, it is ${x.waltByRent}.`;
  }
  if (x.withRent < x.rows.length) {
    return `${x.withRent} of ${x.rows.length} leases state a rent, so the rent-weighted figures cover those.`;
  }
  return `The roll is even enough that the average describes it — ${x.rows.length} leases over ${x.hold} years.`;
}
