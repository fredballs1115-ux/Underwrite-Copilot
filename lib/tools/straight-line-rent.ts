/**
 * The rent an audited statement reports, against the rent the building
 * collects.
 *
 * A seller's financials are prepared under GAAP, and GAAP does not report
 * the rent a tenant paid this year. It reports the TERM'S TOTAL RENT
 * DIVIDED BY THE TERM — the same figure every year, whatever the lease
 * actually billed. So a buyer reading "NOI" off an audited statement is
 * reading a number that is deliberately not cash, and nothing on the page
 * says so, because to an accountant it is not a discrepancy at all.
 *
 * On an escalating lease the difference is large, it runs in a known
 * direction, and IT REVERSES. Four rules.
 *
 * Rule 1. STRAIGHT-LINE RENT IS THE AVERAGE; CASH RENT IS THE SCHEDULE.
 * Early in an escalating lease the straight-line figure is ABOVE cash, so
 * the statement flatters the building; late in the lease it is below, and
 * the statement understates it. They cross exactly once. `crossingYear`
 * says where, and whether the lease being bought sits before or after it
 * decides the SIGN of the error — which is why a rule of thumb ("knock
 * off ten percent for straight-lining") is wrong half the time.
 *
 * Rule 2. FREE RENT IS AVERAGED IN TOO, and that is the version that
 * catches people. A lease with six months free reports positive rental
 * revenue for six months in which the landlord collects nothing at all.
 * On the seeded lease the year-one gap is at its widest precisely because
 * the concession sits at the front.
 *
 * Rule 3. THE GAP CAPITALISES. An NOI overstated by the straight-line
 * adjustment, divided by a cap rate, is a price overstated by the same
 * adjustment over the same rate — `valueOfGap` — and that is the number
 * the error is actually worth, rather than the per-year figure people
 * compare against a rounding tolerance. It prices the error of
 * capitalising THIS year's reported figure against THIS year's cash, and
 * it does not claim either is the right year to capitalise: on a lease
 * with a concession at the front, year one is a poor year to price off
 * whichever number you use, which is its own argument.
 *
 * Rule 4. THE DEFERRED RENT RECEIVABLE IS NOT AN ASSET THE BUYER BUYS.
 * It is the cumulative gap to date, sitting on the seller's balance sheet
 * as a receivable, and it is written off at closing because the buyer's
 * own straight-line starts fresh from the remaining term. It is also the
 * cleanest read of how far into the lease the building is:
 * `deferredRentReceivable` peaks at the crossing and falls to exactly
 * zero at expiry.
 *
 * The identity the whole module rests on: over the FULL term, cumulative
 * cash and cumulative straight-line are equal to the dollar. Straight-line
 * accounting moves rent between years; it never creates or destroys any.
 * A test asserts it.
 *
 * Pure, no I/O. Runs a year at a time, because that is how a lease steps
 * and how a statement reports.
 */

/** A lease longer than this is refused rather than run — a typo, not a term. */
export const MAX_TERM = 50;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

export interface LeaseTerms {
  /** the term, in years */
  termYears: number | null;
  /** year one's contract rent per square foot, before any concession */
  startingRentPerSf: number | null;
  /** the annual escalation, in % */
  escalationPct: number | null;
  /** rent-free months at the front of the term — rule 2 */
  freeMonths: number | null;
  /** the space, in square feet */
  areaSf: number | null;
  /** which year of the term the building is being bought in — rule 1 */
  currentYear: number | null;
  /** the cap rate the price is being struck at, in % — rule 3 */
  capRatePct?: number | null;
}

/** One year of the lease, both ways. */
export interface LeaseYear {
  year: number;
  cashRent: number;
  straightLineRent: number;
  /** straight-line less cash — positive means the statement flatters */
  gap: number;
  /** the running total of that gap, which IS the receivable */
  cumulativeGap: number;
}

export interface StraightLineRead {
  years: LeaseYear[];
  /** the term's total rent, which both methods report identically */
  totalRent: number;
  /** the one figure GAAP reports every year of the term */
  straightLineRent: number;
  /** what the lease actually bills in the year being bought */
  cashRentThisYear: number;
  /** rule 1 — signed: positive where the statement is above cash */
  gapThisYear: number;
  gapPct: number | null;
  /** the year cash overtakes the straight-line figure */
  crossingYear: number | null;
  /** whether the year being bought sits before it */
  beforeCrossing: boolean | null;
  /** rule 2 — the widest the gap gets, and when */
  widestGap: number;
  widestGapYear: number | null;
  /** rule 3 */
  valueOfGap: number | null;
  /** rule 4 — the cumulative gap to the year being bought */
  deferredRentReceivable: number;
  /** …and its peak, which is the crossing */
  peakReceivable: number;
  note: string | null;
}

const EMPTY: StraightLineRead = {
  years: [],
  totalRent: 0,
  straightLineRent: 0,
  cashRentThisYear: 0,
  gapThisYear: 0,
  gapPct: null,
  crossingYear: null,
  beforeCrossing: null,
  widestGap: 0,
  widestGapYear: null,
  valueOfGap: null,
  deferredRentReceivable: 0,
  peakReceivable: 0,
  note: null,
};

export function readStraightLine(t: LeaseTerms): StraightLineRead {
  if (!positive(t.termYears) || t.termYears > MAX_TERM) {
    return { ...EMPTY, note: `Enter a term between 1 and ${MAX_TERM} years.` };
  }
  if (!positive(t.startingRentPerSf) || !positive(t.areaSf)) {
    return { ...EMPTY, note: "Enter the starting rent and the area." };
  }
  const term = Math.round(t.termYears);
  const esc = real(t.escalationPct) ? t.escalationPct / 100 : 0;
  const free = real(t.freeMonths) && t.freeMonths >= 0 ? Math.min(t.freeMonths, term * 12) : 0;

  // The cash schedule: the contract rent steps on the lease's own
  // anniversary (`lease-math`'s convention), and the concession comes off
  // the front at the rate it WOULD have been paid at.
  const contract: number[] = [];
  for (let y = 1; y <= term; y++) {
    contract.push(t.startingRentPerSf * Math.pow(1 + esc, y - 1) * t.areaSf);
  }

  const cash: number[] = [];
  let freeLeft = free;
  for (let y = 1; y <= term; y++) {
    const monthsFree = Math.min(12, freeLeft);
    freeLeft -= monthsFree;
    cash.push(contract[y - 1] * ((12 - monthsFree) / 12));
  }

  const totalRent = cash.reduce((s, x) => s + x, 0);
  // Rule 2: the concession is inside this average, so the statement
  // reports revenue in a year the landlord banked none of it.
  const straightLine = totalRent / term;

  const years: LeaseYear[] = [];
  let running = 0;
  for (let y = 1; y <= term; y++) {
    const gap = straightLine - cash[y - 1];
    running += gap;
    years.push({
      year: y,
      cashRent: round(cash[y - 1]),
      straightLineRent: round(straightLine),
      gap: round(gap),
      cumulativeGap: round(running),
    });
  }

  // Rule 1. The single crossing — the first year cash reaches or passes
  // the straight-line figure. On a flat lease with no concession there is
  // no crossing AT ALL, because the two lines are the same line: reporting
  // year 1 there would say cash "overtakes" a figure it never trailed.
  const identical = years.every((y) => y.gap === 0);
  const crossing = identical
    ? null
    : (years.find((y) => y.cashRent >= y.straightLineRent)?.year ?? null);

  const widest = years.reduce((a, b) => (Math.abs(b.gap) > Math.abs(a.gap) ? b : a), years[0]);
  const peak = years.reduce((a, b) => Math.max(a, b.cumulativeGap), 0);

  const bought = real(t.currentYear) ? Math.min(Math.max(1, Math.round(t.currentYear)), term) : 1;
  const here = years[bought - 1];

  const cap = positive(t.capRatePct) ? t.capRatePct : null;
  const valueOfGap = cap === null ? null : round(here.gap / (cap / 100));

  const x: StraightLineRead = {
    years,
    totalRent: round(totalRent),
    straightLineRent: round(straightLine),
    cashRentThisYear: here.cashRent,
    gapThisYear: here.gap,
    gapPct: here.cashRent > 0 ? round1((here.gap / here.cashRent) * 100) : null,
    crossingYear: crossing,
    beforeCrossing: crossing === null ? null : bought < crossing,
    widestGap: widest.gap,
    widestGapYear: widest.year,
    valueOfGap,
    deferredRentReceivable: here.cumulativeGap,
    peakReceivable: round(peak),
    note: null,
  };
  return { ...x, note: noteFor(x, bought, free, identical) };
}

/**
 * The one sentence, leading with the sign — because a buyer who knows
 * only that "straight-lining overstates NOI" is wrong for the whole back
 * half of every lease.
 */
function noteFor(
  x: StraightLineRead,
  bought: number,
  freeMonths: number,
  identical: boolean,
): string {
  if (identical) {
    return "The lease is flat with no concession, so the statement and the cash are the same number every year.";
  }
  if (x.crossingYear === null) {
    return "Cash never reaches the straight-line figure over this term, so the statement flatters the building for the whole of it.";
  }
  if (x.gapThisYear > 0 && x.valueOfGap !== null) {
    return `In year ${bought} the statement reports ${usd(x.gapThisYear)} more rent than the building collects, which at the stated cap is ${usd(x.valueOfGap)} of price. Cash overtakes it in year ${x.crossingYear}.`;
  }
  if (x.gapThisYear > 0) {
    return `In year ${bought} the statement reports ${usd(x.gapThisYear)} more rent than the building collects. Enter the cap rate to see what that is worth.`;
  }
  if (x.gapThisYear < 0) {
    return `Year ${bought} is past the crossing in year ${x.crossingYear}, so the statement UNDERSTATES the cash by ${usd(Math.abs(x.gapThisYear))} — straight-lining cuts both ways, and this is the half nobody adjusts for.`;
  }
  return freeMonths > 0
    ? "Year one sits exactly at the average, which the concession at the front is what makes possible."
    : "The statement and the cash agree in this year.";
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
