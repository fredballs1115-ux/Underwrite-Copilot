// Filling an empty building, and what the waiting costs — PURE.
//
// A development delivers, a conversion finishes, a value-add buy closes half
// empty. Every pro forma then shows a stabilized year, and the months between
// are a footnote: "12–18 month lease-up". Those months are where the money
// goes, and they are the only part of the plan nobody underwrites.
//
// Four rules.
//
// 1. A SLOWER LEASE-UP DOES NOT SHOW UP IN THE RESERVE — which is the trap,
//    because the reserve is what people stress-test. Slipping the seeded
//    building six months makes the worst month SHALLOWER, $6,200,437 to
//    $5,674,789, since the allowance and the commission are what drive the
//    trough and a slower pace spends them slower. A sponsor who shocks the
//    absorption, sees the lease-up reserve still covers it and concludes the
//    slippage is survivable has measured the wrong thing. The cost is in
//    TIME, and it shows only at a COMMON date: at month 36 the base case is
//    $3,465,450 out and the slipped one $4,158,892 — $693,442 worse, which
//    is 1.9x what a 5% rent miss costs on the same building. That is why
//    both figures are reported and the trough alone never is.
//
// 2. AN EMPTY BUILDING STILL COSTS MONEY TO OWN. Taxes, insurance, security
//    and base utilities run from the day the certificate of occupancy is
//    issued. A model whose expense line starts at stabilization understates
//    the hold by the whole lease-up, which is exactly the period it was
//    meant to describe. So the expense splits: a fixed share that runs
//    regardless, and a variable share that follows the space occupied.
//
// 3. LEASED IS NOT PAYING. Free rent is agreed at signing and paid for
//    during lease-up: a lease signed in month 3 with six months free
//    contributes nothing until month 9. The leased curve is the one in the
//    leasing report and the paying curve is the one in the bank, and they
//    are months apart — `monthsToStabilize` against `monthsToFullPay`.
//
// 4. SO THE TROUGH IS NOT AT DELIVERY. Allowances and commissions are due
//    at SIGNING, ahead of the rent they buy, so the cash need keeps growing
//    while the leasing goes well — the worst month on the seeded building is
//    month 22, the month it fills, not month one. `peakFunding` is the
//    cheque the equity has to be able to write, and it is what a lease-up
//    reserve is supposed to be sized against and rarely is.
//
// Unlevered unless a monthly debt service is given: a construction loan's
// own interest reserve is `construction-draw`, and double-counting it here
// would overstate the trough.
//
// Pure, no I/O.

/** A lease-up past five years is not a screening question. */
export const MAX_MONTHS = 60;
/** The common date the two shocks are read at — rule 1. */
export const COMPARE_MONTH = 36;
const DEFAULT_STABILIZED_PCT = 95;
const SLIP_MONTHS = 6;

const real = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
const positive = (n: number | null | undefined): n is number => real(n) && n > 0;
const atLeastZero = (n: number | null | undefined): number => (real(n) && n > 0 ? n : 0);
const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface LeaseUpMonth {
  month: number;
  /** cumulative square feet under signed lease */
  leasedSf: number;
  /** …and the share of those actually paying rent — rule 3 */
  payingSf: number;
  occupancyPct: number;
  revenue: number;
  opex: number;
  /** the allowance and commission on the space signed THIS month */
  leasingCapital: number;
  debtService: number;
  net: number;
  /** running total, which is the line that matters */
  cumulative: number;
}

export interface LeaseUpResult {
  /** the square feet the plan is underwritten to reach */
  targetSf: number | null;
  months: LeaseUpMonth[];
  /** the month the leasing report says the building is full */
  monthsToStabilize: number | null;
  /** …and the month the bank agrees — rule 3 */
  monthsToFullPay: number | null;
  /** the gap between them, which is the free rent showing up */
  freeRentLagMonths: number | null;
  /** rule 4 — the deepest the cumulative line ever goes, as a positive cheque */
  peakFunding: number | null;
  peakFundingMonth: number | null;
  /** the first month the building covers its own costs */
  breakEvenMonth: number | null;
  /** the month the cumulative line climbs back to zero, if it does */
  paybackMonth: number | null;
  totalLeasingCapital: number | null;
  /** the NOI at the occupancy the plan is underwritten to */
  stabilizedNoi: number | null;
  /** the date the three positions below are read at — rule 1 */
  compareMonth: number | null;
  /** cumulative cash at that date, signed: negative is still out */
  cumulativeAtCompare: number | null;
  /** rule 1 — the trough six months slower, which is SMALLER, not larger */
  peakIfSixMonthsSlower: number | null;
  /** …and what that slippage really costs, read at the same date */
  cumulativeIfSixMonthsSlower: number | null;
  /** the same date again, at 5% less rent on the original pace */
  cumulativeIfRentFivePctLower: number | null;
  note: string;
}

const EMPTY: LeaseUpResult = {
  targetSf: null,
  months: [],
  monthsToStabilize: null,
  monthsToFullPay: null,
  freeRentLagMonths: null,
  peakFunding: null,
  peakFundingMonth: null,
  breakEvenMonth: null,
  paybackMonth: null,
  totalLeasingCapital: null,
  stabilizedNoi: null,
  compareMonth: null,
  cumulativeAtCompare: null,
  peakIfSixMonthsSlower: null,
  cumulativeIfSixMonthsSlower: null,
  cumulativeIfRentFivePctLower: null,
  note: "Enter the building's size, the rent, and how fast the space leases.",
};

export interface LeaseUpInput {
  buildingSf: number;
  /** square feet already signed on the day it delivers */
  preLeasedSf?: number | null;
  /** the occupancy the plan is underwritten to, as a percent */
  stabilizedOccupancyPct?: number | null;
  /** square feet signed a month */
  absorptionSfPerMonth: number;
  /** annual rent per square foot */
  rentPerSf: number;
  /** months of free rent on each lease — rule 3 */
  freeRentMonths?: number | null;
  /** allowance per square foot, due at signing — rule 4 */
  tiPerSf?: number | null;
  /** commission per square foot, due at signing */
  lcPerSf?: number | null;
  /** annual operating expense per square foot at full occupancy */
  opexPerSf?: number | null;
  /** the share of it that runs on an empty building, as a percent — rule 2 */
  fixedOpexSharePct?: number | null;
  /** debt service a month, where the loan is already funded */
  monthlyDebtService?: number | null;
  maxMonths?: number | null;
}

/** What the inputs come to once the blanks have taken their defaults. */
interface Settled {
  sf: number;
  targetSf: number;
  preLeased: number;
  horizon: number;
  free: number;
  capPerSf: number;
  opexPerSf: number;
  fixedShare: number;
  debt: number;
  absorption: number;
  rentPerSf: number;
}

function settle(t: LeaseUpInput): Settled | null {
  if (!positive(t.buildingSf) || !positive(t.absorptionSfPerMonth) || !positive(t.rentPerSf)) {
    return null;
  }
  const sf = t.buildingSf;
  const stabilizedPct = real(t.stabilizedOccupancyPct)
    ? Math.max(0, Math.min(100, t.stabilizedOccupancyPct))
    : DEFAULT_STABILIZED_PCT;
  const targetSf = Math.min(sf, sf * (stabilizedPct / 100));
  if (targetSf <= 0) return null;
  return {
    sf,
    targetSf,
    preLeased: Math.min(targetSf, atLeastZero(t.preLeasedSf)),
    horizon: positive(t.maxMonths) ? Math.min(Math.round(t.maxMonths), MAX_MONTHS) : MAX_MONTHS,
    free: Math.max(0, Math.round(atLeastZero(t.freeRentMonths))),
    capPerSf: atLeastZero(t.tiPerSf) + atLeastZero(t.lcPerSf),
    opexPerSf: atLeastZero(t.opexPerSf),
    fixedShare: real(t.fixedOpexSharePct)
      ? Math.max(0, Math.min(100, t.fixedOpexSharePct)) / 100
      : 0.65,
    debt: round(atLeastZero(t.monthlyDebtService)),
    absorption: t.absorptionSfPerMonth,
    rentPerSf: t.rentPerSf,
  };
}

/**
 * The schedule, month by month.
 *
 * ONE loop, called by the answer and by each of the two shocks, because a
 * shock re-runs the whole thing rather than scaling the answer: the trough
 * moves in TIME as well as in size — a slower lease-up pushes the worst
 * month later while making it shallower — and no multiplier expresses that.
 * A second copy of this loop is how the two would quietly diverge.
 */
function runSchedule(s: Settled): LeaseUpMonth[] {
  // Rule 3. `leasedAt(0)` is the pre-leased space, which is why clamping the
  // paying lookback at zero gives pre-leased space rent from month one — a
  // tenant already in occupancy at delivery burned its free rent during
  // construction, and dating it from the certificate of occupancy would
  // charge the project for concessions it has already paid for.
  const leasedAt = (m: number) =>
    m <= 0 ? s.preLeased : Math.min(s.targetSf, s.preLeased + s.absorption * m);

  const months: LeaseUpMonth[] = [];
  let cumulative = 0;
  for (let m = 1; m <= s.horizon; m++) {
    const leasedSf = leasedAt(m);
    const payingSf = leasedAt(m - s.free);
    const revenue = round((payingSf * s.rentPerSf) / 12);
    // Rule 2: the fixed share runs on an empty building; the variable share
    // follows the space OCCUPIED, since a tenant in its free-rent period is
    // still running the lights.
    const occupancy = leasedSf / s.sf;
    const opex = round(
      ((s.sf * s.opexPerSf) / 12) * (s.fixedShare + (1 - s.fixedShare) * occupancy),
    );
    const leasingCapital = round((leasedSf - leasedAt(m - 1)) * s.capPerSf);
    const net = revenue - opex - leasingCapital - s.debt;
    cumulative += net;
    months.push({
      month: m,
      leasedSf: round(leasedSf),
      payingSf: round(payingSf),
      occupancyPct: round1(occupancy * 100),
      revenue,
      opex,
      leasingCapital,
      debtService: s.debt,
      net,
      cumulative,
    });
  }
  return months;
}

/** The deepest the cumulative line goes, as a positive cheque. */
const troughOf = (months: LeaseUpMonth[]): number =>
  Math.max(0, -Math.min(0, ...months.map((m) => m.cumulative)));

/**
 * The cumulative position at a given month, SIGNED — negative is cash still
 * out. Reporting it as "cash out, floored at zero" would quietly print zero
 * for every schedule that had already paid back, and the three figures rule 1
 * compares would then all read zero and say nothing.
 */
function positionAt(months: LeaseUpMonth[], month: number): number | null {
  return months.find((m) => m.month === month)?.cumulative ?? null;
}

export function readLeaseUp(t: LeaseUpInput): LeaseUpResult {
  const s = settle(t);
  if (s === null) return EMPTY;

  const months = runSchedule(s);
  const target = s.targetSf;
  const at = (pick: (m: LeaseUpMonth) => boolean) => months.find(pick)?.month ?? null;

  const monthsToStabilize = at((m) => m.leasedSf >= target - 0.5);
  const monthsToFullPay = at((m) => m.payingSf >= target - 0.5);
  // The month it stops bleeding. Leasing capital counts, because a month
  // that only covers its costs by signing nothing is not break-even.
  const breakEvenMonth = at((m) => m.net > 0);

  const peakFunding = troughOf(months);
  const peakFundingMonth =
    peakFunding > 0 ? (months.find((m) => -m.cumulative === peakFunding)?.month ?? null) : null;
  const paybackMonth =
    peakFundingMonth === null
      ? null
      : at((m) => m.month > peakFundingMonth && m.cumulative >= 0);

  const stabilizedNoi = round(
    target * s.rentPerSf -
      s.sf * s.opexPerSf * (s.fixedShare + (1 - s.fixedShare) * (target / s.sf)),
  );

  // Rule 1, both halves. The trough is re-run because the shock moves it;
  // the position is read at a COMMON date, because comparing two schedules
  // at their own stabilization months compares two different dates and says
  // nothing about either. The date is clamped to the horizon so the
  // comparison is always available — a short horizon should shorten the
  // comparison, not delete it.
  const compareMonth = Math.min(COMPARE_MONTH, s.horizon);
  const slower =
    monthsToStabilize === null
      ? null
      : runSchedule({
          ...s,
          absorption: (target - s.preLeased) / (monthsToStabilize + SLIP_MONTHS),
        });
  const cheaper = runSchedule({ ...s, rentPerSf: s.rentPerSf * 0.95 });

  return {
    targetSf: round(target),
    months,
    monthsToStabilize,
    monthsToFullPay,
    freeRentLagMonths:
      monthsToStabilize !== null && monthsToFullPay !== null
        ? monthsToFullPay - monthsToStabilize
        : null,
    peakFunding,
    peakFundingMonth,
    breakEvenMonth,
    paybackMonth,
    totalLeasingCapital: months.reduce((a, m) => a + m.leasingCapital, 0),
    stabilizedNoi,
    compareMonth,
    cumulativeAtCompare: positionAt(months, compareMonth),
    peakIfSixMonthsSlower: slower === null ? null : troughOf(slower),
    cumulativeIfSixMonthsSlower: slower === null ? null : positionAt(slower, compareMonth),
    cumulativeIfRentFivePctLower: positionAt(cheaper, compareMonth),
    note: noteFor({
      monthsToStabilize,
      monthsToFullPay,
      peakFunding,
      peakFundingMonth,
      horizon: s.horizon,
      free: s.free,
    }),
  };
}

/**
 * The one sentence, leading with rule 4 — the trough is the figure a
 * lease-up reserve should have been sized against, and the surprise is that
 * it lands deep into a lease-up that is going well.
 */
function noteFor(x: {
  monthsToStabilize: number | null;
  monthsToFullPay: number | null;
  peakFunding: number;
  peakFundingMonth: number | null;
  horizon: number;
  free: number;
}): string {
  const usd = (n: number) => `$${round(n).toLocaleString("en-US")}`;
  const mo = (n: number) => `${n} month${n === 1 ? "" : "s"}`;
  if (x.monthsToStabilize === null) {
    return `It does not fill within ${mo(x.horizon)} at this pace — check the absorption.`;
  }
  if (x.peakFundingMonth !== null && x.peakFunding > 0) {
    return `The worst month is ${x.peakFundingMonth}, not month one: ${usd(x.peakFunding)} of cash out before the building carries itself.`;
  }
  if (x.free > 0 && x.monthsToFullPay !== null && x.monthsToFullPay > x.monthsToStabilize) {
    return `Full at month ${x.monthsToStabilize}, paid in full at month ${x.monthsToFullPay} — the free rent is the difference.`;
  }
  return `It fills in ${mo(x.monthsToStabilize)} and never needs funding, which is a building that was leased before it was built.`;
}
