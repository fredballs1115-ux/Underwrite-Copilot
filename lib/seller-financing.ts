// Seller financing (#462) — a note the seller offers to carry for part of
// the price: "Seller will carry 70% at 5.00% for five years, amortizing
// over twenty-five". Common on smaller deals and whenever rates are high,
// and marketed by its rate, which is half of what it means. This reads the
// note's terms off the rows the extraction files them under and runs the
// assumption card's arithmetic (lib/tools/loan-assumption, through
// lib/assumable-debt's hand-off from the deal's own model) with the note in
// the seller's loan's place: the note against the model's new loan, both
// positions run whole on the model's price, NOI, growth, exit cap and
// costs.
//
// Pure: the model's inputs come in, nothing is read.
//
// Five rules.
//
// THE RATE IS PAID FOR SOMEWHERE. A seller carries paper below the market
// when the price carries the difference, so the note is priced by what it
// is worth against the model's new loan — the same figure the price can
// be tested against — and never by its rate alone.
//
// THE NOTE'S SIZE SETS THE CHEQUE. A note larger than the model's new loan
// takes less equity, a smaller one more, and the two positions are run
// whole so the rate and the cheque are weighed together.
//
// A SHORT TERM IS A REFINANCE. A note that balloons inside the hold runs at
// its rate for its whole years and is refinanced at today's rate after —
// the assumption card's overlap rule.
//
// A SECOND IS NOT A FIRST. Seller paper behind new senior debt is priced
// with that debt, not against it, so it is read and never run against the
// model's loan; most bank and agency loans forbid it outright.
//
// A TERM THE OM DOES NOT STATE IS NOT INVENTED. No amount, no rate, no
// term or no schedule: no comparison, and the card names what is missing.
// A share of the price is struck on the model's price, and said.
//
// On a NOTE the seller's financing is of the note's purchase — the buyer
// buys a loan, not the property — so it is never run against the model's
// property loan; it is said, as stated and as what it is, wherever the
// terms are listed (`notePurchaseFinancing`; research pass 23 found the
// terms dropped silently).

import { askingPriceOf } from "@/lib/deal-strategy";
import { interestOf } from "@/lib/interest";
import { parsePageNumber } from "@/lib/facts";
import { parseUsd } from "@/lib/money";
import {
  assumableApplies,
  assumableMoney,
  modelForAssumption,
  type AssumableView,
  type ModelForAssumption,
} from "@/lib/assumable-debt";
import { readAssumption, type AssumptionRead } from "@/lib/tools/loan-assumption";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import { sellerNoteRows } from "@/lib/loan-rows";

type Extraction = Parameters<typeof assumableApplies>[0];
type MetricRows = { metrics?: Array<{ label: string; value: string; page?: string }>; totalPages?: number } | null | undefined;

// ── The rows ────────────────────────────────────────────────────────────

// The note's rows are found by lib/loan-rows, the one finder the key terms
// and the deal page's debt sizer read too.
const SECOND = /\bsecond\b|\bsubordinat\w*|\bbehind\b|\bjunior\b|\bmezz\w*/i;

/** The rows a key-terms block leads with where the seller offers to carry
 *  financing: the note's size, its rate and its term. */
export function sellerFinancingTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const r = sellerNoteRows(metrics);
  return [r.amountRow, r.rateRow, r.termRow].filter((m): m is M => m != null);
}

const percentOf = (text: string, max: number): number | null => {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < max ? n : null;
};

/** Whole years from a term as stated: "5 years", "60 months", "5-year
 *  balloon". Never a range. */
function yearsOf(text: string): number | null {
  if (/\d\s*[-–—]\s*\d|\d\s+to\s+\d/.test(text)) return null;
  const y = text.match(/(\d{1,2}(?:\.\d+)?)\s*[- ]?(?:years?|yrs?)\b/i);
  if (y) return Number(y[1]) > 0 ? Number(y[1]) : null;
  const mo = text.match(/(\d{1,3})\s*[- ]?(?:months?|mos?)\b/i);
  return mo && Number(mo[1]) >= 6 ? Number(mo[1]) / 12 : null;
}

export interface SellerFinancingTerms {
  /** the note's principal: a stated amount, or a stated share of the
   *  price struck on the price the caller passes */
  amount: number | null;
  /** the share of the price, as stated, where the amount was one */
  sharePct: number | null;
  ratePct: number | null;
  /** the note's term from closing, years */
  termYears: number | null;
  amortYears: number | null;
  /** true where the OM says interest-only; false where it states an
   *  amortization; null where it says neither — or both */
  interestOnly: boolean | null;
  /** seller paper behind new senior debt */
  second: boolean;
  page: string;
}

/**
 * The note as the memorandum states it, from the rows the extraction is
 * asked to label "Seller financing …". Null where the memorandum offers
 * none. `price` strikes a share of the price ("70% of the price") into
 * dollars — the model's price, which is the one both positions run on.
 */
export function readSellerFinancingTerms(ex: MetricRows, price: number | null): SellerFinancingTerms | null {
  const { amountRow, rateRow, termRow, amortRow, positionRow } = sellerNoteRows(ex?.metrics ?? []);
  if (!amountRow && !rateRow && !termRow) return null;

  const amountText = amountRow?.value ?? "";
  const sharePct = /\d\s*%|percent/i.test(amountText) ? percentOf(amountText, 100) : null;
  const stated = sharePct == null && amountText ? parseUsd(amountText) : null;
  const amount = stated ?? (sharePct != null && price != null && price > 0 ? (sharePct / 100) * price : null);

  const amortText = amortRow?.value ?? "";
  const statesIo = /interest[- ]only|\bi\/?o\b/i.test(amortText);
  const amortYears = amortText ? yearsOf(amortText.replace(/interest[- ]only[^,;]*/i, "")) : null;
  const all = [amountRow, rateRow, termRow, amortRow, positionRow].filter(Boolean).map((r) => `${r!.label} ${r!.value}`).join(" ");
  const pageRow = amountRow ?? rateRow ?? termRow;
  const n = parsePageNumber(pageRow?.page);
  const pageCount = typeof ex?.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  return {
    amount: amount != null && amount > 0 ? amount : null,
    sharePct,
    ratePct: rateRow ? percentOf(rateRow.value, 25) : null,
    termYears: termRow ? yearsOf(termRow.value) : null,
    amortYears,
    // Both stated is neither: the OM does not say when one gives way.
    interestOnly: statesIo ? (amortYears != null ? null : true) : amortYears != null ? false : null,
    second: SECOND.test(all),
    page: n != null && pageCount != null && n <= pageCount ? `p. ${n}` : "",
  };
}

// ── The read ────────────────────────────────────────────────────────────

export interface SellerFinancingRead {
  terms: SellerFinancingTerms;
  model: ModelForAssumption | null;
  /** today's rate less the note's, basis points — positive where the note
   *  is under the market */
  underMarketBps: number | null;
  /** the whole years the note runs at its rate: its term, rounded down */
  noteYears: number | null;
  /** the two positions, run whole — null where a term is missing or the
   *  note is a second */
  read: AssumptionRead | null;
  missing: string[];
}

/**
 * The seller's note against the model's new loan. Null where the
 * memorandum offers no seller financing, or where the price does not buy
 * the building (a note's, a share's or the land's buyer does not choose
 * the property's financing).
 */
export function readSellerFinancing(ex: Extraction, inputs: UnderwriteInputs | null): SellerFinancingRead | null {
  if (!assumableApplies(ex)) return null;
  const model = inputs ? modelForAssumption(inputs) : null;
  // A share of the price is struck on the model's price where there is a
  // model, and on the stated ask where there is not (the context, the
  // challenger and the documents' line).
  const terms = readSellerFinancingTerms(ex as MetricRows, model?.price ?? askingPriceOf(ex as never));
  if (!terms) return null;
  const underMarketBps = model && terms.ratePct != null ? Math.round((model.marketRatePct - terms.ratePct) * 100) : null;
  const noteYears = terms.termYears != null ? Math.floor(terms.termYears) : null;
  const amort = terms.interestOnly === true ? (model?.newLoanAmortYears ?? 30) : terms.amortYears;

  const missing: string[] = [];
  if (terms.amount == null) missing.push(terms.sharePct != null ? "a price to strike its share on" : "its amount");
  if (terms.ratePct == null) missing.push("its rate");
  if (terms.termYears == null) missing.push("its term");
  if (amort == null) missing.push("its payment schedule");

  let read: AssumptionRead | null = null;
  if (!terms.second && model && terms.amount != null && terms.ratePct != null && noteYears != null && noteYears >= 1 && amort != null) {
    const r = readAssumption({
      price: model.price,
      noi: model.noi,
      noiGrowthPct: model.noiGrowthPct,
      exitCapPct: model.exitCapPct,
      holdYears: model.holdYears,
      closingCostPct: model.closingCostPct,
      assumedBalance: terms.amount,
      assumedRatePct: terms.ratePct,
      assumedAmortYears: amort,
      assumedRemainingYears: noteYears,
      // An interest-only note is interest-only for every year it runs;
      // an undated interest-only period beside an amortization is run
      // amortizing, the reading that does not flatter the note.
      assumedIoYears: terms.interestOnly === true ? noteYears : 0,
      assumptionFeePct: 0,
      marketRatePct: model.marketRatePct,
      newLoanLtvPct: model.newLoanLtvPct,
      newLoanAmortYears: model.newLoanAmortYears,
      newLoanIoYears: model.newLoanIoYears,
      newLoanFeePct: model.newLoanFeePct,
    });
    read = r.assume && r.newLoan ? r : null;
  }
  return { terms, model, underMarketBps, noteYears, read, missing };
}

// ── Saying it ───────────────────────────────────────────────────────────

const pctText = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;
const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
const yearsText = (n: number) => `${oneDp(n)} ${n === 1 ? "year" : "years"}`;

/** The note as the memorandum states it, in one line: "$21.0M (70% of the
 *  price) at 5.00% for 5 years, amortizing over 25 years". */
export function sellerFinancingTermsLine(t: SellerFinancingTerms): string {
  const size = t.amount != null ? assumableMoney(t.amount) : t.sharePct != null ? `${oneDp(t.sharePct)}% of the price` : "an amount not stated";
  const share = t.amount != null && t.sharePct != null ? ` (${oneDp(t.sharePct)}% of the price)` : "";
  const bits = [`${size}${share}`];
  if (t.ratePct != null) bits[0] += ` at ${pctText(t.ratePct)}`;
  if (t.termYears != null) bits[0] += ` for ${yearsText(t.termYears)}`;
  if (t.interestOnly === true) bits.push("interest-only as stated");
  else if (t.amortYears != null) bits.push(`amortizing over ${yearsText(t.amortYears)}`);
  if (t.second) bits.push("behind new senior debt");
  return bits.join(", ");
}

/** The deal context's line: the note as stated, and what its value turns
 *  on — never a rate alone. */
export function sellerFinancingContextLine(s: SellerFinancingRead): string {
  return `The memorandum says the seller will carry financing: ${sellerFinancingTermsLine(s.terms)}. Its value to a buyer is the rate below today's over the years of it the hold uses, against the cheque its size sets — and a seller who carries paper below the market has usually priced the difference into the ask.`;
}

/** The traps, for the challenger — appended to its notes. */
export function sellerFinancingNote(s: SellerFinancingRead): string {
  return `${sellerFinancingContextLine(s)} SELLER-FINANCING TRAPS, checked by name where the OM gives the inputs: (a) THE PRICE — a below-market note is paid for in the price, so test the ask with the note and without it; (b) THE BALLOON — a short term is a refinance at the rate then, not the note's; (c) THE UNDERLYING LOAN — a note that wraps the seller's own mortgage risks that lender's due-on-sale clause; (d) THE SECOND — seller paper behind new senior debt needs the senior lender's consent, and most bank and agency loans forbid it; (e) THE PAPER — the note's default remedies, its guarantee and its prepayment terms are the seller's to write, and read before the rate.`;
}

/** The card's one sentence: what is missing, or that it is a second, or
 *  the answer the two positions give — or, where the model's reads are left
 *  out (`withheld`, lib/underwrite/report-grid `modelReadsWithheld`), why
 *  nothing is priced. */
export function sellerFinancingSentence(s: SellerFinancingRead, withheld: string | null = null): string {
  if (s.terms.second) {
    return "It sits behind new senior debt: a second is priced with the first, not against it, so the page does not run it against the model's loan — and most senior lenders forbid seller paper behind them.";
  }
  if (s.missing.length) {
    const list = s.missing.length === 1 ? s.missing[0] : `${s.missing.slice(0, -1).join(", ")} or ${s.missing[s.missing.length - 1]}`;
    return `It cannot be priced against a new loan: the memorandum does not state ${list}.`;
  }
  if (s.noteYears === 0) {
    return "Its term is under a year — a note that short is a bridge to a refinance at today's rate, so there is nothing to price against a new loan.";
  }
  const r = s.read;
  if (withheld) return `It is not priced against a new loan: ${withheld}`;
  if (!r || !s.model) return "The model this deal runs on is not ready, so the note cannot be priced against its new loan yet.";
  const hold = `${s.model.holdYears}-year hold`;
  const balloon =
    r.assume?.refinanced && s.noteYears != null
      ? ` It balloons after ${s.noteYears} ${s.noteYears === 1 ? "year" : "years"}, inside the ${hold}, and is refinanced at today's rate after.`
      : "";
  const coverage =
    r.assume?.dscr != null && r.newLoan?.dscr != null && r.assume.dscr < r.newLoan.dscr - 0.05
      ? ` Its year-one coverage is ${r.assume.dscr.toFixed(2)}× against the model's loan's ${r.newLoan.dscr.toFixed(2)}×.`
      : "";
  const cheque =
    r.extraEquity != null
      ? `${assumableMoney(Math.abs(r.extraEquity))} ${r.extraEquity >= 0 ? "more" : "less"} equity than the model's new loan`
      : "";
  if (r.pricePremium != null && r.pricePremium > 0) {
    return `The seller's note is worth ${assumableMoney(r.pricePremium)} of price (${oneDp(r.pricePremiumPctOfPrice ?? 0)}% of the ask) on the model's own figures${
      cheque ? `, and takes ${cheque}` : ""
    }.${coverage}${balloon}`;
  }
  if (r.irrGapPts != null && r.irrGapPts <= 0) {
    return `The seller's note returns ${oneDp(Math.abs(r.irrGapPts))} points ${r.irrGapPts < 0 ? "less" : "no more"} than the model's new loan${
      cheque ? `, and takes ${cheque}` : ""
    }.${coverage}${balloon}`;
  }
  return `The seller's note returns ${oneDp(r.irrGapPts ?? 0)} points more than the model's new loan.${coverage}${balloon}`;
}

/** The card's figures as plain data — the assumption card's shape, marked
 *  as the seller's note so the card says so. `withheld`: why the model's
 *  reads are left out, where they are (the read is then taken with no
 *  model, so only the terms print). */
export function sellerFinancingView(s: SellerFinancingRead, rateNote: string | null, seeded: boolean, withheld: string | null = null): AssumableView {
  const r = s.read;
  const m = s.model;
  return {
    kind: "seller",
    termsLine: sellerFinancingTermsLine(s.terms),
    page: s.terms.page,
    sentence: sellerFinancingSentence(s, withheld),
    couponPct: s.terms.ratePct,
    marketPct: m ? m.marketRatePct : null,
    rateLine: m
      ? seeded && rateNote
        ? `A new loan today, as the model runs it: ${rateNote}.`
        : `A new loan at the model's ${pctText(m.marketRatePct)} placeholder — the rates table was not fresh enough to seed it; enter your quote.`
      : null,
    underMarketBps: s.underMarketBps,
    dscrAssume: r?.assume?.dscr ?? null,
    dscrNew: r?.newLoan?.dscr ?? null,
    extraEquity: r?.extraEquity ?? null,
    debtServiceSaved: r?.annualDebtServiceSaved ?? null,
    irrGapPts: r?.irrGapPts ?? null,
    pricePremium: r && r.pricePremium != null && r.pricePremium > 0 ? r.pricePremium : null,
    pricePremiumPct: r && r.pricePremium != null && r.pricePremium > 0 ? r.pricePremiumPctOfPrice : null,
    feeLine: s.terms.sharePct != null && s.terms.amount != null && m ? `The note's ${oneDp(s.terms.sharePct)}% of the price is struck on the model's ${assumableMoney(m.price)} price.` : null,
    basisLine:
      r && m
        ? `Both positions run on the model's year-1 NOI of ${assumableMoney(m.noi)}, grown ${oneDp(m.noiGrowthPct)}% a year and sold at its ${pctText(
            m.exitCapPct,
          )} exit cap in year ${m.holdYears}, against the model's ${assumableMoney(m.newLoan)} new loan — before reserves, capital and sale costs, which fall on both alike.`
        : null,
  };
}

// ── Wherever the deal is summarized ─────────────────────────────────────

/** The pipeline row's tag: "Seller financing 5.00%", or "Seller financing"
 *  where no rate is stated. */
export function sellerFinancingTag(ex: Extraction): string | null {
  if (!assumableApplies(ex)) return null;
  const t = readSellerFinancingTerms(ex as MetricRows, null);
  if (!t) return null;
  return t.ratePct != null ? `Seller financing ${pctText(t.ratePct)}` : "Seller financing";
}

/** The documents' one line — the memo, the shared screen, the workbook's
 *  cover: the note as stated. The pricing needs the model, which the deal
 *  page and the report carry; a line never claims more than the terms. */
export function sellerFinancingLine(t: SellerFinancingTerms): string {
  return `The seller offers to carry financing: ${sellerFinancingTermsLine(t)}`;
}

// ── On a note ───────────────────────────────────────────────────────────

/**
 * The seller's financing of a NOTE purchase. On a note the buyer buys a
 * loan, so a note the seller offers to carry finances the purchase of that
 * loan — not the property — and the model, which runs the collateral as if
 * bought outright with a property loan of its own, is no place to price it.
 * `readSellerFinancing` stays null on a note, so nothing runs it; this
 * reads the terms as stated so every surface that lists them says so. A
 * share of the price is struck on the note's own price. Null on anything
 * but a note, and where the memorandum offers none.
 */
export function notePurchaseFinancing(ex: Extraction): SellerFinancingTerms | null {
  if (interestOf(ex).kind !== "note") return null;
  return readSellerFinancingTerms(ex as MetricRows, askingPriceOf(ex as never));
}

/** The documents' line on a note: the terms as stated, said as the note
 *  purchase's and not the model's. */
export function notePurchaseFinancingLine(t: SellerFinancingTerms): string {
  return `The seller offers to finance the note purchase: ${sellerFinancingTermsLine(t)} — financing of the buyer's purchase of the loan, not of the property, and not run against the model`;
}

/** The deal context's and the challenger's line on a note. */
export function notePurchaseFinancingContextLine(t: SellerFinancingTerms): string {
  return `The memorandum says the seller will finance the note purchase: ${sellerFinancingTermsLine(t)}. It finances the buyer's purchase of the loan, not the property, so it is read as stated and not run against the model, whose new loan is a property loan the note's buyer does not take.`;
}

/** The documents' one line for whatever the seller offers to carry — the
 *  property's financing, or a note purchase's — or "" where nothing is
 *  offered. The memo's header and the shared screen read this one function. */
export function sellerFinancingDocLine(ex: Extraction): string {
  const s = readSellerFinancing(ex, null);
  if (s) return sellerFinancingLine(s.terms);
  const t = notePurchaseFinancing(ex);
  return t ? notePurchaseFinancingLine(t) : "";
}
