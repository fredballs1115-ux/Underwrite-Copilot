import { findMetric, parseMoney, parsePct } from "@/lib/criteria";
import { normalizeStage, type Stage } from "@/lib/stages";

/**
 * Portfolio analytics: every screened deal leaves extracted figures behind —
 * this derives the numeric series the /analytics charts plot. Same honesty
 * rules as the internal comps memory: the sample deal never counts, and a
 * deal only contributes a point when its figure actually parsed.
 */

export interface AnalyticsDeal {
  id: string;
  name: string;
  /** ISO created_at — the screen date */
  at: string;
  stage: Stage;
  verdict: "pass" | "caution" | "pass_on" | null;
  capPct: number | null;
  /** derived $/unit (multifamily) — null when either side didn't parse */
  perUnit: number | null;
  price: number | null;
  market: string;
  assetClass: string;
}

interface MetricLike {
  label: string;
  value: string;
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

export function deriveAnalytics(rows: AnalyticsRow[]): AnalyticsDeal[] {
  const out: AnalyticsDeal[] = [];
  for (const r of rows) {
    if (r.is_sample) continue;
    const extraction = (r.extraction ?? null) as {
      assetClass?: string;
      market?: string;
      metrics?: MetricLike[];
    } | null;
    if (!extraction) continue;
    const metrics = Array.isArray(extraction.metrics) ? extraction.metrics : [];

    const capMetric = findMetric(
      metrics,
      /going[- ]?in cap|cap rate/i,
      /exit|pro ?forma|stabilized|terminal|reversion/i,
    );
    const capPct = capMetric ? parsePct(capMetric.value) : null;

    const priceMetric = findMetric(
      metrics,
      /asking price|purchase price|^price\b/i,
      /unit|\bsf\b|per|\/|psf/i,
    );
    const price = priceMetric ? parseMoney(priceMetric.value) : null;

    let perUnit: number | null = null;
    const directPer = findMetric(metrics, /per unit|\/unit|unit price/i);
    if (directPer) perUnit = parseMoney(directPer.value);
    if (perUnit == null && price != null) {
      const units = findMetric(
        metrics,
        /^units?\b|number of units|unit count/i,
        /per|\/|price|\$/i,
      );
      const n = units ? Number(units.value.replace(/[,\s]/g, "")) : NaN;
      if (Number.isFinite(n) && n > 0) perUnit = price / n;
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
      capPct: capPct != null && capPct > 0 && capPct < 25 ? capPct : null,
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
