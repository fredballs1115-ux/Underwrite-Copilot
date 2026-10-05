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
// cushion under the lender and under the buyer — never a value of ours. And
// only for a note nothing ranks ahead of: a mezzanine loan, a second or
// junior lien, a B-note, subordinate debt or a position behind a senior loan
// is at risk from its LAST dollar, which sits on top of the senior balance —
// $15M behind a $60M senior loan on a $70M value had read 21% where the
// stack is 107%. Where the memorandum states the senior loan's balance (the
// extraction's "Senior loan balance" row, research pass 28), the stack is
// read off it: the senior's balance over the stated value is where this
// note's first dollar sits, the senior's and the note's together where its
// last does. Where no such row is read, the loan-to-value is withheld,
// never computed. The position is read from the words only where they place
// THIS note (a second lien, a B-note, a junior participation, "behind a $60M
// senior loan"); a mention of other debt beside a first-lien note leaves it
// first, a negated one ("no mezzanine or junior debt") is no mention, and a
// bare mention with nothing to place the note is said as unclear, never as
// a senior loan ahead of it (the audit of 2026-10-01) — and a senior balance
// is read only beside words that place the note behind it.

import { withArticle } from "@/lib/article";
import { parseUsd } from "@/lib/money";
import { irr } from "@/lib/underwrite/engine";

export type NoteStatus = "performing" | "non_performing";

/** Where the note sits, as its words place it: "first" (nothing named
 *  ahead of it), "behind" (the words put this note behind other debt), or
 *  "unclear" (they name other debt without saying which comes first). */
export type NotePosition = "first" | "behind" | "unclear";

export interface NoteTerms {
  /** the unpaid principal balance, as stated */
  balance: number | null;
  /** the note's coupon, percent (5.25 means 5.25%) */
  ratePct: number | null;
  /** the maturity as an ISO date; null where the OM states none, or only a year */
  maturity: string | null;
  /** the OM states the maturity's month and no day ("Mar 2028"): read as
   *  the month's last day, and said inside that month as due "this month"
   *  (`NoteRead.thisMonth`); absent where it states the day */
  maturityIsMonth?: boolean;
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
  /** the note sits behind other debt, or may, as the memorandum's words for
   *  it say (`isSubordinateNote`): its loan-to-value needs the senior
   *  balance, and is withheld — read on top of that balance only where the
   *  memorandum states it (`seniorBalance`) */
  subordinate: boolean;
  /** which of the two: placed behind other debt, or named beside it with no
   *  order stated (`notePosition`); absent reads as `subordinate` says */
  position?: NotePosition;
  /** behind a senior loan: that loan's balance, from the row the extraction
   *  labels "Senior loan balance" — only as stated, and only where the words
   *  place this note behind it; absent otherwise */
  seniorBalance?: number;
}

export interface NoteRead {
  terms: NoteTerms;
  /** the price the buyer pays for the note */
  price: number;
  /** the price over the balance, in cents on the dollar */
  cents: number | null;
  /** a year's interest on the balance over the price, percent */
  currentYieldPct: number | null;
  /** whole months from the reading's date to maturity — the arithmetic's
   *  count, 0 inside the last month; null past maturity */
  monthsLeft: number | null;
  /** days from the reading's date to maturity, negative once it has gone
   *  by — what "past" and "due" are said from, never the whole months */
  daysLeft: number | null;
  /** the monthly IRR × 12, percent — null without the terms to run it, or
   *  past maturity */
  ytmPct: number | null;
  /** how the payments were run: "interest-only as stated", "interest-only —
   *  the memorandum states no amortization period", "amortizing over 30
   *  years from today's balance", or run interest-only where the OM states
   *  an interest-only period beside an amortization */
  paymentBasis: string | null;
  /** the balance over the collateral's stated value, percent — null on a
   *  subordinate note, whose loan-to-value runs on top of the senior balance
   *  (`stackAtBalancePct`, where the memorandum states it) */
  ltvAtBalancePct: number | null;
  /** the price over the collateral's stated value, percent — null on a
   *  subordinate note, as above */
  ltvAtPricePct: number | null;
  /** behind a senior loan whose balance the memorandum states
   *  (`NoteTerms.seniorBalance`), over the collateral's stated value,
   *  percent: the senior's balance — where this note's first dollar sits;
   *  the senior's and the note's balance — its last dollar; and the senior's
   *  balance and the price — the buyer's. Null without both stated figures */
  seniorLtvPct: number | null;
  stackAtBalancePct: number | null;
  stackAtPricePct: number | null;
  /** past maturity on the reading's date: its day has gone by. On the day
   *  itself the note is due, not past it */
  matured: boolean;
  /** the maturity is stated as a month alone and the reading's date falls
   *  in it: due "this month", never "today" or "in under a month" on a day
   *  the memorandum never named */
  thisMonth: boolean;
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
 * ninety-nine-year ground lease's end can fall in the next (#421). A month
 * with no day is the month's end; a reader that must say which day it took
 * reads `readStatedDate`.
 */
export function parseStatedDate(text: string | null | undefined, minYear: number, maxYear: number): string | null {
  return readStatedDate(text, minYear, maxYear, "last")?.iso ?? null;
}

/** A date the memorandum states, and whether it states the day. */
export interface StatedDate {
  /** the ISO day: for a month alone, the side the caller asked for */
  iso: string;
  /** the memorandum states a month and a year and no day ("June 2027",
   *  "06/2027"): the day is the reader's choice, never the memorandum's, so
   *  a sentence inside the month says "this month" — never "today", and
   *  never "under a month" on the strength of a day nobody stated */
  month: boolean;
}

/**
 * A date as the OM writes it (the formats above), and whether it names the
 * day. A month alone is read on the side the caller names (the audit of
 * 2026-10-04: every month was read as its LAST day, so a lease stated "June
 * 2027" ended "today" on June 30, and an abatement read early ran "under a
 * month" all June): its FIRST day where an earlier end is the one that does
 * not flatter the buyer — a lease, a contract, an abatement, a right to
 * leave — its LAST where a later one is, a rent restriction.
 */
export function readStatedDate(
  text: string | null | undefined,
  minYear: number,
  maxYear: number,
  side: "first" | "last",
): StatedDate | null {
  const validYear = (y: number) => y >= minYear && y <= maxYear;
  const day = (y: number, mo: number, d: number): StatedDate => ({ iso: iso(y, mo, d), month: false });
  const month = (y: number, mo: number): StatedDate => ({ iso: iso(y, mo, side === "first" ? 1 : lastDay(y, mo)), month: true });
  const s = (text ?? "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYear(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= lastDay(y, mo) ? day(y, mo, d) : null;
  }
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const [mo, d] = [Number(m[1]), Number(m[2])];
    return validYear(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= lastDay(y, mo) ? day(y, mo, d) : null;
  }
  m = s.match(/\b(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const [mo, y] = [Number(m[1]), Number(m[2])];
    return validYear(y) && mo >= 1 && mo <= 12 ? month(y, mo) : null;
  }
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{4})\b/);
  if (m) {
    const mo = MONTH[m[1].slice(0, 3).toLowerCase()];
    const y = Number(m[3]);
    if (!mo || !validYear(y)) return null;
    if (m[2]) {
      const d = Number(m[2]);
      return d >= 1 && d <= lastDay(y, mo) ? day(y, mo, d) : null;
    }
    return month(y, mo);
  }
  return null;
}

/** Whether a reading's ISO day falls in the month of another ISO day — an
 *  end stated as a month alone, read inside that month. */
export const sameMonth = (todayIso: string, endIso: string): boolean => todayIso.slice(0, 7) === endIso.slice(0, 7);

/** Whether a reading's ISO day falls in the year of another ISO day — an
 *  end stated as a year alone ("2071"), read inside that year. */
export const sameYear = (todayIso: string, endIso: string): boolean => todayIso.slice(0, 4) === endIso.slice(0, 4);

type MetricRows =
  | {
      metrics?: Array<{ label: string; value: string }>;
      /** the interest as the extraction states it — its sentence and the
       *  loan's terms, read for the note's position */
      interest?: { summary?: string | null; loan?: string | null } | null;
    }
  | null
  | undefined;

// The note named AHEAD of the other loan: "senior to a $10M B-note", "ahead
// of the mezzanine loan", "a $5M mezzanine loan sits behind it".
const THIS_NOTE = String.raw`(?:it|this\s+(?:loan|note|mortgage|lien))\b`;
const RANKS_AHEAD = new RegExp(
  String.raw`\bsenior\s+to\b|\bahead\s+of\b|\bbehind\s+${THIS_NOTE}|\b(?:subordinat(?:e|ed)|junior)\s+to\s+${THIS_NOTE}`,
  "i",
);
// The note placed BEHIND another: "behind a $60M senior loan", "a position
// behind the senior lender", "subordinate to the A-note", "junior to the
// first mortgage". "Behind" alone is no position: a borrower "4 months
// behind on payments" is a payment status.
const RANKS_BEHIND = new RegExp(
  String.raw`\bbehind\s+(?!${THIS_NOTE})(?:an?|the|its|\$)[^.;]{0,60}?\b(?:loans?|liens?|mortgages?|notes?|lenders?|debt|financing)\b|\b(?:subordinat(?:e|ed)|junior)\s+to\b(?!\s+${THIS_NOTE})`,
  "i",
);
// Words that describe THIS note as subordinate by what it is: a second
// lien, a B-note or B-piece, a junior or subordinate participation, piece,
// note or lien, a note said to be junior, or the sale of a mezzanine loan.
const SUBORDINATE_SELF =
  /\b(?:second|2nd|third|3rd)[\s-]+(?:lien|mortgage|position|priority|trust[\s-]+deed|deed[\s-]+of[\s-]+trust)\b|\bb[\s-]?notes?\b|\bb[\s-]pieces?\b|\b(?:junior|subordinat(?:e|ed))[\s-]+(?:participations?|pieces?|tranches?|interests?|notes?|loans?|liens?|positions?|debt|financing|mortgages?)\b|\b(?:is|are|ranks?|sits?)\s+(?:junior|subordinat(?:e|ed))\b|\b(?:sale|offering|purchase|acquisition)\s+of\s+(?:an?|the)\s+(?:\$[\d.,]+\s*[mk]?\s+)?(?:(?:non[\s-]?)?performing\s+)?mezz(?:anine)?\b|\(\s*mezz(?:anine)?\s*\)/i;
// A junior piece OF a first loan is still junior: "a junior participation
// in a $50M first mortgage loan", "the B-note of a first mortgage".
const PIECE_OF_FIRST = /\b(?:junior|subordinat(?:e|ed)|b)[\s-]+(?:participations?|pieces?|tranches?|interests?|notes?)\s+(?:in|of)\b/i;
// A mention of other debt that does not say whose it is.
const OTHER_DEBT = /\bmezz(?:anine)?\b|\bjunior\b|\bsubordinat(?:e|ed)\b/i;
// The note's own first position.
const FIRST_SELF =
  /\b(?:first|1st)[\s-]+(?:lien|mortgage|position|priority|trust[\s-]+deed|deed[\s-]+of[\s-]+trust)\b|\bsenior\s+(?:secured\s+)?(?:loan|note|mortgage|lien|position|debt)\b|\bA-notes?\b/i;
// A mention struck by its own negation: "no mezzanine or junior debt", "not
// subordinated to any other debt", "without any subordinate financing",
// "non-subordinated". Its words are no evidence either way.
const SUB_KEY = String.raw`(?:mezz(?:anine)?|junior|subordinat(?:e|ed|ion)|b[\s-]?notes?|b[\s-]pieces?|second[\s-]+(?:liens?|mortgages?)|2nd[\s-]+(?:liens?|mortgages?)|other\s+(?:debt|liens?|financing))`;
const NEGATED = new RegExp(
  String.raw`\b(?:no|not|non|nor|without|never|neither|free\s+(?:and\s+clear\s+)?of)[\s-]+(?:(?:any|other|additional|further|outstanding|existing)\s+){0,3}${SUB_KEY}(?:\s*(?:,|\bor\b|\bnor\b|\band\b)\s*(?:(?:any|other)\s+)?${SUB_KEY})*(?:\s+(?:to|debt|loans?|liens?|financing|interests?|positions?|notes?)\b(?:\s+(?:any|other|the|an?)\b)*(?:\s+(?:debt|loans?|liens?|financing|mortgages?))?)?`,
  "gi",
);

/**
 * Where the words for a note place it (the audit of 2026-10-01: a first-lien
 * note "4 months behind on payments", or one stating "no mezzanine or junior
 * debt", had been printed as sitting behind a senior loan):
 * - "behind" where the words place THIS note behind other debt — a second
 *   lien, a B-note, a junior participation, "behind a $60M senior loan",
 *   "subordinate to the A-note" — unless they name it ahead of the other
 *   ("a $40M A-note senior to a $10M B-note");
 * - "first" where they name nothing behind which it sits, or name its own
 *   first position beside a mention of other debt ("first mortgage note;
 *   the borrower also has a mezzanine loan");
 * - "unclear" where they mention other debt and nothing places the note.
 * A negated mention is struck before any of it is read.
 */
export function notePosition(words: string | null | undefined): NotePosition {
  const w = (words ?? "").replace(NEGATED, " ");
  const behind = RANKS_BEHIND.test(w);
  if (RANKS_AHEAD.test(w) && !behind) return "first";
  if (behind) return "behind";
  const first = FIRST_SELF.test(w);
  if (SUBORDINATE_SELF.test(w)) return first && !PIECE_OF_FIRST.test(w) ? "first" : "behind";
  if (OTHER_DEBT.test(w)) return first ? "first" : "unclear";
  return "first";
}

/** Whether a note's loan-to-value must be withheld: its words place it
 *  behind other debt, or name other debt with no order stated — a
 *  loan-to-value withheld is the error that prints no wrong figure. */
export function isSubordinateNote(words: string | null | undefined): boolean {
  return notePosition(words) !== "first";
}

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

// The loan ahead of a note, by its own name: its rows are never the note's
// own terms ("Senior loan balance" is not this note's balance, "Senior loan
// maturity" not its maturity).
const SENIOR_LOAN = /\bsenior\s+(?:loan|mortgage|debt|lien|financing)\b/i;
// The row the extraction labels "Senior loan balance": that loan's balance,
// and no other of its terms ("Senior loan rate" is no balance).
const SENIOR_BALANCE_ROW =
  /^\s*senior\s+(?:loan|mortgage|debt|lien|financing)(?:\s+(?:balance|amount|outstanding|upb))?\s*(?:\([^)]*\))?\s*$/i;

/** The rows a note's terms are read from — one finder behind the reader
 *  and the key-terms block that leads with them. */
function noteRowsOf(ex: MetricRows) {
  // The note's own terms, never the senior loan's.
  const own = (re: RegExp, not?: RegExp) => rowOf(ex, re, not ? new RegExp(`${not.source}|${SENIOR_LOAN.source}`, "i") : SENIOR_LOAN);
  return {
    balanceRow: own(/unpaid principal|\bupb\b|outstanding (loan |note )?balance|(loan|note) balance/i),
    seniorRow: rowOf(ex, SENIOR_BALANCE_ROW),
    rateRow: own(/^(note|interest|coupon|contract) rate\b|^coupon\b|note coupon/i),
    // "Yield to maturity" is a return, not the date the loan comes due; an
    // extended maturity is the borrower's option, not the contract's date.
    maturityRow: own(/maturity|matures/i, /yield|\bytm\b|extension|extended/i),
    amortRow: own(/amorti[sz]ation|amortizing/i),
    // An interest-only row says how long the interest-only period runs — its
    // figure is that period, never an amortization.
    ioRow: own(/interest[- ]only|\bi\/?o\b/i, /amorti[sz]/i),
    statusRow: own(/payment status|performing|delinquen|default status|loan status/i),
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
 *  — each only as stated, null where the OM says nothing. Its position is
 *  read from the interest's own sentence and terms and the note's rows. */
export function readNoteTerms(ex: MetricRows): NoteTerms {
  const { balanceRow, seniorRow, rateRow, maturityRow, amortRow, ioRow, statusRow, valueRow } = noteRowsOf(ex);
  // The payment status is no position ("4 months behind on payments"), so
  // its row is not read for one.
  const position = [
    ex?.interest?.summary,
    ex?.interest?.loan,
    ...[balanceRow, rateRow, maturityRow, amortRow, ioRow].flatMap((r) => (r ? [r.label, r.value] : [])),
  ]
    .filter(Boolean)
    .join(". ");
  const placed = notePosition(position);

  const amortText = amortRow?.value ?? "";
  const statesIo =
    /interest[- ]only|\bi\/?o\b/i.test(amortText) || (ioRow != null && !/^\s*(none|no|n\/a|0)\b/i.test(ioRow.value));
  // The amortization in years, or in months of at least five years — a
  // shorter count of months in the same line is the interest-only period.
  const yearsHit = amortText.match(/(\d{1,2})\s*(?:years?|yrs?|-year)/i);
  const monthsHit = amortText.match(/(\d{2,3})\s*(?:-month|months?|mos?\b)/i);
  const years = yearsHit ? Number(yearsHit[1]) : monthsHit && Number(monthsHit[1]) >= 60 ? Number(monthsHit[1]) / 12 : NaN;
  const amortYears = Number.isFinite(years) && years > 0 ? years : null;
  // A month alone is its last day (`parseMaturity`'s rule), marked so its
  // last month says "this month".
  const maturity = maturityRow ? readStatedDate(maturityRow.value, 1990, 2100, "last") : null;
  const statusText = statusRow ? `${statusRow.label} ${statusRow.value}`.toLowerCase() : "";
  const status: NoteStatus | null = !statusRow
    ? null
    : /non[- ]?performing|delinquen|default|foreclos|bankrupt|reo\b|past due|matured and unpaid/.test(statusText)
      ? "non_performing"
      : /performing|current/.test(statusText)
        ? "performing"
        : null;
  // The loan ahead of the note, only where the words place the note behind
  // it and the row states a sum: a share of value ("65% LTV") is no balance.
  const senior = placed === "behind" && seniorRow && !/%|percent/i.test(seniorRow.value) ? money(seniorRow.value) : null;

  return {
    balance: balanceRow ? money(balanceRow.value) : null,
    ratePct: rateRow ? pct(rateRow.value) : null,
    maturity: maturity?.iso ?? null,
    ...(maturity?.month ? { maturityIsMonth: true } : {}),
    // Both stated is neither: the OM does not say which applies from today.
    interestOnly: statesIo ? (amortYears != null ? null : true) : amortYears != null ? false : null,
    amortYears,
    status,
    collateralValue: valueRow ? money(valueRow.value) : null,
    subordinate: placed !== "first",
    position: placed,
    ...(senior != null ? { seniorBalance: senior } : {}),
  };
}

// ── Running the note ────────────────────────────────────────────────────

/** Whole months from one day to another — a month is counted only once its
 *  day is reached, so a note maturing on the 1st, read on the 15th, has one
 *  month fewer than the calendar suggests. The count the arithmetic runs on
 *  (a month of interest is a whole month); never what says a day is past,
 *  since every day of the last month counts none (`daysBetween`). */
export function monthsBetween(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** Whole days from one ISO day to another, in UTC — negative where the
 *  second is earlier. What a sentence that says a date is past, due or
 *  before another is decided by: whole months call a day four weeks off
 *  "none left", and read a maturity next month as one gone by. */
export function daysBetween(fromIso: string, toIso: string): number {
  const at = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(toIso) - at(fromIso)) / 86_400_000);
}

/**
 * Years from one ISO day to another, to the day: the whole months, and the
 * days past the last of them as a share of the month they fall in, over
 * twelve. Equal to whole months ÷ 12 wherever the two days of the month
 * are the same — the anniversaries a hold's years end on — so a date one
 * day past an anniversary is in the year after it, where whole months put
 * a lease ending 12 months and 17 days out "in year 1".
 */
export function yearsBetween(fromIso: string, toIso: string): number {
  const months = monthsBetween(fromIso, toIso);
  const [y, m, d] = fromIso.split("-").map(Number);
  // The day the whole months reach, and the one a month on, each held to its
  // month's last day (Jan 31 and a month is Feb 28).
  const anchor = (k: number) => {
    const last = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();
    const at = new Date(Date.UTC(y, m - 1 + k, Math.min(d, last)));
    return at.toISOString().slice(0, 10);
  };
  const from = anchor(months);
  const span = daysBetween(from, anchor(months + 1));
  return (months + daysBetween(from, toIso) / span) / 12;
}

/**
 * The note at a price, on a day. Null without a balance or a price — there
 * is no note to read. Each figure is null where its own inputs are.
 */
export function readNote(terms: NoteTerms, price: number | null, asOf: Date): NoteRead | null {
  if (price == null || !(price > 0) || terms.balance == null || !(terms.balance > 0)) return null;
  const balance = terms.balance;
  const today = iso(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, asOf.getUTCDate());
  // Past maturity by the DAY (the time audit of 2026-10-01): whole months
  // called a note maturing in four weeks one gone by, "past its Mar 2028
  // maturity" on Feb 2. The day itself is due, not past.
  const daysLeft = terms.maturity ? daysBetween(today, terms.maturity) : null;
  // A maturity stated as a month alone is due all that month, and past only
  // once the month is out — whichever of its days the reading took.
  const thisMonth = !!terms.maturityIsMonth && !!terms.maturity && sameMonth(today, terms.maturity);
  const matured = !thisMonth && daysLeft != null && daysLeft < 0;
  // The whole months the yield runs over — none inside the last month, so a
  // note due within it has no yield to maturity to solve (a month's
  // payments are the arithmetic's unit).
  const months = terms.maturity && !matured ? Math.max(0, monthsBetween(today, terms.maturity)) : null;
  const r = terms.ratePct != null ? terms.ratePct / 100 : null;

  let ytmPct: number | null = null;
  let paymentBasis: string | null = null;
  if (r != null && months != null && months >= 1) {
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
    monthsLeft: months,
    daysLeft,
    ytmPct,
    paymentBasis,
    // Behind a senior loan the note's last dollar sits on top of the senior
    // balance: never struck on the note's own balance alone.
    ltvAtBalancePct: terms.collateralValue != null && !terms.subordinate ? (balance / terms.collateralValue) * 100 : null,
    ltvAtPricePct: terms.collateralValue != null && !terms.subordinate ? (price / terms.collateralValue) * 100 : null,
    // …and read on top of it where the memorandum states it.
    ...stackOf(terms, balance, price),
    matured,
    thisMonth,
  };
}

/** Behind a senior loan whose balance the memorandum states, the stack over
 *  the collateral's stated value: the senior alone, with the note's balance,
 *  and with the price — each null without both stated figures, and on a
 *  note the words do not place behind it. */
function stackOf(terms: NoteTerms, balance: number, price: number): Pick<NoteRead, "seniorLtvPct" | "stackAtBalancePct" | "stackAtPricePct"> {
  const value = terms.collateralValue;
  const senior = terms.seniorBalance;
  if (!terms.subordinate || terms.position === "unclear" || senior == null || !(senior > 0) || value == null || !(value > 0)) {
    return { seniorLtvPct: null, stackAtBalancePct: null, stackAtPricePct: null };
  }
  return {
    seniorLtvPct: (senior / value) * 100,
    stackAtBalancePct: ((senior + balance) / value) * 100,
    stackAtPricePct: ((senior + price) / value) * 100,
  };
}
