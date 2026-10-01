// One reader for what a broker comp's one-line detail states — a per-unit or
// per-SF basis and a cap rate — so the comps table and the report can draw a
// comp against the subject instead of printing the line alone. Pure and
// LLM-free, and it reads only what the text says: "$252k/unit", "$252,000
// per door", "$252,000 a unit", "Price/Unit: $252,000", "$410/SF", "$410
// psf", "$410/RSF", "$410 a foot", "5.6% cap", "a 5.6 cap", "cap rate of
// approximately 5.60%". A monthly rent ("$2,520/mo"), a bare dollar figure,
// a percentage with no "cap" beside it, or a cap stated as a range is not a
// basis or a cap, and reads as nothing — the same honesty as the report's
// rangeRead.
import { buildingSfFromMetrics, parsePrice } from "@/lib/criteria";
import { findPricedMetric, isOutdoorStorageYard, unitCountFromMetrics, type StrategyKind } from "@/lib/deal-strategy";
import type { InterestKind } from "@/lib/interest";

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
// What one is called: a unit, a door, a key, a bed, a pad, an apartment, a
// home, a space — each class's own word (lib/asset-words).
const UNIT_WORD = String.raw`(?:unit|door|key|bed|room|pad|site|lot|apartment|apt\.?|home|space|stall|suite)s?`;
// A foot of building, as a comp states it: SF, RSF / NRSF / GSF / NSF, a
// square foot, or a foot alone.
const SF_WORD = String.raw`(?:(?:n?r|g|n)?sf|s\.f\.|sq\.?\s*ft\.?|square\s+f(?:oo|ee)t|f(?:oo|ee)t|ft)`;
// A figure per month, per year, per night is a rent, never a price:
// "$1,200 per unit per month", "$25/SF/yr".
const NOT_A_RENT = String.raw`(?!\s*(?:/|per|an?|each)?\s*(?:mo(?:nth)?|yr|year|annum|annual(?:ly)?|monthly|day|night|week)\b)`;
// "$252,000 per unit", "$252K/door", "$252,000 a unit".
const PER_UNIT = new RegExp(String.raw`${MONEY}\s*(?:/|per|an?|each)\s*${UNIT_WORD}\b${NOT_A_RENT}`, "i");
// "Price/Unit: $252,000", "$/door $252K", "PPU $252K".
const UNIT_LABEL_FIRST = new RegExp(
  String.raw`(?:\bprice\s*(?:/|per)\s*${UNIT_WORD}|\$\s*/\s*${UNIT_WORD}|\bppu)\b\s*(?:of|:|=|was|is)?\s*${MONEY}`,
  "i",
);
// "$410/SF", "$410 psf", "$410/RSF", "$410 a foot".
const PER_SF = new RegExp(String.raw`${MONEY}\s*(?:(?:/|per|an?)\s*${SF_WORD}|p\.?s\.?f\.?)\b${NOT_A_RENT}`, "i");
// "Price/SF: $410", "$/SF $410", "PSF $410".
const SF_LABEL_FIRST = new RegExp(
  String.raw`(?:\bprice\s*(?:/|per)\s*${SF_WORD}|\$\s*/\s*${SF_WORD}|\bp\.?p?s\.?f\.?)\b\s*(?:of|:|=|was|is)?\s*${MONEY}`,
  "i",
);
// "5.4% cap", "5.40% going-in cap", "a 5.4 cap" — the figure right before
// the word, a percent sign or not; never a year ("2023 cap ex") or capex.
const CAP_AFTER = /(?<![\d.$,])(\d{1,2}(?:\.\d{1,2})?)\s*%?\s*(?:going[- ]in\s+)?cap\b(?!\s*-?\s*ex)/i;
// "cap rate of 5.4%", "cap rate was approximately 5.4%", "cap: 5.4%".
const CAP_BEFORE =
  /\bcap(?:\s*rate)?\s*(?:(?:of|was|is|at|@|:|around|about|approximately|approx\.?|roughly|near|~)\s*){0,2}(\d{1,2}(?:\.\d+)?)\s*%/i;
// A cap stated as a range — "5.25%-5.75% cap", "5.25 to 5.75% cap" — is no
// single cap, and is read as none rather than as either end.
const CAP_RANGE = /(\d{1,2}(?:\.\d+)?)\s*%?\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d+)?)\s*%?\s*(?:going[- ]in\s+)?cap\b/i;
const CAP_RANGE_AFTER = /\bcap(?:\s*rate)?\s*(?:of|:|at|@)?\s*(\d{1,2}(?:\.\d+)?)\s*%?\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d+)?)\s*%/i;

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

  const unitMatch = text.match(PER_UNIT) ?? text.match(UNIT_LABEL_FIRST);
  const unit = unitMatch ? money(unitMatch) : null;
  const sfMatch = text.match(PER_SF) ?? text.match(SF_LABEL_FIRST);
  const sf = sfMatch ? money(sfMatch) : null;
  const ranged = CAP_RANGE.test(text) || CAP_RANGE_AFTER.test(text);
  const capMatch = ranged ? null : (text.match(CAP_AFTER) ?? text.match(CAP_BEFORE));
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
 *  basis to set against stabilized trades: both come back null. An
 *  outdoor-storage yard has no per-SF basis: it trades by the usable acre,
 *  and its price over the shop building on it is no figure to tick. */
export function subjectBasis(
  metrics: MetricLike[],
  kind: StrategyKind,
  /** what the price buys (lib/interest `interestOf`, #414): a note's price
   *  is nobody's basis, a leased fee's buys the land alone (#415), and a
   *  share's is grossed up to the whole the building's count and area
   *  describe — or withheld with no stated share */
  interest?: { kind: InterestKind; sharePct: number | null },
  /** the deal's class in the deck's own words (`ExtractionResult.assetClass`),
   *  read for an outdoor-storage yard (lib/deal-strategy
   *  `isOutdoorStorageYard`) */
  assetClass?: string | null,
): SubjectBasis {
  const none = { perUnit: null, perSf: null };
  if (kind === "conversion" || kind === "development") return none;
  if (interest?.kind === "note" || interest?.kind === "leased_fee") return none;
  if (interest?.kind === "partial_interest" && interest.sharePct == null) return none;
  const row = findPricedMetric(metrics, kind);
  const stated = row ? parsePrice(row.value) : null;
  if (stated == null || stated < 10_000) return none;
  const price = interest?.sharePct != null ? stated / (interest.sharePct / 100) : stated;
  const units = unitCountFromMetrics(metrics);
  const sf = isOutdoorStorageYard(assetClass) ? null : buildingSfFromMetrics(metrics);
  return {
    perUnit: units != null && units > 0 ? Math.round(price / units) : null,
    perSf: sf != null && sf > 0 ? Math.round(price / sf) : null,
  };
}

export interface BasisScale {
  /** the yardstick the set is drawn on — per unit when any comp states one */
  unit: "unit" | "sf";
  /** what a unit is called on this deal (lib/asset-words) — "key", "pad";
   *  printed in the captions, never computed on */
  noun: string;
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
  noun = "unit",
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
    noun,
    max,
    shares: values.map((v) => (v != null ? Math.min(1, v / max) : null)),
    subjectShare: subjectValue != null ? Math.min(1, subjectValue / max) : null,
    subjectValue,
  };
}

/** "$274k/unit", "$410/SF" or, given the class's noun, "$274k/key" — the
 *  caption a bar's tooltip uses. */
export function fmtBasis(value: number, unit: "unit" | "sf", noun = "unit"): string {
  if (unit === "sf") return `$${Math.round(value).toLocaleString("en-US")}/SF`;
  return value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M/${noun}`
    : `$${Math.round(value / 1_000).toLocaleString("en-US")}k/${noun}`;
}
