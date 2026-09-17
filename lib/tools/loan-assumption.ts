/**
 * Taking over the seller's loan.
 *
 * The other half of `prepayment`. That card asks what it costs to get OUT of
 * a loan early; this one asks what it is worth to step INTO one somebody
 * else signed — and in a market where a 2021 coupon sits three points under
 * today's, that is the question deciding which buildings trade at all.
 *
 * A broker marketing an assumable loan quotes the rate. Four things the rate
 * does not say.
 *
 * Rule 1. THE RATE BENEFIT AND THE EQUITY COST PULL OPPOSITE WAYS, AND ONLY
 * ONE OF THEM GETS QUOTED. The seller's loan has been amortising for years
 * and the building has appreciated since, so the balance is well under what
 * a new loan would advance — assuming it is a LARGER cheque, not a smaller
 * one. On the seed, $2,376,000 more equity against $333,000 a year of saved
 * debt service. Neither figure answers the question on its own, so the
 * module runs BOTH COMPLETE POSITIONS — equity in, cash out, balance
 * retired at the exit — and reports the two levered returns.
 *
 * Rule 2. YOU ARE BUYING THE OVERLAP, NOT THE TERM. The loan is worth what
 * it covers of YOUR hold and not one year more: on the seed the premium is
 * $934,223 at five years remaining and EXACTLY THE SAME at seven and at ten,
 * because the building is sold at five either way. Below the hold it falls
 * roughly with the overlap — $130,918 at one year, $363,766 at two — so a
 * term shorter than the hold is the case that costs money and a term longer
 * than it is the case sellers over-market. When the loan balloons inside the
 * hold the buyer refinances AT THE MARKET RATE for the remainder, the same
 * balance, so the refinance is the minimum one and the comparison stays a
 * question about rate rather than about a second sizing decision.
 *
 * (The obvious version of this rule — a remaining term at which assuming
 * first beats a new loan — was written here first and the probe killed it:
 * on the seed assuming wins at every term including one year, so the
 * "break-even" was 1 and said nothing at all.)
 *
 * Rule 3. THE ASSUMPTION FEE IS A USE FUNDED AT CLOSING, never a reduction
 * of the loan — `sources-uses`' rule, and the same error that hides a loan
 * fee in a screening model hides this one.
 *
 * Rule 4. THE ASSUMPTION BUYS COVERAGE AS WELL AS RATE. 1.91× against 1.21×
 * on the seed. On a deal where a new loan barely clears the lender's test,
 * the old one is not the cheaper deal — it is the only deal, and that does
 * not show up in an IRR at all.
 *
 * The headline is `pricePremium`: the extra price at which assuming leaves
 * the buyer exactly where a new loan would at the asking price. SOLVED by
 * bisection rather than approximated, because the price moves the new loan,
 * the equity and the exit together. It is the number to negotiate with, and
 * the reason to: a seller who does not ask for it hands it over.
 *
 * Pure, no I/O. Rates are percentages. The schedules come from `readDebt`
 * and the rate from `irr` in `lib/underwrite/engine` — the one behind the
 * Excel export — so this card cannot disagree with the workbook.
 */

import { irr } from "../underwrite/engine";
import { readDebt } from "./debt-math";

/** How far the price search will look, as a multiple of the asking price. */
const PRICE_SEARCH_CEILING = 2;

/** Bisection steps — 40 halvings resolves a $20M price to under a cent. */
const STEPS = 40;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function nonNegative(n: number | null | undefined): n is number {
  return real(n) && n >= 0;
}

export interface AssumptionTerms {
  /** what the seller is asking */
  price: number | null;
  /** year-one net operating income */
  noi: number | null;
  /** NOI growth, in % a year */
  noiGrowthPct?: number | null;
  /** the cap rate the building is sold at */
  exitCapPct: number | null;
  /** how long it is held, in years */
  holdYears: number | null;
  /** closing costs, as a % of the price — `sources-uses`' rule */
  closingCostPct?: number | null;

  /** the seller's outstanding balance */
  assumedBalance: number | null;
  /** its coupon, in % */
  assumedRatePct: number | null;
  /** the amortisation it has left to run, in years */
  assumedAmortYears: number | null;
  /** years until its balloon — rule 2 */
  assumedRemainingYears: number | null;
  /** the lender's fee to consent, as a % of the balance — rule 3 */
  assumptionFeePct?: number | null;

  /** today's lending rate, in % */
  marketRatePct: number | null;
  /** what a new loan would advance, as a % of the price */
  newLoanLtvPct: number | null;
  /** its amortisation, in years */
  newLoanAmortYears?: number | null;
  /** its origination fee, as a % of the loan */
  newLoanFeePct?: number | null;
}

/** One path's whole position. */
export interface Position {
  loan: number;
  equity: number;
  /** year one, which is the one a lender tests */
  debtService: number;
  dscr: number | null;
  balanceAtExit: number;
  netSaleProceeds: number;
  irrPct: number | null;
  /** true when this path had to refinance before the exit — rule 2 */
  refinanced: boolean;
}

export interface AssumptionRead {
  assume: Position | null;
  newLoan: Position | null;
  /** rule 1 — the two halves, each on its own */
  extraEquity: number | null;
  annualDebtServiceSaved: number | null;
  /** the answer: the gap between the two complete positions */
  irrGapPts: number | null;
  /** rule 4 */
  dscrGap: number | null;
  /** the headline — solved, not approximated */
  pricePremium: number | null;
  pricePremiumPctOfPrice: number | null;
  /** rule 2 — the overlap between the loan's term and the hold */
  yearsThatCount: number | null;
  termExceedsHold: boolean | null;
  assumptionFee: number | null;
  note: string | null;
}

const EMPTY: AssumptionRead = {
  assume: null,
  newLoan: null,
  extraEquity: null,
  annualDebtServiceSaved: null,
  irrGapPts: null,
  dscrGap: null,
  pricePremium: null,
  pricePremiumPctOfPrice: null,
  yearsThatCount: null,
  termExceedsHold: null,
  assumptionFee: null,
  note: null,
};

/** The NOI year by year, which both paths share. */
function noiSeries(noi: number, growth: number, years: number): number[] {
  return Array.from({ length: years }, (_, i) => noi * Math.pow(1 + growth, i));
}

/**
 * One complete position: the cheque in, the cash out each year, and the sale.
 *
 * `loanRate` and `loanTerm` describe the debt as signed. Where the term ends
 * before the hold does, the balance is refinanced AT THE MARKET RATE for the
 * remainder — the same balance, so nothing is taken out and the comparison
 * stays about the rate (rule 2).
 */
function runPosition(
  price: number,
  loan: number,
  ratePct: number,
  amortYears: number,
  termYears: number,
  upfrontFee: number,
  closingCost: number,
  noi: number[],
  hold: number,
  exitCap: number,
  marketRatePct: number,
): Position | null {
  // Rule 3. The fee is a USE at closing, so it goes INTO the cheque — it is
  // never netted out of the loan, which would understate both.
  const equity = price + closingCost + upfrontFee - loan;

  const first = readDebt({
    loan,
    ratePct,
    amortYears,
    termYears: Math.max(1, Math.round(Math.min(termYears, hold))),
  });
  if (first.years.length === 0) return null;

  const rows = [...first.years];
  const refinanced = termYears < hold;
  if (refinanced) {
    // The minimum refinance: retire the balloon and nothing more, at
    // today's rate, over whatever amortisation is left.
    const balance = first.years.at(-1)!.closing;
    const yearsLeft = Math.round(hold - Math.round(termYears));
    const after = readDebt({
      loan: balance,
      ratePct: marketRatePct,
      amortYears: Math.max(1, amortYears - Math.round(termYears)),
      termYears: Math.max(1, yearsLeft),
    });
    rows.push(...after.years);
  }

  const flows: number[] = [-equity];
  for (let y = 1; y <= hold; y += 1) {
    const row = rows[y - 1];
    const ds = row ? row.debtService : 0;
    flows.push(noi[y - 1] - ds);
  }

  // The exit capitalises the FORWARD NOI — `what-you-believe`'s rule.
  const forward = noi[hold - 1] * (noi.length > 1 ? noi[1] / noi[0] : 1);
  const saleValue = exitCap > 0 ? forward / exitCap : 0;
  const balanceAtExit = rows[hold - 1] ? rows[hold - 1].closing : 0;
  const netSale = saleValue - balanceAtExit;
  flows[hold] += netSale;

  const ds1 = rows[0] ? rows[0].debtService : 0;
  const rate = irr(flows);
  return {
    loan,
    equity,
    debtService: ds1,
    dscr: ds1 > 0 ? noi[0] / ds1 : null,
    balanceAtExit,
    netSaleProceeds: netSale,
    irrPct: rate === null ? null : rate * 100,
    refinanced,
  };
}

/** Both paths at a given price — the shape the premium search bisects on. */
function bothAt(t: AssumptionTerms, price: number, hold: number): {
  assume: Position | null;
  newLoan: Position | null;
} | null {
  if (
    !positive(t.noi) ||
    !positive(t.exitCapPct) ||
    !positive(t.assumedBalance) ||
    !nonNegative(t.assumedRatePct) ||
    !positive(t.assumedAmortYears) ||
    !positive(t.assumedRemainingYears) ||
    !nonNegative(t.marketRatePct) ||
    !positive(t.newLoanLtvPct)
  ) {
    return null;
  }
  const growth = nonNegative(t.noiGrowthPct) ? t.noiGrowthPct / 100 : 0;
  const noi = noiSeries(t.noi, growth, hold + 1);
  const closing = price * ((nonNegative(t.closingCostPct) ? t.closingCostPct : 0) / 100);
  const exitCap = t.exitCapPct / 100;
  const amort = positive(t.newLoanAmortYears) ? t.newLoanAmortYears : 30;

  const assumptionFee =
    t.assumedBalance * ((nonNegative(t.assumptionFeePct) ? t.assumptionFeePct : 0) / 100);
  const assume = runPosition(
    price,
    t.assumedBalance,
    t.assumedRatePct,
    t.assumedAmortYears,
    t.assumedRemainingYears,
    assumptionFee,
    closing,
    noi,
    hold,
    exitCap,
    t.marketRatePct,
  );

  const newAmount = price * (t.newLoanLtvPct / 100);
  const newFee = newAmount * ((nonNegative(t.newLoanFeePct) ? t.newLoanFeePct : 0) / 100);
  const newLoan = runPosition(
    price,
    newAmount,
    t.marketRatePct,
    amort,
    hold,
    newFee,
    closing,
    noi,
    hold,
    exitCap,
    t.marketRatePct,
  );

  return { assume, newLoan };
}

export function readAssumption(t: AssumptionTerms): AssumptionRead {
  if (!positive(t.price)) return { ...EMPTY, note: "Enter the asking price." };
  if (!positive(t.noi)) return { ...EMPTY, note: "Enter the year-one NOI." };
  if (!positive(t.assumedBalance) || !nonNegative(t.assumedRatePct)) {
    return { ...EMPTY, note: "Enter the seller's outstanding balance and its coupon." };
  }
  if (!nonNegative(t.marketRatePct) || !positive(t.newLoanLtvPct)) {
    return { ...EMPTY, note: "Enter today's lending rate and what a new loan would advance." };
  }
  if (!positive(t.holdYears) || Math.round(t.holdYears) < 1) {
    return { ...EMPTY, note: "Enter a hold of at least a year." };
  }

  const hold = Math.round(t.holdYears);
  const base = bothAt(t, t.price, hold);
  if (base === null || base.assume === null || base.newLoan === null) {
    return { ...EMPTY, note: "Enter the loan's remaining term, its amortisation and the exit cap." };
  }
  const { assume, newLoan } = base;

  const assumptionFee =
    t.assumedBalance * ((nonNegative(t.assumptionFeePct) ? t.assumptionFeePct : 0) / 100);

  // Rule 1's two halves, each stated on its own so neither can stand in for
  // the answer.
  const extraEquity = assume.equity - newLoan.equity;
  const saved = newLoan.debtService - assume.debtService;
  const gap =
    assume.irrPct === null || newLoan.irrPct === null ? null : assume.irrPct - newLoan.irrPct;

  // The headline. The price moves the new loan, the equity and the exit
  // together, so it is BISECTED: the price at which assuming returns what a
  // new loan returns at the asking price. Monotone decreasing in price, the
  // same property `readBid` asserts rather than assumes.
  const target = newLoan.irrPct;
  let premium: number | null = null;
  if (target !== null && assume.irrPct !== null && assume.irrPct > target) {
    let lo = t.price;
    let hi = t.price * PRICE_SEARCH_CEILING;
    const at = (p: number) => bothAt(t, p, hold)?.assume?.irrPct ?? null;
    const top = at(hi);
    // Only solve inside a bracket that actually contains the crossing;
    // a premium past the ceiling is refused rather than reported as one.
    if (top !== null && top <= target) {
      for (let i = 0; i < STEPS; i += 1) {
        const mid = (lo + hi) / 2;
        const v = at(mid);
        if (v === null) break;
        if (v > target) lo = mid;
        else hi = mid;
      }
      premium = (lo + hi) / 2 - t.price;
    }
  }

  // Rule 2. The overlap, which is all that is being bought. A term past the
  // hold adds nothing at all — the building is sold either way — so the two
  // figures below are stated rather than searched for.
  const remaining = Math.round(t.assumedRemainingYears ?? 0);
  const yearsThatCount = remaining > 0 ? Math.min(remaining, hold) : null;
  const termExceedsHold = remaining > 0 ? remaining > hold : null;

  const x: AssumptionRead = {
    assume: round(assume),
    newLoan: round(newLoan),
    extraEquity: r0(extraEquity),
    annualDebtServiceSaved: r0(saved),
    irrGapPts: gap === null ? null : r1(gap),
    dscrGap:
      assume.dscr === null || newLoan.dscr === null ? null : r2(assume.dscr - newLoan.dscr),
    pricePremium: premium === null ? null : r0(premium),
    pricePremiumPctOfPrice: premium === null ? null : r1((premium / t.price) * 100),
    yearsThatCount,
    termExceedsHold,
    assumptionFee: r0(assumptionFee),
    note: null,
  };
  return { ...x, note: noteFor(x, t) };
}

function round(p: Position): Position {
  return {
    loan: r0(p.loan),
    equity: r0(p.equity),
    debtService: r0(p.debtService),
    dscr: p.dscr === null ? null : r2(p.dscr),
    balanceAtExit: r0(p.balanceAtExit),
    netSaleProceeds: r0(p.netSaleProceeds),
    irrPct: p.irrPct === null ? null : r1(p.irrPct),
    refinanced: p.refinanced,
  };
}

/**
 * The one sentence. It leads with the premium, because that is the figure to
 * negotiate with and the one a seller who has not computed it gives away.
 */
function noteFor(x: AssumptionRead, t: AssumptionTerms): string {
  if (x.pricePremium !== null && x.pricePremium > 0 && x.extraEquity !== null) {
    // Where the term outlasts the hold, the overlap belongs in the same
    // sentence rather than a branch below it that the premium would always
    // outrank — the premium already prices only the overlap, and saying so
    // is what stops a buyer paying twice for years they will not own.
    const over =
      x.termExceedsHold === true && x.yearsThatCount !== null
        ? ` Only ${x.yearsThatCount} of its remaining years are being bought — the term past the hold adds nothing to that figure.`
        : "";
    return `The loan is worth ${usd(x.pricePremium)} of price — ${x.pricePremiumPctOfPrice}% — even though assuming it takes ${usd(Math.abs(x.extraEquity))} ${x.extraEquity > 0 ? "MORE" : "less"} equity than a new one. A seller who does not ask for that hands it over.${over}`;
  }
  if (x.irrGapPts !== null && x.irrGapPts < 0 && x.extraEquity !== null && x.extraEquity > 0) {
    // Never "the coupon saves": on a loan at or near today's rate the whole
    // saving is the smaller balance, and crediting the rate for it is the
    // error this card exists to correct.
    return `Assuming returns ${Math.abs(x.irrGapPts)} points LESS than a new loan here: debt service is ${usd(x.annualDebtServiceSaved ?? 0)} a year lower and the cheque is ${usd(x.extraEquity)} larger, and the equity wins. The rate on its own never says that.`;
  }
  if (x.assume?.refinanced) {
    return `The loan balloons ${t.assumedRemainingYears} ${Math.round(t.assumedRemainingYears ?? 0) === 1 ? "year" : "years"} in, inside the hold, so most of what is being marketed is refinanced at today's rate before the sale — which is why a short remaining term is worth so little.`;
  }
  if (x.irrGapPts !== null) {
    return `Assuming returns ${Math.abs(x.irrGapPts)} points ${x.irrGapPts >= 0 ? "more" : "less"} than a new loan, on ${usd(Math.abs(x.extraEquity ?? 0))} ${(x.extraEquity ?? 0) >= 0 ? "more" : "less"} equity.`;
  }
  return "Enter the loan's remaining term and the exit cap to compare the two positions.";
}

function usd(n: number): string {
  const a = Math.abs(n);
  return a >= 1_000_000
    ? `$${(a / 1_000_000).toFixed(2)}M`
    : `$${Math.round(a).toLocaleString("en-US")}`;
}

function rnd(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

const r0 = (n: number) => rnd(n, 0);
const r1 = (n: number) => rnd(n, 1);
const r2 = (n: number) => rnd(n, 2);
