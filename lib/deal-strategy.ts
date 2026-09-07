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
import { findMetric, parseMoney, parsePct } from "@/lib/criteria";

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
  valueAdd:
    /\b(value[- ]?add|renovat(ion|ed|e|ing)|reposition(ing|ed)?|upgrade program|interior upgrades|unit upgrades|heavy lift|rehab(ilitation)?|capital program)\b/i,
};

function haystack(
  extraction: ExtractionResult | null,
  signal?: { take?: string; dealName?: string | null } | null,
): string {
  const bits: string[] = [];
  if (extraction) {
    bits.push(extraction.dealName ?? "");
    bits.push(extraction.buyerNotes ?? "");
    bits.push(extraction.strategy?.summary ?? "");
    for (const m of extraction.metrics) bits.push(m.label, m.value);
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
  const hasMetrics = (extraction?.metrics.length ?? 0) > 0;
  if (!text.trim()) return { kind: "unknown", label: STRATEGY_LABEL.unknown, summary: "", source: "none" };

  let kind: StrategyKind;
  if (RX.conversion.test(text)) kind = "conversion";
  else if (RX.development.test(text)) kind = "development";
  else if (RX.leaseUp.test(text)) kind = "lease_up";
  else if (RX.valueAdd.test(text)) kind = "value_add";
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

const PRICE_INCLUDE = /asking price|purchase price|guidance|^price\b|offering price/i;
const PRICE_EXCLUDE = /unit|\bsf\b|\bper\b|\/|psf/i;
const CAP_INCLUDE = /going[- ]?in cap|^cap rate|\bcap\b/i;
const CAP_EXCLUDE = /exit|reversion|terminal|expense|capex|capital|rate cap/i;

const NON_STABILIZED: ReadonlySet<StrategyKind> = new Set([
  "value_add",
  "lease_up",
  "conversion",
  "development",
]);

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
  const metrics = extraction.metrics;
  const priceMetric = findMetric(metrics, PRICE_INCLUDE, PRICE_EXCLUDE);
  const price = priceMetric ? parseMoney(priceMetric.value) : null;
  if (price == null || !(price > 0)) return [];

  const findings: PlausibilityFinding[] = [];
  const planDeal = NON_STABILIZED.has(strategy.kind);
  const figs = noiFigures(metrics);

  // 1. Any NOI that cannot be capitalised against this price.
  for (const f of figs) {
    const implied = f.value / price;
    if (implied < IMPLIED_CAP_CEILING) continue;
    const forward = planDeal || f.kind === "stabilized";
    findings.push({
      code: f.value >= price ? "noi_exceeds_price" : "implied_cap_impossible",
      severity: "high",
      title:
        f.value >= price
          ? `${f.label} of ${money(f.value)} is above the ${money(price)} price`
          : `${f.label} of ${money(f.value)} implies a ${pct(implied, 0)} cap rate`,
      detail: forward
        ? `That is the stabilized pro forma for the finished ${strategy.kind === "conversion" ? "conversion" : "project"}, not income the building produces today. It cannot be capitalised against the acquisition price: measure it against total cost — price plus the construction budget — as a yield on cost, and expect little or no NOI through the works.`
        : `No operating property yields ${pct(implied, 0)}. Either the NOI or the price was misread, or the OM's NOI is a stabilized pro forma for a plan the deck describes elsewhere. Check the source pages before relying on any return built from these two figures.`,
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

  // 3. A per-unit or per-SF price outside any US market — a misparse.
  const unitsMetric = findMetric(metrics, /\bunits?\b|\bdoors?\b|unit count/i, /\bper\b|\/|price|rent|psf|value|\$/i);
  const units = unitsMetric ? parseMoney(unitsMetric.value) : null;
  const sfMetric = findMetric(
    metrics,
    /rentable|\brsf\b|square f|building size|total sf|gross (building|leasable)|\bgla\b|\bnra\b|\bsf\b/i,
    /\bper\b|\/|psf|land|acre|unit|\$/i,
  );
  const sf = sfMetric ? parseMoney(sfMetric.value) : null;
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

/**
 * The findings and the strategy as one paragraph for the challenger and the
 * verdict. Empty when there is nothing to say: a clean stabilized deal.
 */
export function plausibilityNote(
  findings: PlausibilityFinding[],
  strategy: DealStrategy,
): string {
  const bits: string[] = [];
  if (strategy.kind !== "unknown" && strategy.kind !== "stabilized") {
    bits.push(
      `DEAL STRATEGY: ${strategy.label}${strategy.summary ? ` — ${strategy.summary}` : ""} ${STRATEGY_READING[strategy.kind]} Judge the plan: the construction or renovation budget, the downtime and lease-up before stabilization, the yield on total cost, and what the building earns (or loses) in the meantime — not a going-in cap on the acquisition price.`,
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
