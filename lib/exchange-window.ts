// The buyer's 1031 clock beside a deal (research pass 28, round 4). A buyer
// in an exchange has two deadlines that run from one day, and a deal whose
// offers are due after the first of them cannot be the property it buys.
// /tools draws the clock for a sale typed in (lib/tools/exchange-1031); this
// reads the buy box's own exchange — the day the relinquished property was
// transferred, who files the return — against a deal's offers-due date and
// what its price buys.
//
// Pure — no I/O. Every rule below is the law's own words, printed from the
// GitHub runner (the sandbox cannot reach them):
//   - 26 U.S.C. 1031 (Cornell's LII, zori probe run 37264018671): "No gain or
//     loss shall be recognized on the exchange of real property held for
//     productive use in a trade or business or for investment if such real
//     property is exchanged solely for real property of like kind…"; the
//     property must be "identified … on or before the day which is 45 days
//     after the date on which the taxpayer transfers the property
//     relinquished", and received before "the day which is 180 days after"
//     that date "or the due date (determined with regard to extension) for
//     the transferor's return … for the taxable year in which the transfer
//     of the relinquished property occurs", whichever is earlier.
//   - The return's due date, from the IRS's own instructions (zori probe run
//     37263890273): Form 1040, "April 15"; Form 1041, "Calendar-year estates
//     and trusts must file Form 1041 by April 15"; Form 1120, "the 15th day
//     of the 4th month after the end of its tax year"; Form 1065, "For
//     calendar-year partnerships, the due date is March 15"; Form 1120-S,
//     "the 15 day of the 3rd month after the end of its tax year". Each adds
//     that a due date on a weekend or a legal holiday moves to the next
//     business day; the window is read to the 15th, the earlier day.
//   - 26 CFR 1.1031(a)-1 (zori probe run 37263921236): its example of a
//     leasehold like kind to real estate is "a leasehold of a fee with 30
//     years or more to run".
//
// Five rules.
//
// THE TWO CLOCKS RUN FROM ONE DAY — the relinquished property's transfer.
//
// THE RETURN CUTS THE 180 DAYS — the filer's own calendar-year due date,
// unless the return is extended; a filer not set is read as an individual,
// and said so, with the partnership's earlier date beside it.
//
// OFFERS DUE AFTER THE IDENTIFICATION DEADLINE IS A DATE FACT — the deal can
// be identified only before it is bid on; said, never judged.
//
// WHAT THE PRICE BUYS MUST BE REAL PROPERTY — a note, a share of the owning
// entity, a preferred equity position in it and a short leasehold are each a
// QUESTION for the buyer's exchange counsel, never a determination.
//
// A BLANK IS NULL — no exchange in the buy box, nothing said; an offers-due
// date that is not a whole day is not compared.

import type { InterestKind } from "@/lib/anthropic/types";
import { EXCHANGE_DAYS, IDENTIFY_DAYS } from "@/lib/tools/exchange-1031";

export type ExchangeFiler = "individual" | "partnership" | "s_corporation" | "c_corporation" | "trust";

/** Who files the return the exchange period can end at, its form, and the
 *  month of its calendar-year due date (the IRS's instructions, above). */
export const EXCHANGE_FILERS: ReadonlyArray<{ id: ExchangeFiler; label: string; form: string; dueMonth: 3 | 4 }> = [
  { id: "individual", label: "An individual", form: "Form 1040", dueMonth: 4 },
  { id: "partnership", label: "A partnership", form: "Form 1065", dueMonth: 3 },
  { id: "s_corporation", label: "An S corporation", form: "Form 1120-S", dueMonth: 3 },
  { id: "c_corporation", label: "A C corporation", form: "Form 1120", dueMonth: 4 },
  { id: "trust", label: "A trust or an estate", form: "Form 1041", dueMonth: 4 },
];

/** The buy box's exchange (stored in its jsonb): the day the relinquished
 *  property was transferred, who files the return, whether it is extended. */
export interface ExchangeBlock {
  relinquishedTransferOn: string | null;
  filer?: ExchangeFiler | null;
  returnExtended?: boolean | null;
}

export interface ExchangeWindow {
  transferOn: string;
  identifyBy: string;
  /** the 180th day */
  fullCloseBy: string;
  /** the filer's calendar-year due date for the transfer's year */
  returnDueBy: string;
  /** the earlier of the two, or the 180th day where the return is extended */
  closeBy: string;
  /** the return's due date ends the window before its 180th day */
  cutShort: boolean;
  /** the filer as set; null where the buy box names none (read as an
   *  individual's return, and said) */
  filer: ExchangeFiler | null;
  form: string;
  extended: boolean;
  /** where the clock stands on the day read: not yet begun (a planned
   *  sale), identifying, closing, or over */
  phase: "ahead" | "identify" | "close" | "over";
  /** whole days from the day read to each deadline (negative once past) */
  daysToIdentify: number;
  daysToClose: number;
  sentence: string;
}

/** An ISO date as a UTC day number, or null — a real calendar day only. */
function dayOf(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  if (new Date(t).toISOString().slice(0, 10) !== iso) return null;
  return Math.round(t / 86_400_000);
}
const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const todayOf = (asOf: Date) => Math.floor(asOf.getTime() / 86_400_000);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 19, 2026" */
export function exchangeDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
const days = (n: number) => `${n} ${Math.abs(n) === 1 ? "day" : "days"}`;
/** "today", "in 1 day", "in 12 days" — after a deadline's date. */
const when = (n: number) => (n === 0 ? "today" : `in ${days(n)}`);

/**
 * The exchange's two deadlines from the buy box, on a day. Null where the
 * buy box holds no exchange or its transfer day is not a calendar day.
 */
export function exchangeWindow(block: ExchangeBlock | null | undefined, asOf: Date = new Date()): ExchangeWindow | null {
  const start = dayOf(block?.relinquishedTransferOn ?? null);
  if (start === null || !block) return null;
  const filer = block.filer ?? null;
  const f = EXCHANGE_FILERS.find((x) => x.id === (filer ?? "individual"))!;
  const year = Number(block.relinquishedTransferOn!.slice(0, 4));
  const due = Math.round(Date.UTC(year + 1, f.dueMonth - 1, 15) / 86_400_000);
  const identify = start + IDENTIFY_DAYS;
  const full = start + EXCHANGE_DAYS;
  const extended = block.returnExtended === true;
  const close = extended ? full : Math.min(full, due);
  const today = todayOf(asOf);
  const phase: ExchangeWindow["phase"] = today < start ? "ahead" : today <= identify ? "identify" : today <= close ? "close" : "over";
  const w: Omit<ExchangeWindow, "sentence"> = {
    transferOn: isoOf(start),
    identifyBy: isoOf(identify),
    fullCloseBy: isoOf(full),
    returnDueBy: isoOf(due),
    closeBy: isoOf(close),
    cutShort: !extended && due < full,
    filer,
    form: f.form,
    extended,
    phase,
    daysToIdentify: identify - today,
    daysToClose: close - today,
  };
  return { ...w, sentence: windowSentence(w) };
}

function windowSentence(w: Omit<ExchangeWindow, "sentence">): string {
  const from = `from the ${exchangeDay(w.transferOn)} transfer`;
  const cut = w.cutShort
    ? ` — ${w.filer ? "a calendar-year" : "an individual's"} ${w.form} return is due ${exchangeDay(w.returnDueBy)}, which ends it before the 180th day unless the return is extended`
    : w.extended
      ? " — the return is extended, so the full 180 days"
      : "";
  // A filer not set is read as an individual's return: said, with the
  // earlier date a partnership's or an S corporation's return would set —
  // only where that date would end the window sooner.
  const year = Number(w.transferOn.slice(0, 4));
  const march = Math.round(Date.UTC(year + 1, 2, 15) / 86_400_000);
  const unset =
    !w.filer && !w.extended && march < (dayOf(w.closeBy) ?? 0)
      ? ` A partnership's or an S corporation's calendar-year return is due ${exchangeDay(isoOf(march))}, which would end it sooner; set who files in the buy box.`
      : "";
  switch (w.phase) {
    case "ahead":
      return `Your exchange's clock starts at the ${exchangeDay(w.transferOn)} transfer: identify by ${exchangeDay(w.identifyBy)}, close by ${exchangeDay(w.closeBy)}${cut}.${unset}`;
    case "identify":
      return `Identify your replacement property by ${exchangeDay(w.identifyBy)} (${when(w.daysToIdentify)}), the 45th day ${from}; close by ${exchangeDay(w.closeBy)}${cut}.${unset}`;
    case "close":
      return `Your identification period ended ${exchangeDay(w.identifyBy)}; the exchange must close by ${exchangeDay(w.closeBy)} (${when(w.daysToClose)})${cut}.${unset}`;
    case "over":
      return `Your exchange period ended ${exchangeDay(w.closeBy)}.`;
  }
}

/** One thing the deal and the exchange say together — a date fact or a
 *  question for exchange counsel, never a verdict. */
export interface ExchangeFlag {
  kind: "after_identify" | "id_period_over" | "after_close" | "note" | "entity_share" | "position" | "short_leasehold";
  text: string;
}

export interface ExchangeFit {
  flags: ExchangeFlag[];
  /** the pipeline's tag: the first flag's, else the identification day */
  tag: string | null;
}

const ASK = "a question for your exchange counsel";
const REAL_PROPERTY = "Section 1031 reaches only real property exchanged for real property of like kind";

/**
 * The deal against the exchange: its offers-due day against the two
 * deadlines, and what its price buys. Null where there is no window, or the
 * exchange is over.
 */
export function exchangeFit(
  w: ExchangeWindow | null,
  deal: {
    /** the deal's offers-due day (lib/offering's `iso`), or null */
    offersDueIso: string | null;
    interestKind: InterestKind | null;
    /** the lease's years left today and its options' years, where the
     *  price buys a leasehold (lib/interest's term) */
    leaseYearsLeft?: number | null;
    leaseOptionYears?: number | null;
  },
): ExchangeFit | null {
  if (!w || w.phase === "over") return null;
  const flags: ExchangeFlag[] = [];
  const due = dayOf(deal.offersDueIso);
  const identify = dayOf(w.identifyBy)!;
  const close = dayOf(w.closeBy)!;
  if (due !== null && due > close) {
    flags.push({
      kind: "after_close",
      text: `Offers are due ${exchangeDay(deal.offersDueIso!)}, after your exchange must close, ${exchangeDay(w.closeBy)}.`,
    });
  } else if (w.phase === "close") {
    // The identification period is over: a deal not identified by then is
    // not in the exchange, whenever its offers are due.
    flags.push({
      kind: "id_period_over",
      text: `Your identification period ended ${exchangeDay(w.identifyBy)}: this deal can be in your exchange only if it was among the properties identified by then.`,
    });
  } else if (due !== null && due > identify) {
    flags.push({
      kind: "after_identify",
      text: `Offers are due ${exchangeDay(deal.offersDueIso!)}, after your identification deadline, ${exchangeDay(w.identifyBy)}: to keep it in your exchange it must be identified by ${exchangeDay(w.identifyBy)}, before it is bid on.`,
    });
  }
  if (deal.interestKind === "note") {
    flags.push({ kind: "note", text: `The price buys a loan secured by the building, not the building. ${REAL_PROPERTY}; whether a note counts is ${ASK}.` });
  } else if (deal.interestKind === "partial_interest") {
    flags.push({
      kind: "entity_share",
      text: `The price buys a share of the owning entity, not the building. ${REAL_PROPERTY}; whether this share counts is ${ASK}.`,
    });
  } else if (deal.interestKind === "preferred_equity") {
    // An interest in the entity, as a share is — a preferred return and a
    // redemption, never the building (lib/position).
    flags.push({
      kind: "position",
      text: `The price buys a preferred equity position in the owning entity, not the building. ${REAL_PROPERTY}; whether this position counts is ${ASK}.`,
    });
  } else if (deal.interestKind === "leasehold" && deal.leaseYearsLeft != null && deal.leaseYearsLeft < 30) {
    const left = Math.floor(deal.leaseYearsLeft);
    // Under a year left is said as that, never "0 years" (the batch-2 audit).
    const leftWords = left < 1 ? "under a year" : `${left} ${left === 1 ? "year" : "years"}`;
    const opts = deal.leaseOptionYears && deal.leaseOptionYears > 0 ? `, ${Math.round(deal.leaseOptionYears)} more in its options as stated` : "";
    flags.push({
      kind: "short_leasehold",
      text: `The price buys a leasehold with ${leftWords} left${opts}. The regulation's example of a leasehold like kind to real estate is "a leasehold of a fee with 30 years or more to run"; whether this one counts, its options included or not, is ${ASK}.`,
    });
  }
  const tag = flags.length
    ? TAG[flags[0].kind]
    : w.phase === "identify" || w.phase === "ahead"
      ? `1031: identify by ${exchangeDay(w.identifyBy).replace(/, \d{4}$/, "")}`
      : `1031: close by ${exchangeDay(w.closeBy).replace(/, \d{4}$/, "")}`;
  return { flags, tag };
}

const TAG: Record<ExchangeFlag["kind"], string> = {
  after_identify: "1031: offers due after ID",
  id_period_over: "1031: ID period over",
  after_close: "1031: offers due after close",
  note: "1031: note — ask counsel",
  entity_share: "1031: share — ask counsel",
  position: "1031: position — ask counsel",
  short_leasehold: "1031: lease under 30 yrs",
};

/** The exchange read in one line for the memo and the verdict's brief: the
 *  clock, then the first flag. */
export function exchangeShortLine(w: ExchangeWindow, fit: ExchangeFit | null): string {
  const clock =
    w.phase === "identify" || w.phase === "ahead"
      ? `1031 exchange: identify by ${exchangeDay(w.identifyBy)}, close by ${exchangeDay(w.closeBy)}`
      : `1031 exchange: close by ${exchangeDay(w.closeBy)}`;
  const first = fit?.flags[0]?.text.replace(/\.$/, "");
  return first ? `${clock}; ${first.charAt(0).toLowerCase()}${first.slice(1)}` : clock;
}
