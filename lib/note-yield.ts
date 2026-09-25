// What a note earns at its price (#416). A memorandum selling a loan was
// read, until now, as the collateral's property at the loan's price with a
// caveat beside it; this is the note's own arithmetic, from the terms the
// memorandum states and nothing else.
//
// Pure — `irr` from lib/underwrite/engine (the Excel export's, which the
// /tools page already runs in the browser) and the shared money parser, so
// the chain lib/interest → here stays light enough for the client
// components that read lib/deal-strategy.
//
// Five rules.
//
// THE DISCOUNT IS THE RETURN. A performing note bought under its balance
// pays its coupon on the balance and repays the balance at maturity, so the
// yield to maturity is the coupon's cash on the price PLUS the discount
// accreting to par — $20.0M for a $24.4M balance at 5.25%, thirty months
// out, is 6.4% of current yield and 13.8% to maturity. Quoted as the
// monthly rate × 12, the way the note's own coupon is quoted, so the two
// sit side by side.
//
// A TERM THE OM DOES NOT STATE IS NOT INVENTED. No rate, no maturity, no
// balance: no yield. A maturity stated as a bare year has no month and is
// no maturity; an extended maturity is an option, so the initial one is
// read. An amortization the OM does not state is read as interest-only and
// SAID so — an amortizing note returns principal sooner, which yields a
// little more at a discount and a little less at a premium — and so is an
// interest-only period beside an amortization, since the OM does not say
// which applies from today.
//
// A NON-PERFORMING NOTE'S CONTRACT YIELD IS NOT THE BUYER'S. It is what the
// note would earn if it paid, said as such; what a buyer of a defaulted
// loan earns turns on the time and cost of taking the property.
//
// A MATURED NOTE STILL OUTSTANDING IS IN DEFAULT OR EXTENDED: past its
// maturity there is no contract yield to state.
//
// THE COLLATERAL'S VALUE IS THE OM'S. Loan-to-value at the balance and at
// the price are two divisions by the value the memorandum states — the
// cushion under the lender and under the buyer — never a value of ours.

import { withArticle } from "@/lib/article";
import { parseUsd } from "@/lib/money";
import { irr } from "@/lib/underwrite/engine";

export type NoteStatus = "performing" | "non_performing";

export interface NoteTerms {
  /** the unpaid principal balance, as stated */
  balance: number | null;
  /** the note's coupon, percent (5.25 means 5.25%) */
  ratePct: number | null;
  /** the maturity as an ISO date; null where the OM states none, or only a year */
  maturity: string | null;
  /** true where the OM says interest-only; false where it states an
   *  amortization; null where it says neither — or both, an interest-only
   *  period beside an amortization (`amortYears` set) */
  interestOnly: boolean | null;
  /** the amortization in years, where one is stated (360 months is 30) */
  amortYears: number | null;
  /** performing, or not; null where the OM does not say */
  status: NoteStatus | null;
  /** the collateral's value as the OM states it */
  collateralValue: number | null;
}

export interface NoteRead {
  terms: NoteTerms;
  /** the price the buyer pays for the note */
  price: number;
  /** the price over the balance, in cents on the dollar */
  cents: number | null;
  /** a year's interest on the balance over the price, percent */
  currentYieldPct: number | null;
  /** whole months from the reading's date to maturity */
  monthsLeft: number | null;
  /** the monthly IRR × 12, percent — null without the terms to run it, or
   *  past maturity */
  ytmPct: number | null;
  /** how the payments were run: "interest-only as stated", "interest-only —
   *  the memorandum states no amortization period", "amortizing over 30
   *  years from today's balance", or run interest-only where the OM states
   *  an interest-only period beside an amortization */
  paymentBasis: string | null;
  /** the balance over the collateral's stated value, percent */
  ltvAtBalancePct: number | null;
  /** the price over the collateral's stated value, percent */
  ltvAtPricePct: number | null;
  /** past maturity on the reading's date */
  matured: boolean;
}

// ── Reading the terms ───────────────────────────────────────────────────

const MONTH: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * A maturity as the OM writes it — "March 1, 2028", "Mar 2028", "3/1/2028",
 * "03/2028", "2028-03-01" — as an ISO date. A month with no day is the
 * month's end. A bare year ("2028") has no month and is null: a maturity
 * read a year wide moves the yield too far to guess.
 */
export function parseMaturity(text: string | null | undefined): string | null {
  return parseStatedDate(text, 1990, 2100);
}

/**
 * A date as the OM writes it, in the formats `parseMaturity` reads, inside
 * the years the caller accepts — a loan's maturity falls this century, a
 * ninety-nine-year ground lease's end can fall in the next (#421).
 */
export function parseStatedDate(text: string | null | undefined, minYear: number, maxYear: number): string | null {
  const validYear = (y: number) => y >= minYear && y <= maxYear;
  const s = (text ?? "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYear(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= lastDay(y, mo) ? iso(y, mo, d) : null;
  }
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const [mo, d] = [Number(m[1]), Number(m[2])];
    return validYear(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= lastDay(y, mo) ? iso(y, mo, d) : null;
  }
  m = s.match(/\b(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const [mo, y] = [Number(m[1]), Number(m[2])];
    return validYear(y) && mo >= 1 && mo <= 12 ? iso(y, mo, lastDay(y, mo)) : null;
  }
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{4})\b/);
  if (m) {
    const mo = MONTH[m[1].slice(0, 3).toLowerCase()];
    const y = Number(m[3]);
    if (!mo || !validYear(y)) return null;
    if (m[2]) {
      const d = Number(m[2]);
      return d >= 1 && d <= lastDay(y, mo) ? iso(y, mo, d) : null;
    }
    return iso(y, mo, lastDay(y, mo));
  }
  return null;
}

type MetricRows = { metrics?: Array<{ label: string; value: string }> } | null | undefined;

const rowOf = (ex: MetricRows, re: RegExp, not?: RegExp) =>
  (ex?.metrics ?? []).find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

const money = (text: string): number | null => {
  const n = parseUsd(text);
  return n != null && n > 0 ? n : null;
};

const pct = (text: string): number | null => {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 50 ? n : null;
};

/** The rows a note's terms are read from — one finder behind the reader
 *  and the key-terms block that leads with them. */
function noteRowsOf(ex: MetricRows) {
  return {
    balanceRow: rowOf(ex, /unpaid principal|\bupb\b|outstanding (loan |note )?balance|(loan|note) balance/i),
    rateRow: rowOf(ex, /^(note|interest|coupon|contract) rate\b|^coupon\b|note coupon/i),
    // "Yield to maturity" is a return, not the date the loan comes due; an
    // extended maturity is the borrower's option, not the contract's date.
    maturityRow: rowOf(ex, /maturity|matures/i, /yield|\bytm\b|extension|extended/i),
    amortRow: rowOf(ex, /amorti[sz]ation|amortizing/i),
    // An interest-only row says how long the interest-only period runs — its
    // figure is that period, never an amortization.
    ioRow: rowOf(ex, /interest[- ]only|\bi\/?o\b/i, /amorti[sz]/i),
    statusRow: rowOf(ex, /payment status|performing|delinquen|default status|loan status/i),
    valueRow: rowOf(ex, /collateral value|whole[- ]asset value|as[- ]is value|appraised value|property value|broker opinion of value|\bbov\b/i),
  };
}

/**
 * The rows that define a note, in the order a key-terms block leads with
 * them after the price: the balance, the coupon, the maturity and whether
 * it pays — each only where the OM states it.
 */
export function noteTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const r = noteRowsOf({ metrics: metrics as unknown as Array<{ label: string; value: string }> });
  return [r.balanceRow, r.rateRow, r.maturityRow, r.statusRow].filter((m): m is M => m != null);
}

/** The note's terms from the rows the extraction is asked to label them
 *  — each only as stated, null where the OM says nothing. */
export function readNoteTerms(ex: MetricRows): NoteTerms {
  const { balanceRow, rateRow, maturityRow, amortRow, ioRow, statusRow, valueRow } = noteRowsOf(ex);

  const amortText = amortRow?.value ?? "";
  const statesIo =
    /interest[- ]only|\bi\/?o\b/i.test(amortText) || (ioRow != null && !/^\s*(none|no|n\/a|0)\b/i.test(ioRow.value));
  // The amortization in years, or in months of at least five years — a
  // shorter count of months in the same line is the interest-only period.
  const yearsHit = amortText.match(/(\d{1,2})\s*(?:years?|yrs?|-year)/i);
  const monthsHit = amortText.match(/(\d{2,3})\s*(?:-month|months?|mos?\b)/i);
  const years = yearsHit ? Number(yearsHit[1]) : monthsHit && Number(monthsHit[1]) >= 60 ? Number(monthsHit[1]) / 12 : NaN;
  const amortYears = Number.isFinite(years) && years > 0 ? years : null;
  const statusText = statusRow ? `${statusRow.label} ${statusRow.value}`.toLowerCase() : "";
  const status: NoteStatus | null = !statusRow
    ? null
    : /non[- ]?performing|delinquen|default|foreclos|bankrupt|reo\b|past due|matured and unpaid/.test(statusText)
      ? "non_performing"
      : /performing|current/.test(statusText)
        ? "performing"
        : null;

  return {
    balance: balanceRow ? money(balanceRow.value) : null,
    ratePct: rateRow ? pct(rateRow.value) : null,
    maturity: maturityRow ? parseMaturity(maturityRow.value) : null,
    // Both stated is neither: the OM does not say which applies from today.
    interestOnly: statesIo ? (amortYears != null ? null : true) : amortYears != null ? false : null,
    amortYears,
    status,
    collateralValue: valueRow ? money(valueRow.value) : null,
  };
}

// ── Running the note ────────────────────────────────────────────────────

/** Whole months from one day to another — a month is counted only once its
 *  day is reached, so a note maturing on the 1st, read on the 15th, has one
 *  month fewer than the calendar suggests. */
export function monthsBetween(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/**
 * The note at a price, on a day. Null without a balance or a price — there
 * is no note to read. Each figure is null where its own inputs are.
 */
export function readNote(terms: NoteTerms, price: number | null, asOf: Date): NoteRead | null {
  if (price == null || !(price > 0) || terms.balance == null || !(terms.balance > 0)) return null;
  const balance = terms.balance;
  const today = iso(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, asOf.getUTCDate());
  const months = terms.maturity ? monthsBetween(today, terms.maturity) : null;
  const matured = months != null && months < 1;
  const r = terms.ratePct != null ? terms.ratePct / 100 : null;

  let ytmPct: number | null = null;
  let paymentBasis: string | null = null;
  if (r != null && months != null && !matured) {
    const i = r / 12;
    const amortizing = terms.interestOnly === false && terms.amortYears != null;
    let payment: number;
    let remaining = balance;
    if (amortizing) {
      const n = terms.amortYears! * 12;
      payment = (balance * i) / (1 - Math.pow(1 + i, -n));
      paymentBasis = `amortizing over ${terms.amortYears} years from today's balance`;
    } else {
      payment = balance * i;
      paymentBasis =
        terms.interestOnly === true
          ? "interest-only as stated"
          : terms.amortYears != null
            ? `run interest-only — the memorandum states an interest-only period and ${withArticle(`${terms.amortYears}-year`)} amortization, not which applies from today`
            : "interest-only — the memorandum states no amortization period";
    }
    const flows = [-price];
    for (let t = 1; t <= months; t++) {
      const interest = remaining * i;
      const principal = amortizing ? Math.min(remaining, payment - interest) : 0;
      remaining -= principal;
      flows.push(interest + principal + (t === months ? remaining : 0));
    }
    const monthly = irr(flows);
    ytmPct = monthly != null ? monthly * 12 * 100 : null;
  }

  return {
    terms,
    price,
    cents: (price / balance) * 100,
    currentYieldPct: r != null ? ((balance * r) / price) * 100 : null,
    monthsLeft: months != null && !matured ? months : null,
    ytmPct,
    paymentBasis,
    ltvAtBalancePct: terms.collateralValue != null ? (balance / terms.collateralValue) * 100 : null,
    ltvAtPricePct: terms.collateralValue != null ? (price / terms.collateralValue) * 100 : null,
    matured,
  };
}
