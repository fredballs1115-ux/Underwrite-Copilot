// Condominium units bought in bulk (research pass 28, round 8) — a block of
// units inside a condominium someone else's declaration governs. The screen
// read "42 of 120 units" as a building: one owner of a third of the units,
// a year of association dues, a vote and a retail exit were in none of its
// surfaces.
//
// Pure — no I/O, no model call. The extraction files the bulk purchase's
// figures as rows of their own, each only as stated: "Units offered",
// "Units in condominium", "HOA dues" (a unit's, a month's), "Special
// assessment", "Association reserves", "Rental restrictions", "Declarant
// control", "Milestone inspection" and "Structural integrity reserve
// study".
//
// Five rules.
//
// THE UNITS ARE A SHARE OF AN ASSOCIATION. The units offered over the units
// in the condominium is the buyer's share of the votes and of the common
// costs (where the declaration weighs each unit alike); the declaration's
// thresholds are said only as stated.
//
// DUES ARE AN EXPENSE. The bulk owner pays every one of its units' dues to
// the association: a unit's monthly dues times the units offered times
// twelve, only where both are stated, and whether the memorandum's NOI is
// after them is the memorandum's to say.
//
// THE RETAIL EXIT NEEDS LOANS ITS BUYERS CAN GET. Selling the units one by
// one waits on whether the project's ownership lets a buyer's lender lend;
// an agency's single-entity limit is said only from a primary source's
// words on file, as the lender's rule, never a verdict.
//
// THE BUILDING'S RESERVES ARE THE OWNERS'. A special assessment, an
// underfunded reserve or a required structural inspection is a cost a unit
// carries, each as stated.
//
// A BLANK IS NULL.

import type { ExtractionResult } from "@/lib/anthropic/types";
import agencyRules from "@/data/research/agency_rules.json";
import { parseCount, parseMoney, unitCountFromMetrics } from "@/lib/criteria";
import { researchAge, staleMark } from "@/lib/research-age";

/** Fannie Mae's single-entity limit, as the runner printed it
 *  (data/research/agency_rules.json): a single entity owning more than
 *  `max_share_pct` of the units in a project of `min_units` or more makes
 *  the project ineligible, but for the exceptions the section lists. */
interface SingleEntityRule {
  lender: string;
  section: string;
  version: string;
  min_units: number;
  max_share_pct: number;
  /** the share the section's exception for a larger owner reaches, on its
   *  conditions (an owner marketing units for sale, current on its
   *  assessments) */
  exception_max_share_pct: number;
  source: string;
  as_of: string;
}
const SINGLE_ENTITY = (agencyRules.rules as Array<SingleEntityRule & { id: string }>).find((r) => r.id === "fannie-single-entity-ownership") ?? null;

const dayText = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

type Row = { label: string; value: string; page?: string };
const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|none|[-–—])?\.?$/i;

/** A condominium by the deal's own words — never a "condo-quality" finish. */
const CONDO_WORDS = /\bcondominiums?\b|\bcondo\s+units?\b|\bfractured\s+condo(?:minium)?s?\b|\bbulk\s+(?:condo\s+)?units?\b|\bcondos\b/i;

export const UNITS_OFFERED_ROW = /^\s*(?:units?\s+offered|units?\s+(?:for\s+sale|in\s+(?:the\s+)?(?:offering|sale|portfolio))|offered\s+units?)\b/i;
export const UNITS_IN_CONDO_ROW = /^\s*(?:(?:total\s+)?units?\s+in\s+(?:the\s+)?(?:condominium|condo|building|project|association)|condominium\s+units?|total\s+condominium\s+units?)\b/i;
export const HOA_DUES_ROW = /^\s*(?:hoa|association|condo(?:minium)?)\s+(?:dues|fees?|assessments?)\b(?!\s*\((?:special|annual\s+total))/i;
export const SPECIAL_ASSESSMENT_ROW = /^\s*special\s+assessments?\b/i;
export const STATED_ROWS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Association reserves", /^\s*(?:association|hoa|condo(?:minium)?)\s+reserves?\b|^\s*reserve\s+(?:fund|balance)\b/i],
  ["Rental restrictions", /^\s*rental\s+restrictions?\b|^\s*leasing\s+restrictions?\b/i],
  ["Declarant control", /^\s*(?:declarant|developer)\s+control\b/i],
  ["Milestone inspection", /^\s*milestone\s+inspections?\b/i],
  ["Structural integrity reserve study", /^\s*structural\s+integrity\s+reserve\s+stud(?:y|ies)\b|^\s*sirs\b/i],
];

export interface CondoRead {
  unitsOffered: number | null;
  unitsInCondominium: number | null;
  /** the units offered over the units in the condominium, a percent */
  sharePct: number | null;
  /** a unit's monthly dues, as stated */
  monthlyDues: number | null;
  /** the dues row's own words where they state no unit's month or year
   *  (a bare figure, a total): shown as stated, never read */
  duesStated: string | null;
  /** a year of every offered unit's dues, only where both are stated */
  annualDues: number | null;
  specialAssessment: string | null;
  stated: Array<{ label: string; value: string }>;
  /** the agency's single-entity limit where the bulk purchase is over it:
   *  the lender, the limit, the share its exception for a larger owner
   *  reaches, the guide's section and version, the day it was read and
   *  the research's own stale mark */
  agencyLimit: {
    lender: string;
    pct: number;
    exceptionPct: number;
    minUnits: number;
    section: string;
    version: string;
    source: string;
    readOn: string;
    stale: string | null;
  } | null;
  sentences: string[];
  headline: string;
}

// A unit's dues are said to the dollar ($1,250 is never "$1k"); a year of
// the block's in thousands.
const money = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e7) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return a >= 1e4 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n).toLocaleString("en-US")}`;
};
const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;

function wordsOf(ex: ExtractionResult): string {
  return [ex.assetClass, ex.dealName, ex.strategy?.summary, ex.interest?.summary]
    .filter((w): w is string => typeof w === "string" && w.trim() !== "")
    .join(" \n ");
}

/** The most a unit's dues are read at, a month: a figure over it is the
 *  block's total or the association's budget, never one unit's. */
const UNIT_DUES_CEILING = 10_000;

/** A unit's monthly dues from the row's words: "$650 per unit per month",
 *  "$650/mo"; a yearly figure a unit is taken as a twelfth. Null for a
 *  figure that states no period (a bare $650 may be a month's or a year's),
 *  a total, a range or a per-foot rate. */
export function monthlyDuesOf(stated: string): number | null {
  const v = stated.trim();
  if (!v || /\/\s*(?:sf|sq)\b|\bper\s+(?:sf|square)|psf\b/i.test(v)) return null;
  // A range, its first figure with or without a scale ("$600 - $700",
  // "$1.0M - $1.2M"), is no one figure.
  if (/\d\s*(?:k|mm?|m(?:il(?:lion)?)?|thousand|million)?\.?\s*(?:-|–|—|to)\s*\$?\d/i.test(v.replace(/,/g, ""))) return null;
  const n = parseMoney(v);
  if (n == null || !(n > 0)) return null;
  const yearly = /\/\s*(?:yr|year)\b|\bper\s+(?:year|annum)\b|\bannual(?:ly)?\b|\ba\s+year\b/i.test(v);
  const monthly = /\/\s*mo(?:nth)?\b|\bper\s+month\b|\bmonthly\b|\ba\s+month\b/i.test(v);
  const perMonth = yearly ? n / 12 : monthly ? n : null;
  return perMonth != null && perMonth <= UNIT_DUES_CEILING ? perMonth : null;
}

/**
 * The bulk purchase's share of the condominium, its dues and the
 * association's reserves, each only as stated. Null unless the deal's own
 * words name a condominium and the memorandum states one of the figures.
 */
export function readCondo(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): CondoRead | null {
  if (!ex || !CONDO_WORDS.test(wordsOf(ex))) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow).filter((m) => !NOT_STATED.test(m.value.trim()));
  const find = (re: RegExp) => rows.find((m) => re.test(m.label)) ?? null;
  const countOf = (r: Row | null) => {
    const n = r ? parseCount(r.value) : null;
    return n != null && n > 0 ? n : null;
  };
  // The units sold: a row of their own, else the deal's own unit count —
  // on a bulk sale the memorandum's "Units" are the units offered, and the
  // count reader never takes "Units in building" for it.
  const offeredCount = unitCountFromMetrics(rows);
  const unitsOffered = countOf(find(UNITS_OFFERED_ROW)) ?? (offeredCount != null && offeredCount > 0 ? offeredCount : null);
  const unitsInCondominium = countOf(find(UNITS_IN_CONDO_ROW));
  const duesRow = find(HOA_DUES_ROW);
  const monthlyDues = duesRow ? monthlyDuesOf(duesRow.value) : null;
  const duesStated = duesRow && monthlyDues == null ? duesRow.value.trim() : null;
  const special = find(SPECIAL_ASSESSMENT_ROW);
  const stated = STATED_ROWS.flatMap(([label, re]) => {
    const r = find(re);
    return r ? [{ label, value: r.value.trim() }] : [];
  });
  const read: Omit<CondoRead, "sentences" | "headline"> = {
    unitsOffered,
    unitsInCondominium,
    // More units offered than the condominium holds is two rows that cannot
    // both be true: no share is read off them.
    sharePct:
      unitsOffered != null && unitsInCondominium != null && unitsOffered <= unitsInCondominium
        ? Math.round((unitsOffered / unitsInCondominium) * 1000) / 10
        : null,
    monthlyDues,
    duesStated,
    annualDues: monthlyDues != null && unitsOffered != null ? Math.round(monthlyDues * unitsOffered * 12) : null,
    specialAssessment: special?.value.trim() ?? null,
    stated,
    agencyLimit: null,
  };
  if (
    SINGLE_ENTITY &&
    read.sharePct != null &&
    read.unitsInCondominium != null &&
    read.unitsInCondominium >= SINGLE_ENTITY.min_units &&
    read.sharePct > SINGLE_ENTITY.max_share_pct &&
    read.unitsOffered != null &&
    read.unitsOffered < read.unitsInCondominium
  ) {
    read.agencyLimit = {
      lender: SINGLE_ENTITY.lender,
      pct: SINGLE_ENTITY.max_share_pct,
      exceptionPct: SINGLE_ENTITY.exception_max_share_pct,
      minUnits: SINGLE_ENTITY.min_units,
      section: SINGLE_ENTITY.section,
      version: SINGLE_ENTITY.version,
      source: SINGLE_ENTITY.source,
      readOn: SINGLE_ENTITY.as_of,
      stale: staleMark(researchAge(SINGLE_ENTITY.as_of, asOf)),
    };
  }
  const facts =
    read.unitsOffered != null ||
    read.unitsInCondominium != null ||
    read.monthlyDues != null ||
    !!read.duesStated ||
    !!read.specialAssessment ||
    stated.length > 0;
  if (!facts) return null;
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

function sentencesOf(r: Omit<CondoRead, "sentences" | "headline">): string[] {
  const out: string[] = [];
  if (r.unitsOffered != null && r.unitsInCondominium != null && r.sharePct != null) {
    out.push(
      r.unitsOffered === r.unitsInCondominium
        ? `The memorandum offers all ${r.unitsInCondominium} units of the condominium: the buyer holds every vote in its association and pays every unit's share of its costs.`
        : `The memorandum offers ${r.unitsOffered} of the condominium's ${r.unitsInCondominium} units, ${pct1(
            r.sharePct,
          )}: the buyer becomes one owner in an association whose declaration governs the building, with that share of its votes and its common costs where each unit counts alike.`,
    );
  } else if (r.unitsOffered != null) {
    out.push(`The memorandum offers ${r.unitsOffered} condominium units and states no count for the whole condominium, so the buyer's share of the association is not read.`);
  }
  if (r.annualDues != null && r.monthlyDues != null && r.unitsOffered != null) {
    out.push(
      `At ${money(r.monthlyDues)} a unit a month, the dues on ${r.unitsOffered} units are ${money(
        r.annualDues,
      )} a year, owed to the association whoever lives there; whether the stated NOI is after them is the memorandum's to say.`,
    );
  } else if (r.monthlyDues != null) {
    out.push(`The dues are ${money(r.monthlyDues)} a unit a month, as stated.`);
  } else if (r.duesStated) {
    out.push(`Dues, as stated: ${r.duesStated.replace(/\.$/, "")}; the row names no unit's month or year, so no year of the block's dues is read.`);
  }
  if (r.agencyLimit && r.sharePct != null) {
    const a = r.agencyLimit;
    const beyond = r.sharePct > a.exceptionPct;
    out.push(
      `Owning ${pct1(r.sharePct)} of a project of ${r.unitsInCondominium} units, the buyer would be a single entity over the ${a.pct}% that ${a.lender}'s Selling Guide allows in a project of ${a.minUnits} or more units (${a.section.replace(/^Selling Guide /, "")}, its ${dayText(a.version)} version, read ${dayText(a.readOn)}${
        a.stale ? `; ${a.stale}` : ""
      }): such a project is ineligible for ${a.lender}'s loans on its units unless the section's exceptions hold, and the one it lists for a larger owner reaches ${a.exceptionPct}% of the units${
        beyond ? `, short of this purchase's ${pct1(r.sharePct)}` : ""
      }, on conditions that include the owner marketing units for sale to bring its share to ${a.pct}% or less and being current on its assessments.`,
    );
  }
  if (r.specialAssessment) out.push(`A special assessment, as stated (${r.specialAssessment.replace(/\.$/, "")}), is a cost each unit carries.`);
  for (const s of r.stated) out.push(`${s.label}, as stated: ${s.value.replace(/\.$/, "")}.`);
  return out;
}

/** The model's read (`meta.condo`): it sells the units as one building at
 *  one cap, and runs no retail exit. */
export function condoModelLine(r: CondoRead | null, m: { exitCapPct: number } | null): string | null {
  if (!r || r.unitsOffered == null) return null;
  const at = m && m.exitCapPct > 0 ? ` at its ${(m.exitCapPct * 100).toFixed(2)}% exit cap` : "";
  return `The model sells the ${r.unitsOffered} units as one building${at}; a bulk buyer's other exit, the units sold one by one, is priced a unit at a time, which the model does not run.`;
}

/** The pipeline row's tag: "Bulk 42 of 120 (35%)", "Condo units". */
export function condoTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readCondo(ex, asOf);
  if (!r) return null;
  if (r.unitsOffered != null && r.unitsInCondominium != null && r.sharePct != null && r.unitsOffered < r.unitsInCondominium)
    return `Bulk ${r.unitsOffered} of ${r.unitsInCondominium} (${Math.round(r.sharePct)}%)`;
  return "Condo units";
}

/** The read in one line, for the memo, the workbook's cover and the report. */
export function condoShortLine(r: CondoRead): string {
  const parts = [
    r.unitsOffered != null && r.unitsInCondominium != null ? `${r.unitsOffered} of ${r.unitsInCondominium} units` : r.unitsOffered != null ? `${r.unitsOffered} units` : "",
    r.annualDues != null
      ? `dues ${money(r.annualDues)} a year`
      : r.monthlyDues != null
        ? `dues ${money(r.monthlyDues)} a unit a month`
        : r.duesStated
          ? `dues ${r.duesStated} as stated`
          : "",
    r.specialAssessment ? `special assessment ${r.specialAssessment}` : "",
  ].filter(Boolean);
  return `Condominium units: ${parts.join("; ")}`;
}

/** The read as the steps after the extraction see it (lib/deal-context). */
export function condoContextLine(r: CondoRead): string {
  return `Condominium units: ${r.headline}`;
}

const TRAPS =
  "CONDO TRAPS, checked by name where the OM gives the inputs: (a) CONTROL AND THE VOTES — the buyer's share of the association's votes, the declaration's thresholds for amending it, and who controls the board; (b) DUES, ASSESSMENTS AND RESERVES — the budget, the reserve study and any special assessment, and a state's structural-reserve law where it has one; (c) RENTAL RESTRICTIONS — whether the declaration limits leasing, and how many units may be let; (d) THE RETAIL EXIT — whether the project's ownership lets a buyer's lender lend on a unit, and what a single owner's share does to that; (e) THE DEVELOPER'S LIABILITIES — what a bulk buyer inherits from the declarant, as the state's law and the deed say; (f) TERMINATION — the declaration's and the state's thresholds, as a question.";

/** The facts, then the traps by name, for the assumption review. */
export function condoNote(r: CondoRead): string {
  return `CONDOMINIUM UNITS AS STATED: ${r.headline} ${TRAPS}`;
}

/** The rows a key-terms block leads with, each only where stated. */
export function condoTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter((m) => isRow(m) && !NOT_STATED.test(m.value.trim()));
  const pick = (re: RegExp) => rows.find((m) => re.test(m.label));
  return [pick(UNITS_OFFERED_ROW), pick(UNITS_IN_CONDO_ROW), pick(HOA_DUES_ROW), pick(SPECIAL_ASSESSMENT_ROW)].filter((m): m is M => m != null);
}
