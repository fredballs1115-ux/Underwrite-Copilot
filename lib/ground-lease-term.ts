// When the ground lease ends (#421). A leasehold is a wasting asset — at the
// lease's end the building reverts to the landowner — so the one fact that
// decides what it is worth at any date is how many years of the lease are
// left then. This reads that fact off the rows the extraction files it
// under, and nothing else: no lease is assumed to run ninety-nine years, and
// a term the memorandum does not state is left unread.
//
// Pure: the rows come in, nothing is read.
//
// Three readings, best first:
//
//   1. A STATED DATE ("December 31, 2071", "12/31/2071"), taken as written —
//      the only reading that does not go stale as the memorandum ages.
//   2. A STATED YEAR alone ("2071"), read as the year's FIRST day: the
//      earliest end the year allows, so a leasehold is never credited with
//      months the lease may not have.
//   3. YEARS REMAINING ("45 years"), counted from today — and said so, since
//      the memorandum's own date is earlier than today and its count was
//      true then.
//
// The current term is read apart from its extension options. An option is
// the leaseholder's to exercise, and its rent usually resets to market when
// it is, so a term "including options" is the ceiling, never the term; the
// options are read where they parse ("four 10-year options", "2 x 25
// years", "to 2111") and kept as stated where they do not. A purchase
// option — the right to buy the land — is not an extension and is never
// read as one.

import { parsePageNumber } from "@/lib/facts";
import { monthsBetween, parseStatedDate } from "@/lib/note-yield";

type MetricRow = { label: string; value: string; page?: string };
type Rows = { metrics?: MetricRow[]; totalPages?: number } | null | undefined;

export interface GroundLeaseTerm {
  /** the current term's end, an ISO date */
  ends: string;
  /** how the end was read: a stated date, a stated year alone (its first
   *  day), or years remaining counted from today */
  from: "date" | "year" | "remaining";
  /** the row's own words, as stated */
  stated: string;
  /** years left on the reading's date — negative where the stated end has
   *  passed */
  yearsLeft: number;
  /** the stated term already counts the extension options — a ceiling */
  includesOptions: boolean;
  /** the extension options as they parse: the years they add in all, and
   *  how they were read ("four of 10 years", "to 2111") */
  options: { years: number; how: string } | null;
  /** the options' own words ("" where none are stated) */
  optionsStated: string;
  /** the term's page, cited only inside the memorandum */
  page: string;
}

// A ground lease's row, and never a purchase option's or a tenant's lease.
const GROUND = /ground\s*lease|land\s*lease/i;
const END_ROW = /expir|\bends?\b|terminat|maturity|end\s+date/i;
const LEFT_ROW = /remaining|unexpired|\bleft\b/i;
const OPTION_ROW = /option|extension|renewal/i;
const PURCHASE = /purchase|\bbuy\b|acqui|first\s+refusal|first\s+offer|\brofr\b|\brofo\b/i;

// Where the options clause begins in a value that states the term and then
// its options: "December 31, 2071, with four 10-year options".
const OPTIONS_CLAUSE = /\(|\b(?:with|including|includes|inclusive|incl\.?|plus|options?|extensions?|extended|renewals?|renewable|unless)\b/i;
// A term that already counts its options.
const INCLUDES_OPTIONS =
  /\binclu(?:d|s)\w*\b[^.;]{0,40}\boptions?\b|\bfully[- ]extended\b|\bif\s+(?:all\s+|every\s+)?(?:the\s+)?(?:extension\s+|renewal\s+)?options?\s+(?:are\s+)?exercised\b/i;

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};
const COUNT_WORD = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const rowOf = (rows: Rows, re: RegExp, not?: RegExp) =>
  (rows?.metrics ?? []).find(
    (m) => GROUND.test(m.label) && re.test(m.label) && !(not && not.test(m.label)) && !PURCHASE.test(m.label),
  ) ?? null;

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** Whole months from today, as an ISO date: `years` may carry a part-year. */
function addYears(asOf: Date, years: number): string {
  const months = Math.round(years * 12);
  return isoOf(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + months, asOf.getUTCDate())));
}

/** A date a text states; a year alone as its first day. */
function dateOf(text: string): { ends: string; from: "date" | "year" } | null {
  const d = parseStatedDate(text, 1900, 2399);
  if (d) return { ends: d, from: "date" };
  const y = text.match(/\b(19\d{2}|2[0-3]\d{2})\b/);
  return y ? { ends: `${y[1]}-01-01`, from: "year" } : null;
}

/** The date a value states before any options clause — else anywhere in it. */
function endOf(value: string): { ends: string; from: "date" | "year" } | null {
  const cut = value.split(OPTIONS_CLAUSE)[0] ?? "";
  return (cut.trim() ? dateOf(cut) : null) ?? dateOf(value);
}

/** Years stated as a count: "45 years", "45 years, 6 months", "45.5 yrs". */
function yearsOf(value: string): number | null {
  const cut = value.split(OPTIONS_CLAUSE)[0] || value;
  const m = cut.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b(?:[\s,]+(?:and\s+)?(\d{1,2})\s*(?:months?|mos?)\b)?/i);
  if (!m) return null;
  const years = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
  return years > 0 && years <= 999 ? years : null;
}

/**
 * The extension options as stated, where they parse as a count and a
 * length: "Four (4) ten (10) year options", "four 10-year options", "4 x
 * 10 years", "three successive 10-year options", "one 25-year renewal
 * option", "a 10-year option". Null where they do not — the words are kept
 * by the caller, never guessed at.
 */
export function readOptions(text: string): { years: number; how: string } | null {
  let s = ` ${text.toLowerCase()} `;
  s = s.replace(/\btwenty[- ]five\b/g, "25");
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty)\b/g, (w) => String(NUM_WORDS[w]));
  // "4 (4)", "10 (10)": the parenthetical repeats the figure.
  s = s.replace(/(\d+)\s*\(\s*\1\s*\)/g, "$1");
  let count: number | null = null;
  let each: number | null = null;
  // A count, then — after an "x", or a space and up to two words ("three
  // successive") — the length. A separator is required: "25-year" is one
  // option of twenty-five years, never two of five.
  const pair = s.match(/\b(\d{1,2})(?:\s*[x×]\s*|\s+(?:[a-z]+\s+){0,2})(\d{1,3})[\s-]*(?:years?|yrs?)\b/);
  if (pair) {
    count = Number(pair[1]);
    each = Number(pair[2]);
  } else {
    const one = s.match(/\b(\d{1,3})[\s-]*(?:years?|yrs?)\b[^.;]{0,24}\boption\b(?!s)/);
    if (one) {
      count = 1;
      each = Number(one[1]);
    }
  }
  if (count == null || each == null || count < 1 || count > 10 || each < 1 || each > 99 || count * each > 199) return null;
  return {
    years: count * each,
    how: `${COUNT_WORD[count] ?? String(count)} of ${each} ${each === 1 ? "year" : "years"}`,
  };
}

/**
 * The ground lease's term, on a day. Null where the memorandum states no
 * end, no year and no years remaining for it — nothing is assumed.
 */
export function readGroundLeaseTerm(rows: Rows, asOf: Date = new Date()): GroundLeaseTerm | null {
  const today = isoOf(asOf);
  const endRow = rowOf(rows, END_ROW, OPTION_ROW);
  const leftRow = rowOf(rows, LEFT_ROW);
  const optionRow = rowOf(rows, OPTION_ROW, LEFT_ROW);

  let read: { ends: string; from: GroundLeaseTerm["from"]; row: MetricRow } | null = null;
  const stated = endRow ? endOf(endRow.value) : null;
  if (stated && endRow) read = { ...stated, row: endRow };
  if (!read && leftRow) {
    const years = yearsOf(leftRow.value);
    if (years != null) read = { ends: addYears(asOf, years), from: "remaining", row: leftRow };
    else {
      // A "remaining" row that states the end instead.
      const d = endOf(leftRow.value);
      if (d) read = { ...d, row: leftRow };
    }
  }
  if (!read) return null;

  const yearsLeft = monthsBetween(today, read.ends) / 12;
  // A purchase option in the same breath is not an extension.
  const words = `${read.row.label} ${read.row.value}`.replace(/[^.;]*\b(?:purchase|buy|first refusal|first offer)\b[^.;]*/gi, "");
  const includesOptions = INCLUDES_OPTIONS.test(words);
  // The options, from their own row, or from the term's row where it states
  // them after the term ("…, with four 10-year options").
  const optionsText = (optionRow?.value ?? read.row.value.match(/\b(?:with|plus)\b[^.;]*\boptions?\b[^.;]*/i)?.[0] ?? "").trim();
  let options: GroundLeaseTerm["options"] = null;
  if (!includesOptions && optionsText) {
    options = readOptions(optionsText);
    if (!options) {
      // Options stated as the date they run to: "extendable to 2111".
      const to = dateOf(optionsText.replace(/\b\d{1,3}[\s-]*(?:years?|yrs?)\b/gi, ""));
      const years = to ? monthsBetween(read.ends, to.ends) / 12 : 0;
      if (to && years >= 1 && years <= 199) {
        const [y, m] = to.ends.split("-").map(Number);
        options = { years, how: `to ${to.from === "year" ? String(y) : `${MONTHS[m - 1]} ${y}`}` };
      }
    }
  }

  const pageCount = typeof rows?.totalPages === "number" && rows.totalPages > 0 ? rows.totalPages : null;
  const n = parsePageNumber(read.row.page);
  const page = n != null && pageCount != null && n <= pageCount ? (read.row.page ?? "").trim() : "";

  return {
    ends: read.ends,
    from: read.from,
    stated: read.row.value.trim(),
    yearsLeft,
    includesOptions,
    options,
    optionsStated: optionsText,
    page,
  };
}

// ── Saying it ───────────────────────────────────────────────────────────

/** "Dec 2071"; a year alone as the year. */
export function termEndLabel(t: Pick<GroundLeaseTerm, "ends" | "from">): string {
  const [y, m] = t.ends.split("-").map(Number);
  return t.from === "year" ? String(y) : `${MONTHS[m - 1]} ${y}`;
}

/** Years on the tenths, a whole number without its ".0": "45.2 years",
 *  "40 years", "1 year". */
export function yearsText(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${Number.isInteger(v) ? String(v) : v.toFixed(1)} ${v === 1 ? "year" : "years"}`;
}

/** The options, in a clause after the term: ", with extension options
 *  after it — four of 10 years, 40 years in all". */
function optionsClause(t: GroundLeaseTerm): string {
  if (t.includesOptions) return " — a term that already counts its extension options, so a ceiling rather than the term";
  if (t.options) {
    return t.options.how.startsWith("to ")
      ? `, with extension options as stated running it ${t.options.how}`
      : `, with extension options after it as stated: ${t.options.how}, ${Math.round(t.options.years)} years in all`;
  }
  return t.optionsStated ? `, with extension options as stated: ${t.optionsStated.replace(/\.$/, "")}` : "";
}

/**
 * The term in one sentence, for the panel, the deal context and the
 * challenger: when it ends, how far off that is, and how it was read.
 */
export function groundLeaseTermLine(t: GroundLeaseTerm): string {
  const end = termEndLabel(t);
  if (t.yearsLeft <= 0) {
    return `The ground lease's stated end, ${end}, has passed — the term as read cannot be right: check the lease and any extension already exercised`;
  }
  const opts = optionsClause(t);
  switch (t.from) {
    case "date":
      return `The ground lease ends ${end}, ${yearsText(t.yearsLeft)} from today${opts}`;
    case "year":
      return `The ground lease ends in ${end}, ${yearsText(t.yearsLeft)} from today — the memorandum states the year alone, read as its first day${opts}`;
    case "remaining":
      return `The memorandum states ${t.stated.replace(/\.$/, "")} left on the ground lease; counted from today they run to about ${end}, and the memorandum's own date is earlier, so the term may be shorter${opts}`;
  }
}
