import { findGoingInCap, findMetric, parseMoney, parsePct } from "@/lib/criteria";
import {
  findPriceMetric,
  inferStrategy,
  planSummary,
  type StrategyKind,
} from "@/lib/deal-strategy";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { normalizeStage, type Stage } from "@/lib/stages";

/**
 * Portfolio analytics: every screened deal leaves extracted figures behind —
 * this derives the numeric series the /analytics charts plot. Same honesty
 * rules as the internal comps memory: the sample deal never counts, and a
 * deal only contributes a point when its figure actually parsed.
 *
 * The deal's kind is read first. A plan deal (value-add, lease-up,
 * conversion, development) has no going-in cap — its stabilized figure is
 * the finished project's, judged on yield on total cost — so it never lands
 * in the cap series, and its basis per unit is total cost over the planned
 * units, never the shell's price over apartments that do not exist yet.
 */

export interface AnalyticsDeal {
  id: string;
  name: string;
  /** ISO created_at — the screen date */
  at: string;
  stage: Stage;
  verdict: "pass" | "caution" | "pass_on" | null;
  /** the deal's strategy — "unknown" only when the extraction gives nothing to read */
  kind: StrategyKind;
  /** going-in cap, % — null on a plan deal, which has none */
  capPct: number | null;
  /** a plan deal's stabilized NOI over total cost, % — null for a stabilized asset */
  yieldOnCostPct: number | null;
  /** derived $/unit (multifamily) — null when either side didn't parse */
  perUnit: number | null;
  price: number | null;
  market: string;
  assetClass: string;
}

export interface AnalyticsRow {
  id: string;
  name: string | null;
  asset_class: string | null;
  created_at: string;
  is_sample: boolean | null;
  stage?: string | null;
  verdict: unknown;
  extraction: unknown;
}

function unitCount(metrics: ExtractedMetric[]): number | null {
  const units = findMetric(
    metrics,
    /^units?\b|number of units|unit count/i,
    /per|\/|price|\$/i,
  );
  const n = units ? Number(units.value.replace(/[,\s]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function deriveAnalytics(rows: AnalyticsRow[]): AnalyticsDeal[] {
  const out: AnalyticsDeal[] = [];
  for (const r of rows) {
    if (r.is_sample) continue;
    const raw = (r.extraction ?? null) as Partial<ExtractionResult> | null;
    if (!raw) continue;
    // Rows saved before `metrics` / `strategy` existed: normalise once so the
    // strategy reader never meets a missing array.
    const metrics = Array.isArray(raw.metrics) ? raw.metrics : [];
    const extraction = { ...raw, metrics } as ExtractionResult;
    const strategy = inferStrategy(extraction);
    const plan = planSummary(extraction, strategy);

    // A plan deal has no going-in cap: a stabilized or pro forma cap, or a
    // yield on cost, describes the finished project, not the price paid.
    const capMetric = plan ? null : findGoingInCap(metrics);
    const capPct = capMetric ? parsePct(capMetric.value) : null;

    // The asking / purchase price — or, on a development, the land cost.
    const priceMetric = findPriceMetric(metrics, strategy.kind);
    const price = priceMetric ? parseMoney(priceMetric.value) : null;

    let perUnit: number | null = null;
    if (plan) {
      // Basis per planned unit: what a finished unit costs all-in. The
      // shell's price over units still to be built is not a comparable
      // figure, so with no total cost there is no point to plot.
      const units = unitCount(metrics);
      if (plan.totalCost != null && units != null) perUnit = plan.totalCost / units;
    } else {
      const directPer = findMetric(metrics, /per unit|\/unit|unit price/i);
      if (directPer) perUnit = parseMoney(directPer.value);
      if (perUnit == null && price != null) {
        const units = unitCount(metrics);
        if (units != null) perUnit = price / units;
      }
    }

    const verdictRaw = (r.verdict as { verdict?: string } | null)?.verdict;
    out.push({
      id: r.id,
      name: r.name ?? "Deal",
      at: r.created_at,
      stage: normalizeStage((r.stage as string) ?? "screening"),
      verdict:
        verdictRaw === "pass" || verdictRaw === "caution" || verdictRaw === "pass_on"
          ? verdictRaw
          : null,
      kind: strategy.kind,
      capPct: capPct != null && capPct > 0 && capPct < 25 ? capPct : null,
      yieldOnCostPct: plan?.yieldOnCost != null ? plan.yieldOnCost * 100 : null,
      perUnit: perUnit != null && perUnit > 1_000 ? perUnit : null,
      price,
      market: extraction.market ?? "",
      assetClass: extraction.assetClass ?? (r.asset_class ?? ""),
    });
  }
  // Oldest → newest, so time charts read left to right.
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const fmtUsdCompact = (dollars: number): string =>
  dollars >= 1e6
    ? `$${(dollars / 1e6).toFixed(1)}M`
    : dollars >= 1e3
      ? `$${Math.round(dollars / 1e3)}k`
      : `$${Math.round(dollars)}`;
