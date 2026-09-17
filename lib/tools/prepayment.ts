/**
 * What it costs to get out of the loan early.
 *
 * `readDebt` runs a loan to maturity and `testRefi` sizes its take-out.
 * Neither answers the question that actually decides whether a deal can
 * be sold: if you leave before maturity, what does the lender want to let
 * you go? On a fixed-rate loan that is never a simple percentage, it is
 * one of two quite different calculations, and they can differ by a
 * million dollars on the same loan.
 *
 * Four rules.
 *
 *   1. **Yield maintenance is CHEAP when rates have risen and dear when
 *      they have fallen** — which is the opposite of what most people
 *      expect, because they are thinking of the loan's value rather than
 *      its penalty. The penalty makes the lender whole on the interest it
 *      will not now receive, so it is the present value of the gap
 *      between the loan's rate and what the lender can reinvest at
 *      TODAY. If today's rate is above the coupon there is no gap and no
 *      loss, and the penalty drops to its floor — usually 1% of the
 *      balance. A 3.75% loan in a 4.75% world is almost free to break.
 *
 *   2. **And the same movement makes the loan MORE valuable to you.** The
 *      two facts pull in opposite directions and are almost never put
 *      side by side: rates rise, your old cheap debt is worth more as an
 *      asset (`debtMarkToMarket`, what a buyer would pay to assume it)
 *      and costs less to break. So the honest question at a sale is not
 *      "what is the penalty" but "is the penalty smaller than what the
 *      debt is worth to a buyer who could assume it" — and where it is
 *      not, the loan should be assumed rather than retired.
 *
 *   3. **Defeasance is not a penalty, it is a PURCHASE.** You buy
 *      Treasuries that replicate the remaining payments and substitute
 *      them as collateral; the loan itself survives. So its cost is what
 *      that portfolio costs less the balance it retires — and when rates
 *      have risen the portfolio costs LESS than the balance, which is a
 *      defeasance GAIN, a real thing that happened widely in 2023 and
 *      2024. Yield maintenance can never go below its floor; defeasance
 *      can go below zero. The hard costs (accountant, trustee, counsel,
 *      rating agency) are a floor of their own and do not scale, so they
 *      matter most on a small loan.
 *
 *   4. **The open window costs nothing, and it is usually months away,
 *      not years.** Most fixed-rate loans go open in the last few months
 *      before maturity. A sale that can wait for it pays nothing at all,
 *      so the penalty is really the price of closing SOONER — which is
 *      the number to weigh against a bid, and `costOfNotWaiting` says it
 *      as a monthly rate so it can be compared with carrying the asset.
 *
 * The remaining payments run monthly on the loan's own amortisation, the
 * convention `debt-math` uses and for the same reason: an annual grid
 * cannot hold a balloon.
 *
 * Pure, no I/O.
 */

import { loanConstant } from "./deal-math";

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

export interface PrepayTerms {
  /** what is outstanding today */
  balance: number | null;
  /** the loan's coupon, in % */
  loanRatePct: number | null;
  /** months left to maturity */
  monthsRemaining: number | null;
  /** its original amortisation, in years; null or 0 is interest-only */
  amortYears: number | null;
  /** the reinvestment rate — the Treasury matching the remaining term */
  treasuryRatePct: number | null;
  /** the yield-maintenance floor, as a % of the balance (commonly 1) */
  floorPct: number | null;
  /** accountant, trustee, counsel, rating agency */
  defeasanceCosts: number | null;
  /** months until the loan goes open and prepays for nothing */
  monthsToOpen: number | null;
  /** what the same loan would cost to place today, in % */
  marketLoanRatePct: number | null;
}

export interface PrepayRead {
  /** the monthly payment the schedule is built from */
  payment: number | null;
  /** the balloon that lands at maturity */
  balloon: number | null;
  /** the lender's lost interest, present-valued; zero when rates rose */
  yieldMaintenanceRaw: number | null;
  /** the floor, in dollars */
  floorAmount: number | null;
  /** what yield maintenance actually costs — the greater of the two */
  yieldMaintenance: number | null;
  /** true when the floor is doing the work, i.e. there is no real loss */
  atFloor: boolean;
  /** the Treasury portfolio that replicates the payments */
  defeasancePortfolio: number | null;
  /** that portfolio less the balance — negative is a defeasance gain */
  defeasanceSpread: number | null;
  /** the spread plus the hard costs: what defeasance costs all in */
  defeasance: number | null;
  /** which of the two to use, or the window if it is close enough */
  cheaper: "yield maintenance" | "defeasance" | "the open window" | null;
  /** what the cheaper of the two costs */
  cost: number | null;
  /** what a buyer would pay to assume the loan (rule 2) */
  debtMarkToMarket: number | null;
  /** the penalty as a monthly cost of closing before the window (rule 4) */
  costOfNotWaiting: number | null;
  note: string;
}

const EMPTY: PrepayRead = {
  payment: null,
  balloon: null,
  yieldMaintenanceRaw: null,
  floorAmount: null,
  yieldMaintenance: null,
  atFloor: false,
  defeasancePortfolio: null,
  defeasanceSpread: null,
  defeasance: null,
  cheaper: null,
  cost: null,
  debtMarkToMarket: null,
  costOfNotWaiting: null,
  note: "",
};

/**
 * The remaining payments: `n` monthly payments and the balloon with the
 * last one. Exported so a test can price the same stream itself rather
 * than trusting the discounting below.
 */
export function remainingPayments(
  balance: number,
  ratePct: number,
  months: number,
  payment: number,
): number[] {
  const r = ratePct / 100 / 12;
  const out: number[] = [];
  let bal = balance;
  for (let m = 1; m <= months; m += 1) {
    const interest = bal * r;
    const principal = Math.min(Math.max(payment - interest, 0), bal);
    bal -= principal;
    out.push(payment);
  }
  // The balloon rides with the final payment.
  if (out.length > 0) out[out.length - 1] += bal;
  return out;
}

/** Present value of a monthly stream at an annual nominal rate. */
function pv(monthly: number[], annualPct: number): number {
  const r = annualPct / 100 / 12;
  return monthly.reduce((acc, c, i) => acc + c / Math.pow(1 + r, i + 1), 0);
}

export function readPrepayment(terms: PrepayTerms): PrepayRead {
  const {
    balance,
    loanRatePct,
    monthsRemaining,
    amortYears,
    treasuryRatePct,
    floorPct,
    defeasanceCosts,
    monthsToOpen,
    marketLoanRatePct,
  } = terms;

  if (!positive(balance)) {
    return { ...EMPTY, note: "Enter what is outstanding on the loan." };
  }
  if (!positive(loanRatePct) || !positive(monthsRemaining)) {
    return { ...EMPTY, note: "Enter the loan's rate and the months left to maturity." };
  }

  const months = Math.round(monthsRemaining);
  const io = !positive(amortYears);
  const k = loanConstant(loanRatePct, amortYears, io);
  if (k === null) {
    return { ...EMPTY, note: "Enter the loan's amortisation, or leave it blank for interest-only." };
  }
  const payment = round((balance * k) / 12, 2);

  const stream = remainingPayments(balance, loanRatePct, months, payment);
  const balloon = round(stream[stream.length - 1] - payment);

  if (!real(treasuryRatePct)) {
    return {
      ...EMPTY,
      payment,
      balloon,
      note:
        `The loan pays ${round(payment)} a month and balloons at ${balloon}. ` +
        "Enter the Treasury rate for the remaining term to price getting out.",
    };
  }

  // Rule 1. Discounting the loan's own stream at the Treasury rate and
  // taking the excess over the balance IS the lost interest, present
  // valued — there is no need for a separate differential schedule, and
  // doing it this way means the same stream prices both calculations.
  const atTreasury = pv(stream, treasuryRatePct);
  const yieldMaintenanceRaw = round(Math.max(0, atTreasury - balance));
  const floorAmount = real(floorPct) && floorPct > 0 ? round((floorPct / 100) * balance) : 0;
  const yieldMaintenance = round(Math.max(yieldMaintenanceRaw, floorAmount));
  const atFloor = floorAmount > yieldMaintenanceRaw;

  // Rule 3. The portfolio IS that same present value; what makes
  // defeasance different is that the shortfall or surplus against the
  // balance is kept rather than floored, and the hard costs are added.
  const defeasancePortfolio = round(atTreasury);
  const defeasanceSpread = round(atTreasury - balance);
  const hard = real(defeasanceCosts) && defeasanceCosts > 0 ? defeasanceCosts : 0;
  const defeasance = round(defeasanceSpread + hard);

  const open = real(monthsToOpen) && monthsToOpen > 0 ? Math.round(monthsToOpen) : 0;
  let cheaper: PrepayRead["cheaper"] =
    defeasance < yieldMaintenance ? "defeasance" : "yield maintenance";
  let cost = Math.min(defeasance, yieldMaintenance);
  if (open === 0) {
    cheaper = "the open window";
    cost = 0;
  }

  // Rule 2. Against today's lending rate, not the Treasury: what a buyer
  // assuming this loan would be getting.
  const debtMarkToMarket = positive(marketLoanRatePct)
    ? round(balance - pv(stream, marketLoanRatePct))
    : null;

  // Only meaningful when leaving early actually costs something. Where
  // it pays, there is nothing to buy back by waiting and a rate per
  // month of waiting is a number with no meaning.
  const costOfNotWaiting = open > 0 && cost > 0 ? round(cost / open) : null;

  const notes: string[] = [];
  if (open === 0) {
    notes.push(
      "The loan is open — it prepays at par, with no penalty and no defeasance.",
    );
  } else {
    notes.push(
      cost > 0
        ? `Getting out costs ${cost} through ${cheaper}. ` +
            `Yield maintenance is ${yieldMaintenance}${atFloor ? " — all of it the floor" : ""}, ` +
            `defeasance ${defeasance}.`
        : `Getting out PAYS ${Math.abs(cost)} through ${cheaper}, rather than costing anything. ` +
            `Yield maintenance would be ${yieldMaintenance}${atFloor ? " — all of it the floor" : ""}.`,
    );
    if (atFloor) {
      notes.push(
        `Rates have risen past the ${loanRatePct}% coupon, so the lender loses nothing by ` +
          "being repaid and yield maintenance is the floor rather than a real loss.",
      );
    }
    if (defeasanceSpread < 0) {
      notes.push(
        `The Treasury portfolio costs ${Math.abs(defeasanceSpread)} LESS than the balance it ` +
          `retires, so defeasance is a gain before its ${round(hard)} of hard costs — ` +
          "which is why it beats a penalty that can never go below its floor.",
      );
    }
    if (costOfNotWaiting !== null) {
      notes.push(
        `The loan goes open in ${open} months, where it would cost nothing. ` +
          `Closing sooner is ${costOfNotWaiting} a month of waiting bought back.`,
      );
    }
  }
  // Rule 2, and the comparison only reads properly when the penalty is
  // a cost. Where getting out pays, retiring the loan is free money and
  // the question is simply whether a buyer would pay more to keep it.
  if (debtMarkToMarket !== null && debtMarkToMarket > 0) {
    notes.push(
      cost > 0
        ? `The loan is ${debtMarkToMarket} below market, which is what a buyer assuming it ` +
            `would be getting — ${debtMarkToMarket > cost ? "more" : "less"} than the ${cost} it ` +
            `costs to retire, so ${debtMarkToMarket > cost ? "assumption is worth pricing into the bid" : "retiring it is the cleaner trade"}.`
        : `The same rate move that makes this cheap to retire makes it ${debtMarkToMarket} below ` +
            "market to a buyer who could assume it. Both are worth having; only one can be had.",
    );
  }

  return {
    payment,
    balloon,
    yieldMaintenanceRaw,
    floorAmount,
    yieldMaintenance,
    atFloor,
    defeasancePortfolio,
    defeasanceSpread,
    defeasance,
    cheaper,
    cost,
    debtMarkToMarket,
    costOfNotWaiting,
    note: notes.join(" "),
  };
}
