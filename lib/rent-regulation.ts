// Rent regulation, read into the screen (research pass 28, round 1).
//
// The rules panel on the deal page has long said which rent regimes reach a
// building (lib/research `evaluateRules`), but nothing the screen hands a
// reader did: the deal context, the challenger, the model's read, the memo
// and the pipeline row all treated a rent-stabilized Brooklyn walk-up as a
// market-rate building whose every rent grows at the model's one rate. This
// reads the same rules for the deal, the allowance each regime publishes for
// a dated period (data/research/rent_allowances.json, filed only as a primary
// source printed it), and what the memorandum states — its regulated units,
// the regime it names, its legal and preferential rents — into one read
// every surface draws.
//
// PURE. Six rules:
//   1. THE RULE IS THE FILE'S. A regime is said only where a rule the site
//      holds applies or possibly applies, in that rule's terms; a "possibly"
//      names its open questions. A regime the memorandum names that no rule
//      reaches here is said as the memorandum's claim.
//   2. THE ALLOWANCE IS DATED. It is read only from a period that holds the
//      day; past its end it is said to have ended and to need checking,
//      never carried forward, and a period not yet begun is said as next.
//   3. THE MEMORANDUM'S COUNT IS THE SHARE. Regulated units over the unit
//      count, as stated; no count, no share. A building's age decides
//      coverage questions, never how many units are regulated.
//   4. LOSS TO LEASE ON A REGULATED UNIT IS NOT UPSIDE: the gap to market is
//      the regulation's cost (lib/affordable's rule), and a renovation premium
//      on a regulated unit is the regime's recovery, never the market's.
//   5. THE MODEL'S ONE GROWTH RATE IS THE MARKET'S. It is set beside the
//      allowance and never changed (growing regulated units at the allowance
//      is model math, and the owner's call).
//   6. A BLANK IS NULL. No state, no rule read; a unit count not stated is no
//      share; an allowance not filed is said as not filed, never as none.

import type { ExtractionResult } from "@/lib/anthropic/types";
import table from "@/data/research/rent_allowances.json";
import { evaluateRules, jurisdictionOf, OPEN_QUESTION_LABELS, type RegulatoryRule, type RuleEvaluation } from "@/lib/research";
import { buildSubject, seedRules } from "@/lib/research-data";
import { assetClassKey, assetWords, countNoun } from "@/lib/asset-words";
import { shownAssetClass } from "@/lib/asset-class";
import { answeredSiteFlags, type SiteFlagsResult } from "@/lib/site-flags/core";
import { parseCount, unitCountFromMetrics, unitCountRow } from "@/lib/criteria";

// ── The file ─────────────────────────────────────────────────────────────

export interface AllowanceFigure {
  /** what the figure is for, as the source words it: "a one-year lease" */
  label: string;
  /** the allowance, a percent as published (9.683, never rounded) */
  pct: number;
}

export interface RentAllowance {
  rule_id: string;
  /** whose figure it is: "the Rent Guidelines Board's Apartment/Loft Order #58" */
  order: string;
  /** what the period counts: "leases commencing", "increases taking effect" */
  applies_to: string;
  period_start: string;
  period_end: string;
  figures: AllowanceFigure[];
  source: string;
  as_of: string;
  read: string;
}

interface RegimeName {
  name: string;
  short: string;
}

const FILE = table as unknown as {
  regimes: Record<string, RegimeName>;
  noRegime: string[];
  allowances: RentAllowance[];
};

/** Every rule that regulates rent, by id, with what a page calls it — in
 *  the order a page lists them: a city's own regime before a county's, a
 *  county's before a state's cap. */
export const REGIMES: Readonly<Record<string, RegimeName>> = FILE.regimes;

/** The rent rules that say a place has none: a state's preemption or ban. */
export const NO_REGIME: readonly string[] = FILE.noRegime;

/** Every filed allowance, as the file holds them. */
export const ALLOWANCES: readonly RentAllowance[] = FILE.allowances;

const REGIME_ORDER = Object.keys(REGIMES);

// ── The allowance on a day ───────────────────────────────────────────────

export type AllowanceState = "current" | "ended" | "upcoming";

export interface AllowanceRead extends RentAllowance {
  state: AllowanceState;
  /** the period filed after a current one, where the source has published it */
  next: RentAllowance | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A regime's allowance on a day: the filed period that holds it; else the
 * last one that has ended (said as ended, and as needing checking); else
 * the first one not yet begun. Null where none is filed. ISO days compare as
 * strings.
 */
export function allowanceOn(ruleId: string, today: string): AllowanceRead | null {
  if (!ISO_DAY.test(today)) return null;
  const mine = ALLOWANCES.filter((a) => a.rule_id === ruleId).sort((a, b) =>
    a.period_start < b.period_start ? -1 : a.period_start > b.period_start ? 1 : 0,
  );
  if (mine.length === 0) return null;
  const at = mine.findIndex((a) => a.period_start <= today && today <= a.period_end);
  if (at >= 0) return { ...mine[at], state: "current", next: mine[at + 1] ?? null };
  const ended = mine.filter((a) => a.period_end < today);
  if (ended.length) return { ...ended[ended.length - 1], state: "ended", next: null };
  return { ...mine[0], state: "upcoming", next: null };
}

// ── The memorandum's rows ────────────────────────────────────────────────

type MetricRow = { label: string; value: string; page?: string };

/** A row with a label and a value to read — analysis output can carry nulls
 *  and odd shapes, which every other reader drops the same way. */
const isRow = (m: unknown): m is MetricRow =>
  !!m && typeof m === "object" && typeof (m as MetricRow).label === "string" && typeof (m as MetricRow).value === "string";

const rowOf = (metrics: readonly MetricRow[], re: RegExp, not?: RegExp) =>
  metrics.find((m) => re.test(m.label) && !(not && not.test(m.label))) ?? null;

/** The regime as the memorandum names it: "Rent regulation", "Rent
 *  stabilization", "Rent control" — never a row about units or rents. */
export const REGIME_ROW = /^\s*rent\s+(?:regulation|stabili[sz]ation|control)\s*$/i;
/** How many units the regime covers, as stated: "Rent-regulated units",
 *  "Rent-stabilized units", "Rent-controlled units". Never an affordable
 *  program's restricted units (lib/affordable reads those). */
export const UNITS_ROW =
  /^\s*(?:total\s+|number of\s+)?rent[- ](?:regulated|stabili[sz]ed|controlled)\s+(?:units?|apartments?|homes?)\s*$/i;
/** The legal regulated rent, as stated (a registered rent, not a market one). */
export const LEGAL_RENT_ROW = /^\s*(?:average\s+)?legal\s+(?:regulated\s+)?rents?\b/i;
/** A preferential rent, as stated: a rent charged below the legal one. */
export const PREFERENTIAL_RENT_ROW = /^\s*(?:average\s+)?preferential\s+rents?\b/i;

const NOT_A_COUNT = /%|percent|\bshare\b|\$|expir|\bdate\b/i;

/** A row whose words state none — "None", "No rent control", "N/A",
 *  "Not subject to rent control", "Exempt", "Market rate", "Non-regulated",
 *  "Deregulated", a dash — names no regime and no regulated rent: a park
 *  memorandum's "Rent control: None" (the row lib/manufactured-housing reads
 *  as not regulated) is a stated none, never the memorandum's claim of a
 *  regime, and "Legal regulated rent: N/A" is no legal rent. Read only from
 *  the start of the words, so "Rent stabilization (12 units exempt)" still
 *  names one. */
const STATES_NONE =
  /^\s*(?:none|no|n\/?a|nil|unknown|tbd|[-–—]|exempt|unregulated|non[- ]?regulated|deregulated|destabili[sz]ed|free[- ]market|market(?:[- ]rate)?|not\s+(?:applicable|stated|provided|available|disclosed|subject|regulated|covered|rent[- ](?:controlled|stabili[sz]ed|regulated)))(?![\w-])/i;

/** A regime row that says yes and names no regime — "Yes", "Yes — city
 *  caps lot rent at CPI": the building is regulated, as the memorandum
 *  states, and "Yes" is never the regime's name (the audit of 2026-10-05:
 *  "The memorandum states the building is under Yes"). */
const STATES_YES = /^\s*yes(?![\w-])/i;

/** The regulation's rows, in the order a key-terms block leads with them
 *  after the unit count — each only where the memorandum states it. */
export function regulationTermRows<M extends MetricRow>(rows: ReadonlyArray<M>): M[] {
  const metrics = rows.filter((m): m is M => isRow(m));
  return [
    rowOf(metrics, REGIME_ROW),
    rowOf(metrics, UNITS_ROW, NOT_A_COUNT),
    rowOf(metrics, LEGAL_RENT_ROW),
    rowOf(metrics, PREFERENTIAL_RENT_ROW),
  ].filter((m): m is M => m != null) as M[];
}

// ── The read ─────────────────────────────────────────────────────────────

export interface RegimeRead {
  ruleId: string;
  /** "NYC rent stabilization" */
  name: string;
  /** "Rent-stabilized" — the pipeline's tag */
  short: string;
  outcome: "applies" | "possibly_applies";
  /** the open questions behind a "possibly", in words */
  unknowns: string[];
  /** a rule the site has not verified (`unverifiedRule`): read as possibly
   *  applying, never as applying, and marked so as the rules panel marks it */
  unverified: boolean;
  allowance: AllowanceRead | null;
  /** the rule's own source and the day it was read */
  source: string | null;
  asOf: string;
}

export interface RegulationRead {
  /** the regimes the site's rules say reach the building, applying first */
  regimes: RegimeRead[];
  /** the regime as the memorandum names it, as stated */
  stated: string | null;
  /** the regime row's words where they say the building is regulated and
   *  name no regime ("Yes", "Yes — city caps lot rent at CPI") */
  statedYes: string | null;
  regulatedUnits: number | null;
  totalUnits: number | null;
  /** regulated over the count, where both are stated and agree */
  sharePct: number | null;
  /** the regulated count is larger than the building's: no share is read */
  countsDisagree: boolean;
  noun: { one: string; many: string };
  legalRent: string | null;
  preferentialRent: string | null;
  /** the memorandum names a regime, and no rule the site holds reaches here */
  claimOnly: boolean;
  /** the read in one paragraph, for the panel and the deal context */
  headline: string;
}

export interface RegulationInput {
  address: { state?: string; city?: string; county?: string; submarket?: string } | null;
  /** the Census geocoder's place and county for the building, where looked up */
  census?: { place?: { name: string } | null; county?: { name: string } | null } | null;
  /** the deal's class key (lib/asset-words), or null where nothing is read */
  classKey: string | null;
  /** the rules to read (the database's merged with the file's); the file's
   *  own where not given */
  rules?: RegulatoryRule[];
}

const YEAR_BUILT_ROW = /\byear built\b/i;

function yearBuiltOf(metrics: readonly MetricRow[]): number | null {
  const raw = rowOf(metrics, YEAR_BUILT_ROW)?.value.match(/\b(1[7-9]\d{2}|20\d{2})\b/)?.[1];
  return raw ? Number(raw) : null;
}

/** "Oct 1, 2026" — a period's end as a page says it. */
export function dayText(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(at)) return iso;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "4.1%", "0%", "9.683%" — as published. */
export function pctText(n: number): string {
  return `${Number.isInteger(n) ? n : Number(n.toFixed(3))}%`;
}

const count = (n: number) => n.toLocaleString("en-US");

const sharePctText = (n: number) => `${n >= 100 ? 100 : n <= 0 ? 0 : Math.min(99, Math.max(1, Math.round(n)))}%`;

const periodText = (a: Pick<RentAllowance, "period_start" | "period_end">) =>
  `${dayText(a.period_start)} to ${dayText(a.period_end)}`;
const figuresText = (a: Pick<RentAllowance, "figures">) =>
  a.figures.map((f) => `${pctText(f.pct)} on ${f.label}`).join(" and ");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Under NYC rent stabilization, the allowance for leases commencing Oct 1,
 *  2026 to Sep 30, 2027 is 0% on a one-year lease and 0% on a two-year lease
 *  (the Rent Guidelines Board's Apartment/Loft Order #58)." — the allowance,
 *  said with its period and whose it is; ended, said as ended; not yet
 *  begun, said as next. */
export function allowanceSentence(name: string, a: AllowanceRead): string {
  if (a.state === "ended") {
    return `Under ${name}, the last allowance filed, for ${a.applies_to} ${periodText(a)} (${figuresText(a)}, ${a.order}), has ended; the figure in force now needs checking.`;
  }
  if (a.state === "upcoming") {
    return `Under ${name}, the next allowance is filed for ${a.applies_to} ${periodText(a)} (${figuresText(a)}, ${a.order}); none is filed for today.`;
  }
  const next = a.next ? ` The next, for ${a.next.applies_to} ${periodText(a.next)}, is ${figuresText(a.next)}.` : "";
  return `Under ${name}, the allowance for ${a.applies_to} ${periodText(a)} is ${figuresText(a)} (${a.order}).${next}`;
}

/** A rule the site has not verified — its research found nothing to cite
 *  ("unverified_not_found"), or it carries no source. New Jersey's municipal
 *  rule says itself that every municipality but the two screened by their
 *  own rules is unscreened ("rules unknown, check the ordinance before
 *  offer"), and had been read as applying to every rental building in the
 *  state (the audit of 2026-10-05). */
export const unverifiedRule = (rule: Pick<RegulatoryRule, "status" | "source">): boolean =>
  rule.status === "unverified_not_found" || !rule.source;

/** The open question an unverified rule carries: its own caution. */
export const UNVERIFIED_OPEN = "whether one reaches this address, which the site's rule has not verified — check the ordinance before an offer";

function regimeClause(r: RegimeRead): string {
  if (r.outcome === "applies") return `${r.name} applies by the site's rules`;
  const open = r.unknowns.length ? ` (open: ${r.unknowns.join("; ")})` : "";
  return `${r.name} possibly applies${open}`;
}

/**
 * The deal's rent regulation: the regimes the site's rules say reach it,
 * each with its allowance on the day, beside what the memorandum states.
 * Null where no regime reaches the building and the memorandum names none —
 * and on a class that is not rental housing, unless the memorandum names a
 * regime (a building filed as an office says nothing of rent rules).
 */
export function readRegulation(
  ex: ExtractionResult | null | undefined,
  input: RegulationInput,
  today: string,
): RegulationRead | null {
  if (!ex) return null;
  const metrics = (Array.isArray(ex.metrics) ? (ex.metrics as unknown[]) : []).filter(isRow);
  // A rent row that states none is no rent and no claim (the audit of
  // 2026-10-05: "Legal regulated rent: N/A" had made Austin's apartments
  // "Rent-regulated (OM)").
  const statesSome = (r: MetricRow | null) => (r && r.value.trim() !== "" && !STATES_NONE.test(r.value.trim()) ? r : null);
  const statedRow = rowOf(metrics, REGIME_ROW);
  const unitsRow = rowOf(metrics, UNITS_ROW, NOT_A_COUNT);
  const legalRow = statesSome(rowOf(metrics, LEGAL_RENT_ROW));
  const preferentialRow = statesSome(rowOf(metrics, PREFERENTIAL_RENT_ROW));
  const statedWords = statedRow?.value.trim() ?? "";
  const statedYes = statedWords && STATES_YES.test(statedWords) ? statedWords : null;
  const stated = statedWords && !STATES_NONE.test(statedWords) && !statedYes ? statedWords : null;
  const regulatedUnits = unitsRow ? parseCount(unitsRow.value) : null;
  const totalUnits = unitCountFromMetrics(metrics);
  const memoSays = stated != null || statedYes != null || regulatedUnits != null || legalRow != null || preferentialRow != null;

  const residential = input.classKey ? assetWords(input.classKey).residential : undefined;
  let regimes: RegimeRead[] = [];
  if (input.address?.state && residential !== false) {
    const subject = buildSubject({
      address: input.address,
      census: input.census ?? null,
      sizeText: totalUnits != null ? `${totalUnits} units` : null,
      yearBuilt: yearBuiltOf(metrics),
      residential,
      today,
    });
    const evals: RuleEvaluation[] = evaluateRules(input.rules ?? seedRules(), subject);
    // Where a regime of the deal's own place holds it (Newark's, Jersey
    // City's), that place is screened by its own rule: a statewide rule the
    // site has not verified is not read beside it.
    const ownPlace = evals.some((e) => Object.hasOwn(REGIMES, e.rule.id) && !!e.rule.jurisdiction_local && jurisdictionOf(e.rule, subject) === "yes");
    regimes = evals
      .filter((e) => Object.hasOwn(REGIMES, e.rule.id) && (e.outcome === "applies" || e.outcome === "possibly_applies"))
      .filter((e) => !(ownPlace && !e.rule.jurisdiction_local && unverifiedRule(e.rule)))
      .map((e): RegimeRead => {
        const unverified = unverifiedRule(e.rule);
        const open = e.unknowns.map((k) => OPEN_QUESTION_LABELS[k] ?? k.replace(/_/g, " "));
        return {
          ruleId: e.rule.id,
          name: REGIMES[e.rule.id].name,
          short: REGIMES[e.rule.id].short,
          // An unverified rule possibly applies, never applies.
          outcome: unverified ? "possibly_applies" : (e.outcome as "applies" | "possibly_applies"),
          unknowns: [...new Set(unverified ? [UNVERIFIED_OPEN, ...open] : open)],
          unverified,
          allowance: allowanceOn(e.rule.id, today),
          source: e.rule.source ?? null,
          asOf: e.rule.as_of,
        };
      })
      .sort(
        (a, b) =>
          (a.outcome === "applies" ? 0 : 1) - (b.outcome === "applies" ? 0 : 1) ||
          REGIME_ORDER.indexOf(a.ruleId) - REGIME_ORDER.indexOf(b.ruleId),
      );
  }
  if (regimes.length === 0 && !memoSays) return null;

  const countsDisagree = regulatedUnits != null && totalUnits != null && regulatedUnits > totalUnits;
  const sharePct =
    regulatedUnits != null && totalUnits != null && totalUnits > 0 && !countsDisagree ? (regulatedUnits / totalUnits) * 100 : null;
  const many = countNoun(unitCountRow(metrics)?.label ?? unitsRow?.label, input.classKey);
  const noun = { many, one: many.replace(/s$/, "") };
  const claimOnly = regimes.length === 0 && memoSays;

  // A yes with words after it keeps them, quoted; a bare yes says nothing more.
  const yesWords = statedYes && !/^\s*yes\s*[.!]?\s*$/i.test(statedYes) ? ` ("${statedYes.replace(/\.$/, "")}")` : "";
  const parts: string[] = [];
  if (regimes.length) {
    parts.push(`${capital(regimes.map(regimeClause).join("; "))}.`);
  } else {
    parts.push(
      `The memorandum states ${
        stated ? `the building is under ${stated.replace(/\.$/, "")}` : statedYes ? `the building is rent-regulated${yesWords}` : "regulated rents"
      }; no rent rule the site holds reaches this address, so that is the memorandum's claim.`,
    );
  }
  if (regulatedUnits != null) {
    parts.push(
      totalUnits != null && sharePct != null
        ? `The memorandum states ${count(regulatedUnits)} of the ${count(totalUnits)} ${noun.many} are rent-regulated (${sharePctText(sharePct)}).`
        : countsDisagree
          ? `The memorandum states ${count(regulatedUnits)} rent-regulated ${noun.many}, more than the ${count(totalUnits!)} it counts in the building; no share is read.`
          : `The memorandum states ${count(regulatedUnits)} rent-regulated ${regulatedUnits === 1 ? noun.one : noun.many}.`,
    );
  } else if (regimes.length) {
    parts.push(`The memorandum states no count of regulated ${noun.many}, so no share of the building is read.`);
  }
  if (stated && regimes.length) parts.push(`It names the regime as ${stated.replace(/\.$/, "")}.`);
  if (statedYes && regimes.length) parts.push(`It states the building is rent-regulated${yesWords} without naming the regime.`);
  for (const r of regimes) {
    if (r.allowance) parts.push(allowanceSentence(r.name, r.allowance));
  }
  if (legalRow) parts.push(`Legal regulated rent as stated: ${legalRow.value.trim()}.`);
  if (preferentialRow) parts.push(`Preferential rent as stated: ${preferentialRow.value.trim()}.`);

  return {
    regimes,
    stated,
    statedYes,
    regulatedUnits,
    totalUnits,
    sharePct,
    countsDisagree,
    noun,
    legalRent: legalRow?.value.trim() || null,
    preferentialRent: preferentialRow?.value.trim() || null,
    claimOnly,
    headline: parts.join(" "),
  };
}

/** A deal as every surface holds it: its row's extraction, address, stored
 *  site flags and filed class. */
export interface DealForRegulation {
  extraction: ExtractionResult | null | undefined;
  address: { state?: string; city?: string; county?: string; submarket?: string; label?: string } | null;
  /** deals.site_flags: the Census place and county are read from a lookup
   *  answered for the address the deal has now (`answeredSiteFlags`) */
  siteFlags?: SiteFlagsResult | null;
  /** deals.asset_class, the analyst's class where they filed one */
  assetClass?: string | null;
}

/**
 * The read for a deal row — the one call every surface makes, so the deal
 * page, the pipeline, the documents and the screen read one regulation for
 * one deal: the class the deck turned out to be where the analyst left it
 * Auto (lib/asset-class `shownAssetClass`), and the Census place and county
 * only from flags answered for the deal's current address.
 */
export function regulationForDeal(d: DealForRegulation, today: string, rules?: RegulatoryRule[]): RegulationRead | null {
  const flags = answeredSiteFlags(d.siteFlags ?? null, d.address?.label ?? null);
  const census = flags && flags.status === "ok" && flags.place !== undefined ? { place: flags.place, county: flags.county ?? null } : null;
  const classKey = assetClassKey(shownAssetClass(d.assetClass ?? null, d.extraction ?? null));
  return readRegulation(d.extraction, { address: d.address, census, classKey, rules }, today);
}

// ── What each surface says ───────────────────────────────────────────────

/** The lowest current figure a regime allows, with its label — the one the
 *  model's growth is set against. */
function lowestCurrent(r: RegulationRead): { regime: RegimeRead; figure: AllowanceFigure } | null {
  for (const regime of r.regimes) {
    const a = regime.allowance;
    if (!a || a.state !== "current" || a.figures.length === 0) continue;
    const figure = a.figures.reduce((lo, f) => (f.pct < lo.pct ? f : lo));
    return { regime, figure };
  }
  return null;
}

/**
 * The pipeline row's tag — "Rent-stabilized, 41 of 48", "LA RSO, 3% cap",
 * "Rent rules: check", "Rent-regulated (OM)" — beside the price, where a scan
 * of the pipeline sees which buildings' rents a regime sets. Null where none.
 */
export function regulationTag(r: RegulationRead | null): string | null {
  if (!r) return null;
  if (r.claimOnly) return "Rent-regulated (OM)";
  const lead = r.regimes[0];
  if (!lead) return null;
  if (lead.outcome !== "applies") return "Rent rules: check";
  if (r.regulatedUnits != null && r.totalUnits != null && !r.countsDisagree) {
    return `${lead.short}, ${count(r.regulatedUnits)} of ${count(r.totalUnits)}`;
  }
  const low = lead.allowance?.state === "current" ? lead.allowance.figures.reduce((lo, f) => (f.pct < lo.pct ? f : lo)) : null;
  return low ? `${lead.short}, ${pctText(low.pct)} cap` : lead.short;
}

/** The regulation in one line, for the documents with no room for the panel
 *  — the memo under its title, the workbook's cover, the shared screen. */
export function regulationShortLine(r: RegulationRead): string {
  const bits: string[] = [];
  if (r.claimOnly) {
    bits.push(`the memorandum states ${r.stated ? r.stated.replace(/\.$/, "") : "regulated rents"}, which no rule the site holds reaches here`);
  } else {
    bits.push(r.regimes.map((g) => (g.outcome === "applies" ? `${g.name} applies` : `${g.name} possibly applies`)).join("; "));
  }
  if (r.regulatedUnits != null && r.totalUnits != null && r.sharePct != null) {
    bits.push(`${count(r.regulatedUnits)} of the ${count(r.totalUnits)} ${r.noun.many} rent-regulated as stated (${sharePctText(r.sharePct)})`);
  }
  const low = lowestCurrent(r);
  if (low) {
    const a = low.regime.allowance!;
    bits.push(`${pctText(low.figure.pct)} on ${low.figure.label} for ${a.applies_to} ${periodText(a)}`);
  }
  return `Rent regulation: ${capital(bits.join("; "))}`;
}

/** The deal context's line, for every step that reads the OM after the
 *  extraction. */
export function regulationContextLine(r: RegulationRead): string {
  return `Rent regulation: ${r.headline}`;
}

/**
 * The model's read (`meta.regulation`): its one growth rate set beside the
 * allowance, never changed. Null where no regime reaches the building.
 */
export function regulationModelLine(r: RegulationRead | null, rentGrowthPct: number | null): string | null {
  if (!r || r.regimes.length === 0) return null;
  const growth = rentGrowthPct != null && Number.isFinite(rentGrowthPct) ? `grows every rent ${pctText(Number(rentGrowthPct.toFixed(2)))} a year` : "grows every rent at one rate";
  const share =
    r.regulatedUnits != null && r.totalUnits != null && r.sharePct != null
      ? `, and ${count(r.regulatedUnits)} of the ${count(r.totalUnits)} ${r.noun.many} are regulated as the memorandum states`
      : "";
  const low = lowestCurrent(r);
  if (low) {
    const a = low.regime.allowance!;
    return `The model ${growth}; ${low.regime.name} allows ${pctText(low.figure.pct)} on ${low.figure.label} for ${a.applies_to} ${periodText(a)} (${a.order})${share}. The model's one growth rate is the market-rate ${r.noun.many}', not the regulated ones'.`;
  }
  const lead = r.regimes[0];
  const verb = lead.outcome === "applies" ? "applies" : "possibly applies";
  return `The model ${growth}; ${lead.name} ${verb}, and the site holds no figure in force for it today${share}. The model's one growth rate is the market-rate ${r.noun.many}', not the regulated ones'.`;
}

const TRAPS =
  "REGULATION TRAPS, checked by name where the OM gives the inputs: (a) THE REGULATED SHARE — which units are regulated comes from the registration history, never the deck; ask for the rent registrations; (b) LEGAL AGAINST PREFERENTIAL RENT — which one the rent roll states, and which one renewals are struck on; (c) THE ALLOWANCE — a regulated renewal grows at the board's or the statute's allowance for its period, not the market's, so a pro forma that grows every rent at one market rate overstates the regulated income; (d) TURNOVER — the legal path, if any, by which a unit reaches market on vacancy, and none where vacancy decontrol is gone; (e) IMPROVEMENTS — recoveries for apartment and building-wide improvements are capped, so a renovation premium on a regulated unit is the cap's, never the market's; (f) EVICTION AND JUST CAUSE — the regime's eviction rules limit the turnover the pro forma assumes, and the gap to market on a regulated unit is the regulation's cost, not loss to lease.";

/** The regulation's traps, for the challenger — the facts first, then the
 *  traps by name. */
export function regulationNote(r: RegulationRead): string {
  return `${regulationContextLine(r)} ${TRAPS}`;
}
