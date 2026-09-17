/**
 * The construction loan's interest reserve, run rather than approximated.
 *
 * A construction loan funds its own interest. That makes the reserve
 * circular — the loan pays interest on a balance that includes the interest
 * it has already paid — and because a closed form needs an assumption about
 * the shape of the draw, every screening model in the business replaces the
 * schedule with a constant. `lib/construction-debt.ts`, which sizes a plan
 * deal's loan on the deal page, does exactly that: `drawProfile`, default
 * 0.55, "an S-curve draw averages a little over half".
 *
 * This card runs the months instead, and the first thing it reports is how
 * far that constant is off.
 *
 * Four rules.
 *
 * **1. Equity goes in first, and that is the whole reason the reserve is
 * smaller than people expect.** A construction lender almost always requires
 * the sponsor's equity fully funded before the first advance. On a 65% loan
 * that means the first 35% of the budget — the land and the early soft costs
 * — never touches the loan, so the loan does not start drawing until the
 * project is more than a third built, and it is outstanding for well under
 * half the term. The 0.55 constant describes a loan drawn pari passu from
 * day one, which is a different deal.
 *
 * **2. The reserve is a fixed point, not a formula.** Interest capitalises
 * into the balance, so the balance that earns next month's interest already
 * contains this month's. It is solved here by iterating the schedule to
 * convergence rather than by assuming the shape that makes the algebra
 * close.
 *
 * **3. The shortcut errs CONSERVATIVE, which is why nobody catches it.** An
 * overstated reserve overstates total cost, which understates yield on cost
 * and makes the deal look worse. Nothing about that reads as a bug — it
 * reads as prudence — so a deal killed by it is killed quietly. That is the
 * error worth naming.
 *
 * **4. A curve is an assumption and is named as one.** Hard costs draw on a
 * smoothstep S-curve (`3x² − 2x³`, symmetric, flat at both ends) or straight
 * line, the caller's choice, and the card says which. Soft costs split: a
 * share at closing (design, permits, financing fees) and the rest alongside
 * the hard costs. Land draws in full at closing, because it does.
 */

const real = (n: number | null): n is number => n !== null && Number.isFinite(n);
const positive = (n: number | null): n is number => real(n) && n > 0;
const round = (n: number) => Math.round(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

export type DrawCurve = "s-curve" | "straight-line";
export type FundingOrder = "equity-first" | "pari-passu";

export interface DrawTerms {
  /** Drawn in full at closing. */
  landCost: number | null;
  hardCost: number | null;
  softCost: number | null;
  /** The share of soft costs spent at closing — design, permits, fees. */
  softAtCloseP: number | null;
  months: number | null;
  /** All-in construction rate, annual %. Floats over SOFR in practice. */
  ratePct: number | null;
  /** The lender's loan-to-cost cap, on a total cost that INCLUDES the reserve. */
  ltcPct: number | null;
  curve: DrawCurve;
  order: FundingOrder;
}

export interface DrawMonth {
  month: number;
  /** Cumulative real costs drawn by the end of this month. */
  costToDate: number;
  /** Loan outstanding, interest included. */
  balance: number;
  /** Interest charged this month, capitalised. */
  interest: number;
}

export interface DrawRead {
  /** Land + hard + soft. The reserve is not in here. */
  hardCostsTotal: number | null;
  /** The reserve the schedule actually produces. */
  interestReserve: number | null;
  totalCost: number | null;
  loan: number | null;
  equity: number | null;

  /** Reserve if the loan were fully drawn from day one. The gross overstatement. */
  reserveIfDrawnAtOnce: number | null;
  /** Reserve under the 0.55 average-balance shortcut the deal page uses. */
  reserveAtShortcut: number | null;
  /** Shortcut less the schedule. Positive = the shortcut overstates. */
  shortcutOverstatesBy: number | null;
  /**
   * The average outstanding balance over the term, as a share of the loan —
   * the figure `drawProfile` assumes. Measured here rather than assumed.
   */
  impliedDrawProfile: number | null;

  peakBalance: number | null;
  peakMonth: number | null;
  /** The month the loan makes its first advance. Null if it never does. */
  firstAdvanceMonth: number | null;
  /** The reserve as a share of the loan — how much of it is not building. */
  reserveShareOfLoanPct: number | null;

  schedule: DrawMonth[];
  note: string | null;
}

/** The share of the hard-cost budget spent by time `x` (0–1) through the works. */
export function curveAt(x: number, curve: DrawCurve): number {
  const t = Math.max(0, Math.min(1, x));
  // Smoothstep: flat at both ends, steepest in the middle, symmetric. The
  // standard screening S-curve, and stated rather than tuned.
  return curve === "s-curve" ? 3 * t * t - 2 * t * t * t : t;
}

/**
 * The reserve the months actually produce.
 *
 * Iterated: each pass sizes the loan off the previous pass's reserve, runs
 * the schedule, and takes the interest that came out. It converges quickly
 * because each correction is the interest on the previous correction —
 * roughly `rate × term` of it, well under one for any real loan.
 */
export function readDraw(t: DrawTerms): DrawRead {
  const empty: DrawRead = {
    hardCostsTotal: null,
    interestReserve: null,
    totalCost: null,
    loan: null,
    equity: null,
    reserveIfDrawnAtOnce: null,
    reserveAtShortcut: null,
    shortcutOverstatesBy: null,
    impliedDrawProfile: null,
    peakBalance: null,
    peakMonth: null,
    firstAdvanceMonth: null,
    reserveShareOfLoanPct: null,
    schedule: [],
    note: null,
  };

  const land = real(t.landCost) && t.landCost >= 0 ? t.landCost : null;
  const hard = real(t.hardCost) && t.hardCost >= 0 ? t.hardCost : null;
  const soft = real(t.softCost) && t.softCost >= 0 ? t.softCost : null;
  if (land === null || hard === null || soft === null) return empty;
  // An LTC of zero is all-cash, which is an answer (no loan, no reserve) and
  // not a missing input — so it is allowed through rather than refused.
  if (!positive(t.months) || !real(t.ratePct) || !real(t.ltcPct)) return empty;
  if (t.ltcPct < 0 || t.ltcPct > 100) return empty;

  const hardCostsTotal = land + hard + soft;
  if (hardCostsTotal <= 0) return empty;

  const n = Math.round(t.months);
  const r = t.ratePct / 100 / 12;
  const ltc = t.ltcPct / 100;
  const softAtClose = real(t.softAtCloseP)
    ? Math.max(0, Math.min(100, t.softAtCloseP)) / 100
    : 0;

  /** Cumulative real costs drawn by the end of month m (m = 0 is closing). */
  const costBy = (m: number): number => {
    if (m <= 0) return land + soft * softAtClose;
    const through = curveAt(m / n, t.curve);
    return land + soft * softAtClose + (hard + soft * (1 - softAtClose)) * through;
  };

  const run = (reserveGuess: number) => {
    const totalCost = hardCostsTotal + reserveGuess;
    const loan = ltc * totalCost;
    const equity = totalCost - loan;
    let balance = 0;
    let accrued = 0;
    let sumBalance = 0;
    let firstAdvance: number | null = null;
    const schedule: DrawMonth[] = [];

    for (let m = 0; m <= n; m += 1) {
      // Rule 2: interest is charged on last month's balance and capitalised.
      const interest = m === 0 ? 0 : balance * r;
      // Rule 1: under equity-first the loan funds only what equity no longer
      // covers; pari passu it funds its share of every dollar from day one.
      const costNow = costBy(m);
      const loanShareOfCosts =
        t.order === "equity-first"
          ? Math.max(0, costNow - equity)
          : costNow * (totalCost > 0 ? loan / totalCost : 0);
      const priorCostPart = balance - accrued;
      const advance = Math.max(0, loanShareOfCosts - priorCostPart);
      if (advance > 0 && firstAdvance === null) firstAdvance = m;
      accrued += interest;
      balance = balance + advance + interest;
      sumBalance += balance;
      schedule.push({
        month: m,
        costToDate: round(costNow),
        balance: round(balance),
        interest: round(interest),
      });
    }
    return { accrued, balance, schedule, loan, equity, totalCost, sumBalance, firstAdvance };
  };

  let reserve = 0;
  let out = run(0);
  for (let i = 0; i < 40; i += 1) {
    const next = run(out.accrued);
    if (Math.abs(next.accrued - reserve) < 0.01) {
      out = next;
      reserve = next.accrued;
      break;
    }
    reserve = next.accrued;
    out = next;
  }

  const years = n / 12;
  const loan = out.loan;
  const reserveIfDrawnAtOnce = loan * (t.ratePct / 100) * years;
  // The constant `lib/construction-debt.ts` uses, applied the same way.
  const SHORTCUT = 0.55;
  const reserveAtShortcut = reserveIfDrawnAtOnce * SHORTCUT;

  const peak = out.schedule.reduce(
    (best, row) => (row.balance > best.balance ? row : best),
    out.schedule[0],
  );
  // The average over the months the loan could have been outstanding, which
  // is the denominator `drawProfile` is quoted against.
  const impliedDrawProfile = loan > 0 ? out.sumBalance / (n + 1) / loan : null;

  return {
    hardCostsTotal: round(hardCostsTotal),
    interestReserve: round(reserve),
    totalCost: round(out.totalCost),
    loan: round(loan),
    equity: round(out.equity),
    reserveIfDrawnAtOnce: round(reserveIfDrawnAtOnce),
    reserveAtShortcut: round(reserveAtShortcut),
    shortcutOverstatesBy: round(reserveAtShortcut - reserve),
    impliedDrawProfile:
      impliedDrawProfile === null ? null : Math.round(impliedDrawProfile * 100) / 100,
    peakBalance: round(peak.balance),
    peakMonth: peak.month,
    firstAdvanceMonth: out.firstAdvance,
    reserveShareOfLoanPct: loan > 0 ? round2((reserve / loan) * 100) : null,
    schedule: out.schedule,
    note: noteFor({
      order: t.order,
      firstAdvance: out.firstAdvance,
      months: n,
      shortcutOver: reserveAtShortcut - reserve,
      reserve,
    }),
  };
}

function noteFor(s: {
  order: FundingOrder;
  firstAdvance: number | null;
  months: number;
  shortcutOver: number;
  reserve: number;
}): string | null {
  if (s.reserve <= 0) return "The equity covers the whole budget, so the loan never draws and there is no reserve.";
  const share = s.reserve > 0 ? Math.abs(s.shortcutOver) / s.reserve : 0;
  if (s.order === "equity-first" && s.firstAdvance !== null && s.firstAdvance > 0) {
    return `Equity funds the first ${s.firstAdvance} of ${s.months} months, so the loan is outstanding for well under the term — which is why the average-balance shortcut is ${(share * 100).toFixed(0)}% high here.`;
  }
  if (share > 0.05) {
    return `The average-balance shortcut is ${(share * 100).toFixed(0)}% ${s.shortcutOver > 0 ? "high" : "low"} against the schedule.`;
  }
  return "The shortcut and the schedule agree closely on this draw.";
}
