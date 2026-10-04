// The major tenants of a multi-tenant property (#457) — an office building,
// a shopping center, a multi-tenant industrial park, a medical office
// building. Every such memorandum prints a tenant summary, and the screen
// read none of it: not when the leases end against the model's sale, not
// which anchor the center leans on, not which anchor is not being sold at
// all.
//
// Pure — no I/O, no model call. The extraction lists the tenants as the
// memorandum does (`ExtractionResult.tenants`: the name, whether an anchor,
// whether its space is part of the sale, its area, its rent, its lease's
// end, its options, its first date to leave early and the rights it holds,
// each as stated) and labels a quoted WALT under "WALT"; this reads them
// through the rollover card's own arithmetic (lib/tools/rollover) into what
// every surface says.
//
// Six rules.
//
// THE ROLL IS THE RISK. What matters is how much of the income expires
// before the model sells, and in which year — an average cannot see a
// cliff, so the schedule is read a year at a time and the worst year named
// with its tenants.
//
// WEIGHT BY RENT, NOT BY AREA. The long leases in a building are the cheap
// ones, so a term weighted by area reads longer than the income's; the
// memorandum quotes whichever is longer (the rollover card's rule 1).
//
// A BREAK IS AN EXPIRY. A tenant that may leave on a date gives its lease
// that date: the landlord cannot make it stay and a lender will not count
// past it (rule 2), so the schedule buckets by the first date the tenant
// may go.
//
// A SHADOW ANCHOR IS NOT BOUGHT. An anchor the memorandum says is not part
// of the offering — it owns its store, or leases its own parcel from
// someone else — draws the traffic and pays the buyer nothing, and it can
// close, sell or redevelop without the buyer's say. It is named apart and
// never counted in the roll.
//
// CO-TENANCY RIDES ON THE ANCHOR. A tenant whose lease lets it pay less or
// leave when an anchor goes dark or occupancy falls carries its rent on
// someone else's decision; that rent is said as a share.
//
// THE LIST IS NOT THE BUILDING, AND A BLANK IS NULL. A memorandum lists its
// major tenants, not every lease, so every figure is said as the listed
// tenants' and the share of the building they cover is said beside it. An
// area, a rent or an end the memorandum does not state is not assumed.

import type { ExtractionResult, ExtractedTenant } from "@/lib/anthropic/types";
import { datedEnd, endLabel, type DatedEnd } from "@/lib/affordable";
import { assetClassKey } from "@/lib/asset-words";
import { buildingSfRow, parseSf } from "@/lib/criteria";
import { parsePageNumber } from "@/lib/facts";
import { parseUsd } from "@/lib/money";
import { readRollover, rollYearOf, type LeaseRow, type RollResult } from "@/lib/tools/rollover";
import { readSingleTenant } from "@/lib/single-tenant";

/** The model's hold, in years: HOLD_MONTHS (lib/underwrite/inputs) over
 *  twelve, kept here so a pipeline slot reads the roster without loading
 *  the model. A test holds the two together. */
export const ROSTER_HOLD_YEARS = 5;

/** The classes whose income is not a roster of business tenants: housing
 *  leases units, a hotel sells nights, storage rents lockers month to
 *  month, a parking deck spaces, and land nothing. */
const NO_ROSTER = new Set([
  "multifamily",
  "sfr_btr",
  "student_housing",
  "senior_housing",
  "manufactured_housing",
  "hospitality_str",
  "self_storage",
  "parking",
  "land_infill",
]);

// ── Reading one tenant ─────────────────────────────────────────────────

const clean = (s: string | null | undefined) => (s ?? "").trim();

const PER_SF = /\/\s*(?:sf|sq\.?\s*ft\.?|ft)\b|\bpsf\b|per\s+(?:sf|sq\.?\s*ft|square\s+f(?:oo|ee)t)\b/i;
const PER_MONTH = /\/\s*mo(?:nth)?\b|per\s+month|monthly/i;
const RANGE = /\d\s*[-–—]\s*\$?\d|\d\s+to\s+\$?\d/i;
const MONTH_TO_MONTH = /\bmonth[- ]to[- ]month\b|\bmtm\b|\bholdover\b/i;

/** A figure to the cent: "$12.50" is twelve dollars fifty, never thirteen
 *  (`parseUsd` rounds to the dollar, which is right for a price and wrong
 *  for a rent a foot). */
function centsOf(value: string): number | null {
  const m = value.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The year's rent, and the rent a foot, from what the memorandum states:
 *  a figure a foot, a monthly figure, or the year's. A range is two
 *  figures and reads as none. */
export function rentOf(value: string | null | undefined, sf: number | null): { annual: number | null; psf: number | null } {
  const v = clean(value);
  const none = { annual: null, psf: null };
  if (!v || RANGE.test(v)) return none;
  const monthly = PER_MONTH.test(v);
  if (PER_SF.test(v)) {
    const cents = centsOf(v);
    if (cents == null) return none;
    const psf = monthly ? cents * 12 : cents;
    return { psf, annual: sf != null ? Math.round(psf * sf) : null };
  }
  const n = parseUsd(v, 1_000);
  if (n == null) return none;
  const annual = monthly ? n * 12 : n;
  return { annual, psf: sf != null && sf > 0 ? annual / sf : null };
}

const CO_TENANCY = /\bco-?tenancy\b/i;
const GO_DARK = /\bgo(?:es|ing)?\s+dark\b|\bcease\s+operat\w*|\bnot\s+(?:required|obligated)\s+to\s+operate\b|\bno\s+(?:continuous\s+)?operating\s+covenant\b/i;
const KICK_OUT = /\bkick[- ]?out\b|\bsales\s+kick\b/i;

export interface RosterTenant {
  name: string;
  anchor: boolean;
  /** whether its space is part of the sale; "no" is a shadow anchor */
  inSale: ExtractedTenant["inSale"];
  sf: number | null;
  annualRent: number | null;
  rentPsf: number | null;
  /** the lease's end: a date as written, a year read as its FIRST day
   *  (the earliest end the year allows, never the flattering side), or
   *  month to month */
  ends: DatedEnd | null;
  monthToMonth: boolean;
  /** the first date the tenant may leave early, read the same way */
  early: DatedEnd | null;
  options: string;
  rights: string;
  coTenancy: boolean;
  goDark: boolean;
  kickOut: boolean;
  page: string;
}

function tenantOf(t: ExtractedTenant, asOf: Date, pageCount: number | null): RosterTenant | null {
  const name = clean(t.name).replace(/[;,\s]+$/, "");
  if (!name) return null;
  const sf = parseSf(clean(t.sf));
  const { annual, psf } = rentOf(t.rent, sf);
  const endText = clean(t.leaseExpiration);
  const monthToMonth = MONTH_TO_MONTH.test(endText);
  const page = clean(t.page);
  const n = parsePageNumber(page);
  const pageOk = n != null && pageCount != null && n <= pageCount ? page : "";
  const row = (value: string) => ({ label: "Lease expiration", value, page: pageOk });
  const rights = clean(t.rights);
  return {
    name,
    anchor: t.role === "anchor",
    inSale: t.inSale === "no" || t.inSale === "yes" ? t.inSale : "unknown",
    sf,
    annualRent: annual,
    rentPsf: psf,
    ends: monthToMonth || !endText ? null : datedEnd(row(endText), "first", asOf, pageCount),
    monthToMonth,
    early: clean(t.earlyTermination) ? datedEnd(row(clean(t.earlyTermination)), "first", asOf, pageCount) : null,
    options: clean(t.options),
    rights,
    coTenancy: CO_TENANCY.test(rights),
    goDark: GO_DARK.test(rights),
    kickOut: KICK_OUT.test(rights),
    page: pageOk,
  };
}

// ── The read ───────────────────────────────────────────────────────────

const WALT_ROW = /\bwalt\b|\bweighted\s+average\s+(?:remaining\s+)?lease\s+(?:term|length)\b/i;
const NOT_WALT = /\bwale\b.*income|option/i;

/** The memorandum's own quoted WALT, in years: "6.2 years", "6.2 yrs",
 *  "74 months". */
export function statedWaltYears(ex: ExtractionResult | null | undefined): { years: number; row: { label: string; value: string; page?: string } } | null {
  const rows = Array.isArray(ex?.metrics) ? ex!.metrics : [];
  const row = rows.find((m) => m && typeof m.label === "string" && WALT_ROW.test(m.label) && !NOT_WALT.test(m.label));
  if (!row || typeof row.value !== "string") return null;
  const v = row.value.replace(/,/g, "");
  const months = v.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?)\b/i);
  const years = v.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/i) ?? v.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  const n = months ? Number(months[1]) / 12 : years ? Number(years[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100 ? { years: Math.round(n * 10) / 10, row } : null;
}

/** The rows a key-terms block leads with: the memorandum's quoted WALT. */
export function rosterTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const row = metrics.find((m) => m && typeof m.label === "string" && WALT_ROW.test(m.label) && !NOT_WALT.test(m.label));
  return row ? [row] : [];
}

export interface RosterYear {
  /** 1 is the next twelve months */
  year: number;
  /** the listed rent expiring in the year, as a share of the listed rent —
   *  or of the listed area where the list states no rents */
  sharePct: number;
  /** the tenants whose leases end (or may end) in the year */
  tenants: string[];
}

export interface RosterRead {
  /** the tenants whose space is part of the sale (or not said), largest first */
  tenants: RosterTenant[];
  /** anchors the memorandum says are NOT part of the offering */
  shadow: RosterTenant[];
  listedSf: number | null;
  buildingSf: number | null;
  /** the listed area's share of the building, 0–100 */
  coveragePct: number | null;
  /** the rollover card's own read over the listed tenants with an area and
   *  an end, at the model's hold */
  roll: RollResult | null;
  /** what the roll is measured in: the rent where the list states rents,
   *  else the area */
  rollBasis: "rent" | "area";
  /** the listed rent (or area) expiring before the model's sale, 0–100 */
  rollWithinHoldPct: number | null;
  years: RosterYear[];
  worst: RosterYear | null;
  /** tenants the schedule could not place: no area, or no end */
  unplaced: string[];
  /** the largest tenant's share of the listed rent, where rents are stated */
  largest: { name: string; sharePct: number } | null;
  /** tenants holding a co-tenancy right, and their share of the listed rent
   *  (or area) */
  coTenancy: { names: string[]; sf: number | null; sharePct: number | null } | null;
  /** tenants that may go dark */
  goDark: string[];
  statedWalt: number | null;
  holdYears: number;
  /** the headline's sentences, in order: what the list covers and the roll
   *  first, so a panel can lead with them and fold the rest */
  sentences: string[];
  headline: string;
}

const listOf = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
const sfText = (n: number) => `${Math.round(n).toLocaleString("en-US")} SF`;
const pctText = (n: number) => `${Math.round(n)}%`;
const yearsNum = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** A count as a sentence opens on it: "Two tenants", never "2 tenants". */
const countWord = (n: number, capital = false) => {
  const w = n > 0 && n < 10 ? COUNT_WORDS[n] : String(n);
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
};

/**
 * The roster, on a day. Null where the memorandum lists fewer than two
 * tenants, where one tenant leases the whole property (lib/single-tenant
 * reads it), on a leased fee (the building's tenants are the leaseholder's)
 * and on a class whose income is not a roster of business tenants.
 */
export function readRoster(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): RosterRead | null {
  if (!ex || !Array.isArray(ex.tenants)) return null;
  const cls = assetClassKey(ex.assetClass);
  if (cls && NO_ROSTER.has(cls)) return null;
  if (ex.interest?.kind === "leased_fee") return null;
  if (readSingleTenant(ex, asOf)) return null;
  const pageCount = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const all = ex.tenants.map((t) => tenantOf(t, asOf, pageCount)).filter((t): t is RosterTenant => t != null);
  // Each tenant once, whatever the list repeated.
  const seen = new Set<string>();
  const unique = all.filter((t) => {
    const k = t.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const shadow = unique.filter((t) => t.inSale === "no");
  const tenants = unique
    .filter((t) => t.inSale !== "no")
    .sort((a, b) => (b.annualRent ?? 0) - (a.annualRent ?? 0) || (b.sf ?? 0) - (a.sf ?? 0));
  if (tenants.length < 2) return null;

  const sfRow = buildingSfRow(Array.isArray(ex.metrics) ? ex.metrics : []);
  const buildingSf = sfRow ? parseSf(sfRow.value) : null;
  const withSf = tenants.filter((t) => t.sf != null);
  const listedSf = withSf.length ? withSf.reduce((a, t) => a + (t.sf ?? 0), 0) : null;
  const coveragePct =
    listedSf != null && buildingSf != null && buildingSf > 0 && listedSf <= buildingSf * 1.02
      ? Math.min(100, (listedSf / buildingSf) * 100)
      : null;

  // The schedule: every listed tenant with an area and an end, bucketed by
  // the first date it may leave — counted to the DAY (lib/affordable
  // `DatedEnd.yearsToTheDay`), so a lease ending 12 months and 17 days out
  // rolls in year 2, where whole months rounded up put it in year 1, and a
  // lease ending on an anniversary rolls in the year it closes.
  const yearsFrom = (t: RosterTenant) => (t.monthToMonth ? 0 : t.ends ? t.ends.yearsToTheDay : null);
  const placed = tenants.filter((t) => t.sf != null && yearsFrom(t) != null);
  const unplaced = tenants.filter((t) => !placed.includes(t)).map((t) => t.name);
  const rows: LeaseRow[] = placed.map((t) => ({
    tenant: t.name,
    sf: t.sf!,
    rentPerSf: t.rentPsf,
    expiryYears: yearsFrom(t)!,
    breakYears: t.early ? Math.max(0, t.early.yearsToTheDay) : null,
  }));
  const roll = rows.length >= 2 ? readRollover({ rows, holdYears: ROSTER_HOLD_YEARS, buildingSf }) : null;
  const byRent = !!roll && roll.totalRent > 0 && roll.rentedLeases === roll.leaseCount;
  const rollBasis: RosterRead["rollBasis"] = byRent ? "rent" : "area";
  // Who rolls in a year by the schedule's own rule (`rollYearOf`), so the
  // names under a year are the shares in it: a break already open had been
  // listed in year 1 here and counted at its expiry there.
  const years: RosterYear[] = roll
    ? roll.years.map((y) => ({
        year: y.year,
        sharePct: byRent
          ? y.sharePct
          : roll.leasedSf > 0
            ? Math.round((y.sfExpiring / roll.leasedSf) * 1000) / 10
            : 0,
        tenants: rows.filter((r) => rollYearOf(r) === y.year).map((r) => r.tenant),
      }))
    : [];
  const rollWithinHoldPct = roll ? Math.round(years.reduce((a, y) => a + y.sharePct, 0) * 10) / 10 : null;
  const worst = years.reduce<RosterYear | null>((best, y) => (y.sharePct > 0 && (!best || y.sharePct > best.sharePct) ? y : best), null);

  const rented = tenants.filter((t) => t.annualRent != null);
  const listedRent = rented.reduce((a, t) => a + (t.annualRent ?? 0), 0);
  const top = rented[0] ?? null;
  const largest =
    top && listedRent > 0 && rented.length === tenants.length
      ? { name: top.name, sharePct: Math.round((top.annualRent! / listedRent) * 1000) / 10 }
      : null;

  const co = tenants.filter((t) => t.coTenancy);
  const coSf = co.every((t) => t.sf != null) && co.length ? co.reduce((a, t) => a + (t.sf ?? 0), 0) : null;
  const coShare =
    co.length && largest && co.every((t) => t.annualRent != null)
      ? Math.round((co.reduce((a, t) => a + (t.annualRent ?? 0), 0) / listedRent) * 1000) / 10
      : co.length && coSf != null && listedSf
        ? Math.round((coSf / listedSf) * 1000) / 10
        : null;
  const coTenancy = co.length ? { names: co.map((t) => t.name), sf: coSf, sharePct: coShare } : null;

  const stated = statedWaltYears(ex);
  const read: Omit<RosterRead, "headline" | "sentences"> = {
    tenants,
    shadow,
    listedSf,
    buildingSf,
    coveragePct,
    roll,
    rollBasis,
    rollWithinHoldPct,
    years,
    worst,
    unplaced,
    largest,
    coTenancy,
    goDark: tenants.filter((t) => t.goDark).map((t) => t.name),
    statedWalt: stated?.years ?? null,
    holdYears: ROSTER_HOLD_YEARS,
  };
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

// ── Saying it ──────────────────────────────────────────────────────────

function coverageSentence(r: Omit<RosterRead, "headline" | "sentences">): string {
  const n = r.tenants.length;
  if (r.listedSf != null && r.coveragePct != null && r.buildingSf != null) {
    return `The memorandum lists ${countWord(n)} tenants on ${sfText(r.listedSf)}, ${pctText(r.coveragePct)} of the building's ${sfText(r.buildingSf)}; every figure here is theirs.`;
  }
  if (r.listedSf != null) return `The memorandum lists ${countWord(n)} tenants on ${sfText(r.listedSf)}; every figure here is theirs.`;
  return `The memorandum lists ${countWord(n)} tenants; every figure here is theirs.`;
}

function rollSentence(r: Omit<RosterRead, "headline" | "sentences">): string {
  if (r.rollWithinHoldPct == null) return "";
  const of = r.rollBasis === "rent" ? "their rent" : "their space";
  if (r.rollWithinHoldPct <= 0) {
    return `None of ${of} expires before the model's sale in year ${r.holdYears}.`;
  }
  const worst =
    r.worst && r.worst.tenants.length
      ? ` — the most in year ${r.worst.year}, when ${listOf(r.worst.tenants)} ${r.worst.tenants.length === 1 ? "rolls" : "roll"} (${pctText(r.worst.sharePct)})`
      : "";
  return `Of ${of}, ${pctText(r.rollWithinHoldPct)} expires before the model's sale in year ${r.holdYears}${worst}.`;
}

function waltSentence(r: Omit<RosterRead, "headline" | "sentences">): string {
  const roll = r.roll;
  if (!roll) return "";
  const byRent = r.rollBasis === "rent" ? roll.waltByRent : null;
  if (r.statedWalt != null && byRent != null && r.statedWalt - byRent >= 0.5) {
    return `The memorandum quotes a WALT of ${yearsNum(r.statedWalt)} years; weighted by rent, the leases it lists run ${yearsNum(byRent)} years.`;
  }
  if (byRent != null && roll.waltByArea != null && roll.waltByArea - byRent >= 0.5) {
    return `Weighted by rent the listed leases run ${yearsNum(byRent)} years, by area ${yearsNum(roll.waltByArea)}: the long leases are the cheap ones.`;
  }
  return "";
}

function breakSentence(r: Omit<RosterRead, "headline" | "sentences">): string {
  const roll = r.roll;
  if (!roll || roll.breakGivesUpYears == null || roll.waltToBreak == null || roll.breakGivesUpYears < 0.3) return "";
  return `Early termination rights take ${yearsNum(roll.breakGivesUpYears)} years off that: to the first date each tenant may leave, ${yearsNum(roll.waltToBreak)} years.`;
}

function shadowSentence(r: Omit<RosterRead, "headline" | "sentences">): string {
  if (!r.shadow.length) return "";
  const names = r.shadow.map((t) => t.name);
  const one = names.length === 1;
  return `${listOf(names)} ${one ? "anchors" : "anchor"} the property but ${one ? "is" : "are"} not part of the offering, as stated: the buyer buys the traffic ${one ? "it draws" : "they draw"}, not ${one ? "its" : "their"} rent, and ${one ? "it" : "each"} can close, sell or redevelop without the buyer's say.`;
}

function coTenancySentence(r: Omit<RosterRead, "headline" | "sentences">): string {
  const c = r.coTenancy;
  if (!c) return "";
  const n = c.names.length;
  const share = c.sharePct != null ? ` (${pctText(c.sharePct)} of the listed ${r.rollBasis === "rent" && r.largest ? "rent" : "space"})` : "";
  const who = n === 1 ? `${c.names[0]}'s lease carries a co-tenancy right` : `${countWord(n, true)} tenants' leases carry co-tenancy rights`;
  return `${who}${share}, as stated: if an anchor goes dark or occupancy falls, ${n === 1 ? "it" : "they"} may pay less or leave.`;
}

function goDarkSentence(r: Omit<RosterRead, "headline" | "sentences">): string {
  if (!r.goDark.length) return "";
  const one = r.goDark.length === 1;
  return `${listOf(r.goDark)} may go dark, as stated: ${one ? "it" : "each"} can close and keep paying, leaving an empty box and every co-tenancy clause tied to it.`;
}

function sentencesOf(r: Omit<RosterRead, "headline" | "sentences">): string[] {
  const parts = [coverageSentence(r), rollSentence(r), waltSentence(r), breakSentence(r)];
  if (r.largest && r.largest.sharePct >= 20) {
    parts.push(`The largest, ${r.largest.name}, pays ${pctText(r.largest.sharePct)} of the listed rent.`);
  }
  parts.push(shadowSentence(r), coTenancySentence(r), goDarkSentence(r));
  if (r.unplaced.length) {
    const n = r.unplaced.length;
    parts.push(`${n === 1 ? `${r.unplaced[0]} states` : `${countWord(n, true)} of the listed tenants state`} no area or no lease end, so ${n === 1 ? "it is" : "they are"} not in the schedule.`);
  }
  return parts.filter(Boolean);
}

export interface RosterModel {
  holdMonths: number;
  /** the model's tenant improvements a foot, and its commissions as a share
   *  of rent (decimals): both placeholders of zero unless set */
  tiPsf: number;
  lcPct: number;
  /** the model's vacancy, a decimal */
  vacancyPct: number;
}

/** What the model does not carry for the roll: its leasing capital is a
 *  placeholder of zero, and its vacancy is flat through the roll. "" where
 *  nothing rolls before the sale. */
export function rosterModelLine(r: RosterRead, m: RosterModel): string {
  if (r.rollWithinHoldPct == null || r.rollWithinHoldPct <= 0) return "";
  const of = r.rollBasis === "rent" ? "the listed rent" : "the listed space";
  const holdYears = Math.round(m.holdMonths / 12);
  const capital =
    m.tiPsf === 0 && m.lcPct === 0
      ? `The model carries no leasing capital — its tenant improvements and commissions are placeholders of zero — while ${pctText(r.rollWithinHoldPct)} of ${of} expires before its sale in year ${holdYears}: re-leasing that space is in none of its returns. Enter a TI and a commission a foot, or price the roll on the rollover card.`
      : `${pctText(r.rollWithinHoldPct)} of ${of} expires before the model's sale in year ${holdYears}.`;
  const big = r.worst && r.worst.sharePct >= 25 ? ` Its vacancy stays at ${pctText(m.vacancyPct * 100)} through year ${r.worst.year}, when ${pctText(r.worst.sharePct)} rolls at once.` : "";
  return `${capital}${big}`;
}

/** The pipeline row's tag: "Shadow-anchored", "46% rolls in 5 yrs", or both. */
export function rosterTag(ex: ExtractionResult | null | undefined, asOf: Date = new Date()): string | null {
  const r = readRoster(ex, asOf);
  if (!r) return null;
  const roll = r.rollWithinHoldPct != null && r.rollWithinHoldPct >= 20 ? `${pctText(r.rollWithinHoldPct)} rolls in ${r.holdYears} yrs` : "";
  const shadow = r.shadow.length ? "Shadow-anchored" : "";
  return [shadow, roll].filter(Boolean).join(", ") || null;
}

/** The roster in one line, for the memo under its title, the workbook's
 *  cover and the report. */
export function rosterShortLine(r: RosterRead): string {
  const parts: string[] = [];
  parts.push(
    r.coveragePct != null
      ? `${countWord(r.tenants.length, true)} tenants listed on ${pctText(r.coveragePct)} of the building`
      : `${countWord(r.tenants.length, true)} tenants listed`,
  );
  if (r.rollWithinHoldPct != null) {
    const of = r.rollBasis === "rent" ? "rent" : "space";
    parts.push(
      r.rollWithinHoldPct > 0
        ? `${pctText(r.rollWithinHoldPct)} of their ${of} expires before year ${r.holdYears}${r.worst ? `, the most in year ${r.worst.year}` : ""}`
        : `none of their ${of} expires before year ${r.holdYears}`,
    );
  }
  if (r.largest && r.largest.sharePct >= 20) parts.push(`${r.largest.name} pays ${pctText(r.largest.sharePct)} of the listed rent`);
  if (r.shadow.length) parts.push(`${listOf(r.shadow.map((t) => t.name))} ${r.shadow.length === 1 ? "anchors" : "anchor"} it from outside the sale`);
  if (r.coTenancy) parts.push(r.coTenancy.names.length === 1 ? "one tenant holds a co-tenancy right" : `${countWord(r.coTenancy.names.length)} tenants hold co-tenancy rights`);
  return parts.join("; ");
}

/** The roster as the steps that read the memorandum after the extraction
 *  see it (lib/deal-context). */
export function rosterContextLine(r: RosterRead): string {
  const each = r.tenants
    .slice(0, 8)
    .map((t) => {
      const bits = [
        t.anchor ? "anchor" : "",
        t.sf != null ? sfText(t.sf) : "",
        t.annualRent != null ? `$${Math.round(t.annualRent).toLocaleString("en-US")} a year` : "",
        t.monthToMonth ? "month to month" : t.ends ? `ends ${endLabel(t.ends)}` : "",
        t.early ? `may leave ${endLabel(t.early)}` : "",
      ].filter(Boolean);
      return `${t.name}${bits.length ? ` (${bits.join(", ")})` : ""}`;
    })
    .join("; ");
  return `The tenants: ${r.headline} As listed: ${each}.`;
}

/** The roster's traps by name, for the assumption review. */
export function rosterNote(r: RosterRead): string {
  const traps: string[] = [
    `(a) THE ROLL — name which listed tenants expire in which years before the sale, and treat a pro forma that renews them all at higher rents as a story${r.worst ? `; year ${r.worst.year} carries ${pctText(r.worst.sharePct)}` : ""}`,
    "(b) THE WALT — ask which way the memorandum weights it: by area it reads longer than the income's, and the rent-weighted term is the one to bid on",
    "(c) THE BREAKS — an early termination or kick-out right is the lease's end for a lender; count the term to it",
    "(d) THE RE-LEASING COST — tenant improvements, commissions, free rent and downtime at today's packages, carried below the NOI in the year each space rolls",
    "(e) CONCENTRATION — the largest tenants' credit, and what their space re-lets for if they leave",
    "(f) THE LIST IS NOT THE BUILDING — ask for the full rent roll: the tenants a memorandum leaves off its summary are the small ones rolling soonest",
  ];
  if (r.shadow.length) {
    traps.push(`(g) THE SHADOW ANCHOR — ${listOf(r.shadow.map((t) => t.name))} ${r.shadow.length === 1 ? "is" : "are"} not bought: check what ${r.shadow.length === 1 ? "its" : "their"} leases or deeds let ${r.shadow.length === 1 ? "it" : "them"} do, whether a reciprocal easement agreement binds ${r.shadow.length === 1 ? "it" : "them"} to operate, and which inline leases name ${r.shadow.length === 1 ? "it" : "them"} in a co-tenancy clause`);
  }
  if (r.coTenancy || r.goDark.length) {
    traps.push(`(${r.shadow.length ? "h" : "g"}) CO-TENANCY AND GO-DARK — read each clause: what triggers it, what the tenant may do (pay a percentage rent, pay less, leave) and for how long; a dark anchor that keeps paying still triggers it`);
  }
  return `${rosterContextLine(r)}\n\nMULTI-TENANT TRAPS, checked by name against the facts above: ${traps.join("; ")}.`;
}

