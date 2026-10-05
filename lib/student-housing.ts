// Student housing (#468) — a building leased by the bed, for an academic
// year, to students whose parents usually sign too. Its year's income is
// decided months before the year starts, by how much of the building is
// leased for the coming fall, and the screen read none of it: the model ran
// a student deal as an apartment building leased by the unit all year.
//
// Pure — no I/O, no model call. The extraction files the figures as rows of
// their own, each only as stated: "Pre-leased" (the share leased for the
// coming academic year, with its term and date as written), "Pre-leased
// last year" (the share at the same point a year earlier), "Beds",
// "Distance to campus", "University", "University enrollment", "Parental
// guarantees", "Rent per bed" and "Lease term".
//
// Five rules.
//
// PRE-LEASING IS NEXT YEAR'S RENT ROLL. The share leased for the fall is the
// occupancy the year will open at; a model whose vacancy assumes more beds
// leased than the building has signed is assuming the rest of the leasing.
//
// THE PACE IS THE COMPARISON. The level alone says little — a building 60%
// pre-leased in March can be on time, one 90% in August behind — so the
// figure set against last year's at the same point, in points, is the read.
//
// BEDS, NOT UNITS. Price and rent are by the bed: a four-bed unit is four
// leases, so the price per bed and the rent per bed are the figures a buyer
// compares.
//
// THE WALK IS THE MOAT. A building within half a mile of campus is
// "pedestrian to campus", the industry's own split; farther is a shuttle's
// or a car's, and competes with every building on the route. Read only
// from a distance the memorandum states in miles, feet or minutes' walk.
//
// A BLANK IS NULL. No stated pre-leasing is none, never a guess from the
// occupancy.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { assetClassKey } from "@/lib/asset-words";
import { parseCount, parsePct } from "@/lib/criteria";
import { askingPriceOf, buildingPriceOf } from "@/lib/deal-strategy";
import { parsePageNumber } from "@/lib/facts";
import { compactUsd, parseUsd } from "@/lib/money";

type Row = { label: string; value: string; page?: string };
const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|[-–—])?\.?$/i;

const PRE_LEASED = /^pre-?leas(?:ed|ing)\b(?!.*\b(?:last|prior|previous)\s+year\b)/i;
const PRE_LEASED_PRIOR = /^pre-?leas(?:ed|ing)\b.*\b(?:last|prior|previous)\s+year\b/i;
const BEDS = /^(?:total\s+)?beds?\b(?!.*\b(?:per|\/)\b)/i;
const UNITS = /^(?:total\s+)?units?\b(?!.*\b(?:per|\/|mix)\b)/i;
const DISTANCE = /^distance\s+to\s+campus\b/i;
const UNIVERSITY = /^university$|^(?:the\s+)?school$/i;
const ENROLLMENT = /^(?:university\s+)?enrollment\b/i;
const GUARANTEES = /^parental\s+guarantees?\b|^guarantor(?:s|\s+share)\b/i;
const RENT_PER_BED = /^(?:average\s+|avg\.?\s+|in-?place\s+)?rent\s+(?:per|\/)\s*bed\b/i;
const LEASE_TERM = /^lease\s+term\b/i;

/** The rows a key-terms block leads with on a student deal: the
 *  pre-leasing, last year's, the beds, the walk and the rent per bed. */
export function studentTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter((m) => isRow(m) && !NOT_STATED.test(m.value.trim()));
  const pick = (re: RegExp) => rows.find((m) => re.test(m.label.trim()));
  return [pick(PRE_LEASED), pick(PRE_LEASED_PRIOR), pick(DISTANCE), pick(RENT_PER_BED)].filter((m): m is M => m != null);
}

/** The pedestrian line: half a mile, the industry's own split. */
export const PEDESTRIAN_MILES = 0.5;
/** A ten-minute walk is about half a mile. */
export const PEDESTRIAN_MINUTES = 10;

export interface CampusWalk {
  stated: string;
  /** the distance in miles where the words give one */
  miles: number | null;
  /** within half a mile (or a ten-minute walk, or adjacent); false beyond;
   *  null where the words give no distance */
  pedestrian: boolean | null;
}

/** A stated distance to campus, read only from miles, feet, a walk's
 *  minutes or words that place it on the campus's edge. */
export function campusWalk(stated: string): CampusWalk {
  const s = stated.toLowerCase();
  const mi = /(\d+(?:\.\d+)?)\s*(?:mi\b|miles?\b)/.exec(s);
  if (mi) {
    const miles = Number(mi[1]);
    return { stated, miles, pedestrian: miles <= PEDESTRIAN_MILES };
  }
  const ft = /(\d[\d,]*)\s*(?:ft\b|feet\b)/.exec(s);
  if (ft) {
    const miles = Number(ft[1].replace(/,/g, "")) / 5280;
    return { stated, miles: Math.round(miles * 100) / 100, pedestrian: miles <= PEDESTRIAN_MILES };
  }
  const walk = /(\d+)[\s-]*(?:min(?:ute)?s?)\b[^.]*\bwalk/.exec(s);
  if (walk) return { stated, miles: null, pedestrian: Number(walk[1]) <= PEDESTRIAN_MINUTES };
  if (/\b(?:adjacent|across the street|on[- ]campus|steps from|abuts|borders)\b/.test(s)) return { stated, miles: null, pedestrian: true };
  return { stated, miles: null, pedestrian: null };
}

/** "Fall 2026", "2026-27": the term a pre-leasing figure is for, as
 *  written; "" where the words name none. */
export function academicTerm(stated: string): string {
  const season = /\b(fall|autumn|spring)\s+(20\d{2})\b/i.exec(stated);
  if (season) return `${season[1][0].toUpperCase()}${season[1].slice(1).toLowerCase()} ${season[2]}`;
  const year = /\b(20\d{2})\s*[-–/]\s*(\d{2}|20\d{2})\b/.exec(stated);
  return year ? `${year[1]}–${year[2].slice(-2)}` : "";
}

export interface StudentHousingRead {
  /** the share pre-leased for the coming term, % */
  preLeasedPct: number | null;
  preLeasedStated: string;
  /** the share at the same point a year earlier, % */
  priorPct: number | null;
  /** points ahead (+) or behind (−) last year's pace */
  pacePts: number | null;
  /** the term the pre-leasing is for, as written ("Fall 2026") */
  term: string;
  beds: number | null;
  units: number | null;
  /** the building's price over the beds (a share's grossed up; none on a
   *  note or the land) */
  pricePerBed: number | null;
  /** the rent per bed a month, as stated */
  rentPerBed: number | null;
  walk: CampusWalk | null;
  university: string;
  enrollment: string;
  /** the share of leases with a parent's guarantee, % */
  guaranteesPct: number | null;
  leaseTerm: string;
  page: string;
  sentences: string[];
  headline: string;
}

const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const pts = (n: number) => `${Math.round(Math.abs(n) * 10) / 10} ${Math.abs(n) === 1 ? "point" : "points"}`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const k = (n: number) => compactUsd(n);

/** Whether the deal is student housing: the class the deck was read as, or
 *  a stated pre-leasing figure beside a count of beds. */
function isStudent(ex: ExtractionResult, rows: Row[]): boolean {
  if (assetClassKey(ex.assetClass) === "student_housing") return true;
  return rows.some((r) => PRE_LEASED.test(r.label.trim())) && rows.some((r) => BEDS.test(r.label.trim()));
}

/**
 * A student deal's leasing and its place, as stated. Null on anything but
 * student housing, and where the memorandum states none of it.
 */
export function readStudentHousing(ex: ExtractionResult | null | undefined): StudentHousingRead | null {
  if (!ex) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow).filter((m) => !NOT_STATED.test(m.value.trim()));
  if (!isStudent(ex, rows)) return null;
  const find = (re: RegExp) => rows.find((m) => re.test(m.label.trim())) ?? null;

  const preRow = find(PRE_LEASED);
  const priorRow = find(PRE_LEASED_PRIOR);
  const pctsOf = (v: string) => [...v.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1])).filter((n) => n >= 0 && n <= 100);
  const prePcts = preRow ? pctsOf(preRow.value) : [];
  const preLeasedPct = prePcts[0] ?? null;
  // "87% vs. 82% at this time last year": the second figure is last year's
  // only where the words say so.
  const priorInline =
    prePcts.length >= 2 && preRow && /\b(?:last|prior|previous)\s+year\b|\ba\s+year\s+(?:ago|earlier)\b/i.test(preRow.value) ? prePcts[1] : null;
  const priorPct = priorRow ? (pctsOf(priorRow.value)[0] ?? null) : priorInline;
  const pacePts = preLeasedPct != null && priorPct != null ? Math.round((preLeasedPct - priorPct) * 10) / 10 : null;

  const count = (re: RegExp) => {
    const r = find(re);
    return r ? parseCount(r.value) : null;
  };
  const beds = count(BEDS);
  const units = count(UNITS);
  const price = buildingPriceOf(ex, askingPriceOf(ex));
  const pricePerBed = price != null && beds != null && beds > 0 ? Math.round(price / beds) : null;
  const rentRow = find(RENT_PER_BED);
  const rentPerBed = rentRow && !/\b(?:yr|year|annual)\b/i.test(rentRow.value) ? parseUsd(rentRow.value, 100) : null;
  const distRow = find(DISTANCE);
  const walk = distRow ? campusWalk(distRow.value.trim()) : null;
  const guaranteesRow = find(GUARANTEES);
  const guaranteesPct = guaranteesRow ? parsePct(guaranteesRow.value) : null;

  const read: Omit<StudentHousingRead, "sentences" | "headline"> = {
    preLeasedPct,
    preLeasedStated: preRow?.value.trim() ?? "",
    priorPct,
    pacePts,
    term: preRow ? academicTerm(preRow.value) : "",
    beds,
    units,
    pricePerBed,
    rentPerBed,
    walk,
    university: find(UNIVERSITY)?.value.trim() ?? "",
    enrollment: find(ENROLLMENT)?.value.trim() ?? "",
    guaranteesPct: guaranteesPct != null && guaranteesPct >= 0 && guaranteesPct <= 100 ? guaranteesPct : null,
    leaseTerm: find(LEASE_TERM)?.value.trim() ?? "",
    page: "",
  };
  if (read.preLeasedPct == null && read.beds == null && !read.walk && !read.university && !read.enrollment && read.rentPerBed == null) return null;
  const pages = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const pageRow = preRow ?? distRow ?? find(BEDS);
  const n = parsePageNumber(pageRow?.page);
  read.page = n != null && pages != null && n <= pages ? (pageRow?.page ?? "").trim() : "";
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

function sentencesOf(r: Omit<StudentHousingRead, "sentences" | "headline">): string[] {
  const out: string[] = [];
  const forTerm = r.term ? ` for ${r.term}` : " for the coming year";
  if (r.preLeasedPct != null) {
    const pace =
      r.pacePts == null
        ? ""
        : r.pacePts === 0
          ? `, level with last year's pace at the same point`
          : `, ${pts(r.pacePts)} ${r.pacePts > 0 ? "ahead of" : "behind"} last year's ${pct1(r.priorPct as number)} at the same point`;
    out.push(
      `The building is ${pct1(r.preLeasedPct)} pre-leased${forTerm}${pace}: the leases signed for the fall are the occupancy the year opens at.`,
    );
  }
  if (r.beds != null) {
    const per = r.units != null && r.units > 0 ? `, ${Math.round((r.beds / r.units) * 10) / 10} a unit across ${r.units.toLocaleString("en-US")} units` : "";
    const basis = [
      r.pricePerBed != null ? `${usd(r.pricePerBed)} a bed at the price` : "",
      r.rentPerBed != null ? `${usd(r.rentPerBed)} a bed a month in rent` : "",
    ].filter(Boolean);
    out.push(`It leases by the bed: ${r.beds.toLocaleString("en-US")} beds${per}${basis.length ? `, ${basis.join(" and ")}` : ""}.`);
  }
  if (r.walk) {
    out.push(
      r.walk.pedestrian === true
        ? `It is ${r.walk.stated} from campus: pedestrian, within the half mile a student walks.`
        : r.walk.pedestrian === false
          ? `It is ${r.walk.stated} from campus: past the half mile a student walks, so it competes with every building on the shuttle's or the car's route.`
          : `Its distance to campus, as stated: ${r.walk.stated}.`,
    );
  }
  if (r.university || r.enrollment) {
    out.push(
      `${r.university ? `The school is ${r.university}` : "The school's"}${r.enrollment ? `${r.university ? "; its" : ""} enrollment, as stated: ${r.enrollment}` : ""}.`,
    );
  }
  if (r.guaranteesPct != null) out.push(`${pct1(r.guaranteesPct)} of the leases carry a parent's guarantee.`);
  return out;
}

/** What the model assumes against the pre-leasing: its vacancy is the
 *  share of the beds it expects unleased. "" where there is nothing to set
 *  against it. */
export function studentModelLine(r: StudentHousingRead, m: { vacancyPct: number }): string {
  if (r.preLeasedPct == null) return "";
  const occupied = Math.round((100 - m.vacancyPct) * 10) / 10;
  const forTerm = r.term ? ` for ${r.term}` : "";
  if (r.preLeasedPct >= occupied) {
    return `The model's ${pct1(m.vacancyPct)} vacancy is covered: the building is already ${pct1(r.preLeasedPct)} pre-leased${forTerm}, against the ${pct1(occupied)} the model runs at.`;
  }
  return `The model's ${pct1(m.vacancyPct)} vacancy assumes ${pct1(occupied)} of the beds leased; the building is ${pct1(r.preLeasedPct)} pre-leased${forTerm}, so ${pts(occupied - r.preLeasedPct)} of the fall's leasing is still to sign.`;
}

/** The pipeline row's tag: "Pre-leased 87%, +5 pts y/y", "Pre-leased 87%",
 *  "Drive-to campus". Null where there is nothing to say. */
export function studentHousingTag(ex: ExtractionResult | null | undefined): string | null {
  const r = readStudentHousing(ex);
  if (!r) return null;
  if (r.preLeasedPct != null) {
    const pace = r.pacePts == null ? "" : `, ${r.pacePts >= 0 ? "+" : "−"}${Math.round(Math.abs(r.pacePts) * 10) / 10} pts y/y`;
    return `Pre-leased ${pct1(r.preLeasedPct)}${pace}`;
  }
  if (r.walk?.pedestrian === false) return "Drive-to campus";
  return null;
}

/** The read in one line, for the memo, the workbook's cover and the
 *  report. */
export function studentShortLine(r: StudentHousingRead): string {
  const parts: string[] = [];
  if (r.preLeasedPct != null) {
    parts.push(
      `${pct1(r.preLeasedPct)} pre-leased${r.term ? ` for ${r.term}` : ""}${r.pacePts != null ? ` (${r.pacePts >= 0 ? "+" : "−"}${Math.round(Math.abs(r.pacePts) * 10) / 10} pts on last year)` : ""}`,
    );
  }
  if (r.beds != null) parts.push(`${r.beds.toLocaleString("en-US")} beds${r.pricePerBed != null ? ` at ${k(r.pricePerBed)} a bed` : ""}`);
  if (r.walk) parts.push(`${r.walk.stated} to campus${r.walk.pedestrian === true ? " (pedestrian)" : r.walk.pedestrian === false ? " (drive-to)" : ""}`);
  if (r.university) parts.push(r.university);
  return `Student housing: ${parts.join("; ")}`;
}

/** The read as the steps after the extraction see it (lib/deal-context). */
export function studentContextLine(r: StudentHousingRead): string {
  return `Student housing: ${r.headline}${r.page ? ` (${r.page})` : ""}`;
}

/** The facts beside the class's own traps, for the assumption review. */
export function studentNote(r: StudentHousingRead): string {
  return [
    `STUDENT HOUSING AS STATED: ${r.headline}`,
    "Check by name: the pre-lease pace against last year's at the same date (not the level alone); the model's vacancy against the beds still to sign; the rent per bed against the rents the pre-leased beds were signed at; the walk to campus and the new beds within it; and the enrollment trend beside the university's own beds.",
  ].join(" ");
}
