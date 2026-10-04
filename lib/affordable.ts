// Affordable housing (#453): units whose rents a recorded regulatory
// agreement or a rental-assistance contract sets — not the market.
//
// Pure — no I/O, no model call. The extraction states the restriction
// (`ExtractionResult.affordable`, and the rows it labels "Restricted
// units", "Market-rate units", "Units under HAP contract", "Affordability
// expiration", "Compliance period end" and "HAP contract expiration"); this
// reads it into what every surface says.
//
// Six rules, each one a way a screen goes wrong when it reads a restricted
// building as a market-rate one.
//
// A RESTRICTED RENT IS NOT A MARKET RENT. A unit under a housing-credit
// regulatory agreement rents for at most 30% of the income limit for its
// size, less the utility allowance, and that cap moves as HUD's published
// income limits move — not as the market's rents do. One rent growth rate
// across the building grows the restricted units at a rate nobody set.
//
// THE GAP TO MARKET IS NOT LOSS TO LEASE. "Rents 30% below market" on a
// restricted unit is the restriction's cost. It is the buyer's only when the
// restriction ends — years away — and a pro forma that marks restricted
// units to market before then is a misread, not an upside.
//
// A HAP CONTRACT RENEWS ON HUD'S TERMS. Section 8 project-based units
// collect the contract rent from HUD, adjusted between renewals by HUD's
// operating-cost factor. At renewal, contract rents above market are marked
// down to market; an owner who opts out gives a year's notice, and the
// tenants take vouchers. An expiry inside the hold is a repricing.
//
// THE RESTRICTION OUTLASTS THE COMPLIANCE PERIOD. The credits' fifteen-year
// compliance period ends the investor's recapture exposure; the extended-use
// agreement keeps the rent limits for fifteen years or more after it. A
// qualified-contract release is an application an agency can defeat, never
// a date, so nothing here reads one as the restriction's end.
//
// A WORD IS NOT A RESTRICTION. "Workforce housing" or "naturally occurring
// affordable" describes rents, not a covenant: only a recorded agreement or
// a contract restricts them, and the extraction is asked for nothing else.
//
// A BLANK IS NULL. A count, a tier or a date the memorandum does not state
// is not derived — and an end stated as a term from a start ("30 years from
// 2011") is kept as stated rather than added up, since whether the years
// count from the start, the placement in service or the compliance period's
// end is the agreement's to say.

import type { AffordableProgram, AffordableTierStated, ExtractionResult } from "@/lib/anthropic/types";
import { countNoun } from "@/lib/asset-words";
import { parseCount, unitCountFromMetrics, unitCountRow } from "@/lib/criteria";
import { parsePageNumber } from "@/lib/facts";
import { endHasPassed, fromToday } from "@/lib/ground-lease-term";
import { parseUsd } from "@/lib/money";
import { monthsBetween, readStatedDate, sameMonth, yearsBetween } from "@/lib/note-yield";

export type { AffordableProgram };

/** Each program as a page names it. */
export const PROGRAM_NAME: Record<AffordableProgram, string> = {
  lihtc: "Housing tax credits (LIHTC)",
  section8: "Section 8 HAP contract",
  bond: "Tax-exempt bond set-aside",
  tax_exemption: "Tax exemption for restricted units",
  inclusionary: "Inclusionary zoning",
  other: "Recorded affordability covenant",
};

/** Each program in a sentence: "under a LIHTC regulatory agreement". */
const PROGRAM_PHRASE: Record<Exclude<AffordableProgram, "section8">, string> = {
  lihtc: "a LIHTC regulatory agreement",
  bond: "a tax-exempt bond regulatory agreement",
  tax_exemption: "the covenant behind a property-tax exemption",
  inclusionary: "the zoning's inclusionary covenant",
  other: "a recorded affordability covenant",
};

/** Each program in the short line: "under LIHTC and a bond set-aside". */
const PROGRAM_SHORT: Record<Exclude<AffordableProgram, "section8">, string> = {
  lihtc: "LIHTC",
  bond: "a bond set-aside",
  tax_exemption: "a tax-exemption covenant",
  inclusionary: "inclusionary zoning",
  other: "a recorded covenant",
};

// The order a page lists them in: the credits first, the contract after.
const ORDER: AffordableProgram[] = ["lihtc", "section8", "bond", "tax_exemption", "inclusionary", "other"];

// ── The rows ────────────────────────────────────────────────────────────

type MetricRow = { label: string; value: string; page?: string };
type Rows = { metrics?: MetricRow[]; totalPages?: number } | null | undefined;

const rowOf = (rows: Rows, re: RegExp, not?: RegExp) =>
  (rows?.metrics ?? []).find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

// A share, a rent or a date is not a count of units.
const NOT_A_COUNT = /%|percent|\bshare\b|\brent\b|\$|expir|\bend\b|date|term/i;
const RESTRICTED_ROW =
  /^\s*(?:total\s+|number of\s+)?(?:restricted|affordable|income[- ]restricted|rent[- ]restricted|lihtc|tax[- ]credit|set[- ]aside|regulated)\s+(?:units?|apartments?|homes?|beds?)\b/i;
const MARKET_ROW = /^\s*(?:total\s+|number of\s+)?(?:market[- ]rate|unrestricted|non[- ]restricted|free[- ]market|market)\s+(?:units?|apartments?|homes?|beds?)\b/i;
const HAP_ROW =
  /^\s*(?:units?|apartments?|homes?)\s+(?:under|with|covered by)\s+(?:a\s+|the\s+)?(?:hap|section 8|housing assistance|rental assistance|project[- ]based)|^\s*(?:(?:hap|section 8|pbra|pbv|project[- ]based|assisted|subsidi[sz]ed|rad)\s+){1,3}(?:units?|apartments?|homes?)\b/i;

// When the rent restriction ends: the regulatory agreement's (the extended
// use's, the covenant's) end — never the credits' compliance period, a HAP
// contract's term or a tax exemption's own clock.
const RESTRICTION_WORD = /affordab|restrict|\blura\b|regulatory agreement|extended[- ]use|use agreement|covenant/i;
const END_WORD = /expir|\bends?\b|end date|terminat|\buntil\b|through|\bterm\b|\bperiod\b/i;
const NOT_RESTRICTION_END = /compliance period|\bhap\b|section 8|housing assistance|rental assistance|contract|exemption|abatement|pilot\b|units?\b/i;
const COMPLIANCE_ROW = /compliance period/i;
const HAP_END_ROW =
  /(?:\bhap\b|section 8|housing assistance|rental assistance|pbra|pbv|project[- ]based)[^%]*(?:expir|\bends?\b|end date|terminat|\bterm\b|maturity|renewal date)/i;

/** The rows that define the restriction, in the order a key-terms block
 *  leads with them after the unit count: how many units are restricted,
 *  until when, and when a HAP contract comes up — each only where the
 *  memorandum states it. */
export function affordableTermRows<M extends MetricRow>(metrics: ReadonlyArray<M>): M[] {
  const rows = { metrics: metrics as unknown as MetricRow[] };
  const r = affordableRowsOf(rows);
  return [r.restrictedRow, r.restrictionEndRow, r.hapUnitsRow, r.hapEndRow].filter((m): m is M => m != null);
}

function affordableRowsOf(rows: Rows) {
  return {
    restrictedRow: rowOf(rows, RESTRICTED_ROW, NOT_A_COUNT),
    marketRow: rowOf(rows, MARKET_ROW, NOT_A_COUNT),
    hapUnitsRow: rowOf(rows, HAP_ROW, NOT_A_COUNT),
    restrictionEndRow: (rows?.metrics ?? []).find(
      (m) => RESTRICTION_WORD.test(m.label) && END_WORD.test(m.label) && !NOT_RESTRICTION_END.test(m.label),
    ) ?? null,
    complianceRow: rowOf(rows, COMPLIANCE_ROW),
    hapEndRow: rowOf(rows, HAP_END_ROW, /units?\b/i),
  };
}

// ── Dates ───────────────────────────────────────────────────────────────

export interface DatedEnd {
  /** the end, an ISO date */
  ends: string;
  /** a stated date, or a month or a year alone — read on the side that
   *  does not flatter the buyer (below) */
  from: "date" | "month" | "year";
  /** the row's words, as stated */
  stated: string;
  /** years left today in whole months — the figure said; negative where
   *  the stated end has passed */
  yearsLeft: number;
  /** years left to the DAY (lib/ground-lease-term `DatedSpan`): what says
   *  the end has passed, comes today or falls before the model's sale —
   *  whole months called a contract four weeks from its end one that had
   *  ended, and put a lease 12 months and 17 days out in year 1 */
  yearsToTheDay: number;
  /** stated as a month alone, and the reading's date falls in that month:
   *  "this month", neither passed nor a day away (lib/ground-lease-term
   *  `DatedSpan`) */
  thisMonth: boolean;
  /** cited only where it parses and falls inside the memorandum */
  page: string;
}

// A term counted from a start is a term, not an end: "30 years from 2011",
// "15-year compliance period beginning 2018".
const COUNT_OF_YEARS = /\b\d{1,3}[\s-]*(?:years?|yrs?)\b/i;
const FROM_A_START = /\b(?:from|commenc\w*|begin\w*|start\w*|after|since|placed in service|pis)\b/i;

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * A row's end, on a day — the affordable clocks' and, through
 * lib/hotel-deal, a hotel's franchise and management agreement's (#455).
 * A stated date is taken as written. A month or a year alone is read on the
 * side that does not flatter the buyer: a rent restriction as its LAST day
 * (the market rents it holds back are never counted early), a HAP contract
 * as its FIRST (the subsidy is never counted for months it may not run) —
 * and a month alone, read inside that month, is said "this month" (the
 * audit of 2026-10-04: every month had been read as its last day, a HAP
 * contract's included). Null where the row states no end — including a
 * term counted from a start, which is kept as stated.
 */
export function datedEnd(row: MetricRow | null, side: "first" | "last", asOf: Date, pageCount: number | null): DatedEnd | null {
  if (!row) return null;
  const value = row.value.trim();
  if (COUNT_OF_YEARS.test(value) && FROM_A_START.test(value)) return null;
  const today = isoOf(asOf);
  const stated = readStatedDate(value, 1950, 2199, side);
  let ends: string | null = stated?.iso ?? null;
  let from: DatedEnd["from"] = stated?.month ? "month" : "date";
  if (!ends) {
    const y = value.match(/\b(19[5-9]\d|2[01]\d{2})\b/);
    if (!y) return null;
    ends = side === "first" ? `${y[1]}-01-01` : `${y[1]}-12-31`;
    from = "year";
  }
  const n = parsePageNumber(row.page);
  return {
    ends,
    from,
    stated: value,
    yearsLeft: monthsBetween(today, ends) / 12,
    yearsToTheDay: yearsBetween(today, ends),
    thisMonth: from === "month" && sameMonth(today, ends),
    page: n != null && pageCount != null && n <= pageCount ? (row.page ?? "").trim() : "",
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Dec 2054"; a year alone as the year. */
export function endLabel(e: Pick<DatedEnd, "ends" | "from">): string {
  const [y, m] = e.ends.split("-").map(Number);
  return e.from === "year" ? String(y) : `${MONTHS[m - 1]} ${y}`;
}

// ── The tiers ───────────────────────────────────────────────────────────

export type TierKind = "restricted" | "assisted" | "market" | "other";

export interface AffordableTier {
  /** as the memorandum labels it */
  label: string;
  /** the income limit's share of the area median, where the label states
   *  one ("60% AMI" → 60) */
  amiPct: number | null;
  kind: TierKind;
  units: number | null;
  /** average in-place rent a month */
  rent: number | null;
  /** the maximum allowable rent a month the memorandum states */
  maxRent: number | null;
  /** the limit less the rent — negative where the rent is over it */
  headroom: number | null;
}

const AMI = /\b(\d{2,3}(?:\.\d)?)\s*%\s*(?:of\s+)?(?:the\s+)?(?:ami|amgi|mfi|hamfi|area median|median (?:family |household )?income)/i;
const AMI_FIRST = /\b(?:ami|amgi|mfi)\s*(?:at|of|≤|<=|<)?\s*(\d{2,3}(?:\.\d)?)\s*%/i;
const ASSISTED = /section 8|\bhap\b|pbra|pbv|project[- ]based|rental assistance|subsidi[sz]ed|voucher|\brad\b|\bprac\b/i;
const MARKET = /market|unrestricted|non[- ]?restricted|free[- ]market|conventional/i;

/** The income limit a tier's label states, as a share of the area median —
 *  "60% AMI", "at or below 50% of AMI", "30% of area median income",
 *  "AMI ≤ 80%"; null where it states none, or a figure outside 20–140. */
export function amiPctOf(label: string): number | null {
  const m = label.match(AMI) ?? label.match(AMI_FIRST);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 20 && n <= 140 ? n : null;
}

const rentOf = (text: string): number | null => {
  const n = parseUsd(text ?? "", 100);
  return n != null && n <= 50_000 ? n : null;
};

function tierOf(t: AffordableTierStated): AffordableTier {
  const label = (t.label ?? "").trim();
  const amiPct = amiPctOf(label);
  // Assistance first: a "60% AMI / Section 8" unit collects the contract's
  // rent. A market tier states no income limit; a manager's or a model unit
  // is neither restricted nor rented.
  const kind: TierKind = ASSISTED.test(label)
    ? "assisted"
    : amiPct != null
      ? "restricted"
      : MARKET.test(label)
        ? "market"
        : "other";
  const units = parseCount(t.units ?? "");
  const rent = rentOf(t.rent);
  const maxRent = rentOf(t.maxRent);
  return {
    label,
    amiPct,
    kind,
    units,
    rent,
    maxRent,
    headroom: rent != null && maxRent != null ? maxRent - rent : null,
  };
}

/** A count row's figure — a whole number of one or more, else null. */
const stated = (row: MetricRow | null): number | null => (row ? parseCount(row.value) : null);

/** The tiers' units of the kinds asked — null unless every such tier states
 *  its units (four of five tiers is a partial sum, not a count). */
function tierSum(tiers: AffordableTier[], kinds: TierKind[]): number | null {
  const hits = tiers.filter((t) => kinds.includes(t.kind));
  if (hits.length === 0 || hits.some((t) => t.units == null)) return null;
  return hits.reduce((s, t) => s + (t.units ?? 0), 0);
}

// ── The read ────────────────────────────────────────────────────────────

export interface AffordableRead {
  programs: AffordableProgram[];
  /** the programs as a page names them: "Housing tax credits (LIHTC) ·
   *  Section 8 HAP contract" */
  label: string;
  summary: string;
  agreement: string;
  assistance: string;
  page: string;
  /** what one of the building is called, and many */
  noun: { one: string; many: string };
  totalUnits: number | null;
  restrictedUnits: number | null;
  marketUnits: number | null;
  /** units under a HAP contract */
  assistedUnits: number | null;
  /** the restricted units over the whole count, percent — null where
   *  either is unstated or the two disagree */
  restrictedSharePct: number | null;
  /** the memorandum's counts cannot all be true — said, never averaged */
  countsDisagree: boolean;
  /** the only restriction is a HAP contract: no covenant named and no
   *  restricted count stated — its units are said once, as the contract's */
  hapOnly: boolean;
  tiers: AffordableTier[];
  /** when the rent restriction ends */
  restrictionEnds: DatedEnd | null;
  /** the credits' compliance period's end */
  complianceEnds: DatedEnd | null;
  /** the HAP contract's expiry */
  hapEnds: DatedEnd | null;
  /** an end the memorandum states as a term from a start, kept as stated */
  unreadEnds: string[];
  /** the program, the counts and the clocks in the reader's sentences, one
   *  a line — the panel leads with the first and folds the rest */
  sentences: string[];
  /** the sentences every surface leads with, as one paragraph */
  headline: string;
  /** each tier's rent against its limit, where the memorandum states both */
  tierLines: string[];
  /** the restricted tiers' average against the market-rate tier's, on the
   *  memorandum's own averages — null unless every tier on each side states
   *  its units and its rent */
  gapLine: string | null;
  /** what the screening model is and is not on this deal */
  modelCaveat: string | null;
}

const money = (n: number) =>
  n >= 1e6 ? `$${(Math.round(n / 1e5) / 10).toFixed(1)}M` : n >= 1e4 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n).toLocaleString("en-US")}`;
/** A share of the building, never rounded to all or none it is not: 239 of
 *  240 is 99%, 1 of 240 is 1%. */
export const sharePctText = (n: number) => `${n >= 100 ? 100 : n <= 0 ? 0 : Math.min(99, Math.max(1, Math.round(n)))}%`;
const count = (n: number) => n.toLocaleString("en-US");

/** "until Dec 2054, 28.2 years from today" — or that its end has passed, or
 *  that the memorandum states a term rather than an end. */
function untilClause(e: DatedEnd | null, unread: string | null): string {
  if (!e) {
    return unread
      ? `, for a term the memorandum states as "${unread.replace(/\.$/, "")}" rather than as a date it ends`
      : ", and the memorandum states no date it ends";
  }
  if (endHasPassed(e)) {
    return ` — its stated end, ${endLabel(e)}, has passed: check whether it was extended, or the building released`;
  }
  return ` until ${e.from === "year" ? "the end of " : ""}${endLabel(e)}, ${fromToday(e)}`;
}

/** The programs that restrict rents (a HAP contract pays them, and is said
 *  apart), as a phrase: "a LIHTC regulatory agreement and a tax-exempt
 *  bond regulatory agreement". */
function restrictionPhrase(programs: AffordableProgram[]): string | null {
  const phrases = programs.filter((p): p is Exclude<AffordableProgram, "section8"> => p !== "section8").map((p) => PROGRAM_PHRASE[p]);
  if (phrases.length === 0) return null;
  return phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

/**
 * Read the restriction into what every surface says. Null on a market-rate
 * deal (or an extraction saved before it was read) — nothing restricted,
 * nothing said.
 */
export function readAffordable(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): AffordableRead | null {
  const a = ex?.affordable;
  if (!ex || !a) return null;
  const programs = ORDER.filter((p) => (a.programs ?? []).includes(p));
  const rows = affordableRowsOf(ex);
  const tiers = (a.tiers ?? []).map(tierOf).filter((t) => t.label || t.units != null);
  // A restriction the extraction names, or a count of restricted units it
  // found; anything less ("0 affordable units" included) is a market-rate
  // deal.
  if (programs.length === 0 && stated(rows.restrictedRow) == null && stated(rows.hapUnitsRow) == null) return null;

  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const n = parsePageNumber(a.page);
  const page = n != null && pageCount != null && n <= pageCount ? (a.page ?? "").trim() : "";

  const unitRow = unitCountRow(ex.metrics ?? []);
  const many = countNoun(unitRow?.label, ex.assetClass);
  const noun = { one: many.replace(/s$/, ""), many };

  const totalUnits = unitCountFromMetrics(ex.metrics ?? []);
  const restrictedStated = stated(rows.restrictedRow) ?? tierSum(tiers, ["restricted", "assisted"]);
  const assistedUnits = stated(rows.hapUnitsRow) ?? tierSum(tiers, ["assisted"]);
  const restriction = restrictionPhrase(programs);
  // A building whose only restriction is its HAP contract: no covenant
  // named, no restricted count stated — the contract's units are the ones
  // whose rents are set, and they are said once, as the contract's.
  const hapOnly = !restriction && restrictedStated == null && (programs.includes("section8") || assistedUnits != null);
  const restrictedUnits = restrictedStated ?? (hapOnly ? assistedUnits : null);
  const marketStated = stated(rows.marketRow) ?? tierSum(tiers, ["market"]);
  const countsDisagree =
    totalUnits != null &&
    ((restrictedUnits != null && restrictedUnits > totalUnits) ||
      (restrictedUnits != null && marketStated != null && restrictedUnits + marketStated > totalUnits) ||
      (assistedUnits != null && assistedUnits > totalUnits));
  const marketUnits =
    marketStated ?? (!countsDisagree && totalUnits != null && restrictedUnits != null ? totalUnits - restrictedUnits : null);
  const restrictedSharePct =
    !countsDisagree && totalUnits != null && totalUnits > 0 && restrictedUnits != null ? (restrictedUnits / totalUnits) * 100 : null;

  const restrictionEnds = datedEnd(rows.restrictionEndRow, "last", asOf, pageCount);
  const complianceEnds = programs.includes("lihtc") ? datedEnd(rows.complianceRow, "last", asOf, pageCount) : null;
  const hapEnds = datedEnd(rows.hapEndRow, "first", asOf, pageCount);
  const unreadEnds = [
    rows.restrictionEndRow && !restrictionEnds ? `The restriction's term as stated: ${rows.restrictionEndRow.value.trim()}` : "",
    rows.hapEndRow && !hapEnds ? `The HAP contract's term as stated: ${rows.hapEndRow.value.trim()}` : "",
  ].filter(Boolean);

  // ── The sentences ──
  const lines: string[] = [];
  const everyUnit = restrictedUnits != null && totalUnits != null && restrictedUnits === totalUnits && !countsDisagree;
  // Housing credits and bonds cap rents off HUD's published income limits;
  // a city's or a tax exemption's covenant sets its own, commonly off the
  // same area median — said as what they are.
  const limits = programs.some((p) => p === "lihtc" || p === "bond")
    ? "move with HUD's published income limits"
    : "move with the area median income the covenant sets them from";
  if (!hapOnly && (restriction || restrictedUnits != null)) {
    const under = restriction ? ` under ${restriction}` : "";
    const who = everyUnit
      ? `All ${count(totalUnits!)} ${noun.many} are rent-restricted`
      : restrictedUnits != null && totalUnits != null && restrictedSharePct != null
        ? `${count(restrictedUnits)} of the ${count(totalUnits)} ${noun.many} (${sharePctText(restrictedSharePct)}) are rent-restricted`
        : restrictedUnits != null
          ? `${count(restrictedUnits)} ${restrictedUnits === 1 ? `${noun.one} is` : `${noun.many} are`} rent-restricted`
          : `Some of the ${noun.many} are rent-restricted — the memorandum states no count of them —`;
    lines.push(
      `This is an affordable-housing deal: ${who}${under}${untilClause(restrictionEnds, rows.restrictionEndRow && !restrictionEnds ? rows.restrictionEndRow.value.trim() : null)}.`,
      `Their rents are capped at the program's limits and ${limits}, not with the market — the gap to market on those ${noun.many} is the restriction's cost, not loss to lease, and it is the buyer's only when the restriction ends.`,
    );
  }
  if (countsDisagree) {
    lines.push(
      `The memorandum's counts do not agree — ${[
        restrictedUnits != null ? `${count(restrictedUnits)} restricted` : "",
        marketStated != null ? `${count(marketStated)} market-rate` : "",
        assistedUnits != null ? `${count(assistedUnits)} under a HAP contract` : "",
      ]
        .filter(Boolean)
        .join(", ")} against ${count(totalUnits!)} ${noun.many} in all; check the rent roll before any share is read.`,
    );
  }
  if (programs.includes("section8") || assistedUnits != null || hapEnds) {
    const opener = lines.length === 0 ? "This is an affordable-housing deal: " : "";
    const who =
      assistedUnits != null && !countsDisagree
        ? totalUnits != null && assistedUnits === totalUnits
          ? `all ${count(totalUnits)} ${noun.many} carry a Section 8 HAP contract`
          : `${count(assistedUnits)} ${totalUnits != null ? `of the ${count(totalUnits)} ` : ""}${assistedUnits === 1 && totalUnits == null ? noun.one : noun.many} carry a Section 8 HAP contract`
        : "the building carries a Section 8 HAP contract";
    const when = !hapEnds
      ? rows.hapEndRow
        ? `, its term stated as "${rows.hapEndRow.value.trim().replace(/\.$/, "")}" rather than as a date it expires`
        : " whose expiry the memorandum does not state — ask for the contract, its rents and its renewal history"
      : endHasPassed(hapEnds)
        ? ` whose stated expiry, ${endLabel(hapEnds)}, has passed — it has been renewed or is running on an extension; ask which`
        : ` that expires ${hapEnds.from === "year" ? "in " : ""}${endLabel(hapEnds)}, ${fromToday(hapEnds)}`;
    const sentence = `${who}${when}`;
    lines.push(
      `${opener}${opener ? sentence : sentence.charAt(0).toUpperCase() + sentence.slice(1)}.`,
      `The contract sets the rent and HUD pays what the tenant's share of it does not; at renewal HUD brings contract rents above market down to market, and an owner who opts out gives a year's notice, the tenants take vouchers and the ${noun.many} rent at market.`,
    );
  }
  if (complianceEnds && restrictionEnds && !endHasPassed(restrictionEnds)) {
    lines.push(
      !endHasPassed(complianceEnds)
        ? `The credits' compliance period runs to ${endLabel(complianceEnds)}; the rent limits run past it, to ${endLabel(restrictionEnds)} — the fifteenth year ends the investor's recapture exposure, not the restriction.`
        : `The credits' compliance period ended in ${endLabel(complianceEnds)}; the rent limits did not — they run to ${endLabel(restrictionEnds)} under the extended-use agreement.`,
    );
  }

  // ── The tiers' figures ──
  const tierLines: string[] = [];
  for (const t of tiers) {
    if (t.kind === "market" || t.rent == null || t.maxRent == null || t.headroom == null) continue;
    const units = t.units != null ? ` (${count(t.units)} ${t.units === 1 ? noun.one : noun.many})` : "";
    if (t.headroom < 0) {
      tierLines.push(
        `${t.label}${units}: the ${money(t.rent)} rent is over the ${money(t.maxRent)} limit the memorandum states — a rent over the limit is a compliance finding, not income.`,
      );
    } else if (t.headroom <= t.maxRent * 0.01) {
      tierLines.push(
        `${t.label}${units}: ${money(t.rent)} a month, at the ${money(t.maxRent)} limit the memorandum states — its rents grow only as the limits do.`,
      );
    } else {
      tierLines.push(
        `${t.label}${units}: ${money(t.rent)} a month against the ${money(t.maxRent)} limit the memorandum states — ${money(t.headroom)} of headroom; past it, its rents grow only as the limits do.`,
      );
    }
  }
  // The restricted tiers' average against the market-rate tier's, on the
  // memorandum's own averages — only where every tier on each side states
  // its units and its rent.
  const restrictedTiers = tiers.filter((t) => t.kind === "restricted" || t.kind === "assisted");
  const marketTiers = tiers.filter((t) => t.kind === "market");
  const weighted = (ts: AffordableTier[]) => {
    if (ts.length === 0 || ts.some((t) => t.units == null || t.rent == null)) return null;
    const u = ts.reduce((s, t) => s + (t.units ?? 0), 0);
    return u > 0 ? { units: u, rent: ts.reduce((s, t) => s + (t.units ?? 0) * (t.rent ?? 0), 0) / u } : null;
  };
  const rAvg = weighted(restrictedTiers);
  const mAvg = weighted(marketTiers);
  let gapLine: string | null = null;
  if (rAvg && mAvg && mAvg.rent > rAvg.rent) {
    const gap = mAvg.rent - rAvg.rent;
    const held = restrictionEnds && !endHasPassed(restrictionEnds) ? ` until ${endLabel(restrictionEnds)}` : "";
    gapLine = `The restricted ${noun.many} average ${money(rAvg.rent)} a month and the market-rate ${noun.many} ${money(mAvg.rent)}, on the memorandum's own averages, which blend unit types — ${money(gap)} a month apart, about ${money(gap * rAvg.units * 12)} a year across the ${count(rAvg.units)} restricted ${rAvg.units === 1 ? noun.one : noun.many} that the restriction holds back${held}.`;
  }

  // ── What the model is and is not ──
  const caveats: string[] = [];
  const until = restrictionEnds && !endHasPassed(restrictionEnds) ? ` until ${endLabel(restrictionEnds)}` : "";
  if (!hapOnly && everyUnit) {
    caveats.push(
      `The screening model grows every ${noun.one}'s rent at one rate, and here every ${noun.one}'s rent is capped by the restriction${until} — its rent growth is the limits' growth on this deal, not the market's.`,
    );
  } else if (!hapOnly && restrictedSharePct != null && marketUnits != null) {
    caveats.push(
      `The screening model grows every ${noun.one}'s rent at one rate. Here ${sharePctText(restrictedSharePct)} of them are capped by the restriction${until} and ${limits} — read its rent growth as the ${count(marketUnits)} market-rate ${marketUnits === 1 ? noun.one : noun.many}' and hold the restricted ${noun.many} to the limits.`,
    );
  } else if (!hapOnly && (restriction || restrictedUnits != null)) {
    caveats.push(
      `The screening model grows every ${noun.one}'s rent at one rate; the restricted ${noun.many}' rents are capped by the restriction${until} and ${limits}, not with the market.`,
    );
  }
  if (programs.includes("section8") || assistedUnits != null) {
    caveats.push(
      "Between renewals a HAP contract's rents move by HUD's annual operating-cost factor, and at renewal they reset to what HUD will pay — the model's rent growth is not theirs.",
    );
  }

  return {
    programs,
    label: programs.length ? programs.map((p) => PROGRAM_NAME[p]).join(" · ") : "Rent-restricted units",
    summary: (a.summary ?? "").trim(),
    agreement: (a.agreement ?? "").trim(),
    assistance: (a.assistance ?? "").trim(),
    page,
    noun,
    totalUnits,
    restrictedUnits,
    marketUnits,
    assistedUnits,
    restrictedSharePct,
    countsDisagree,
    hapOnly,
    tiers,
    restrictionEnds,
    complianceEnds,
    hapEnds,
    unreadEnds,
    sentences: lines,
    headline: lines.join(" "),
    tierLines,
    gapLine,
    modelCaveat: caveats.length ? caveats.join(" ") : null,
  };
}

// ── Wherever the deal is summarized ────────────────────────────────────

/** The program in a word, for the tag. */
function programWord(r: AffordableRead): string {
  const hap = r.programs.includes("section8") || r.assistedUnits != null;
  if (r.programs.includes("lihtc")) return hap ? "LIHTC + Section 8" : "LIHTC";
  if (r.hapOnly) return "Section 8";
  return "Affordable";
}

/**
 * The pipeline row's tag — "LIHTC, 75% restricted", "Section 8, 34% of
 * units", "Affordable, 20% restricted" — beside the price, where a scan of
 * the pipeline sees which buildings' rents a covenant sets. Null on a
 * market-rate deal.
 */
export function affordableTag(ex: ExtractionResult | null | undefined): string | null {
  const r = readAffordable(ex);
  if (!r) return null;
  const word = programWord(r);
  if (r.hapOnly) {
    return r.assistedUnits != null && r.totalUnits != null && r.totalUnits > 0 && !r.countsDisagree
      ? `${word}, ${sharePctText((r.assistedUnits / r.totalUnits) * 100)} of ${r.noun.many}`
      : word;
  }
  return r.restrictedSharePct != null ? `${word}, ${sharePctText(r.restrictedSharePct)} restricted` : word;
}

/**
 * The restriction in one line, for the documents with no room for the
 * panel — the memo under its title, the workbook's cover, the shared
 * screen: how much is restricted, under what, until when, and the HAP
 * contract's expiry.
 */
export function affordableShortLine(r: AffordableRead): string {
  const parts: string[] = [];
  const restricted = r.programs.filter((p): p is Exclude<AffordableProgram, "section8"> => p !== "section8");
  const under = restricted.length ? ` under ${restricted.map((p) => PROGRAM_SHORT[p]).join(" and ")}` : "";
  const until =
    r.restrictionEnds && !endHasPassed(r.restrictionEnds)
      ? ` until ${endLabel(r.restrictionEnds)}`
      : r.restrictionEnds
        ? " (its stated end has passed)"
        : "";
  if (!r.hapOnly) {
    parts.push(
      r.restrictedUnits != null && r.totalUnits != null && r.restrictedSharePct != null
        ? `${count(r.restrictedUnits)} of ${count(r.totalUnits)} ${r.noun.many} (${sharePctText(r.restrictedSharePct)}) rent-restricted${under}${until}`
        : r.restrictedUnits != null
          ? `${count(r.restrictedUnits)} ${r.restrictedUnits === 1 ? r.noun.one : r.noun.many} rent-restricted${under}${until}`
          : `rent-restricted ${r.noun.many}${under}${until}`,
    );
  }
  if (r.programs.includes("section8") || r.assistedUnits != null) {
    const hap = r.hapEnds && !endHasPassed(r.hapEnds) ? ` to ${endLabel(r.hapEnds)}` : r.hapEnds ? " (its stated expiry has passed)" : "";
    parts.push(
      r.assistedUnits != null && !r.countsDisagree
        ? `${count(r.assistedUnits)} ${r.hapOnly && r.totalUnits != null ? `of ${count(r.totalUnits)} ${r.noun.many} ` : ""}under a Section 8 HAP contract${hap}`
        : `a Section 8 HAP contract${hap}`,
    );
  }
  return `Affordable housing: ${parts.join("; ")}`;
}

/** The deal context's line: the restriction, for every step that reads the
 *  OM after the extraction. */
export function affordableContextLine(r: AffordableRead): string {
  const facts = [
    r.agreement ? `The regulatory agreement as stated: ${r.agreement.replace(/\.$/, "")}.` : "",
    r.assistance ? `The rental assistance as stated: ${r.assistance.replace(/\.$/, "")}.` : "",
    ...r.unreadEnds.map((u) => `${u.replace(/\.$/, "")}.`),
    ...r.tierLines,
    r.gapLine ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return `Affordability: ${r.headline}${facts ? ` ${facts}` : ""}`;
}

const TRAPS: Record<AffordableProgram, string> = {
  lihtc:
    "LIHTC TRAPS, checked by name where the OM gives the inputs: (a) RENTS AT THE LIMIT — a restricted rent is capped at 30% of the income limit for the unit's imputed household, less the utility allowance; hold the pro forma's restricted rents to HUD's current MTSP limits for the county, and a rent already at the limit grows only as the limits do; (b) THE RESTRICTION'S END — the extended-use period runs past the fifteen-year compliance period, often thirty years or more, and a qualified-contract release is an application an agency can defeat, not a date: a pro forma that marks restricted units to market before the stated end is a misread; (c) THE VALUE-ADD — a renovation premium on a restricted unit is capped by the limit, so only the market-rate units can carry one; (d) COMPLIANCE — tenant income certifications, the next-available-unit rule and the agency's inspections, and a finding that follows the building; (e) THE EXIT — a buyer of a restricted building prices restricted income, and a sale or a transfer needs the housing agency's consent; (f) EXPENSES AND RESERVES — compliance, reporting and resident services run above a market-rate building's, and the replacement reserve the agreement requires is real cash.",
  section8:
    "SECTION 8 TRAPS, checked by name where the OM gives the inputs: (a) THE CONTRACT'S END — a HAP contract expiring inside the hold is a renewal on HUD's terms: contract rents above market are marked down to market, and a mark-up needs a rent comparability study; (b) OPT-OUT — an owner who does not renew gives a year's notice and the tenants enhanced vouchers, so the income becomes market rent collected from voucher holders; (c) THE ADJUSTMENT — between renewals the contract rents move by HUD's annual operating-cost adjustment factor, not the market; (d) APPROPRIATIONS — the payments depend on the program being funded; (e) HUD'S CONSENT — assigning the contract to a buyer needs HUD's approval of the buyer.",
  bond:
    "BOND SET-ASIDE TRAPS, checked by name where the OM gives the inputs: (a) THE QUALIFIED PROJECT PERIOD — the set-aside binds for the bond agreement's term, at least fifteen years and often longer, whether or not the bonds are still outstanding; (b) THE SET-ASIDE TEST — 20% of the units at 50% of AMI or 40% at 60%, certified every year; (c) THE BONDS' COVENANTS — a refinance or a sale runs through the issuer and the trustee.",
  tax_exemption:
    "TAX-EXEMPTION TRAPS, checked by name where the OM gives the inputs: (a) THE EXEMPTION IS THE INCOME — the taxes not paid are income only while the restricted units stay restricted and certified, and losing the exemption resets the tax line to full assessment; (b) THE PUBLIC PARTNER — a PFC or HFC structure puts a public entity in the ownership and takes a fee, and its consent governs a sale; (c) THE END — when the exemption or abatement ends, the tax line resets, and a pro forma that carries the exempt taxes past that date is a misread.",
  inclusionary:
    "INCLUSIONARY TRAPS, checked by name where the OM gives the inputs: (a) PERMANENCE — an inclusionary covenant commonly runs with the land for decades or for good; (b) NO CONVERSION — the restricted units cannot be marked to market or renovated out of the program; (c) THE ADMINISTRATOR — income certification and resale or re-leasing through the city's program.",
  other:
    "COVENANT TRAPS, checked by name where the OM gives the inputs: (a) THE TERM — how long the covenant binds and whether it survives a sale or a refinance; (b) THE RENT AND INCOME LIMITS — which the covenant sets and how they move; (c) THE LENDER — a soft loan's covenant usually comes with the loan's own consent rights.",
};

/**
 * The restriction's traps, for the challenger — appended to its notes like
 * the interest's: the facts first, then each program's traps by name.
 */
export function affordableNote(r: AffordableRead): string {
  const programs = r.programs.length ? r.programs : (["other"] as AffordableProgram[]);
  return `${affordableContextLine(r)} ${programs.map((p) => TRAPS[p]).join(" ")}`;
}
