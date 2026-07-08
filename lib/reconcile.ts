/**
 * The reconciliation engine (Feature 3). PURE and deterministic — no LLM (the
 * per-document facts are extracted upstream; this only compares numbers). Given
 * the same facts it always returns the same discrepancies, so it is unit-tested
 * with known-answer fixtures.
 *
 * For every figure that appears in two or more of a deal's documents, it
 * reports the gap, a severity, and which source feeds the model by default:
 *   severity  |delta| < 2% minor · 2–5% material · > 5% red flag
 *   base      the more-granular / higher-authority source (rent roll, T-12)
 *   precedence rent roll > OM for rents / occupancy / mix;
 *              T-12 > OM for expenses / other income; OM where sole source.
 * Precedence is a DEFAULT — a per-line override switches which value is used.
 */
import type { DocFacts } from "@/lib/model/types";

export type Severity = "minor" | "material" | "red_flag";
export type DocKind = string; // "om" | "rent_roll" | "t12" | "financials" | ...

export interface DiscrepancyValue {
  docKind: DocKind;
  docLabel: string;
  value: string; // as shown in that document
  numeric: number;
  locator: string;
}
export interface Discrepancy {
  key: string;
  label: string;
  unit: string;
  values: DiscrepancyValue[];
  /** max |other − base| / |base|, base = the authoritative source */
  deltaPct: number;
  severity: Severity;
  /** which document's value feeds the model (precedence default or override) */
  inUse: DocKind;
  category: FactCategory;
}
export interface ReconcileResult {
  discrepancies: Discrepancy[];
  counts: { minor: number; material: number; red_flag: number };
  /** "3 discrepancies: 1 red flag, 1 material, 1 minor" (or "" when none) */
  summary: string;
}

type FactCategory = "rents" | "occupancy" | "mix" | "expenses" | "income" | "other";

/** Classify a fact by key/label so precedence knows which source wins. */
export function categorize(keyOrLabel: string): FactCategory {
  const s = keyOrLabel.toLowerCase();
  if (/occup|vacan|leased/.test(s)) return "occupancy";
  if (/\bunit|\bsf\b|square f|suite|count|mix\b|\bnra\b|\bgla\b/.test(s)) return "mix";
  if (/rent|lease rate|\bpsf\b|rent\/|in-place rent|market rent/.test(s)) return "rents";
  if (/expense|opex|\btax|insurance|utilit|cam\b|r&m|repairs|management fee|payroll|admin/.test(s))
    return "expenses";
  if (/noi|egi|\bincome\b|revenue|other income|concession|gross/.test(s)) return "income";
  return "other";
}

/** Preferred document order per category (first present wins by default). */
export function precedenceOrder(category: FactCategory): DocKind[] {
  switch (category) {
    case "rents":
    case "occupancy":
    case "mix":
      return ["rent_roll", "om", "t12", "financials"];
    case "expenses":
    case "income":
      return ["t12", "om", "rent_roll", "financials"];
    default:
      return ["om", "rent_roll", "t12", "financials"];
  }
}

export function severityFor(deltaPct: number): Severity {
  const d = Math.abs(deltaPct);
  if (d > 0.05) return "red_flag";
  if (d >= 0.02) return "material";
  return "minor";
}

/** The document that feeds the model: the first present in precedence order,
 *  unless an override names one that's actually present. */
function chooseInUse(
  category: FactCategory,
  present: DocKind[],
  override?: DocKind,
): DocKind {
  if (override && present.includes(override)) return override;
  const order = precedenceOrder(category);
  return order.find((k) => present.includes(k)) ?? present[0];
}

/**
 * Reconcile a deal's per-document facts into discrepancy rows. `overrides` maps
 * a fact key to the document the user chose to trust for it (per-line toggle).
 */
export function computeDiscrepancies(
  docs: DocFacts[],
  overrides: Record<string, DocKind> = {},
): ReconcileResult {
  // Gather every doc's numeric facts, indexed by canonical key.
  interface Group { key: string; label: string; unit: string; values: DiscrepancyValue[] }
  const groups = new Map<string, Group>();
  for (const doc of docs) {
    for (const f of doc.facts) {
      if (f.numeric == null || !Number.isFinite(f.numeric)) continue;
      const g = groups.get(f.key) ?? { key: f.key, label: f.label, unit: f.unit, values: [] };
      // one value per (key, doc) — first wins if a doc repeats a key
      if (!g.values.some((v) => v.docKind === doc.kind)) {
        g.values.push({
          docKind: doc.kind,
          docLabel: doc.docName,
          value: f.value,
          numeric: f.numeric,
          locator: f.locator,
        });
      }
      if (!groups.has(f.key)) groups.set(f.key, g);
    }
  }

  const discrepancies: Discrepancy[] = [];
  for (const g of groups.values()) {
    // Only overlapping facts (2+ documents) are reconcilable.
    if (g.values.length < 2) continue;
    const category = categorize(`${g.key} ${g.label}`);
    const present = g.values.map((v) => v.docKind);
    const inUse = chooseInUse(category, present, overrides[g.key]);
    const base = g.values.find((v) => v.docKind === inUse) ?? g.values[0];
    const deltaPct =
      base.numeric === 0
        ? g.values.some((v) => v.numeric !== 0)
          ? Infinity
          : 0
        : Math.max(...g.values.map((v) => Math.abs(v.numeric - base.numeric) / Math.abs(base.numeric)));
    discrepancies.push({
      key: g.key,
      label: g.label,
      unit: g.unit,
      values: g.values,
      deltaPct,
      severity: severityFor(deltaPct),
      inUse,
      category,
    });
  }

  // Red flags first, then material, then minor; stable by label within.
  const rank: Record<Severity, number> = { red_flag: 0, material: 1, minor: 2 };
  discrepancies.sort((a, b) => rank[a.severity] - rank[b.severity] || a.label.localeCompare(b.label));

  const counts = {
    minor: discrepancies.filter((d) => d.severity === "minor").length,
    material: discrepancies.filter((d) => d.severity === "material").length,
    red_flag: discrepancies.filter((d) => d.severity === "red_flag").length,
  };
  const n = discrepancies.length;
  const parts: string[] = [];
  if (counts.red_flag) parts.push(`${counts.red_flag} red flag${counts.red_flag > 1 ? "s" : ""}`);
  if (counts.material) parts.push(`${counts.material} material`);
  if (counts.minor) parts.push(`${counts.minor} minor`);
  const summary = n === 0 ? "" : `${n} discrepanc${n === 1 ? "y" : "ies"}: ${parts.join(", ")}`;

  return { discrepancies, counts, summary };
}

const SEV_LABEL: Record<Severity, string> = {
  minor: "Minor",
  material: "Material",
  red_flag: "Red flag",
};
export const severityLabel = (s: Severity) => SEV_LABEL[s];

/** "3.2%" — the gap for display (∞ when the base is zero). */
export function formatDelta(deltaPct: number): string {
  if (!Number.isFinite(deltaPct)) return "—";
  return `${(deltaPct * 100).toFixed(1)}%`;
}
