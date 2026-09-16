/**
 * What the loan actually does over the hold — and whether it can be
 * refinanced at the end of it.
 *
 * The debt sizer answers "how much will they lend?". These two answer the
 * questions that follow it, and they are the ones people leave for a
 * spreadsheet:
 *
 *   1. Of the debt service I pay, how much is interest and how much is
 *      principal coming back to me at sale? An analyst who models debt
 *      service as a single number quietly treats amortisation as a cost.
 *      It is not: it is equity, paid in instalments, returned at exit.
 *   2. What is the balance at the balloon, and does the deal support a loan
 *      that size when the term is up? A deal that pencils at a 6.5% rate and
 *      refinances into an 8% market is a cash-in refinance — the moment the
 *      sponsor writes a cheque to keep the asset — and that is knowable on
 *      day one from figures the OM already states.
 *
 * Pure, no I/O. The refi sizing goes through `sizeLoan` rather than
 * re-deriving the three lender tests, so a refinance is judged by exactly
 * the same arithmetic as the original loan.
 */

import { sizeLoan, valueFromCap, type LoanTest } from "@/lib/tools/deal-math";

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

export interface DebtTerms {
  loan: number | null;
  ratePct: number | null;
  /** the amortisation period the payment is computed over */
  amortYears: number | null;
  /** years of interest-only at the front; 0 or null for none */
  ioYears?: number | null;
  /** the loan term — how long until the balloon */
  termYears: number | null;
}

/** One year of the loan's life. */
export interface DebtYear {
  year: number;
  opening: number;
  interest: number;
  principal: number;
  debtService: number;
  closing: number;
  /** true when every month of this year was interest-only */
  io: boolean;
}

export interface DebtRead {
  years: DebtYear[];
  /** the level annual payment once the loan amortises */
  amortisingPayment: number | null;
  /** the annual payment during the interest-only period, when there is one */
  ioPayment: number | null;
  /** the balance owed when the term is up */
  balloon: number | null;
  /** principal repaid over the term — equity, returned at sale */
  principalPaid: number | null;
  interestPaid: number | null;
  /** principal repaid as a share of the loan, 0–100 */
  paidOffPct: number | null;
  /** interest as a share of everything paid, 0–100 — the year-1 figure is
   *  the one that surprises people */
  interestSharePct: number | null;
  /** set when the loan amortises away before the term is up */
  retiredInYear: number | null;
  note: string | null;
}

const EMPTY: DebtRead = {
  years: [],
  amortisingPayment: null,
  ioPayment: null,
  balloon: null,
  principalPaid: null,
  interestPaid: null,
  paidOffPct: null,
  interestSharePct: null,
  retiredInYear: null,
  note: null,
};

/** The level monthly payment that retires `balance` over `n` months at `r`. */
function levelPayment(balance: number, r: number, n: number): number {
  if (n <= 0) return balance;
  if (r === 0) return balance / n;
  return (balance * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * Runs the loan month by month and reports it a year at a time.
 *
 * Monthly rather than annually on purpose: a 30-year loan at 6.5% pays down
 * ~1.2% of principal in year one, and an annual approximation gets that
 * wrong by enough to matter over a five-year hold. The convention for the
 * interest-only front end is the market's: the payment after it is computed
 * on the FULL amortisation period from that point, not on what is left of
 * it — which is why IO makes the balloon bigger, not just the early
 * payments smaller.
 */
export function readDebt(t: DebtTerms): DebtRead {
  if (!positive(t.loan) || !real(t.ratePct) || t.ratePct < 0) {
    return { ...EMPTY, note: "Enter a loan amount and a rate." };
  }
  // A term under half a year rounds to zero, and the loop then runs no years
  // at all while still reporting a balloon — a figure for a schedule that
  // never ran. This reports in whole years, so a term it cannot represent is
  // refused rather than answered.
  if (!positive(t.termYears) || Math.round(t.termYears) < 1) {
    return { ...EMPTY, note: "Enter the loan term in whole years — the years until the balloon." };
  }

  const termYears = Math.min(Math.round(t.termYears), 40);
  const ioYears = positive(t.ioYears) ? Math.min(Math.floor(t.ioYears), termYears) : 0;
  const amortYears = positive(t.amortYears) ? t.amortYears : null;

  // No amortisation period, or an interest-only period that runs the whole
  // term, is a full-term interest-only loan. That is an ordinary structure,
  // so it reads rather than refusing — and every year is marked IO.
  if (amortYears === null || ioYears >= termYears) {
    return runSchedule(t.loan, t.ratePct, null, termYears, termYears);
  }

  return runSchedule(t.loan, t.ratePct, amortYears, ioYears, termYears);
}

function runSchedule(
  loan: number,
  ratePct: number,
  amortYears: number | null,
  ioYears: number,
  termYears: number,
): DebtRead {
  const r = ratePct / 100 / 12;
  const amortMonths = amortYears === null ? null : Math.round(amortYears * 12);
  const ioMonths = Math.min(ioYears, termYears) * 12;

  let balance = loan;
  let payment: number | null = null;
  const years: DebtYear[] = [];
  let retiredInYear: number | null = null;

  for (let y = 1; y <= termYears; y++) {
    const opening = balance;
    let debtService = 0;
    let everyMonthIo = true;

    for (let m = 0; m < 12; m++) {
      const monthIndex = (y - 1) * 12 + m;
      if (balance <= 0) {
        // The loan is gone; the rest of the year is free of it.
        everyMonthIo = false;
        continue;
      }
      const monthInterest = balance * r;
      if (amortMonths === null || monthIndex < ioMonths) {
        debtService += monthInterest;
        continue;
      }
      everyMonthIo = false;
      if (payment === null) payment = levelPayment(balance, r, amortMonths);
      // The last payment is whatever is left, never more.
      const due = Math.min(payment, balance + monthInterest);
      debtService += due;
      balance -= due - monthInterest;
      if (balance < 0.005) balance = 0;
    }

    if (balance === 0 && retiredInYear === null && opening > 0) retiredInYear = y;

    // Round the BALANCES and derive the flows from them, rather than
    // rounding each of the five figures on its own. Rounded independently,
    // interest + principal misses debt service by a dollar often enough to
    // be visible, and a schedule whose rows do not add up reads as broken
    // whatever the arithmetic behind it. Derived this way every row ties,
    // and the year principals telescope to exactly loan less balloon.
    const openR = round(opening);
    const closeR = round(balance);
    const principalR = openR - closeR;
    const interestR = round(debtService) - principalR;

    years.push({
      year: y,
      opening: openR,
      interest: interestR,
      principal: principalR,
      debtService: interestR + principalR,
      closing: closeR,
      io: everyMonthIo && ioMonths > 0,
    });
  }

  const interestPaid = years.reduce((s, x) => s + x.interest, 0);
  const principalPaid = years.reduce((s, x) => s + x.principal, 0);
  const total = interestPaid + principalPaid;
  const balloon = round(balance);

  return {
    years,
    amortisingPayment: payment === null ? null : round(payment * 12),
    ioPayment: ioMonths > 0 || amortMonths === null ? round(loan * r * 12) : null,
    balloon,
    principalPaid: round(principalPaid),
    interestPaid: round(interestPaid),
    paidOffPct: loan > 0 ? round((principalPaid / loan) * 100, 2) : null,
    interestSharePct: total > 0 ? round((interestPaid / total) * 100, 1) : null,
    retiredInYear,
    note:
      amortMonths === null
        ? "Interest-only for the whole term — the balloon is the full loan."
        : null,
  };
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// The refinance test
// ---------------------------------------------------------------------------

export interface RefiTerms {
  /** what is owed when the term is up */
  balloon: number | null;
  /** the NOI the asset produces at that point */
  noiAtRefi: number | null;
  /** the cap rate the market is paying then */
  exitCapPct: number | null;
  newRatePct: number | null;
  newAmortYears: number | null;
  maxLtvPct: number | null;
  minDscr: number | null;
  minDebtYieldPct: number | null;
}

export interface RefiRead {
  /** what the asset is worth at the refinance, from NOI and the exit cap */
  value: number | null;
  tests: LoanTest[];
  newLoan: number | null;
  binding: LoanTest | null;
  /** new loan less the balloon — positive is cash out, negative is cash in */
  proceeds: number | null;
  /** how far short the new loan falls, as a positive figure, when it does */
  shortfall: number | null;
  /** the new loan over the value at refinance, 0–100 */
  newLtvPct: number | null;
  /** what the NOI would have to be for the new loan to cover the balloon */
  noiToClear: number | null;
  verdict: "cash out" | "covers it" | "cash in" | null;
  note: string | null;
}

const NO_REFI: RefiRead = {
  value: null,
  tests: [],
  newLoan: null,
  binding: null,
  proceeds: null,
  shortfall: null,
  newLtvPct: null,
  noiToClear: null,
  verdict: null,
  note: null,
};

/**
 * Sizes the take-out loan the way a lender would, then holds it against what
 * is owed.
 *
 * The sizing is `sizeLoan` — the same three tests as the original debt, so
 * "which test binds" is answered in the same words at both ends of the hold.
 * What this adds is the comparison the sizer cannot make: a loan that is
 * perfectly healthy on its own terms is still a cash-in refinance if it
 * lands under the balance it has to retire.
 *
 * `noiToClear` inverts the binding test — the NOI at which the new loan
 * exactly covers the balloon — because "you need another $180k of NOI"
 * is a target an asset manager can work toward, where "you are $2.1M short"
 * is only a problem.
 */
export function testRefi(t: RefiTerms): RefiRead {
  if (!positive(t.balloon)) {
    return { ...NO_REFI, note: "Nothing is owed at the balloon — there is nothing to refinance." };
  }
  if (!positive(t.noiAtRefi)) {
    return { ...NO_REFI, note: "Enter the NOI at the refinance." };
  }

  const value = valueFromCap(t.noiAtRefi, t.exitCapPct);
  const sizing = sizeLoan({
    price: value,
    noi: t.noiAtRefi,
    ratePct: t.newRatePct,
    amortYears: t.newAmortYears,
    io: false,
    maxLtvPct: t.maxLtvPct,
    minDscr: t.minDscr,
    minDebtYieldPct: t.minDebtYieldPct,
  });

  if (sizing.tests.length === 0 || sizing.loan === null) {
    return {
      ...NO_REFI,
      value,
      note: "Set at least one lender test — LTV, DSCR or debt yield — to size the take-out.",
    };
  }

  const newLoan = sizing.loan;
  const binding = sizing.tests.find((x) => x.binding) ?? null;
  const proceeds = round(newLoan - t.balloon);

  return {
    value,
    tests: sizing.tests,
    newLoan: round(newLoan),
    binding,
    proceeds,
    shortfall: proceeds < 0 ? Math.abs(proceeds) : null,
    newLtvPct: positive(value) ? round((newLoan / value) * 100, 1) : null,
    noiToClear: noiThatClears(t, binding, sizing.constant),
    // "Covers it" is its own verdict rather than a rounding of "cash out",
    // because a refinance that returns a rounding error is not a capital
    // event and should not be reported as one.
    verdict: proceeds > 1000 ? "cash out" : proceeds < -1000 ? "cash in" : "covers it",
    note: null,
  };
}

/**
 * The NOI at which the binding test alone lends exactly the balloon.
 *
 * Each test inverts differently: LTV through the value the cap rate implies,
 * debt yield directly, DSCR through the loan constant that sized it. Only
 * the binding one is inverted — pushing NOI past it hands the job to
 * whichever test binds next, so this is a target to work toward, not a
 * promise that the refinance clears there.
 *
 * `constant` comes from the sizing rather than being recomputed, so the
 * figure always agrees with the loan that was actually sized.
 */
function noiThatClears(
  t: RefiTerms,
  binding: LoanTest | null,
  constant: number | null,
): number | null {
  if (binding === null || !positive(t.balloon)) return null;
  const owed = t.balloon;

  if (binding.key === "ltv") {
    if (!positive(t.maxLtvPct) || !positive(t.exitCapPct)) return null;
    // loan = (NOI / cap) × ltv  →  NOI = loan × cap ÷ ltv
    return round((owed * (t.exitCapPct / 100)) / (t.maxLtvPct / 100));
  }
  if (binding.key === "debtYield") {
    if (!positive(t.minDebtYieldPct)) return null;
    // loan = NOI ÷ dy  →  NOI = loan × dy
    return round(owed * (t.minDebtYieldPct / 100));
  }
  // DSCR: loan = NOI ÷ (dscr × constant)  →  NOI = loan × dscr × constant
  if (!positive(t.minDscr) || !positive(constant)) return null;
  return round(owed * t.minDscr * constant);
}
