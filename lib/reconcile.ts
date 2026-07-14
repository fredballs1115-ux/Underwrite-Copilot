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
  /** the fact's unit as extracted — only same-unit values are differenced */
  unit: string;
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
      // Debt terms and anything off-category: a loan term sheet outranks the
      // OM summary; only loan_terms docs carry these facts, so leading with it
      // is a no-op for every other document.
      return ["loan_terms", "om", "rent_roll", "t12", "financials"];
  }
}

export function severityFor(deltaPct: number): Severity {
  const d = Math.abs(deltaPct);
  if (d > 0.05) return "red_flag";
  if (d >= 0.02) return "material";
  return "minor";
}

/** Canonicalize a unit so equal units compare equal and genuinely different
 *  ones (a $/unit/month rent vs an annual $ figure) do NOT. Deliberately
 *  conservative — when in doubt it keeps units distinct, so the engine skips a
 *  comparison rather than fabricating a gap (and, downstream, a fabricated
 *  broker question). */
export function normalizeUnit(u: string): string {
  let s = (u || "").toLowerCase().trim();
  s = s.replace(/dollars?|usd/g, "$");
  s = s.replace(/percent(age)?|pct/g, "%");
  s = s.replace(/\bper\b/g, "/");
  s = s.replace(/months?|\bmo\b/g, "mo");
  s = s.replace(/years?|\byr\b|annum|\bpa\b/g, "yr");
  s = s.replace(/units?/g, "unit");
  s = s.replace(/square ?(feet|foot|ft)|sq\.? ?ft|psf/g, "sf");
  return s.replace(/[^a-z0-9%$/]/g, "");
}

/** Max relative gap of a set of values against a base (∞ when the base is 0
 *  and the others aren't; 0 when all are 0). */
function deltaOf(values: DiscrepancyValue[], base: DiscrepancyValue): number {
  if (base.numeric === 0) return values.some((v) => v.numeric !== 0) ? Infinity : 0;
  return Math.max(
    ...values.map((v) => Math.abs(v.numeric - base.numeric) / Math.abs(base.numeric)),
  );
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
          unit: f.unit,
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

    // Compare only values expressed in the SAME unit. Bucket by normalized
    // unit and reconcile within the LARGEST comparable bucket; a value alone in
    // its unit isn't a conflict, it's just not comparable, so it drops out.
    // This is what stops a $/unit/mo rent being differenced against an annual
    // $ figure and inventing a red flag.
    const buckets = new Map<string, DiscrepancyValue[]>();
    for (const v of g.values) {
      const u = normalizeUnit(v.unit);
      const arr = buckets.get(u);
      if (arr) arr.push(v);
      else buckets.set(u, [v]);
    }
    let bucket: DiscrepancyValue[] = [];
    for (const b of buckets.values()) if (b.length > bucket.length) bucket = b;
    if (bucket.length < 2) continue;

    const present = bucket.map((v) => v.docKind);
    const inUse = chooseInUse(category, present, overrides[g.key]);
    const base = bucket.find((v) => v.docKind === inUse) ?? bucket[0];
    const deltaPct = deltaOf(bucket, base);
    discrepancies.push({
      key: g.key,
      label: g.label,
      unit: base.unit || g.unit,
      values: bucket,
      deltaPct,
      severity: severityFor(deltaPct),
      inUse,
      category,
    });
  }

  return summarizeDiscrepancies(discrepancies);
}

/** Sort (red flags first, then material, then minor; stable by label within),
 *  count, and summarize a set of rows into a result. Shared so a fresh compute
 *  and a re-based override always order and summarize the same way. */
function summarizeDiscrepancies(rows: Discrepancy[]): ReconcileResult {
  const rank: Record<Severity, number> = { red_flag: 0, material: 1, minor: 2 };
  const discrepancies = [...rows].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.label.localeCompare(b.label),
  );
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

/**
 * Recompute one discrepancy row when the user switches which source feeds the
 * model (the per-line toggle). Pure, so the panel can update instantly on the
 * client while the override is persisted server-side. `docKind` must be one of
 * the row's present sources; the gap re-bases on it.
 */
export function recomputeDiscrepancy(d: Discrepancy, docKind: DocKind): Discrepancy {
  const base = d.values.find((v) => v.docKind === docKind);
  if (!base) return d;
  const deltaPct = deltaOf(d.values, base);
  return { ...d, inUse: docKind, deltaPct, severity: severityFor(deltaPct) };
}

/**
 * Apply a per-line override to a WHOLE result: re-base the matching row on the
 * chosen document, then re-sort and re-summarize so severity ordering and the
 * counts stay consistent. Used by the client panel (instant) and the server
 * action (persisted) so a reload shows exactly what the toggle showed.
 */
export function applyOverride(
  result: ReconcileResult,
  factKey: string,
  docKind: DocKind,
): ReconcileResult {
  const rows = result.discrepancies.map((d) =>
    d.key === factKey ? recomputeDiscrepancy(d, docKind) : d,
  );
  return summarizeDiscrepancies(rows);
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
