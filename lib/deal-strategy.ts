/**
 * What kind of deal this is, and whether its headline figures can all be true
 * at once. Pure code over the extraction — no LLM, no I/O.
 *
 * Why this exists: an office-to-multifamily conversion came through the
 * screen with "Year 1 NOI $21M" against a $20M asking price — a 105% cap
 * rate, displayed as fact. The $21M was the sponsor's stabilized pro forma
 * for the finished residential building, three years and a construction
 * budget away; the extraction had labelled it as income, and every surface
 * downstream (the model, the debt sizer, the workbook) capitalised it
 * against the acquisition price as if the building produced it today.
 *
 * Two rules now:
 *
 *   1. Every deal has a STRATEGY (stabilized / value-add / lease-up /
 *      conversion / development), read from the extraction when the OM
 *      states one and inferred from the deck's own words otherwise. A
 *      stabilized pro forma is only comparable to the acquisition price on a
 *      stabilized deal; on anything else it belongs over total cost.
 *   2. Figures are checked against each other before they are believed. An
 *      NOI at or above a quarter of the price, a stated cap that disagrees
 *      with NOI ÷ price, a per-unit price outside any market — each is
 *      named on the deal page and put to the challenger and the verdict, so
 *      the screen says "these can't both be right" instead of "105%".
 */

import type { ExtractionResult } from "@/lib/anthropic/types";
import { METRIC_FIND, buildingSfFromMetrics, findMetric, parseMoney, parsePct } from "@/lib/criteria";

export type StrategyKind =
  | "stabilized"
  | "value_add"
  | "lease_up"
  | "conversion"
  | "development"
  | "unknown";

export interface DealStrategy {
  kind: StrategyKind;
  /** short display label, e.g. "Conversion" */
  label: string;
  /** the plan in the OM's own terms ("" when nothing was stated or inferred) */
  summary: string;
  /** where the read came from */
  source: "extraction" | "inferred" | "none";
}

export const STRATEGY_LABEL: Record<StrategyKind, string> = {
  stabilized: "Stabilized",
  value_add: "Value-add",
  lease_up: "Lease-up",
  conversion: "Conversion",
  development: "Development",
  unknown: "Unknown",
};

/** One line on what the strategy means for reading the figures. */
export const STRATEGY_READING: Record<StrategyKind, string> = {
  stabilized: "An operating asset bought for its in-place income; NOI ÷ price is the going-in cap.",
  value_add: "In-place income plus a renovation program; the stabilized NOI belongs over price plus the budget, not over price alone.",
  lease_up: "Largely vacant space to be leased; little in-place income, so the stabilized NOI is a forward figure over total cost.",
  conversion: "A change of use with construction and downtime first; expect little or no NOI through the works, and read the stabilized NOI as a yield on total cost.",
  development: "Ground-up or to-be-built; there is no in-place income, only a budget, a timeline and a stabilized pro forma.",
  unknown: "",
};

/** How far above the price an NOI can sit before the two cannot describe the
 *  same stabilized building. A 25% cap rate does not exist for an operating
 *  US property; anything past it is a pro forma on a different basis or a
 *  misread. */
export const IMPLIED_CAP_CEILING = 0.25;

interface MetricLike {
  label: string;
  value: string;
  basis?: string;
  page?: string;
}

// ── Strategy ─────────────────────────────────────────────────────────────

const RX = {
  conversion:
    /\b(conversion|convert(ed|ing|s)?|adaptive re-?use|office[- ]to[- ](resi|multi|apartment|residential)|to residential|change of use|redevelop(ment|ed)?)\b/i,
  development:
    /\b(ground[- ]?up|development (site|opportunity|parcel)|to[- ]be[- ]built|proposed (development|project|building|tower)|shovel[- ]ready|fully entitled|entitled (site|land)|land (sale|site)|construction loan)\b/i,
  leaseUp: /\b(lease[- ]?up|spec (building|suite|space)|shell (space|condition)|vacant (building|asset|space)|100% vacant)\b/i,
  // "renovation", "renovate", "renovating" describe a plan; "renovated"
  // describes what was done — a newly renovated building is stabilized.
  valueAdd:
    /\b(value[- ]?add|renovat(ion|e|ing)|reposition(ing|ed)?|upgrade program|interior upgrades|unit upgrades|heavy lift|rehab(ilitation)?|capital program)\b/i,
};

// Identity rows — "Year built / renovated", "Renovation year", "Vintage" —
// describe the building's history, not a plan; they never count as evidence
// of one.
const IDENTITY_ROW =
  /year (built|renovated|completed|constructed|of construction)|(built|renovated|completed|constructed) (in|year|date)|renovation (year|date)|vintage/i;

function haystack(
  extraction: ExtractionResult | null,
  signal?: { take?: string; dealName?: string | null } | null,
): string {
  const bits: string[] = [];
  if (extraction) {
    bits.push(extraction.dealName ?? "");
    bits.push(extraction.buyerNotes ?? "");
    bits.push(extraction.strategy?.summary ?? "");
    // A row saved before the extraction carried metrics has none: read the
    // words it does have rather than fail on the array it lacks.
    for (const m of extraction.metrics ?? []) {
      if (IDENTITY_ROW.test(m.label)) continue;
      bits.push(m.label, m.value);
    }
  }
  if (signal) bits.push(signal.take ?? "", signal.dealName ?? "");
  return bits.join(" \n ");
}

/**
 * The deal's strategy. The extraction's own read wins when it exists and is
 * not "unknown"; otherwise the deck's words decide, most specific first
 * (a conversion is also value-add and also a lease-up — name the plan).
 * With metrics but no plan words, the deal is an operating asset:
 * stabilized. With nothing at all, unknown — never guessed.
 */
export function inferStrategy(
  extraction: ExtractionResult | null,
  signal?: { take?: string; dealName?: string | null } | null,
): DealStrategy {
  const stated = extraction?.strategy;
  if (stated && stated.kind !== "unknown") {
    return {
      kind: stated.kind,
      label: STRATEGY_LABEL[stated.kind],
      summary: stated.summary?.trim() ?? "",
      source: "extraction",
    };
  }
  const text = haystack(extraction, signal);
  const hasMetrics = (extraction?.metrics?.length ?? 0) > 0;
  if (!text.trim()) return { kind: "unknown", label: STRATEGY_LABEL.unknown, summary: "", source: "none" };

  let kind: StrategyKind;
  if (RX.conversion.test(text)) kind = "conversion";
  else if (RX.development.test(text)) kind = "development";
  else if (RX.leaseUp.test(text)) kind = "lease_up";
  else if (RX.valueAdd.test(text)) kind = "value_add";
  // A land sale — a land or site price and no income figure — is a
  // development, not an operating asset with no price.
  else if (hasMetrics && isLandOnly(extraction?.metrics ?? [])) kind = "development";
  else if (hasMetrics) kind = "stabilized";
  else return { kind: "unknown", label: STRATEGY_LABEL.unknown, summary: "", source: "none" };

  return {
    kind,
    label: STRATEGY_LABEL[kind],
    summary: stated?.summary?.trim() || (kind === "stabilized" ? "" : STRATEGY_READING[kind]),
    source: "inferred",
  };
}

// ── NOI figures ──────────────────────────────────────────────────────────

export type NoiKind = "in_place" | "year1" | "stabilized";

export interface NoiFigure {
  kind: NoiKind;
  label: string;
  value: number;
  page?: string;
}

const NOI_INCLUDE = /net operating income|\bnoi\b/i;
// Per-unit / per-SF figures, margins and growth rates are not the NOI.
const NOI_EXCLUDE = /\bper\b|\/|psf|unit|margin|growth|debt|yield|multiple/i;
const NOI_STABILIZED =
  /stabili[sz]|pro ?forma|forward|projected|post[- ]?(conversion|renovation|reno|construction|completion)|at (completion|stabilization)|untrended|year ?[2-9]|\byr ?[2-9]\b|\by[2-9]\b/i;
const NOI_IN_PLACE = /t-?12|ttm|trailing|in[- ]?place|current|actual|historical|as[- ]is|run[- ]rate/i;

/** Which NOI a metric is — or null when it is not an NOI figure at all. */
export function classifyNoi(m: MetricLike): NoiKind | null {
  if (!NOI_INCLUDE.test(m.label) || NOI_EXCLUDE.test(m.label)) return null;
  if (NOI_STABILIZED.test(m.label)) return "stabilized";
  if (NOI_IN_PLACE.test(m.label) || m.basis === "in_place") return "in_place";
  // A bare "NOI" — tagged pro forma or not — is the sponsor's year-one figure.
  return "year1";
}

/** Every parseable NOI in the extraction, classified. Order preserved. */
export function noiFigures(metrics: MetricLike[]): NoiFigure[] {
  const out: NoiFigure[] = [];
  for (const m of metrics) {
    const kind = classifyNoi(m);
    if (!kind) continue;
    const value = parseMoney(m.value);
    if (value == null || !Number.isFinite(value)) continue;
    out.push({ kind, label: m.label, value, page: m.page });
  }
  return out;
}

// ── Plausibility ─────────────────────────────────────────────────────────

export type FindingCode =
  | "noi_exceeds_price"
  | "implied_cap_impossible"
  | "label_mismatch"
  | "strategy_unsettled"
  | "cap_mismatch"
  | "basis_out_of_band"
  | "no_income_in_place";

export interface PlausibilityFinding {
  code: FindingCode;
  severity: "high" | "medium";
  /** the claim, short */
  title: string;
  /** what it means and what to do */
  detail: string;
}

const money = (n: number): string =>
  Math.abs(n) >= 1e6
    ? `$${(n / 1e6).toFixed(1)}M`
    : Math.abs(n) >= 1e3
      ? `$${Math.round(n / 1e3)}k`
      : `$${Math.round(n)}`;
const pct = (x: number, dp = 1): string => `${(x * 100).toFixed(dp)}%`;

// The one price reader — shared with the buy-box check, the mandate score
// and every summary slot through lib/criteria's METRIC_FIND, so no surface
// reads a different row as "the price" than the next one.
const PRICE_INCLUDE = METRIC_FIND.price.inc;
const PRICE_EXCLUDE = METRIC_FIND.price.exc;
const CAP_INCLUDE = /going[- ]?in cap|^cap rate|\bcap\b/i;
// Not the going-in cap: the exit, an expense cap, a rate cap — and on a plan
// deal the stabilized / pro forma cap or the yield on cost, which describe
// the finished project, not the price being paid today.
const CAP_EXCLUDE = /exit|reversion|terminal|expense|capex|capital|rate cap|stabili[sz]|pro ?forma|forward|projected|yield/i;

const NON_STABILIZED: ReadonlySet<StrategyKind> = new Set([
  "value_add",
  "lease_up",
  "conversion",
  "development",
]);

/** A deal with a plan: the stabilized figures describe the finished project. */
export const isPlanDeal = (kind: StrategyKind): boolean => NON_STABILIZED.has(kind);

// ── The plan's cost ──────────────────────────────────────────────────────

const BUDGET_INCLUDE =
  /renovation (budget|cost|plan)|capex budget|capital (budget|plan|improvements?|expenditures?)|construction (cost|budget)|hard costs?|redevelopment (cost|budget)|conversion (cost|budget)|improvement budget|total (project|development) cost|all[- ]?in (cost|basis)/i;
const BUDGET_EXCLUDE = /\bper\b|\/|psf|unit|reserve|annual|\byr\b|year/i;
const ALL_IN = /total (project|development) cost|all[- ]?in/i;

export interface CapitalBudget {
  /** the plan's spend, $ — excludes the price even when the OM stated an all-in figure */
  budget: number;
  /** the OM stated a total that included the price, and the price was taken out */
  allIn: boolean;
  /** the OM stated an all-in total but no price, so nothing could be taken
   *  out: `budget` IS the stated total cost, with the acquisition inside it */
  isTotal?: boolean;
  label: string;
  page?: string;
}

/**
 * The plan's cost from the metrics. A "total project cost" includes the
 * price; a budget line does not. Bounded so a mis-parsed figure never lands
 * here (nothing, or ten times the price, is not a budget) — and never
 * invented: absent is absent.
 */
export function capitalBudgetFromMetrics(metrics: MetricLike[], price: number | null): CapitalBudget | null {
  const m = findMetric(metrics, BUDGET_INCLUDE, BUDGET_EXCLUDE) as MetricLike | null;
  if (!m) return null;
  const raw = parseMoney(m.value);
  if (raw == null || !(raw > 0)) return null;
  const statedAllIn = ALL_IN.test(m.label);
  // An all-in figure with no price to take out of it stands as the total
  // cost itself — flagged, so no surface calls it "less the price".
  const allIn = statedAllIn && price != null;
  const budget = statedAllIn && price != null ? raw - price : raw;
  if (!(budget > 0)) return null;
  if (price != null && budget > price * 10) return null;
  return { budget, allIn, isTotal: statedAllIn && price == null, label: m.label, page: m.page };
}

// A ground-up development buys land, and its OM says "land cost" or "site
// acquisition" where a building's OM says "asking price" — as does a land
// deal that never stated a strategy. That line is the price only when the
// OM states no asking price at all, and never an appraised land VALUE,
// which on an operating asset is an allocation, not what is being bought.
const LAND_PRICE_INCLUDE = /\b(land|site) (cost|price|acquisition|purchase|basis)\b/i;
const LAND_PRICE_EXCLUDE = /value|\bper\b|\/|psf|acre|\bsf\b/i;

/** The price metric: the asking / purchase price, else — on a development
 *  only, which a bare land OM now infers — the land or site cost. Null when
 *  the OM states neither: on an operating asset a land line is an
 *  allocation inside the basis, never the price. */
export function findPriceMetric(metrics: MetricLike[], kind: StrategyKind): MetricLike | null {
  return (
    (findMetric(metrics, PRICE_INCLUDE, PRICE_EXCLUDE) as MetricLike | null) ??
    (kind === "development"
      ? (findMetric(metrics, LAND_PRICE_INCLUDE, LAND_PRICE_EXCLUDE) as MetricLike | null)
      : null)
  );
}

// An OM whose only price is a land or site line and which carries no income
// figure at all — no NOI, cap rate, occupancy, rent or revenue — is selling
// land, not an operating asset. Read as a development, so its land price
// is its price; read as "stabilized" it would have none.
const INCOME_ROW =
  /\bnoi\b|net operating income|cap rate|occupan|\brent|\begi\b|revenue|income|cash ?flow|\bncf\b|debt yield|dscr|expense|opex|\bleased\b/i;

function isLandOnly(metrics: MetricLike[]): boolean {
  if (!metrics.length) return false;
  if (findMetric(metrics, PRICE_INCLUDE, PRICE_EXCLUDE)) return false;
  if (!findMetric(metrics, LAND_PRICE_INCLUDE, LAND_PRICE_EXCLUDE)) return false;
  return !metrics.some((m) => INCOME_ROW.test(m.label));
}

const MONEY_IN_TEXT = /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mm|m|k|b)?\b/i;

/**
 * The budget from the extraction's own words when no metric row carried it:
 * `strategy.capitalBudget` is free text ("$160M hard and soft costs",
 * "approximately $180 million total project cost"). Same rules as the metric
 * reader — an all-in figure has the price taken out, a fragment that cannot
 * be a budget (a per-SF rate, ten times the price) never lands, absent is
 * absent. No page: the text is the OM's summary, not a cited line.
 */
export function budgetFromText(text: string | null | undefined, price: number | null): CapitalBudget | null {
  if (!text) return null;
  const m = text.match(MONEY_IN_TEXT);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? "").toLowerCase();
  const mult = unit.startsWith("b")
    ? 1e9
    : unit.startsWith("m")
      ? 1e6
      : unit === "k" || unit === "thousand"
        ? 1e3
        : 1;
  const raw = n * mult;
  if (raw < 10_000) return null; // "$50/SF" is a rate, not a budget
  const statedAllIn = ALL_IN.test(text);
  const allIn = statedAllIn && price != null;
  const budget = statedAllIn && price != null ? raw - price : raw;
  if (!(budget > 0)) return null;
  if (price != null && budget > price * 10) return null;
  const isTotal = statedAllIn && price == null;
  return {
    budget,
    allIn,
    isTotal,
    label: isTotal ? "stated total project cost" : "stated capital budget",
  };
}

const TIMELINE_ROW =
  /construction (period|timeline|duration|schedule|start|completion)|(lease|rent)[- ]?up (period|duration|timeline)|(months|years) to (stabili[sz]|complet)|stabili[sz](ation|ed)? (year|date|in|by)|delivery (date|year)|completion (date|year)/i;

/** The plan's timing from metric rows, when the strategy text states none:
 *  "Construction period: 30 months; Stabilized in: year 4". "" when no row
 *  speaks to timing — never a guess. */
export function timelineFromMetrics(metrics: MetricLike[]): string {
  return metrics
    .filter((m) => TIMELINE_ROW.test(m.label) && m.value.trim() && !/^(—|-|n\/?a)$/i.test(m.value.trim()))
    .map((m) => `${m.label.trim()}: ${m.value.trim()}`)
    .join("; ");
}

// A row COUNTS the units only when its label, read whole, has the shape of
// a count label: an optional "total" / "number of" / "#" prefix, an
// optional physical qualifier (residential, apartment, rental, guest,
// storage, student …), the noun (units, doors, keys, rooms, beds, pads,
// sites, suites, apartments, homes, lots, spaces) and nothing after it but
// "count" / "total" / "proposed" / "planned". Everything that merely
// mentions units — "Unit mix", "Unit sizes", "Units per acre", a price per
// unit — and every PARTIAL count — "Vacant units", "Affordable units",
// "Units under renovation", "Units offline", "Units (Phase I)" — is not the
// count, and reading one as the count puts a wrong basis on every per-unit
// surface. Whitelisting the shape beats blacklisting adjectives: the next
// OM's "Units delivered" needs no new word.
const COUNT_LABEL =
  /^(?:(?:total|net rentable|rentable|gross|overall)\s+)?(?:(?:number|no\.?|count|#)\s+(?:of\s+)?)?(?:total\s+)?(?:(?:proposed|planned|existing|current|as[- ]built|approved|entitled|zoned|permitted)\s+)?(?:(?:residential|apartment|apt\.?|rental|multi[- ]?family|dwelling|leasable|rentable|living|guest|hotel|storage|self[- ]storage|student|mobile[- ]home|manufactured[- ]home|mh|rv|senior(?: living)?)\s+)?(?:units?|doors?|keys?|rooms?|guest ?rooms?|beds?|pads?|sites?|home ?sites?|suites?|apartments?|apartment homes?|homes?|lots?|spaces?)(?:\s+(?:count|total|proposed|planned))?$/i;
// A parenthetical naming a subset — "(Phase I)", "(Building A)", "(of 312)"
// — keeps the row from being the count; any other ("(proposed)", "(per
// OM)", "(IL/AL/MC)") is dropped before the shape is read.
const SUBSET_PAREN = /phase|bldg|building|tower|wing|floor|\bof\b|\d/i;

/** Whether a metric label is the row that counts the units (or keys, beds,
 *  pads, sites …) — the whole count, never a subset or a row about them. */
export function isCountLabel(label: string): boolean {
  let s = label.toLowerCase().trim();
  for (const p of s.match(/\([^)]*\)/g) ?? []) if (SUBSET_PAREN.test(p)) return false;
  s = s
    .replace(/\([^)]*\)/g, " ")
    .replace(/[—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:.]+$/, "")
    .trim();
  // "Keys / Rooms", "Units / Keys", "Total Beds / Units": two count nouns
  // either side of a slash are one count label; "Units / SF" is not.
  if (s.includes("/")) return s.split("/").every((part) => COUNT_LABEL.test(part.trim()));
  return COUNT_LABEL.test(s);
}

// A count is a whole number, on its own or with what it counts — "312",
// "312 units", "248-unit", "312 (proposed)", "approx. 300 apartments",
// "248 total". Anything else ("40% studio / 60% 1BR", "650–1,200 SF",
// "312 / 285,000 SF", "248 (of 312)") is not the whole count, and reading
// its first digits as one puts a wrong basis on every per-unit surface.
const COUNT_WORD =
  /\b(units?|keys?|doors?|apartments?|apts?|homes?|residences?|beds?|pads?|rooms?|sites?|lots?|spaces?|suites?|total)\b/gi;
const COUNT_PREFIX = /^(approx(imately|\.)?|about|circa|c\.|~|≈|±)\s*/i;

/** A whole-number count from a metric's value, or null when the value is
 *  not one (a zero is not a count — a blank is null, never zero). Exported
 *  so every surface that needs a count reads it the same way. */
export function parseCount(value: string): number | null {
  // "248 (of 312)" is a subset of a count, and "312 units (Phase I)" a
  // phase's, not the count; "312 units (285 market-rate, 27 affordable)"
  // is the count with its breakdown.
  for (const p of value.match(/\([^)]*\)/g) ?? []) {
    if (/\bof\b|out of|\/|phase|bldg|building|tower|wing|floor/i.test(p)) return null;
  }
  const s = value
    .replace(/^[a-z][a-z .#]*:\s*/i, "") // "Units: 248"
    .replace(/\([^)]*\)/g, " ")
    .replace(/(\d)[-–](?=[a-z])/gi, "$1 ") // "248-unit"
    .replace(COUNT_WORD, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(COUNT_PREFIX, "")
    .replace(/\+$/, "")
    .replace(/\.0+$/, "")
    .trim();
  if (!/^(\d{1,3}(,\d{3})+|\d+)$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** The row that counts the units — the first row that IS a count, so a
 *  "Unit mix" row ahead of "Units" never shadows it — or null. For surfaces
 *  that show the OM's own wording ("248 units", "612 (proposed)") or cite
 *  its page. */
export function unitCountRow(metrics: MetricLike[]): MetricLike | null {
  for (const m of metrics) {
    if (!isCountLabel(m.label)) continue;
    const n = parseCount(m.value);
    if (n != null && n >= 1 && n <= 50_000) return m;
  }
  return null;
}

/** The unit count — on a plan deal the finished product's ("Units
 *  (proposed)") — as a positive number, or null when no row parses. One
 *  reader for the plan summary, analytics, the deal context, the comp and
 *  market memories, the plausibility check and the Excel model, so every
 *  per-unit figure divides by the same count. */
export function unitCountFromMetrics(metrics: MetricLike[]): number | null {
  const row = unitCountRow(metrics);
  return row ? parseCount(row.value) : null;
}

/** What the OM says the finished project earns and costs — the figures a
 *  plan is judged on, for the deal page and for the challenger's brief. */
export interface PlanSummary {
  kind: StrategyKind;
  price: number | null;
  /** what the price figure is: the asking / purchase price, or on a ground-up
   *  development the land or site cost */
  priceLabel: "Price" | "Land cost";
  /** the stabilized pro forma NOI, when the OM states one */
  stabilizedNoi: NoiFigure | null;
  budget: CapitalBudget | null;
  /** price + budget, when both are known */
  totalCost: number | null;
  /** stabilized NOI ÷ total cost, decimal, when both are known */
  yieldOnCost: number | null;
  /** the finished product's unit count, when the OM states one */
  units: number | null;
  /** total cost over the planned units — the basis a comp or a per-unit
   *  norm is held against on a plan deal; null when either is unknown */
  costPerUnit: number | null;
  /** construction / downtime / lease-up timing as the OM states it ("" if none) */
  timeline: string;
  /** the budget as the OM words it ("" if none) */
  capitalBudgetText: string;
}

/** Null for a stabilized asset (nothing to summarize) or a missing extraction. */
export function planSummary(
  extraction: ExtractionResult | null,
  strategy: DealStrategy = inferStrategy(extraction),
): PlanSummary | null {
  if (!extraction || !isPlanDeal(strategy.kind)) return null;
  const metrics = extraction.metrics ?? [];
  const priceMetric = findPriceMetric(metrics, strategy.kind);
  const priceRaw = priceMetric ? parseMoney(priceMetric.value) : null;
  const price = priceRaw != null && priceRaw > 0 ? priceRaw : null;
  const stabilizedNoi = noiFigures(metrics).find((f) => f.kind === "stabilized") ?? null;
  // A metric row with its page first; the strategy's own wording when the
  // budget appears nowhere else.
  const budget =
    capitalBudgetFromMetrics(metrics, price) ??
    budgetFromText(extraction.strategy?.capitalBudget, price);
  // Price plus the works; or, when the OM states an all-in total and no
  // price, that total itself — a yield on cost needs no split of the two.
  const totalCost =
    price != null && budget ? price + budget.budget : budget?.isTotal ? budget.budget : null;
  const yieldOnCost =
    stabilizedNoi && totalCost != null && totalCost > 0 ? stabilizedNoi.value / totalCost : null;
  const units = unitCountFromMetrics(metrics);
  return {
    kind: strategy.kind,
    price,
    priceLabel: priceMetric && /\b(land|site)\b/i.test(priceMetric.label) ? "Land cost" : "Price",
    stabilizedNoi,
    budget,
    totalCost,
    yieldOnCost,
    units,
    costPerUnit: totalCost != null && units != null ? totalCost / units : null,
    // The strategy's own words first; else the metric rows the extraction
    // was asked to capture on a plan deal (construction period, lease-up,
    // the year the plan stabilizes), joined as "label: value".
    timeline: extraction.strategy?.timeline?.trim() || timelineFromMetrics(metrics),
    capitalBudgetText: extraction.strategy?.capitalBudget?.trim() ?? "",
  };
}

/**
 * Check the extraction's headline figures against each other. Returns the
 * findings, most severe first, deduplicated by code. Empty when the figures
 * tie — or when there is no price to test them against (silence, not a
 * verdict: a blank is never zero).
 */
export function assessPlausibility(
  extraction: ExtractionResult | null,
  strategy: DealStrategy = inferStrategy(extraction),
): PlausibilityFinding[] {
  if (!extraction) return [];
  const metrics = extraction.metrics ?? [];
  const priceMetric = findPriceMetric(metrics, strategy.kind);
  const price = priceMetric ? parseMoney(priceMetric.value) : null;
  if (price == null || !(price > 0)) return [];

  const findings: PlausibilityFinding[] = [];
  const planDeal = NON_STABILIZED.has(strategy.kind);
  const figs = noiFigures(metrics);

  // 1. An NOI far above what this price could ever yield. What that MEANS
  //    depends on the deal. On a conversion, development, lease-up or
  //    value-add, the stabilized pro forma is expected to dwarf the price —
  //    a $21M finished-building NOI on a $20M shell is the plan, not a
  //    contradiction, and it is judged elsewhere (yield on total cost, the
  //    challenger's brief). The only problem on a plan deal is a figure
  //    labelled as TODAY's income that size. On a deal read as stabilized, a
  //    stabilized figure that size means the strategy is unsettled, and an
  //    in-place / Year-1 figure that size is a misread.
  for (const f of figs) {
    const implied = f.value / price;
    if (implied < IMPLIED_CAP_CEILING) continue;
    if (planDeal) {
      if (f.kind === "stabilized") continue;
      findings.push({
        code: "label_mismatch",
        severity: "medium",
        title: `${f.label} of ${money(f.value)} is ${pct(implied, 0)} of the ${money(price)} price on a ${strategy.label.toLowerCase()} deal`,
        detail: `A building mid-plan does not earn that today. This is almost certainly the finished project's stabilized pro forma carrying an in-place or Year-1 label — read it as the stabilized figure, and confirm what the building actually earns during the works.`,
      });
      continue;
    }
    if (f.kind === "stabilized") {
      findings.push({
        code: "strategy_unsettled",
        severity: "medium",
        title: `${f.label} of ${money(f.value)} is ${pct(implied, 0)} of the ${money(price)} price`,
        detail: `A stabilized figure that far above the price belongs to a plan — a conversion, a development, a lease-up — that the deck does not name plainly. Settle what the deal is first: measured against total cost it may be a fine yield; against the price alone it means nothing.`,
      });
      continue;
    }
    findings.push({
      code: f.value >= price ? "noi_exceeds_price" : "implied_cap_impossible",
      severity: "high",
      title:
        f.value >= price
          ? `${f.label} of ${money(f.value)} is above the ${money(price)} price`
          : `${f.label} of ${money(f.value)} implies a ${pct(implied, 0)} cap rate`,
      detail: `No operating property yields ${pct(implied, 0)}. Either the NOI or the price was misread, or the OM's NOI is a stabilized pro forma for a plan the deck describes elsewhere. Check the source pages before relying on any return built from these two figures.`,
    });
  }

  // 2. A stated going-in cap that disagrees with NOI ÷ price.
  const capMetric = findMetric(metrics, CAP_INCLUDE, CAP_EXCLUDE);
  const capPctRaw = capMetric ? parsePct(capMetric.value) : null;
  const statedCap =
    capPctRaw != null && capPctRaw / 100 > 0.005 && capPctRaw / 100 <= IMPLIED_CAP_CEILING
      ? capPctRaw / 100
      : null;
  const going = figs.find((f) => f.kind === "in_place") ?? figs.find((f) => f.kind === "year1");
  if (statedCap != null && going) {
    const implied = going.value / price;
    if (implied < IMPLIED_CAP_CEILING && Math.abs(implied - statedCap) > 0.015) {
      findings.push({
        code: "cap_mismatch",
        severity: "medium",
        title: `Stated ${pct(statedCap, 2)} cap vs ${pct(implied, 2)} from ${going.label} ÷ price`,
        detail: `The stated cap rate and the stated NOI and price do not describe the same figures — one is on a different basis (a different year, before or after reserves, or a different price). Ask which NOI the cap is quoted on.`,
      });
    }
  }

  // 3. A per-unit or per-SF price outside any US market — a misparse. The
  //    shared count reader: a "Unit mix" or "Vacant units" row read as the
  //    count would manufacture this finding on a sound deal.
  const units = unitCountFromMetrics(metrics);
  const sf = buildingSfFromMetrics(metrics);
  const cls = (extraction.assetClass ?? "").toLowerCase();
  if (cls === "multifamily" && units != null && units >= 1 && units <= 50_000) {
    const perUnit = price / units;
    if (perUnit < 15_000 || perUnit > 2_500_000) {
      findings.push({
        code: "basis_out_of_band",
        severity: "medium",
        title: `${money(price)} over ${Math.round(units).toLocaleString("en-US")} units is ${money(perUnit)} per unit`,
        detail: `No multifamily market trades there. The price or the unit count was most likely misread — check both against their source pages before the basis is used anywhere.`,
      });
    }
  } else if (cls && cls !== "multifamily" && sf != null && sf > 100) {
    const perSf = price / sf;
    if (perSf < 5 || perSf > 3_000) {
      findings.push({
        code: "basis_out_of_band",
        severity: "medium",
        title: `${money(price)} over ${Math.round(sf).toLocaleString("en-US")} SF is $${perSf < 10 ? perSf.toFixed(2) : Math.round(perSf).toLocaleString("en-US")} per SF`,
        detail: `Outside any ${cls} market. The price or the building size was most likely misread — check both against their source pages before the basis is used anywhere.`,
      });
    }
  }

  // 4. A stabilized deal with no income in place reads as something else.
  if (strategy.kind === "stabilized" && going && going.value <= 0) {
    findings.push({
      code: "no_income_in_place",
      severity: "medium",
      title: `${going.label} is ${money(going.value)} on a deal read as stabilized`,
      detail: `An operating asset produces income. Either this is a lease-up, conversion or development the deck does not name plainly, or the figure was misread. Settle the strategy first — every return depends on it.`,
    });
  }

  // Dedupe by code, most severe first, stable within severity.
  const seen = new Set<string>();
  return findings
    .filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

/** The plan's figures as one sentence for the brief — what is stated, and
 *  plainly what is not. */
function planLine(plan: PlanSummary): string {
  const parts: string[] = [];
  parts.push(
    plan.stabilizedNoi
      ? `stabilized NOI ${money(plan.stabilizedNoi.value)} (${plan.stabilizedNoi.label})`
      : "stabilized NOI not stated",
  );
  parts.push(plan.price != null ? `price ${money(plan.price)}` : "price not stated");
  parts.push(
    plan.budget
      ? plan.budget.isTotal
        ? `${money(plan.budget.budget)} all-in (${plan.budget.label}; the OM states no price, so the acquisition inside it is not separable)`
        : `${plan.budget.allIn ? "budget " : ""}${money(plan.budget.budget)}${plan.budget.allIn ? ` (${plan.budget.label} less the price)` : ` (${plan.budget.label})`}`
      : "construction / renovation budget not stated in the figures",
  );
  if (plan.totalCost != null) parts.push(`total cost ${money(plan.totalCost)}`);
  if (plan.yieldOnCost != null) parts.push(`yield on total cost ${pct(plan.yieldOnCost, 1)}`);
  parts.push(plan.timeline ? `timeline: ${plan.timeline}` : "timeline to stabilization not stated");
  if (plan.capitalBudgetText) parts.push(`budget as worded: ${plan.capitalBudgetText}`);
  return parts.join("; ");
}

/**
 * The strategy, the plan's figures and the findings as one paragraph for the
 * challenger and the verdict. Empty when there is nothing to say: a clean
 * stabilized deal.
 */
export function plausibilityNote(
  findings: PlausibilityFinding[],
  strategy: DealStrategy,
  plan: PlanSummary | null = null,
): string {
  const bits: string[] = [];
  if (isPlanDeal(strategy.kind)) {
    bits.push(
      `DEAL STRATEGY: ${strategy.label}${strategy.summary ? ` — ${strategy.summary}` : ""} ${STRATEGY_READING[strategy.kind]}`,
    );
    if (plan) bits.push(`THE PLAN AS THE OM STATES IT: ${planLine(plan)}.`);
    bits.push(
      "The stabilized NOI is the sponsor's post-completion pro forma — not a misread and not today's income, and it is expected to sit far above the acquisition price. Test whether it is as conservative as the deck presents it: the rents and occupancy behind it against today's market, the operating ratio, the construction or renovation budget and schedule against comparable projects, the carry and the income (if any) through the works, and the yield on total cost against the exit cap and against the cost of construction debt. Judge the plan on yield on cost, downtime and execution risk — never on a going-in cap on the acquisition price.",
    );
  }
  if (findings.length) {
    bits.push(
      "FIGURES THAT DO NOT TIE (checked in code, before any judgement): " +
        findings.map((f) => `${f.title}. ${f.detail}`).join(" ") +
        " Treat these as first-order: a return computed from a stabilized pro forma capitalised against the acquisition price is not a return, and any figure built on a misread must not be carried into the verdict.",
    );
  }
  return bits.join(" ");
}
