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

import { SCALE_WORDS, compactUsd, minusFor, scaleOf, statesRange } from "@/lib/money";
import { withArticle } from "@/lib/article";
import { dealTypeLabel, entityLoanOf, entityLoanWords, groundRentOf, interestOf, isGpStake, isTenancyInCommon, isWholeShare, shareProjectCostOf } from "@/lib/interest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { assetClassKey, assetWords } from "@/lib/asset-words";
import { budgetIncludesInterestReserve } from "@/lib/construction-debt";
import { yieldOnCostText } from "@/lib/plan-facts";
import { monthFigureOf } from "@/lib/stated-period";
import {
  LATER_YEAR,
  METRIC_FIND,
  buildingSfFromMetrics,
  countNounOf,
  findGoingInCap,
  findMetric,
  findPriceRow,
  isCountLabel,
  occupancyPctFromMetrics,
  occupancyRow,
  parseCount,
  parseMoney,
  parsePct,
  parsePrice,
  planCountRow,
  screenYearOf,
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
  // "Any": a lease-up's memorandum may state none (research pass 37).
  lease_up: "Largely vacant space to be leased; little in-place income, so any stabilized NOI is a forward figure over total cost.",
  conversion: "A change of use with construction and downtime first; expect little or no NOI through the works, and read the stabilized NOI as a yield on total cost.",
  development: "Ground-up or to-be-built; there is no in-place income, only a budget, a timeline and a stabilized pro forma.",
  unknown: "",
};

/** A forward purchase's line in its kind's place (`isForwardPurchase`,
 *  research pass 41): the budget is the developer's, never the buyer's. */
export const FORWARD_READING =
  "To be built and bought at delivery; there is no in-place income and no budget of the buyer's, only a price paid at delivery, a clock to it and the NOI stated at delivery.";

/** How far above the price an NOI can sit before the two cannot describe the
 *  same stabilized building. A 25% cap rate does not exist for an operating
 *  US property; anything past it is a pro forma on a different basis or a
 *  misread. */
export const IMPLIED_CAP_CEILING = 0.25;

/** How far under the price an NOI can sit and still be a stabilized
 *  building's going-in figure — a rule of thumb, not a market figure, and
 *  said as one (research pass 38). Under it the NOI is, most often, a price
 *  for land or a redevelopment, a figure stated a month at a time or in
 *  thousands, or a misread: an NOI stated per month ran as a year's NOI and
 *  printed "Equity multiple −1.53x" and "DSCR 0.16x" with no finding. */
export const IMPLIED_CAP_FLOOR = 0.02;

/** How small a works budget can be, a unit and a share of the price, and
 *  still be a renovation or construction program — a rule of thumb, not a
 *  market figure, and said as one (research pass 38): a value-add's
 *  "Renovation budget 2,500" on 200 apartments was spent as $2,500 of
 *  capital, $12.50 a door, with no finding. */
export const BUDGET_FLOOR_PER_UNIT = 1_000;
export const BUDGET_FLOOR_SHARE = 0.01;

/** The band a building's basis is held to, a unit and a foot — outside it no
 *  US market trades or delivers, and the figure is a misread (rule 4 of the
 *  plausibility check). A data center is priced by its power, so it is held
 *  to the floor alone; an outdoor-storage yard trades by the acre and is held
 *  to no per-foot band (`basisOutsideBand`). */
export const BASIS_PER_UNIT_BAND = { min: 15_000, max: 2_500_000 } as const;
export const BASIS_PER_SF_BAND = { min: 5, max: 3_000 } as const;

/**
 * Whether a basis — a price, or a plan's total cost, over the building's count
 * or its feet — sits outside the band any market trades at (rule 4): the one
 * test the plausibility check makes and the pipeline card's basis keeps to, so
 * no surface prints a basis the check calls misread (research pass 38: a card
 * read "$2k/unit" beside the panel's finding).
 */
export function basisOutsideBand(value: number, per: "unit" | "sf", assetClass: string | null | undefined): boolean {
  if (per === "unit") return value < BASIS_PER_UNIT_BAND.min || value > BASIS_PER_UNIT_BAND.max;
  if (isOutdoorStorageYard(assetClass)) return false;
  const ceiling = assetClassKey((assetClass ?? "").toLowerCase()) === "data_center" ? Number.POSITIVE_INFINITY : BASIS_PER_SF_BAND.max;
  return value < BASIS_PER_SF_BAND.min || value > ceiling;
}

/**
 * The first signal's going-in cap, where it can be a cap on the price at
 * all: the signal is a fast read with no label to check, so a figure at or
 * under 0.5%, or past IMPLIED_CAP_CEILING (a 105% "cap" is a yield on cost
 * or a pro forma), is none. The deal page's summary bar and the model's
 * market read (`modelVsMarketFor`, behind the page, the report and the
 * workbook) both fall back to it where the extraction states no going-in
 * cap, so the three set the exit against one figure.
 */
export function signalGoingInCap(
  signal: { goingInCap?: string | null } | null | undefined,
): { text: string; pct: number } | null {
  const text = signal?.goingInCap?.trim() || null;
  if (!text) return null;
  const pct = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(pct) && pct > 0.5 && pct <= IMPLIED_CAP_CEILING * 100 ? { text, pct } : null;
}

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

// A building the deal's own words call vacant, or offer to an owner-user —
// never vacant land, a lot or a site, which is no building to lease, and
// never a vacant part of a building ("two vacant suites"), which says the
// rest is let.
const VACANT_OR_OWNER_USER =
  /\bvacant\b(?![\s-]+(?:land|lots?|parcels?|sites?|acre(?:s|age)?|pads?|units?|suites?|apartments?|floors?|bays?|homes?|keys?|rooms?|beds?|spaces?|storefronts?|positions?))|\bowner[\s/-]*(?:users?|occupants?)\b/i;

/**
 * Whether the deal is a building with no income today (research pass 37):
 * no NOI stated, and either a stated in-place occupancy of 0%, or — where no
 * occupancy is stated — the deal's own words (its name, its plan, the buyer's
 * notes, the first read's) calling it vacant or offering it to an
 * owner-user. A stated occupancy above 0% says the building has tenants,
 * whatever the words; where a lease-up begins above 0% is the owner's call.
 * Land is no building to lease.
 *
 * Any stated NOI keeps the deal as it was read, a stabilized or pro forma
 * figure included: on a building read as stabilized the model runs that
 * figure as its year-1 NOI (lib/underwrite/inputs), and a lease-up's model
 * never does, so reading such a building as a lease-up would move the
 * model's year-1 NOI to the price × the stated cap or the assumed 6% — the
 * model's math, the owner's call. A stated 0% beside it is named by the
 * plausibility check instead (`assessPlausibility`'s no_income_in_place).
 */
function noIncomeToday(
  extraction: ExtractionResult | null,
  signal?: { take?: string; dealName?: string | null } | null,
): boolean {
  if (!extraction) return false;
  const metrics = extraction.metrics ?? [];
  if (noiFigures(metrics).length > 0) return false;
  if (!assetWords(extraction.assetClass).operating) return false;
  const occupied = occupancyPctFromMetrics(metrics);
  if (occupied != null) return occupied === 0;
  const words = [extraction.dealName, extraction.assetClass, extraction.strategy?.summary, extraction.buyerNotes, signal?.take, signal?.dealName]
    .filter((w): w is string => typeof w === "string" && w.trim() !== "")
    .join(" \n ");
  return VACANT_OR_OWNER_USER.test(words);
}

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
  else if (hasMetrics && isLandOnly(extraction?.metrics ?? [], screenYearOf(extraction))) kind = "development";
  // A building with no income today — stated 0% occupied, or called vacant
  // or offered to an owner-user in the deal's own words — and no NOI stated
  // is a lease-up, not an operating asset (research pass 37).
  else if (hasMetrics && noIncomeToday(extraction, signal)) kind = "lease_up";
  else if (hasMetrics) kind = "stabilized";
  else return { kind: "unknown", label: STRATEGY_LABEL.unknown, summary: "", source: "none" };

  return {
    kind,
    label: STRATEGY_LABEL[kind],
    summary:
      stated?.summary?.trim() ||
      (kind === "stabilized" ? "" : forwardOfKind(extraction, kind) ? FORWARD_READING : STRATEGY_READING[kind]),
    source: "inferred",
  };
}

// ── NOI figures ──────────────────────────────────────────────────────────

export type NoiKind = "in_place" | "year1" | "stabilized";

export interface NoiFigure {
  kind: NoiKind;
  label: string;
  /** a year's NOI — twelve times the month where the row states a month
   *  (`month`) */
  value: number;
  page?: string;
  /** the month's figure the year was read from, where the row states its NOI
   *  a month at a time and no year beside it (lib/stated-period
   *  `monthFigureOf`, research pass 40): said beside the year wherever the
   *  figure is named (`noiFigureWords`); absent otherwise */
  month?: number;
}

const NOI_INCLUDE = /net operating income|\bnoi\b/i;
// Per-unit / per-SF figures, margins and growth rates are not the NOI. An
// operating business's earnings are filed under "EBITDA" or "EBITDAR", which
// name no NOI, so no reader here takes them (`ebitdaFigure` reads them to be
// said, never used — research pass 28).
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

/** Which NOI a metric is — or null when it is not an NOI figure at all. A
 *  row it takes whose words say a month ("NOI (monthly)", "Monthly NOI",
 *  "$85,000/mo") is read as the year the month makes (`noiOfRow`). */
export function classifyNoi(m: MetricLike): NoiKind | null {
  if (!NOI_INCLUDE.test(m.label) || NOI_EXCLUDE.test(m.label) || slashMakesRate(m.label)) return null;
  if (NOI_STABILIZED.test(m.label)) return "stabilized";
  if (NOI_IN_PLACE.test(m.label) || m.basis === "in_place") return "in_place";
  // A bare "NOI" — tagged pro forma or not — is the sponsor's year-one figure.
  return "year1";
}

/**
 * An NOI row's figure as a year (research pass 40, H1(a)): a row whose words
 * say a month — the figure's own ("$85,000/mo", "$85,000 per month") or,
 * where those state no period, its label's ("NOI (monthly)", "Monthly NOI")
 * — is read as twelve times the month, or as the year it states beside the
 * month where the two agree (lib/stated-period `monthFigureOf`, the rule
 * lib/mixed-use reads a monthly income by); a month and a year that do not
 * agree are no figure. Every other row reads as it always has — a figure is
 * never annualised on a guess. The one rule behind every NOI reader here
 * (`noiFigures`): the plausibility check, the plan and the model.
 */
export function noiOfRow(m: Pick<MetricLike, "label" | "value">): { value: number; month?: number } | null {
  const month = monthFigureOf(m.label, m.value);
  if (month === "disagree") return null;
  if (month) return month.yearStated ? { value: month.annual } : { value: month.annual, month: month.month };
  const value = parseMoney(m.value);
  return value == null || !Number.isFinite(value) ? null : { value };
}

/** Every parseable NOI in the extraction, classified, each a year's
 *  (`noiOfRow`). Order preserved. */
export function noiFigures(metrics: MetricLike[]): NoiFigure[] {
  const out: NoiFigure[] = [];
  for (const m of metrics) {
    const kind = classifyNoi(m);
    if (!kind) continue;
    const read = noiOfRow(m);
    if (!read) continue;
    out.push({ kind, label: m.label, value: read.value, page: m.page, ...(read.month != null ? { month: read.month } : {}) });
  }
  return out;
}

/**
 * An NOI figure named as a sentence names it: "NOI (in-place) of $1.40M",
 * and where it was read off a month, the month beside the year it makes —
 * "NOI (monthly) of $1.02M (twelve times the $85k a month stated)" — so a
 * label that says monthly never sits beside a year's figure unexplained.
 */
export function noiFigureWords(f: Pick<NoiFigure, "label" | "value" | "month">, money: (n: number) => string = compactUsd): string {
  return `${f.label} of ${money(f.value)}${f.month != null ? ` (twelve times the ${money(f.month)} a month stated)` : ""}`;
}

// An operating business's earnings, by the labels the extraction files them
// under ("EBITDA", "EBITDAR (T-12)", "EBITDARM") — never a margin, a
// multiple, a coverage or a figure per unit.
const EBITDA_ROW = /\bebitda(?:r|rm)?\b/i;
const NOT_EBITDA_SUM = /margin|multiple|coverage|ratio|\bper\b|psf|\/|growth|yield/i;

export interface EbitdaFigure {
  label: string;
  value: number;
  page?: string;
}

/**
 * The first EBITDA, EBITDAR or EBITDARM the memorandum states, as a sum —
 * an operating business's earnings (a skilled-nursing operator's, a car
 * wash's), filed under labels no NOI reader takes (`NOI_INCLUDE` names no
 * EBITDA): read only so that a note can say the memorandum states it and
 * that it is not used (research pass 28). Null where none is stated, and on
 * a percentage or a ratio.
 */
export function ebitdaFigure(metrics: MetricLike[]): EbitdaFigure | null {
  for (const m of metrics) {
    if (!EBITDA_ROW.test(m.label) || NOT_EBITDA_SUM.test(m.label)) continue;
    if (/%|percent|\d\s*[x×](?![a-z])/i.test(m.value)) continue;
    const value = parseMoney(m.value);
    if (value == null || !Number.isFinite(value) || !(value > 0)) continue;
    return { label: m.label.trim(), value, page: m.page };
  }
  return null;
}

// ── Plausibility ─────────────────────────────────────────────────────────

export type FindingCode =
  | "noi_exceeds_price"
  | "implied_cap_impossible"
  | "implied_cap_low"
  | "label_mismatch"
  | "strategy_unsettled"
  | "cap_mismatch"
  | "basis_out_of_band"
  | "budget_low"
  | "no_income_in_place"
  | "ground_rent_mismatch";

export interface PlausibilityFinding {
  code: FindingCode;
  severity: "high" | "medium";
  /** the claim, short */
  title: string;
  /** what it means and what to do */
  detail: string;
}

/**
 * Whether a finding stands against the model's returns (research pass 38):
 * a high one — figures that cannot all be true at once — or an implied cap
 * under the floor. While one stands, the deal page's sensitivity playground
 * withholds its tiles and its max bid and says why, as it does for a
 * placeholder's (lib/underwrite/report-grid `misreadPageLine`).
 */
export function findingWithholdsReturns(f: Pick<PlausibilityFinding, "code" | "severity">): boolean {
  return f.severity === "high" || f.code === "implied_cap_low";
}

const money = (n: number): string => compactUsd(n);
// A negative figure — an implied cap on an NOI under zero — carries the
// site's minus (lib/money `minusFor`), never a hyphen-minus: the cap-mismatch
// finding's title had read "-3.65%" (research pass 38).
const pct = (x: number, dp = 1): string => {
  const shown = (Math.abs(x) * 100).toFixed(dp);
  return `${minusFor(x, shown)}${shown}%`;
};

// The one price reader — shared with the buy-box check, the mandate score
// and every summary slot through lib/criteria's METRIC_FIND, so no surface
// reads a different row as "the price" than the next one. What it excludes
// depends on the year the screen read the memorandum (a label dated before
// it is a prior trade), so it is asked for per year: METRIC_FIND.price.exc.
const PRICE_INCLUDE = METRIC_FIND.price.inc;

const NON_STABILIZED: ReadonlySet<StrategyKind> = new Set([
  "value_add",
  "lease_up",
  "conversion",
  "development",
]);

/** A deal with a plan: the stabilized figures describe the finished project. */
export const isPlanDeal = (kind: StrategyKind): boolean => NON_STABILIZED.has(kind);

/**
 * Whether the deal's kind says the building is not yet delivered — a
 * ground-up development (a build-to-suit or a forward purchase is read as
 * one), or a conversion whose new use comes with the works — so a lease
 * signed for it begins at delivery, not today. A lease-up's building
 * stands, and a value-add's or a stabilized one is delivered.
 */
export const notYetDelivered = (kind: StrategyKind): boolean => kind === "development" || kind === "conversion";

/**
 * Whether the deal builds something, so what building costs speaks to it:
 * a development or a conversion — never a forward purchase, whose works are
 * the developer's — or a value-add that states its budget (in total, or a
 * door at a time). A lease-up's building is already built, and
 * a value-add with no budget has none to check an escalation against — the
 * construction-cost lines of the market check read this, never the wider
 * `isPlanDeal` (the audit of 2026-09-30).
 */
export function buildsSomething(extraction: ExtractionResult | null | undefined, kind: StrategyKind): boolean {
  // A forward purchase's works are the developer's, at the developer's cost:
  // the buyer pays a price at delivery and has no budget for a cost index to
  // be checked against (lib/forward-purchase).
  if (kind === "development" || kind === "conversion") return !forwardOfKind(extraction, kind);
  if (kind !== "value_add" || !extraction) return false;
  const metrics = extraction.metrics ?? [];
  return capitalBudgetFromMetrics(metrics, null) != null || renovationProgramBudget(metrics, null) != null;
}

// ── A forward purchase ───────────────────────────────────────────────────
// The predicate the plan needs (lib/forward-purchase reads the rest, and
// re-exports these): it lives here because lib/forward-purchase imports
// this module, and `planSummary` must know a forward purchase to say the
// developer funds the works.

/** The words that name a purchase at completion. A lender's forward
 *  commitment or take-out commitment is a loan's, never a purchase: a
 *  development financed with one had been read as bought at delivery, its
 *  plan's cost struck at the land price (the audit of 2026-10-05). Every
 *  path holds only beside a price that is not the land's
 *  (`isForwardPurchase`): a site sold for a build-to-suit, or priced at
 *  its land, is the buyer's own development. */
const FORWARD_WORDS =
  /\bforward[- ](?:purchase|sale)\b|\bpurchased?\s+(?:at|upon|on)\s+(?:the\s+)?(?:completion|delivery|substantial completion|certificate of occupancy|issuance of (?:the\s+)?(?:certificate of occupancy|c\.?\s?o\.?))\b|\btake[- ]?out (?:purchase|buyer)\b/i;
/** A single tenant's build-to-suit, by its own words. */
export const BUILD_TO_SUIT_WORDS = /\bbuild[- ]to[- ]suit\b|\bbts\b/i;

/** Every word the memorandum gave the screen, for a forward purchase's words. */
export function forwardWordsOf(ex: ExtractionResult): string {
  return [
    ex.dealName ?? "",
    ex.buyerNotes ?? "",
    ex.strategy?.summary ?? "",
    ex.strategy?.timeline ?? "",
    ...(ex.metrics ?? []).flatMap((m) => [m.label, m.value]),
  ].join(" \n ");
}

/**
 * Whether the deal is a purchase at completion: a development (or a
 * conversion delivered with its works) whose memorandum's words say the
 * buyer pays at completion, or a build-to-suit priced as the whole asset.
 */
export function isForwardPurchase(
  ex: ExtractionResult | null | undefined,
  strategy: DealStrategy = inferStrategy(ex ?? null),
): boolean {
  return forwardOfKind(ex, strategy.kind);
}

/** `isForwardPurchase` on the deal's kind alone, for a caller that holds
 *  the kind and not the strategy (`buildsSomething`). */
function forwardOfKind(ex: ExtractionResult | null | undefined, kind: StrategyKind): boolean {
  if (!ex) return false;
  if (kind !== "development" && kind !== "conversion") return false;
  const words = forwardWordsOf(ex);
  const forward = FORWARD_WORDS.test(words);
  if (!forward && !BUILD_TO_SUIT_WORDS.test(words)) return false;
  // A price that is the land's is the buyer's own development whatever the
  // words say; a build-to-suit needs a price for the whole asset.
  const priceRow = findPriceMetric(ex.metrics ?? [], kind, screenYearOf(ex));
  if (priceRowIsLand(priceRow)) return false;
  return forward || priceRow != null;
}

/** The NOI a forward purchase's memorandum states at delivery: the
 *  stabilized figure, or on a build-to-suit the lease's first year, since
 *  its rent starts at delivery (a community's first year is its lease-up,
 *  never its yield at delivery). Null where neither is stated. */
export function forwardDeliveryNoi(metrics: MetricLike[], buildToSuit: boolean): NoiFigure | null {
  const nois = noiFigures(metrics);
  return nois.find((f) => f.kind === "stabilized") ?? (buildToSuit ? (nois.find((f) => f.kind === "year1") ?? null) : null);
}

// ── The plan's cost ──────────────────────────────────────────────────────

// The plan's cost is read from ONE row, and never from a line of the
// budget. The first matching row had won, so an extraction that listed
// "Hard costs" before "Total project cost" dropped the soft costs and the
// land, and flattered the yield on cost.
//
// A TOTAL — the whole project's cost, the price inside it — wins wherever
// it sits.
const TOTAL_ROW = /total (project|development) (cost|budget)s?|total capitali[sz]ation|all[- ]?in (cost|basis|budget)/i;
// Else a budget for the WORKS as a whole: hard and soft, the price outside it.
const WORKS_ROW =
  /renovation (budget|cost|plan)|capex budget|capital (budget|plan|improvements?|expenditures?)|construction (cost|budget)|redevelopment (cost|budget)|conversion (cost|budget)|improvement budget|hard (and|&|\+) soft/i;
// A rate, an annual figure or a reserve is no budget. An interest reserve a
// total says it includes is a note on the total, not a reserve row.
const BUDGET_EXCLUDE = /\bper\b|\/|psf|unit|(?<!interest[\s-])reserve|annual|\byr\b|year/i;
const ALL_IN = /total (project|development) (cost|budget)|total capitali[sz]ation|all[- ]?in/i;
// A LINE of the budget, never the whole of it: hard costs without the soft
// (or soft without the hard), the land or the site, a contingency, a
// developer's fee, FF&E, the interest reserve or the financing — unless the
// label names it only to say what the figure includes or leaves out
// ("incl. contingency", "excl. land").
const LINE_ITEM =
  /\bhard\b|\bsoft\b|\bland\b|\bsite\b|\bcontingenc(?:y|ies)\b|\bdevelop(?:er|ment)(?:'s|s)?\s+fees?\b|\bff\s*&\s*e\b|\bffe\b|\bfurniture\b|\binterest\s+reserves?\b|\bcapitali[sz]ed\s+interest\b|\bcarry(?:ing\s+costs?)?\b|\bfinancing\s+(?:costs?|fees?)\b/gi;
const NOTE_BEFORE =
  /\b(?:incl(?:\.|uding|udes|usive\s+of)?|with|plus|excl(?:\.|uding|udes|usive\s+of)?|ex\.|net\s+of|before|without|less|except|not\s+including)(?=\W|$)/i;
const NOTE_AFTER = /^\s*(?:(?:is|are)\s+)?(?:excluded|included|not\s+included)\b/i;
const CLAUSE_BREAK = /[;:(),–—|]/g;

/** Whether a works row's label names one line of the budget rather than
 *  the whole (a hard-costs line, a contingency) — hard and soft together
 *  are the works' whole. */
function isLineItemRow(label: string): boolean {
  const items: string[] = [];
  for (const m of label.matchAll(LINE_ITEM)) {
    const at = m.index ?? 0;
    const lead = label.slice(0, at);
    const clause = lead.slice(Math.max(0, ...[...lead.matchAll(CLAUSE_BREAK)].map((b) => (b.index ?? 0) + 1)));
    const tail = label.slice(at + m[0].length).split(CLAUSE_BREAK)[0];
    if (NOTE_BEFORE.test(clause) || NOTE_AFTER.test(tail)) continue;
    items.push(m[0].toLowerCase());
  }
  const others = items.filter((i) => i !== "hard" && i !== "soft");
  const hard = items.includes("hard");
  const soft = items.includes("soft");
  return others.length > 0 || hard !== soft;
}

export interface CapitalBudget {
  /** the plan's spend, $ — excludes the price even when the OM stated an all-in figure */
  budget: number;
  /** the OM stated a total that included the price, and the price was taken out */
  allIn: boolean;
  /** the OM stated an all-in total but no price, so nothing could be taken
   *  out: `budget` IS the stated total cost, with the acquisition inside it */
  isTotal?: boolean;
  /** the renovation program's doors times its cost a door, both as stated,
   *  the memorandum stating no total (#460) — derived, and labelled so */
  program?: boolean;
  /** the budget's own words say it already carries the construction loan's
   *  interest reserve — capitalized interest, carry, financing costs (lib/
   *  construction-debt `budgetIncludesInterestReserve`); set only when true,
   *  and the construction panel then adds no reserve on top */
  includesReserve?: boolean;
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
 * The plan's cost from the metrics. A total — "total project cost", "total
 * development cost", "total capitalization", an all-in cost — includes the
 * price and wins wherever it sits among the rows; else a budget for the
 * works as a whole ("construction budget", "renovation budget", hard and
 * soft together), which does not. A line of the budget — hard costs alone,
 * soft costs alone, the land, a contingency, a developer fee, FF&E — is
 * never taken for the total, and several lines are never summed into one:
 * with only lines stated there is no stated total, and the reader says
 * none. Bounded so a mis-parsed figure never lands here (nothing, or ten
 * times a whole-asset price, is not a budget) — and never invented: absent
 * is absent. On a development the price is the LAND cost, routinely a
 * tenth of the works or less, so the ten-times bound applies only when the
 * price is the whole asset's (`priceIsWholeAsset`, which callers read off
 * the price row's label).
 */
export function capitalBudgetFromMetrics(
  metrics: MetricLike[],
  price: number | null,
  priceIsWholeAsset = true,
): CapitalBudget | null {
  const m =
    metrics.find((r) => TOTAL_ROW.test(r.label) && !BUDGET_EXCLUDE.test(r.label)) ??
    metrics.find((r) => WORKS_ROW.test(r.label) && !BUDGET_EXCLUDE.test(r.label) && !isLineItemRow(r.label)) ??
    null;
  if (!m) return null;
  // A cost is read as a price is (#466): a range's top, the end that does
  // not flatter the yield on it.
  const raw = parsePrice(m.value);
  if (raw == null || !(raw > 0)) return null;
  const statedAllIn = ALL_IN.test(m.label);
  // An all-in figure with no price to take out of it stands as the total
  // cost itself — flagged, so no surface calls it "less the price".
  const allIn = statedAllIn && price != null;
  const budget = statedAllIn && price != null ? raw - price : raw;
  if (!budgetPlausible(budget, price, priceIsWholeAsset)) return null;
  return {
    budget,
    allIn,
    isTotal: statedAllIn && price == null,
    ...(budgetIncludesInterestReserve(m.label, m.value) ? { includesReserve: true } : {}),
    label: m.label,
    page: m.page,
  };
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
 *  so the band judges the row the page prints. `screenYear` is the year the
 *  screen read the memorandum — `screenYearOf(extraction)` — against which a
 *  label's own year is a prior trade or the ask. */
export function findPriceMetric(metrics: MetricLike[], kind: StrategyKind, screenYear: number): MetricLike | null {
  return findPriceRow(metrics, kind, screenYear) as MetricLike | null;
}

/** The asking price as the plausibility check and the model read it — the
 *  one price reader, handed to lib/interest so the "what is being sold"
 *  panel, the deal context and the challenger say the same figure. */
export function askingPriceOf(extraction: ExtractionResult | null | undefined): number | null {
  if (!extraction) return null;
  const row = findPriceMetric(extraction.metrics ?? [], inferStrategy(extraction).kind, screenYearOf(extraction));
  // A range's top (#466): the end that does not flatter the returns.
  const n = row ? parsePrice(row.value) : null;
  return n != null && n > 0 ? n : null;
}

/**
 * The price the building's own figures describe (#414, #415) — the one a
 * basis per unit or per SF, a cap on the price, or a set against other
 * buildings' sales may divide: the asking price on a fee simple or a
 * leasehold; a share's grossed up to the whole where the OM states its
 * percentage; and null for a note (a loan's price), a leased fee (the
 * land's), a share with no stated percentage — a share of the general
 * partner's interest among them, whose percentage is the general partner's
 * interest's and never the entity's (lib/interest `isGpStake`, research pass
 * 37: "$21k/unit" for a building valued at $267k) — and a share beside a loan its
 * entity carries (lib/interest `entityLoanOf`): grossed up, that share's
 * price is the equity's whole, and the building's cost is that plus the
 * loan, which nothing adds — no building basis is struck on any of these,
 * and a memory that pools the account's past screens never averages one
 * in. The caller passes the price it read (the deal page's includes the
 * first signal's ask before the extraction lands).
 */
export function buildingPriceOf(
  extraction: ExtractionResult | null | undefined,
  price: number | null,
): number | null {
  if (price == null || !(price > 0)) return null;
  const { kind, sharePct, entityLoan } = interestOf(extraction);
  // A preferred equity position's price buys a rate and a redemption, never
  // a slice of the building (lib/position): no building basis is struck on it.
  if (kind === "note" || kind === "leased_fee" || kind === "preferred_equity") return null;
  if (kind === "partial_interest") return sharePct != null && entityLoan == null ? price / (sharePct / 100) : null;
  return price;
}

/** Whether a figure the OM prints per unit or per SF, or its going-in cap,
 *  describes the building bought outright: false for a note, a leased fee
 *  and a share, whose OMs quote such figures on a basis the row never says
 *  (the collateral's, the land's, the whole's or the share's). */
export function statedBasisIsBuildings(extraction: ExtractionResult | null | undefined): boolean {
  const { kind } = interestOf(extraction);
  return kind !== "note" && kind !== "leased_fee" && kind !== "partial_interest" && kind !== "preferred_equity";
}

// An outdoor-storage yard's words: industrial outdoor storage, a truck
// terminal or yard, a storage yard.
const YARD_WORDS = /\b(industrial outdoor storage|outdoor storage|ios|truck (terminal|yard)|storage yard)\b/i;
const SELF_STORAGE_WORDS = /\b(self[- ]?storage|mini[- ]?storage)\b/i;

/**
 * Whether the deal's class, in the deck's own words, is an outdoor-storage
 * yard. A yard trades by the usable acre, and its price over the small shop
 * building on it is no basis — so the plausibility check holds it to no
 * per-SF band, and no surface prints, ticks or pools a per-SF figure for it
 * (the pipeline card's basis, the comps' subject tick, the market memory,
 * the internal comps). A self-storage facility that also lets outdoor
 * storage is priced by its buildings' feet, and is not one.
 */
export function isOutdoorStorageYard(assetClass: string | null | undefined): boolean {
  const words = assetClass ?? "";
  return YARD_WORDS.test(words) && !SELF_STORAGE_WORDS.test(words);
}

/** The price row a figure is wanted from — the LOI's prefill: among the
 *  price rows the first whose value IS a figure ("Asking price: call for
 *  pricing" above "Purchase price: $42,000,000" gives the $42M), else the
 *  shared reader's row, so the letter and the deal page never name two
 *  different rows as the price. Read against the screen's year, as
 *  findPriceMetric is. */
export function findPricedMetric(metrics: MetricLike[], kind: StrategyKind, screenYear: number): MetricLike | null {
  // The price reader's own figure: a value that is no price — "185,000 per
  // unit", "6.25% cap rate" (lib/criteria `priceRefusal`) — is no figure.
  const isFigure = (v: string) => {
    const n = parsePrice(v);
    return n != null && n >= 10_000;
  };
  const exclude = METRIC_FIND.price.exc(screenYear);
  return (
    metrics.find((x) => PRICE_INCLUDE.test(x.label) && !exclude.test(x.label) && isFigure(x.value)) ??
    findPriceMetric(metrics, kind, screenYear)
  );
}

/** The first signal's ask, for the price slot before the extraction lands:
 *  the string as the model wrote it when it is a figure, null when it is a
 *  word — "Unpriced", "Call for offers", "TBD" — that no surface should
 *  print where a price goes. */
export function signalAskPrice(signal: { askPrice?: string | null } | null | undefined): string | null {
  const ask = signal?.askPrice?.trim();
  // A cap, a share of a balance or a figure per unit is no price either.
  return ask && parsePrice(ask) != null ? ask : null;
}

// An OM whose only price is a land or site line and which carries no income
// figure at all — no NOI, cap rate, occupancy, rent or revenue — is selling
// land, not an operating asset. Read as a development, so its land price
// is its price; read as "stabilized" it would have none.
const INCOME_ROW =
  /\bnoi\b|net operating income|cap rate|occupan|\brent|\begi\b|revenue|income|cash ?flow|\bncf\b|debt yield|dscr|expense|opex|\bleased\b|tenan|\bwalt\b|lease expir|vacan|reimburs|\bt-?12\b|\bttm\b|trailing|operating statement|\bcam\b/i;

function isLandOnly(metrics: MetricLike[], screenYear: number): boolean {
  if (!metrics.length) return false;
  if (findMetric(metrics, PRICE_INCLUDE, METRIC_FIND.price.exc(screenYear))) return false;
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

const MONEY_IN_TEXT = new RegExp(String.raw`\$\s?(\d[\d,]*(?:\.\d+)?)(?!\.?\d)\s*(${SCALE_WORDS})?\b`, "i");
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
  // The scale from lib/money's one table ("$12.5 mil" is $12.5M).
  const raw = n * scaleOf(m[2]);
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
    ...(budgetIncludesInterestReserve(null, text) ? { includesReserve: true } : {}),
    label: isTotal ? "stated total project cost" : "stated capital budget",
  };
}

// ── A renovation program stated a door at a time (#460) ─────────────────
// A value-add memorandum states its program as "192 units to renovate at
// $15,000 per unit" and often no total, so the plan had no budget, no total
// cost and no yield on cost, and the report had neither the IRR page (a
// plan deal's is omitted) nor the plan's. The rows' patterns live here,
// beside the plan's other rows, so the plan and lib/value-add read the same
// two rows and multiply the same two figures.

/** The doors the program has left to renovate. */
export const RENOVATION_DOORS_ROW =
  /\b(?:units?|doors?)\s+(?:to\s+(?:be\s+)?renovate|remaining\s+to\s+renovate|left\s+to\s+renovate)|\bclassic\s+units?\s+remaining\b|\bunrenovated\s+units?\b/i;
/** What one door's renovation costs — per door, never a total. */
export const RENOVATION_COST_PER_DOOR_ROW =
  /\brenovation\s+(?:cost|budget|spend)\s+(?:per|\/)\s*(?:unit|door)\b|\b(?:per|\/)[- ](?:unit|door)\s+renovation\b|\binterior\s+(?:upgrade|renovation)\s+cost\s+(?:per|\/)\s*(?:unit|door)\b/i;

// A door's renovation runs from a paint-and-fixtures turn to a gut; past
// this it is not one door's cost (a total typed into the row, or a misread).
const DOOR_COST_CEILING = 250_000;

/** One door's renovation cost as stated: "$15,000", "$15k per unit". A
 *  range is two figures and reads as none (lib/money `statesRange`); so is
 *  a figure past a door's. */
export function renovationCostPerDoor(value: string | null | undefined): number | null {
  const v = (value ?? "").trim();
  if (!v || statesRange(v)) return null;
  const n = parseMoney(v);
  return n != null && n >= 500 && n <= DOOR_COST_CEILING ? n : null;
}

/**
 * The program's cost where the memorandum states the doors and a door's
 * cost and no total: the two stated figures multiplied, marked `program`
 * and labelled with the arithmetic, so no surface prints it as a figure the
 * memorandum stated. Null where either row is absent or unreadable, and
 * bounded as any budget is.
 */
export function renovationProgramBudget(
  metrics: MetricLike[],
  price: number | null,
  priceIsWholeAsset = true,
): CapitalBudget | null {
  const doorsRow = metrics.find((m) => RENOVATION_DOORS_ROW.test(m.label)) ?? null;
  const costRow = metrics.find((m) => RENOVATION_COST_PER_DOOR_ROW.test(m.label)) ?? null;
  if (!doorsRow || !costRow) return null;
  const doors = parseCount(doorsRow.value);
  const cost = renovationCostPerDoor(costRow.value);
  if (doors == null || !(doors > 0) || cost == null) return null;
  const budget = doors * cost;
  if (!budgetPlausible(budget, price, priceIsWholeAsset)) return null;
  return {
    budget,
    allIn: false,
    program: true,
    label: `${doors.toLocaleString("en-US")} ${doors === 1 ? "door" : "doors"} × $${Math.round(cost).toLocaleString("en-US")} a door, the renovation program as stated`,
    page: doorsRow.page || costRow.page || undefined,
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
  /** the price the plan's cost is built on — the building's
   *  (`buildingPriceOf`); null where the OM states none, and where what the
   *  price buys is not the building (a note, the land, a share of no stated
   *  percentage, a share beside its entity's loan, whose grossed-up figure
   *  is `equityWhole`) */
  price: number | null;
  /** a share's price grossed up beside the loan its entity carries: the
   *  equity's whole, shown under its label with the loan beside it, and
   *  never a cost anything is built on — the building's cost is that plus
   *  the loan, which the model does not add; null otherwise */
  equityWhole?: number | null;
  /** what the price figure is: the asking / purchase price, or on a ground-up
   *  development the land or site cost — or, where a share was bought, the
   *  whole the share's price implies (#415): the equity's whole where the
   *  memorandum states the loan its entity carries (`entityLoan`), since
   *  that loan sits on top of the figure */
  priceLabel:
    | "Price"
    | "Land cost"
    | "Whole price, the share grossed up"
    | "Equity's whole, the share grossed up"
    | "Equity's whole, all the entity's interests";
  /** why a price the OM states is not the project's, where it is not — a
   *  note's, the land's under a ground lease, a share with no stated
   *  percentage (#415); null otherwise, and the price then reads "not
   *  stated" only where the OM states none */
  priceWithheld: string | null;
  /** a share's price grossed up beside the loan its entity carries, as
   *  stated (lib/interest `entityLoanOf`): the price is then the equity's
   *  whole and the loan sits on top of it, said and never added in; null
   *  or absent otherwise */
  entityLoan?: number | null;
  /** a share's price grossed up beside a stated total project cost above it
   *  (lib/interest `shareProjectCostOf`, research pass 37): the price is the
   *  equity's whole, said so, and the plan's cost is read as before; absent
   *  otherwise */
  projectCostAbove?: number | null;
  /** beside `entityLoan`, on an undivided interest held as a tenant in
   *  common: the loan is the property's, since no entity owns the property
   *  (research pass 37); absent otherwise */
  loanOnProperty?: boolean;
  /** the stabilized pro forma NOI, when the OM states one — on a forward
   *  purchase (`forward`) the NOI the OM states at delivery
   *  (`forwardDeliveryNoi`: the stabilized figure, or on a build-to-suit the
   *  lease's first year), its own label kept */
  stabilizedNoi: NoiFigure | null;
  /** the buyer's budget for the works — null on a forward purchase, whose
   *  works the developer funds (`developerBudget`) */
  budget: CapitalBudget | null;
  /** price + budget, when both are known — on a forward purchase the price
   *  alone, the buyer's whole cost */
  totalCost: number | null;
  /** a forward purchase or a build-to-suit bought at delivery
   *  (`isForwardPurchase`): the developer funds the works, so the price is
   *  the buyer's whole cost and the yield on cost is the NOI at delivery
   *  over it; absent or false otherwise */
  forward?: boolean;
  /** on a forward purchase, the budget the memorandum states for the works:
   *  the developer's, said and never added to the price; null or absent
   *  otherwise */
  developerBudget?: CapitalBudget | null;
  /** stabilized NOI ÷ total cost, decimal, when both are known — null at or
   *  over IMPLIED_CAP_CEILING, a yield no project earns (`yieldWithheld`) */
  yieldOnCost: number | null;
  /** why no yield on cost is struck where both figures are stated: at or
   *  over IMPLIED_CAP_CEILING the total cost or the NOI was most likely
   *  misread, as the cap reader refuses a cap past it — one sentence, said
   *  wherever the yield would stand (research pass 38); null or absent
   *  otherwise */
  yieldWithheld?: string | null;
  /** why no total cost or yield on cost is struck where the price is shown,
   *  in one plain sentence: beside the equity's whole (`equityWhole`), the
   *  building's cost is that plus the entity's loan, which the model does
   *  not add; null otherwise */
  costWithheld?: string | null;
  /** why no all-in basis per planned unit is struck where the plausibility
   *  check finds the plan's basis outside the band any market delivers at
   *  (`planWithBasisChecked`, research pass 38) — one sentence, said under
   *  the plan's facts, that never prints the misread figure; null or absent
   *  otherwise */
  basisWithheld?: string | null;
  /** the finished product's unit count, when the OM states one — on a
   *  conversion or a development only a count it labels proposed or planned
   *  (lib/criteria `planCountRow`), never today's building's */
  units: number | null;
  /** total cost over the planned units — the basis a comp or a per-unit
   *  norm is held against on a plan deal; null when either is unknown */
  costPerUnit: number | null;
  /** why no basis per unit is struck where, on a conversion or a
   *  development, the memorandum labels no count proposed or planned, in
   *  one plain sentence; null or absent otherwise */
  costPerUnitWithheld?: string | null;
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
  const priceMetric = findPriceMetric(metrics, strategy.kind, screenYearOf(extraction));
  const priceRaw = priceMetric ? parsePrice(priceMetric.value) : null;
  const stated = priceRaw != null && priceRaw > 0 ? priceRaw : null;
  // What the price buys (#414, #415): a share's is grossed up to the whole
  // the plan's figures describe; a note's, a leased fee's and a share's
  // with no stated percentage is not the project's and never enters its
  // total cost — the plan says why rather than "not stated".
  const interest = interestOf(extraction);
  const price = buildingPriceOf(extraction, stated);
  // Beside the loan its entity carries, a share's price grosses up to the
  // equity's whole: shown, with the loan beside it, and never a cost the plan
  // builds on — the building's cost is that plus the loan, which the model
  // does not add.
  const equityWhole =
    price == null && stated != null && interest.sharePct != null && interest.entityLoan != null
      ? stated / (interest.sharePct / 100)
      : null;
  const priceWithheld =
    stated == null || price != null || equityWhole != null
      ? null
      : interest.kind === "note"
        ? `${money(stated)} for the note — a loan's price, not the project's`
        : interest.kind === "preferred_equity"
          ? `${money(stated)} for the preferred equity position — a position's price, not the project's`
          : interest.kind === "leased_fee"
            ? `${money(stated)} for the land under the ground lease — not the project's`
            : isGpStake(extraction)
              ? // A share of a share (research pass 37): its percentage is
                // the general partner's interest's, never the entity's.
                `${money(stated)} for a share of the general partner's interest — a share of a share, not the project's`
              : `${money(stated)} for a share of no stated percentage — not the whole project's`;
  // A leased fee's buyer holds the land: the works and their cost are the
  // leaseholder's, so the plan has no cost or yield of the buyer's to state.
  const landOnly = interest.kind === "leased_fee";
  // A forward purchase or a build-to-suit bought at delivery (research pass
  // 28): the developer funds the works, so the price is the buyer's whole
  // cost and the yield on cost is the NOI the memorandum states at delivery
  // over it — a budget it states is the developer's, said and never added.
  const forward = isForwardPurchase(extraction, strategy);
  const stabilizedNoi = forward
    ? forwardDeliveryNoi(metrics, BUILD_TO_SUIT_WORDS.test(forwardWordsOf(extraction)))
    : (noiFigures(metrics).find((f) => f.kind === "stabilized") ?? null);
  // A metric row with its page first; the strategy's own wording when the
  // budget appears nowhere else. Against a land price the works are bounded
  // by the absolute ceiling only — a site is a fraction of what is built.
  const wholeAsset = !priceRowIsLand(priceMetric);
  // A value-add stating its program a door at a time and no total (#460):
  // the doors times a door's cost, derived and said so — never added to a
  // total the memorandum does state. Read against the building's price
  // alone: the equity's whole is no price to take out of an all-in total.
  const statedBudget = landOnly
    ? null
    : (capitalBudgetFromMetrics(metrics, price, wholeAsset) ??
      budgetFromText(extraction.strategy?.capitalBudget, price, wholeAsset) ??
      (strategy.kind === "value_add" ? renovationProgramBudget(metrics, price, wholeAsset) : null));
  const budget = forward ? null : statedBudget;
  // Price plus the works; or, when the OM states an all-in total and no
  // price, that total itself — a yield on cost needs no split of the two.
  // On a forward purchase the price alone.
  const totalCost = forward
    ? price
    : price != null && budget
      ? price + budget.budget
      : budget?.isTotal
        ? budget.budget
        : null;
  const rawYield = stabilizedNoi && totalCost != null && totalCost > 0 ? stabilizedNoi.value / totalCost : null;
  // A yield on cost no project earns is refused, as the cap reader refuses a
  // cap past the same ceiling, and said why in its place (research pass 38:
  // "Total project cost 48,500 ($000s)", read as $48,500, printed a
  // 6597.94% yield on cost on the card, the header, the plan's facts and
  // every Claude step's context, with no finding anywhere).
  const yieldWithheld =
    rawYield != null && rawYield >= IMPLIED_CAP_CEILING && stabilizedNoi && totalCost != null
      ? forward
        ? `No yield on cost is struck: the ${money(stabilizedNoi.value)} NOI at delivery is ${pct(IMPLIED_CAP_CEILING, 0)} or more of the ${money(totalCost)} price, a yield no delivered building earns, so the price or the NOI was most likely misread.`
        : `No yield on cost is struck: the ${money(stabilizedNoi.value)} stabilized NOI is ${pct(IMPLIED_CAP_CEILING, 0)} or more of the ${money(totalCost)} total cost, a yield no project earns, so the total cost or the NOI was most likely misread.`
      : null;
  const yieldOnCost = yieldWithheld ? null : rawYield;
  // The finished product's count (lib/criteria `planCountRow`): on a
  // conversion or a development only a row the memorandum labels proposed
  // or planned — today's building's count is no count of what the total
  // cost buys (the audit of 2026-10-05: an office-to-hotel conversion's
  // $60M over its 40 suites read $1.5M a unit, where a proposed key costs
  // $375k). Where the memorandum labels no count proposed or planned, no
  // basis per unit is struck, and the plan says why: an unlabelled count may
  // be the building as it stands, and is not read as the finished project's.
  const countRow = planCountRow(metrics, strategy.kind);
  const units = countRow ? parseCount(countRow.value) : null;
  const unlabelled = units == null && totalCost != null && notYetDelivered(strategy.kind) ? unitCountRow(metrics) : null;
  const unlabelledCount = unlabelled ? parseCount(unlabelled.value) : null;
  const unlabelledNoun = unlabelled ? countNounOf([unlabelled], extraction.assetClass) : null;
  const costPerUnitWithheld =
    unlabelledCount != null && unlabelledNoun
      ? `No basis per ${unlabelledNoun.one} (all-in) is struck: the memorandum labels no count proposed or planned, so its ${unlabelledCount.toLocaleString("en-US")} ${unlabelledCount === 1 ? `${unlabelledNoun.one} is` : `${unlabelledNoun.many} are`} not read as the finished project's.`
      : null;
  // Beside the loan the entity carries, a share's price grosses up to the
  // equity's whole, not the asset's: the label says so on every surface
  // that prints the plan's facts, as the others do (research pass 23), and
  // no total cost is struck on it (said in one sentence, `costWithheld`).
  const entityLoan = equityWhole != null ? interest.entityLoan : null;
  const shown = price ?? equityWhole;
  // All of the entity's interests (a stated 100%, research pass 28): the
  // price is the whole's, never "the share grossed up".
  const allInterests = isWholeShare(interest.sharePct);
  // A stated total project cost above a share's grossed-up price makes that
  // figure the equity's whole, never the whole (research pass 37): labelled
  // so, the cost the plan builds on unchanged.
  const projectCostAbove = price != null && !priceRowIsLand(priceMetric) ? shareProjectCostOf(extraction, price) : null;
  return {
    kind: strategy.kind,
    price,
    equityWhole,
    priceLabel: priceRowIsLand(priceMetric)
      ? "Land cost"
      : interest.kind === "partial_interest" && shown != null
        ? entityLoan != null
          ? allInterests
            ? "Equity's whole, all the entity's interests"
            : "Equity's whole, the share grossed up"
          : allInterests
            ? "Price"
            : projectCostAbove != null
              ? "Equity's whole, the share grossed up"
              : "Whole price, the share grossed up"
        : "Price",
    priceWithheld,
    entityLoan,
    ...(projectCostAbove != null ? { projectCostAbove } : {}),
    stabilizedNoi,
    budget,
    totalCost,
    yieldOnCost,
    yieldWithheld,
    ...(forward ? { forward: true, developerBudget: statedBudget } : {}),
    // On a tenancy in common the stated loan is the property's: no entity owns
    // it (research pass 37).
    ...(entityLoan != null && isTenancyInCommon(extraction) ? { loanOnProperty: true } : {}),
    costWithheld:
      entityLoan != null && totalCost == null
        ? `No total cost or yield on cost is struck on the equity's whole: the building's cost is that plus ${entityLoanWords(extraction, money(entityLoan), "short")}, which the model does not add.`
        : null,
    units,
    costPerUnit: totalCost != null && units != null ? totalCost / units : null,
    costPerUnitWithheld,
    // The strategy's own words first; else the metric rows the extraction
    // was asked to capture on a plan deal (construction period, lease-up,
    // the year the plan stabilizes), joined as "label: value".
    timeline: extraction.strategy?.timeline?.trim() || timelineFromMetrics(metrics),
    capitalBudgetText: extraction.strategy?.capitalBudget?.trim() ?? "",
  };
}

// The words on an NOI row that say its figure is not whole dollars: in
// thousands ("2,450 ($000s)", "in thousands"). A month's figure is read as
// the year it makes (`noiOfRow`), so no row's month is run as a year's.
const IN_THOUSANDS_WORDS = /\(\s*\$?\s*0{3}'?s?\s*\)|\$\s*0{3}'?s?(?![\d,])|\bin\s+thousands\b/i;

/** Where an NOI row's figure was read off a month, or its own words say it
 *  is in thousands, the sentence that quotes them — the row is the one the
 *  figure was read from, label and value as stated; "" where neither. */
function noiRowWords(metrics: MetricLike[], f: NoiFigure): string {
  const row = metrics.find((m) => m.label === f.label && noiOfRow(m)?.value === f.value);
  if (!row) return "";
  const words = `${row.label} ${row.value}`;
  const quoted = `“${row.label.trim()}: ${row.value.trim()}”`;
  if (f.month != null) return ` The row reads ${quoted} — a month's figure, read here as twelve times the month.`;
  if (IN_THOUSANDS_WORDS.test(words)) return ` The row reads ${quoted} — a figure in thousands of dollars, which every return here runs as dollars.`;
  return "";
}

/** Where a cost row's own words say its figure is in thousands, the sentence
 *  that quotes them, label and value as stated; "" where they do not, or no
 *  row is named. */
function thousandsRowWords(row: MetricLike | null | undefined): string {
  if (!row || !IN_THOUSANDS_WORDS.test(`${row.label} ${row.value}`)) return "";
  return ` The row reads “${row.label.trim()}: ${row.value.trim()}” — a figure in thousands of dollars, which the plan's cost here reads as dollars.`;
}

// The plans whose budget is works — a renovation, a conversion, a building
// to put up. A lease-up's budget is its leasing capital, which can be small.
const WORKS_KINDS: ReadonlySet<StrategyKind> = new Set(["value_add", "conversion", "development"]);

/** "$12.50", "$243", "$4,250": a figure a unit, to the cent under $100. */
const perText = (n: number): string => `$${n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US")}`;

/**
 * Rule 4 of the plausibility check, and its plan's half (research pass 38):
 * a per-unit or per-SF basis outside any US market — on a plan deal the
 * plan's TOTAL COST over its planned units, run with or without a price row
 * — and a works budget under what any renovation or construction program
 * costs. A development stating "Total project cost 48,500 ($000s)" and no
 * land price read $243 a planned unit, and a value-add's "Renovation budget
 * 2,500" on 200 apartments $12.50 a door, with no finding for either.
 * `price` is the price the deal's figures describe (a share's grossed up),
 * null where the memorandum states none, and `priceWord` names it.
 */
function costFindings(
  extraction: ExtractionResult,
  strategy: DealStrategy,
  price: number | null,
  priceWord: string,
): PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  const metrics = extraction.metrics ?? [];
  const planDeal = NON_STABILIZED.has(strategy.kind);
  const plan = planDeal ? planSummary(extraction, strategy) : null;
  const interest = interestOf(extraction);
  const priceRow = findPriceMetric(metrics, strategy.kind, screenYearOf(extraction));
  const budgetRow = plan?.budget ? (metrics.find((m) => m.label === plan.budget!.label) ?? null) : null;

  // 4. A per-unit or per-SF basis outside any US market — a misparse. The
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
  const basisTotal = planDeal ? (plan?.totalCost ?? null) : price;
  const basisNoun = planDeal ? "total cost" : priceWord;
  // The row the basis was read from, quoted where its own words say it is
  // in thousands: a stated total, else the works and the price.
  const basisWords = planDeal
    ? thousandsRowWords(budgetRow) || (plan?.budget?.isTotal ? "" : thousandsRowWords(priceRow))
    : thousandsRowWords(priceRow);
  const misread = (other: string) =>
    planDeal
      ? `No ${clsWord} market delivers there. The total cost or the ${other} was most likely misread — check both against their source pages before the all-in basis is used anywhere.${basisWords}`
      : `No ${clsWord} market trades there. The price or the ${other} was most likely misread — check both against their source pages before the basis is used anywhere.${basisWords}`;
  // A leased fee's price buys the land alone: over the building's units or
  // feet it is no basis any building market trades at, and never a misread.
  const landOnly = interest.kind === "leased_fee";
  // A data center is priced by its power, not its floor, so a fitted one
  // runs past the ceiling any warehouse sets; and an outdoor-storage yard's
  // price over the small building on it says nothing about the yard, which
  // trades by the usable acre. Neither is a misread (the site-researcher's
  // pass of 2026-09-30): the data center is held to the band's floor only,
  // the yard to no per-SF band at all.
  // The band itself is `basisOutsideBand`, which the pipeline card's basis
  // keeps to as well.
  const yard = isOutdoorStorageYard(extraction.assetClass);
  if (!landOnly && basisTotal != null && cls && words.basis === "unit" && units != null && units >= 1 && units <= 50_000) {
    const perUnit = basisTotal / units;
    if (basisOutsideBand(perUnit, "unit", cls)) {
      findings.push({
        code: "basis_out_of_band",
        severity: "medium",
        title: `${money(basisTotal)} of ${basisNoun} over ${Math.round(units).toLocaleString("en-US")} ${noun.many} is ${money(perUnit)} per ${noun.one}`,
        detail: misread(`${noun.one} count`),
      });
    }
  } else if (!landOnly && !yard && basisTotal != null && cls && words.basis === "sf" && sf != null && sf > 100) {
    const perSf = basisTotal / sf;
    if (basisOutsideBand(perSf, "sf", cls)) {
      findings.push({
        code: "basis_out_of_band",
        severity: "medium",
        title: `${money(basisTotal)} of ${basisNoun} over ${Math.round(sf).toLocaleString("en-US")} SF is $${perSf < 10 ? perSf.toFixed(2) : Math.round(perSf).toLocaleString("en-US")} per SF`,
        detail: misread("building size"),
      });
    }
  }

  // 4b. A works budget under what any renovation or construction program
  //     costs: under about $1,000 a unit of the class's own count, or —
  //     where no count is read — under 1% of the price; a rule of thumb,
  //     said as one. Only a budget for
  //     the works alone (a stated total is the basis's, above) on a plan of
  //     works; a forward purchase's works are the developer's.
  const budget = plan?.budget ?? null;
  if (budget && !budget.isTotal && WORKS_KINDS.has(strategy.kind)) {
    const perUnit = words.basis === "unit" && units != null && units >= 1 ? budget.budget / units : null;
    const share = price != null && price > 0 ? budget.budget / price : null;
    const lowPerUnit = perUnit != null && perUnit < BUDGET_FLOOR_PER_UNIT;
    // The share of the price judges a budget only where no count is read,
    // or beside a per-unit figure that fails its own floor too: $1.2M over
    // 600 doors is $2,000 a door, a light program, whatever 0.8% of a
    // $150M price looks like (audit C3a). The floors are the owner's.
    const lowShare = share != null && share < BUDGET_FLOOR_SHARE && (perUnit == null || lowPerUnit);
    if (lowPerUnit || lowShare) {
      const shareText = share == null ? "" : share < 0.0001 ? "under 0.01%" : pct(share, 2);
      const said = [
        lowPerUnit ? `${perText(perUnit!)} per ${noun.one}` : "",
        lowShare ? `${shareText} of the ${money(price!)} ${priceWord}` : "",
      ].filter(Boolean);
      const floors = [
        lowPerUnit ? `about ${perText(BUDGET_FLOOR_PER_UNIT)} ${withArticle(noun.one)}` : "",
        lowShare ? `${pct(BUDGET_FLOOR_SHARE, 0)} of the price` : "",
      ].filter(Boolean);
      findings.push({
        code: "budget_low",
        severity: "medium",
        title: `${budget.label} of ${compactUsd(budget.budget, { thousandsFrom: 10_000 })} is ${said.join(" and ")}`,
        detail: `A works budget under ${floors.join(" or ")} is under what a renovation or construction program costs — a rule of thumb, not a market figure: a budget that small is, most often, a figure in thousands, one ${noun.one}'s cost entered as the whole program's, or a misread.${thousandsRowWords(
          budgetRow,
        )} Check the source page before the total cost, the yield on cost or any return built on the budget is relied on.`,
      });
    }
  }
  return findings;
}

/**
 * Check the extraction's headline figures against each other. Returns the
 * findings, most severe first, deduplicated by code. Empty when the figures
 * tie — or when there is no price to test them against (silence, not a
 * verdict: a blank is never zero), except a plan's own figures, which are
 * tested against each other with or without one (`costFindings`).
 */
export function assessPlausibility(
  extraction: ExtractionResult | null,
  strategy: DealStrategy = inferStrategy(extraction),
): PlausibilityFinding[] {
  if (!extraction) return [];
  const metrics = extraction.metrics ?? [];
  // What the price buys (lib/interest, #414). A note's price is a loan's:
  // set against the collateral's NOI it is a cap rate nobody earns, so no
  // price finding is made at all — the interest banner says why. A share's
  // price is grossed up to the whole the building's figures describe, and
  // said so; a share the OM states no single percentage for is not
  // compared at all.
  const interest = interestOf(extraction);
  // A preferred equity position's price is a position's, as a note's is a
  // loan's: no price finding (lib/position).
  if (interest.kind === "note" || interest.kind === "preferred_equity") return [];
  if (interest.kind === "partial_interest" && interest.sharePct == null) return [];
  const priceMetric = findPriceMetric(metrics, strategy.kind, screenYearOf(extraction));
  const stated = priceMetric ? parsePrice(priceMetric.value) : null;
  // Without a price, a plan's own figures are still tested — its total cost
  // over its planned units, and its works budget (research pass 38).
  if (stated == null || !(stated > 0)) return isPlanDeal(strategy.kind) ? costFindings(extraction, strategy, null, "price") : [];
  const price = interest.sharePct != null ? stated / (interest.sharePct / 100) : stated;
  // Beside the entity's stated loan, what a share's price grosses up to is
  // the equity's whole, not the asset's: the loan sits on top of it, and
  // every finding measured on the figure names both (research pass 23). The
  // loan is never added to the price here.
  const entityLoan = interest.sharePct != null ? entityLoanOf(extraction) : null;
  // All of the entity's interests (a stated 100%, research pass 28): the
  // price itself, with nothing grossed up.
  const allInterests = isWholeShare(interest.sharePct);
  // Beside a stated total project cost above it, a share's grossed-up price
  // is the equity's whole too (research pass 37).
  const projectCost = shareProjectCostOf(extraction, price);
  const priceWord = allInterests
    ? "price for all the entity's interests"
    : interest.sharePct != null
      ? entityLoan != null || projectCost != null
        ? "whole equity the share implies"
        : "whole-asset price the share implies"
      : "price";
  const wholeNote =
    entityLoan != null
      ? allInterests
        ? ` The ${money(price)} for all the entity's interests is the equity's whole, not the asset's: the entity's stated ${money(entityLoan)} loan sits on top of it.`
        : ` The ${money(price)} is the equity's whole, grossed up from the share's price — not the asset's: ${entityLoanWords(extraction, money(entityLoan))} sits on top of it.`
      : projectCost != null
        ? ` The ${money(price)} is the equity's whole, grossed up from the share's price — not the project's: the memorandum's stated ${money(projectCost)} total project cost sits above it.`
        : "";

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
        title: `${noiFigureWords(f, money)} is ${pct(implied, 0)} of the ${money(price)} ${priceWord} on ${withArticle(strategy.label.toLowerCase())} deal`,
        detail: `A building mid-plan does not earn that today. This is almost certainly the finished project's stabilized pro forma carrying an in-place or Year-1 label — read it as the stabilized figure, and confirm what the building actually earns during the works.`,
      });
      continue;
    }
    if (f.kind === "stabilized") {
      findings.push({
        code: "strategy_unsettled",
        severity: "medium",
        title: `${noiFigureWords(f, money)} is ${pct(implied, 0)} of the ${money(price)} ${priceWord}`,
        detail: `A stabilized figure that far above the price belongs to a plan — a conversion, a development, a lease-up — that the deck does not name plainly. Settle what the deal is first: measured against total cost it may be a fine yield; against the price alone it means nothing.`,
      });
      continue;
    }
    findings.push({
      code: f.value >= price ? "noi_exceeds_price" : "implied_cap_impossible",
      severity: "high",
      title:
        f.value >= price
          ? `${noiFigureWords(f, money)} is above the ${money(price)} ${priceWord}`
          : `${noiFigureWords(f, money)} implies ${withArticle(pct(implied, 0))} cap rate`,
      detail: `No operating property yields ${pct(implied, 0)}. Either the NOI or the price was misread, or the OM's NOI is a stabilized pro forma for a plan the deck describes elsewhere. Check the source pages before relying on any return built from these two figures.`,
    });
  }

  // The NOI the building earns as bought: the in-place figure, else Year 1.
  const going = figs.find((f) => f.kind === "in_place") ?? figs.find((f) => f.kind === "year1");

  // 1b. An NOI far UNDER what a stabilized building yields on this price
  //     (research pass 38). Under the floor is, as a rule of thumb, a price
  //     for land or a redevelopment, a figure stated a month at a time or in
  //     thousands, or a misread — said as the rule of thumb it is, with the
  //     row's own words where they say which. The figure tested is the one
  //     the model runs year 1 on: the NOI as bought, else, on a stabilized
  //     deal that states no other, its stabilized figure. None at or under
  //     zero, which is no income at all (rule 5), and none at or over the
  //     ceiling, which rule 1 has said.
  const anchor = going ?? figs.find((f) => f.kind === "stabilized") ?? null;
  if (strategy.kind === "stabilized" && anchor && anchor.value > 0 && anchor.value / price < IMPLIED_CAP_FLOOR) {
    const implied = anchor.value / price;
    findings.push({
      code: "implied_cap_low",
      severity: "medium",
      title: `${noiFigureWords(anchor, money)} implies ${withArticle(pct(implied, 2))} cap rate on the ${money(price)} ${priceWord}`,
      detail: `Under ${pct(IMPLIED_CAP_FLOOR, 0)} of the price is under the going-in cap a stabilized building trades at — a rule of thumb, not a market figure: an NOI that low is, most often, a price for land or a redevelopment, a figure stated a month at a time or in thousands, or a misread.${noiRowWords(
        metrics,
        anchor,
      )} Check the source page before relying on any return built from these two figures.`,
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

  // 3. On a leased fee the buyer's income is the ground rent (#415). An NOI
  //    well above the stated ground rent is the building's income, which
  //    belongs to the building's owner and only covers that rent — a return
  //    built on it counts income the buyer never receives.
  if (interest.kind === "leased_fee") {
    const groundRent = groundRentOf(extraction);
    if (groundRent != null && going && going.value > groundRent * 1.5) {
      findings.push({
        code: "ground_rent_mismatch",
        severity: "high",
        title: `${noiFigureWords(going, money)} is ${(Math.round((going.value / groundRent) * 10) / 10).toFixed(1)}× the ${money(groundRent)} ground rent on a leased fee`,
        detail: `The buyer of the land collects the ground rent; the building's operating income belongs to its owner and only has to cover that rent. Every return built on the larger figure counts income the buyer never receives — check which income the NOI row states before relying on it.`,
      });
    }
  }

  // 4. The basis against any market's band, and a plan's works budget
  //    against what any program costs (`costFindings`, which a plan with no
  //    price row runs too).
  findings.push(...costFindings(extraction, strategy, price, priceWord));

  // 5. A stabilized deal with no income in place reads as something else —
  //    a stated NOI of nothing, or (research pass 37) a stated in-place
  //    occupancy of 0% with no in-place NOI stated beside it.
  const noIncomeDetail = `An operating asset produces income. Either this is a lease-up, conversion or development the deck does not name plainly, or the figure was misread. Settle the strategy first — every return depends on it.`;
  if (strategy.kind === "stabilized" && going && going.value <= 0) {
    findings.push({
      code: "no_income_in_place",
      severity: "medium",
      title: `${going.label} is ${money(going.value)} on a deal read as stabilized`,
      detail: noIncomeDetail,
    });
  } else if (strategy.kind === "stabilized" && !figs.some((f) => f.kind === "in_place") && occupancyPctFromMetrics(metrics) === 0) {
    findings.push({
      code: "no_income_in_place",
      severity: "medium",
      title: `${occupancyRow(metrics)?.label.trim() || "Occupancy"} is 0% and no in-place NOI is stated, on a deal read as stabilized`,
      detail: noIncomeDetail,
    });
  }

  // Dedupe by code, most severe first, stable within severity. A finding
  // measured on a share's grossed-up figure beside the entity's loan says
  // what that figure is.
  const seen = new Set<string>();
  return findings
    .map((f) => (wholeNote && f.code !== "no_income_in_place" ? { ...f, detail: `${f.detail}${wholeNote}` } : f))
    .filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

/**
 * The plan as every surface that prints its all-in basis reads it — the plan
 * strip, the shared screen, the report's plan page, the memo, the deal
 * context and the verdict's basis line. Where the plausibility check finds
 * the plan's basis outside the band any market delivers at (rule 4's
 * `basis_out_of_band`: a total cost stated in thousands over 200 planned
 * units), no basis per planned unit is struck and `basisWithheld` says why in
 * one sentence that never prints the misread figure (research pass 38: "$243
 * per planned unit" reached every Claude step and the plan strip beside the
 * check's own finding). The plan as it is otherwise.
 */
export function planWithBasisChecked(
  extraction: ExtractionResult | null,
  strategy: DealStrategy,
  plan: PlanSummary | null,
): PlanSummary | null {
  if (!plan || !extraction || plan.totalCost == null) return plan;
  if (!assessPlausibility(extraction, strategy).some((f) => f.code === "basis_out_of_band")) return plan;
  const words = assetWords((extraction.assetClass ?? "").toLowerCase());
  const noun = words.noun ?? { one: "unit", many: "units" };
  const sf = words.basis === "sf" ? buildingSfFromMetrics(extraction.metrics ?? []) : null;
  // "Planned" only where the building is still to be delivered: a
  // value-add's units stand.
  const planned = notYetDelivered(plan.kind) ? "planned " : "";
  // The count the check divided by: the plan's own, else — where a
  // conversion's or a development's memorandum labels no count proposed or
  // planned (`costPerUnitWithheld`) — the one it states for the building
  // today, said as that and never as planned.
  const today = plan.units == null ? unitCountFromMetrics(extraction.metrics ?? []) : null;
  const over =
    sf != null
      ? `the building's ${Math.round(sf).toLocaleString("en-US")} SF`
      : plan.units != null
        ? `the ${plan.units.toLocaleString("en-US")} ${planned}${plan.units === 1 ? noun.one : noun.many}`
        : today != null
          ? `the ${today.toLocaleString("en-US")} ${today === 1 ? noun.one : noun.many} it states for the building today`
          : `its ${planned}${noun.many}`;
  return {
    ...plan,
    costPerUnit: null,
    basisWithheld: `No all-in basis is struck: the ${money(plan.totalCost)} total cost over ${over} is outside the band any market delivers at, so the total cost or the ${sf != null ? "area" : "count"} was most likely misread.`,
  };
}

/**
 * Which of the plan's figures the deal context states (lib/deal-context's
 * plan sentences): the NOI wherever one is stated, the total cost and the
 * yield on cost beside it where both are struck, the timeline where one is
 * stated, and a yield or a cost withheld always, with its sentence. A brief
 * that carries the context beside the plan's own line leaves these to it, so
 * each is said once (research pass 41); the verdict brief's test holds the
 * two to each other.
 */
function planFiguresSaidByContext(plan: PlanSummary): { noi: boolean; costAndYield: boolean; timeline: boolean } {
  const noi = plan.stabilizedNoi != null;
  return { noi, costAndYield: noi && plan.totalCost != null && plan.yieldOnCost != null, timeline: !!plan.timeline };
}

/** The plan's figures as one sentence for the brief — what is stated, and
 *  plainly what is not. With `contextSays`, only what the deal context beside
 *  it does not state: the price and the budget, and each figure it leaves
 *  out. */
function planLine(plan: PlanSummary, contextSays = false, extraction: ExtractionResult | null = null): string {
  // A figure's own words end without a period: the parts are joined by
  // semicolons and the line closes with one (research pass 41: "as units
  // turn.." and "2030.;").
  const bare = (t: string) => t.trim().replace(/[.\s]+$/, "");
  const said = contextSays ? planFiguresSaidByContext(plan) : null;
  const parts: string[] = [];
  // A forward purchase's NOI is the one the memorandum states at delivery,
  // which on a build-to-suit is the lease's first year.
  const noiWord = plan.forward ? "NOI at delivery" : "stabilized NOI";
  // A figure read off a month says so beside the year it makes (research
  // pass 40).
  const monthOf = (f: NoiFigure) => (f.month != null ? `, twelve times the ${money(f.month)} a month stated` : "");
  if (!said?.noi) {
    parts.push(
      plan.stabilizedNoi
        ? `${noiWord} ${money(plan.stabilizedNoi.value)} (${plan.stabilizedNoi.label}${monthOf(plan.stabilizedNoi)})`
        : `${noiWord} not stated`,
    );
  }
  // A share's grossed-up price, either label, reads as it did: the
  // parenthesis below names the equity's whole beside the entity's loan.
  const shareWhole =
    plan.priceLabel === "Whole price, the share grossed up" || plan.priceLabel === "Equity's whole, the share grossed up";
  const shown = plan.price ?? plan.equityWhole ?? null;
  parts.push(
    shown != null
      ? `${shareWhole ? `whole price, the ${isTenancyInCommon(extraction) ? "interest's" : "share's"} grossed up,` : "price"} ${money(shown)}${
          plan.entityLoan != null
            ? ` (the equity's whole, not the asset's: ${
                plan.loanOnProperty ? `the stated ${money(plan.entityLoan)} loan on the property` : `the entity's stated ${money(plan.entityLoan)} loan`
              } sits on top of it)`
            : plan.projectCostAbove != null
              ? ` (the equity's whole, not the project's: the memorandum's stated ${money(plan.projectCostAbove)} total project cost sits above it)`
              : ""
        }`
      : plan.priceWithheld
        ? `price ${plan.priceWithheld}`
        : "price not stated",
  );
  parts.push(
    plan.budget
      ? plan.budget.isTotal
        ? // Beside the equity's whole the OM states a price — the share's —
          // and no building's price to take out of the total.
          `${money(plan.budget.budget)} all-in (${plan.budget.label}; ${
            plan.equityWhole != null
              ? plan.priceLabel === "Equity's whole, all the entity's interests"
                ? "the price for all the entity's interests is the equity's whole, not the building's"
                : "the share's price grossed up is the equity's whole, not the building's"
              : "the OM states no price"
          }, so the acquisition inside it is not separable)`
        : `${plan.budget.allIn ? "budget " : ""}${money(plan.budget.budget)}${plan.budget.allIn ? ` (${plan.budget.label} less the price)` : ` (${plan.budget.label})`}`
      : plan.forward
        ? // The developer funds a forward purchase's works: a budget the
          // memorandum states is the developer's, never added to the price.
          plan.developerBudget
          ? `the ${money(plan.developerBudget.budget)} budget (${plan.developerBudget.label}) is the developer's, who funds the works — never added to the price`
          : "no construction budget is the buyer's: the developer funds the works"
        : "construction / renovation budget not stated in the figures",
  );
  if (plan.totalCost != null && !said?.costAndYield) {
    parts.push(plan.forward ? `total cost ${money(plan.totalCost)}, the price` : `total cost ${money(plan.totalCost)}`);
  }
  // As the deal page prints it, so a verdict that quotes it quotes the
  // page's own figure.
  if (plan.yieldOnCost != null && !said?.costAndYield) parts.push(`yield on total cost ${yieldOnCostText(plan.yieldOnCost)}`);
  // …where none is struck past the ceiling, the page's sentence why…
  if (plan.yieldWithheld && !said) parts.push(plan.yieldWithheld.replace(/\.$/, "").replace(/^No /, "no "));
  // …and where none is struck on the equity's whole, the page's sentence why.
  if (plan.costWithheld && !said) parts.push(plan.costWithheld.replace(/\.$/, "").replace(/^No /, "no "));
  if (!said?.timeline) parts.push(plan.timeline ? `timeline: ${bare(plan.timeline)}` : "timeline to stabilization not stated");
  if (plan.capitalBudgetText) parts.push(`budget as worded: ${bare(plan.capitalBudgetText)}`);
  return parts.join("; ");
}

/** How a plan's stabilized pro forma is tested — the paragraph a plan deal's
 *  brief carries after its figures. */
const PLAN_TEST =
  "Test whether it is as conservative as the deck presents it: the rents and occupancy behind it against today's market, the operating ratio, the construction or renovation budget and schedule against comparable projects, the carry and the income (if any) through the works, and the yield on total cost against the exit cap and against the cost of construction debt. Judge the plan on yield on cost, downtime and execution risk — never on a going-in cap on the acquisition price.";
/** The test where the memorandum states the stabilized NOI and no budget:
 *  no total cost, so no yield on cost, and the budget is asked for rather
 *  than tested (research pass 37's rule for a lease-up, carried to the
 *  works). */
const PLAN_TEST_NO_BUDGET =
  "Test whether it is as conservative as the deck presents it: the rents and occupancy behind it against today's market and the operating ratio. The memorandum states no construction or renovation budget, so there is no total cost and no yield on cost to judge the plan on: ask for the budget, its schedule, its contingency and the carry through the works before judging it — never on a going-in cap on the acquisition price.";
const PLAN_HEAD =
  "The stabilized NOI is the sponsor's post-completion pro forma — not a misread and not today's income: it is expected to sit above today's income (far above it on a conversion or a development), so struck over the acquisition price alone it reads as a cap the building does not earn today.";
/** The same opening where a finding stands, or no yield on cost is struck
 *  past the ceiling (research pass 38): the plan's figures do not all tie,
 *  so the NOI is never called "not a misread" — it, or the cost it is set
 *  against, may be one. */
const PLAN_HEAD_UNTIED =
  "The stabilized NOI is the sponsor's post-completion pro forma, not today's income: it is expected to sit above today's income (far above it on a conversion or a development), so struck over the acquisition price alone it reads as a cap the building does not earn today. But the plan's figures do not all tie, as said here, so it or the cost it is set against may be a misread: check both against their source pages before judging the plan on them.";

/**
 * The paragraph a plan whose works are the plan carries — a value-add, a
 * conversion, a development (a lease-up's is `leaseUpPlanText`, a forward
 * purchase's `FORWARD_PLAN_TEXT`). A stabilized NOI and a budget are spoken
 * of, and tested, only where the memorandum states them, each it does not
 * state said to be not stated (research pass 37: the paragraph had told
 * every step to test "the stabilized NOI" and "the budget" on a plan that
 * stated neither). Without a plan summary it is the paragraph as it was.
 */
function worksPlanText(plan: PlanSummary | null, untied: boolean): string {
  const head = untied ? PLAN_HEAD_UNTIED : PLAN_HEAD;
  if (!plan) return `${head} ${PLAN_TEST}`;
  if (plan.stabilizedNoi != null) return `${head} ${plan.budget != null ? PLAN_TEST : PLAN_TEST_NO_BUDGET}`;
  return [
    "The memorandum states no stabilized NOI, so there is no pro forma for the finished project to test and no yield on cost to judge, and none is built here.",
    plan.budget != null
      ? "Test the budget it states and its schedule against comparable projects, with the carry and any income through the works."
      : "Nor does it state a construction or renovation budget: ask for it, its schedule, its contingency and the carry through the works before any figure is put on the plan.",
    "Judge the plan on what the memorandum states and ask for the rest — never on a going-in cap on the acquisition price.",
  ].join(" ");
}

/** The paragraph a forward purchase's brief carries in its place: the
 *  developer funds the works, so no construction budget, carry, interest
 *  reserve or construction loan is the buyer's. */
const FORWARD_PLAN_TEXT =
  "A FORWARD PURCHASE: the buyer pays the price at delivery and the developer funds the works, so the buyer carries no construction — no budget, no carry through the works, no interest reserve and no construction or bridge loan of its own; the price is the buyer's whole cost. The NOI the memorandum states at delivery is the delivered building's figure, not today's income: test it against today's leased comparables, and judge the purchase on its yield at delivery against the exit cap, on the clock to delivery against the outside date, and on the deposit at risk before delivery — never on a going-in cap on a building that stands.";

/**
 * A lease-up's paragraph in place of `worksPlanText` (research pass 37): the
 * building stands and the plan is the leasing, so a stabilized NOI and a
 * budget are spoken of only where the memorandum states them — each one it
 * does not state is said to be not stated, never tested as if it were. Where
 * the plan's figures do not all tie (`untied`), its stabilized NOI is never
 * called "not a misread", as `PLAN_HEAD_UNTIED` says for any plan.
 */
function leaseUpPlanText(plan: PlanSummary | null, untied = false): string {
  const noi = plan?.stabilizedNoi != null;
  return [
    noi
      ? untied
        ? "The stabilized NOI is the sponsor's pro forma for the building once it is leased, not today's income: struck over the acquisition price alone it reads as a cap the building does not earn today. But the plan's figures do not all tie, as said here, so it or the cost it is set against may be a misread: check both against their source pages before judging the plan on them."
        : "The stabilized NOI is the sponsor's pro forma for the building once it is leased — not a misread and not today's income: struck over the acquisition price alone it reads as a cap the building does not earn today."
      : "The memorandum states no stabilized NOI, so there is no pro forma for the leased building to test and no yield on cost to judge, and none is built here.",
    plan?.budget != null
      ? "Test the budget it states — the tenant improvements, the commissions, any renovation — and its schedule against comparable lease-ups."
      : "Nor does it state a construction, renovation or leasing budget: ask for the tenant improvements, the commissions and the downtime the lease-up will cost before any rent is paid.",
    noi
      ? "Test whether the stabilized NOI is as conservative as the deck presents it: the rents and occupancy behind it against today's market, the operating ratio, the carry and any income through the lease-up, and the yield on total cost against the exit cap and against the cost of debt. Judge the plan on yield on cost, downtime and execution risk — never on a going-in cap on the acquisition price."
      : "Judge the plan on the time and the cost of leasing the building and on the carry until it is let — never on a going-in cap on the acquisition price.",
  ].join(" ");
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
  /** the extraction, which says what the price buys: on a note or a leased
   *  fee the type is said as whose strategy it is (lib/interest
   *  `dealTypeLabel`), the collateral's or the leaseholder's building's */
  extraction: ExtractionResult | null = null,
  /** the same input carries the deal context (lib/deal-context), which says
   *  the deal's type, its summary and the plan's headline figures — the
   *  verdict's brief: they are left to it, said once (research pass 41) */
  contextSaysPlan = false,
): string {
  const bits: string[] = [];
  if (isPlanDeal(strategy.kind)) {
    // A forward purchase's own line in its kind's place (research pass 41:
    // a development's "only a budget" opened a purchase whose budget is the
    // developer's). An inferred plan deal's summary IS the reading line;
    // print it once.
    const forward = !!plan?.forward || isForwardPurchase(extraction, strategy);
    const reading = forward ? FORWARD_READING : STRATEGY_READING[strategy.kind];
    if (contextSaysPlan) {
      // The context says "Deal type: <type> — <summary>": the reading, only
      // where that summary is not this very sentence.
      if (strategy.summary !== reading) bits.push(`DEAL STRATEGY: ${reading}`);
    } else {
      // The type and its summary end their own sentence before the reading.
      const summary =
        strategy.summary && strategy.summary !== reading && strategy.summary !== STRATEGY_READING[strategy.kind]
          ? ` — ${strategy.summary.trim().replace(/[.\s]+$/, "")}`
          : "";
      bits.push(`DEAL STRATEGY: ${dealTypeLabel(strategy.label, extraction)}${summary}. ${reading}`);
    }
    const figures = plan ? planLine(plan, contextSaysPlan, extraction) : "";
    if (figures) bits.push(`THE PLAN AS THE OM STATES IT: ${figures}.`);
    // A forward purchase (research pass 28): the buyer carries no
    // construction, so the construction paragraph a development gets is the
    // purchase's own — the facts and traps by name follow in the
    // challenger's notes (lib/forward-purchase `forwardNote`).
    // A lease-up's building stands (research pass 37): its paragraph is the
    // leasing's, and never speaks of a stabilized NOI or a budget the
    // memorandum does not state. "Not a misread" only where no finding
    // stands and no yield on cost was refused past the ceiling (research
    // pass 38), on a lease-up as on any plan.
    bits.push(
      forward
        ? FORWARD_PLAN_TEXT
        : strategy.kind === "lease_up"
          ? leaseUpPlanText(plan, findings.length > 0 || !!plan?.yieldWithheld)
          : worksPlanText(plan, findings.length > 0 || !!plan?.yieldWithheld),
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
