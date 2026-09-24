/**
 * The self-storage rate increase, and the runway it spends.
 *
 * The last asset class `/tools` did not speak to, and the one whose central
 * lever exists nowhere else. Storage leases month to month, so the operator
 * can reprice a sitting tenant whenever it likes — the EXISTING CUSTOMER
 * RATE INCREASE, eight to fifteen percent, once or twice a year, on tenants
 * who have been in place long enough to have moved their things in and
 * stopped shopping. No other asset class can do it and every storage
 * underwriting assumes it.
 *
 * Four rules.
 *
 * Rule 1. THE ECRI IS A TRADE, AND THE TRADE HAS A CLOSED FORM. Raise the
 * rate and some share of those raised move out; the unit then sits empty for
 * a while and re-rents at the STREET rate, which on a mature facility is
 * well below what the leaver was paying. Setting revenue after against
 * revenue before and solving for the move-out rate:
 *
 *     m* = e / (1 + e − k),   k = (street / inPlace) × (12 − downtime) / 12
 *
 * On the seed a 10% increase breaks even at a **25.8%** move-out, against
 * the three to eight percent an operator actually sees. Which is why the
 * industry does it relentlessly, and why the figure worth printing is not
 * whether it pays but how much room is left.
 *
 * Rule 2. THE ECRI EATS ITS OWN RUNWAY. Every increase widens the gap
 * between what sitting tenants pay and what the unit would re-rent for, and
 * that gap is the whole denominator of the trade — so each increase lowers
 * the break-even for the next one. `schedule` runs the years and
 * `breakEvenDecayPts` measures it; the street rate's own growth pushes back,
 * so how fast the runway closes is a race between the two and is COMPUTED
 * rather than asserted.
 *
 * Rule 3. THE STREET RATE AND THE IN-PLACE AVERAGE ARE TWO DIFFERENT
 * NUMBERS, and which one is underwritten decides the deal. A facility
 * leasing up earns street rates; a stabilized one earns years of accumulated
 * increases. `revenueAtStreet` is the case nobody models — every tenant
 * churned to today's asking rate — and on a facility about to face a new
 * competitor down the road it is not a stress test but a forecast.
 *
 * Rule 4. A FREE MONTH IS NOT A FIXED DISCOUNT. "First month free" costs one
 * month out of the tenancy's whole length, and that length is a fact about
 * the market rather than about the offer — 9.1% where tenants stay eleven
 * months, 12.1% where they leave a quarter sooner, 4.2% where they stay two
 * years. The same promotion is a third dearer in one market than another
 * and the rate sheet reads identically.
 *
 * Pure, no I/O. Rents are monthly per unit; rates are percentages.
 */

import { withArticle } from "@/lib/article";

/** Months in the year the downtime and the tenancy are measured against. */
const MONTHS = 12;

/**
 * How much shorter the comparison tenancy is, in % — rule 4. Proportional
 * rather than a fixed number of months, so the same offer is compared
 * like-for-like whether tenants stay nine months or three years.
 */
export const SHORTER_STAY_PCT = 25;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function nonNegative(n: number | null | undefined): n is number {
  return real(n) && n >= 0;
}

export interface StorageTerms {
  /** units let today */
  occupiedUnits: number | null;
  /** what a sitting tenant pays on average, monthly */
  inPlaceRent: number | null;
  /** what the same unit is advertised at today, monthly — rule 3 */
  streetRent: number | null;
  /** the increase, in % */
  ecriPct: number | null;
  /** the share of tenants tenured enough to be raised, in % */
  ecriReachPct?: number | null;
  /** the share of those raised who leave, in % */
  moveOutPct?: number | null;
  /** months a vacated unit sits before it re-rents */
  downtimeMonths?: number | null;
  /** how long a tenant stays, in months — rule 4 */
  averageStayMonths?: number | null;
  /** months given away on a new let — rule 4 */
  freeMonths?: number | null;
  /** how much of a revenue gain reaches NOI, in % (storage opex is mostly fixed) */
  flowThroughPct?: number | null;
  /** the cap rate the gain is valued at */
  capRatePct?: number | null;
  /** the street rate's own growth, in % a year — rule 2 */
  streetGrowthPct?: number | null;
  /** years the runway is run over — rule 2 */
  yearsAhead?: number | null;
  /** units let, as a % — for the occupancy gap */
  unitOccupancyPct?: number | null;
  /** area let, as a % — small units fill first, so this runs lower */
  sfOccupancyPct?: number | null;
}

/** One year of successive increases — rule 2. */
export interface EcriYear {
  year: number;
  /** the blended in-place rent going into the year */
  inPlaceRent: number;
  /** the street rate it is measured against */
  streetRent: number;
  /** how far the in-place rent stands above the street, in % */
  rateGapPct: number;
  /** the move-out rate at which this year's increase breaks even, or null
   * where no achievable one does */
  breakEvenMoveOutPct: number | null;
}

export interface StorageRead {
  /** rule 1 */
  revenueBefore: number | null;
  revenueAfter: number | null;
  revenueGain: number | null;
  revenueGainPct: number | null;
  breakEvenMoveOutPct: number | null;
  headroomPts: number | null;
  /** what the increase is worth */
  noiGain: number | null;
  valueOfIncrease: number | null;
  /** rule 2 */
  schedule: EcriYear[];
  breakEvenDecayPts: number | null;
  /** rule 3 */
  rateGapPct: number | null;
  revenueAtStreet: number | null;
  streetDownside: number | null;
  /** rule 4 */
  concessionCostPct: number | null;
  concessionCostIfShortStayPct: number | null;
  /** the two occupancies an OM quotes */
  occupancyGapPts: number | null;
  note: string | null;
}

const EMPTY: StorageRead = {
  revenueBefore: null,
  revenueAfter: null,
  revenueGain: null,
  revenueGainPct: null,
  breakEvenMoveOutPct: null,
  headroomPts: null,
  noiGain: null,
  valueOfIncrease: null,
  schedule: [],
  breakEvenDecayPts: null,
  rateGapPct: null,
  revenueAtStreet: null,
  streetDownside: null,
  concessionCostPct: null,
  concessionCostIfShortStayPct: null,
  occupancyGapPts: null,
  note: null,
};

/**
 * The move-out rate at which an increase exactly pays for itself — rule 1.
 *
 * Derived rather than searched: revenue after equals revenue before gives
 * `(1−m)(1+e) + mk = 1`, hence `m = e / (1+e−k)`. The reach cancels out of
 * it entirely, which is worth knowing — raising half the book and raising
 * all of it break even at the same move-out rate, because both sides of the
 * trade scale with the reach.
 */
export function breakEvenMoveOut(
  ecriPct: number,
  inPlaceRent: number,
  streetRent: number,
  downtimeMonths: number,
): number | null {
  if (inPlaceRent <= 0) return null;
  const e = ecriPct / 100;
  const k = (streetRent / inPlaceRent) * ((MONTHS - downtimeMonths) / MONTHS);
  const denom = 1 + e - k;
  // Where the street rate plus a year of it already beats the raised
  // in-place rent, losing a tenant is a GAIN and no move-out rate breaks
  // even — the answer is that there is nothing to trade off, not a number.
  if (denom <= 0) return null;
  const m = (e / denom) * 100;
  // And a break-even ABOVE 100% is the same finding wearing a number: no
  // achievable response can undo the increase, since a facility cannot
  // lose more tenants than it has. The probe printed 736.4% before this
  // guard, which reads as a figure and is not one.
  return m > 100 ? null : m;
}

/** One year's revenue on a given in-place rent, street rate and response. */
function yearRevenue(
  units: number,
  inPlace: number,
  street: number,
  ecri: number,
  reach: number,
  moveOut: number,
  downtime: number,
): { revenue: number; blendedRent: number } {
  const raised = units * reach;
  const stayers = raised * (1 - moveOut);
  const leavers = raised * moveOut;
  const untouched = units - raised;

  const stayerRent = inPlace * (1 + ecri);
  const monthsLet = Math.max(0, MONTHS - downtime);
  const revenue =
    stayers * stayerRent * MONTHS + untouched * inPlace * MONTHS + leavers * street * monthsLet;

  // The rent the book carries INTO the next year — a leaver's unit is now
  // let at the street rate, which is what drags the blend back down and
  // makes the runway a race rather than a ratchet.
  const blendedRent =
    units <= 0 ? inPlace : (stayers * stayerRent + untouched * inPlace + leavers * street) / units;
  return { revenue, blendedRent };
}

export function readStorage(t: StorageTerms): StorageRead {
  if (!positive(t.occupiedUnits)) {
    return { ...EMPTY, note: "Enter how many units are let." };
  }
  if (!positive(t.inPlaceRent)) {
    return { ...EMPTY, note: "Enter what a sitting tenant pays on average." };
  }
  if (!positive(t.streetRent)) {
    return { ...EMPTY, note: "Enter today's street rate for the same unit." };
  }
  if (!positive(t.ecriPct)) {
    return { ...EMPTY, note: "Enter the increase you would put through." };
  }

  const units = t.occupiedUnits;
  const e = t.ecriPct / 100;
  const reach =
    positive(t.ecriReachPct) && t.ecriReachPct <= 100 ? t.ecriReachPct / 100 : 1;
  const moveOut =
    nonNegative(t.moveOutPct) && t.moveOutPct <= 100 ? t.moveOutPct / 100 : 0;
  const downtime = nonNegative(t.downtimeMonths) ? Math.min(MONTHS, t.downtimeMonths) : 0;

  const before = units * t.inPlaceRent * MONTHS;
  const { revenue: after } = yearRevenue(
    units,
    t.inPlaceRent,
    t.streetRent,
    e,
    reach,
    moveOut,
    downtime,
  );
  const gain = after - before;

  const breakEven = breakEvenMoveOut(t.ecriPct, t.inPlaceRent, t.streetRent, downtime);

  // Rule 2. The runway, year by year. Each year's increase is put through
  // and the book's blended rent carried forward, against a street rate
  // growing on its own.
  const growth = nonNegative(t.streetGrowthPct) ? t.streetGrowthPct / 100 : 0;
  const years = positive(t.yearsAhead) ? Math.min(20, Math.round(t.yearsAhead)) : 5;
  const schedule: EcriYear[] = [];
  let rent = t.inPlaceRent;
  let street = t.streetRent;
  for (let y = 1; y <= years; y += 1) {
    const be = breakEvenMoveOut(t.ecriPct, rent, street, downtime);
    schedule.push({
      year: y,
      inPlaceRent: r2(rent),
      streetRent: r2(street),
      rateGapPct: street > 0 ? r1(((rent - street) / street) * 100) : 0,
      breakEvenMoveOutPct: be === null ? null : r1(be),
    });
    const next = yearRevenue(units, rent, street, e, reach, moveOut, downtime);
    rent = next.blendedRent;
    street = street * (1 + growth);
  }
  // The decay is only a figure where both ends of the run have one.
  const first = schedule[0]?.breakEvenMoveOutPct ?? null;
  const last = schedule[schedule.length - 1]?.breakEvenMoveOutPct ?? null;
  const decay = schedule.length > 1 && first !== null && last !== null ? r1(first - last) : null;

  // Rule 3. What the facility earns if every tenant churned to today's ask.
  const atStreet = units * t.streetRent * MONTHS;

  // Rule 4. A free month costs one month out of the whole tenancy.
  const stay = positive(t.averageStayMonths) ? t.averageStayMonths : null;
  const free = nonNegative(t.freeMonths) ? t.freeMonths : 0;
  // Capped at 100: a tenant who is given more free months than they stay
  // simply never pays, and the cost of that is all of the rent — not the
  // 218% the arithmetic gives. Three months free in a two-month market is a
  // real offer, not only a data-entry error, so this clamps rather than
  // refusing.
  const concession = stay === null || stay <= 0 ? null : Math.min(100, (free / stay) * 100);
  // The same offer at a nine-month tenancy — the market fact that makes it
  // a different price with an identical rate sheet.
  const shortStay = stay === null ? null : Math.max(1, stay * (1 - SHORTER_STAY_PCT / 100));
  const concessionShort =
    shortStay === null ? null : Math.min(100, (free / shortStay) * 100);

  const flow =
    nonNegative(t.flowThroughPct) && t.flowThroughPct <= 100 ? t.flowThroughPct / 100 : 1;
  const cap = positive(t.capRatePct) ? t.capRatePct / 100 : null;
  const noiGain = gain * flow;

  const x: StorageRead = {
    revenueBefore: r0(before),
    revenueAfter: r0(after),
    revenueGain: r0(gain),
    revenueGainPct: before > 0 ? r1((gain / before) * 100) : null,
    breakEvenMoveOutPct: breakEven === null ? null : r1(breakEven),
    headroomPts:
      breakEven === null ? null : r1(breakEven - (nonNegative(t.moveOutPct) ? t.moveOutPct : 0)),
    noiGain: r0(noiGain),
    valueOfIncrease: cap === null ? null : r0(noiGain / cap),
    schedule,
    breakEvenDecayPts: decay,
    rateGapPct: r1(((t.inPlaceRent - t.streetRent) / t.streetRent) * 100),
    revenueAtStreet: r0(atStreet),
    streetDownside: r0(atStreet - before),
    concessionCostPct: concession === null ? null : r1(concession),
    concessionCostIfShortStayPct: concessionShort === null ? null : r1(concessionShort),
    occupancyGapPts:
      positive(t.unitOccupancyPct) && positive(t.sfOccupancyPct)
        ? r1(t.unitOccupancyPct - t.sfOccupancyPct)
        : null,
    note: null,
  };
  return { ...x, note: noteFor(x, t) };
}

/**
 * The one sentence. It leads with the headroom, because the question on a
 * storage deal is never whether the increase pays — it is how much room is
 * left before it stops.
 */
function noteFor(x: StorageRead, t: StorageTerms): string {
  if (x.breakEvenMoveOutPct !== null && x.headroomPts !== null && x.headroomPts > 0) {
    const end = x.schedule[x.schedule.length - 1]?.breakEvenMoveOutPct ?? null;
    const decay =
      x.breakEvenDecayPts !== null && x.breakEvenDecayPts > 0 && end !== null
        ? ` Put the same increase through every year and that break-even falls to ${end}% by year ${x.schedule.length} — each increase widens the gap the next one is traded against.`
        : "";
    return `${withArticle(`${t.ecriPct}%`, true)} increase breaks even at ${withArticle(`${x.breakEvenMoveOutPct}%`)} move-out, against the ${nonNegative(t.moveOutPct) ? t.moveOutPct : 0}% assumed — ${x.headroomPts} points of room.${decay}`;
  }
  if (x.breakEvenMoveOutPct === null) {
    return `The street rate is high enough against the in-place rent that a leaver's unit re-lets for more than the raised tenant was paying, so there is no trade to make — every move-out is a gain.`;
  }
  if (x.headroomPts !== null && x.headroomPts <= 0) {
    return `The move-out assumed is at or past the ${x.breakEvenMoveOutPct}% this increase breaks even at, so it costs revenue rather than earning it — ${usd(Math.abs(x.revenueGain ?? 0))} a year.`;
  }
  return "Enter the street rate and the increase to see how much room is left.";
}

function usd(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

function rnd(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

const r0 = (n: number) => rnd(n, 0);
const r1 = (n: number) => rnd(n, 1);
const r2 = (n: number) => rnd(n, 2);
