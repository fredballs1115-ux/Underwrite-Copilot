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

import { withArticle } from "@/lib/article";
import { interestOf } from "@/lib/interest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { assetWords } from "@/lib/asset-words";
import {
  LATER_YEAR,
  METRIC_FIND,
  buildingSfFromMetrics,
  findGoingInCap,
  findMetric,
  findPriceRow,
  isCountLabel,
  parseCount,
  parseMoney,
  parsePct,
  unitCountFromMetrics,
  unitCountRow,
} from "@/lib/criteria";

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
  // The plan's rows with no income for the building as it stands — a
  // construction budget, a total project cost, proposed units beside a
  // stabilized pro forma — are a development the deck never named.
  else if (hasMetrics && hasPlanCostRows(extraction?.metrics ?? []) && !hasTodayIncome(extraction?.metrics ?? []))
    kind = "development";
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
const NOI_EXCLUDE = /\bper\b|psf|unit|margin|growth|debt|yield|multiple/i;
// A slash is a denominator — "NOI / SF", "NOI / RSF", "NOI / key", "NOI /
// EGI", "Price / NOI", "NOI / quarter" — and the figure a rate or a ratio,
// never the NOI, UNLESS what follows the slash names a period or a basis:
// "NOI (T-12 / TTM)", "NOI / cash flow (in place)", "(2025 / 2026 budget)"
// are the whole building's NOI under two names. The list is of the
// period words, so a unit word the list never heard of stays a rate. The
// words are the two classifiers' own (in place: T-12, TTM, trailing,
// current, actual, historical, as-is, run-rate; stabilized: pro forma,
// forward, projected, untrended, at completion, post-…) plus a year with
// its estimate letter ("2026E", "FY26E", "2025A"), a budget, a cash flow,
// an annualized figure, and "(Loss)" — the accounting idiom on an
// "NOI / (Loss)" row, never a denominator.
const PERIOD_WORDS = String.raw`ttm|t-?\d{1,2}|trailing|in[- ]?place|current|actuals?|historical|as[- ]is|run[- ]rate|budget(?:ed)?|pro ?forma|forecast|forward|projected|stabili[sz]ed|untrended|at (?:completion|stabilization)|post[- ]?(?:conversion|renovation|reno|construction|completion)|cash ?flow|fy\s?'?\d{2,4}[a-z]?|(?:19|20)\d{2}[a-z]?|year\s?\d|yr\.?\s?\d|annuali[sz]ed|loss`;
const PERIOD_AFTER_SLASH = new RegExp(String.raw`^\s*\(?(?:${PERIOD_WORDS})\)?(?![a-z])`, "i");

/** True when any slash in the label is followed by something other than a
 *  period or basis word — a denominator, so the figure is a rate. */
function slashMakesRate(label: string): boolean {
  for (let i = label.indexOf("/"); i >= 0; i = label.indexOf("/", i + 1)) {
    if (!PERIOD_AFTER_SLASH.test(label.slice(i + 1))) return true;
  }
  return false;
}
// A later year of the hold ("Year 2", "Yr. 3", "Year 10") is the shared
// LATER_YEAR guard, so this classifier, the cap reader and the strategy
// inference agree on which year is still today's.
const NOI_STABILIZED = new RegExp(
  String.raw`stabili[sz]|pro ?forma|forward|projected|post[- ]?(conversion|renovation|reno|construction|completion)|at (completion|stabilization)|untrended|` +
    LATER_YEAR.source,
  "i",
);
const NOI_IN_PLACE = /t-?12|ttm|trailing|in[- ]?place|current|actual|historical|as[- ]is|run[- ]rate/i;

/** Which NOI a metric is — or null when it is not an NOI figure at all. */
export function classifyNoi(m: MetricLike): NoiKind | null {
  if (!NOI_INCLUDE.test(m.label) || NOI_EXCLUDE.test(m.label) || slashMakesRate(m.label)) return null;
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

// The most a budget can be and still be a budget. Against a whole-asset
// price ten times the price is a misparse; against a LAND price it is a
// Tuesday — an urban high-rise's works run ten to fifty times its site —
// so a land-priced deal is bounded only by this absolute ceiling.
const BUDGET_CEILING = 10_000_000_000;

/** Whether a budget can be the plan's cost beside this price. */
function budgetPlausible(budget: number, price: number | null, priceIsWholeAsset: boolean): boolean {
  if (!(budget > 0) || budget > BUDGET_CEILING) return false;
  if (price != null && priceIsWholeAsset && budget > price * 10) return false;
  return true;
}

/**
 * The plan's cost from the metrics. A "total project cost" includes the
 * price; a budget line does not. Bounded so a mis-parsed figure never lands
 * here (nothing, or ten times a whole-asset price, is not a budget) — and
 * never invented: absent is absent. On a development the price is the
 * LAND cost, routinely a tenth of the works or less, so the ten-times
 * bound applies only when the price is the whole asset's
 * (`priceIsWholeAsset`, which callers read off the price row's label).
 */
export function capitalBudgetFromMetrics(
  metrics: MetricLike[],
  price: number | null,
  priceIsWholeAsset = true,
): CapitalBudget | null {
  const m = findMetric(metrics, BUDGET_INCLUDE, BUDGET_EXCLUDE) as MetricLike | null;
  if (!m) return null;
  const raw = parseMoney(m.value);
  if (raw == null || !(raw > 0)) return null;
  const statedAllIn = ALL_IN.test(m.label);
  // An all-in figure with no price to take out of it stands as the total
  // cost itself — flagged, so no surface calls it "less the price".
  const allIn = statedAllIn && price != null;
  const budget = statedAllIn && price != null ? raw - price : raw;
  if (!budgetPlausible(budget, price, priceIsWholeAsset)) return null;
  return { budget, allIn, isTotal: statedAllIn && price == null, label: m.label, page: m.page };
}

/** Whether a price row is the land or site — a development's acquisition
 *  basis, not the whole asset's price. One test for every reader of the
 *  budget, so they agree on which bound applies. */
export function priceRowIsLand(priceMetric: MetricLike | null | undefined): boolean {
  return priceMetric != null && /\b(land|site)\b/i.test(priceMetric.label);
}

/** The price metric: the asking / purchase price, else — on a development
 *  only, which a bare land OM now infers — the land or site cost. Null when
 *  the OM states neither: on an operating asset a land line is an
 *  allocation inside the basis, never the price. One reader with the buy
 *  box's price band and the mandate ceiling (lib/criteria's findPriceRow),
 *  so the band judges the row the page prints. */
export function findPriceMetric(metrics: MetricLike[], kind: StrategyKind): MetricLike | null {
  return findPriceRow(metrics, kind) as MetricLike | null;
}

/** The asking price as the plausibility check and the model read it — the
 *  one price reader, handed to lib/interest so the "what is being sold"
 *  panel, the deal context and the challenger say the same figure. */
export function askingPriceOf(extraction: ExtractionResult | null | undefined): number | null {
  if (!extraction) return null;
  const row = findPriceMetric(extraction.metrics ?? [], inferStrategy(extraction).kind);
  const n = row ? parseMoney(row.value) : null;
  return n != null && n > 0 ? n : null;
}

/** The price row a figure is wanted from — the LOI's prefill: among the
 *  price rows the first whose value IS a figure ("Asking price: call for
 *  pricing" above "Purchase price: $42,000,000" gives the $42M), else the
 *  shared reader's row, so the letter and the deal page never name two
 *  different rows as the price. */
export function findPricedMetric(metrics: MetricLike[], kind: StrategyKind): MetricLike | null {
  const isFigure = (v: string) => {
    const n = parseMoney(v);
    return n != null && n >= 10_000;
  };
  return (
    metrics.find((x) => PRICE_INCLUDE.test(x.label) && !PRICE_EXCLUDE.test(x.label) && isFigure(x.value)) ??
    findPriceMetric(metrics, kind)
  );
}

/** The first signal's ask, for the price slot before the extraction lands:
 *  the string as the model wrote it when it is a figure, null when it is a
 *  word — "Unpriced", "Call for offers", "TBD" — that no surface should
 *  print where a price goes. */
export function signalAskPrice(signal: { askPrice?: string | null } | null | undefined): string | null {
  const ask = signal?.askPrice?.trim();
  return ask && parseMoney(ask) != null ? ask : null;
}

// An OM whose only price is a land or site line and which carries no income
// figure at all — no NOI, cap rate, occupancy, rent or revenue — is selling
// land, not an operating asset. Read as a development, so its land price
// is its price; read as "stabilized" it would have none.
const INCOME_ROW =
  /\bnoi\b|net operating income|cap rate|occupan|\brent|\begi\b|revenue|income|cash ?flow|\bncf\b|debt yield|dscr|expense|opex|\bleased\b|tenan|\bwalt\b|lease expir|vacan|reimburs|\bt-?12\b|\bttm\b|trailing|operating statement|\bcam\b/i;

function isLandOnly(metrics: MetricLike[]): boolean {
  if (!metrics.length) return false;
  if (findMetric(metrics, PRICE_INCLUDE, PRICE_EXCLUDE)) return false;
  if (!findMetric(metrics, METRIC_FIND.landPrice.inc, METRIC_FIND.landPrice.exc)) return false;
  return !metrics.some((m) => INCOME_ROW.test(m.label));
}

// The plan's own rows — a construction budget or period, a total project
// cost, proposed units. On a deck that states no plan words at all (the
// extraction answered "unknown", or a legacy row has no strategy) and no
// income for the building as it stands, they are a development: its
// stabilized pro forma is the finished project's, and the land line is its
// price. A value-add or lease-up names itself and wins above; an operating
// asset that lists a historical construction cost beside its NOI keeps its
// kind, because that NOI is today's.
const PLAN_COST_ROW =
  /total (project|development) cost|construction (budget|cost|period|schedule|start|loan)|hard costs?|soft costs?|\b(proposed|planned) units\b|units? \((?:proposed|planned)\)/i;
// An income row that describes the building as it stands, not the plan:
// anything INCOME_ROW matches that is not stabilized / pro forma /
// projected / a LATER year, and not a market or asking rent. A Year-1 NOI
// is income for the building as bought — the going-in figure by another
// name — so a 2024-built asset listing its construction cost beside "Year
// 1 NOI" stays an operating asset (the year guard starts at 2, as the cap
// reader's and classifyNoi's do).
const FORWARD_ROW = new RegExp(
  String.raw`stabili[sz]|pro ?forma|projected|forward|(at|upon) (completion|stabili[sz]ation)|underwritten|market rent|asking rent|rent (assumption|target|premium)|` +
    LATER_YEAR.source,
  "i",
);

function hasTodayIncome(metrics: MetricLike[]): boolean {
  return metrics.some((m) => INCOME_ROW.test(m.label) && !FORWARD_ROW.test(m.label));
}

function hasPlanCostRows(metrics: MetricLike[]): boolean {
  return metrics.some((m) => PLAN_COST_ROW.test(m.label));
}

const MONEY_IN_TEXT = /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mm|m|k|b)?\b/i;
// A figure quoted per unit, door, key, bed, pad, site, suite, home or
// square foot is a RATE — "$18,000 per unit", "$25,000/unit interior
// renovation", "$45 psf" — not the plan's spend. The metric reader refuses
// such rows by label (BUDGET_EXCLUDE); the text reader has to see it in the
// sentence.
const RATE_IN_TEXT =
  /(?:\bper\b|\/)\s*(?:unit|door|key|room|bed|pad|site|suite|apartment|home|sf|s\.f\.|square\s+(?:foot|feet))|\bpsf\b/i;

/**
 * The budget from the extraction's own words when no metric row carried it:
 * `strategy.capitalBudget` is free text ("$160M hard and soft costs",
 * "approximately $180 million total project cost"). Same rules as the metric
 * reader — an all-in figure has the price taken out, a fragment that cannot
 * be a budget (a per-unit or per-SF rate, ten times a whole-asset price)
 * never lands, absent is absent. No page: the text is the OM's summary, not
 * a cited line.
 */
export function budgetFromText(
  text: string | null | undefined,
  price: number | null,
  priceIsWholeAsset = true,
): CapitalBudget | null {
  if (!text) return null;
  if (RATE_IN_TEXT.test(text)) return null;
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
  if (!budgetPlausible(budget, price, priceIsWholeAsset)) return null;
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

// The count reader — `isCountLabel`, `parseCount`, `unitCountRow` and
// `unitCountFromMetrics` — lives beside the size reader in lib/criteria now
// (the buy box's count band reads it, and lib/criteria cannot import from
// here). Re-exported under the names every surface already imports, so
// the readers keep one home and one import path each.
export { isCountLabel, parseCount, unitCountRow, unitCountFromMetrics };

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
  // budget appears nowhere else. Against a land price the works are bounded
  // by the absolute ceiling only — a site is a fraction of what is built.
  const wholeAsset = !priceRowIsLand(priceMetric);
  const budget =
    capitalBudgetFromMetrics(metrics, price, wholeAsset) ??
    budgetFromText(extraction.strategy?.capitalBudget, price, wholeAsset);
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
    priceLabel: priceRowIsLand(priceMetric) ? "Land cost" : "Price",
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
  const stated = priceMetric ? parseMoney(priceMetric.value) : null;
  if (stated == null || !(stated > 0)) return [];
  // What the price buys (lib/interest, #414). A note's price is a loan's:
  // set against the collateral's NOI it is a cap rate nobody earns, so no
  // price finding is made at all — the interest banner says why. A share's
  // price is grossed up to the whole the building's figures describe, and
  // said so; a share the OM states no single percentage for is not
  // compared at all.
  const interest = interestOf(extraction);
  if (interest.kind === "note") return [];
  if (interest.kind === "partial_interest" && interest.sharePct == null) return [];
  const price = interest.sharePct != null ? stated / (interest.sharePct / 100) : stated;
  const priceWord = interest.sharePct != null ? "whole-asset price the share implies" : "price";

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
        title: `${f.label} of ${money(f.value)} is ${pct(implied, 0)} of the ${money(price)} ${priceWord} on ${withArticle(strategy.label.toLowerCase())} deal`,
        detail: `A building mid-plan does not earn that today. This is almost certainly the finished project's stabilized pro forma carrying an in-place or Year-1 label — read it as the stabilized figure, and confirm what the building actually earns during the works.`,
      });
      continue;
    }
    if (f.kind === "stabilized") {
      findings.push({
        code: "strategy_unsettled",
        severity: "medium",
        title: `${f.label} of ${money(f.value)} is ${pct(implied, 0)} of the ${money(price)} ${priceWord}`,
        detail: `A stabilized figure that far above the price belongs to a plan — a conversion, a development, a lease-up — that the deck does not name plainly. Settle what the deal is first: measured against total cost it may be a fine yield; against the price alone it means nothing.`,
      });
      continue;
    }
    findings.push({
      code: f.value >= price ? "noi_exceeds_price" : "implied_cap_impossible",
      severity: "high",
      title:
        f.value >= price
          ? `${f.label} of ${money(f.value)} is above the ${money(price)} ${priceWord}`
          : `${f.label} of ${money(f.value)} implies ${withArticle(pct(implied, 0))} cap rate`,
      detail: `No operating property yields ${pct(implied, 0)}. Either the NOI or the price was misread, or the OM's NOI is a stabilized pro forma for a plan the deck describes elsewhere. Check the source pages before relying on any return built from these two figures.`,
    });
  }

  // 2. A stated going-in cap that disagrees with NOI ÷ price — read through
  //    the one cap reader every other surface uses, so a residual, Year-3 or
  //    on-cost cap that no surface shows can't manufacture a finding here.
  const capMetric = findGoingInCap(metrics);
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
        title: `Stated ${pct(statedCap, 2)} cap vs ${pct(implied, 2)} from ${going.label} ÷ ${priceWord}`,
        detail: `The stated cap rate and the stated NOI and price do not describe the same figures — one is on a different basis (a different year, before or after reserves, or a different price). Ask which NOI the cap is quoted on.`,
      });
    }
  }

  // 3. A per-unit or per-SF basis outside any US market — a misparse. The
  //    shared count reader: a "Unit mix" or "Vacant units" row read as the
  //    count would manufacture this finding on a sound deal. On a plan deal
  //    the basis is TOTAL COST over the planned units (rule 4): $12k of
  //    land per apartment to be built, or $4/SF for a dead office shell,
  //    is exactly what such deals trade at, so the shell's or the site's
  //    price is never held to an operating market's band.
  const units = unitCountFromMetrics(metrics);
  const sf = buildingSfFromMetrics(metrics);
  const cls = (extraction.assetClass ?? "").toLowerCase();
  // The class says the basis and the noun (lib/asset-words): a hotel is
  // held to a per-key band, a park to a per-pad one, an office to per SF —
  // and the finding names the class as a page would, never a stored key.
  const words = assetWords(cls);
  const noun = words.noun ?? { one: "unit", many: "units" };
  const clsWord = words.label ? words.label.toLowerCase() : "such";
  const basisTotal = planDeal ? (planSummary(extraction, strategy)?.totalCost ?? null) : price;
  const basisNoun = planDeal ? "total cost" : priceWord;
  const misread = (other: string) =>
    planDeal
      ? `No ${clsWord} market delivers there. The total cost or the ${other} was most likely misread — check both against their source pages before the all-in basis is used anywhere.`
      : `No ${clsWord} market trades there. The price or the ${other} was most likely misread — check both against their source pages before the basis is used anywhere.`;
  if (basisTotal != null && cls && words.basis === "unit" && units != null && units >= 1 && units <= 50_000) {
    const perUnit = basisTotal / units;
    if (perUnit < 15_000 || perUnit > 2_500_000) {
      findings.push({
        code: "basis_out_of_band",
        severity: "medium",
        title: `${money(basisTotal)} of ${basisNoun} over ${Math.round(units).toLocaleString("en-US")} ${noun.many} is ${money(perUnit)} per ${noun.one}`,
        detail: misread(`${noun.one} count`),
      });
    }
  } else if (basisTotal != null && cls && words.basis === "sf" && sf != null && sf > 100) {
    const perSf = basisTotal / sf;
    if (perSf < 5 || perSf > 3_000) {
      findings.push({
        code: "basis_out_of_band",
        severity: "medium",
        title: `${money(basisTotal)} of ${basisNoun} over ${Math.round(sf).toLocaleString("en-US")} SF is $${perSf < 10 ? perSf.toFixed(2) : Math.round(perSf).toLocaleString("en-US")} per SF`,
        detail: misread("building size"),
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
    // An inferred plan deal's summary IS the reading line; print it once.
    const reading = STRATEGY_READING[strategy.kind];
    const summary = strategy.summary && strategy.summary !== reading ? ` — ${strategy.summary}` : "";
    bits.push(`DEAL STRATEGY: ${strategy.label}${summary} ${reading}`);
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
