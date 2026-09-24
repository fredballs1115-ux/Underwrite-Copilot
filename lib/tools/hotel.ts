/**
 * What a hotel actually earns.
 *
 * Forty-two cards on `/tools` and not one of them speaks a hotel's language,
 * although the extraction readers have known the word "keys" since #223. A
 * hotel is the one asset class whose lease is one night long, and everything
 * that follows from that makes its arithmetic different rather than merely
 * differently labelled.
 *
 * Four rules.
 *
 * Rule 1. REVPAR IS ONE NUMBER MADE OF TWO LEVERS AND THEY ARE NOT
 * INTERCHANGEABLE. Rate times occupancy is revenue per available room, so a
 * 10% lift in either produces exactly the same RevPAR and exactly the same
 * top line — and a different bottom line, because an occupied room costs
 * money to turn and an empty one does not. "We will grow RevPAR ten percent"
 * says nothing until it says WHICH. The usual conclusion is that rate always
 * wins, and it is wrong in one direction that matters: occupancy brings
 * ancillary spend and rate does not, so a hotel whose other revenue per
 * occupied room EXCEEDS its variable cost per occupied room is better off
 * filling than charging. `leverThatWins` is solved rather than assumed, and
 * `leverCrossingPerRoom` names the point it turns on.
 *
 * Rule 2. THE PENETRATION INDEX SAYS WHETHER YOU ARE THE PROBLEM OR THE
 * MARKET IS, and it only says it once it is taken apart. RevPAR index is the
 * headline the industry runs on, and a single figure below 100 leaves the
 * cause open; the ADR and occupancy indices beside it close it. On the seed
 * the hotel takes 90% of its fair share of revenue while charging 9% MORE
 * than the comp set — the whole shortfall is empty rooms, and a revenue
 * manager reading only the RevPAR index would cut rate, which is precisely
 * the wrong move.
 *
 * Rule 3. THE FF&E RESERVE IS 4% OF REVENUE AND IT IS REAL CASH. Soft goods
 * every six or seven years, a full renovation every ten to twelve, and a
 * franchise agreement that requires both. `below-the-line`'s rule, except
 * that here the reserve is struck against REVENUE rather than against NOI,
 * which makes it several times larger than the equivalent line in any other
 * asset class — and a hotel NOI quoted before it is the single most common
 * overstatement in the sector. Both caps are printed.
 *
 * Rule 4. THE FEE STACK IS THREE FEES ON TWO DIFFERENT BASES. The franchise
 * royalty and the marketing or loyalty contribution are struck on ROOMS
 * revenue; the management fee is struck on TOTAL revenue, ancillary included.
 * Quoting them as one percentage understates the bill on a hotel with
 * meaningful food, beverage or parking income, and they are senior to
 * everything the owner sees.
 *
 * Pure, no I/O. Rates are percentages (`72` means 72%), a blank is null.
 */

import { withArticle } from "@/lib/article";

/** The reserve a franchise agreement typically requires, as a % of revenue. */
export const DEFAULT_FFE_RESERVE_PCT = 4;

/** The lift each lever is tested at, in % of itself — rule 1. */
export const LEVER_LIFT_PCT = 10;

/** Nights in the year a key is available. */
const NIGHTS = 365;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function nonNegative(n: number | null | undefined): n is number {
  return real(n) && n >= 0;
}

export interface HotelTerms {
  /** rooms — a hotel's unit count */
  keys: number | null;
  /** average daily rate */
  adr: number | null;
  /** occupancy, in % */
  occupancyPct: number | null;
  /** the competitive set's rate — rule 2 */
  compAdr?: number | null;
  /** the competitive set's occupancy, in % — rule 2 */
  compOccupancyPct?: number | null;
  /**
   * food, beverage, parking, resort and destination fees, per OCCUPIED
   * room — not a share of rooms revenue, because ancillary spend follows
   * guests rather than rate, and modelling it as a share of rooms revenue
   * is what makes rate look unconditionally better than occupancy.
   */
  otherRevenuePerOccupiedRoom?: number | null;
  /** housekeeping, linen, amenities, commissions — per occupied room */
  variableCostPerOccupiedRoom?: number | null;
  /** payroll, utilities, admin, sales — the costs a night does not move */
  fixedOperatingCost?: number | null;
  /** franchise royalty, % of ROOMS revenue — rule 4 */
  franchiseRoyaltyPct?: number | null;
  /** marketing and loyalty programme, % of ROOMS revenue — rule 4 */
  marketingFeePct?: number | null;
  /** management fee, % of TOTAL revenue — rule 4 */
  managementFeePct?: number | null;
  /** taxes and insurance — below the operating line */
  taxesAndInsurance?: number | null;
  /** the reserve, % of total revenue — rule 3 */
  ffeReservePct?: number | null;
  /** the cap rate the hotel is priced at */
  capRatePct?: number | null;
}

export interface HotelRead {
  /** rule 1 */
  revpar: number | null;
  roomNightsSold: number | null;
  /** rule 2 — the index and the two it is made of */
  compRevpar: number | null;
  revparIndex: number | null;
  adrIndex: number | null;
  occupancyIndex: number | null;
  /** the revenue */
  roomsRevenue: number | null;
  otherRevenue: number | null;
  totalRevenue: number | null;
  /** rule 4 */
  franchiseFee: number | null;
  marketingFee: number | null;
  managementFee: number | null;
  totalFees: number | null;
  feesPctOfRoomsRevenue: number | null;
  feesPctOfTotalRevenue: number | null;
  /** the operating line */
  grossOperatingProfit: number | null;
  gopMarginPct: number | null;
  /** rule 3 — both sides of the reserve */
  noiBeforeReserve: number | null;
  ffeReserve: number | null;
  noi: number | null;
  capBeforeReservePct: number | null;
  capPct: number | null;
  /** what it is worth */
  value: number | null;
  valuePerKey: number | null;
  valueOfReserveOmitted: number | null;
  /** rule 1 — the two levers, same RevPAR, different profit */
  revparAfterLift: number | null;
  noiIfRateRises: number | null;
  noiIfOccupancyRises: number | null;
  leverGap: number | null;
  leverThatWins: "rate" | "occupancy" | "neither" | null;
  /** true when the occupancy lift hit 100% and the two are no longer one test */
  occupancyLiftClamped: boolean | null;
  leverCrossingPerRoom: number | null;
  /** the same gap said as a price, which is where it actually lands */
  leverGapValue: number | null;
  /** what it would take to reach the comp set — rule 2 */
  occupancyForParityPct: number | null;
  note: string | null;
}

const EMPTY: HotelRead = {
  revpar: null,
  roomNightsSold: null,
  compRevpar: null,
  revparIndex: null,
  adrIndex: null,
  occupancyIndex: null,
  roomsRevenue: null,
  otherRevenue: null,
  totalRevenue: null,
  franchiseFee: null,
  marketingFee: null,
  managementFee: null,
  totalFees: null,
  feesPctOfRoomsRevenue: null,
  feesPctOfTotalRevenue: null,
  grossOperatingProfit: null,
  gopMarginPct: null,
  noiBeforeReserve: null,
  ffeReserve: null,
  noi: null,
  capBeforeReservePct: null,
  capPct: null,
  value: null,
  valuePerKey: null,
  valueOfReserveOmitted: null,
  revparAfterLift: null,
  noiIfRateRises: null,
  noiIfOccupancyRises: null,
  leverGap: null,
  leverThatWins: null,
  occupancyLiftClamped: null,
  leverCrossingPerRoom: null,
  leverGapValue: null,
  occupancyForParityPct: null,
  note: null,
};

/** Everything downstream of a rate and an occupancy, run once. */
function runYear(
  t: HotelTerms,
  keys: number,
  adr: number,
  occ: number,
): {
  roomNights: number;
  roomsRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  fees: { franchise: number; marketing: number; management: number; total: number };
  gop: number;
  noiBeforeReserve: number;
  reserve: number;
  noi: number;
} {
  const roomNights = keys * NIGHTS * occ;
  const roomsRevenue = roomNights * adr;
  const otherPer = nonNegative(t.otherRevenuePerOccupiedRoom) ? t.otherRevenuePerOccupiedRoom : 0;
  const otherRevenue = roomNights * otherPer;
  const totalRevenue = roomsRevenue + otherRevenue;

  // Rule 4. Two bases, never one.
  const franchise = roomsRevenue * (pct(t.franchiseRoyaltyPct) / 100);
  const marketing = roomsRevenue * (pct(t.marketingFeePct) / 100);
  const management = totalRevenue * (pct(t.managementFeePct) / 100);
  const totalFee = franchise + marketing + management;

  const variablePer = nonNegative(t.variableCostPerOccupiedRoom)
    ? t.variableCostPerOccupiedRoom
    : 0;
  const variable = roomNights * variablePer;
  const fixed = nonNegative(t.fixedOperatingCost) ? t.fixedOperatingCost : 0;
  const gop = totalRevenue - variable - fixed - totalFee;

  const ti = nonNegative(t.taxesAndInsurance) ? t.taxesAndInsurance : 0;
  const noiBeforeReserve = gop - ti;

  // Rule 3. Struck against REVENUE, which is what makes it big.
  const reservePct = nonNegative(t.ffeReservePct) ? t.ffeReservePct : DEFAULT_FFE_RESERVE_PCT;
  const reserve = totalRevenue * (reservePct / 100);

  return {
    roomNights,
    roomsRevenue,
    otherRevenue,
    totalRevenue,
    fees: { franchise, marketing, management, total: totalFee },
    gop,
    noiBeforeReserve,
    reserve,
    noi: noiBeforeReserve - reserve,
  };
}

function pct(n: number | null | undefined): number {
  return nonNegative(n) ? n : 0;
}

export function readHotel(t: HotelTerms): HotelRead {
  if (!positive(t.keys)) {
    return { ...EMPTY, note: "Enter the key count." };
  }
  if (!positive(t.adr)) {
    return { ...EMPTY, note: "Enter the average daily rate." };
  }
  if (!positive(t.occupancyPct) || t.occupancyPct > 100) {
    return { ...EMPTY, note: "Enter occupancy as a percentage between 0 and 100." };
  }

  const keys = Math.floor(t.keys);
  const occ = t.occupancyPct / 100;
  const base = runYear(t, keys, t.adr, occ);
  const revpar = t.adr * occ;

  // Rule 2. The index, and the two figures that say what is behind it.
  const compAdr = positive(t.compAdr) ? t.compAdr : null;
  const compOcc =
    positive(t.compOccupancyPct) && t.compOccupancyPct <= 100 ? t.compOccupancyPct / 100 : null;
  const compRevpar = compAdr === null || compOcc === null ? null : compAdr * compOcc;
  const revparIndex = compRevpar === null || compRevpar <= 0 ? null : (revpar / compRevpar) * 100;
  const adrIndex = compAdr === null ? null : (t.adr / compAdr) * 100;
  const occupancyIndex = compOcc === null ? null : (occ / compOcc) * 100;

  // Holding today's rate, the occupancy that would reach the comp set's
  // RevPAR — which is the honest statement of the shortfall, since a
  // hotel out-rating its market has no reason to give the rate back.
  const occForParity =
    compRevpar === null ? null : Math.min(100, (compRevpar / t.adr) * 100);

  // Rule 1. The same RevPAR reached two ways.
  const lift = 1 + LEVER_LIFT_PCT / 100;
  const byRate = runYear(t, keys, t.adr * lift, occ);
  // Occupancy cannot pass 100%, whatever the lever asks for — and when it
  // clamps the two paths no longer reach the same RevPAR, which is the
  // whole premise of the comparison. The figures below are still true; the
  // WINNER is not, so it is withheld rather than reported from a test the
  // inputs no longer support.
  const liftedOcc = Math.min(1, occ * lift);
  const clamped = occ * lift > 1;
  const byOccupancy = runYear(t, keys, t.adr, liftedOcc);

  // The point the two levers cross. The obvious answer — ancillary spend
  // per occupied room against the cost of turning one — is WRONG, and the
  // probe caught it: the rooms-revenue terms cancel exactly between the two
  // paths, but the ancillary revenue an occupancy gain brings is itself
  // taxed by the management fee (struck on TOTAL revenue) and by the
  // reserve, while the variable cost is not. So ancillary has to beat the
  // variable cost by the size of that bite, not merely match it:
  //
  //     crossing = variableCost / (1 − managementFee% − reserve%)
  //
  // $32 of housekeeping needs $34.41 of ancillary spend, not $32.
  const variablePer = nonNegative(t.variableCostPerOccupiedRoom)
    ? t.variableCostPerOccupiedRoom
    : 0;
  const reservePct = nonNegative(t.ffeReservePct) ? t.ffeReservePct : DEFAULT_FFE_RESERVE_PCT;
  const kept = 1 - pct(t.managementFeePct) / 100 - reservePct / 100;
  const crossing = kept > 0 ? variablePer / kept : null;
  const gap = byRate.noi - byOccupancy.noi;
  const winner: "rate" | "occupancy" | "neither" | null = clamped
    ? null
    : Math.abs(gap) < 1
      ? "neither"
      : gap > 0
        ? "rate"
        : "occupancy";

  const cap = positive(t.capRatePct) ? t.capRatePct / 100 : null;
  // Everything the card prints below here derives from the ROUNDED pieces,
  // so the reader's own subtraction and division land where the card's do:
  // NOI is the displayed figure less the displayed reserve, and the value
  // is that NOI at the stated cap. Taken off the unrounded chain instead,
  // the three lines missed each other by a dollar apiece.
  const shownBeforeReserve = round(base.noiBeforeReserve);
  const shownReserve = round(base.reserve);
  const shownNoi = shownBeforeReserve - shownReserve;
  const value = cap === null ? null : round(shownNoi / cap);

  const x: HotelRead = {
    revpar: round2(revpar),
    roomNightsSold: round(base.roomNights),
    compRevpar: compRevpar === null ? null : round2(compRevpar),
    revparIndex: revparIndex === null ? null : round1(revparIndex),
    adrIndex: adrIndex === null ? null : round1(adrIndex),
    occupancyIndex: occupancyIndex === null ? null : round1(occupancyIndex),
    roomsRevenue: round(base.roomsRevenue),
    otherRevenue: round(base.otherRevenue),
    totalRevenue: round(base.totalRevenue),
    franchiseFee: round(base.fees.franchise),
    marketingFee: round(base.fees.marketing),
    managementFee: round(base.fees.management),
    // The sum of the three ROUNDED lines, not the rounded sum — a fee
    // stack whose parts do not add to its total reads as broken whatever
    // the arithmetic behind it. The debt schedule's rule, and the engine
    // above stays unrounded so the lever comparison carries no noise.
    totalFees:
      round(base.fees.franchise) + round(base.fees.marketing) + round(base.fees.management),
    feesPctOfRoomsRevenue:
      base.roomsRevenue > 0 ? round1((base.fees.total / base.roomsRevenue) * 100) : null,
    feesPctOfTotalRevenue:
      base.totalRevenue > 0 ? round1((base.fees.total / base.totalRevenue) * 100) : null,
    grossOperatingProfit: round(base.gop),
    gopMarginPct: base.totalRevenue > 0 ? round1((base.gop / base.totalRevenue) * 100) : null,
    noiBeforeReserve: shownBeforeReserve,
    ffeReserve: shownReserve,
    noi: shownNoi,
    capBeforeReservePct:
      value === null || value <= 0 ? null : round2((shownBeforeReserve / value) * 100),
    capPct: value === null || value <= 0 ? null : round2((shownNoi / value) * 100),
    value,
    valuePerKey: value === null ? null : round(value / keys),
    // The reserve's own price at the same cap — so the identity holds:
    // the value before the reserve IS this plus the value printed.
    valueOfReserveOmitted: cap === null ? null : round(shownReserve / cap),
    revparAfterLift: round2(t.adr * lift * occ),
    noiIfRateRises: round(byRate.noi),
    noiIfOccupancyRises: round(byOccupancy.noi),
    leverGap: round(gap),
    leverThatWins: winner,
    occupancyLiftClamped: clamped,
    leverCrossingPerRoom: crossing === null ? null : round2(crossing),
    leverGapValue: cap === null ? null : round(Math.abs(gap) / cap),
    occupancyForParityPct: occForParity === null ? null : round1(occForParity),
    note: null,
  };
  return { ...x, note: noteFor(x) };
}

/**
 * The one sentence. It leads with rule 2 where the index is taken apart,
 * because "cut rate" is the wrong move a single RevPAR index invites and
 * that is the most expensive mistake on this page.
 */
function noteFor(x: HotelRead): string {
  if (
    x.revparIndex !== null &&
    x.adrIndex !== null &&
    x.occupancyIndex !== null &&
    x.revparIndex < 100 &&
    x.adrIndex > 100
  ) {
    return `The RevPAR index is ${x.revparIndex} on a rate ${round1(x.adrIndex - 100)}% ABOVE the comp set, so the whole shortfall is empty rooms — ${x.occupancyForParityPct}% occupancy reaches parity at today's rate, and cutting rate to chase the index would give away the one thing working.`;
  }
  if (x.revparIndex !== null && x.adrIndex !== null && x.revparIndex < 100 && x.adrIndex < 100) {
    return `The RevPAR index is ${x.revparIndex} and BOTH levers are below the comp set — rate at ${x.adrIndex} and occupancy at ${x.occupancyIndex} — which is a positioning problem rather than a revenue-management one.`;
  }
  if (x.revparIndex !== null && x.revparIndex >= 100) {
    return `The RevPAR index is ${x.revparIndex}, so the hotel is taking more than its fair share — the question on a deal like this is whether the next owner can hold it.`;
  }
  if (x.occupancyLiftClamped) {
    return `At ${LEVER_LIFT_PCT}% more occupancy this hotel would be past 100% full, so the two levers no longer reach the same RevPAR and there is no winner to name — rate is the only one with room left.`;
  }
  if (x.leverThatWins !== null && x.leverGap !== null && x.leverThatWins !== "neither") {
    return `${withArticle(`${LEVER_LIFT_PCT}%`, true)} lift in rate and ${withArticle(`${LEVER_LIFT_PCT}%`)} lift in occupancy are the same RevPAR and ${usd(Math.abs(x.leverGap))} apart at the bottom line — ${x.leverThatWins} wins here. Enter the comp set to see whether the market agrees.`;
  }
  return "Enter the competitive set's rate and occupancy to see which half of RevPAR is short.";
}

function usd(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

const round1 = (n: number) => round(n, 1);
const round2 = (n: number) => round(n, 2);
