/**
 * Trap 1 (category contamination) and trap 4 (stale entries).
 *
 * The pull that started this: a county industrial query that came back with
 * hyperscale data-center campuses in it. A single 900k SF campus distorts
 * inventory, absorption AND the construction pipeline past usefulness, so the
 * user needs to exclude that category ONCE and have it hold across every
 * future import — not re-filter it by hand each quarter.
 *
 * And trap 4: one site approved for a single 900k+ SF building had been
 * redrawn into roughly five 200k SF buildings, and the data still carried the
 * old concept. Round-number placeholders are the tell. They get FLAGGED for
 * manual review, never silently dropped and never silently trusted.
 *
 * Pure.
 */
import type { ExclusionRules, PipelineProperty } from "./types";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Does this property match the submarket's exclusion rules, and why?
 * Returns null when it doesn't — the reason string is what the UI shows in the
 * live count ("12 excluded (data centers)").
 */
export function exclusionReasonFor(
  property: Pick<PipelineProperty, "name" | "address" | "sf" | "subtype" | "ownerOccupied">,
  rules: ExclusionRules,
): string | null {
  const subtype = norm(property.subtype);
  for (const s of rules.subtypes) {
    const target = norm(s);
    if (target && subtype && (subtype === target || subtype.includes(target))) {
      return `subtype "${s}"`;
    }
  }

  const haystack = `${norm(property.name)} ${norm(property.address)}`;
  for (const p of rules.namePatterns) {
    const target = norm(p);
    if (target && haystack.includes(target)) return `name matches "${p}"`;
  }

  if (rules.excludeOwnerOccupied && property.ownerOccupied) return "owner-occupied";

  if (property.sf != null) {
    if (rules.minSf != null && property.sf < rules.minSf) {
      return `under ${rules.minSf.toLocaleString("en-US")} SF`;
    }
    if (rules.maxSf != null && property.sf > rules.maxSf) {
      return `over ${rules.maxSf.toLocaleString("en-US")} SF`;
    }
  }

  return null;
}

/**
 * A round-number SF placeholder — the tell for an entry carrying an old
 * concept rather than a real building.
 *
 * The rule, stated so it can be argued with: 100,000 SF or larger AND an exact
 * multiple of 50,000. 1,000,000 fires. 996,977 does not, and neither does
 * 212,400 — real buildings have real dimensions.
 */
export function isRoundPlaceholder(sf: number | null): boolean {
  if (sf == null || !Number.isFinite(sf) || sf < 100_000) return false;
  return sf % 50_000 === 0;
}

export interface StaleVerdict {
  stale: boolean;
  reason: string | null;
}

/**
 * Why this pipeline entry deserves a manual look. Two tells:
 *   - a round-number size, which usually means an approved concept rather than
 *     a designed building
 *   - a delivery date that has come and gone while the status still says
 *     proposed or under construction
 */
export function staleVerdict(
  property: Pick<PipelineProperty, "sf" | "status" | "expectedDelivery">,
  asOf: string,
): StaleVerdict {
  const reasons: string[] = [];
  if (isRoundPlaceholder(property.sf)) {
    reasons.push(
      `${property.sf!.toLocaleString("en-US")} SF is a round-number placeholder — verify the building count and size`,
    );
  }
  if (
    property.expectedDelivery &&
    property.expectedDelivery < asOf &&
    property.status !== "delivered"
  ) {
    reasons.push(
      `delivery was due ${property.expectedDelivery} but the status is still "${property.status.replace("_", " ")}"`,
    );
  }
  return reasons.length
    ? { stale: true, reason: reasons.join("; ") }
    : { stale: false, reason: null };
}

export interface AppliedRules {
  properties: PipelineProperty[];
  total: number;
  excludedCount: number;
  includedCount: number;
  staleCount: number;
  /** SF under construction across the INCLUDED properties */
  underConstructionSf: number;
  /** reason → how many properties it excluded, for the rule builder's count */
  reasonCounts: Record<string, number>;
}

/**
 * Apply the rules to a property list, recomputing `excluded`, `exclusionReason`
 * and the stale flags from scratch.
 *
 * Recomputing rather than patching is deliberate: a rule the user REMOVES has
 * to un-exclude what it excluded, and a stored flag that only ever gets set
 * would quietly outlive the rule that set it.
 */
export function applyExclusionRules(
  properties: PipelineProperty[],
  rules: ExclusionRules,
  asOf: string,
): AppliedRules {
  const reasonCounts: Record<string, number> = {};
  let excludedCount = 0;
  let staleCount = 0;
  let underConstructionSf = 0;

  const out = properties.map((p) => {
    const reason = exclusionReasonFor(p, rules);
    const stale = staleVerdict(p, asOf);
    if (reason) {
      excludedCount++;
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    } else if (p.status === "under_construction") {
      underConstructionSf += p.sf ?? 0;
    }
    if (stale.stale) staleCount++;
    return {
      ...p,
      excluded: reason != null,
      exclusionReason: reason,
      staleFlag: stale.stale,
      staleReason: stale.reason,
    };
  });

  return {
    properties: out,
    total: properties.length,
    excludedCount,
    includedCount: properties.length - excludedCount,
    staleCount,
    underConstructionSf,
    reasonCounts,
  };
}

/** "146 properties, 12 excluded (data centers), 659,944 SF under construction." */
export function exclusionSummary(applied: AppliedRules): string {
  const parts = [`${applied.total} propert${applied.total === 1 ? "y" : "ies"}`];
  if (applied.excludedCount > 0) {
    const reasons = Object.entries(applied.reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([reason]) => reason)
      .join(", ");
    parts.push(`${applied.excludedCount} excluded (${reasons})`);
  }
  parts.push(
    `${Math.round(applied.underConstructionSf).toLocaleString("en-US")} SF under construction`,
  );
  if (applied.staleCount > 0) {
    parts.push(`${applied.staleCount} flagged for review`);
  }
  return `${parts.join(", ")}.`;
}
