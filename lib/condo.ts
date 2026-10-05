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
// thresholds are said only as stated. Where the price buys no units — a
// note they secure, a position, a share — the share is its holder's (lib/
// interest `propertyHolderOf`), and a note's says what a lender that takes
// the units would step into.
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

import { compactUsd } from "@/lib/money";
import type { ExtractionResult } from "@/lib/anthropic/types";
import agencyRules from "@/data/research/agency_rules.json";
import { parseCount, parseMoney } from "@/lib/criteria";
import { PROPERTY_HOLDER_WORDS, propertyHolderOf, type PropertyHolder } from "@/lib/interest";
import { researchAge, staleMark } from "@/lib/research-age";
import {
  CONDO_NOT_STATED,
  HOA_DUES_ROW,
  SPECIAL_ASSESSMENT_ROW,
  UNITS_IN_CONDO_ROW,
  UNITS_OFFERED_ROW,
  condoCountOf,
  condoRows,
  condoUnitsOffered,
  isCondoRow,
} from "@/lib/condo-units";

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

// The gate and the units offered are lib/condo-units' (no agency table), so
// a client component asks the same question without loading it.
const isRow = isCondoRow;
const NOT_STATED = CONDO_NOT_STATED;
export { HOA_DUES_ROW, SPECIAL_ASSESSMENT_ROW, UNITS_IN_CONDO_ROW, UNITS_OFFERED_ROW };
export const STATED_ROWS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Association reserves", /^\s*(?:association|hoa|condo(?:minium)?)\s+reserves?\b|^\s*reserve\s+(?:fund|balance)\b/i],
  ["Rental restrictions", /^\s*rental\s+restrictions?\b|^\s*leasing\s+restrictions?\b/i],
  ["Declarant control", /^\s*(?:declarant|developer)\s+control\b/i],
  ["Milestone inspection", /^\s*milestone\s+inspections?\b/i],
  ["Structural integrity reserve study", /^\s*structural\s+integrity\s+reserve\s+stud(?:y|ies)\b|^\s*sirs\b/i],
];

export interface CondoRead {
  /** who owns the units on this deal, by what the price buys (lib/interest
   *  `propertyHolderOf`): the buyer on a bulk purchase, the borrower on a
   *  note they secure, the owning entity on a position or a share */
  holder: PropertyHolder;
  unitsOffered: number | null;
  unitsInCondominium: number | null;
  /** the units offered over the units in the condominium, a percent */
  sharePct: number | null;
  /** a unit's monthly dues, as stated */
  monthlyDues: number | null;
  /** the dues row's own words where no unit's month could be read from them
   *  (a bare figure, the block's total, a month and a year that disagree):
   *  shown as stated, never read */
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
const money = (n: number): string => compactUsd(n, { millions: "auto", thousandsFrom: 1e4 });
const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;

/** The most a unit's dues are read at, a month: a figure over it is the
 *  block's total or the association's budget, never one unit's. */
const UNIT_DUES_CEILING = 10_000;

/** A dues figure: a dollar figure, or one written without "$" that a period
 *  or a unit's word follows at once ("650/mo", "7,800 per year") — never the
 *  count in "for the 42 units". */
const DUES_FIGURE =
  /\$\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:mm|million|m|k)\b)?|(?<!\$\s*)(?<![\w.,])\d[\d,]*(?:\.\d+)?(?=\s*(?:\/\s*(?:mo(?:nth)?|yr|year|unit)\b|per\s+(?:month|year|annum|unit)\b|a\s+(?:month|year|unit)\b|(?:monthly|annually|yearly)\b))/gi;
const DUES_YEAR = /\/\s*(?:yr|year)\b|\bper\s+(?:year|annum)\b|\bannual(?:ly)?\b|\byearly\b|\ba\s+year\b/i;
const DUES_MONTH = /\/\s*mo(?:nth)?\b|\bper\s+month\b|\bmonthly\b|\ba\s+month\b/i;
/** Words that make a figure one unit's. */
const DUES_UNIT = /\bper\s+(?:unit|door|apartment)\b|\/\s*(?:unit|door|apt)\b|\b(?:a|each)\s+unit\b/i;
/** Words that make a figure the block's or the association's: "for all 5
 *  units", "for the 42 units", "total", "in the aggregate". A clause that
 *  also says "per unit" is the unit's ("$650 per unit for all 42 units"). */
const DUES_BLOCK = /\bfor\s+(?:all\s+(?:the\s+)?|the\s+)?(?:\d[\d,]*\s+)?(?:offered\s+|bulk\s+)?units\b|\btotal\b|\bin\s+(?:the\s+)?aggregate\b|\bcombined\b/i;
/** A count the row names beside the block's figure ("for the 42 units"). */
const DUES_COUNT = /(?<![\w$.,])(\d[\d,]*)\s+(?:offered\s+|bulk\s+)?units\b/i;
/** Where one figure's words end and the next's begin. */
const DUES_BREAK = /[;()]|,\s+|\s+(?:or|and|totaling|totalling)\s+|\s+[-–—]\s+/i;

interface DuesClause {
  n: number;
  month: boolean;
  year: boolean;
  unit: boolean;
  block: boolean;
}

/** The row's figures, each with the words of its own clause — the words
 *  between it and the next figure's clause, a clause with no figure joining
 *  the one before it. Null where one clause holds two figures. */
function duesClauses(v: string): DuesClause[] | null {
  const clauses: Array<{ n: number; text: string }> = [];
  let lead = "";
  for (const part of v.split(DUES_BREAK)) {
    const figures = [...part.matchAll(DUES_FIGURE)].map((m) => parseMoney(m[0])).filter((x): x is number => x != null && x > 0);
    if (figures.length > 1) return null;
    if (figures.length === 0) {
      if (clauses.length > 0) clauses[clauses.length - 1].text += ` ${part}`;
      else lead += ` ${part}`;
      continue;
    }
    clauses.push({ n: figures[0], text: `${lead} ${part}` });
    lead = "";
  }
  return clauses.map(({ n, text }) => {
    const unit = DUES_UNIT.test(text);
    return { n, month: DUES_MONTH.test(text), year: DUES_YEAR.test(text), unit, block: !unit && DUES_BLOCK.test(text) };
  });
}

/** A unit's monthly dues from the row's words: "$650 per unit per month",
 *  "$650/mo"; a yearly figure a unit is taken as a twelfth. Null for a
 *  figure that states no period (a bare $650 may be a month's or a year's),
 *  the block's or the association's figure ("$3,250 per month for all 5
 *  units"), a range or a per-foot rate. A row that states two figures is
 *  read at the unit's month only where the other agrees with it: the unit's
 *  year, or the block's month or year over the units the row names or
 *  `units`, the units offered ("$650 per unit per month; $327,600 a year
 *  for the 42 units"). */
export function monthlyDuesOf(stated: string, units: number | null = null): number | null {
  const v = stated.trim();
  if (!v || /\/\s*(?:sf|sq)\b|\bper\s+(?:sf|square)|psf\b/i.test(v)) return null;
  // A range, its first figure with or without a scale ("$600 - $700",
  // "$1.0M - $1.2M"), is no one figure.
  if (/\d\s*(?:k|mm?|m(?:il(?:lion)?)?|thousand|million)?\.?\s*(?:-|–|—|to)\s*\$?\d/i.test(v.replace(/,/g, ""))) return null;
  const clauses = duesClauses(v);
  if (!clauses || clauses.length === 0 || clauses.length > 2) return null;
  const unitsMonth = (n: number) => n > 0 && n <= UNIT_DUES_CEILING;
  if (clauses.length === 1) {
    const [c] = clauses;
    if (c.block || (c.month && c.year)) return null;
    const perMonth = c.year ? c.n / 12 : c.month ? c.n : null;
    return perMonth != null && unitsMonth(perMonth) ? perMonth : null;
  }
  // Two figures ("$650/mo ($7,800/yr)"): the unit's month, only where the
  // other figure agrees with it — else none, and the row is shown as
  // stated. The year's word had won and divided the month's figure by
  // twelve (the audit of 2026-10-05: $54.17 a unit, a twelfth of the
  // truth), and a block's year beside a unit's month was read as neither.
  const named = v.match(DUES_COUNT);
  const counts = [named ? parseCount(named[1]) : null, units].filter((c): c is number => c != null && c > 0);
  const near = (a: number, b: number) => Math.abs(a - b) <= b * 0.01;
  const agrees = (month: number, other: DuesClause): boolean => {
    if (other.month && other.year) return false;
    if (other.year && !other.block && near(other.n, month * 12)) return true;
    if (other.unit) return false;
    return counts.some((u) => (other.year && near(other.n, month * u * 12)) || (other.month && near(other.n, month * u)));
  };
  for (const [a, b] of [
    [clauses[0], clauses[1]],
    [clauses[1], clauses[0]],
  ]) {
    if (a.block || (a.month && a.year)) continue;
    // A figure with no period of its own is a month where the other's
    // figure makes it one ("$650 per unit ($327,600 a year for the 42
    // units)").
    const month = a.year ? a.n / 12 : a.n;
    if (unitsMonth(month) && agrees(month, b)) return month;
  }
  return null;
}

/**
 * The bulk purchase's share of the condominium, its dues and the
 * association's reserves, each only as stated. Null unless the class names
 * a condominium, or the deal's other words name one AND the memorandum
 * states a condominium's own row (the units offered or in the condominium,
 * the dues, a special assessment) — and it states one of the figures.
 */
export function readCondo(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): CondoRead | null {
  // Condominium units by lib/condo-units' gate, which the price-a-unit
  // readers share.
  const c = condoRows(ex);
  if (!c) return null;
  const { find } = c;
  const countOf = condoCountOf;
  // The units sold: a row of their own, else — where the class itself is a
  // condominium — the deal's own unit count (lib/condo-units
  // `condoUnitsOffered`, the one count every price a unit divides by).
  const unitsOffered = condoUnitsOffered(ex);
  const unitsInCondominium = countOf(find(UNITS_IN_CONDO_ROW));
  const duesRow = find(HOA_DUES_ROW);
  const monthlyDues = duesRow ? monthlyDuesOf(duesRow.value, unitsOffered) : null;
  const duesStated = duesRow && monthlyDues == null ? duesRow.value.trim() : null;
  const special = find(SPECIAL_ASSESSMENT_ROW);
  const stated = STATED_ROWS.flatMap(([label, re]) => {
    const r = find(re);
    return r ? [{ label, value: r.value.trim() }] : [];
  });
  const read: Omit<CondoRead, "sentences" | "headline"> = {
    holder: propertyHolderOf(ex),
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
  // A count of the whole condominium alone says nothing a sentence can.
  if (sentences.length === 0) return null;
  return { ...read, sentences, headline: sentences.join(" ") };
}

function sentencesOf(r: Omit<CondoRead, "sentences" | "headline">): string[] {
  const out: string[] = [];
  // Whose the units are (lib/interest `propertyHolderOf`): the buyer's on a
  // bulk purchase; on a note, the borrower's, and the collateral a lender
  // would take; on a position or a share, the owning entity's, which the
  // price does not buy.
  const h = r.holder;
  const w = PROPERTY_HOLDER_WORDS[h];
  const who = `${w.who[0].toUpperCase()}${w.who.slice(1)}`;
  const hold = w.plural ? "hold" : "holds";
  if (r.unitsOffered != null && r.unitsInCondominium != null && r.sharePct != null) {
    const all = r.unitsOffered === r.unitsInCondominium;
    const of = `${r.unitsOffered} of the condominium's ${r.unitsInCondominium} units, ${pct1(r.sharePct)}`;
    const oneOwner = "one owner in an association whose declaration governs the building, with that share of its votes and its common costs where each unit counts alike";
    out.push(
      h === "buyer"
        ? all
          ? `The memorandum offers all ${r.unitsInCondominium} units of the condominium: the buyer holds every vote in its association and pays every unit's share of its costs.`
          : `The memorandum offers ${of}: the buyer becomes ${oneOwner}.`
        : h === "borrower"
          ? all
            ? `The note is secured by all ${r.unitsInCondominium} units of the condominium: the borrower holds every vote in its association and pays every unit's share of its costs, and a lender that takes the units in a foreclosure would step into both.`
            : `The note is secured by ${of}: the borrower is ${oneOwner}, and a lender that takes the units in a foreclosure would step into that share.`
          : all
            ? `${who} ${hold} all ${r.unitsInCondominium} units of the condominium: every vote in its association and every unit's share of its costs.`
            : `${who} ${hold} ${of}: ${w.plural ? "together they are" : "it is"} ${oneOwner}.`,
    );
  } else if (r.unitsOffered != null) {
    const noCount = `the memorandum states no count for the whole condominium, so ${w.whose} share of the association is not read.`;
    out.push(
      h === "buyer"
        ? `The memorandum offers ${r.unitsOffered} condominium units and states no count for the whole condominium, so the buyer's share of the association is not read.`
        : h === "borrower"
          ? `The note is secured by ${r.unitsOffered} condominium units, and ${noCount}`
          : `${who} ${hold} ${r.unitsOffered} condominium units, and ${noCount}`,
    );
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
    // Said as what the reader could not do, never as what the row lacks: a
    // row may name a month and a year that do not agree, or the block's
    // figure alone (the audit of 2026-10-05).
    out.push(`Dues, as stated: ${r.duesStated.replace(/\.$/, "")}; a unit's month could not be read from it, so no year of the block's dues is read.`);
  }
  if (r.agencyLimit && r.sharePct != null) {
    const a = r.agencyLimit;
    const beyond = r.sharePct > a.exceptionPct;
    const owner = h === "buyer" ? "the buyer would be" : `${w.who}${w.plural ? ", together, are" : " is"}`;
    const theirs = h === "buyer" ? "this purchase's" : h === "borrower" ? "the borrower's" : w.plural ? "their" : "its";
    // On a note the lender's rule narrows what the collateral sells for,
    // a unit at a time.
    const exit = h === "borrower" ? ", which narrows the collateral's retail exit, the units sold one by one," : ",";
    out.push(
      `Owning ${pct1(r.sharePct)} of a project of ${r.unitsInCondominium} units, ${owner} a single entity over the ${a.pct}% that ${a.lender}'s Selling Guide allows in a project of ${a.minUnits} or more units (${a.section.replace(/^Selling Guide /, "")}, its ${dayText(a.version)} version, read ${dayText(a.readOn)}${
        a.stale ? `; ${a.stale}` : ""
      }): such a project is ineligible for ${a.lender}'s loans on its units unless the section's exceptions hold${exit} and the one it lists for a larger owner reaches ${a.exceptionPct}% of the units${
        beyond ? `, short of ${theirs} ${pct1(r.sharePct)}` : ""
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
  // A read of the declaration's terms alone says its first one, never an
  // empty line (the audit of 2026-10-05: "Condominium units: ").
  const first = r.stated[0];
  if (parts.length === 0 && first) parts.push(`${first.label.toLowerCase()} as stated (${first.value.replace(/\.$/, "")})`);
  return `Condominium units: ${parts.join("; ")}`;
}

/** The read as the steps after the extraction see it (lib/deal-context). */
export function condoContextLine(r: CondoRead): string {
  return `Condominium units: ${r.headline}`;
}

/** The traps by name — the votes read as their holder's (`CondoRead.holder`):
 *  the buyer's on a bulk purchase, the borrower's on a note. */
const traps = (whose: string) =>
  `CONDO TRAPS, checked by name where the OM gives the inputs: (a) CONTROL AND THE VOTES — ${whose} share of the association's votes, the declaration's thresholds for amending it, and who controls the board; (b) DUES, ASSESSMENTS AND RESERVES — the budget, the reserve study and any special assessment, and a state's structural-reserve law where it has one; (c) RENTAL RESTRICTIONS — whether the declaration limits leasing, and how many units may be let; (d) THE RETAIL EXIT — whether the project's ownership lets a buyer's lender lend on a unit, and what a single owner's share does to that; (e) THE DEVELOPER'S LIABILITIES — what a bulk buyer inherits from the declarant, as the state's law and the deed say; (f) TERMINATION — the declaration's and the state's thresholds, as a question.`;

/** The facts, then the traps by name, for the assumption review. */
export function condoNote(r: CondoRead): string {
  return `CONDOMINIUM UNITS AS STATED: ${r.headline} ${traps(PROPERTY_HOLDER_WORDS[r.holder].whose)}`;
}

/** The rows a key-terms block leads with, each only where stated. */
export function condoTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter((m) => isRow(m) && !NOT_STATED.test(m.value.trim()));
  const pick = (re: RegExp) => rows.find((m) => re.test(m.label));
  return [pick(UNITS_OFFERED_ROW), pick(UNITS_IN_CONDO_ROW), pick(HOA_DUES_ROW), pick(SPECIAL_ASSESSMENT_ROW)].filter((m): m is M => m != null);
}
