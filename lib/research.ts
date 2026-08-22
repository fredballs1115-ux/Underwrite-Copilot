// The research layer's pure core: tri-state evaluation of regulatory rules
// against a deal, plus benchmark staleness. PURE — unit-tested; no I/O.
// (Universal module: server components, actions, and tests all import it.)
//
// The one non-negotiable design rule: MISSING DATA IS NEVER A PASS. A rule
// whose condition can't be evaluated (the deal doesn't know its permit year,
// the buyer profile is unset) comes back "unknown", and the UI must say so —
// "no rules on file" / "possibly applies" — never silently drop the rule.

import { abbrevState } from "@/lib/address";

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
}

/** What the evaluator knows about this deal + buyer. Every field optional —
 *  absence flows through as "unknown", not false. */
export interface RuleSubject {
  state?: string; // 2-letter or full; normalized internally
  locality?: string[]; // city, county, submarket — all names the deal has
  units?: number;
  building_permit_year?: number;
  built_year?: number;
  municipality_population?: number;
  occupancy?: string;
  property_type?: string;
  transaction?: string;
  action?: string;
  owner_is_natural_person?: boolean;
  owner_natural_persons?: number;
  owner_other_rental_units_in_dc?: number;
  owner_total_rental_units_in_county?: number;
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

/** DC's dual identity: the address layer yields state "DC" and city names like
 *  "Washington" / "District of Columbia"; rules store state "DC", local "Washington". */
export function jurisdictionMatches(rule: RegulatoryRule, subject: RuleSubject): boolean {
  if (!subject.state) return false;
  if (abbrevState(subject.state).toUpperCase() !== rule.jurisdiction_state.toUpperCase()) {
    return false;
  }
  if (!rule.jurisdiction_local) return true; // statewide rule
  const want = norm(rule.jurisdiction_local);
  const have = (subject.locality ?? []).map(norm).filter(Boolean);
  if (rule.jurisdiction_state.toUpperCase() === "DC") return true; // one jurisdiction
  return have.some((h) => h === want || h.includes(want) || want.includes(h));
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
  if (key === "see_rule") return "yes"; // cross-reference, informational only

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

  if (key === "owner_form_any_of" && Array.isArray(want)) {
    if (s.owner_form === undefined) return "unknown";
    return want.includes(s.owner_form) ? "yes" : "no";
  }
  if (key === "owner_occupied_with_units_lte") {
    const w = typeof want === "number" ? want : Number(want);
    if (s.occupancy === undefined || s.units === undefined) return "unknown";
    return s.occupancy === "owner_occupied" && s.units <= w ? "yes" : "no";
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

/** Evaluate every jurisdiction-matched rule. Rules outside the deal's
 *  jurisdiction are omitted entirely (they're noise, not unknowns). */
export function evaluateRules(rules: RegulatoryRule[], subject: RuleSubject): RuleEvaluation[] {
  const out: RuleEvaluation[] = [];
  for (const rule of rules) {
    if (!jurisdictionMatches(rule, subject)) continue;
    const applies = evalConditions(rule.applies_if, subject);
    const exempt = evalConditions(rule.exempt_if ?? null, subject);
    // exempt_if of null/{} means "no exemption path", not "always exempt":
    const hasExemption = !!rule.exempt_if && Object.keys(rule.exempt_if).length > 0;
    const exemptTri: Tri = hasExemption ? exempt.result : "no";

    let outcome: RuleEvaluation["outcome"];
    if (applies.result === "no") outcome = "not_applicable";
    else if (exemptTri === "yes") outcome = "exempt";
    else if (applies.result === "yes" && exemptTri === "no") outcome = "applies";
    else outcome = "possibly_applies";

    out.push({
      rule,
      applies: applies.result,
      exempt: exemptTri,
      outcome,
      unknowns: [...applies.unknowns, ...(hasExemption ? exempt.unknowns : [])],
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

/** >180 days old = stale, per the build spec. */
export function isStale(asOf: string, today = new Date()): boolean {
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return true;
  return (today.getTime() - t) / 86_400_000 > 180;
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
