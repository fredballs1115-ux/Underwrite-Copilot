// One reader for what a broker comp's one-line detail states — a per-unit or
// per-SF basis and a cap rate — so the comps table and the report can draw a
// comp against the subject instead of printing the line alone. Pure and
// LLM-free, and it reads only what the text says: "$252k/unit", "$252,000
// per door", "$410/SF", "$410 psf", "5.6% cap", "cap rate 5.60%". A monthly
// rent ("$2,520/mo"), a bare dollar figure, or a percentage with no "cap"
// beside it is not a basis or a cap, and reads as nothing — the same honesty
// as the report's rangeRead.
import { buildingSfFromMetrics, parseMoney } from "@/lib/criteria";
import { findPricedMetric, unitCountFromMetrics, type StrategyKind } from "@/lib/deal-strategy";

/** The shape every metric reader takes — the extraction's rows or a lighter copy. */
interface MetricLike {
  label: string;
  value: string;
}

export interface CompFigures {
  /** $ per unit / door / key / bed — null when the line states none */
  perUnit: number | null;
  /** $ per square foot — null when the line states none */
  perSf: number | null;
  /** cap rate in percent — null when the line states none */
  capPct: number | null;
}

// "$252k", "$252,000", "$2.1M", "$410" — the figure and an optional k / M.
const MONEY = String.raw`\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*([kKmM])?(?![a-zA-Z])`;
const PER_UNIT = new RegExp(String.raw`${MONEY}\s*(?:/|per)\s*(?:unit|door|key|bed|room|pad|site)s?\b`, "i");
const PER_SF = new RegExp(
  String.raw`${MONEY}\s*(?:(?:/|per)\s*(?:sf|s\.f\.|sq\.?\s*ft\.?|square\s+f(?:oo|ee)t)|psf)\b`,
  "i",
);
const CAP_AFTER = /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:going[- ]in\s+)?cap\b/i;
const CAP_BEFORE = /\bcap(?:\s*rate)?\s*(?:of|:|at|@)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i;

function money(m: RegExpMatchArray): number | null {
  const whole = m[1].replace(/,/g, "");
  const n = Number(`${whole}${m[2] ? `.${m[2]}` : ""}`);
  if (!Number.isFinite(n)) return null;
  const suffix = (m[3] ?? "").toLowerCase();
  return suffix === "k" ? n * 1_000 : suffix === "m" ? n * 1_000_000 : n;
}

/** What one comp's detail line states. Nothing is inferred. */
export function compFigures(detail: string | null | undefined): CompFigures {
  const text = (detail ?? "").trim();
  if (!text) return { perUnit: null, perSf: null, capPct: null };

  const unitMatch = text.match(PER_UNIT);
  const unit = unitMatch ? money(unitMatch) : null;
  const sfMatch = text.match(PER_SF);
  const sf = sfMatch ? money(sfMatch) : null;
  const capMatch = text.match(CAP_AFTER) ?? text.match(CAP_BEFORE);
  const cap = capMatch ? Number(capMatch[1]) : null;

  return {
    // A basis under $1,000 a unit is a rent or a fee, not a price.
    perUnit: unit != null && unit >= 1_000 ? unit : null,
    perSf: sf != null && sf > 0 ? sf : null,
    // A cap rate outside (0, 20] is not one — a growth rate or an occupancy
    // wearing the word.
    capPct: cap != null && cap > 0 && cap <= 20 ? cap : null,
  };
}

export interface SubjectBasis {
  perUnit: number | null;
  perSf: number | null;
}

/** The subject's own basis from the screen's metrics — the shared price,
 *  unit-count and building-size readers, so the comps page never names a
 *  different price than the deal page. A conversion or a development is
 *  judged on its all-in cost, not the shell's price, so it has no price
 *  basis to set against stabilized trades: both come back null. */
export function subjectBasis(metrics: MetricLike[], kind: StrategyKind): SubjectBasis {
  const none = { perUnit: null, perSf: null };
  if (kind === "conversion" || kind === "development") return none;
  const row = findPricedMetric(metrics, kind);
  const price = row ? parseMoney(row.value) : null;
  if (price == null || price < 10_000) return none;
  const units = unitCountFromMetrics(metrics);
  const sf = buildingSfFromMetrics(metrics);
  return {
    perUnit: units != null && units > 0 ? Math.round(price / units) : null,
    perSf: sf != null && sf > 0 ? Math.round(price / sf) : null,
  };
}

export interface BasisScale {
  /** the yardstick the set is drawn on — per unit when any comp states one */
  unit: "unit" | "sf";
  /** the largest basis in the set, the subject's included — the full track */
  max: number;
  /** each comp's basis as a share of the track; null for a comp that states none */
  shares: (number | null)[];
  /** the subject's basis as a share of the track; null when it has none */
  subjectShare: number | null;
  /** the subject's basis on this yardstick, for the caption */
  subjectValue: number | null;
}

/** The scale a set of comps is drawn on: every comp's stated basis and the
 *  subject's, each as a share of the largest, so a bar per comp with a tick
 *  for the subject reads which comps trade above the deal's own basis.
 *  Per unit when any comp states one, else per SF; null when no comp states
 *  a basis at all — a set of names alone draws nothing. */
export function basisScale(
  comps: ReadonlyArray<{ detail?: string | null }>,
  subject: SubjectBasis | null,
): BasisScale | null {
  const figures = comps.map((c) => compFigures(c.detail));
  const unit: "unit" | "sf" | null = figures.some((f) => f.perUnit != null)
    ? "unit"
    : figures.some((f) => f.perSf != null)
      ? "sf"
      : null;
  if (!unit) return null;
  const values = figures.map((f) => (unit === "unit" ? f.perUnit : f.perSf));
  const subjectValue = subject ? (unit === "unit" ? subject.perUnit : subject.perSf) : null;
  const max = Math.max(...values.map((v) => v ?? 0), subjectValue ?? 0);
  if (max <= 0) return null;
  return {
    unit,
    max,
    shares: values.map((v) => (v != null ? Math.min(1, v / max) : null)),
    subjectShare: subjectValue != null ? Math.min(1, subjectValue / max) : null,
    subjectValue,
  };
}

/** "$274k/unit" or "$410/SF" — the caption a bar's tooltip uses. */
export function fmtBasis(value: number, unit: "unit" | "sf"): string {
  if (unit === "sf") return `$${Math.round(value).toLocaleString("en-US")}/SF`;
  return value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M/unit`
    : `$${Math.round(value / 1_000).toLocaleString("en-US")}k/unit`;
}
