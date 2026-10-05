// One tenant leases the whole property (#454) — a single-tenant net lease,
// a build-to-suit, a sale-leaseback, a single-tenant warehouse, office or
// clinic. One lease is the whole deal: its guarantor's credit, its term and
// its increases ARE the income, and a screening model built for a building
// of many leases reads none of them.
//
// Pure — no I/O, no model call. The extraction states the lease
// (`ExtractionResult.singleTenant`, and the rows it labels "Lease
// expiration", "Lease term remaining", "Renewal options", "Rent
// increases", "Annual base rent", "Tenant credit rating" and "Early
// termination date"); this reads it into what every surface says.
//
// Six rules, each a way a screen goes wrong when it reads one lease as a
// market.
//
// THE TERM IS THE ASSET. The rent is this tenant's until the lease ends,
// and whatever the tenant decides after it, so the years left — today and
// at the model's sale — are what the deal is priced on. A lease that ends
// inside the hold leaves years the model counts as rent and the buyer does
// not have; one that ends soon after the sale hands the next buyer a
// renewal to price, and one exit cap does not change with the term left.
//
// THE OPTIONS ARE THE TENANT'S. A renewal option is exercised by the
// tenant, when the rent it runs at suits the tenant, so the term is the
// primary term and the options are drawn after it, never counted in it.
//
// AN EARLY TERMINATION IS THE LEASE'S END. A tenant who may leave on a date
// gives the lease that date: the landlord cannot make it stay and a lender
// will not count past it (the rollover card's rule for a break). A firm
// term's end is such a date — a government lease's tenant may leave on
// notice once its firm term is over.
//
// THE INCREASES ARE THE GROWTH. Until the lease ends the rent grows as the
// lease says, not as a market does: 10% every five years compounds to
// 1.92% a year, a flat rent to nothing, and a model growing a flat lease's
// rent 3% a year invents income. An increase tied to CPI, or stated any
// other way, is kept as stated and never converted.
//
// THE GUARANTOR IS THE CREDIT. The rent is as good as whoever guarantees
// it — a franchisee's guarantee is the franchisee's credit, not the
// brand's — so the guarantor is said as stated, and a rating only where the
// memorandum states one, read as investment grade (BBB- or Baa3 and above)
// or not by its own letters.
//
// A BLANK IS NULL. A term, an increase or a rating the memorandum does not
// state is not assumed — and on a leased fee the lease is the ground lease,
// read by its own rows (lib/ground-lease-term), never twice.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { inferStrategy, notYetDelivered } from "@/lib/deal-strategy";
import { parsePageNumber } from "@/lib/facts";
import {
  endHasPassed,
  endIsAhead,
  endsByYear,
  fromToday,
  leftText as spanLeftText,
  readLeaseTerm,
  termEndLabel,
  yearsText,
  type DatedSpan,
  type LeaseTerm,
  type MetricRow,
} from "@/lib/ground-lease-term";
import { parseUsd } from "@/lib/money";
import { monthsBetween, readStatedDate, sameMonth, sameYear, yearsBetween } from "@/lib/note-yield";

// ── The rows ────────────────────────────────────────────────────────────

const isRow = (m: unknown): m is MetricRow =>
  !!m && typeof m === "object" && typeof (m as MetricRow).label === "string" && typeof (m as MetricRow).value === "string";

// The tenant's lease, never a ground lease's, the seller's loan's or a note's.
const NOT_TENANT_LEASE = /ground|land\s*lease|assumable|\bloan\b|mortgage|\bnote\b|maturity/i;
const END_ROW = /\blease\b.*\b(?:expir\w*|ends?|end\s+date|termination\s+date)\b|^(?:primary\s+|initial\s+|base\s+)?term\s+(?:expir\w*|ends?|end\s+date)\b|^expiration(?:\s+date)?$/i;
// A firm term's end is when the tenant may first leave, never the lease's
// own end (EARLY_ROW reads it).
const NOT_END = /option|renewal|extension|early|remaining|unexpired|\bleft\b|kick|\bfirm\b/i;
const LEFT_ROW = /\bterm\s+remaining\b|\bremaining\s+(?:lease\s+|primary\s+|base\s+|initial\s+)?term\b|\bunexpired\s+(?:lease\s+)?term\b|\blease\b.*\b(?:remaining|left)\b/i;
const NOT_LEFT = /option|renewal|extension/i;
const OPTION_ROW = /\b(?:renewal|extension)\s+options?\b|\boptions?\s+to\s+(?:renew|extend)\b|^(?:lease\s+)?options?$/i;
const NOT_OPTION = /purchase|\bbuy\b|first\s+refusal|first\s+offer|\brofr\b|\brofo\b|terminat|kick/i;
const INCREASE_ROW =
  /\brent(?:al)?\s+(?:increases?|escalations?|escalators?|bumps|steps|adjustments?)\b|^(?:annual\s+|scheduled\s+)?(?:increases|escalations?|escalators?|bumps)$/i;
const NOT_INCREASE = /\boption|expense|\btax|\bcam\b|insurance/i;
const RENT_ROW = /\b(?:annual\s+|current\s+|in[- ]place\s+)?base\s+rent\b|^(?:current\s+|annual\s+|in[- ]place\s+|contract\s+)+rent$|^rent(?:\s*\((?:annual|yearly)\))?$/i;
const NOT_RENT = /per\s*(?:sf|square|foot)|psf|\/\s*(?:sf|ft)\b|\bmarket\b|pro\s*forma|option|increase|escalat|bump|monthly|\/\s*mo\b|per\s+month|percentage/i;
// A monthly figure is not the year's rent; a per-foot one falls under the
// reader's floor (a year's rent under $1,000 is not a building's).
const RENT_VALUE_NOT_ANNUAL = /\/\s*mo(?:nth)?\b|per\s+month|monthly/i;
const RATING_ROW = /\bcredit\s+rating\b|\brating\b/i;
// The first date the tenant may leave: an early termination, a termination
// option or a kick-out — and a firm term's end ("Firm term expiration",
// "End of firm term"), since after its firm term a tenant such as the
// government may leave on notice (research pass 28). A row naming the firm
// term without its end ("Firm term: 10 years") is a length, not a date.
const EARLY_ROW =
  /\bearly\s+terminat\w*|\bterminat\w*\s+(?:option|right)s?\b|\bkick[- ]?out\b|\bfirm\s+term\b.*\b(?:expir\w*|ends?|end\s+date)\b|\b(?:expir\w*|end)\b.*\bfirm\s+term\b/i;

function rowsOf(ex: ExtractionResult): MetricRow[] {
  return (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow).filter((m) => !NOT_TENANT_LEASE.test(m.label));
}

const find = (rows: MetricRow[], re: RegExp, not?: RegExp) =>
  rows.find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

/** The lease's own rows, for a key-terms block to lead with after the count
 *  (lib/key-terms): its end (or the years left where no end is stated), its
 *  increases and its renewal options. */
export function singleTenantTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter((m) => isRow(m) && !NOT_TENANT_LEASE.test(m.label));
  const end = rows.find((m) => END_ROW.test(m.label) && !NOT_END.test(m.label)) ?? rows.find((m) => LEFT_ROW.test(m.label) && !NOT_LEFT.test(m.label));
  const inc = rows.find((m) => INCREASE_ROW.test(m.label) && !NOT_INCREASE.test(m.label));
  const opt = rows.find((m) => OPTION_ROW.test(m.label) && !NOT_OPTION.test(m.label));
  return [end, inc, opt].filter((m): m is M => m != null);
}

// ── The increases ───────────────────────────────────────────────────────

export type Increases =
  | { kind: "flat"; annualPct: 0; how: string }
  | { kind: "fixed"; annualPct: number; how: string }
  | { kind: "cpi"; annualPct: null; how: string };

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  other: 2, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const N = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|other|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)`;
const PCT = String.raw`(\d{1,2}(?:\.\d+)?)\s*(?:%|percent\b|per\s*cent\b)\)?`;
const STEP_WORD = String.raw`(?:rent\s+)?(?:increases?|bumps?|escalations?|escalators?|steps?|adjustments?)`;
const EVERY_RES = [
  new RegExp(String.raw`${PCT}\s*${STEP_WORD}?\s*(?:every|each)\s+${N}(?:th|st|nd|rd)?[\s-]*(?:lease\s+)?(?:years?|yrs?)\b`),
  new RegExp(String.raw`${STEP_WORD}\s+of\s+${PCT}\s*(?:every|each)\s+${N}(?:th|st|nd|rd)?[\s-]*(?:lease\s+)?(?:years?|yrs?)\b`),
];
const ANNUAL_RES = [
  new RegExp(String.raw`${PCT}\s*(?:rent\s+)?(?:annual(?:ly)?|per\s+(?:year|annum)|each\s+year|every\s+year|a\s+year|yearly|year[\s-]over[\s-]year)`),
  new RegExp(String.raw`(?:annual|yearly)\s+${STEP_WORD}\s+of\s+${PCT}`),
];
// Where the text turns from the primary term to the options.
const TO_OPTIONS =
  /\b(?:during|in|for|at|upon|on|throughout)\s+(?:the\s+|each\s+|all\s+|any\s+|every\s+)?(?:renewal|extension|option)|\b(?:renewal|extension)\s+(?:options?|terms?|periods?)|\boptions?\b/;
const FLAT = /\bflat\b|\bno\s+(?:rent\s+)?(?:increases?|escalations?|escalators?|bumps|steps)\b|\bfixed\s+(?:rent|for|through|until)\b|^\s*none\b(?!\s+(?:stated|given|provided|disclosed))/;
const CPI = /\bcpi\b|consumer\s+price/;

const numOf = (s: string) => (/^\d/.test(s) ? Number(s) : WORD_NUM[s] ?? NaN);

/** A percentage to two places, a whole number without its decimals: "2%",
 *  "1.5%", "1.92%". */
export function pct2(n: number): string {
  return `${Math.round(n * 100) / 100}%`;
}

/**
 * The primary term's rent increases, read off the words that state them:
 * "10% every 5 years", "2% annually", "annual increases of 1.5%", "flat",
 * "CPI". Only the primary term — whatever the text says after it turns to
 * the renewal options is the options' — and null where the words say
 * something else, which the caller keeps as stated.
 */
export function readIncreases(text: string | null | undefined): Increases | null {
  const raw = (text ?? "")
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    // "five (5) years": the parenthetical repeats the figure.
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*\(\s*\d{1,2}\s*\)/g, "$1")
    .trim();
  if (!raw) return null;
  const cut = raw.search(TO_OPTIONS);
  const primary = cut >= 0 ? raw.slice(0, cut) : raw;
  if (!primary.trim()) return null;

  type Hit = { at: number; read: Increases };
  const hits: Hit[] = [];
  const flat = primary.search(FLAT);
  if (flat >= 0) hits.push({ at: flat, read: { kind: "flat", annualPct: 0, how: "flat" } });
  const cpi = primary.search(CPI);
  if (cpi >= 0) hits.push({ at: cpi, read: { kind: "cpi", annualPct: null, how: "with CPI" } });
  for (const re of EVERY_RES) {
    const m = re.exec(primary);
    if (!m) continue;
    const p = Number(m[1]);
    const n = numOf(m[2]);
    if (!(p > 0 && p <= 60) || !Number.isFinite(n)) continue;
    if (n === 1) {
      if (p <= 15) hits.push({ at: m.index, read: { kind: "fixed", annualPct: p, how: `${pct2(p)} a year` } });
    } else if (n >= 2 && n <= 25) {
      const annualPct = (Math.pow(1 + p / 100, 1 / n) - 1) * 100;
      hits.push({ at: m.index, read: { kind: "fixed", annualPct, how: `${pct2(p)} every ${n} years` } });
    }
  }
  for (const re of ANNUAL_RES) {
    const m = re.exec(primary);
    if (!m) continue;
    const p = Number(m[1]);
    if (p > 0 && p <= 15) hits.push({ at: m.index, read: { kind: "fixed", annualPct: p, how: `${pct2(p)} a year` } });
  }
  if (!hits.length) return null;
  // The primary term's own statement is the first one made.
  hits.sort((a, b) => a.at - b.at);
  return hits[0].read;
}

// ── The rating ──────────────────────────────────────────────────────────

export interface RatingRead {
  /** the row's own words */
  stated: string;
  /** read off the rating's own letters; null where none is stated or the
   *  words say it is unrated */
  grade: "investment" | "speculative" | "split" | null;
  /** the memorandum says the tenant or its guarantor is not rated */
  unrated: boolean;
}

const NOT_RATED = /\bn\/?a\b|not\s+(?:publicly\s+)?rated|\bnr\b|unrated|\bnone\b/i;
const SP_IG = /^(?:AAA|AA[+-]?|A[+-]?|BBB[+-]?)$/;
const SP_SPEC = /^(?:BB[+-]?|B[+-]?|CCC[+-]?|CC|D)$/;
const MOODY_IG = /^(?:Aaa|Aa[1-3]|A[1-3]|Baa[1-3])$/;
const MOODY_SPEC = /^(?:Ba[1-3]|B[1-3]|Caa[1-3]|Ca)$/;

/** A credit rating as stated, graded by its own letters: investment grade
 *  is BBB- (S&P, Fitch) or Baa3 (Moody's) and above. Two ratings that
 *  disagree across that line are a split rating, said so. */
export function readRating(text: string | null | undefined): RatingRead | null {
  const stated = (text ?? "").trim();
  if (!stated) return null;
  if (NOT_RATED.test(stated)) return { stated, grade: null, unrated: true };
  let ig = 0;
  let spec = 0;
  for (const t of stated.split(/[\s,;:()/]+/).filter(Boolean)) {
    if (SP_IG.test(t) || MOODY_IG.test(t)) ig++;
    else if (SP_SPEC.test(t) || MOODY_SPEC.test(t)) spec++;
  }
  return { stated, grade: ig && spec ? "split" : ig ? "investment" : spec ? "speculative" : null, unrated: false };
}

const GRADE_WORDS: Record<NonNullable<RatingRead["grade"]>, string> = {
  investment: "investment grade",
  speculative: "below investment grade",
  split: "a split rating, investment grade at one agency and below it at another",
};

// ── The read ────────────────────────────────────────────────────────────

/** A date the tenant may leave early, as stated. */
export interface EarlyEnd {
  ends: string;
  from: "date" | "month" | "year";
  stated: string;
  /** whole months ÷ 12, the figure said */
  yearsLeft: number;
  /** to the day (lib/ground-lease-term `DatedSpan`): what opened, ahead and
   *  before the sale are decided by */
  yearsToTheDay: number;
  /** stated as a month alone, and the reading's date falls in that month:
   *  the right opens "this month" (`DatedSpan`) */
  thisMonth: boolean;
  /** stated as a year alone, and the reading's date falls in that year:
   *  the right opens "this year" (`DatedSpan`) */
  thisYear: boolean;
}

export interface SingleTenantRead {
  tenant: string;
  guarantor: string;
  leaseType: string;
  landlordObligations: string;
  tenantRights: string;
  /** cited only where it parses and falls inside the memorandum */
  page: string;
  /** the primary term, as its rows state it */
  term: LeaseTerm | null;
  /** the deal's kind says the building is not yet delivered (lib/deal-
   *  strategy `notYetDelivered`: a development — a build-to-suit or a
   *  forward purchase — or a conversion), so the lease begins at delivery:
   *  a term stated as a count runs from the lease's start, never from today */
  startsAtDelivery: boolean;
  /** an early termination the tenant holds, dated before the term's end */
  early: EarlyEnd | null;
  /** when the lease can end: the early termination where it comes first,
   *  else the term — the date every "years left" is counted to */
  effective: { ends: string; from: "date" | "month" | "year" | "remaining"; yearsLeft: number; early: boolean } | null;
  /** the rent's increases as read, and the row's own words */
  increases: Increases | null;
  increasesStated: string;
  /** the annual base rent, where stated */
  rent: number | null;
  rating: RatingRead | null;
  /** who, until when, and how the rent grows, in the reader's sentences,
   *  one a line — the panel leads with the first and folds the rest */
  sentences: string[];
  /** those sentences as one paragraph */
  headline: string;
}

/** The read's figures, before its sentences are written from them. */
type LeaseFacts = Omit<SingleTenantRead, "headline" | "sentences">;

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const clean = (s: string | null | undefined) => (s ?? "").trim();

/** A date the text states; a month or a year alone as its first day — the
 *  earliest the tenant could leave in it. */
function earlyOf(value: string, asOf: Date): EarlyEnd | null {
  const d = readStatedDate(value, 1990, 2199, "first");
  const y = d ? null : value.match(/\b(19[89]\d|20\d{2}|21\d{2})\b/);
  const ends = d?.iso ?? (y ? `${y[1]}-01-01` : null);
  if (!ends) return null;
  const today = isoOf(asOf);
  return {
    ends,
    from: d ? (d.month ? "month" : "date") : "year",
    stated: value.trim(),
    yearsLeft: monthsBetween(today, ends) / 12,
    yearsToTheDay: yearsBetween(today, ends),
    thisMonth: !!d?.month && sameMonth(today, ends),
    thisYear: !d && sameYear(today, ends),
  };
}

/** The end every "years left" is counted to — the early termination where
 *  it comes first, else the term — with its years to the day, which
 *  `effective` (whose shape the pages read) does not carry. */
export function effectiveSpan(r: Pick<SingleTenantRead, "effective" | "early" | "term">): DatedSpan | null {
  if (!r.effective) return null;
  return r.effective.early ? r.early : r.term;
}

/**
 * The term of a lease that has not begun: on a building not yet delivered
 * (`startsAtDelivery`), a term stated as a count of years runs from the
 * lease's start at delivery — a date the count does not give — so its
 * length is all there is to say, and nothing is counted from today. Null on
 * every other lease, on a stated date (a date is a date, delivered or not)
 * and where the tenant may leave early on a stated date, which is then the
 * lease's end.
 */
export function termFromDelivery(r: Pick<SingleTenantRead, "startsAtDelivery" | "term" | "effective">): number | null {
  const t = r.term;
  return r.startsAtDelivery && t?.from === "remaining" && !r.effective?.early ? t.yearsLeft : null;
}

/**
 * Whether the lease runs past the model's sale `holdYears` on — to the day
 * (`endsByYear`). A lease that begins at delivery runs past it whenever the
 * building is delivered once its term is as long as the hold, since it
 * begins after today; a shorter one may end inside the hold, which is not
 * past. The panel's picture and the model's read ask this one question.
 */
export function runsPastSale(r: Pick<SingleTenantRead, "startsAtDelivery" | "term" | "effective" | "early">, holdYears: number): boolean {
  const fromDelivery = termFromDelivery(r);
  if (fromDelivery != null) return Math.round(fromDelivery * 12) >= Math.round(holdYears * 12);
  const span = effectiveSpan(r);
  return !!span && !endsByYear(span, holdYears);
}

/**
 * The one lease a single-tenant property is, on a day. Null where the
 * memorandum names no single tenant — a multi-tenant or vacant property —
 * and on a leased fee or a note, whose lease is the ground lease or the
 * collateral's and is read elsewhere.
 */
export function readSingleTenant(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): SingleTenantRead | null {
  const st = ex?.singleTenant;
  const tenant = clean(st?.tenant);
  if (!ex || !st || !tenant) return null;
  const kind = ex.interest?.kind;
  if (kind === "leased_fee" || kind === "note") return null;
  const rows = rowsOf(ex);

  const term = readLeaseTerm(
    { endRow: find(rows, END_ROW, NOT_END), leftRow: find(rows, LEFT_ROW, NOT_LEFT), optionRow: find(rows, OPTION_ROW, NOT_OPTION) },
    ex.totalPages,
    asOf,
  );
  const earlyRow = find(rows, EARLY_ROW);
  const earlyRead = earlyRow ? earlyOf(earlyRow.value, asOf) : null;
  const startsAtDelivery = notYetDelivered(inferStrategy(ex).kind);
  // Early only where it comes before the term's end; a date at or after it
  // is no earlier than the lease itself. A term counted from a delivery not
  // yet dated has no end to set a stated date against — its end as read is
  // today plus the count, earlier than the lease's — so the stated date
  // stands (the second pre-merge audit: a 2042 right on a 15-year lease from
  // delivery was dropped against "about Oct 2041", and said nowhere).
  const fromDelivery = startsAtDelivery && term?.from === "remaining";
  const early = earlyRead && (!term || fromDelivery || earlyRead.ends < term.ends) ? earlyRead : null;
  const effective = early
    ? { ends: early.ends, from: early.from, yearsLeft: early.yearsLeft, early: true }
    : term
      ? { ends: term.ends, from: term.from, yearsLeft: term.yearsLeft, early: false }
      : null;

  const incRow = find(rows, INCREASE_ROW, NOT_INCREASE);
  const increasesStated = clean(incRow?.value);
  const rentRow = rows.find((m) => RENT_ROW.test(m.label) && !NOT_RENT.test(m.label) && !RENT_VALUE_NOT_ANNUAL.test(m.value)) ?? null;
  const rent = rentRow ? parseUsd(rentRow.value, 1_000) : null;
  const ratingRow = find(rows, RATING_ROW);

  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const n = parsePageNumber(st.page);
  const page = n != null && pageCount != null && n <= pageCount ? clean(st.page) : "";

  const read: LeaseFacts = {
    tenant,
    guarantor: clean(st.guarantor),
    leaseType: clean(st.leaseType),
    landlordObligations: clean(st.landlordObligations),
    tenantRights: clean(st.tenantRights),
    page,
    term,
    startsAtDelivery,
    early,
    effective,
    increases: readIncreases(increasesStated),
    increasesStated,
    rent,
    rating: readRating(ratingRow?.value),
  };
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

// ── Saying it ───────────────────────────────────────────────────────────

/** "Mar 2036"; a year alone as the year. */
export const leaseEndLabel = (e: { ends: string; from: "date" | "month" | "year" | "remaining" }) => termEndLabel(e);
/** The end after a verb: "ends Mar 2036", "ends in 2036" for a year alone. */
const endsWhen = (e: { ends: string; from: "date" | "month" | "year" | "remaining" }) => (e.from === "year" ? `in ${termEndLabel(e)}` : termEndLabel(e));

// A clause's words without their closing punctuation; a name keeps its
// own abbreviation's period ("Walgreens Co.").
const noPeriod = (s: string) => s.replace(/[.;,\s]+$/, "");
const nameOf = (s: string) => s.replace(/[;,\s]+$/, "");

function ratingClause(r: RatingRead): string {
  if (r.unrated) return " — not rated, as stated";
  return r.grade ? ` — rated ${noPeriod(r.stated)}, ${GRADE_WORDS[r.grade]}` : ` — its credit as stated: ${noPeriod(r.stated)}`;
}

function whoSentence(r: LeaseFacts): string {
  const guarantee = r.guarantor ? `, the rent guaranteed by ${nameOf(r.guarantor)} as stated` : ", and the memorandum names no guarantor";
  const end = r.rating ? ratingClause(r.rating) : "";
  const sentence = `${nameOf(r.tenant)} leases the whole property${guarantee}${end}`;
  return /\.$/.test(sentence) ? sentence : `${sentence}.`;
}

function optionsClause(t: LeaseTerm): string {
  const theirs = " — the tenant's to exercise, not the buyer's";
  if (t.includesOptions) return " — a term that already counts the renewal options, so a ceiling rather than the lease";
  if (t.options) {
    return t.options.how.startsWith("to ")
      ? `, with renewal options as stated running it ${t.options.how}${theirs}`
      : `, then renewal options as stated, ${t.options.how}, ${Math.round(t.options.years)} years in all${theirs}`;
  }
  return t.optionsStated ? `, with renewal options as stated: ${noPeriod(t.optionsStated)}${theirs}` : "";
}

/** A term stated as a count, without its "remaining": "15 years". */
const statedCount = (t: LeaseTerm) => noPeriod(t.stated).replace(/\s+(?:remaining|left)$/i, "");

function termSentence(t: LeaseTerm | null, startsAtDelivery: boolean): string {
  if (!t) return "The memorandum states no date the lease ends — the one figure a single tenant's income runs on.";
  const end = termEndLabel(t);
  if (endHasPassed(t)) {
    return `The lease's stated end, ${end}, has passed — the tenant is holding over or has renewed, or the term as read is wrong: check the lease and any renewal already exercised.`;
  }
  const opts = optionsClause(t);
  switch (t.from) {
    case "date":
    case "month":
      return `The lease ends ${end}, ${fromToday(t)}${opts}.`;
    case "year":
      return `The lease ends in ${end}, ${fromToday(t)} — the memorandum states the year alone, read as its first day${opts}.`;
    case "remaining":
      // A lease on a building not yet delivered begins at delivery: its
      // stated term runs from the lease's start, later than today, so
      // "counted from today … may be shorter" said it backwards (research
      // pass 23).
      return startsAtDelivery
        ? `The memorandum states ${statedCount(t)} on the lease; the building is not yet delivered, so the term is counted from the lease's start, not from today${opts}.`
        : `The memorandum states ${statedCount(t)} left on the lease; counted from today they run to about ${end}, and its own date is earlier, so the term may be shorter${opts}.`;
  }
}

function earlySentence(e: EarlyEnd | null): string {
  if (!e) return "";
  const end = termEndLabel(e);
  // A right opens ON its day: from then on the lease is the tenant's choice.
  return endIsAhead(e)
    ? `The tenant may end the lease early from ${end}, ${fromToday(e)}, as stated — read that as the lease's end: the tenant decides, and a lender will not count past it.`
    : `The tenant's right to end the lease early opened ${end}, as stated — the lease runs only as long as the tenant chooses.`;
}

function increasesSentence(r: LeaseFacts): string {
  const inc = r.increases;
  if (!inc) return r.increasesStated ? `The rent's increases as stated: ${noPeriod(r.increasesStated)}.` : "";
  switch (inc.kind) {
    case "flat": {
      const until = r.term && !endHasPassed(r.term) ? ` until ${termEndLabel(r.term)}` : "";
      return `The rent is flat${until}, as stated — a fixed income that inflation erodes every year the lease runs.`;
    }
    case "cpi":
      return `The rent's increases are tied to CPI, as stated: ${noPeriod(r.increasesStated)}.`;
    case "fixed":
      return /every/.test(inc.how)
        ? `The rent rises ${inc.how}, as stated — ${pct2(inc.annualPct)} a year compounded.`
        : `The rent rises ${inc.how}, as stated.`;
  }
}

function sentencesOf(r: LeaseFacts): string[] {
  return [whoSentence(r), termSentence(r.term, r.startsAtDelivery), earlySentence(r.early), increasesSentence(r)].filter(Boolean);
}

/** The model a single tenant's lease is set against: the engine's own
 *  decimals (0.03 is 3%). */
export interface LeaseModel {
  holdMonths: number;
  rentGrowthPct: number;
  vacancyPct: number;
  exitCapPct: number;
}

const pct1 = (decimal: number) => `${(Math.round(decimal * 1000) / 10).toFixed(1)}%`;
const capText = (decimal: number) => `${(Math.round(decimal * 10000) / 100).toFixed(2)}%`;

/** How the lease's increases set against the model's rent growth — only
 *  where the lease runs past the model's sale, since after the lease ends
 *  the growth is a renewal's question, not the lease's. */
function growthSentence(r: SingleTenantRead, m: LeaseModel): string {
  const inc = r.increases;
  if (!inc || inc.kind === "cpi") return "";
  const g = m.rentGrowthPct * 100;
  const a = inc.annualPct;
  const lease = inc.kind === "flat" ? "0%" : pct2(a);
  const run = ` — enter ${lease} as the rent growth to run the model on the lease`;
  if (Math.abs(g - a) < 0.25) return `The model's ${pct1(m.rentGrowthPct)} a year of rent growth sits with the lease's own increases.`;
  if (g > a) {
    return `The model grows the rent ${pct1(m.rentGrowthPct)} a year; the lease's own increases are ${
      inc.kind === "flat" ? "none, the rent being flat" : `${lease} a year`
    }, so the model's income runs ahead of the lease's${run}.`;
  }
  return `The lease's own increases, ${lease} a year, run ahead of the model's ${pct1(m.rentGrowthPct)}: the model understates the lease's income${run}.`;
}

/**
 * What the lease means for the screening model: the years left at its sale,
 * or the lease ending inside its hold, then the rent's increases against
 * its growth — and on a lease that begins at delivery (`termFromDelivery`),
 * its term from then and what the delivery date decides, never years
 * counted from today. "" where no end is stated or the stated one has
 * passed.
 */
export function singleTenantModelLine(r: SingleTenantRead, m: LeaseModel): string {
  const eff = r.effective;
  if (!eff || !(m.holdMonths > 0)) return "";
  const hold = m.holdMonths / 12;
  const holdWord = Number.isInteger(hold) ? `${hold}-year` : `${yearsText(hold)}'`;
  const vacancy =
    m.vacancyPct > 0
      ? `its ${pct1(m.vacancyPct)} vacancy is a market's allowance, not a single tenant's all-or-nothing`
      : "it allows no vacancy for the tenant leaving";
  const beforeOptions = !eff.early && r.term?.options ? ", before the tenant's renewal options" : "";
  // A term stated with its renewal options counted in is a ceiling, not the
  // lease: each renewal is the tenant's to take, so every figure off it is
  // "up to" (the second pre-merge audit).
  const ceiling = !eff.early && !!r.term?.includesOptions;
  const optionsIn = ceiling ? ", its renewal options counted in" : "";
  // A lease that has not begun runs from delivery (research pass 23): what
  // it has left at the sale turns on a date its stated count does not give,
  // so it is said so — never counted from today.
  const fromDelivery = termFromDelivery(r);
  if (fromDelivery != null) {
    const runs = `The lease runs ${ceiling ? "up to " : ""}${yearsText(fromDelivery)} from delivery${optionsIn}, not from today`;
    if (!runsPastSale(r, hold)) {
      return `${runs}, so it ends inside the model's ${holdWord} hold if the building is delivered within ${yearsText(hold - fromDelivery)}: the model's rent after that is this tenant staying — the tenant's choice, not the buyer's — and ${vacancy}.`;
    }
    const whenever = ceiling
      ? `${runs}: a ceiling, since each renewal is the tenant's to take, so whether it outlasts the model's ${holdWord} hold turns on those renewals and the delivery date, and the model's ${capText(m.exitCapPct)} exit cap is one figure whatever the term left.`
      : `${runs}, so it outlasts the model's ${holdWord} hold whenever the building is delivered, and how much of it is left at the sale${beforeOptions ? `${beforeOptions},` : ""} turns on that date: the next buyer prices those years of this tenant's rent and a renewal the tenant decides, and the model's ${capText(m.exitCapPct)} exit cap is one figure whatever the term left.`;
    return [whenever, growthSentence(r, m)].filter(Boolean).join(" ");
  }
  // Ahead, passed and before the sale by the DAY, never whole months
  // (lib/ground-lease-term `DatedSpan`).
  const span = effectiveSpan(r);
  if (!span || (eff.early ? !endIsAhead(span) : endHasPassed(span))) {
    // A termination right already open: every year of the hold is the
    // tenant's choice. A stated end that has passed is a misread the
    // headline already says, not a model line.
    return eff.early
      ? `The tenant's right to end the lease early is already open: the model's rent in every year of its ${holdWord} hold is this tenant choosing to stay, and ${vacancy}.`
      : "";
  }
  const end = endsWhen(eff);
  if (endsByYear(span, hold)) {
    return `The lease ${eff.early ? "may end" : "ends"} ${end}, inside the model's ${holdWord} hold: the model's rent after that is this tenant staying — the tenant's choice, not the buyer's — and ${vacancy}.`;
  }
  const left = eff.yearsLeft - hold;
  // Past the sale by under a whole month: the tenths would say "0 years".
  const leftText = Math.round(left * 12) < 1 ? "under a month" : yearsText(left);
  const sale = `At the model's sale in ${yearsText(hold)} the lease has ${ceiling && Math.round(left * 12) >= 1 ? "up to " : ""}${leftText} left${beforeOptions}${optionsIn}: the next buyer prices those years of this tenant's rent and a renewal the tenant decides, and the model's ${capText(m.exitCapPct)} exit cap is one figure whatever the term left.`;
  return [sale, growthSentence(r, m)].filter(Boolean).join(" ");
}

/** The lease in one line, for the memo under its title, the workbook's
 *  cover and the report: "Single tenant: Walgreens Co., guaranteed by …;
 *  the lease ends Mar 2036, 9.5 years from today, then renewal options
 *  (four of 5 years); the rent rises 10% every 5 years". */
export function singleTenantShortLine(r: SingleTenantRead): string {
  let who = `Single tenant: ${nameOf(r.tenant)}`;
  if (r.guarantor) who += `, guaranteed by ${nameOf(r.guarantor)}`;
  if (r.leaseType) who += `, ${noPeriod(r.leaseType)}`;
  const parts = [who];
  const t = r.term;
  const options = t?.options && !t.includesOptions ? `, then renewal options (${t.options.how})` : "";
  if (t && t.from === "remaining" && r.startsAtDelivery) {
    // A building not yet delivered: the stated count runs from the lease's
    // start, never from today.
    parts.push(`${statedCount(t)} on the lease, counted from its start — the building is not yet delivered${options}`);
  } else if (t && !endHasPassed(t)) {
    parts.push(`the lease ends ${endsWhen(t)}, ${fromToday(t)}${options}`);
  } else if (t) {
    parts.push(`the lease's stated end, ${termEndLabel(t)}, has passed`);
  }
  if (r.early && endIsAhead(r.early)) parts.push(`the tenant may end it early from ${termEndLabel(r.early)}`);
  const inc = r.increases;
  if (inc) parts.push(inc.kind === "flat" ? "the rent is flat" : inc.kind === "cpi" ? "the rent rises with CPI" : `the rent rises ${inc.how}`);
  return parts.join("; ");
}

/**
 * The pipeline row's tag: "Single tenant, 9 yrs left" (whole years down),
 * "Single tenant, may leave in 4 yrs" where an early termination comes
 * first, "Single tenant, 15 yrs from delivery" on a lease that begins at
 * delivery, "Single tenant" where no end can be read. Null on anything
 * else.
 */
export function singleTenantTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readSingleTenant(ex, asOf);
  if (!r) return null;
  // A count with the renewal options in it is the lease's ceiling: "up to".
  const upTo = (years: number) => (r.term?.includesOptions && years >= 1 ? "up to " : "");
  // A lease that has not begun: its term from delivery, never years left
  // today (research pass 23).
  const fromDelivery = termFromDelivery(r);
  if (fromDelivery != null) {
    const whole = Math.floor(fromDelivery);
    return `Single tenant, ${upTo(fromDelivery)}${fromDelivery < 1 ? "under 1 yr" : `${whole} ${whole === 1 ? "yr" : "yrs"}`} from delivery`;
  }
  const eff = r.effective;
  const span = effectiveSpan(r);
  if (!eff || !span || !endIsAhead(span)) return "Single tenant";
  const whole = Math.floor(eff.yearsLeft);
  const yrs = eff.yearsLeft < 1 ? "under 1 yr" : `${whole} ${whole === 1 ? "yr" : "yrs"}`;
  return eff.early ? `Single tenant, may leave in ${yrs}` : `Single tenant, ${upTo(eff.yearsLeft)}${yrs} left`;
}

/** The lease as the steps that read the memorandum after the extraction
 *  see it (lib/deal-context): the reader's sentences, then what the
 *  landlord owes and the rights the tenant holds, as stated. */
export function singleTenantContextLine(r: SingleTenantRead): string {
  const extra = [
    r.leaseType ? `Lease type as stated: ${noPeriod(r.leaseType)}.` : "",
    r.landlordObligations ? `The landlord's obligations as stated: ${noPeriod(r.landlordObligations)}.` : "",
    r.tenantRights ? `The tenant's rights as stated: ${noPeriod(r.tenantRights)}.` : "",
    r.rent != null ? `Annual base rent as stated: $${r.rent.toLocaleString("en-US")}.` : "",
  ].filter(Boolean);
  return `Single tenant: ${[r.headline, ...extra].join(" ")}${r.page ? ` (${r.page})` : ""}`;
}

// The rights a tenant can hold that reach the owner, by their words.
const RIGHTS: Array<{ re: RegExp; trap: string }> = [
  {
    re: /first\s+refusal|\brofr\b/i,
    trap: "a right of first refusal on a sale: every bid at the exit can be matched by the tenant, and bidders who know it bid less or not at all",
  },
  { re: /first\s+offer|\brofo\b/i, trap: "a right of first offer: the tenant sees the sale first and sets the floor the market is then tested against" },
  {
    re: /terminat|kick[- ]?out|\bcancel/i,
    trap: "a termination right: the lease's real end is the first date the tenant may use it, and the income after it is the tenant's choice",
  },
  { re: /purchase\s+option|option\s+to\s+(?:purchase|buy)|right\s+to\s+(?:purchase|buy)/i, trap: "a purchase option: the upside is capped at its price" },
  { re: /go(?:ing)?\s+dark|cease\s+operat/i, trap: "a right to go dark: the rent may keep coming from an empty building, which is dark value and a co-tenancy problem for its neighbours" },
];

/** The single-tenant traps, for the assumption review: the facts, then each
 *  trap keyed to them by name. */
export function singleTenantNote(r: SingleTenantRead): string {
  const eff = r.effective;
  const span = effectiveSpan(r);
  // An end stated as a month or a year alone, read inside it, comes "this
  // month" or "this year" — never "under a month left today", which a day
  // nobody stated had said all through it.
  const within = span && (span.thisMonth || span.thisYear) ? spanLeftText(span) : null;
  const leftNow =
    eff && span
      ? within
        ? eff.early
          ? `the tenant may end the lease ${within}, as stated`
          : `the lease ends ${within}, as stated`
        : `${Math.round(span.yearsLeft * 12) < 1 ? "under a month" : yearsText(eff.yearsLeft)} left today${eff.early ? " to the tenant's early termination" : ""}`
      : "";
  const traps: string[] = [];
  traps.push(
    r.guarantor
      ? `(a) THE GUARANTOR IS THE CREDIT — the rent is guaranteed by ${nameOf(r.guarantor)} as stated: test that entity's own balance sheet and reporting, not the brand's, and whether the guarantee is the whole term's or burns off`
      : "(a) THE GUARANTOR IS THE CREDIT — the memorandum names no guarantor: the tenant entity alone stands behind the rent, so say which entity that is and what it owns",
  );
  traps.push(
    eff && !eff.early && r.startsAtDelivery && r.term?.from === "remaining"
      ? `(b) THE TERM AT THE EXIT — ${statedCount(r.term)} as stated, counted from the lease's start, not today, since the building is not yet delivered: price the exit on the term a buyer will then be buying, and treat the renewal options as the tenant's, exercised only if the rent then suits it`
      : eff && span && endIsAhead(span)
        ? `(b) THE TERM AT THE EXIT — ${leftNow}: price the exit on the term a buyer will then be buying, and treat the renewal options as the tenant's, exercised only if the rent then suits it`
        : "(b) THE TERM AT THE EXIT — the memorandum states no end the lease can be read to: ask for the lease's expiration, the options and any termination right before believing any exit",
  );
  traps.push("(c) DARK VALUE — what the building is worth empty, re-let at market rent after downtime, allowances and commissions: the downside a single tenant leaves, and rarely in the memorandum");
  traps.push("(d) THE RENT AGAINST MARKET — a rent above what the space would re-let for (a sale-leaseback's rent is set by the seller) resets at the lease's end, and a cap on it prices the premium as if it were permanent");
  const inc = r.increases;
  traps.push(
    !inc
      ? r.increasesStated
        ? `(e) THE INCREASES — as stated: ${noPeriod(r.increasesStated)}; read what they add a year before believing a pro forma's growth`
        : "(e) THE INCREASES — the memorandum states no schedule of increases: ask whether the rent is flat, and grow it no faster than the lease does"
      : inc.kind === "flat"
        ? "(e) A FLAT RENT — a fixed income for the term: a pro forma growing it describes a different lease"
        : inc.kind === "cpi"
          ? `(e) THE CPI LINK — as stated: ${noPeriod(r.increasesStated)}; check its cap, its floor and how often it resets`
          : `(e) THE INCREASES — ${inc.how}, ${pct2(inc.annualPct)} a year: a pro forma growing the rent faster invents income until the lease ends`,
  );
  traps.push(
    r.landlordObligations
      ? `(f) LANDLORD OBLIGATIONS — as stated: ${noPeriod(r.landlordObligations)}; price them as the owner's capital, since a roof or a structure is not a tenant's expense here`
      : "(f) LANDLORD OBLIGATIONS — a \"NNN\" label can still leave the roof, the structure or the parking with the landlord: read the lease, not the label",
  );
  const named = r.tenantRights ? RIGHTS.filter((x) => x.re.test(r.tenantRights)).map((x) => x.trap) : [];
  traps.push(
    r.tenantRights
      ? `(g) THE TENANT'S RIGHTS — as stated: ${noPeriod(r.tenantRights)}${named.length ? `. That is ${named.join("; and ")}` : ""}`
      : "(g) THE TENANT'S RIGHTS — none stated: confirm the lease holds no right of first refusal, termination right or purchase option",
  );
  return `${singleTenantContextLine(r)}\n\nSINGLE-TENANT TRAPS, checked by name against the facts above: ${traps.join("; ")}.`;
}
