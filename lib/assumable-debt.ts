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
//
// And debt that is not one fixed loan is said, never priced as one
// (research pass 37). A rate that floats over an index has no fixed coupon
// to set against a new loan, so the card prices nothing and says why; a
// second loan offered with the first is assumed with it, so the first is
// never priced alone; a stated mortgage insurance premium is part of what
// the loan costs, so the coupon priced is the note rate plus it, said; and
// a lockout, or a sale subject to the loan, makes the model's new loan one
// this buyer may not be able to take, which the card says.
//
// And a balance at or over the price is said, never priced (research pass
// 38): it leaves no equity cheque, so neither position's return solves, and
// a balance stated as the loan as first made, or as the whole debt on the
// property, is the usual misread — "$30.0M — more than the $25.0M price:
// check the balance".

import { withArticle } from "@/lib/article";
import { askingPriceOf } from "@/lib/deal-strategy";
import { parsePageNumber } from "@/lib/facts";
import { interestOf } from "@/lib/interest";
import { compactUsd, parseUsd } from "@/lib/money";
import { daysBetween, monthsBetween, readStatedDate, sameMonth } from "@/lib/note-yield";
import { readAssumption, type AssumptionRead } from "@/lib/tools/loan-assumption";
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";
import { assumableRows } from "@/lib/loan-rows";

export interface AssumableTerms {
  /** today's unpaid balance, as stated */
  balance: number | null;
  /** the coupon, percent */
  ratePct: number | null;
  /** the maturity as an ISO date (lib/note-yield's reader); null where the
   *  OM states none, or only a year. A month alone is its FIRST day: the
   *  earliest the loan can come due, so no month is run at the coupon that
   *  the loan may not have (the reading that does not flatter it) */
  maturity: string | null;
  /** the OM states the maturity's month and no day: the loan comes due in
   *  that month, never "at or past" a day the memorandum did not name;
   *  absent where it states the day */
  maturityIsMonth?: boolean;
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
  /** the rate floats over an index ("SOFR + 3.25%"), so it is no coupon:
   *  `ratePct` is null beside it. Absent where the rate is fixed or not
   *  stated */
  floating?: FloatingRate;
  /** an interest rate cap the memorandum states for a floating loan, its
   *  words as stated ("3.50% SOFR through June 2027") */
  rateCap?: string;
  /** a stated mortgage insurance premium, percent a year — what a
   *  HUD-insured loan costs beside its note rate */
  mipPct?: number;
  /** the loan's prepayment terms as stated, and whether they say the loan
   *  stays: a lockout, or a sale subject to the loan */
  prepayment?: { stated: string; locksIn: boolean };
  /** a second loan offered with this one — a supplemental, a mezzanine
   *  loan or a second lien — read from its own rows, or said as stated
   *  where the first loan's own rows state it */
  supplemental?: AssumableSecondLoan;
}

/** A floating rate, as the memorandum states it. */
export interface FloatingRate {
  /** the index as the memorandum names it — "SOFR", "Term SOFR", "Prime";
   *  null where it names none */
  index: string | null;
  /** the spread over the index, percent (a figure in basis points read as
   *  one); null where none is stated */
  spreadPct: number | null;
}

/** A second loan offered for assumption with the first. */
export interface AssumableSecondLoan {
  /** its balance, from its own row; null where none is stated */
  balance: number | null;
  /** its coupon, percent, from its own row; null where none is stated or it
   *  floats */
  ratePct: number | null;
  floating?: FloatingRate;
  /** its maturity as an ISO date, a month alone on its first day */
  maturity: string | null;
  /** the first loan's balance row's words, where they state the second
   *  loan beside it ("32,000,000 first mortgage plus a 4,500,000
   *  supplemental loan") — no balance is read off them as either loan's */
  balanceStated?: string;
  /** the first loan's rate row's words, where they state the second loan's
   *  rate beside it ("3.85% (first); 5.95% (supplemental)") */
  ratesStated?: string;
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
  /** whole months from the reading's day to the stated maturity — the
   *  arithmetic's count */
  monthsLeft: number | null;
  /** days from the reading's day to the stated maturity, negative once it
   *  has gone by */
  daysLeft: number | null;
  /** at or past its maturity on the reading's day: the day has come, by the
   *  day, never by whole months (inside its last month a loan is due within
   *  the month, not come due) */
  matured: boolean;
  /** the full years it runs at its coupon — the months left rounded DOWN,
   *  so a part-year is never run at the coupon (the reading that does not
   *  flatter the loan); null without a maturity */
  couponYears: number | null;
  schedule: AssumableSchedule | null;
  model: ModelForAssumption | null;
  /** the coupon the comparison prices: the note rate, plus a stated
   *  mortgage insurance premium. Null where the rate is not stated or
   *  floats, and where a second loan is assumed with it — nothing is priced
   *  on the first loan alone */
  pricedRatePct: number | null;
  /** today's rate less the coupon priced, basis points — positive where the
   *  loan is under the market */
  underMarketBps: number | null;
  /** the two positions, run whole — null where a term is missing, and where
   *  the balance is at or over the price (`overPrice`) */
  read: AssumptionRead | null;
  /** the terms the comparison needed and the memorandum did not state */
  missing: string[];
  /** the balance at or over the price it is set against — said, and nothing
   *  priced on it; null where it is under (research pass 38) */
  overPrice: OverPrice | null;
}

/** A loan's balance, or a seller's note's amount, at or over the price it
 *  is set against (research pass 38). */
export interface OverPrice {
  /** the balance or the note's amount, as stated */
  amount: number;
  /** the price it is set against: the memorandum's ask where it states one,
   *  else the price the model runs on */
  price: number;
  /** the price is the memorandum's own ask. The documents' lines say so
   *  only then: the model's price may be its placeholder, which only the
   *  surfaces that gate the model's reads may set anything against */
  stated: boolean;
}

/** The balance or the note's amount against the memorandum's ask where it
 *  states one, else the model's price; null where it is under, or where
 *  there is no price to set it against. */
export function overPriceOf(amount: number | null, statedPrice: number | null, modelPrice: number | null): OverPrice | null {
  const price = statedPrice != null && statedPrice > 0 ? statedPrice : modelPrice;
  if (amount == null || !(amount > 0) || price == null || !(price > 0) || amount < price) return null;
  return { amount, price, stated: statedPrice != null && statedPrice > 0 };
}

/** What the figure is against the price: "more than the $25.0M price:
 *  check the balance". Two figures that read alike are "as much as" each
 *  other, never "more than". */
export function overPriceClause(o: OverPrice, what: string): string {
  const amount = assumableMoney(o.amount);
  const price = assumableMoney(o.price);
  const the = o.stated ? `the ${price} price` : `the ${price} price the model runs on`;
  return `${o.amount > o.price && amount !== price ? "more than" : "as much as"} ${the}: check the ${what}`;
}

/** The figure and the clause: "$30.0M — more than the $25.0M price: check
 *  the balance". */
export function overPriceWords(o: OverPrice, what: string): string {
  return `${assumableMoney(o.amount)} — ${overPriceClause(o, what)}`;
}

// ── Reading the terms ───────────────────────────────────────────────────

type MetricRows = { metrics?: Array<{ label: string; value: string; page?: string }>; totalPages?: number } | null | undefined;
type Extraction = Parameters<typeof interestOf>[0];

// The loan's rows are found by lib/loan-rows, the one finder the deal
// page's debt sizer reads too.

const money = (text: string): number | null => {
  const n = parseUsd(text);
  return n != null && n > 0 ? n : null;
};

const percentOf = (text: string): number | null => {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 25 ? n : null;
};

/** A row that states nothing: "None", "N/A", a dash. */
const STATES_NOTHING = /^\s*(?:none|n\/?a|not applicable|not stated|no|—|–|-)\s*\.?\s*$/i;
const says = (row: { value: string } | null | undefined): row is { value: string } =>
  !!row && typeof row.value === "string" && row.value.trim() !== "" && !STATES_NOTHING.test(row.value);

// ── A rate that is not one fixed coupon (research pass 37) ───────────────

/** The index a floating rate is quoted over, as the memorandum names it:
 *  SOFR in its forms ("Term SOFR", "30-day average SOFR"), LIBOR, prime, a
 *  Treasury. */
const INDEX =
  /(?:\b(?:one|1|three|3|six|6)[- ]month\s+)?(?:\b(?:30|90|180)[- ]day\s+(?:average\s+)?)?(?:\b(?:term|compounded|daily|simple)\s+)?\bSOFR\b|(?:\b(?:one|1|three|3)[- ]month\s+)?(?:\bUSD\s+)?\bLIBOR\b|(?:\b(?:WSJ|wall\s+street\s+journal)\s+)?\bprime(?:\s+rate)?\b|(?:\b\d{1,2}[- ](?:year|yr)\s+)?(?:\bU\.?S\.?\s+)?\btreasur(?:y|ies)\b|(?:\b\d{1,2}[- ](?:year|yr)\s+)?\bUST\b/i;
/** Words that say the rate moves. */
const FLOATS = /\bfloat(?:ing|s)?\b|\bvariable\b|\badjustable\b|\bswap(?:s|ped)?\b/i;
/** A coupon stated fixed: "3.45% fixed", "3.45%, fixed", "fixed at 3.45%",
 *  "a fixed rate of 3.45%". */
const FIXED_AT = /(\d+(?:\.\d+)?)\s*%\s*[,(]?\s*fixed\b|\bfixed\s+(?:(?:interest\s+)?rate\s+|coupon\s+)?(?:of\s+|at\s+)?(\d+(?:\.\d+)?)\s*%/i;
const SPREAD_UNIT = String.raw`(%|bps?\b|basis\s+points?\b)`;
const SPREAD_AFTER = new RegExp(String.raw`(?:${INDEX.source})\s*(?:\+|plus)\s*(\d+(?:\.\d+)?)\s*${SPREAD_UNIT}`, "i");
const SPREAD_BEFORE = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${SPREAD_UNIT}\s*(?:over|above)\s+(?:the\s+)?(?:${INDEX.source})`, "i");
const SPREAD_WORD = new RegExp(String.raw`\bspread\s*(?:of|:|is)?\s*(\d+(?:\.\d+)?)\s*${SPREAD_UNIT}`, "i");
/** A mortgage insurance premium stated beside the note rate: "2.65% plus
 *  0.25% annual MIP". */
const MIP_INLINE =
  /(\d+(?:\.\d+)?)\s*%\s*(?:annual(?:ly)?\s+|per\s+(?:annum|year)\s+|a\s+year\s+)?\(?\s*(?:MIP\b|mortgage\s+insurance(?:\s+premium)?\b)|\b(?:MIP|mortgage\s+insurance(?:\s+premium)?)\s*(?:of|at|:|is)?\s*(\d+(?:\.\d+)?)\s*%/i;
/** An interest rate cap stated inside the rate's own row. */
const CAP_CLAUSE = /\b(?:(?:interest\s+)?rate\s+cap|capped)\b\s*(?:at|of|:)?\s*([^;]+)/i;
/** The words that put a second loan in the first loan's own row. */
const NAMES_SECOND_LOAN =
  /\bsupplemental\b|\b(?:second|2nd)[\s-]+(?:loan|lien|mortgage|note|trust\s+deed)\b|\(\s*(?:second|2nd)\s*\)|\bmezz(?:anine)?\b|\b(?:junior|subordinate)[\s-]+(?:loan|lien|mortgage|note|debt)\b|\b(?:both|two)\s+loans\b/i;
/** Prepayment terms that say the loan stays: a lockout, or a sale subject to
 *  the loan. */
const LOCKS_IN =
  /\block(?:ed)?[\s-]*out\b|\bsubject\s+to\s+(?:the\s+)?(?:assumption\s+of\s+)?(?:the\s+)?(?:existing\s+)?(?:[A-Z]{2,5}\s+)?(?:loan|mortgage|debt|financing)\b|\bsubject\s+to\s+(?:its\s+|the\s+loan'?s?\s+)?assumption\b|\bmust\s+(?:be\s+)?assumed?\b|\b(?:assumption|assume)\s+(?:is\s+)?(?:required|mandatory)\b|\brequired\s+to\s+assume\b|\bno\s+prepayment\b(?!\s+(?:premium|penalty|fee|charge))|\bprepayment\s+(?:is\s+)?(?:not\s+(?:permitted|allowed)|prohibited)\b/i;

const spreadOf = (text: string): number | null => {
  const m = SPREAD_AFTER.exec(text) ?? SPREAD_BEFORE.exec(text) ?? SPREAD_WORD.exec(text);
  if (!m) return null;
  const n = Number(m[1]) / (/^b/i.test(m[2]) ? 100 : 1);
  return Number.isFinite(n) && n > 0 && n < 15 ? n : null;
};

/** A rate that floats, as stated — a rate naming an index, or saying it
 *  floats. Null for a fixed coupon, including one priced off an index when
 *  the loan was made ("3.45% fixed, set at the 10-year Treasury plus 180
 *  bps"). */
export function floatingRateOf(text: string | null | undefined): FloatingRate | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const floats = FLOATS.test(t);
  const index = INDEX.exec(t);
  if (!floats && !index) return null;
  if (!floats && /\bfixed\b/i.test(t)) return null;
  return { index: index ? index[0] : null, spreadPct: spreadOf(t) };
}

/** A fixed coupon, as stated: the figure beside "fixed" where the words say
 *  so, else the first percentage — never a mortgage insurance premium, or
 *  the spread over the index a fixed coupon was priced at, stated beside
 *  it. */
function couponOf(text: string): number | null {
  const t = text.replace(new RegExp(MIP_INLINE.source, "gi"), " ");
  const fixed = FIXED_AT.exec(t);
  if (fixed) {
    const n = Number(fixed[1] ?? fixed[2]);
    return Number.isFinite(n) && n > 0 && n < 25 ? n : null;
  }
  return percentOf(t.replace(new RegExp(SPREAD_AFTER.source, "gi"), " ").replace(new RegExp(SPREAD_BEFORE.source, "gi"), " "));
}

/** A premium a year: the annual figure where the words state an upfront
 *  premium beside it, else the one percentage stated. */
function mipOf(text: string): number | null {
  const plausible = (n: number) => (Number.isFinite(n) && n > 0 && n < 25 ? n : null);
  const annual =
    text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:annual(?:ly)?\b|per\s+(?:annum|year)\b|a\s+year\b|\/\s*(?:yr|year)\b)/i) ??
    text.match(/\bannual(?:ly)?\b[^%\d]{0,30}?(\d+(?:\.\d+)?)\s*%/i);
  if (annual) return plausible(Number(annual[1]));
  if (/\bup[- ]?front\b|\binitial\b|\bone[- ]time\b/i.test(text)) return null;
  const all = [...new Set([...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1])))];
  return all.length === 1 ? plausible(all[0]) : null;
}

/** The words a rate cap is stated in, without a closing stop. */
const capText = (text: string): string | undefined => {
  const t = text.trim().replace(/[.;,]+$/, "");
  return t ? t : undefined;
};

/** Whether the first loan's own row states a second loan beside it: words
 *  that name one and a second figure of the row's own kind — "32,000,000
 *  first mortgage plus a 4,500,000 supplemental loan", "3.85% (first); 5.95%
 *  (supplemental)". A supplemental loan said to be available, with no
 *  figure of its own, is no second loan offered. */
function statesTwoLoans(text: string, kind: "dollars" | "rates"): boolean {
  if (!text || !NAMES_SECOND_LOAN.test(text)) return false;
  const count =
    kind === "dollars"
      ? [...text.replace(/,/g, "").matchAll(/\$?\d+(?:\.\d+)?\s*(?:k|thousand|mm|million|m|bn|billion|b)?\b/gi)].filter((m) => parseUsd(m[0]) != null).length
      : (text.match(/\d+(?:\.\d+)?\s*%/g) ?? []).length;
  return count >= 2;
}

/**
 * The loan in place, from the rows the extraction is asked to label
 * "Assumable loan …" — null where the memorandum offers no loan for
 * assumption (no balance row), so a deal financed fresh reads nothing.
 */
export function readAssumableTerms(ex: MetricRows): AssumableTerms | null {
  const rows = assumableRows(ex?.metrics ?? []);
  const { balanceRow, rateRow, maturityRow, amortRow, dsRow, feeRow } = rows;
  const balance = balanceRow ? money(balanceRow.value) : null;
  if (!balanceRow || balance == null) return null;

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
  const maturity = maturityRow ? readStatedDate(maturityRow.value, 1990, 2100, "first") : null;

  // The rate: a floating one is no coupon, and a row that states the second
  // loan's rate beside the first's says no one coupon is the first's.
  const rateText = says(rateRow) ? rateRow.value : "";
  const floating = floatingRateOf(rateText);
  const twoInBalance = statesTwoLoans(balanceRow.value, "dollars");
  const twoInRate = statesTwoLoans(rateText, "rates");
  const ratePct = rateText && !floating && !twoInRate ? couponOf(rateText) : null;
  const capOwn = says(rows.capRow) ? capText(rows.capRow.value) : undefined;
  const capInRow = floating ? CAP_CLAUSE.exec(rateText) : null;
  const rateCap = capOwn ?? (capInRow ? capText(capInRow[1]) : undefined);
  const mipInRow = rateText ? MIP_INLINE.exec(rateText) : null;
  const mipStated = says(rows.mipRow) ? mipOf(rows.mipRow.value) : mipInRow ? Number(mipInRow[1] ?? mipInRow[2]) : null;
  const mipPct = mipStated != null && Number.isFinite(mipStated) && mipStated > 0 && mipStated < 25 ? mipStated : null;
  const prepaymentText = says(rows.prepaymentRow) ? rows.prepaymentRow.value.trim() : "";
  const prepayment = prepaymentText ? { stated: prepaymentText, locksIn: LOCKS_IN.test(prepaymentText) } : null;

  // A second loan offered with it, from its own rows or the first's words.
  const second = [rows.secondBalanceRow, rows.secondRateRow, rows.secondMaturityRow].filter(says);
  const secondRateText = says(rows.secondRateRow) ? rows.secondRateRow.value : "";
  const secondFloating = floatingRateOf(secondRateText);
  const secondMaturity = says(rows.secondMaturityRow) ? readStatedDate(rows.secondMaturityRow.value, 1990, 2100, "first") : null;
  const supplemental: AssumableSecondLoan | null =
    second.length || twoInBalance || twoInRate
      ? {
          balance: says(rows.secondBalanceRow) ? money(rows.secondBalanceRow.value) : null,
          ratePct: secondRateText && !secondFloating ? couponOf(secondRateText) : null,
          ...(secondFloating ? { floating: secondFloating } : {}),
          maturity: secondMaturity?.iso ?? null,
          ...(twoInBalance ? { balanceStated: balanceRow.value.trim() } : {}),
          ...(twoInRate ? { ratesStated: rateText.trim() } : {}),
        }
      : null;

  return {
    balance,
    ratePct,
    maturity: maturity?.iso ?? null,
    ...(maturity?.month ? { maturityIsMonth: true } : {}),
    // Both stated is neither: the OM does not say when one gives way.
    interestOnly: statesIo ? (amortYears != null ? null : true) : amortYears != null ? false : null,
    amortYears,
    debtService,
    feePct: feePctStated ?? (feeDollars != null ? (feeDollars / balance) * 100 : null),
    page: n != null && pageCount != null && n <= pageCount ? `p. ${n}` : "",
    ...(floating ? { floating } : {}),
    ...(rateCap ? { rateCap } : {}),
    ...(mipPct != null ? { mipPct } : {}),
    ...(prepayment ? { prepayment } : {}),
    ...(supplemental ? { supplemental } : {}),
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
  // At or past maturity by the day: whole months read a loan due next month
  // as come due (the time audit of 2026-10-01). A maturity stated as a month
  // alone comes due in that month, and is past it only once the month is
  // out — never "at or past" on a day the memorandum did not name.
  const daysLeft = terms.maturity ? daysBetween(today, terms.maturity) : null;
  const thisMonth = !!terms.maturityIsMonth && !!terms.maturity && sameMonth(today, terms.maturity);
  const matured = !thisMonth && daysLeft != null && daysLeft <= 0;
  const model = inputs ? modelForAssumption(inputs) : null;
  const schedule = scheduleOf(terms, model?.newLoanAmortYears ?? 30);
  // The coupon priced: the note rate and a stated mortgage insurance
  // premium. A floating rate is no coupon, and a loan assumed with a second
  // is never priced alone.
  const pricedRatePct =
    terms.ratePct != null && !terms.floating && !terms.supplemental ? terms.ratePct + (terms.mipPct ?? 0) : null;
  const underMarketBps = model && pricedRatePct != null ? Math.round((model.marketRatePct - pricedRatePct) * 100) : null;

  const missing: string[] = [];
  if (terms.ratePct == null && !terms.floating) missing.push("its rate");
  if (terms.maturity == null) missing.push("its maturity");
  if (!schedule) missing.push("its payment schedule");
  // The arithmetic runs in whole years (lib/tools/debt-math): a part-year
  // left at the end is refinanced with the rest rather than run at the
  // coupon, and a loan with under a year to run is a refinance, not an
  // assumption.
  const couponYears = monthsLeft != null && !matured ? Math.floor(Math.max(0, monthsLeft) / 12) : null;
  // A balance at or over the price leaves no equity cheque, so neither
  // position's return solves: it is said, and nothing is priced on it. A
  // first loan's row that states two loans gives no balance of the first's.
  const overPrice = terms.supplemental?.balanceStated
    ? null
    : overPriceOf(terms.balance, askingPriceOf(ex as never), model?.price ?? null);

  let read: AssumptionRead | null = null;
  if (!overPrice && model && pricedRatePct != null && couponYears != null && couponYears >= 1 && schedule) {
    const remainingYears = couponYears;
    const r = readAssumption({
      price: model.price,
      noi: model.noi,
      noiGrowthPct: model.noiGrowthPct,
      exitCapPct: model.exitCapPct,
      holdYears: model.holdYears,
      closingCostPct: model.closingCostPct,
      assumedBalance: terms.balance,
      assumedRatePct: pricedRatePct,
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
  return { terms, monthsLeft, daysLeft, matured, couponYears, schedule, model, pricedRatePct, underMarketBps, read, missing, overPrice };
}

// ── Saying it ───────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (isoDate: string) => {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
// Rounded on the tenths, never a float's toFixed (lib/money `compactUsd`).
export const assumableMoney = (n: number) => compactUsd(n, { wholeMillionsFrom: 1e8 });
const pctText = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;

/** A floating rate, said as stated: "SOFR + 3.25%", "SOFR", or null where
 *  the memorandum names no index. */
function floatingWords(f: FloatingRate): string | null {
  if (f.index && f.spreadPct != null) return `${f.index} + ${pctText(f.spreadPct)}`;
  return f.index;
}

/** A rate as the line says it: " at 3.45%", " at 2.65% plus the 0.25% MIP",
 *  " floating at SOFR + 3.25%", " floating over SOFR", " at a floating
 *  rate"; "" where none is stated. */
function rateWords(ratePct: number | null, floating: FloatingRate | undefined, mipPct?: number): string {
  if (floating) {
    const w = floatingWords(floating);
    return w == null ? " at a floating rate" : floating.spreadPct != null ? ` floating at ${w}` : ` floating over ${w}`;
  }
  if (ratePct == null) return "";
  return ` at ${pctText(ratePct)}${mipPct != null ? ` plus the ${pctText(mipPct)} MIP` : ""}`;
}

/** Words quoted as stated, without a closing stop. */
const quoted = (text: string) => `"${text.trim().replace(/[.;,]+$/, "")}"`;

/** The second loan offered with the first, from its own rows: "a $4.5M
 *  supplemental loan at 5.95% to Aug 2029". Null where its own rows state
 *  none of it. */
function secondLoanWords(s: AssumableSecondLoan): string | null {
  if (s.balance == null && s.ratePct == null && !s.floating && s.maturity == null) return null;
  const what = `${s.balance != null ? `${assumableMoney(s.balance)} ` : ""}supplemental loan`;
  return `${withArticle(what)}${rateWords(s.ratePct, s.floating)}${s.maturity ? ` to ${monthYear(s.maturity)}` : ""}`;
}

/** The loan as the memorandum states it, in one line: "$24.5M at 3.45% to
 *  Mar 2029, interest-only as stated". Debt that is not one fixed loan says
 *  so in its own words: a floating rate with its index and its cap, a
 *  second loan beside the first — where the first loan's own rows state
 *  the two, those rows are quoted and no balance or rate is read off them
 *  as the first's. */
export function assumableTermsLine(a: AssumableRead): string {
  const t = a.terms;
  const s = t.supplemental;
  let lead = s?.balanceStated ? quoted(s.balanceStated) : assumableMoney(t.balance ?? 0);
  lead += s?.ratesStated ? ` at ${quoted(s.ratesStated)}` : rateWords(t.ratePct, t.floating, t.mipPct);
  if (s?.balanceStated || s?.ratesStated) lead += ", as stated,";
  if (t.maturity) lead += ` to ${monthYear(t.maturity)}`;
  const bits = [lead.replace(/,$/, "")];
  // The schedule is the first loan's; where its balance row states two
  // loans, it is no one loan's.
  if (a.schedule && !s?.balanceStated) bits.push(a.schedule.basis);
  if (t.rateCap) bits.push(`with a rate cap as stated: ${t.rateCap}`);
  const second = s ? secondLoanWords(s) : null;
  return second ? `${bits.join(", ")}; with it, ${second}` : bits.join(", ");
}

/** The prepayment terms as stated, and what they mean for the model's new
 *  loan where they lock the loan in. */
function prepaymentWords(t: AssumableTerms): string {
  if (!t.prepayment) return "";
  const stated = t.prepayment.stated.replace(/[.;]+$/, "");
  return t.prepayment.locksIn
    ? `The memorandum states its prepayment terms as "${stated}": the model's new loan may not be this buyer's to take.`
    : `Its prepayment terms as stated: "${stated}".`;
}

/**
 * The deal context's line (every Claude step after the extraction): the
 * loan as stated, and what its value turns on — never a rate alone. A
 * floating loan saves no fixed rate, so its line never says it does; two
 * loans are assumed together, so neither is valued alone.
 */
export function assumableContextLine(a: AssumableRead): string {
  const t = a.terms;
  const prepay = prepaymentWords(t);
  const tail = prepay ? ` ${prepay}` : "";
  if (a.overPrice?.stated) {
    return `The memorandum offers the seller's loan for assumption: ${assumableTermsLine(a)}; its ${assumableMoney(a.overPrice.amount)} balance is ${overPriceClause(a.overPrice, "balance")}. A balance at or over the price leaves no equity cheque, so the loan is priced against nothing until the balance is checked.${tail}`;
  }
  if (t.supplemental) {
    return `The memorandum offers the seller's loans for assumption together: ${assumableTermsLine(a)}. The two are assumed together, so what they are worth is the two loans' position — their rates over the years of them the hold uses, against the equity cheque their balances take — never the first loan's rate alone.${tail}`;
  }
  if (t.floating) {
    const w = floatingWords(t.floating);
    return `The memorandum offers the seller's loan for assumption: ${assumableTermsLine(a)}. Its rate floats${w ? ` with ${t.floating.index}` : ""}: its coupon moves with the index, so there is no fixed coupon to set against a new loan — what it is worth turns on the index over the hold and any rate cap the lender requires, against the equity cheque its balance takes.${tail}`;
  }
  return `The memorandum offers the seller's loan for assumption: ${assumableTermsLine(a)}. Its value to a buyer is the rate saved over the years of it the hold uses, against the larger equity cheque its smaller balance takes — never the rate alone.${tail}`;
}

/** The traps, for the challenger — appended to its notes. (f) to (i) are
 *  questions, naming no agency's, HUD's or lender's rule. */
export function assumableNote(a: AssumableRead): string {
  return `${assumableContextLine(a)} ASSUMABLE-DEBT TRAPS, checked by name where the OM gives the inputs: (a) THE OVERLAP — the loan is worth only the years of it the hold uses, and a term past the sale adds nothing; (b) THE CHEQUE — an amortised balance is under what a new loan would advance, so assuming takes more equity, not less; (c) CONSENT — the lender must approve the buyer, charges a fee, and brings its covenants, reserves and cash management with the loan; (d) THE BALLOON — a maturity inside the hold is a refinance at the rate then, not the coupon; (e) THE EXIT — a defeasance or yield-maintenance clause can make the loan dear to leave at the sale, and the next buyer may not want to assume it; (f) A FLOATING LOAN — what is the rate cap's strike and when does it expire, what would a replacement cap cost, and what coupon does today's index make?; (g) A SECOND LOAN — is a supplemental or second loan assumed with it, and at what rate and to what maturity?; (h) A HUD-INSURED LOAN — what approval does the transfer need and how long does the memorandum say it takes, and what regulatory agreement, mortgage insurance premium and replacement reserve does it state?; (i) PREPAYMENT — does a lockout, a defeasance or a sale subject to the loan make it the deal's only financing?`;
}

/** Whole years, said: "5 years", "1 year". */
const yearsText = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

/**
 * The card's one sentence under the pictures: what is missing, or that the
 * loan has matured, or that its balance is at or over the price (said, and
 * priced against nothing), or the answer the two positions give — and, where its
 * prepayment terms lock the loan in, that the model's new loan may not be
 * this buyer's to take. `withheld` is why the model's reads are left out
 * (lib/underwrite/report-grid `modelReadsWithheld`): the loan is then read
 * as stated and priced against nothing, and the sentence says why.
 */
export function assumableSentence(a: AssumableRead, withheld: string | null = null): string {
  if (a.matured && a.terms.maturity) {
    return `It is at or past its ${monthYear(a.terms.maturity)} maturity — a loan that has come due is refinanced, not assumed, so there is nothing to price against a new one.`;
  }
  if (a.couponYears === 0 && a.terms.maturity) {
    return `It comes due in ${monthYear(a.terms.maturity)}, inside a year — a loan that short is a refinance at today's rate, not an assumption, so there is nothing to price against a new one.`;
  }
  const t = a.terms;
  const lockIn = t.prepayment?.locksIn ? ` ${prepaymentWords(t)}` : "";
  if (a.overPrice) {
    return `${overPriceWords(a.overPrice, "balance")}. A loan at or over the price leaves no equity cheque, so nothing is priced against a new loan.${lockIn}`;
  }
  if (t.supplemental || t.floating) {
    const said: string[] = [];
    if (t.supplemental) said.push("A second loan is offered with it: the two are assumed together, so the first is not priced against a new loan alone.");
    if (t.floating) {
      const w = floatingWords(t.floating);
      const who = t.supplemental ? "It" : "The loan";
      said.push(
        w == null
          ? `${who} floats, as stated: its coupon moves with its index, so no fixed comparison is drawn.`
          : `${who} floats ${t.floating.spreadPct != null ? "at" : "over"} ${w}${t.floating.spreadPct != null ? "" : ", at a spread the memorandum does not state"}: its coupon moves with the index, so no fixed comparison is drawn.`,
      );
    }
    return `${said.join(" ")}${lockIn}`;
  }
  if (a.missing.length) {
    const list =
      a.missing.length === 1 ? a.missing[0] : `${a.missing.slice(0, -1).join(", ")} or ${a.missing[a.missing.length - 1]}`;
    return `It cannot be priced against a new loan: the memorandum does not state ${list}.${lockIn}`;
  }
  const r = a.read;
  if (withheld) return `It is not priced against a new loan: ${withheld}${lockIn}`;
  if (!r || !a.model) return `The model this deal runs on is not ready, so the loan cannot be priced against its new loan yet.${lockIn}`;
  const mip =
    t.mipPct != null && t.ratePct != null
      ? ` The coupon priced is its ${pctText(t.ratePct)} note rate plus the ${pctText(t.mipPct)} MIP, ${pctText(t.ratePct + t.mipPct)} a year.`
      : "";
  return `${pricedSentence(a, r, a.model)}${mip}${lockIn}`;
}

/** The answer the two positions give, with what of the term counts. */
function pricedSentence(a: AssumableRead, r: AssumptionRead, model: ModelForAssumption): string {
  const hold = `${model.holdYears}-year hold`;
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
  // A gap that did not solve is no gap, never "0 points" (research pass 38).
  if (r.irrGapPts == null) {
    return `No return gap is stated: the levered return of assuming it, or of the model's new loan, does not solve on the model's figures.${overlap}`;
  }
  return `Assuming it returns ${oneDp(r.irrGapPts)} points more than the model's new loan.${overlap}`;
}

// ── What the card draws ─────────────────────────────────────────────────

/**
 * The card's figures as plain data: the deal view is a client component,
 * and handing it this rather than the read keeps the engine and the /tools
 * arithmetic out of the browser bundle (metroDemand's rule).
 */
export interface AssumableView {
  /** whose loan the card prices: the seller's loan offered for assumption
   *  (the default), or a note the seller offers to carry (lib/seller-
   *  financing, #462) — the card's words follow it */
  kind?: "assumption" | "seller";
  termsLine: string;
  page: string;
  sentence: string;
  /** the coupon priced — with a stated mortgage insurance premium in it
   *  (`mipPct`); null where nothing is priced: a floating rate, or a loan
   *  assumed with a second */
  couponPct: number | null;
  /** the mortgage insurance premium inside `couponPct`, percent a year;
   *  absent or null where none is stated */
  mipPct?: number | null;
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
 * `withheld`: why the model's reads are left out, where they are — the read
 * is then taken with no model, so only the terms print (research pass 38).
 */
export function assumableView(a: AssumableRead, rateNote: string | null, seeded: boolean, withheld: string | null = null): AssumableView {
  const r = a.read;
  const m = a.model;
  return {
    termsLine: assumableTermsLine(a),
    page: a.terms.page,
    sentence: assumableSentence(a, withheld),
    couponPct: a.pricedRatePct,
    ...(a.terms.mipPct != null && a.pricedRatePct != null ? { mipPct: a.terms.mipPct } : {}),
    marketPct: m ? m.marketRatePct : null,
    // A new loan's rate is set against a coupon; where nothing is priced
    // (a floating rate, two loans) there is none to set it against.
    rateLine:
      m && !a.terms.floating && !a.terms.supplemental
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
    // Nothing is priced on a balance at or over the price, so no cheque
    // carries a fee.
    feeLine: a.overPrice
      ? null
      : a.terms.feePct != null
        ? a.terms.supplemental
          ? // Two loans: the fee is not struck on the first one's balance alone.
            `The ${oneDp(a.terms.feePct)}% assumption fee is funded at closing, in the cheque.`
          : `The ${oneDp(a.terms.feePct)}% assumption fee (${assumableMoney((a.terms.balance ?? 0) * (a.terms.feePct / 100))}) is funded at closing, in the cheque.`
        : "The memorandum states no assumption fee, so none is charged here — lenders commonly charge one.",
    basisLine:
      r && m
        ? `Both positions run on the model's year-1 NOI of ${assumableMoney(m.noi)}, grown ${oneDp(m.noiGrowthPct)}% a year and sold at its ${pctText(
            m.exitCapPct,
          )} exit cap in year ${m.holdYears}, against the model's ${assumableMoney(m.newLoan)} new loan — before reserves, capital and sale costs, which fall on both alike.`
        : null,
  };
}

// ── Wherever the deal is summarized (#419) ──────────────────────────────

/**
 * The pipeline row's tag: "Assumable 3.45%", or "Assumable loan" where the
 * rate is not stated — beside the price, where a scan of the pipeline sees
 * which deals carry debt a buyer can take over. Debt that is not one fixed
 * loan says so: "Assumable SOFR + 3.25%", "Assumable 2.65% + MIP",
 * "Assumable 3.85% + supplemental". Null where no loan is offered for
 * assumption or the price does not buy the building.
 */
export function assumableTag(ex: Extraction): string | null {
  if (!assumableApplies(ex)) return null;
  const t = readAssumableTerms(ex as MetricRows);
  if (!t) return null;
  const floating = t.floating ? floatingWords(t.floating) : null;
  const rate = t.floating
    ? floating == null
      ? "floating rate"
      : t.floating.spreadPct != null
        ? floating
        : `${floating}, floating`
    : t.ratePct != null
      ? `${pctText(t.ratePct)}${t.mipPct != null ? " + MIP" : ""}`
      : null;
  const tag = rate ? `Assumable ${rate}` : "Assumable loan";
  return t.supplemental ? `${tag} + supplemental` : tag;
}

/**
 * The documents' one line — the memo under its title, the shared screen,
 * the workbook's cover: the loan as stated, and that it is offered. The
 * pricing against today's rate needs the model, which the deal page and the
 * report carry; a line never claims more than the terms.
 */
export function assumableLine(a: AssumableRead): string {
  // A balance at or over the memorandum's own ask is said here too — never
  // against a model's price, which may be its placeholder.
  const over = a.overPrice?.stated ? `; its ${assumableMoney(a.overPrice.amount)} balance is ${overPriceClause(a.overPrice, "balance")}` : "";
  return a.terms.supplemental
    ? `The seller's loans are offered for assumption together: ${assumableTermsLine(a)}${over}`
    : `The seller's loan is offered for assumption: ${assumableTermsLine(a)}${over}`;
}
