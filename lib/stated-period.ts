// The period a stated figure is for, read off its own words — ONE reader for
// an income stated a month at a time (lib/mixed-use's two incomes, a sandwich
// position's two rents, by `statedIncomeOf`) and an NOI the memorandum states
// a month at a time (lib/deal-strategy's NOI readers, by `monthFigureOf`;
// research pass 40: "NOI (monthly) $85,000" against a $17,000,000 price had
// run as a year's $85,000 everywhere). It lives apart from both, since
// lib/mixed-use reaches lib/deal-strategy through the tenant roster.
//
// Pure — no I/O. Three rules: the words attached to the figure decide its
// period, and the row's label only where those words state none; a month and
// a year stated together are read as the year, and only where the two agree
// within 1% (a month is a twelfth of the year); and a figure whose words say
// no month is never annualised.

import { parseMoney } from "@/lib/criteria";
import { statesRange } from "@/lib/money";

/** A value that states nothing: "N/A", "Not stated", "TBD", a dash. */
export const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|none|[-–—])?\.?$/i;

/** A rent per unit by another name: an average, a mean or a typical rent
 *  is one unit's, never the building's year (the audit of 2026-10-05:
 *  "Residential rent: $1,850/mo average" read as $22k of residential
 *  income, and the commercial as 96.5% of the building's). */
export const PER_UNIT_WORDS = /\baverage\b|\bavg\b|\bmean\b|\btypical\b/i;

/** A figure stated a month at a time, by its own words. */
export const MONTH_WORDS = /\/\s*mo(?:nth)?\b|\bper\s+(?:month|mo)\b|\bmonthly\b|\ba\s+month\b/i;
/** A figure stated a year at a time, by its own words. */
const YEAR_WORDS = /\/\s*(?:yr|year)\b|\bper\s+(?:year|annum|yr)\b|\bannual(?:ly)?\b|\byearly\b|\ba\s+year\b/i;
/** A rate rather than an income: per foot, per unit or per key. */
const RATE_WORDS = /\/\s*(?:sf|sq|unit|door|key)\b|\bper\s+(?:sf|sq|square|unit|door|key)\b|psf\b/i;
/** A second dollar figure, whole: "$91,667", "$1.1", "91,667". */
const OTHER_FIGURE = /\$\s*\d[\d,]*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?/;
/** Where the words attached to a figure end: a bracket, a semicolon, a
 *  clause after a comma (", or", ", increasing"), or another figure. */
const CLAUSE_END = new RegExp(String.raw`[();]|,\s+(?=[a-z(])|${OTHER_FIGURE.source}`, "i");
/** The period words, every one, to set aside before a figure is read. */
const PERIOD_WORDS = new RegExp(`${MONTH_WORDS.source}|${YEAR_WORDS.source}`, "gi");
/** A label's words for a year's figure built from months: annualized, a
 *  trailing twelve months. */
const LABEL_YEAR_WORDS = /annuali[sz]ed|\bt-?12\b|\bttm\b|\btrailing\b/i;

/** The period a figure's own words state: "month", "year", or null for a
 *  figure stated with neither. A year's word wins where both are in the
 *  one clause ("$1,100,000 annual rent payable monthly"): the month is how
 *  it is paid. */
export function periodOf(words: string): "year" | "month" | null {
  if (YEAR_WORDS.test(words)) return "year";
  return MONTH_WORDS.test(words) ? "month" : null;
}

/** A figure's own clause read as dollars, its period words set aside first
 *  (parseMoney reads the "m" of "$91,667 monthly" as millions), with its
 *  sign — a month's loss is a loss. */
const signedDollarsOf = (clause: string): number | null => parseMoney(clause.replace(PERIOD_WORDS, " "));

/** The same, a positive figure only: an income. */
const dollarsOf = (clause: string): number | null => {
  const n = signedDollarsOf(clause);
  return n != null && n > 0 ? n : null;
};

/** The row's first figure and the words attached to it — up to a bracket,
 *  a semicolon, a clause after a comma or a second figure — and the rest of
 *  the row. A bracket with no figure in it is the figure's own words
 *  ("$91,667 (monthly)"), and stays with it. */
function leadClause(v: string): { lead: string; rest: string } {
  const first = /\d[\d,]*(?:\.\d+)?/.exec(v);
  if (!first) return { lead: v, rest: "" };
  let end = first.index + first[0].length;
  for (;;) {
    const tail = v.slice(end);
    const stop = tail.search(CLAUSE_END);
    if (stop < 0) return { lead: v, rest: "" };
    const bracket = /^\(([^()]*)\)/.exec(tail.slice(stop));
    if (bracket && !/\d/.test(bracket[1])) {
      end += stop + bracket[0].length;
      continue;
    }
    return { lead: v.slice(0, end + stop), rest: v.slice(end + stop) };
  }
}

/** The other figures a row states for a period of their own — "($91,667/
 *  month)", ", or $91,667 a month" — each read from its own clause; a rate,
 *  an average or a share is no figure here. */
function periodFigures(rest: string): Array<{ value: number; period: "year" | "month" }> {
  const out: Array<{ value: number; period: "year" | "month" }> = [];
  const re = new RegExp(OTHER_FIGURE.source, "gi");
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    const from = m.index;
    const tail = rest.slice(from + m[0].length);
    const stop = tail.search(CLAUSE_END);
    const clause = rest.slice(from, stop >= 0 ? from + m[0].length + stop : rest.length);
    if (RATE_WORDS.test(clause) || PER_UNIT_WORDS.test(clause) || /%/.test(clause)) continue;
    const period = periodOf(clause);
    const value = dollarsOf(clause);
    if (period && value != null) out.push({ value, period });
  }
  return out;
}

/** A month's figure that is a twelfth of a year's, within 1% (lib/condo's
 *  `monthlyDuesOf` rule). */
const agree = (year: number, month: number) => Math.abs(year - month * 12) <= Math.abs(month * 12) * 0.01;

/** The lead clause short of a percentage after a dash: "$610,000 – 2%
 *  annual increases" is the figure and words about its increases (lib/money
 *  `statesRange`'s rule) — never a share the row states, and never a period
 *  of the figure's own ("$91,667/month – 3% annual increases" is a
 *  month's). Words after a dash with no percentage stay the figure's
 *  ("$91,667 – monthly"). */
function shortOfDashPercent(lead: string): string {
  const first = /\d[\d,]*(?:\.\d+)?/.exec(lead);
  if (!first) return lead;
  const end = first.index + first[0].length;
  const cut = /\s*[-−–—]\s*\d+(?:\.\d+)?\s*(?:%|percent\b|per\s?cent\b)/i.exec(lead.slice(end));
  return cut ? lead.slice(0, end + cut.index) : lead;
}

/** A year's income as a row states it, and whether it was read from a
 *  month's figure. */
export interface StatedIncome {
  annual: number;
  /** read as twelve times a month's figure, the memorandum stating no year
   *  beside it */
  fromMonth: boolean;
}

/**
 * A year's income as a row states it: dollars, a monthly figure taken
 * twelve times; null for a rate (per foot, per unit, an average), a range
 * or a share. The period is read from the words attached to the figure
 * read — the clause before a bracket, a semicolon, ", or" or a second
 * figure — never the whole row's: "$1,100,000 per annum ($91,667/month)" is
 * a year of $1.1M, where the month's word anywhere had made it $13.2M (the
 * batch audit). Where the row states a year's figure and a month's, the
 * year's is read, and only where the two agree within 1% (a month is a
 * twelfth of the year); two that disagree are no figure the reader can
 * choose between.
 */
export function statedIncomeOf(stated: string): StatedIncome | null {
  const v = stated.trim();
  if (!v || NOT_STATED.test(v)) return null;
  // A range, its first figure with or without a scale ("$600 - $700",
  // "$1.0M - $1.2M"), is no one figure — by lib/money's one rule, so a
  // percentage, a year or a smaller figure after a dash is words after the
  // figure ("$610,000 – 2% annual increases"), never a range (audit C3a).
  if (statesRange(v)) return null;
  const clause = leadClause(v);
  const lead = shortOfDashPercent(clause.lead);
  const rest = clause.rest;
  if (RATE_WORDS.test(lead) || PER_UNIT_WORDS.test(lead) || /%/.test(lead)) return null;
  const n = dollarsOf(lead);
  if (n == null) return null;
  const others = periodFigures(rest);
  const year = others.find((f) => f.period === "year")?.value ?? null;
  const month = others.find((f) => f.period === "month")?.value ?? null;
  switch (periodOf(lead)) {
    case "month":
      // A month's figure, with the year's beside it: the year's, where the
      // two agree.
      if (year != null) return agree(year, n) ? { annual: year, fromMonth: false } : null;
      return { annual: n * 12, fromMonth: true };
    case "year":
      if (month != null && !agree(n, month)) return null;
      return { annual: n, fromMonth: false };
    default:
      // A figure stated with no period is the year's the row is labelled
      // for — unless a figure beside it says otherwise.
      if (month != null) return agree(n, month) ? { annual: n, fromMonth: false } : null;
      if (year != null) {
        if (Math.abs(n - year) <= year * 0.01) return { annual: n, fromMonth: false };
        return agree(year, n) ? { annual: year, fromMonth: false } : null;
      }
      return { annual: n, fromMonth: false };
  }
}

/** A year's income as a row states it (`statedIncomeOf`), the figure alone. */
export function annualIncomeOf(stated: string): number | null {
  return statedIncomeOf(stated)?.annual ?? null;
}

/** A row's figure read as a month's (`monthFigureOf`). */
export type MonthFigure =
  /** the year the month makes: twelve times it, or the year the row states
   *  beside it where the two agree (`yearStated`) */
  | { annual: number; month: number; yearStated: boolean }
  /** a month's figure and a year's beside it that do not agree: no figure
   *  the reader can choose between */
  | "disagree";

/**
 * A figure a row states a month at a time — by the words attached to the
 * figure ("$85,000/mo", "$85,000 per month", "$85,000 monthly"), or, where
 * those state no period, by the row's label ("NOI (monthly)", "Monthly
 * NOI", "NOI per month") — and the year it makes: twelve times the month, or
 * the year the row states beside it where the two agree. A figure's own
 * year words win over its label's month ("NOI (monthly)": "$1,020,000
 * annually" is the year stated). Null where the words say no month, which a
 * reader then reads as it always has: a figure is never annualised on a
 * guess. The sign is the figure's own — a month's loss is a year's loss.
 * Research pass 40, H1(a): the NOI readers' rule, the incomes' rule above.
 */
export function monthFigureOf(label: string, value: string): MonthFigure | null {
  const v = value.trim();
  if (!v || NOT_STATED.test(v)) return null;
  const { lead, rest } = leadClause(v);
  if (RATE_WORDS.test(lead) || PER_UNIT_WORDS.test(lead) || /%/.test(lead)) return null;
  // A label that names a year's figure besides a month — annualized, a
  // trailing twelve months — is the year's ("NOI (T-12, annualized from
  // monthly)" is a year), whatever month word it carries too.
  const labelPeriod = LABEL_YEAR_WORDS.test(label) ? "year" : periodOf(label);
  const period = periodOf(lead) ?? labelPeriod;
  if (period !== "month") return null;
  // The lead clause stops at a bracket, so an accounting loss — "($5,000)" —
  // is read off the whole value.
  const n = signedDollarsOf(lead) ?? signedDollarsOf(v);
  if (n == null || !Number.isFinite(n)) return null;
  const year = periodFigures(rest).find((f) => f.period === "year")?.value ?? null;
  if (year != null) return agree(year, n) ? { annual: year, month: n, yearStated: true } : "disagree";
  return { annual: n * 12, month: n, yearStated: false };
}
