// What the third-party reports found (#465) — the Phase I environmental site
// assessment, the property condition assessment, the seismic report and the
// zoning report a memorandum cites in a line of its due-diligence page. Each
// is a lender's condition and some are a cheque at closing, and the screen
// read none of them.
//
// Pure — no I/O, no model call. The extraction labels each finding as a row
// of its own ("Phase I ESA date", "Phase I ESA findings", "Phase II ESA",
// "PCA date", "PCA immediate repairs", "PCA replacement reserves", "Seismic
// PML", "Zoning conformance"), each only as stated; this reads them into
// what every surface says.
//
// Five rules.
//
// THE SELLER'S REPORTS ARE THE SELLER'S. The buyer's lender relies on its
// own reports, or on a reliance letter from the firm that wrote these; a
// memorandum's summary of them is a lead, not a clearance.
//
// A PHASE I IS GOOD FOR A YEAR. The all-appropriate-inquiries rule (40 CFR
// 312, ASTM E1527-21) takes a report completed within the year before the
// purchase, with its interviews, record searches and site visit within 180
// days of it. Its age is read from today, the report's date read as early
// as the words allow (a month alone is its first day, a year alone its
// first day), so a report is never called fresher than it is.
//
// A FINDING IS WHAT THE WORDS SAY. "No RECs" is none; a recognized
// environmental condition is a lender's condition (a Phase II or a
// reserve); a controlled one has controls that run with the land; a
// historical one is closed. The words are shown as stated whatever the
// read, and words that name none of these are said as stated.
//
// THE IMMEDIATE REPAIRS ARE CAPITAL AT CLOSING. The PCA's immediate repairs
// are work the building needs now, and the model's capital line carries
// them where the memorandum states no other budget; a stated budget is read
// as including them, never the two added.
//
// A BLANK IS NULL. A report the memorandum does not cite is not assumed
// clean: "none" is a finding, and absent is absent.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { parsePct } from "@/lib/criteria";
import { askingPriceOf } from "@/lib/deal-strategy";
import { parsePageNumber } from "@/lib/facts";
import type { MetricRow } from "@/lib/ground-lease-term";
import { parseUsd } from "@/lib/money";
import { parseStatedDate } from "@/lib/note-yield";

const isRow = (m: unknown): m is MetricRow =>
  !!m && typeof m === "object" && typeof (m as MetricRow).label === "string" && typeof (m as MetricRow).value === "string";

// ── The rows ────────────────────────────────────────────────────────────

// "Phase I" and never "Phase II" — the numeral stands alone — and only
// the environmental report: a development's "Phase I units" is not one.
const ESA = String.raw`(?=.*\b(?:esa|environmental)\b)`;
const PHASE_ONE = String.raw`^phase\s*(?:i|1|one)(?![iv\d])\b${ESA}`;
const PHASE_I_DATE = new RegExp(String.raw`${PHASE_ONE}.*\b(?:date|dated)\b`, "i");
const PHASE_I_FIND = new RegExp(String.raw`${PHASE_ONE}(?!.*\b(?:date|dated)\b)`, "i");
const PHASE_II = new RegExp(String.raw`^phase\s*(?:ii|2|two)(?![iv\d])\b${ESA}`, "i");
const PCA = String.raw`^(?:pca|pcr|property\s+condition(?:\s+(?:assessment|report))?)`;
const PCA_DATE = new RegExp(String.raw`${PCA}\b.*\bdate\b`, "i");
const PCA_IMMEDIATE = new RegExp(String.raw`${PCA}\b.*\bimmediate\b|^immediate\s+(?:repairs?|needs|capital\s+needs)\b`, "i");
const PCA_RESERVES = new RegExp(String.raw`${PCA}\b.*\breserves?\b`, "i");
const PML = /^(?:seismic\b.*\b(?:pml|sel|probable\s+maximum\s+loss|scenario\s+expected\s+loss)|(?:pml|sel)\b|probable\s+maximum\s+loss\b|scenario\s+expected\s+loss\b)/i;
const ZONING = /^zoning\s+(?:conformance|conformity|compliance|status)\b/i;

const find = (rows: MetricRow[], re: RegExp, not?: RegExp) => rows.find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

// A row that says the report found nothing: "None", "None identified" — a
// finding, and said as one.
const NONE = /^(?:none|no|nil|none\s+(?:identified|noted|found|observed|reported|required|recommended))\.?$/i;
// A row that says nothing at all: "N/A", "Not stated", "—". Absent, never
// "none": a report nobody states the finding of has not been found clean.
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|[-–—])?\.?$/i;
const says = (m: { value: string }) => !NOT_STATED.test(m.value.trim());

/** The rows a key-terms block leads with where the memorandum cites the
 *  reports: the Phase I's findings and date, the immediate repairs, the
 *  PML and the zoning. */
export function siteReportTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = (metrics.filter(isRow) as M[]).filter(says);
  const pick = (re: RegExp, not?: RegExp) => rows.find((m) => re.test(m.label) && !(not && not.test(m.label)));
  return [pick(PHASE_I_FIND), pick(PHASE_I_DATE), pick(PCA_IMMEDIATE), pick(PML), pick(ZONING)].filter((m): m is M => m != null);
}

// ── The Phase I ─────────────────────────────────────────────────────────

/** What a Phase I found, by its words. */
export type EsaFinding = "none" | "rec" | "crec" | "hrec" | "de_minimis" | "stated";

const KINDS = String.raw`(?:(?:c|h)?recs?|de minimis conditions?)`;
const LIST = String.raw`${KINDS}(?:\s*(?:,|or|and|nor|\/)\s*${KINDS})*`;
// "no RECs", "no evidence of RECs", "did not identify any RECs", "0 RECs"
const DENIED_BEFORE = new RegExp(
  String.raw`\b(?:no|zero|0|without|not\s+(?:identify|identified|reveal|revealed|find|found)|did\s+not\s+(?:identify|reveal|find|disclose))(?:\s+any)?\s+(?:(?:evidence|indications?)\s+of\s+)?(?:(?:further|significant|open|current|known|on-?site)\s+)?${LIST}`,
  "g",
);
// "RECs: none", "RECs — not identified", "RECs were not identified"
const DENIED_AFTER = new RegExp(
  String.raw`${LIST}\s*[:\-–—]?\s*(?:(?:were|was|are|is|have\s+been|has\s+been)\s+)?(?:none|not\s+(?:identified|found|observed|noted|revealed)|n\/a|no)\b`,
  "g",
);
const deny = (t: string) => t.replace(DENIED_BEFORE, " ").replace(DENIED_AFTER, " ");

/** The most serious kind of condition the words name, or null. */
const kindIn = (t: string): Exclude<EsaFinding, "none" | "stated"> | null =>
  /\brecs?\b/.test(t) ? "rec" : /\bcrecs?\b/.test(t) ? "crec" : /\bhrecs?\b/.test(t) ? "hrec" : /\bde minimis\b/.test(t) ? "de_minimis" : null;

/**
 * The finding the words name, the most serious first: a recognized
 * environmental condition, then a controlled one, then a historical one,
 * then de minimis conditions, then none. A condition the words deny ("no
 * RECs", "did not identify any RECs", "RECs were not identified") is
 * struck out before the rest is read, so "No RECs; one HREC" is the
 * historical one. A denial with an exception in its own clause is read by
 * the exception: "no RECs except de minimis conditions" is de minimis, and
 * the standard's own "no evidence of recognized environmental conditions
 * … except for the following:" lists RECs. A "no further action" letter
 * is a closed file, not a clean report, and is said as stated.
 */
export function esaFinding(words: string): EsaFinding {
  const t = ` ${words.toLowerCase().replace(/\s+/g, " ")} `;
  if (!t.trim()) return "stated";
  // The long forms first, so a "controlled recognized environmental
  // condition" is never read as a recognized one.
  const s = t
    .replace(/\bcontrolled recognized environmental conditions?\b/g, " crec ")
    .replace(/\bhistorical recognized environmental conditions?\b/g, " hrec ")
    .replace(/\brecognized environmental conditions?\b/g, " rec ");
  // An exception to a denial in the same clause: what follows it is the
  // finding. An exception in a clause of its own ("…; all areas were
  // accessible except the basement") is not one.
  for (const ex of s.matchAll(/\b(?:except|with the exception of|other than)\b/g)) {
    const at = ex.index ?? 0;
    const from = Math.max(s.lastIndexOf(";", at), s.lastIndexOf(".", at)) + 1;
    const before = s.slice(from, at);
    if (deny(before) === before) continue;
    const after = s.slice(at);
    return kindIn(deny(after)) ?? (/^except for the following\b/.test(after) ? "rec" : "stated");
  }
  const denied = deny(s);
  const kind = kindIn(denied);
  if (kind) return kind;
  if (
    denied !== s ||
    /\bno (?:environmental (?:concerns|issues|conditions)|further (?:investigation|assessment) (?:is |was )?(?:recommended|warranted|required|necessary))\b|\bclean\b/.test(s)
  ) {
    return "none";
  }
  return "stated";
}

/** Where a Phase I stands for a purchase: within 180 days, past 180 days
 *  and within the year (its components to update), or past the year (a new
 *  report). */
export type EsaAge = "current" | "update" | "redo";

export function esaAge(ageDays: number): EsaAge {
  return ageDays <= 180 ? "current" : ageDays <= 365 ? "update" : "redo";
}

/**
 * A report's date as the memorandum writes it, read as early as its words
 * allow: a full date as written, a month alone its first day, a year alone
 * its first day — so a report's age is never understated.
 */
export function reportDate(text: string | null | undefined): string | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const withDay = /\d{4}-\d{1,2}-\d{1,2}|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/.test(s);
  const parsed = parseStatedDate(s, 1980, 2100);
  if (parsed) return withDay ? parsed : `${parsed.slice(0, 7)}-01`;
  const year = /\b((?:19|20)\d{2})\b/.exec(s);
  return year ? `${year[1]}-01-01` : null;
}

/** A value that is a date and nothing else: "March 15, 2026", "March 2026",
 *  "3/2026", "2026-03-15", "2025". */
const DATE_ONLY =
  /^\s*(?:(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:\d{1,2}(?:st|nd|rd|th)?,?\s+)?(?:19|20)\d{2}|\d{1,2}\/(?:\d{1,2}\/)?\d{2,4}|\d{4}-\d{1,2}(?:-\d{1,2})?)\s*$/i;

const daysBetween = (fromIso: string, to: Date) =>
  Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

// ── The zoning ──────────────────────────────────────────────────────────

export type ZoningStatus = "conforming" | "legal_non_conforming" | "non_conforming" | "stated";

export function zoningStatus(words: string): ZoningStatus {
  // What the words deny first: "no violations", "no open zoning
  // violations" is not a violation.
  const t = words
    .toLowerCase()
    .replace(/\bno\s+(?:open\s+|known\s+|outstanding\s+|recorded\s+)?(?:zoning\s+|code\s+)?(?:violations?|non[- ]?conformit(?:y|ies))\b/g, " ");
  if (/\billegal(?:ly)?[\s,]+non[- ]?conforming\b/.test(t)) return "non_conforming";
  if (/\blegal(?:ly)?[\s,]+non[- ]?conforming\b|\bgrandfathered\b|\bpre[- ]?existing[\s,]+non[- ]?conforming\b/.test(t)) return "legal_non_conforming";
  if (/\bnon[- ]?conforming\b|\bnon[- ]?complian(?:t|ce)\b|\bviolations?\b/.test(t)) return "non_conforming";
  if (/\bconform(?:s|ing)\b|\bcompli(?:es|ant)\b/.test(t)) return "conforming";
  return "stated";
}

// ── The read ────────────────────────────────────────────────────────────

export interface SiteReportsRead {
  phaseI: {
    /** the report's date, read early (ISO), null where none is stated */
    date: string | null;
    dateStated: string;
    ageDays: number | null;
    age: EsaAge | null;
    /** null where the memorandum states the date and no finding */
    finding: EsaFinding | null;
    /** the finding as stated ("" where none is) */
    words: string;
  } | null;
  /** the Phase II as stated ("" where none is cited) */
  phaseII: string;
  pca: {
    date: string | null;
    dateStated: string;
    /** the immediate repairs as stated, in dollars: 0 where the memorandum
     *  states none, null where it states no figure */
    immediate: number | null;
    /** the recommended reserves as stated ("" where none are) */
    reserves: string;
  } | null;
  /** the seismic PML (or SEL) as stated, in % */
  pmlPct: number | null;
  zoning: { status: ZoningStatus; words: string } | null;
  /** the asking price the repairs are a share of, as stated */
  price: number | null;
  page: string;
  /** the read a sentence at a time, report by report: the Phase I first,
   *  then the Phase II, the repairs, the PML and the zoning */
  sentences: string[];
  headline: string;
}

/** The PML at which most lenders ask for earthquake insurance or a
 *  retrofit. */
export const PML_LENDER_PCT = 20;

const money = (n: number) =>
  n >= 1e6 ? `$${(Math.round(n / 1e4) / 100).toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}M` : `$${Math.round(n).toLocaleString("en-US")}`;
const compact = (n: number) => (n >= 1e6 ? `$${(Math.round(n / 1e5) / 10).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);
const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mar 2026" — the month a report is dated, as the words allow. */
export function reportMonth(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** "18" under a PML label is 18%: the figure alone, nothing else. */
const bareNumber = (v: string) => {
  const m = /^\s*(\d{1,2}(?:\.\d+)?)\s*$/.exec(v);
  return m ? Number(m[1]) : null;
};

/** The repairs as stated: dollars, "None" as zero, never a range or a
 *  figure per unit or per foot. */
function repairsOf(value: string): number | null {
  const v = value.trim();
  if (NONE.test(v) || /^\$?0(?:\.0+)?$/.test(v) || /^no\s+(?:immediate\s+|critical\s+)?(?:repairs?|needs|items)\b/i.test(v)) return 0;
  if (/\/\s*(?:unit|door|key|sf|sq)|\bper\s+(?:unit|door|key|sf|square)|\bpsf\b/i.test(v)) return null;
  if (/\d\s*[–—-]\s*\$?\d|\d\s+to\s+\$?\d/i.test(v)) return null;
  const n = parseUsd(v, 100);
  return n != null && n > 0 ? n : null;
}

/**
 * The reports the memorandum cites, as stated. Null where it cites none of
 * them.
 */
export function readSiteReports(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): SiteReportsRead | null {
  if (!ex) return null;
  // A row that states nothing is no row.
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow).filter(says);
  let phaseIDateRow = find(rows, PHASE_I_DATE);
  let phaseIFindRow = find(rows, PHASE_I_FIND, PHASE_I_DATE);
  // A date filed under the report's own name ("Phase I ESA": "March 2026")
  // is its date, never its finding.
  if (!phaseIDateRow && phaseIFindRow && DATE_ONLY.test(phaseIFindRow.value)) {
    phaseIDateRow = phaseIFindRow;
    phaseIFindRow = null;
  }
  const phaseIIRow = find(rows, PHASE_II);
  const pcaDateRow = find(rows, PCA_DATE);
  const pcaImmediateRow = find(rows, PCA_IMMEDIATE, PCA_DATE);
  const pcaReservesRow = find(rows, PCA_RESERVES, PCA_DATE);
  const pmlRow = find(rows, PML);
  const zoningRow = find(rows, ZONING);
  if (!phaseIDateRow && !phaseIFindRow && !phaseIIRow && !pcaDateRow && !pcaImmediateRow && !pcaReservesRow && !pmlRow && !zoningRow) {
    return null;
  }

  let phaseI: SiteReportsRead["phaseI"] = null;
  if (phaseIDateRow || phaseIFindRow) {
    const date = phaseIDateRow ? reportDate(phaseIDateRow.value) : null;
    const ageDays = date != null ? daysBetween(date, asOf) : null;
    const words = phaseIFindRow && !NONE.test(phaseIFindRow.value.trim()) ? phaseIFindRow.value.trim().replace(/\.$/, "") : "";
    phaseI = {
      date,
      dateStated: phaseIDateRow?.value.trim() ?? "",
      ageDays: ageDays != null && ageDays >= 0 ? ageDays : null,
      age: ageDays != null && ageDays >= 0 ? esaAge(ageDays) : null,
      finding: phaseIFindRow ? (NONE.test(phaseIFindRow.value.trim()) ? "none" : esaFinding(phaseIFindRow.value)) : null,
      words,
    };
  }

  let pca: SiteReportsRead["pca"] = null;
  if (pcaDateRow || pcaImmediateRow || pcaReservesRow) {
    pca = {
      date: pcaDateRow ? reportDate(pcaDateRow.value) : null,
      dateStated: pcaDateRow?.value.trim() ?? "",
      immediate: pcaImmediateRow ? repairsOf(pcaImmediateRow.value) : null,
      reserves: pcaReservesRow && !NONE.test(pcaReservesRow.value.trim()) ? pcaReservesRow.value.trim().replace(/\.$/, "") : "",
    };
  }

  const pmlRaw = pmlRow ? (parsePct(pmlRow.value) ?? bareNumber(pmlRow.value)) : null;
  const pmlPct = pmlRaw != null && pmlRaw > 0 && pmlRaw < 100 ? pmlRaw : null;
  const zoningWords = zoningRow && !NONE.test(zoningRow.value.trim()) ? zoningRow.value.trim().replace(/\.$/, "") : "";
  const zoning = zoningWords ? { status: zoningStatus(zoningWords), words: zoningWords } : null;

  const price = askingPriceOf(ex);

  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const pageRow = phaseIFindRow ?? phaseIDateRow ?? pcaImmediateRow ?? pcaDateRow ?? pmlRow ?? zoningRow ?? phaseIIRow ?? pcaReservesRow;
  const n = parsePageNumber(pageRow?.page);
  const page = n != null && pageCount != null && n <= pageCount ? (pageRow?.page ?? "").trim() : "";

  const read: Omit<SiteReportsRead, "sentences" | "headline"> = {
    phaseI,
    phaseII: phaseIIRow && !NONE.test(phaseIIRow.value.trim()) ? phaseIIRow.value.trim().replace(/\.$/, "") : "",
    pca,
    pmlPct,
    zoning,
    price,
    page,
  };
  if (!read.phaseI && !read.phaseII && !read.pca && read.pmlPct == null && !read.zoning) return null;
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

/** A Phase I finding in words, for a sentence ("a recognized environmental
 *  condition"); "" for a finding stated in the report's own words, which a
 *  caller quotes instead. */
export const FINDING_WORDS: Record<EsaFinding, string> = {
  none: "no recognized environmental conditions",
  rec: "a recognized environmental condition",
  crec: "a controlled recognized environmental condition",
  hrec: "a historical recognized environmental condition",
  de_minimis: "de minimis conditions only",
  stated: "",
};

/** The Phase I's finding in a few words, as the tag and the panel say it. */
export function findingLabel(f: EsaFinding): string {
  return { none: "No RECs", rec: "REC", crec: "CREC", hrec: "HREC", de_minimis: "De minimis", stated: "As stated" }[f];
}

function sentencesOf(r: Omit<SiteReportsRead, "sentences" | "headline">): string[] {
  const out: string[] = [];
  const p1 = r.phaseI;
  if (p1) {
    const dated = p1.date ? `, dated ${reportMonth(p1.date)},` : "";
    const quoted = p1.words ? ` ("${p1.words}")` : "";
    if (p1.finding === "rec") {
      out.push(
        `The seller's Phase I${dated} found a recognized environmental condition${quoted}: a lender will want it resolved before it lends, typically with a Phase II, a remediation reserve or both.`,
      );
    } else if (p1.finding === "crec") {
      out.push(
        `The seller's Phase I${dated} found a controlled recognized environmental condition${quoted}: the contamination stays in place under controls that run with the land, and the use they allow is the use the buyer can make.`,
      );
    } else if (p1.finding === "hrec") {
      out.push(`The seller's Phase I${dated} found a historical recognized environmental condition${quoted}: past contamination, closed to the regulator's standard.`);
    } else if (p1.finding === "none" || p1.finding === "de_minimis") {
      out.push(`The seller's Phase I${dated} found ${FINDING_WORDS[p1.finding]}${quoted}.`);
    } else if (p1.finding === "stated") {
      out.push(`The seller's Phase I${dated} says: "${p1.words}".`);
    } else {
      out.push(`The memorandum cites the seller's Phase I${dated} and states no finding.`);
    }
    if (p1.age === "redo") {
      out.push(
        `It is dated ${Math.floor(p1.ageDays! / 30.44)} months before today: past the year a Phase I is good for before a purchase, so the buyer needs a new report, not an update.`,
      );
    } else if (p1.age === "update") {
      out.push(
        `It is dated ${p1.ageDays} days before today: inside the year a Phase I is good for, but past 180 days, so its interviews, record searches and site visit must be updated before closing.`,
      );
    }
  }
  if (r.phaseII) out.push(`Phase II, as stated: ${r.phaseII}.`);
  if (r.pca) {
    const dated = r.pca.date ? ` (${reportMonth(r.pca.date)})` : "";
    if (r.pca.immediate != null && r.pca.immediate > 0) {
      const share = r.price != null ? `, ${pct1((r.pca.immediate / r.price) * 100)} of the asking price` : "";
      out.push(`The property condition report${dated} puts the immediate repairs at ${money(r.pca.immediate)}${share}: work the building needs now, capital at closing.`);
    } else if (r.pca.immediate === 0) {
      out.push(`The property condition report${dated} finds no immediate repairs.`);
    } else {
      out.push(`The memorandum cites a property condition report${dated} and states no immediate repairs figure.`);
    }
    if (r.pca.reserves) out.push(`It recommends reserves of ${r.pca.reserves}.`);
  }
  if (r.pmlPct != null) {
    out.push(
      r.pmlPct >= PML_LENDER_PCT
        ? `The seismic PML is ${pct1(r.pmlPct)}: most lenders ask for earthquake insurance or a retrofit at ${PML_LENDER_PCT}% or more, so price the cover or the work.`
        : `The seismic PML is ${pct1(r.pmlPct)}, under the ${PML_LENDER_PCT}% at which most lenders ask for earthquake insurance.`,
    );
  }
  if (r.zoning) {
    const z = r.zoning;
    out.push(
      z.status === "legal_non_conforming"
        ? `Zoning: ${z.words} — the building may not be rebuilt as it stands after a casualty past the code's limit, so a lender asks for law-and-ordinance cover and a zoning report.`
        : z.status === "non_conforming"
          ? `Zoning: ${z.words} — ask whether it is legal non-conforming, and what bringing it into line costs.`
          : `Zoning: ${z.words}.`,
    );
  }
  return out;
}

/** What the model does with the immediate repairs: carries them in its
 *  year-1 capital where no other budget is stated, or reads a stated budget
 *  as including them. "" where there are none to say. */
export function siteReportsModelLine(r: SiteReportsRead, m: { capitalYr1: number; capitalIsRepairs: boolean }): string {
  const repairs = r.pca?.immediate;
  if (repairs == null || repairs <= 0) return "";
  if (m.capitalIsRepairs) {
    return `The model carries the PCA's ${money(repairs)} of immediate repairs as its year-1 capital, as stated; a lender may hold more than that in escrow at closing.`;
  }
  if (m.capitalYr1 > 0) {
    return `The model's year-1 capital of ${money(m.capitalYr1)} is read as including the PCA's ${money(repairs)} of immediate repairs — check that the budget does.`;
  }
  return `The model carries no capital for the PCA's ${money(repairs)} of immediate repairs: enter them.`;
}

/** The pipeline row's tag, the most serious finding: "Phase I: REC", "PML
 *  24%", "Phase I: CREC", "Non-conforming", "Phase I over a year old",
 *  "Repairs $450k". Null where there is nothing to flag. */
export function siteReportsTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readSiteReports(ex, asOf);
  if (!r) return null;
  if (r.phaseI?.finding === "rec") return "Phase I: REC";
  if (r.pmlPct != null && r.pmlPct >= PML_LENDER_PCT) return `PML ${pct1(r.pmlPct)}`;
  if (r.phaseI?.finding === "crec") return "Phase I: CREC";
  if (r.zoning?.status === "non_conforming") return "Non-conforming";
  if (r.zoning?.status === "legal_non_conforming") return "Legal non-conforming";
  if (r.pca?.immediate != null && r.pca.immediate > 0) return `Repairs ${compact(r.pca.immediate)}`;
  if (r.phaseI?.age === "redo") return "Phase I over a year old";
  return null;
}

/** The reports in one line, for the memo under its title, the workbook's
 *  cover and the report. */
export function siteReportsShortLine(r: SiteReportsRead): string {
  const parts: string[] = [];
  if (r.phaseI) {
    const f = r.phaseI.finding;
    const what = f === "stated" ? `"${r.phaseI.words}"` : f ? FINDING_WORDS[f] : "no finding stated";
    parts.push(`Phase I${r.phaseI.date ? ` ${reportMonth(r.phaseI.date)}` : ""}, ${what}${r.phaseI.age === "redo" ? " (over a year old: a new report)" : r.phaseI.age === "update" ? " (past 180 days: to update before closing)" : ""}`);
  }
  if (r.phaseII) parts.push(`Phase II: ${r.phaseII}`);
  if (r.pca) {
    parts.push(
      r.pca.immediate != null
        ? r.pca.immediate > 0
          ? `PCA immediate repairs ${money(r.pca.immediate)}`
          : "PCA: no immediate repairs"
        : "PCA cited, no immediate repairs figure",
    );
  }
  if (r.pmlPct != null) parts.push(`seismic PML ${pct1(r.pmlPct)}`);
  if (r.zoning) parts.push(`zoning: ${r.zoning.words}`);
  return `Reports: ${parts.join("; ")}`;
}

/** The reports as the steps that read the memorandum after the extraction
 *  see them (lib/deal-context). */
export function siteReportsContextLine(r: SiteReportsRead): string {
  return `The third-party reports: ${r.headline}${r.page ? ` (${r.page})` : ""}`;
}

/** The reports' traps by name, for the assumption review. */
export function siteReportsNote(r: SiteReportsRead): string {
  return [
    `THE THIRD-PARTY REPORTS AS STATED: ${r.headline}`,
    "SITE-REPORT TRAPS, checked by name where the OM gives the inputs:",
    "(a) RELIANCE — the reports are the seller's: the buyer's lender relies on its own, or on a reliance letter from the firm that wrote them, and a memorandum's summary is a lead, not a clearance;",
    "(b) THE PHASE I'S AGE AND FINDINGS — a Phase I is good for the year before the purchase, its interviews, searches and site visit within 180 days; a REC is a lender's condition, a CREC's controls limit the use, and a neighbour's plume is as real as one on site;",
    "(c) THE IMMEDIATE REPAIRS — capital at closing, often held in escrow by the lender, and a pro forma that spends nothing in year one has not read the report;",
    "(d) THE RESERVES — the report's recommended replacement reserves against the reserve the pro forma carries, and the capital items the report dates inside the hold (a roof, the boilers, the parking deck);",
    "(e) SEISMIC AND ZONING — a PML at or above 20% means earthquake insurance or a retrofit for most lenders; a legal non-conforming building may not be rebuilt as it stands after a casualty, so price the law-and-ordinance cover.",
  ].join(" ");
}
