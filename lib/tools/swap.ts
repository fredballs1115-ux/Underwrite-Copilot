/**
 * The interest rate swap, and what it costs to get out of one.
 *
 * `floating-rate` prices the CAP — the instrument a bridge lender requires
 * and the borrower buys as cheaply as it can. This is the other half, and
 * the one every borrower who calls itself hedged actually has: a swap that
 * fixes the index on a floating loan. Four rules, and the first two are
 * the same sentence said twice, because the whole trap is that people
 * believe the second and not the first.
 *
 * Rule 1. A CAP IS AN OPTION; A SWAP IS AN OBLIGATION. A cap costs a
 * premium and pays only when rates rise: the worst case is the premium.
 * A swap costs nothing at the outset and settles BOTH ways, so the worst
 * case is unbounded and lands on the side nobody stress-tests — rates
 * FALLING. The borrower who swapped at 4.50% and watches the market swap
 * to 3.00% is paying 150 basis points over the market on every dollar,
 * for the rest of the term, having done what everyone called the prudent
 * thing. `markToMarket` is that position in dollars, signed: positive
 * where the swap is an asset, negative where it is a liability.
 *
 * Rule 2. THE MARK-TO-MARKET IS THE BREAKAGE COST, AND IT IS WHAT MAKES
 * THE BUILDING UNSELLABLE. Selling means terminating the swap, and an
 * out-of-the-money swap is a cheque written at closing on top of
 * everything else. This is EXACTLY `prepayment`'s finding about yield
 * maintenance, on the opposite instrument — and, the part that matters,
 * IN THE SAME RATE DIRECTION. Both are cheap when rates have risen and
 * ruinous when they have fallen. A borrower who chose floating-plus-swap
 * over a fixed-rate loan believing it was the more flexible of the two
 * chose an identically shaped exit problem; `sameShapeAsYieldMaintenance`
 * says so on the deals where it bites, because it is the one thing the
 * structure was picked to avoid.
 *
 * Rule 3. THE ALL-IN RATE IS THE SWAP RATE PLUS THE CREDIT SPREAD. A swap
 * fixes the INDEX and nothing else; the lender's spread is a term of the
 * loan and rides on top. A "3.50% swap" on SOFR plus 250 is a 6.00% loan,
 * and the swap rate gets quoted as though it were the coupon often enough
 * that `allInRatePct` is drawn beside it rather than left to be added.
 *
 * Rule 4. THE NOTIONAL HAS TO FOLLOW THE BALANCE, OR YOU ARE HEDGING DEBT
 * YOU DO NOT OWE. A bullet swap against an amortising loan leaves notional
 * outstanding that the loan has already repaid, and a swap with no loan
 * under it is not a hedge but a naked rate position, settling in cash
 * against a building that no longer has the exposure. Two ways to get
 * there and both are ordinary: an amortising loan under a flat notional
 * (`overHedgedFromAmortisation`), and a swap whose term outlasts the loan's
 * (`nakedMonths`). The second is the larger number and the one nobody
 * models, because the loan is gone by then and so is the spreadsheet.
 *
 * Runs monthly, as `debt-math` and `prepayment` do. Pure, no I/O.
 */

import { withArticle } from "@/lib/article";
import { readDebt } from "./debt-math";

/** A swap longer than this is a typo rather than a term. */
export const MAX_TERM_YEARS = 30;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return (Math.round(n * f) + 0) / f;
}

export type SwapTerms = {
  /** The loan the swap sits on. */
  loanAmount: number | null;
  /** The lender's credit spread over the index, in percent. */
  spreadPct: number | null;
  /** Amortisation in years; null or 0 is interest-only. */
  amortYears: number | null;
  /** Years of interest-only at the front, if any. */
  ioYears: number | null;
  /** How long the loan runs before it balloons. */
  loanTermYears: number | null;

  /** The fixed rate the swap was struck at, in percent. */
  contractRatePct: number | null;
  /** The swap's own term, which need not be the loan's. */
  swapTermYears: number | null;
  /** How long ago it was struck, in months. */
  monthsElapsed: number | null;
  /** Does the notional amortise with the loan, or stay flat? */
  notional: "amortising" | "flat";

  /** Today's swap rate for the remaining term — the market's price. */
  marketRatePct: number | null;
  /** What a cap to the same term would have cost, for the comparison. */
  capPremium: number | null;
};

export type SwapRead = {
  /** The coupon the loan actually pays: swap rate plus spread. */
  allInRatePct: number | null;
  /** What the market would fix the same remaining term at, all in. */
  marketAllInRatePct: number | null;
  /** Signed: positive where the swap is an asset, negative a liability. */
  markToMarket: number | null;
  /** The same figure said as what it is — the cheque to get out. */
  breakageCost: number | null;
  /** Months left on the swap. */
  monthsRemaining: number | null;
  /** The rate difference being paid, in basis points, signed. */
  rateGapBps: number | null;
  /** A year of that difference, before discounting. */
  annualCostOfBeingWrong: number | null;
  /** Notional still on the swap at the horizon. */
  notionalAtHorizon: number | null;
  /** Loan balance at the same date. */
  balanceAtHorizon: number | null;
  /** Notional over the balance — hedging debt that has been repaid. */
  overHedgedFromAmortisation: number | null;
  /** Months the swap runs on after the loan balloons. */
  nakedMonths: number | null;
  /** The naked position's own notional. */
  nakedNotional: number | null;
  /** What the same protection would have cost as a cap. */
  capPremium: number | null;
  /** The cap's worst case against the swap's position today. */
  capWouldHaveCostLess: boolean | null;
  /** The finding the structure was chosen to avoid. */
  sameShapeAsYieldMaintenance: boolean;
  note: string;
};

const EMPTY: Omit<SwapRead, "note"> = {
  allInRatePct: null,
  marketAllInRatePct: null,
  markToMarket: null,
  breakageCost: null,
  monthsRemaining: null,
  rateGapBps: null,
  annualCostOfBeingWrong: null,
  notionalAtHorizon: null,
  balanceAtHorizon: null,
  overHedgedFromAmortisation: null,
  nakedMonths: null,
  nakedNotional: null,
  capPremium: null,
  capWouldHaveCostLess: null,
  sameShapeAsYieldMaintenance: false,
};

/**
 * The loan's balance month by month, from the schedule `debt-math` runs.
 *
 * Through `readDebt` rather than a second amortisation here, so the swap
 * card and the loan card can never disagree about what is outstanding —
 * the same reason `irr` only ever comes from `lib/underwrite/engine`.
 * `readDebt` reports a year at a time, so the months inside a year are
 * interpolated linearly across that year's principal; the error is under a
 * dollar on a monthly balance and the alternative is a duplicate schedule.
 */
function balanceAt(t: SwapTerms, month: number): number | null {
  if (!positive(t.loanAmount)) return null;
  if (month <= 0) return t.loanAmount;
  // Run the schedule to whichever of the loan and the swap lasts longer.
  //
  // An amortising swap's notional schedule is fixed at inception and does
  // not stop when the loan balloons — it keeps stepping down on its own
  // terms. Building the schedule only to the loan's term made the notional
  // FLATLINE at the balloon balance, which overstated the naked position
  // in rule 4's second case, the one figure that case exists to report.
  const loanYears = positive(t.loanTermYears) ? t.loanTermYears : null;
  const swapYears = positive(t.swapTermYears) ? t.swapTermYears : null;
  const runTo =
    loanYears === null ? swapYears : swapYears === null ? loanYears : Math.max(loanYears, swapYears);
  const d = readDebt({
    loan: t.loanAmount,
    ratePct:
      real(t.contractRatePct) && real(t.spreadPct)
        ? t.contractRatePct + t.spreadPct
        : (t.contractRatePct ?? 0),
    amortYears: positive(t.amortYears) ? t.amortYears : null,
    ioYears: positive(t.ioYears) ? t.ioYears : 0,
    termYears: runTo,
  });
  if (d.years.length === 0) return t.loanAmount;
  const year = Math.ceil(month / 12);
  if (year > d.years.length) return d.years[d.years.length - 1].closing;
  const row = d.years[year - 1];
  const into = ((month - 1) % 12) + 1;
  return row.opening + (row.closing - row.opening) * (into / 12);
}

export function readSwap(t: SwapTerms): SwapRead {
  if (!positive(t.loanAmount)) {
    return { ...EMPTY, note: "Give the loan the swap sits on — the notional follows it." };
  }
  if (!real(t.contractRatePct)) {
    return { ...EMPTY, note: "Give the fixed rate the swap was struck at." };
  }
  if (!real(t.marketRatePct)) {
    return {
      ...EMPTY,
      note: "Give today's swap rate for the remaining term — the whole position is the difference between it and the struck rate.",
    };
  }
  if (!positive(t.swapTermYears)) {
    return { ...EMPTY, note: "Give the swap's own term; it need not be the loan's." };
  }
  if (t.swapTermYears > MAX_TERM_YEARS) {
    return {
      ...EMPTY,
      note: `${withArticle(String(t.swapTermYears), true)}-year swap is a typo rather than a term — nothing past ${MAX_TERM_YEARS} years is run.`,
    };
  }

  const spread = real(t.spreadPct) ? t.spreadPct : 0;
  const elapsed = real(t.monthsElapsed) && t.monthsElapsed > 0 ? Math.floor(t.monthsElapsed) : 0;
  const swapMonths = Math.round(t.swapTermYears * 12);
  const monthsRemaining = Math.max(0, swapMonths - elapsed);

  // Rule 3: the swap fixes the index; the spread is the loan's.
  const allIn = t.contractRatePct + spread;
  const marketAllIn = t.marketRatePct + spread;
  const gapBps = (t.marketRatePct - t.contractRatePct) * 100;

  // Rules 1 and 2. The position is the present value of the rate
  // difference over whatever notional is still on the swap, discounted at
  // today's rate — which is the breakage cheque, to the dollar.
  //
  // Signed from the PAYER's side: the payer pays fixed and receives
  // floating, so a market rate ABOVE the struck rate is money coming in.
  const monthlyDiscount = t.marketRatePct / 100 / 12;
  let pv = 0;
  let notionalAtHorizon: number | null = null;
  for (let m = 1; m <= monthsRemaining; m += 1) {
    const at = elapsed + m;
    const notional =
      t.notional === "flat" ? t.loanAmount : (balanceAt(t, at) ?? t.loanAmount);
    const cash = (notional * ((t.marketRatePct - t.contractRatePct) / 100)) / 12;
    pv += cash / (1 + monthlyDiscount) ** m;
    if (m === monthsRemaining) notionalAtHorizon = notional;
  }
  if (monthsRemaining === 0) notionalAtHorizon = 0;

  const mtm = round(pv);

  // Rule 4, the first way: a flat notional against a loan that amortises.
  const balanceAtHorizon =
    monthsRemaining > 0 ? balanceAt(t, elapsed + monthsRemaining) : balanceAt(t, elapsed);
  const overHedged =
    notionalAtHorizon === null || balanceAtHorizon === null
      ? null
      : Math.max(0, round(notionalAtHorizon - balanceAtHorizon));

  // Rule 4, the second way: a swap that outlives the loan. The loan is
  // gone by then, which is exactly why nobody has a model of it.
  const loanMonths = positive(t.loanTermYears) ? Math.round(t.loanTermYears * 12) : null;
  const naked = loanMonths === null ? null : Math.max(0, swapMonths - loanMonths);
  const nakedNotional =
    naked === null || naked === 0
      ? null
      : t.notional === "flat"
        ? t.loanAmount
        : (balanceAt(t, loanMonths as number) ?? t.loanAmount);

  // A year of the rate difference, on the notional outstanding TODAY.
  //
  // Struck against the original loan amount it read $300,000 flat on a
  // notional that had already amortised below it — the figure a reader
  // would set against this year's NOI, overstated by exactly the
  // principal repaid so far.
  const notionalNow = t.notional === "flat" ? t.loanAmount : (balanceAt(t, elapsed) ?? t.loanAmount);
  const annualCost =
    monthsRemaining === 0
      ? 0
      : round((notionalNow * (t.contractRatePct - t.marketRatePct)) / 100);

  const cap = positive(t.capPremium) ? t.capPremium : null;

  const read: Omit<SwapRead, "note"> = {
    allInRatePct: round(allIn, 2),
    marketAllInRatePct: round(marketAllIn, 2),
    markToMarket: mtm,
    // The cheque to get out is the position with its sign turned round:
    // an asset is received, a liability is paid.
    breakageCost: round(-mtm),
    monthsRemaining,
    rateGapBps: round(gapBps),
    annualCostOfBeingWrong: annualCost,
    notionalAtHorizon: notionalAtHorizon === null ? null : round(notionalAtHorizon),
    balanceAtHorizon: balanceAtHorizon === null ? null : round(balanceAtHorizon),
    overHedgedFromAmortisation: overHedged,
    nakedMonths: naked,
    nakedNotional: nakedNotional === null ? null : round(nakedNotional),
    capPremium: cap,
    // The comparison only means anything where a cap was priced: the cap's
    // WHOLE cost is its premium, so it beats the swap wherever the swap is
    // under water by more than the premium.
    capWouldHaveCostLess: cap === null ? null : -mtm > cap,
    // Rule 2's finding, and the reason the card exists: a swap under water
    // is the same exit problem as yield maintenance on a fixed loan, which
    // is what floating-plus-swap was chosen to avoid.
    sameShapeAsYieldMaintenance: mtm < 0 && monthsRemaining > 0,
  };

  return { ...read, note: noteFor(read, t) };
}

function usd(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

function years(months: number): string {
  const y = months / 12;
  return y >= 1 ? `${round(y, 1)} years` : `${months} months`;
}

function noteFor(x: Omit<SwapRead, "note">, t: SwapTerms): string {
  // An expired swap first, or every figure below describes a position
  // that no longer exists. Before this branch it fell through to rule 3's
  // sentence and reported the coupon of a loan whose hedge had run off.
  if (x.monthsRemaining === 0) {
    return `The swap has run its term — there is nothing left to mark, and the loan is back on the floating index at a spread of ${real(t.spreadPct) ? t.spreadPct : 0}%. What it settled to over its life is spent; what matters now is whether the exposure is being hedged again.`;
  }

  // Rule 4's second case: a swap with no loan under it is not a hedge at
  // all, which outranks any question of what it is worth.
  if (x.nakedMonths !== null && x.nakedMonths > 0 && x.nakedNotional !== null) {
    return `The swap runs ${years(x.nakedMonths)} past the loan's balloon, so for that stretch ${usd(x.nakedNotional)} of notional is settling in cash against a building with no debt on it. That is a rate position, not a hedge, and it is the one nobody models — the loan is gone by then and so is the spreadsheet.`;
  }

  // Then rule 2, which is the finding the card was built for.
  if (x.sameShapeAsYieldMaintenance && x.breakageCost !== null && x.rateGapBps !== null) {
    return `Rates have fallen ${Math.abs(x.rateGapBps)}bp below the struck rate, so terminating costs ${usd(x.breakageCost)} — a cheque at closing, on top of everything else, and the reason a hedged building can be hard to sell. That is the SAME exit problem yield maintenance creates on a fixed-rate loan, in the same rate direction: floating-plus-swap was chosen over fixed for its flexibility and has none.`;
  }

  if (x.overHedgedFromAmortisation !== null && x.overHedgedFromAmortisation > 0) {
    return `The notional stays flat while the loan amortises, so by the swap's end ${usd(x.overHedgedFromAmortisation)} of it sits over the balance — fixed payments on debt already repaid. An amortising notional costs nothing to ask for and is the whole fix.`;
  }

  if (x.markToMarket !== null && x.markToMarket > 0 && x.rateGapBps !== null) {
    return `Rates have risen ${x.rateGapBps}bp above the struck rate, so the swap is an ASSET worth ${usd(x.markToMarket)} — it comes back at a sale rather than costing anything, which is the half of the instrument that gets remembered. The other half is what the same position looks like after a cut.`;
  }

  if (x.allInRatePct !== null && x.marketAllInRatePct !== null) {
    return `The loan pays ${x.allInRatePct}% all in — the swap fixes the index and the lender's spread rides on top, so the struck rate is never the coupon. Today's market would fix the remainder at ${x.marketAllInRatePct}%.`;
  }

  return "Give the swap's terms and today's rate for the remaining period.";
}
