// Whether to sell it now or hold another year — PURE.
//
// The question every owner eventually asks, answered almost everywhere with
// the wrong number. A deal's lifetime IRR is an average over the whole hold
// and it is dominated by what ALREADY HAPPENED — the year the market
// re-rated, the year the renovation landed. It says nothing about next
// year, and a building can be sitting at a 17% lifetime IRR while the next
// twelve months earn six.
//
// Five rules.
//
// 1. THE DECISION IS MARGINAL, NEVER AVERAGE. What matters is the return on
//    holding for ONE more year: the cash the building throws off, plus the
//    change in what you could walk away with, over what you could walk away
//    with today. The lifetime IRR cannot fall below the reinvestment rate
//    for years after the marginal return has.
//
// 2. THE CAPITAL AT STAKE IS THE NET SALE PROCEEDS. Not the property's
//    value (that ignores the debt), not your original equity (that ignores
//    that the market moved). It is price, less the cost of selling, less
//    the loan payoff, less any prepayment penalty and tax — the cheque you
//    would actually receive, which is the money that has an opportunity
//    cost.
//
// 3. SELLING COSTS ARE PAID WHENEVER YOU SELL. They are in both sides of
//    the comparison and therefore mostly cancel; charging their full amount
//    against the hold year is the common error and it makes holding look
//    far better than it is. What holding actually buys is the DEFERRAL,
//    which is worth the return on that money for a year and nothing more.
//
// 4. THE MARGINAL RETURN DECAYS. Cash flow grows with rents; the value
//    grows with the NOI; but the equity in the denominator grows FASTER
//    than either, because the loan amortises and the value rises on top.
//    So a good deal becomes a mediocre hold on its own, without anything
//    going wrong — which is why the answer is a year rather than a verdict,
//    and why the module runs a schedule instead of one comparison.
//
// 5. THE HURDLE IS WHAT ELSE YOU WOULD DO WITH THE MONEY. That is an input.
//    This module will not tell anyone what their reinvestment rate is.
//
// The exit value capitalises the FORWARD NOI — next year's, what the buyer
// is purchasing — which is `what-you-believe`'s rule, and the loan balance
// comes from `readDebt`, the schedule behind the debt card and the Excel
// export. Neither is re-derived here.

import { readDebt } from "@/lib/tools/debt-math";

export interface HoldYear {
  /** 1 = hold one more year from today */
  year: number;
  /** the NOI the building earns over this year */
  noi: number;
  /** cash after debt service */
  cashFlow: number;
  /** what it would sell for at the end of this year */
  value: number;
  loanBalance: number;
  /** the cheque at the end of this year, after costs, payoff and tax */
  netProceeds: number;
  /**
   * The return on holding through this year — rule 1. Cash plus the change
   * in the cheque, over last year's cheque.
   */
  marginalReturnPct: number | null;
  /** whether that clears the reinvestment rate */
  clears: boolean | null;
}

export interface HoldResult {
  /** the cheque if you sold today — rule 2 */
  netProceedsNow: number | null;
  /** its pieces, for the card to draw */
  sellingCostNow: number | null;
  loanPayoffNow: number | null;
  years: HoldYear[];
  /**
   * The first year whose marginal return falls below the reinvestment rate
   * — the year to sell. Null when none of them does inside the horizon.
   */
  sellYear: number | null;
  /** the first year's marginal return, which is the "hold or sell now" answer */
  nextYearReturnPct: number | null;
  /**
   * The cap the current value implies against next year's NOI, so a
   * difference from the exit cap shows up as the claim it is.
   */
  impliedCapNowPct: number | null;
  /** exit cap less implied cap, in basis points; positive = the cap widens */
  capMovementBps: number | null;
  /**
   * What the naive comparison says — charging the whole cost of selling
   * against the hold year, as though holding avoided it — rule 3.
   */
  naiveNextYearReturnPct: number | null;
  note: string;
}

const EMPTY: HoldResult = {
  netProceedsNow: null,
  sellingCostNow: null,
  loanPayoffNow: null,
  years: [],
  sellYear: null,
  nextYearReturnPct: null,
  impliedCapNowPct: null,
  capMovementBps: null,
  naiveNextYearReturnPct: null,
  note: "Enter what it is worth today and what it earns next year.",
};

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const real = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
const positive = (n: number | null | undefined): n is number => real(n) && n > 0;

/** How far out the schedule runs. Past ten years it is a different deal. */
export const MAX_HORIZON = 10;

export interface HoldInput {
  /** what a broker says it would sell for today */
  currentValue: number;
  /** the NOI over the NEXT twelve months */
  nextYearNoi: number;
  /** how fast the NOI grows after that, as a percent */
  noiGrowthPct: number;
  /** the cap the next buyer pays, on the forward NOI */
  exitCapPct: number;
  /** brokerage and closing, as a percent of the price */
  sellingCostPct: number;
  /** what else the money would earn — the hurdle, rule 5 */
  reinvestmentRatePct: number;
  /** the loan today */
  loanBalance: number;
  ratePct: number;
  /** the amortisation period the payment is computed over */
  amortYears: number;
  /** what getting out of the loan costs today; it is paid whenever you sell */
  prepaymentPenalty?: number | null;
  /** tax due on a sale today — recapture and gain, from the after-tax card */
  taxOnSaleNow?: number | null;
  /** how many years forward to run */
  horizonYears?: number | null;
}

export function readHold(t: HoldInput): HoldResult {
  if (!positive(t.currentValue) || !real(t.nextYearNoi)) return EMPTY;
  if (!positive(t.exitCapPct)) {
    return { ...EMPTY, note: "Enter the cap the next buyer would pay." };
  }
  if (!real(t.sellingCostPct) || t.sellingCostPct < 0 || t.sellingCostPct >= 100) {
    return { ...EMPTY, note: "Selling costs are a percentage of the price." };
  }

  const horizon = positive(t.horizonYears)
    ? Math.min(Math.round(t.horizonYears), MAX_HORIZON)
    : 5;
  const growth = real(t.noiGrowthPct) ? t.noiGrowthPct / 100 : 0;
  const cap = t.exitCapPct / 100;
  const cost = t.sellingCostPct / 100;
  const penalty = positive(t.prepaymentPenalty) ? t.prepaymentPenalty : 0;
  const taxNow = positive(t.taxOnSaleNow) ? t.taxOnSaleNow : 0;
  const loan = positive(t.loanBalance) ? t.loanBalance : 0;

  // A loan whose schedule cannot be built is NOT a free loan. Without this
  // the debt service reads zero and the balance never moves, while the sale
  // proceeds still subtract the whole balance — a loan that costs nothing,
  // amortises nothing and is repaid anyway. Refuse rather than answer that.
  if (loan > 0 && !(real(t.ratePct) && t.ratePct >= 0 && positive(t.amortYears))) {
    return {
      ...EMPTY,
      note: "Enter the loan's rate and amortisation, or clear the balance — a loan with neither cannot be run.",
    };
  }

  // ONE amortisation schedule in this codebase. The loan card's `readDebt`
  // runs it monthly and reports a year at a time, which is exactly the
  // granularity this needs — re-deriving it here would give the page two
  // balances for one loan.
  //
  // The schedule runs to the HORIZON, not to the loan's own balloon: this
  // question is "what if I keep holding", and holding past a balloon means
  // refinancing, which is `testRefi`'s job on the debt card. So the balance
  // here keeps amortising on the current terms — the right assumption for a
  // hold decision and the wrong one for a financing decision.
  const debt =
    loan > 0 && real(t.ratePct) && positive(t.amortYears)
      ? readDebt({
          loan,
          ratePct: t.ratePct,
          amortYears: t.amortYears,
          termYears: horizon,
        })
      : null;
  const balanceAt = (year: number): number => {
    if (loan <= 0) return 0;
    if (!debt || debt.years.length === 0) return loan;
    const row = debt.years.find((y) => y.year === year);
    return row ? row.closing : debt.years[debt.years.length - 1].closing;
  };
  const debtServiceIn = (year: number): number => {
    if (!debt) return 0;
    const row = debt.years.find((y) => y.year === year);
    return row ? row.debtService : 0;
  };

  // Rule 2: the cheque, not the value and not the basis.
  const sellingCostNow = round(t.currentValue * cost);
  const netProceedsNow = round(t.currentValue - sellingCostNow - loan - penalty - taxNow);

  // A claim worth surfacing: today's value against next year's NOI implies a
  // cap, and any distance from the exit cap is an assumption about the
  // market rather than about the building.
  const impliedCapNowPct = round2((t.nextYearNoi / t.currentValue) * 100);
  const capMovementBps = round((t.exitCapPct - impliedCapNowPct) * 100);

  const years: HoldYear[] = [];
  let priorProceeds = netProceedsNow;
  for (let y = 1; y <= horizon; y++) {
    // The NOI earned over year y.
    const noi = round(t.nextYearNoi * Math.pow(1 + growth, y - 1));
    const cashFlow = round(noi - debtServiceIn(y));
    // Rule: the exit capitalises the FORWARD NOI — what the buyer at the end
    // of year y is purchasing, which is year y+1's.
    const forwardNoi = t.nextYearNoi * Math.pow(1 + growth, y);
    const value = round(forwardNoi / cap);
    const loanBalance = round(balanceAt(y));
    // Rule 3: the cost of selling is charged at the sale, in both years, so
    // it is in both sides of the comparison and mostly cancels. The penalty
    // is not decayed here — a yield-maintenance figure is the prepayment
    // card's job, and guessing its path would be worse than holding it flat.
    const netProceeds = round(value - value * cost - loanBalance - penalty - taxNow);
    // Every displayed figure is rounded once and the return is taken from
    // the rounded pair, so the card's own arithmetic agrees with itself.
    const marginalReturnPct =
      priorProceeds > 0
        ? round1(((cashFlow + netProceeds - priorProceeds) / priorProceeds) * 100)
        : null;
    const clears =
      marginalReturnPct === null || !real(t.reinvestmentRatePct)
        ? null
        : marginalReturnPct >= t.reinvestmentRatePct;
    years.push({ year: y, noi, cashFlow, value, loanBalance, netProceeds, marginalReturnPct, clears });
    priorProceeds = netProceeds;
  }

  const first = years[0];
  const nextYearReturnPct = first ? first.marginalReturnPct : null;
  const below = years.find((y) => y.clears === false);
  const sellYear = below ? below.year : null;

  // Rule 3, priced. The error is comparing a figure NET of the cost of
  // selling today against a GROSS one next year — as though holding avoided
  // a cost you pay whenever you sell. So the naive numerator adds back the
  // hold year's OWN selling cost, which is the one actually forgotten. The
  // prepayment penalty is deliberately not added back: it is a headline
  // figure people remember, and the brokerage fee is the one that goes
  // missing.
  const naiveNextYearReturnPct =
    first && netProceedsNow > 0
      ? round1(
          ((first.cashFlow + (first.netProceeds + round(first.value * cost)) - netProceedsNow) /
            netProceedsNow) *
            100,
        )
      : null;

  let note: string;
  if (nextYearReturnPct === null) {
    note = "There is no equity to redeploy — the loan and the costs take the whole sale.";
  } else if (sellYear === 1) {
    note = `Holding one more year earns ${nextYearReturnPct}% on the ${fmtShort(netProceedsNow)} you could take out today. That is under the hurdle, so the year to sell is now.`;
  } else if (sellYear !== null) {
    note = `The marginal return clears the hurdle for ${sellYear - 1} more year${sellYear - 1 === 1 ? "" : "s"} and falls under it in year ${sellYear}. That is the year to sell, and the lifetime IRR will not say so for years afterwards.`;
  } else {
    note = `The marginal return stays above the hurdle for all ${horizon} years — nothing here says to sell yet.`;
  }

  return {
    netProceedsNow,
    sellingCostNow,
    loanPayoffNow: loan,
    years,
    sellYear,
    nextYearReturnPct,
    impliedCapNowPct,
    capMovementBps,
    naiveNextYearReturnPct,
    note,
  };
}

/** $12.4M — only for the note, where a full figure would swamp the sentence. */
function fmtShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
