// Which deals are condominium units bought in bulk, and how many units the
// price buys — lib/condo's own gate and count, kept here apart from its read
// of the agencies' rules (data/research/agency_rules.json), so a client
// component can ask it without loading that table (lib/client-bundle-
// tables.test.ts). lib/condo reads its units through this, so the two can
// never disagree.
//
// Pure: the extraction comes in.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { parseCount, unitCountFromMetrics } from "@/lib/criteria";

type Row = { label: string; value: string; page?: string };
export const isCondoRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";
export const CONDO_NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|none|[-–—])?\.?$/i;

/** A condominium by the deal's own words — never a "condo-quality" finish,
 *  apartments "built to condominium specifications" or "condominium-grade",
 *  or a plan to sell them "as a condominium conversion" (the audit of
 *  2026-10-05: each read an apartment building as condominium units). */
export const CONDO_WORDS =
  /\bcondominiums?\b(?![\s-]+(?:grade|quality|style|caliber|level|finish(?:es|ed)?|specs?|specifications?|standards?|conversions?)\b)|\bcondo\s+units?\b|\bfractured\s+condo(?:minium)?s?\b|\bbulk\s+(?:condo\s+)?units?\b|\bcondos\b/i;

export const UNITS_OFFERED_ROW = /^\s*(?:units?\s+offered|units?\s+(?:for\s+sale|in\s+(?:the\s+)?(?:offering|sale|portfolio))|offered\s+units?)\b/i;
export const UNITS_IN_CONDO_ROW = /^\s*(?:(?:total\s+)?units?\s+in\s+(?:the\s+)?(?:condominium|condo|building|project|association)|condominium\s+units?|total\s+condominium\s+units?)\b/i;
export const HOA_DUES_ROW = /^\s*(?:hoa|association|condo(?:minium)?)\s+(?:dues|fees?|assessments?)\b(?!\s*\((?:special|annual\s+total))/i;
export const SPECIAL_ASSESSMENT_ROW = /^\s*special\s+assessments?\b/i;

/** The deal's words beside its class: its name, its plan and its interest. */
function otherWordsOf(ex: ExtractionResult): string {
  return [ex.dealName, ex.strategy?.summary, ex.interest?.summary]
    .filter((w): w is string => typeof w === "string" && w.trim() !== "")
    .join(" \n ");
}

/** The memorandum's stated rows, and whether the deal is condominium units:
 *  the class names a condominium, or the deal's other words name one AND
 *  the memorandum states a condominium's own row (the units offered or in
 *  the condominium, the dues, a special assessment). Null where it is not. */
export function condoRows(ex: ExtractionResult | null | undefined): { rows: Row[]; find: (re: RegExp) => Row | null; classIsCondo: boolean } | null {
  if (!ex) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isCondoRow).filter((m) => !CONDO_NOT_STATED.test(m.value.trim()));
  const find = (re: RegExp) => rows.find((m) => re.test(m.label)) ?? null;
  const classIsCondo = CONDO_WORDS.test(typeof ex.assetClass === "string" ? ex.assetClass : "");
  const condoRow = [UNITS_OFFERED_ROW, UNITS_IN_CONDO_ROW, HOA_DUES_ROW, SPECIAL_ASSESSMENT_ROW].some((re) => find(re) != null);
  if (!classIsCondo && !(condoRow && CONDO_WORDS.test(otherWordsOf(ex)))) return null;
  return { rows, find, classIsCondo };
}

/** A stated count, positive, or null. */
export const condoCountOf = (r: Row | null): number | null => {
  const n = r ? parseCount(r.value) : null;
  return n != null && n > 0 ? n : null;
};

/**
 * The units in the whole condominium, as stated — the building a rent rule
 * counts (lib/rent-regulation `rulesSizeText`, research pass 41), never the
 * units offered. Null where the memorandum states no such count, or the
 * deal is not condominium units.
 */
export function condoUnitsInCondominium(ex: ExtractionResult | null | undefined): number | null {
  const c = condoRows(ex);
  return c ? condoCountOf(c.find(UNITS_IN_CONDO_ROW)) : null;
}

/**
 * The units a bulk condominium purchase buys: a row of their own, else —
 * where the class itself is a condominium — the deal's own unit count (on a
 * bulk sale the memorandum's "Units" are the units offered, and the count
 * reader never takes "Units in building" for it). Never the building's
 * count on the words alone. Null on anything but condominium units. Every
 * price a unit of such a purchase — the pipeline card's basis, the comps'
 * subject tick, the workbook's yardsticks — divides by this, never by the
 * condominium's whole count (research pass 38).
 */
export function condoUnitsOffered(ex: ExtractionResult | null | undefined): number | null {
  const c = condoRows(ex);
  if (!c) return null;
  const offeredCount = c.classIsCondo ? unitCountFromMetrics(c.rows) : null;
  return condoCountOf(c.find(UNITS_OFFERED_ROW)) ?? (offeredCount != null && offeredCount > 0 ? offeredCount : null);
}
