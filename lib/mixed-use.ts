// Mixed-use income (research pass 28, round 7) — apartments over shops, or
// offices, sold as one building. The class has read right since pass 23
// ("Retail/Residential" is mixed-use), but the two incomes inside it were
// read by nothing: on pass 28's example $610k of the $2.13M the memorandum
// states is commercial, 28.6%, and no surface said so, while one exit cap
// and one growth rate capitalise and grow both.
//
// Pure — no I/O, no model call. The extraction files the two halves as rows
// of their own, each only as stated and never split by the extraction:
// "Residential income", "Commercial income" (a year's, in place),
// "Commercial SF" and "Commercial occupancy".
//
// Five rules.
//
// TWO INCOMES, TWO RISKS. The commercial space re-lets on commercial terms
// — longer vacancies, leasing capital, a credit per tenant — where the
// apartments turn over every year. Its share of the income is said only
// where both halves are stated, and of the area only where the commercial
// area and the building's are; a share is never read off one half.
//
// ONE CAP CAPITALISES BOTH. The screening model grows and capitalises the
// whole income at one rate and one cap (`mixedUseModelLine`); the two trade
// to different buyers at different caps, and a blended cap flatters the
// commercial. Separate caps are a change to the model, the owner's.
//
// THE SHOPS' LEASES ROLL. Where the tenant list is read (lib/tenant-roster),
// its roll is named here — the commercial income's own clock.
//
// A LENDER'S LIMIT IS A FINANCING FACT. The agencies cap how much of a
// building's income or area may be commercial before they underwrite it
// differently; no limit is said here until a primary source's words are on
// file, and when one is, it is said as the lender's sizing rule, never as a
// verdict on the building.
//
// A BLANK IS NULL. An income stated per foot, per unit or as a range is no
// year's income; a pro forma, budget or stabilized figure is not today's.

import { compactUsd } from "@/lib/money";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { assetClassKey } from "@/lib/asset-words";
import { buildingSfFromMetrics, parseMoney, parsePct, parseSf } from "@/lib/criteria";
import { parsePageNumber } from "@/lib/facts";
import { rosterTag } from "@/lib/tenant-roster";

type Row = { label: string; value: string; page?: string };
const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|none|[-–—])?\.?$/i;
/** A figure that is not today's: a projection, a budget, a stabilized year. */
const NOT_TODAY = /pro\s?forma|projected|budget|stabili[sz]ed|underwritten|year\s*[2-9]|\byr\.?\s*[2-9]/i;

export const RESIDENTIAL_INCOME_ROW = /^\s*(?:residential|apartment|multifamily)\s+(?:income|revenue|rents?)\b/i;
export const COMMERCIAL_INCOME_ROW = /^\s*(?:commercial|retail|office|ground[- ]floor(?:\s+(?:retail|commercial))?)\s+(?:income|revenue|rents?)\b/i;
export const COMMERCIAL_SF_ROW =
  /^\s*(?:commercial|retail|office|ground[- ]floor(?:\s+(?:retail|commercial))?)\s+(?:sf|s\.f\.?|sq\.?\s?ft\.?|square\s+(?:feet|footage)|area|space|gla|nra)\b/i;
export const COMMERCIAL_OCCUPANCY_ROW = /^\s*(?:commercial|retail|office|ground[- ]floor)\s+(?:occupancy|occupied|leased)\b/i;

/** A rent per unit by another name: an average, a mean or a typical rent
 *  is one unit's, never the building's year (the audit of 2026-10-05:
 *  "Residential rent: $1,850/mo average" read as $22k of residential
 *  income, and the commercial as 96.5% of the building's). */
const PER_UNIT_WORDS = /\baverage\b|\bavg\b|\bmean\b|\btypical\b/i;

/** A year's income as a row states it: dollars, a monthly figure taken
 *  twelve times; null for a rate (per foot, per unit, an average), a range
 *  or a share. */
export function annualIncomeOf(stated: string): number | null {
  const v = stated.trim();
  if (!v || NOT_STATED.test(v)) return null;
  if (/\/\s*(?:sf|sq|unit|door|key)\b|\bper\s+(?:sf|sq|square|unit|door|key)\b|psf\b/i.test(v) || PER_UNIT_WORDS.test(v)) return null;
  if (/%/.test(v)) return null;
  // A range, its first figure with or without a scale ("$600 - $700",
  // "$1.0M - $1.2M"), is no one figure.
  if (/\d\s*(?:k|mm?|m(?:il(?:lion)?)?|thousand|million)?\.?\s*(?:-|–|—|to)\s*\$?\d/i.test(v.replace(/,/g, ""))) return null;
  const n = parseMoney(v);
  if (n == null || !(n > 0)) return null;
  const monthly = /\/\s*mo(?:nth)?\b|\bper\s+month\b|\bmonthly\b|\ba\s+month\b/i.test(v);
  return monthly ? n * 12 : n;
}

export interface MixedUseRead {
  residentialIncome: number | null;
  /** the commercial income: one row's, or the sum of one row a kind
   *  (retail, office) where the memorandum states each apart */
  commercialIncome: number | null;
  /** the rows summed into the commercial income, where more than one */
  commercialRows: string[];
  /** commercial rows whose sum the reader cannot know — a commercial total
   *  beside a kind's own row, or one kind twice at two figures — named, and
   *  no commercial income read off them */
  commercialUnread: string[];
  /** the commercial share of the two stated incomes, a percent */
  commercialIncomeSharePct: number | null;
  commercialSf: number | null;
  buildingSf: number | null;
  /** the commercial share of the building's area, a percent */
  commercialAreaSharePct: number | null;
  commercialOccupancyPct: number | null;
  /** the tenant list's roll, where read (lib/tenant-roster `rosterTag`) */
  roll: string | null;
  /** the page the income rows cite, kept only where it is one of the
   *  memorandum's own (lib/facts' rule) */
  page: string;
  sentences: string[];
  headline: string;
}

const money = (n: number): string => compactUsd(n, { millions: "auto" });
const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const sfText = (n: number) => `${Math.round(n).toLocaleString("en-US")} SF`;

/** A commercial income row's kind: a retail row, an office row, or a
 *  commercial total. */
function commercialKind(label: string): "retail" | "office" | "commercial" {
  if (/^\s*(?:ground[- ]floor\s+)?retail\b/i.test(label)) return "retail";
  if (/^\s*office\b/i.test(label)) return "office";
  return "commercial";
}

/** Whether the deal is mixed-use: the class, or both halves of the income
 *  stated. */
function isMixedUse(ex: ExtractionResult, rows: Row[]): boolean {
  if (assetClassKey(ex.assetClass ?? "") === "mixed_use") return true;
  const today = (re: RegExp) =>
    rows.some((m) => re.test(m.label) && !NOT_TODAY.test(m.label) && !PER_UNIT_WORDS.test(m.label) && annualIncomeOf(m.value) != null);
  return today(RESIDENTIAL_INCOME_ROW) && today(COMMERCIAL_INCOME_ROW);
}

/**
 * A mixed-use building's two incomes and the commercial space, each only as
 * stated. Null on any other building, or where the memorandum states none
 * of the commercial figures.
 */
export function readMixedUse(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): MixedUseRead | null {
  if (!ex) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow).filter((m) => !NOT_STATED.test(m.value.trim()));
  if (!isMixedUse(ex, rows)) return null;
  const find = (re: RegExp) => rows.find((m) => re.test(m.label) && !NOT_TODAY.test(m.label) && !PER_UNIT_WORDS.test(m.label)) ?? null;

  const residentialRow = find(RESIDENTIAL_INCOME_ROW);
  const residentialIncome = residentialRow ? annualIncomeOf(residentialRow.value) : null;
  // Every commercial row, not the first: an office income and a retail
  // income stated apart are one commercial income, added (the audit of
  // 2026-10-05: the retail row was dropped, so $300k of retail beside $400k
  // of office read as 16.7% of the income where it is 31.8%). A commercial
  // total beside a kind's own row, or one kind twice at two figures, is a
  // sum the reader cannot know: named, never added.
  const commercial = rows.flatMap((m) => {
    if (!COMMERCIAL_INCOME_ROW.test(m.label) || NOT_TODAY.test(m.label) || PER_UNIT_WORDS.test(m.label)) return [];
    const value = annualIncomeOf(m.value);
    return value == null ? [] : [{ row: m as Row, kind: commercialKind(m.label), value }];
  });
  const kinds = new Map<string, number[]>();
  for (const c of commercial) kinds.set(c.kind, [...(kinds.get(c.kind) ?? []), c.value]);
  const unknowable =
    (kinds.has("commercial") && kinds.size > 1) || [...kinds.values()].some((vs) => new Set(vs).size > 1);
  const commercialIncome = commercial.length === 0 || unknowable ? null : [...kinds.values()].reduce((sum, vs) => sum + vs[0], 0);
  const commercialRow = commercial[0]?.row ?? null;
  const commercialRows = !unknowable && kinds.size > 1 ? [...new Set(commercial.map((c) => c.row.label))] : [];
  const commercialUnread = unknowable ? [...new Set(commercial.map((c) => c.row.label))] : [];
  const sfRow = find(COMMERCIAL_SF_ROW);
  const commercialSf = sfRow ? parseSf(sfRow.value) : null;
  const buildingSf = buildingSfFromMetrics(rows);
  const occRow = find(COMMERCIAL_OCCUPANCY_ROW);
  const occ = occRow ? parsePct(occRow.value) : null;

  const share = (part: number | null, other: number | null) =>
    part != null && other != null && part + other > 0 ? Math.round((part / (part + other)) * 1000) / 10 : null;
  const read: Omit<MixedUseRead, "sentences" | "headline"> = {
    residentialIncome,
    commercialIncome,
    commercialRows,
    commercialUnread,
    commercialIncomeSharePct: share(commercialIncome, residentialIncome),
    commercialSf,
    buildingSf,
    // A commercial area over the building's is two rows that cannot both
    // be true of one building: no share is read off them.
    commercialAreaSharePct:
      commercialSf != null && buildingSf != null && commercialSf < buildingSf ? Math.round((commercialSf / buildingSf) * 1000) / 10 : null,
    commercialOccupancyPct: occ != null && occ >= 0 && occ <= 100 ? occ : null,
    roll: rosterTag(ex, asOf),
    page: "",
  };
  const facts = read.commercialIncome != null || read.commercialUnread.length > 0 || read.commercialSf != null || read.commercialOccupancyPct != null;
  if (!facts) return null;
  const pages = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const pageRow = commercialRow ?? residentialRow ?? sfRow;
  const n = parsePageNumber(pageRow?.page);
  read.page = n != null && pages != null && n <= pages ? (pageRow?.page ?? "").trim() : "";
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

function sentencesOf(r: Omit<MixedUseRead, "sentences" | "headline">): string[] {
  const out: string[] = [];
  // "(retail income and office income, added)" where the commercial income
  // is the sum of rows the memorandum states apart.
  const added = r.commercialRows.length > 1 ? ` (${r.commercialRows.map((l) => l.toLowerCase()).join(" and ")}, added)` : "";
  if (r.commercialIncome != null && r.residentialIncome != null && r.commercialIncomeSharePct != null) {
    out.push(
      `The memorandum states ${money(r.residentialIncome)} of residential income and ${money(r.commercialIncome)} of commercial${added}: ${pct1(
        r.commercialIncomeSharePct,
      )} of the income is the commercial space's, which re-lets on commercial terms (longer vacancies, leasing capital, a credit per tenant) where the apartments turn over every year.`,
    );
  } else if (r.commercialIncome != null) {
    out.push(`The memorandum states ${money(r.commercialIncome)} of commercial income${added} and no residential figure beside it, so no share of the income is read.`);
  } else if (r.commercialUnread.length > 0) {
    out.push(
      `The memorandum states commercial income in more than one row (${r.commercialUnread.join(", ")}), and whether one includes another is its to say: no commercial total or share is read.`,
    );
  }
  if (r.commercialSf != null && r.buildingSf != null && r.commercialAreaSharePct != null) {
    const both = r.commercialIncomeSharePct != null;
    out.push(
      `The commercial space is ${sfText(r.commercialSf)} of the building's ${sfText(r.buildingSf)}, ${pct1(r.commercialAreaSharePct)} of its area${
        both && Math.abs(r.commercialIncomeSharePct! - r.commercialAreaSharePct) >= 1
          ? ` against ${pct1(r.commercialIncomeSharePct!)} of its income`
          : ""
      }.`,
    );
  } else if (r.commercialSf != null) {
    out.push(`The commercial space is ${sfText(r.commercialSf)}, as stated.`);
  }
  if (r.commercialOccupancyPct != null) out.push(`It is ${pct1(r.commercialOccupancyPct)} occupied, as stated.`);
  if (r.roll) out.push(`The commercial leases, as the tenant list reads them: ${r.roll}.`);
  return out;
}

/**
 * What the screening model does with the two incomes: it grows the whole
 * income at one rate and capitalises it at one exit cap. Null where no
 * commercial income is stated.
 */
export function mixedUseModelLine(r: MixedUseRead | null, m: { exitCapPct: number; rentGrowthPct: number } | null): string | null {
  if (!r || r.commercialIncome == null) return null;
  const cap = m && m.exitCapPct > 0 ? `${(m.exitCapPct * 100).toFixed(2)}% ` : "";
  const rate = m && Number.isFinite(m.rentGrowthPct) ? `${(m.rentGrowthPct * 100).toFixed(1)}%` : null;
  // "As the residential" only where the memorandum states a residential
  // income (the audit of 2026-10-05: an office and retail building with no
  // apartments was told its commercial income ran "as the residential").
  if (r.residentialIncome == null) {
    return `The model capitalises the ${money(r.commercialIncome)} of commercial income at its ${cap}exit cap${
      rate ? ` and grows it at ${rate} a year` : ""
    }: one cap and one growth rate for all of the building's income, where commercial space trades to its own buyers at its own cap.`;
  }
  const at = ` at the same ${cap}exit cap`;
  const growth = rate ? ` and grows it at the same ${rate} a year` : "";
  return `The model capitalises the ${money(r.commercialIncome)} of commercial income${at} as the residential${growth}: one cap and one growth rate for two incomes that trade to different buyers at different caps${
    r.commercialIncomeSharePct != null ? `, the commercial ${pct1(r.commercialIncomeSharePct)} of it` : ""
  }.`;
}

/** The pipeline row's tag: "Commercial 29% of income", else "Commercial
 *  15% of area". Null where neither share is read. */
export function mixedUseTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readMixedUse(ex, asOf);
  if (!r) return null;
  if (r.commercialIncomeSharePct != null) return `Commercial ${Math.round(r.commercialIncomeSharePct)}% of income`;
  if (r.commercialAreaSharePct != null) return `Commercial ${Math.round(r.commercialAreaSharePct)}% of area`;
  return null;
}

/** The building's two halves in one line, for the memo, the workbook's
 *  cover and the report. */
export function mixedUseShortLine(r: MixedUseRead): string {
  const parts: string[] = [];
  if (r.residentialIncome != null && r.commercialIncome != null) {
    parts.push(
      `${money(r.residentialIncome)} residential and ${money(r.commercialIncome)} commercial income${
        r.commercialIncomeSharePct != null ? ` (${pct1(r.commercialIncomeSharePct)} commercial)` : ""
      }`,
    );
  } else if (r.commercialIncome != null) {
    parts.push(`${money(r.commercialIncome)} commercial income`);
  }
  if (r.commercialSf != null) {
    parts.push(
      r.buildingSf != null && r.commercialAreaSharePct != null
        ? `commercial ${sfText(r.commercialSf)} of ${sfText(r.buildingSf)}`
        : `commercial ${sfText(r.commercialSf)}`,
    );
  }
  if (r.commercialOccupancyPct != null) parts.push(`commercial ${pct1(r.commercialOccupancyPct)} occupied`);
  return `Mixed-use: ${parts.join("; ")}`;
}

/** The read as the steps after the extraction see it (lib/deal-context). */
export function mixedUseContextLine(r: MixedUseRead): string {
  return `Mixed-use income: ${r.headline}${r.page ? ` (${r.page})` : ""}`;
}

/** The facts beside the class's own MIXED_USE_TRAPS (a)–(c), for the
 *  assumption review: the traps the two incomes add. */
export function mixedUseNote(r: MixedUseRead): string {
  return [
    `MIXED-USE INCOME AS STATED: ${r.headline}`,
    "Check by name, after the class's own traps: (d) THE AGENCY LIMIT — whether the commercial share of income and of area keeps the building inside an agency lender's limits for commercial space, or sizes the loan differently; (e) METERS AND CAM — whether the commercial space's utilities and common costs are separately metered and recovered from its tenants; (f) THE ZONING — a required ground-floor use that limits who the space can be re-let to.",
  ].join(" ");
}

/** The rows a key-terms block leads with on a mixed-use deal, each only
 *  where stated. */
export function mixedUseTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter((m) => isRow(m) && !NOT_STATED.test(m.value.trim()) && !NOT_TODAY.test(m.label));
  const pick = (re: RegExp) => rows.find((m) => re.test(m.label));
  return [pick(RESIDENTIAL_INCOME_ROW), pick(COMMERCIAL_INCOME_ROW), pick(COMMERCIAL_SF_ROW), pick(COMMERCIAL_OCCUPANCY_ROW)].filter(
    (m): m is M => m != null,
  );
}
