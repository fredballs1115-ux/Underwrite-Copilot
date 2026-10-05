// The research layer's pure core: tri-state evaluation of regulatory rules
// against a deal, plus benchmark staleness. PURE — unit-tested; no I/O.
// (Universal module: server components, actions, and tests all import it.)
//
// The one non-negotiable design rule: MISSING DATA IS NEVER A PASS. A rule
// whose condition can't be evaluated (the deal doesn't know its permit year,
// the buyer profile is unset) comes back "unknown", and the UI must say so —
// "no rules on file" / "possibly applies" — never silently drop the rule.

import { abbrevState } from "@/lib/address";
import { researchAge, staleMark } from "@/lib/research-age";
import { datedNotes, type DatedNote } from "@/lib/dated-window";

export type ResearchStatus = "verified" | "sourced" | "unverified_not_found";

export interface RegulatoryRule {
  id: string;
  jurisdiction_state: string;
  jurisdiction_local: string | null;
  rule_type: string;
  applies_if: Record<string, unknown> | null;
  exempt_if: Record<string, unknown> | null;
  effect: string;
  quote?: string | null;
  source: string | null;
  as_of: string;
  status: ResearchStatus;
  verification?: string | null;
}

export interface Benchmark {
  sector: string;
  metro: string;
  metric: string;
  low: number | null;
  high: number | null;
  unit: string;
  source: string;
  as_of: string;
  status: ResearchStatus;
  note?: string | null;
  /** a research-tracker figure's own provenance in one line — its house,
   *  the area it covers and its period, as its block states them
   *  (lib/tracker-read's `figureNote`); a row that carries one has `as_of`
   *  as the day the research was read, not the figure's date */
  cite?: string | null;
}

/** What the evaluator knows about this deal + buyer. Every field optional —
 *  absence flows through as "unknown", not false. */
export interface RuleSubject {
  state?: string; // 2-letter or full; normalized internally
  locality?: string[]; // city, county, submarket — all names the deal has
  /** the incorporated place the Census geocoder put the building in (#452):
   *  its municipality ("Los Angeles" for a Van Nuys address), null where it
   *  is in none (unincorporated), undefined where no lookup has answered —
   *  a city's rules then read the address's own names */
  place?: string | null;
  units?: number;
  building_permit_year?: number;
  built_year?: number;
  /** "now" for rolling-age tests (MoCo's under-23-years exemption, the CA and
   *  WA caps' new-building exemptions) — injected so evaluation stays
   *  deterministic and testable */
  current_year?: number;
  /** the day the rules are read, an ISO day — injected like `current_year`:
   *  a rule whose text states a window or an effective date is read against
   *  it (lib/dated-window), and its evaluation says what has ended */
  today?: string;
  municipality_population?: number;
  /** CURRENT status ("vacant_registered", "non_owner_occupied_rental", …) —
   *  distinct from owner_occupied, which is the buyer's post-close intent */
  occupancy?: string;
  /** will the buyer live in the building? Feeds the owner-occupancy
   *  exemptions without asserting anything about current occupancy */
  owner_occupied?: boolean;
  property_type?: string;
  transaction?: string;
  action?: string;
  owner_is_natural_person?: boolean;
  owner_natural_persons?: number;
  owner_other_rental_units_in_dc?: number;
  owner_total_rental_units_in_county?: number;
  /** statewide portfolio (NY Good Cause small-landlord test, etc.) */
  owner_total_rental_units_in_state?: number;
  owner_form?: string;
  owner_domiciled_in_county?: boolean;
  exemption_registered_with_rad?: boolean;
  owner_occupied_units?: number;
  municipality_adopted_etpa?: boolean;
}

export type Tri = "yes" | "no" | "unknown";

export interface RuleEvaluation {
  rule: RegulatoryRule;
  /** does the rule's applies_if hold? */
  applies: Tri;
  /** does an exemption rescue the deal? (only meaningful when applies !== "no") */
  exempt: Tri;
  /** the one-word classification the UI renders */
  outcome: "exempt" | "applies" | "possibly_applies" | "not_applicable";
  /** conditions that came back unknown — the UI lists them as open questions */
  unknowns: string[];
  /** what the rule's own text says has ended or passed on the subject's day
   *  (lib/dated-window `datedNotes`): a window its figure was stated for
   *  that has ended, an effective date that has come — each one sentence,
   *  printed under the text, which stays as written. The outcome is the
   *  rule's and does not change: the rule still holds; its figure needs
   *  checking. Empty while nothing has ended, or with no day given. */
  dated: DatedNote[];
}

const and = (a: Tri, b: Tri): Tri =>
  a === "no" || b === "no" ? "no" : a === "unknown" || b === "unknown" ? "unknown" : "yes";
const or = (a: Tri, b: Tri): Tri =>
  a === "yes" || b === "yes" ? "yes" : a === "unknown" || b === "unknown" ? "unknown" : "no";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\b(county|city|town|township|borough)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Places whose everyday name differs from the jurisdiction their rules are
 *  filed under — the five boroughs (and their county names) ARE New York
 *  City. State-guarded: "richmond" only aliases inside NY (Richmond County =
 *  Staten Island), never Richmond VA. */
const LOCALITY_ALIASES: Record<string, Record<string, string>> = {
  NY: {
    brooklyn: "new york",
    kings: "new york",
    bronx: "new york",
    queens: "new york",
    manhattan: "new york",
    "staten island": "new york",
    richmond: "new york",
    nyc: "new york",
  },
};

/** Cities whose county IS the city, so the county's name places a deal in
 *  the city: San Francisco, Philadelphia, and New York's five counties (the
 *  boroughs reach it through the alias table). Everywhere else a county of
 *  the city's name holds other cities too — Los Angeles County holds
 *  Pasadena, Long Beach and 85 more. */
const CONSOLIDATED: Record<string, readonly string[]> = {
  CA: ["san francisco"],
  PA: ["philadelphia"],
  NY: ["new york"],
};

/** What kind of place a name is, read before `norm` strips the kind word: a
 *  county ("Prince George's County", "Orleans Parish"), a name ending in
 *  "city" ("Baltimore City" as a rule files it, the Census's "Baltimore
 *  city", and a place like "Jersey City"), or a place. */
function kindOf(name: string): "county" | "city" | "place" {
  const s = name.trim();
  if (/\b(county|parish)$/i.test(s)) return "county";
  if (/\bcity$/i.test(s)) return "city";
  return "place";
}

/**
 * Whether a rule's jurisdiction holds the deal (#452): "yes", "no", or
 * "unknown" where the names the deal has cannot say. Names are compared
 * WHOLE — the first version matched any name containing another, so South
 * San Francisco read San Francisco's rent ordinance, Chicago Heights
 * Chicago's landlord ordinance and East Newark Newark's rent control — and a
 * county never stands in for a city: "Los Angeles County" read the City of
 * Los Angeles's rent stabilization onto Pasadena and every other city in
 * the county, and "Baltimore County" Baltimore City's rental license onto
 * Towson.
 *
 *   - A statewide rule holds anywhere in its state; DC is one jurisdiction.
 *   - A county's rule holds where the deal's county is that county.
 *   - A city's rule reads the building's municipality where the Census
 *     geocoder named it (`subject.place`: Van Nuys is in the City of Los
 *     Angeles; an unincorporated point is in no city). Without it, the
 *     address's own place names decide; a county of the city's name places
 *     the deal in the city only where the county is the city (`CONSOLIDATED`)
 *     and otherwise leaves it "unknown" — a Van Nuys address, whose postal
 *     city is not its municipality, is asked rather than dropped. A rule
 *     filed under "… City" is an independent city (Baltimore City), which a
 *     county of its name does not contain.
 */
export function jurisdictionOf(rule: RegulatoryRule, subject: RuleSubject): Tri {
  if (!subject.state) return "no";
  const state = abbrevState(subject.state).toUpperCase();
  if (state !== rule.jurisdiction_state.toUpperCase()) return "no";
  if (!rule.jurisdiction_local) return "yes"; // statewide rule
  if (state === "DC") return "yes"; // one jurisdiction
  const aliases = LOCALITY_ALIASES[state] ?? {};
  const named = (x: string) => {
    const n = norm(x);
    return aliases[n] ?? n;
  };
  const want = named(rule.jurisdiction_local);
  const ruleKind = kindOf(rule.jurisdiction_local);
  const entries = (subject.locality ?? []).filter((x) => norm(x)).map((x) => ({ kind: kindOf(x), name: named(x) }));
  const counties = entries.filter((e) => e.kind === "county").map((e) => e.name);
  const places = entries.filter((e) => e.kind !== "county").map((e) => e.name);
  if (ruleKind === "county") return counties.includes(want) ? "yes" : "no";
  // A city's rule: the building's municipality, where the Census named it.
  if (subject.place !== undefined) return subject.place !== null && named(subject.place) === want ? "yes" : "no";
  // An independent city is not in the county of its name.
  if (ruleKind === "city" && counties.includes(want)) return "no";
  if (places.includes(want)) return "yes";
  if (counties.includes(want)) return (CONSOLIDATED[state] ?? []).includes(want) ? "yes" : "unknown";
  return "no";
}

/** Whether a rule's jurisdiction can hold the deal ("yes" or "unknown"). */
export function jurisdictionMatches(rule: RegulatoryRule, subject: RuleSubject): boolean {
  return jurisdictionOf(rule, subject) !== "no";
}

const yearOf = (iso: unknown): number | undefined => {
  if (typeof iso !== "string") return undefined;
  const y = Number(iso.slice(0, 4));
  return Number.isFinite(y) ? y : undefined;
};

/** Evaluate one condition key against the subject. Tri-state. */
function evalCondition(key: string, want: unknown, s: RuleSubject): Tri {
  // structural keys
  if (key === "any_of" && Array.isArray(want)) {
    return want
      .map((w) => evalConditions(w as Record<string, unknown>, s).result)
      .reduce<Tri>((acc, t) => or(acc, t), "no");
  }
  // A cross-reference `evaluateRules` could not resolve to the rule it names
  // is an open question, never a pass: read as "yes", it had exempted every
  // rental deal in Prince George's County from the county's rent cap.
  if (key === "see_rule") return "unknown";

  // permit/built-date comparisons operate on years — the deal stores a year
  if (key === "building_permit_issued_after") {
    const y = s.building_permit_year ?? s.built_year;
    const w = yearOf(want);
    if (y === undefined || w === undefined) return "unknown";
    return y > w ? "yes" : "no";
  }
  if (key === "building_permit_issued_on_or_before") {
    const y = s.building_permit_year ?? s.built_year;
    const w = yearOf(want);
    if (y === undefined || w === undefined) return "unknown";
    return y <= w ? "yes" : "no";
  }
  if (key === "built_before") {
    const y = s.built_year ?? s.building_permit_year;
    const w = yearOf(want);
    if (y === undefined || w === undefined) return "unknown";
    return y < w ? "yes" : "no";
  }

  // Dedicated composite handlers MUST run before the generic comparator
  // sweep: "owner_occupied_with_units_lte" ends in _lte but its base is not a
  // subject field, so the generic block would swallow it as forever-unknown.
  if (key === "owner_form_any_of" && Array.isArray(want)) {
    if (s.owner_form === undefined) return "unknown";
    return want.includes(s.owner_form) ? "yes" : "no";
  }
  if (key === "owner_occupied_with_units_lte") {
    const w = typeof want === "number" ? want : Number(want);
    // The buyer's stated intent (deal-facts boolean) answers this; the
    // occupancy STRING is the fallback for subjects that carry one (tests,
    // the homepage playground).
    const occ =
      s.owner_occupied ?? (s.occupancy === undefined ? undefined : s.occupancy === "owner_occupied");
    if (occ === undefined || s.units === undefined) return "unknown";
    return occ && s.units <= w ? "yes" : "no";
  }
  // Rolling-age tests: MoCo's under-23-years exemption, and the new-building
  // exemptions from California's statewide cap (under 15 years) and
  // Washington's (under 12). The base "building_age_years" is derived, not a
  // subject field — without this the generic sweep below would read
  // undefined and stay unknown forever. Read against `current_year`, so a
  // window advances every January 1 on its own; a fixed "built after" date
  // would be right for one year only.
  if (key === "building_age_years_lt") {
    const w = typeof want === "number" ? want : Number(want);
    if (s.current_year === undefined || !Number.isFinite(w)) return "unknown";
    if (s.built_year !== undefined) return s.current_year - s.built_year < w ? "yes" : "no";
    // A permit comes before the building it permits, so a permit younger
    // than the window proves the building is too; an older one proves
    // nothing about when it was finished.
    if (s.building_permit_year !== undefined && s.current_year - s.building_permit_year < w) return "yes";
    return "unknown";
  }

  // comparator suffixes over numeric subject fields
  const cmp = key.match(/^(.*)_(lte|gte|lt|gt)$/);
  if (cmp) {
    const base = cmp[1] as keyof RuleSubject;
    const val = s[base] as number | undefined;
    const w = typeof want === "number" ? want : Number(want);
    if (val === undefined || !Number.isFinite(w)) return "unknown";
    switch (cmp[2]) {
      case "lte": return val <= w ? "yes" : "no";
      case "gte": return val >= w ? "yes" : "no";
      case "lt": return val < w ? "yes" : "no";
      case "gt": return val > w ? "yes" : "no";
    }
  }

  // plain equality against a same-named subject field
  const val = s[key as keyof RuleSubject];
  if (val === undefined) return "unknown";
  if (typeof want === "boolean" || typeof want === "number") {
    return val === want ? "yes" : "no";
  }
  return String(val) === String(want) ? "yes" : "no";
}

function evalConditions(
  conds: Record<string, unknown> | null | undefined,
  s: RuleSubject
): { result: Tri; unknowns: string[] } {
  if (!conds || Object.keys(conds).length === 0) return { result: "yes", unknowns: [] };
  let acc: Tri = "yes";
  const unknowns: string[] = [];
  for (const [k, v] of Object.entries(conds)) {
    const t = evalCondition(k, v, s);
    if (t === "unknown") unknowns.push(k);
    acc = and(acc, t);
  }
  return { result: acc, unknowns };
}

/** The open question a rule carries where the deal's names cannot say
 *  whether it sits inside the rule's city (`jurisdictionOf` "unknown"). */
export const WITHIN_CITY_LIMITS = "within_city_limits";

/** Plain-English labels for condition keys surfaced as open questions —
 *  the rules panel's and lib/rent-regulation's, one list. */
export const OPEN_QUESTION_LABELS: Record<string, string> = {
  building_permit_issued_on_or_before: "building permit year",
  building_permit_issued_after: "building permit year",
  built_before: "year built",
  building_age_years_lt: "year built",
  exemption_registered_with_rad: "RAD exemption registration",
  units_gte: "unit count",
  units_lte: "unit count",
  municipality_adopted_etpa: "whether the municipality adopted ETPA",
  municipality_population_gte: "municipality population",
  occupancy: "current occupancy status",
  owner_occupied_with_units_lte: "whether you'll owner-occupy (and unit count)",
  owner_total_rental_units_in_state_lte: "total rental units you own in this state",
  within_city_limits: "whether the building sits inside the city's limits",
};

/**
 * A rule's exemption conditions with its cross-reference resolved: an
 * `exempt_if` of `{ see_rule: "<id>" }` means "exempt where the rule it names
 * exempts", so the named rule's own `exempt_if` conditions stand in its
 * place (Prince George's rent cap is lifted exactly where the county's
 * small-landlord exemption holds). One level only; a reference to a rule the
 * list does not hold, or one with no conditions, stays and reads "unknown".
 */
export function exemptionConditions(
  rule: RegulatoryRule,
  rules: readonly RegulatoryRule[],
): Record<string, unknown> | null {
  const conds = rule.exempt_if ?? null;
  const ref = conds?.see_rule;
  if (!conds || typeof ref !== "string") return conds;
  const named = rules.find((r) => r.id === ref);
  const theirs = named && named.id !== rule.id ? named.exempt_if : null;
  if (!theirs || Object.keys(theirs).length === 0) return conds;
  const rest = Object.fromEntries(Object.entries(conds).filter(([k]) => k !== "see_rule"));
  return { ...rest, ...theirs };
}

/** Evaluate every jurisdiction-matched rule. Rules outside the deal's
 *  jurisdiction are omitted entirely (they're noise, not unknowns); a rule
 *  whose city the deal's names cannot place it in or out of (#452) reads
 *  at most "possibly applies", with that question named. */
export function evaluateRules(rules: RegulatoryRule[], subject: RuleSubject): RuleEvaluation[] {
  const out: RuleEvaluation[] = [];
  for (const rule of rules) {
    const where = jurisdictionOf(rule, subject);
    if (where === "no") continue;
    const applies = evalConditions(rule.applies_if, subject);
    const exemptIf = exemptionConditions(rule, rules);
    const exempt = evalConditions(exemptIf, subject);
    // exempt_if of null/{} means "no exemption path", not "always exempt":
    const hasExemption = !!exemptIf && Object.keys(exemptIf).length > 0;
    const exemptTri: Tri = hasExemption ? exempt.result : "no";

    let outcome: RuleEvaluation["outcome"];
    if (applies.result === "no") outcome = "not_applicable";
    else if (exemptTri === "yes") outcome = "exempt";
    else if (applies.result === "yes" && exemptTri === "no") outcome = "applies";
    else outcome = "possibly_applies";
    // Only a rule that would otherwise reach the deal asks where it is.
    const asks = where === "unknown" && (outcome === "applies" || outcome === "possibly_applies");
    if (asks) outcome = "possibly_applies";

    out.push({
      rule,
      applies: applies.result,
      exempt: exemptTri,
      outcome,
      unknowns: [...(asks ? [WITHIN_CITY_LIMITS] : []), ...applies.unknowns, ...(hasExemption ? exempt.unknowns : [])],
      dated: subject.today ? datedNotes(rule.effect, subject.today) : [],
    });
  }
  return out;
}

/** Hours since an ISO timestamp — Infinity when unparseable. (Components
 *  call this instead of Date.now() so render stays lint-pure.) */
export function hoursSince(iso: string, now = new Date()): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (now.getTime() - t) / 3_600_000 : Infinity;
}

/** A research figure's date as a page says it: "as of 2026-08-21", or
 *  "undated" where its file states none — never a date the file does not
 *  carry (hard-coded fallback dates once stood in for a missing one). Handed
 *  `today`, a date past the research rule's limit carries its age and the
 *  stale mark (lib/research-age): "as of 2026-08-20 (181 days old, stale)". */
export function asOfLabel(asOf: string | null | undefined, today?: string | Date): string {
  const d = typeof asOf === "string" ? asOf.trim() : "";
  if (!d) return "undated";
  const mark = today === undefined ? null : staleMark(researchAge(d, today));
  return `as of ${d}${mark ? ` (${mark})` : ""}`;
}

/** Compare a deal value to a benchmark range: below/within/above, null-safe. */
export function vsRange(
  value: number,
  low: number | null,
  high: number | null
): "below" | "within" | "above" | "no_range" {
  if (low === null && high === null) return "no_range";
  if (low !== null && value < low) return "below";
  if (high !== null && value > high) return "above";
  return "within";
}
