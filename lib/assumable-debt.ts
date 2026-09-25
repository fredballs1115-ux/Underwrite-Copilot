// The seller's loan, offered for assumption (#417). A memorandum that
// offers the debt in place markets its rate — "3.45% fixed through 2029" —
// and the rate is half of what it means. This reads the loan's terms off
// the rows the extraction files them under and runs the /tools card's
// arithmetic (lib/tools/loan-assumption) on the deal's OWN model: its
// price, its year-1 NOI grown at its own rate over its hold, its exit cap,
// its closing costs, and its new loan — the model's amount at the model's
// rate, which is today's Treasury tenor plus the class spread wherever the
// rates table is fresh (lib/debt-index). So the comparison is between the
// loan in place and the loan the page already assumes the buyer takes.
//
// Pure: the model's inputs come in, nothing is read.
//
// Four rules, three of them the card's.
//
// THE RATE BENEFIT AND THE EQUITY COST PULL OPPOSITE WAYS. The balance has
// amortised and the building has appreciated since the loan was made, so
// the balance is under what a new loan advances and assuming it is the
// LARGER cheque. Both positions are run whole — equity in, cash out, the
// balance retired at the sale — and their returns set side by side.
//
// YOU ARE BUYING THE OVERLAP, NOT THE TERM. The loan is worth the years of
// it the hold uses; a balloon inside the hold is refinanced at today's
// rate, which is why a short remaining term is worth so little.
//
// THE FEE IS A USE funded at closing, never a cut to the loan — and a fee
// the memorandum does not state is taken as none, and said.
//
// A TERM THE OM DOES NOT STATE IS NOT INVENTED. No rate, no maturity, or
// neither an amortization nor a debt service: no comparison, and the card
// says which is missing. A stated debt service says how long the loan has
// left to amortise — the level payment on today's balance at the coupon —
// which a stated amortization cannot, since the memorandum rarely dates
// the loan; a stated amortization alone is run from today's balance, and
// said. An interest-only period beside an amortization, undated, is run
// amortizing: the reading that does not flatter the loan.

import { parsePageNumber } from "@/lib/facts";
import { interestOf } from "@/lib/interest";
import { parseUsd } from "@/lib/money";
import { monthsBetween, parseMaturity } from "@/lib/note-yield";
import { readAssumption, type AssumptionRead } from "@/lib/tools/loan-assumption";
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";

export interface AssumableTerms {
  /** today's unpaid balance, as stated */
  balance: number | null;
  /** the coupon, percent */
  ratePct: number | null;
  /** the maturity as an ISO date (lib/note-yield's reader); null where the
   *  OM states none, or only a year */
  maturity: string | null;
  /** true where the OM says interest-only; false where it states an
   *  amortization; null where it says neither — or both */
  interestOnly: boolean | null;
  /** the amortization in years, as stated */
  amortYears: number | null;
  /** the annual debt service, as stated (a monthly figure × 12) */
  debtService: number | null;
  /** the assumption fee as a percent of the balance — a dollar fee divided
   *  by the balance; null where the OM states none */
  feePct: number | null;
  /** the balance row's page, cited only inside the memorandum */
  page: string;
}

/** How the loan's payments were run from today, and why. */
export interface AssumableSchedule {
  /** the amortization the schedule runs on, years — on an interest-only
   *  loan, the one a refinance at its maturity would run on */
  amortYears: number;
  /** interest-only to maturity */
  interestOnly: boolean;
  /** the sentence that says how it was read */
  basis: string;
}

/** What the deal's own model hands the comparison. */
export interface ModelForAssumption {
  price: number;
  holdYears: number;
  /** year-1 NOI */
  noi: number;
  /** the model's NOI growth over its hold, percent a year (compounded) */
  noiGrowthPct: number;
  exitCapPct: number;
  /** closing costs and the acquisition fee, percent of the price */
  closingCostPct: number;
  /** the model's all-in rate, percent */
  marketRatePct: number;
  /** the model's new loan */
  newLoan: number;
  newLoanLtvPct: number;
  newLoanAmortYears: number;
  newLoanIoYears: number;
  newLoanFeePct: number;
}

export interface AssumableRead {
  terms: AssumableTerms;
  /** whole months from the reading's day to the stated maturity */
  monthsLeft: number | null;
  /** at or past its maturity on the reading's day */
  matured: boolean;
  /** the full years it runs at its coupon — the months left rounded DOWN,
   *  so a part-year is never run at the coupon (the reading that does not
   *  flatter the loan); null without a maturity */
  couponYears: number | null;
  schedule: AssumableSchedule | null;
  model: ModelForAssumption | null;
  /** today's rate less the coupon, basis points — positive where the loan
   *  is under the market */
  underMarketBps: number | null;
  /** the two positions, run whole — null where a term is missing */
  read: AssumptionRead | null;
  /** the terms the comparison needed and the memorandum did not state */
  missing: string[];
}

// ── Reading the terms ───────────────────────────────────────────────────

type MetricRows = { metrics?: Array<{ label: string; value: string; page?: string }>; totalPages?: number } | null | undefined;
type Extraction = Parameters<typeof interestOf>[0];

const LOAN = "assumable (?:loan|debt|mortgage|financing)";
const rowOf = (ex: MetricRows, re: RegExp, not?: RegExp) =>
  (ex?.metrics ?? []).find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

const money = (text: string): number | null => {
  const n = parseUsd(text);
  return n != null && n > 0 ? n : null;
};

const percentOf = (text: string): number | null => {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 25 ? n : null;
};

/**
 * The loan in place, from the rows the extraction is asked to label
 * "Assumable loan …" — null where the memorandum offers no loan for
 * assumption (no balance row), so a deal financed fresh reads nothing.
 */
export function readAssumableTerms(ex: MetricRows): AssumableTerms | null {
  const balanceRow = rowOf(
    ex,
    new RegExp(LOAN, "i"),
    /rate|coupon|maturity|matures|amorti[sz]|\bterm\b|fee|debt service|payment|interest[- ]only|\bi\/?o\b|ltv|loan[- ]to[- ]value|dscr/i,
  );
  const balance = balanceRow ? money(balanceRow.value) : null;
  if (!balanceRow || balance == null) return null;
  const rateRow = rowOf(ex, new RegExp(`${LOAN} (?:interest )?(?:rate|coupon)`, "i"));
  const maturityRow = rowOf(ex, new RegExp(`${LOAN} (?:maturity|matures)`, "i"), /extension|extended/i);
  const amortRow = rowOf(ex, new RegExp(`${LOAN} (?:amorti[sz]ation|interest[- ]only)`, "i"));
  const dsRow = rowOf(ex, new RegExp(`${LOAN} (?:annual )?(?:debt service|payment)`, "i"));
  const feeRow = rowOf(ex, /assumption fee/i);

  const amortText = amortRow?.value ?? "";
  const statesIo = /interest[- ]only|\bi\/?o\b/i.test(amortText);
  const yearsHit = amortText.match(/(\d{1,2})\s*(?:years?|yrs?|-year)/i);
  const monthsHit = amortText.match(/(\d{2,3})\s*(?:-month|months?|mos?\b)/i);
  const years = yearsHit ? Number(yearsHit[1]) : monthsHit && Number(monthsHit[1]) >= 60 ? Number(monthsHit[1]) / 12 : NaN;
  const amortYears = Number.isFinite(years) && years > 0 ? years : null;

  const dsRaw = dsRow ? money(dsRow.value) : null;
  const debtService = dsRaw != null && dsRow && /month|\/\s*mo\b/i.test(`${dsRow.label} ${dsRow.value}`) ? dsRaw * 12 : dsRaw;

  const feePctStated = feeRow ? percentOf(feeRow.value) : null;
  const feeDollars = feeRow && feePctStated == null ? money(feeRow.value) : null;

  const pageCount = typeof ex?.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const n = parsePageNumber(balanceRow.page);
  return {
    balance,
    ratePct: rateRow ? percentOf(rateRow.value) : null,
    maturity: maturityRow ? parseMaturity(maturityRow.value) : null,
    // Both stated is neither: the OM does not say when one gives way.
    interestOnly: statesIo ? (amortYears != null ? null : true) : amortYears != null ? false : null,
    amortYears,
    debtService,
    feePct: feePctStated ?? (feeDollars != null ? (feeDollars / balance) * 100 : null),
    page: n != null && pageCount != null && n <= pageCount ? `p. ${n}` : "",
  };
}

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");

/**
 * How the loan's payments run from today. A stated debt service decides
 * it — interest alone is interest-only, more is a level payment whose
 * years left the coupon and the balance solve for; failing that the OM's
 * own amortization or interest-only statement; failing both, nothing.
 */
export function scheduleOf(terms: AssumableTerms, fallbackAmortYears: number): AssumableSchedule | null {
  const { balance, ratePct, debtService } = terms;
  if (balance != null && ratePct != null && debtService != null) {
    const i = ratePct / 100 / 12;
    const pmt = debtService / 12;
    const interest = balance * i;
    if (Math.abs(pmt - interest) <= interest * 0.005) {
      return { amortYears: fallbackAmortYears, interestOnly: true, basis: "interest-only — the stated debt service is its interest alone" };
    }
    if (pmt > interest && i > 0) {
      const months = -Math.log(1 - interest / pmt) / Math.log(1 + i);
      const yrs = months / 12;
      if (yrs >= 1 && yrs <= 40) {
        return { amortYears: yrs, interestOnly: false, basis: `amortizing, with the ${oneDp(yrs)} years its stated debt service implies` };
      }
    }
  }
  if (terms.interestOnly === true) {
    return { amortYears: fallbackAmortYears, interestOnly: true, basis: "interest-only as stated" };
  }
  if (terms.amortYears != null && terms.interestOnly === false) {
    return {
      amortYears: terms.amortYears,
      interestOnly: false,
      basis: `amortizing over ${oneDp(terms.amortYears)} years from today's balance — the stated schedule, as if it began today`,
    };
  }
  if (terms.amortYears != null) {
    return {
      amortYears: terms.amortYears,
      interestOnly: false,
      basis: `run amortizing over its ${oneDp(terms.amortYears)} years — the memorandum states an interest-only period without dating its end, and amortizing is the reading that does not flatter the loan`,
    };
  }
  return null;
}

/**
 * What the deal's own model hands the comparison: its price, hold, year-1
 * NOI and the NOI's compounded growth over the hold, exit cap, closing
 * costs, and its new loan — amount, rate, amortization, interest-only and
 * fee. Null where the model has no price or no positive year-1 NOI.
 */
export function modelForAssumption(inputs: UnderwriteInputs): ModelForAssumption | null {
  if (!(inputs.purchasePrice > 0)) return null;
  const run = computeUnderwrite(inputs);
  const first = run.cashFlow[0]?.noi ?? 0;
  const last = run.cashFlow.at(-1)?.noi ?? 0;
  if (!(first > 0)) return null;
  const years = run.cashFlow.length;
  const growth = years > 1 && last > 0 ? (Math.pow(last / first, 1 / (years - 1)) - 1) * 100 : 0;
  const su = run.sourcesUses;
  return {
    price: inputs.purchasePrice,
    holdYears: run.holdYears,
    noi: first,
    noiGrowthPct: growth,
    exitCapPct: inputs.exitCapPct * 100,
    closingCostPct: ((su.closingCosts + su.acqFee) / inputs.purchasePrice) * 100,
    marketRatePct: inputs.allInRatePct * 100,
    newLoan: su.loanAmount,
    newLoanLtvPct: (su.loanAmount / inputs.purchasePrice) * 100,
    newLoanAmortYears: inputs.amortMonths / 12,
    // 999 months is the engine's full-term interest-only.
    newLoanIoYears: inputs.ioMonths >= 999 ? run.holdYears : inputs.ioMonths / 12,
    newLoanFeePct: inputs.financingCostPct * 100,
  };
}

/**
 * Whether the property's debt is the buyer's to take: where the price buys
 * the building — a fee simple, a leasehold, or an interest the memorandum
 * does not name. A note's, a share's or the land's buyer does not choose
 * the property's financing, so none of them is shown one to assume.
 */
export function assumableApplies(ex: Extraction): boolean {
  const { kind } = interestOf(ex);
  return kind === "fee_simple" || kind === "leasehold" || kind === "unknown";
}

/**
 * The loan in place against the model's new loan, on a day. Null where the
 * memorandum offers no loan for assumption, or where the price does not buy
 * the building (`assumableApplies`). Every figure is null where its own
 * terms are, and `missing` names what the comparison lacked.
 */
export function readAssumable(
  ex: Extraction,
  inputs: UnderwriteInputs | null,
  asOf: Date = new Date(),
): AssumableRead | null {
  if (!assumableApplies(ex)) return null;
  const terms = readAssumableTerms(ex as MetricRows);
  if (!terms) return null;
  const today = asOf.toISOString().slice(0, 10);
  const monthsLeft = terms.maturity ? monthsBetween(today, terms.maturity) : null;
  const matured = monthsLeft != null && monthsLeft < 1;
  const model = inputs ? modelForAssumption(inputs) : null;
  const schedule = scheduleOf(terms, model?.newLoanAmortYears ?? 30);
  const underMarketBps =
    model && terms.ratePct != null ? Math.round((model.marketRatePct - terms.ratePct) * 100) : null;

  const missing: string[] = [];
  if (terms.ratePct == null) missing.push("its rate");
  if (terms.maturity == null) missing.push("its maturity");
  if (!schedule) missing.push("its payment schedule");
  // The arithmetic runs in whole years (lib/tools/debt-math): a part-year
  // left at the end is refinanced with the rest rather than run at the
  // coupon, and a loan with under a year to run is a refinance, not an
  // assumption.
  const couponYears = monthsLeft != null && !matured ? Math.floor(monthsLeft / 12) : null;

  let read: AssumptionRead | null = null;
  if (model && terms.ratePct != null && couponYears != null && couponYears >= 1 && schedule) {
    const remainingYears = couponYears;
    const r = readAssumption({
      price: model.price,
      noi: model.noi,
      noiGrowthPct: model.noiGrowthPct,
      exitCapPct: model.exitCapPct,
      holdYears: model.holdYears,
      closingCostPct: model.closingCostPct,
      assumedBalance: terms.balance,
      assumedRatePct: terms.ratePct,
      assumedAmortYears: schedule.amortYears,
      assumedRemainingYears: remainingYears,
      // A full-term interest-only loan is interest-only for every year it
      // runs at its coupon.
      assumedIoYears: schedule.interestOnly ? remainingYears : 0,
      assumptionFeePct: terms.feePct ?? 0,
      marketRatePct: model.marketRatePct,
      newLoanLtvPct: model.newLoanLtvPct,
      newLoanAmortYears: model.newLoanAmortYears,
      newLoanIoYears: model.newLoanIoYears,
      newLoanFeePct: model.newLoanFeePct,
    });
    read = r.assume && r.newLoan ? r : null;
  }
  return { terms, monthsLeft, matured, couponYears, schedule, model, underMarketBps, read, missing };
}

// ── Saying it ───────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (isoDate: string) => {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
// Rounded on the tenths, never a float's toFixed.
export const assumableMoney = (n: number) =>
  Math.abs(n) >= 1e8
    ? `$${Math.round(n / 1e6)}M`
    : Math.abs(n) >= 1e6
      ? `$${(Math.round(n / 1e5) / 10).toFixed(1)}M`
      : Math.abs(n) >= 1e3
        ? `$${Math.round(n / 1e3)}k`
        : `$${Math.round(n)}`;
const pctText = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;

/** The loan as the memorandum states it, in one line: "$24.5M at 3.45% to
 *  Mar 2029, interest-only as stated". */
export function assumableTermsLine(a: AssumableRead): string {
  const t = a.terms;
  const bits = [`${assumableMoney(t.balance ?? 0)}`];
  if (t.ratePct != null) bits[0] += ` at ${pctText(t.ratePct)}`;
  if (t.maturity) bits[0] += ` to ${monthYear(t.maturity)}`;
  if (a.schedule) bits.push(a.schedule.basis);
  return bits.join(", ");
}

/**
 * The deal context's line (every Claude step after the extraction): the
 * loan as stated, and what its value turns on — never a rate alone.
 */
export function assumableContextLine(a: AssumableRead): string {
  return `The memorandum offers the seller's loan for assumption: ${assumableTermsLine(a)}. Its value to a buyer is the rate saved over the years of it the hold uses, against the larger equity cheque its smaller balance takes — never the rate alone.`;
}

/** The traps, for the challenger — appended to its notes. */
export function assumableNote(a: AssumableRead): string {
  return `${assumableContextLine(a)} ASSUMABLE-DEBT TRAPS, checked by name where the OM gives the inputs: (a) THE OVERLAP — the loan is worth only the years of it the hold uses, and a term past the sale adds nothing; (b) THE CHEQUE — an amortised balance is under what a new loan would advance, so assuming takes more equity, not less; (c) CONSENT — the lender must approve the buyer, charges a fee, and brings its covenants, reserves and cash management with the loan; (d) THE BALLOON — a maturity inside the hold is a refinance at the rate then, not the coupon; (e) THE EXIT — a defeasance or yield-maintenance clause can make the loan dear to leave at the sale, and the next buyer may not want to assume it.`;
}

/** Whole years, said: "5 years", "1 year". */
const yearsText = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

/**
 * The card's one sentence under the pictures: what is missing, or that the
 * loan has matured, or the answer the two positions give.
 */
export function assumableSentence(a: AssumableRead): string {
  if (a.matured && a.terms.maturity) {
    return `It is at or past its ${monthYear(a.terms.maturity)} maturity — a loan that has come due is refinanced, not assumed, so there is nothing to price against a new one.`;
  }
  if (a.couponYears === 0 && a.terms.maturity) {
    return `It comes due in ${monthYear(a.terms.maturity)}, inside a year — a loan that short is a refinance at today's rate, not an assumption, so there is nothing to price against a new one.`;
  }
  if (a.missing.length) {
    const list =
      a.missing.length === 1 ? a.missing[0] : `${a.missing.slice(0, -1).join(", ")} or ${a.missing[a.missing.length - 1]}`;
    return `It cannot be priced against a new loan: the memorandum does not state ${list}.`;
  }
  const r = a.read;
  if (!r || !a.model) return "The model this deal runs on is not ready, so the loan cannot be priced against its new loan yet.";
  const hold = `${a.model.holdYears}-year hold`;
  const overlap =
    r.yearsThatCount != null && r.termExceedsHold
      ? ` Only the ${yearsText(r.yearsThatCount)} of it the ${hold} uses count; the rest of its term is sold with the building.`
      : r.assume?.refinanced && a.terms.maturity && a.couponYears != null
        ? ` It comes due in ${monthYear(a.terms.maturity)}, inside the ${hold}, so it runs at its coupon for the ${a.couponYears} full ${
            a.couponYears === 1 ? "year" : "years"
          } before that and is refinanced at today's rate after.`
        : "";
  if (r.pricePremium != null && r.pricePremium > 0 && r.extraEquity != null) {
    return `Assuming it is worth ${assumableMoney(r.pricePremium)} of price (${oneDp(r.pricePremiumPctOfPrice ?? 0)}% of the ask) on the model's own figures, although it takes ${assumableMoney(Math.abs(r.extraEquity))} ${r.extraEquity >= 0 ? "more" : "less"} equity than the model's new loan.${overlap}`;
  }
  if (r.irrGapPts != null && r.irrGapPts <= 0) {
    return `Assuming it returns ${oneDp(Math.abs(r.irrGapPts))} points ${r.irrGapPts < 0 ? "less" : "no more"} than the model's new loan: the ${assumableMoney(Math.abs(r.annualDebtServiceSaved ?? 0))} a year it ${
      (r.annualDebtServiceSaved ?? 0) >= 0 ? "saves" : "costs"
    } in debt service does not pay for the ${assumableMoney(Math.abs(r.extraEquity ?? 0))} ${(r.extraEquity ?? 0) >= 0 ? "larger" : "smaller"} cheque.${overlap}`;
  }
  return `Assuming it returns ${oneDp(r.irrGapPts ?? 0)} points more than the model's new loan.${overlap}`;
}

// ── What the card draws ─────────────────────────────────────────────────

/**
 * The card's figures as plain data: the deal view is a client component,
 * and handing it this rather than the read keeps the engine and the /tools
 * arithmetic out of the browser bundle (metroDemand's rule).
 */
export interface AssumableView {
  termsLine: string;
  page: string;
  sentence: string;
  couponPct: number | null;
  /** the model's rate, percent */
  marketPct: number | null;
  /** where that rate came from: today's index plus the class spread, or
   *  the model's placeholder */
  rateLine: string | null;
  underMarketBps: number | null;
  dscrAssume: number | null;
  dscrNew: number | null;
  extraEquity: number | null;
  debtServiceSaved: number | null;
  irrGapPts: number | null;
  pricePremium: number | null;
  pricePremiumPct: number | null;
  feeLine: string | null;
  /** the small print under the figures: what the two positions were run on */
  basisLine: string | null;
}

/**
 * The view, from the read and the model's own rate note (`seeded`: whether
 * the rate came off today's rates table — a placeholder is said as one).
 */
export function assumableView(a: AssumableRead, rateNote: string | null, seeded: boolean): AssumableView {
  const r = a.read;
  const m = a.model;
  return {
    termsLine: assumableTermsLine(a),
    page: a.terms.page,
    sentence: assumableSentence(a),
    couponPct: a.terms.ratePct,
    marketPct: m ? m.marketRatePct : null,
    rateLine: m
      ? seeded && rateNote
        ? `A new loan today, as the model runs it: ${rateNote}.`
        : `A new loan at the model's ${pctText(m.marketRatePct)} placeholder — the rates table was not fresh enough to seed it; enter your quote.`
      : null,
    underMarketBps: a.underMarketBps,
    dscrAssume: r?.assume?.dscr ?? null,
    dscrNew: r?.newLoan?.dscr ?? null,
    extraEquity: r?.extraEquity ?? null,
    debtServiceSaved: r?.annualDebtServiceSaved ?? null,
    irrGapPts: r?.irrGapPts ?? null,
    pricePremium: r && r.pricePremium != null && r.pricePremium > 0 ? r.pricePremium : null,
    pricePremiumPct: r && r.pricePremium != null && r.pricePremium > 0 ? r.pricePremiumPctOfPrice : null,
    feeLine:
      a.terms.feePct != null
        ? `The ${oneDp(a.terms.feePct)}% assumption fee (${assumableMoney((a.terms.balance ?? 0) * (a.terms.feePct / 100))}) is funded at closing, in the cheque.`
        : "The memorandum states no assumption fee, so none is charged here — lenders commonly charge one.",
    basisLine:
      r && m
        ? `Both positions run on the model's year-1 NOI of ${assumableMoney(m.noi)}, grown ${oneDp(m.noiGrowthPct)}% a year and sold at its ${pctText(
            m.exitCapPct,
          )} exit cap in year ${m.holdYears}, against the model's ${assumableMoney(m.newLoan)} new loan — before reserves, capital and sale costs, which fall on both alike.`
        : null,
  };
}
