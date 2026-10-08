// What a hotel is sold with (#455) — the flag, the franchise, the manager
// and the PIP. A hotel's buyer takes on contracts a building of leases does
// not have: a brand's franchise (the flag, its fees, its standards), a
// management agreement (the operator, its fee, its term) and, on a change of
// ownership, the brand's property improvement plan — a renovation the new
// owner must fund to keep the flag. None of it is in a cap rate.
//
// Pure — no I/O, no model call. The extraction states them
// (`ExtractionResult.hotel`, and the rows it labels "PIP cost", "PIP cost
// per key", "Franchise expiration", "Management agreement expiration",
// "ADR", "RevPAR", "RevPAR index" and "FF&E reserve"); this reads them into
// what every surface says.
//
// Six rules.
//
// THE PIP IS THE BUYER'S CAPITAL. The brand prices the renovation it
// requires at the sale; it is a cost of buying the hotel, said per key so
// it reads against the price per key, and a model that carries none of it
// overstates every return. Where the memorandum states a PIP and no other
// capital budget, the model takes it (lib/underwrite/inputs); where it
// states both, the budget is read as including it — never the two added.
//
// AN ENCUMBRANCE IS A CONTRACT THE BUYER TAKES. Sold encumbered by
// management, the buyer keeps the manager, its fee and its term; by the
// brand, the flag and its standards. Unencumbered is the buyer's choice of
// both, and nothing here says what that choice is worth. Where the price
// buys no hotel — a note, a preferred equity position, a share, the land
// under it — the contracts and the PIP are said as their holder's (lib/
// interest `propertyHolderOf`: the borrower's, the owning entity's, the
// co-owners', the leaseholder's), and a note's as the collateral's.
//
// THE FLAG HAS A CLOCK, AND SO DOES THE MANAGER. A franchise that ends
// inside the hold is a relicensing — with its own PIP — or a hotel that
// goes independent; a management agreement's end is when the buyer may
// choose. A year alone is read on the side that does not flatter the buyer:
// the franchise's FIRST day (the flag is never counted for months it may
// not fly), the management agreement's LAST (the buyer is never counted
// free of the manager early).
//
// REVPAR IS ADR × OCCUPANCY. Where the memorandum states all three they
// must tie; where they do not, one of them is wrong, and the screen says the
// three disagree rather than choosing one.
//
// THE INDEX SAYS WHOSE PROBLEM IT IS. A RevPAR index is the hotel's share
// of its competitive set's revenue per room, 100 its fair share (the
// /tools hotel card's rule 2). Under 100 the hotel under-earns its market;
// over it, it out-earns it.
//
// A BLANK IS NULL. A PIP, a date or an index the memorandum does not state
// is not assumed — and "the memorandum states no PIP" is said, since a
// brand may require one on the sale.

import { withArticle } from "@/lib/article";
import type { ExtractionResult, HotelEncumbrance } from "@/lib/anthropic/types";
import { datedEnd, endLabel, type DatedEnd } from "@/lib/affordable";
import { countNoun } from "@/lib/asset-words";
import { unitCountFromMetrics, unitCountRow } from "@/lib/criteria";
import { askingPriceOf, buildingPriceOf } from "@/lib/deal-strategy";
import { parsePageNumber } from "@/lib/facts";
import { endHasPassed, endsByYear, fromToday, yearsText } from "@/lib/ground-lease-term";
import { PROPERTY_HOLDER_WORDS, propertyHolderOf, type PropertyHolder } from "@/lib/interest";
import { compactUsd, parseUsd, statesRange } from "@/lib/money";

export type { HotelEncumbrance };

type MetricRow = { label: string; value: string; page?: string };

const isRow = (m: unknown): m is MetricRow =>
  !!m && typeof m === "object" && typeof (m as MetricRow).label === "string" && typeof (m as MetricRow).value === "string";

// ── The rows ────────────────────────────────────────────────────────────

const PIP_ROW = /\bpip\b|property\s+improvement\s+plan/i;
const PER_KEY = /\bper\s+(?:key|room|unit)\b|\/\s*(?:key|room|unit)\b/i;
const FRANCHISE_END = /\b(?:franchise|license)\b.*\b(?:expir\w*|ends?|end\s+date|term(?:ination)?)\b/i;
const MANAGEMENT_END = /\bmanagement\s+(?:agreement|contract)\b.*\b(?:expir\w*|ends?|end\s+date|term(?:ination)?)\b/i;
const ADR_ROW = /^(?:(?:in[- ]place|current|t-?12|ttm|trailing)\s+)?(?:adr|average\s+daily\s+rate)(?:\s*\((?:t-?12|ttm|in[- ]place|current)\))?$/i;
const REVPAR_ROW = /^(?:(?:in[- ]place|current|t-?12|ttm|trailing)\s+)?revpar(?:\s*\((?:t-?12|ttm|in[- ]place|current)\))?$/i;
const INDEX_ROW = /\brevpar\s+(?:index|penetration)\b|\brgi\b/i;
const FFE_ROW = /\bff\s*&\s*e\b.*\breserve\b|\breserve\b.*\bff\s*&\s*e\b/i;
const OCC_ROW = /^(?:(?:in[- ]place|current|t-?12|ttm|trailing)\s+)?occupancy(?:\s*\((?:t-?12|ttm|in[- ]place|current)\))?$/i;
// A pro forma, stabilized or projected figure is the sponsor's, never today's.
const FORWARD = /pro\s*forma|stabili[sz]|projected|forecast|budget|year\s*[2-9]|target/i;

function rowsOf(ex: ExtractionResult): MetricRow[] {
  return (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow);
}

const find = (rows: MetricRow[], re: RegExp, not?: RegExp) =>
  rows.find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

/** A percentage a value states: "72.4%", "72.4". */
function pctOf(value: string): number | null {
  const m = value.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*%?/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** A room rate or RevPAR a value states, to the cent ("$189.50") —
 *  parseUsd rounds to whole dollars, which an ADR cannot afford. A range
 *  ("$180–$195") is no single figure (lib/money `statesRange`, so "$189.50
 *  – 2025 actual" is the rate it states). */
function dollarsOf(value: string): number | null {
  if (statesRange(value)) return null;
  const v = value.replace(/,/g, "");
  const m = v.match(/\$?\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The hotel's own rows, for a key-terms block to lead with after the
 *  count: the PIP, the franchise's end, and RevPAR. */
export function hotelTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter(isRow) as M[];
  const pip = rows.find((m) => PIP_ROW.test(m.label) && !PER_KEY.test(m.label)) ?? rows.find((m) => PIP_ROW.test(m.label));
  const franchise = rows.find((m) => FRANCHISE_END.test(m.label));
  const revpar = rows.find((m) => REVPAR_ROW.test(m.label) && !FORWARD.test(m.label));
  return [pip, franchise, revpar].filter((m): m is M => m != null);
}

// ── The read ────────────────────────────────────────────────────────────

export interface HotelDealRead {
  /** the flag as stated, "" where none is named */
  brand: string;
  /** the memorandum says the hotel carries no flag */
  independent: boolean;
  franchise: string;
  management: string;
  encumbrance: HotelEncumbrance;
  /** who holds the hotel's contracts and capital on this deal, by what the
   *  price buys (lib/interest `propertyHolderOf`): the buyer on a fee
   *  simple, the borrower on a note, the owning entity on a position or a
   *  share — so no sentence has a note's buyer keep a manager it never
   *  bought */
  holder: PropertyHolder;
  /** the PIP's own words */
  pip: string;
  /** cited only where it parses and falls inside the memorandum */
  page: string;
  keys: number | null;
  /** the count's own noun — "keys", or "rooms" where the memorandum counts
   *  rooms */
  keyNoun: string;
  /** the PIP's total and per key, each stated or derived from the other
   *  over the key count; null where neither is stated as a figure */
  pipTotal: number | null;
  pipPerKey: number | null;
  /** which of the two the memorandum stated */
  pipStated: "total" | "per_key" | null;
  /** the stated PIP row's page, cited only inside the memorandum */
  pipPage: string;
  /** the building's price over the key count (lib/deal-strategy's
   *  `buildingPriceOf` — none on a note or the land), and with the PIP on
   *  top of it: the basis a buyer is really paying a key */
  pricePerKey: number | null;
  allInPerKey: number | null;
  franchiseEnds: DatedEnd | null;
  managementEnds: DatedEnd | null;
  adr: number | null;
  occupancyPct: number | null;
  revpar: number | null;
  /** ADR × occupancy, where both are stated */
  revparComputed: number | null;
  /** whether the three tie within 2% — null where one is missing */
  ties: boolean | null;
  revparIndex: number | null;
  ffeReservePct: number | null;
  /** the sale, the PIP, the clocks and the room revenue, in the reader's
   *  sentences, one a line — the panel leads with the first and folds the
   *  rest */
  sentences: string[];
  /** those sentences as one paragraph */
  headline: string;
}

/** The read's figures, before its sentences are written from them. */
type HotelFacts = Omit<HotelDealRead, "headline" | "sentences">;

const clean = (s: string | null | undefined) => (s ?? "").trim();
const pageIn = (page: string | undefined, pageCount: number | null) => {
  const n = parsePageNumber(page);
  return n != null && pageCount != null && n <= pageCount ? clean(page) : "";
};
const INDEPENDENT = /^\s*(?:independent|unbranded|non[- ]?branded|no\s+(?:brand|flag))\b/i;

/**
 * What a hotel is sold with, on a day. Null on anything but a hotel the
 * memorandum names a flag, a manager, an encumbrance or a PIP for — a
 * building of leases has none of them.
 */
export function readHotelDeal(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): HotelDealRead | null {
  const h = ex?.hotel;
  if (!ex || !h) return null;
  const brand = clean(h.brand);
  const franchise = clean(h.franchise);
  const management = clean(h.management);
  const pip = clean(h.pip);
  const encumbrance: HotelEncumbrance = ENCUMBRANCES.includes(h.encumbrance as HotelEncumbrance)
    ? (h.encumbrance as HotelEncumbrance)
    : "unknown";
  const rows = rowsOf(ex);
  const pipTotalRow = find(rows, PIP_ROW, PER_KEY);
  const pipKeyRow = rows.find((m) => PIP_ROW.test(m.label) && PER_KEY.test(m.label)) ?? null;
  if (!brand && !franchise && !management && !pip && encumbrance === "unknown" && !pipTotalRow && !pipKeyRow) return null;

  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const n = parsePageNumber(h.page);
  const page = n != null && pageCount != null && n <= pageCount ? clean(h.page) : "";

  const keys = unitCountFromMetrics(rows);
  const keyNoun = countNoun(unitCountRow(rows)?.label, "hospitality_str");
  const statedTotal = pipTotalRow ? parseUsd(pipTotalRow.value, 10_000) : null;
  const statedPerKey = pipKeyRow ? parseUsd(pipKeyRow.value, 500) : null;
  const pipTotal = statedTotal ?? (statedPerKey != null && keys != null && keys > 0 ? statedPerKey * keys : null);
  const pipPerKey = statedPerKey ?? (statedTotal != null && keys != null && keys > 0 ? statedTotal / keys : null);
  const building = buildingPriceOf(ex, askingPriceOf(ex));
  const pricePerKey = building != null && keys != null && keys > 0 ? building / keys : null;

  const adrRow = find(rows, ADR_ROW, FORWARD);
  const adr = adrRow ? dollarsOf(adrRow.value) : null;
  const occRow = find(rows, OCC_ROW, FORWARD);
  const occ = occRow ? pctOf(occRow.value) : null;
  const occupancyPct = occ != null && occ > 0 && occ <= 100 ? occ : null;
  const revparRow = find(rows, REVPAR_ROW, FORWARD);
  const revpar = revparRow ? dollarsOf(revparRow.value) : null;
  const revparComputed = adr != null && occupancyPct != null ? (adr * occupancyPct) / 100 : null;
  const ties = revpar != null && revparComputed != null && revpar > 0 ? Math.abs(revparComputed - revpar) / revpar <= 0.02 : null;
  const indexRow = find(rows, INDEX_ROW);
  const index = indexRow ? pctOf(indexRow.value) : null;
  const ffeRow = find(rows, FFE_ROW);
  const ffe = ffeRow && /%/.test(ffeRow.value) ? pctOf(ffeRow.value) : null;

  const read: HotelFacts = {
    brand,
    independent: INDEPENDENT.test(brand),
    franchise,
    management,
    encumbrance,
    holder: propertyHolderOf(ex),
    pip,
    page,
    keys,
    keyNoun,
    pipTotal,
    pipPerKey,
    pipStated: statedTotal != null ? "total" : statedPerKey != null ? "per_key" : null,
    pipPage: pageIn((statedTotal != null ? pipTotalRow : pipKeyRow)?.page, pageCount),
    pricePerKey,
    allInPerKey: pricePerKey != null && pipPerKey != null ? pricePerKey + pipPerKey : null,
    // The flag is never counted for months it may not fly; the buyer is
    // never counted free of the manager early.
    franchiseEnds: datedEnd(find(rows, FRANCHISE_END), "first", asOf, pageCount),
    managementEnds: datedEnd(find(rows, MANAGEMENT_END), "last", asOf, pageCount),
    adr,
    occupancyPct,
    revpar,
    revparComputed,
    ties,
    revparIndex: index != null && index > 0 && index < 400 ? index : null,
    ffeReservePct: ffe != null && ffe > 0 && ffe <= 15 ? ffe : null,
  };
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

const ENCUMBRANCES: HotelEncumbrance[] = ["unencumbered", "brand", "management", "brand_and_management", "unknown"];

// ── Saying it ───────────────────────────────────────────────────────────

const noPeriod = (s: string) => s.replace(/[.;,\s]+$/, "");
// "$4.2M", "$35k", "$12.5k": a PIP per key is often a half-thousand.
const money = (n: number) => compactUsd(n, { thousandsPlaces: 1 });
const dollars = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const pct1 = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

const ENCUMBRANCE_SENTENCE: Record<HotelEncumbrance, string> = {
  unencumbered: "It is sold unencumbered — free of its brand and its management — so the buyer chooses both.",
  management: "It is sold encumbered by its management agreement: the buyer keeps the manager, its fee and its term rather than choosing its own.",
  brand: "It is sold encumbered by its franchise: the buyer keeps the flag, its fees and its standards.",
  brand_and_management:
    "It is sold encumbered by both its franchise and its management agreement: the buyer keeps the flag and the manager, their fees and their terms.",
  unknown: "",
};

// A note's hotel is its collateral: the borrower keeps the contracts, and
// whether each binds a lender that takes the hotel in a foreclosure is the
// documents' to say, never this reader's.
const COLLATERAL_ENCUMBRANCE_SENTENCE: Record<HotelEncumbrance, string> = {
  unencumbered:
    "The collateral is unencumbered — free of its brand and its management — so whoever owns it chooses both: the borrower now, or a lender that takes the hotel in a foreclosure.",
  management:
    "The collateral is encumbered by its management agreement: the borrower keeps the manager, its fee and its term, and whether the agreement binds a lender that takes the hotel in a foreclosure is the loan documents' to say.",
  brand:
    "The collateral is encumbered by its franchise: the borrower keeps the flag, its fees and its standards, and whether the flag stays with a lender that takes the hotel in a foreclosure is the franchise's and the loan documents' to say.",
  brand_and_management:
    "The collateral is encumbered by both its franchise and its management agreement: the borrower keeps the flag and the manager, their fees and their terms, and whether each binds a lender that takes the hotel in a foreclosure is the documents' to say.",
  unknown: "",
};

/** The encumbrance as the holder meets it: sold with the hotel to the
 *  buyer; the collateral's on a note; and on a position, a share or the
 *  land under the hotel, the owner's or the leaseholder's, the hotel not
 *  changing hands. */
function encumbranceSentence(r: Pick<HotelFacts, "encumbrance" | "holder">): string {
  if (r.holder === "buyer" || r.encumbrance === "unknown") return ENCUMBRANCE_SENTENCE[r.encumbrance];
  if (r.holder === "borrower") return COLLATERAL_ENCUMBRANCE_SENTENCE[r.encumbrance];
  const w = PROPERTY_HOLDER_WORDS[r.holder];
  const keep = w.plural ? "keep" : "keeps";
  const sentence: Record<Exclude<HotelEncumbrance, "unknown">, string> = {
    unencumbered: `It is unencumbered — free of its brand and its management — so ${w.who} ${w.plural ? "choose" : "chooses"} both.`,
    management: `It is encumbered by its management agreement: ${w.who} ${keep} the manager, its fee and its term rather than choosing ${w.plural ? "their" : "its"} own.`,
    brand: `It is encumbered by its franchise: ${w.who} ${keep} the flag, its fees and its standards.`,
    brand_and_management: `It is encumbered by both its franchise and its management agreement: ${w.who} ${keep} the flag and the manager, their fees and their terms.`,
  };
  return sentence[r.encumbrance];
}

/** Whose capital the PIP is, after its figure: the buyer's on top of the
 *  price; on a note the borrower's, and what is unspent at a foreclosure
 *  the collateral's to bear; on a position or a share the owning entity's,
 *  apart from what this interest costs; on a leased fee the leaseholder's,
 *  reaching the land's buyer only through the ground rent's cover. */
const PIP_FUNDS: Record<PropertyHolder, string> = {
  buyer: " — capital the buyer funds on top of the price.",
  borrower: " — capital the borrower funds, and whatever of it is unspent at a foreclosure the collateral bears.",
  entity: " — capital the owning entity funds, apart from the price of this interest.",
  co_owners: " — capital the co-owners fund, this interest its share of it, beyond its price.",
  leaseholder: " — capital the leaseholder funds, which reaches this buyer only through the ground rent's cover.",
};

function flagSentence(r: HotelFacts): string {
  if (r.independent) return "The hotel is independent, as stated — no flag, no franchise fees, and no brand's reservation system behind it.";
  return r.brand ? `The hotel is flagged ${noPeriod(r.brand)}, as stated.` : "";
}

function pipSentence(r: HotelFacts): string {
  const funds = PIP_FUNDS[r.holder];
  const unit = r.keyNoun.replace(/s$/, "");
  const across = r.keys != null ? ` across its ${r.keys.toLocaleString("en-US")} ${r.keyNoun}` : "";
  if (r.pipTotal != null && r.pipPerKey != null) {
    return r.pipStated === "per_key"
      ? `The brand's property improvement plan is ${money(r.pipPerKey)} ${withArticle(unit)} as stated, ${money(r.pipTotal)}${across}${funds}`
      : `The brand's property improvement plan is ${money(r.pipTotal)}, ${money(r.pipPerKey)} ${withArticle(unit)}${r.pipStated === "total" ? across : ""}${funds}`;
  }
  if (r.pipTotal != null) return `The brand's property improvement plan is ${money(r.pipTotal)} as stated${funds}`;
  if (r.pipPerKey != null) return `The brand's property improvement plan is ${money(r.pipPerKey)} ${withArticle(unit)} as stated${funds}`;
  if (r.pip) return `The property improvement plan as stated: ${noPeriod(r.pip)}.`;
  // A flagged hotel changing hands may owe one, and silence is not a zero.
  return r.brand && !r.independent ? "The memorandum states no PIP — a brand may require one on a change of ownership, so ask for its PIP report before believing any return." : "";
}

function clockSentence(label: string, e: DatedEnd | null, passed: string): string {
  if (!e) return "";
  const end = endLabel(e);
  // Passed, today and ahead by the day (lib/ground-lease-term `DatedSpan`).
  if (endHasPassed(e)) return `The ${label}'s stated end, ${end}, has passed — ${passed}.`;
  return `The ${label} ends ${e.from === "year" ? `in ${end}` : end}, ${fromToday(e)}.`;
}

/** The room revenue and the index against the competitive set, a sentence
 *  each. */
function roomsSentences(r: HotelFacts): string[] {
  const parts: string[] = [];
  if (r.revpar != null && r.revparComputed != null && r.ties === false) {
    parts.push(
      `The memorandum's RevPAR of ${dollars(r.revpar)} does not tie to its ADR and occupancy — ${dollars(r.adr!)} × ${pct1(r.occupancyPct!)} is ${dollars(r.revparComputed)} — so one of the three is wrong; ask which.`,
    );
  } else if (r.revparComputed != null) {
    parts.push(`Room revenue per available room is ${dollars(r.revparComputed)}: ${dollars(r.adr!)} a night at ${pct1(r.occupancyPct!)} occupancy.`);
  }
  if (r.revparIndex != null) {
    const i = Math.round(r.revparIndex);
    parts.push(
      i === 100
        ? "Its RevPAR index is 100 — it earns what its competitive set does per available room."
        : i < 100
          ? `Its RevPAR index is ${i}: it earns ${100 - i}% less per available room than its competitive set, so the market is not the whole story.`
          : `Its RevPAR index is ${i}: it earns ${i - 100}% more per available room than its competitive set.`,
    );
  }
  return parts;
}

function sentencesOf(r: HotelFacts): string[] {
  return [
    flagSentence(r),
    encumbranceSentence(r),
    pipSentence(r),
    // A hotel often runs on past its license's or its agreement's stated
    // end, on an extension or month to month: said as a question, never as
    // a misread.
    clockSentence("franchise", r.franchiseEnds, "it may run on an extension or month to month; ask what the brand requires to keep or relicense the flag"),
    clockSentence("management agreement", r.managementEnds, "it may run on an extension or month to month; check the agreement"),
    ...roomsSentences(r),
  ].filter(Boolean);
}

/** The model a hotel's contracts are set against: its hold (months) and
 *  the capital its first year carries. */
export interface HotelModel {
  holdMonths: number;
  capitalYr1: number;
  /** whether the model's capital line came from the PIP */
  capitalIsPip: boolean;
}

/**
 * What the hotel's contracts mean for the screening model: the PIP against
 * the capital it carries, and a flag or a manager whose agreement ends
 * inside its hold. "" where there is nothing to say.
 */
export function hotelModelLine(r: HotelDealRead, m: HotelModel): string {
  const hold = m.holdMonths / 12;
  const holdWord = Number.isInteger(hold) ? `${hold}-year` : `${yearsText(hold)}'`;
  const out: string[] = [];
  if (r.pipTotal != null) {
    if (m.capitalIsPip) out.push(`The model carries the ${money(r.pipTotal)} PIP as its first year's capital, so its returns pay for it.`);
    else if (m.capitalYr1 >= r.pipTotal * 0.98) {
      out.push(`The model carries ${money(m.capitalYr1)} of capital, the memorandum's own budget, read as including the ${money(r.pipTotal)} PIP rather than added to it.`);
    } else {
      out.push(
        `The model carries ${money(m.capitalYr1)} of capital against the ${money(r.pipTotal)} PIP — enter the PIP as the capital improvements to run the model on what the brand requires.`,
      );
    }
  }
  // Inside the hold and past the sale by the DAY: whole months put an end a
  // week after the sale inside it.
  const f = r.franchiseEnds;
  if (f && !endHasPassed(f) && endsByYear(f, hold)) {
    out.push(`The franchise ends ${f.from === "year" ? `in ${endLabel(f)}` : endLabel(f)}, inside the model's ${holdWord} hold: a relicensing then brings its own PIP, or the hotel goes independent.`);
  }
  const g = r.managementEnds;
  if (g && !endsByYear(g, hold) && (r.encumbrance === "management" || r.encumbrance === "brand_and_management")) {
    out.push(`The management agreement runs past the model's sale, to ${endLabel(g)}: the next buyer inherits the manager too.`);
  }
  return out.join(" ");
}

/** The hotel in one line, for the memo under its title, the workbook's
 *  cover and the report: "Hotel: flagged Courtyard by Marriott, sold
 *  encumbered by management; PIP $4.2M ($35k a key); the franchise ends
 *  Jun 2034". */
export function hotelShortLine(r: HotelDealRead): string {
  const who = r.independent ? "independent" : r.brand ? `flagged ${noPeriod(r.brand)}` : "";
  const sale: Record<HotelEncumbrance, string> = {
    unencumbered: "sold unencumbered",
    management: "sold encumbered by management",
    brand: "sold encumbered by the franchise",
    brand_and_management: "sold encumbered by the franchise and management",
    unknown: "",
  };
  // The hotel is sold only where the price buys it; a note's, a position's,
  // a share's or the land's buyer buys no hotel, which stays as encumbered.
  const encumbered = r.holder === "buyer" ? sale[r.encumbrance] : sale[r.encumbrance].replace(/^sold /, "");
  const head = [who, encumbered].filter(Boolean).join(", ");
  const parts = [`Hotel${head ? `: ${head}` : ""}`];
  const unit = r.keyNoun.replace(/s$/, "");
  if (r.pipTotal != null) parts.push(`PIP ${money(r.pipTotal)}${r.pipPerKey != null ? ` (${money(r.pipPerKey)} ${withArticle(unit)})` : ""}`);
  else if (r.pipPerKey != null) parts.push(`PIP ${money(r.pipPerKey)} ${withArticle(unit)}`);
  else if (r.brand && !r.independent && !r.pip) parts.push("no PIP stated");
  if (r.franchiseEnds && !endHasPassed(r.franchiseEnds)) {
    parts.push(`the franchise ends ${r.franchiseEnds.from === "year" ? `in ${endLabel(r.franchiseEnds)}` : endLabel(r.franchiseEnds)}`);
  }
  return parts.join("; ");
}

/**
 * What the memorandum says a hotel's sale carries, for the letter of
 * intent's review note (research pass 35): the flag, the encumbrance and
 * the PIP as stated — "the hotel is flagged Hilton Garden Inn and sold
 * encumbered by the franchise, with a $4.2M PIP". The letter (lib/loi) says
 * beside it that the PSA should condition the closing on the franchisor
 * approving the transfer and the PIP as issued. Null where no franchisor
 * has a transfer to approve: an independent hotel, one sold unencumbered
 * (the buyer chooses its flag), and one the memorandum names no flag,
 * brand encumbrance or PIP for.
 */
export function hotelSaleFacts(r: HotelDealRead): string | null {
  if (r.independent || r.encumbrance === "unencumbered") return null;
  const flagSold = r.encumbrance === "brand" || r.encumbrance === "brand_and_management";
  if (!r.brand && !flagSold && r.pipStated == null && !r.pip) return null;
  const sold: Record<HotelEncumbrance, string> = {
    brand: "sold encumbered by the franchise",
    brand_and_management: "sold encumbered by the franchise and management",
    management: "sold encumbered by management",
    unencumbered: "",
    unknown: "",
  };
  const unit = r.keyNoun.replace(/s$/, "");
  // The PIP as stated: its total, or its figure a key, or its words — never
  // the one derived from the other.
  const pip =
    r.pipStated === "total" && r.pipTotal != null
      ? withArticle(`${money(r.pipTotal)} PIP`)
      : r.pipStated === "per_key" && r.pipPerKey != null
        ? `a PIP of ${money(r.pipPerKey)} ${withArticle(unit)}`
        : r.pip
          ? `a PIP stated as “${noPeriod(r.pip)}”`
          : null;
  const head = [r.brand ? `flagged ${noPeriod(r.brand)}` : "", sold[r.encumbrance]].filter(Boolean).join(" and ");
  if (!head) return pip ? `the sale carries ${pip}` : null;
  // A flag with no PIP stated: silence is not a zero, since a brand may
  // require one on a change of ownership.
  return `the hotel is ${head}${pip ? `, with ${pip}` : ", and states no PIP"}`;
}

/**
 * The pipeline row's tag: "Mgmt encumbered, PIP $35k/key", "Unencumbered",
 * "PIP $4.2M", "Independent". Null on anything that is not a hotel read.
 */
export function hotelTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readHotelDeal(ex, asOf);
  if (!r) return null;
  const enc: Record<HotelEncumbrance, string | null> = {
    unencumbered: "Unencumbered",
    management: "Mgmt encumbered",
    brand: "Brand encumbered",
    brand_and_management: "Brand + mgmt encumbered",
    unknown: null,
  };
  const pip = r.pipPerKey != null ? `PIP ${money(r.pipPerKey)}/${r.keyNoun.replace(/s$/, "")}` : r.pipTotal != null ? `PIP ${money(r.pipTotal)}` : null;
  const parts = [enc[r.encumbrance] ?? (r.independent ? "Independent" : null), pip].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** The hotel as the steps that read the memorandum after the extraction
 *  see it (lib/deal-context). */
export function hotelContextLine(r: HotelDealRead): string {
  const extra = [
    r.franchise ? `The franchise as stated: ${noPeriod(r.franchise)}.` : "",
    r.management ? `The management as stated: ${noPeriod(r.management)}.` : "",
    r.ffeReservePct != null ? `FF&E reserve as stated: ${r.ffeReservePct}% of revenue.` : "",
  ].filter(Boolean);
  return `Hotel: ${[r.headline, ...extra].filter(Boolean).join(" ")}${r.page ? ` (${r.page})` : ""}`;
}

/** The hotel's own facts, then the traps they bear on by name, for the
 *  assumption review — beside the class's own hotel trap list. */
export function hotelNote(r: HotelDealRead): string {
  const traps: string[] = [];
  const perKey = (n: number) => `${money(n)} ${withArticle(r.keyNoun.replace(/s$/, ""))}`;
  // Whose the contracts and the capital are (lib/interest
  // `propertyHolderOf`): on a note the borrower's, and what binds a lender
  // that takes the collateral is the documents' question.
  const w = PROPERTY_HOLDER_WORDS[r.holder];
  const note = r.holder === "borrower";
  const liveWith = note
    ? "are the borrower's to live with, and whether they bind a lender that takes the hotel in a foreclosure is the loan documents' to say"
    : `are ${w.whose} to live with`;
  // Whether the flag goes where the hotel goes: to the buyer on a sale; on a
  // note to a lender that takes the collateral; on a position or a share it
  // stays with the owner whose interest changes hands.
  const flagGoes: Record<PropertyHolder, string> = {
    buyer: "whether it transfers to the buyer",
    co_owners: "whether it transfers to the buyer",
    borrower: "whether it carries to a lender that takes the hotel in a foreclosure",
    entity: "whether a sale of an interest in the owning entity needs the brand's consent",
    leaseholder: "what its lapse would do to the ground rent's cover",
  };
  // Each trap says what the facts above say, never "none stated" over a
  // figure or words the memorandum gives.
  traps.push(
    r.pipTotal != null || r.pipPerKey != null
      ? `(a) THE PIP — ${[r.pipTotal != null ? money(r.pipTotal) : "", r.pipPerKey != null ? perKey(r.pipPerKey) : ""].filter(Boolean).join(", ")}: check it against the brand's own PIP report, its timing and the displacement while rooms are out of order, and never read a return that does not pay for it`
      : r.pip
        ? `(a) THE PIP — stated in words, with no cost ("${noPeriod(r.pip)}"): ask for the brand's PIP report and what it costs a key, and never read a return that does not pay for it`
        : r.independent
          ? `(a) NO BRAND'S PIP — an independent hotel has no brand to require one, but what its rooms need is ${note ? "the borrower's capital and the collateral's condition" : `${w.whose} capital`}: ask for the property condition report`
          : "(a) THE PIP — none stated: ask whether the brand requires one on the sale, and what it costs a key",
  );
  const choose = w.plural ? "choose" : "chooses";
  traps.push(
    r.encumbrance === "management" || r.encumbrance === "brand_and_management"
      ? `(b) THE MANAGEMENT ENCUMBRANCE — the manager, its base and incentive fees, its term, its termination rights and its key-money ${liveWith}: read the agreement, not the summary`
      : r.encumbrance === "brand"
        ? `(b) THE BRAND ENCUMBRANCE — ${r.holder === "buyer" ? "the sale carries" : "the hotel carries"} the franchise: its term, its transfer and change-of-ownership terms, the PIP it requires and its fees ${liveWith}: read the license agreement, not the summary`
        : r.encumbrance === "unencumbered"
          ? r.holder === "buyer"
            ? "(b) UNENCUMBERED — the buyer chooses the manager and the flag: price the transition, the new franchise's own PIP and application fee, and any downtime"
            : note
              ? "(b) UNENCUMBERED — whoever owns the collateral chooses the manager and the flag, the borrower now or a lender that takes the hotel in a foreclosure: price what a change would cost it — the transition, a new franchise's own PIP and application fee, and any downtime"
              : `(b) UNENCUMBERED — ${w.who} ${choose} the manager and the flag: price what a change would cost — the transition, a new franchise's own PIP and application fee, and any downtime`
          : "(b) THE ENCUMBRANCE — the memorandum does not say whether the sale is encumbered by management or the brand: ask, since it decides who runs the hotel",
  );
  traps.push(
    r.franchiseEnds && !endHasPassed(r.franchiseEnds)
      ? `(c) THE FLAG'S TERM — the franchise ends ${endLabel(r.franchiseEnds)}, ${fromToday(r.franchiseEnds)}: a relicensing brings a PIP of its own, and a flag that lapses takes its reservation system with it`
      : r.franchiseEnds
        ? `(c) THE FLAG'S TERM — the franchise's stated end, ${endLabel(r.franchiseEnds)}, has passed: ask whether the hotel runs on an extension or month to month, and what the brand requires to relicense it`
        : r.independent
          ? "(c) NO FLAG — the hotel is independent: its bookings are its own to win, and a flag later brings a PIP and fees of its own"
          : r.franchise
            ? `(c) THE FLAG'S TERM — the franchise as stated ("${noPeriod(r.franchise)}") gives no end the screen reads as a date: ask for the license's term and ${flagGoes[r.holder]}`
            : `(c) THE FLAG'S TERM — no franchise expiration stated: ask for the license's term and ${flagGoes[r.holder]}`,
  );
  traps.push(
    r.ties === false
      ? "(d) THE ROOM REVENUE — the memorandum's RevPAR does not tie to its ADR and occupancy: find which figure is wrong before reading any of them"
      : r.revparIndex != null
        ? `(d) THE INDEX — a RevPAR index of ${Math.round(r.revparIndex)} against 100: split it into its ADR and occupancy indices before believing a plan to grow either`
        : "(d) THE COMP SET — no RevPAR index stated: ask for the STR report, since RevPAR alone cannot say whether the hotel or its market is the problem",
  );
  return `${hotelContextLine(r)}\n\nHOTEL CONTRACT TRAPS, checked by name against the facts above: ${traps.join("; ")}.`;
}
