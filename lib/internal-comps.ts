import { findGoingInCap, findMetric, parseMoney, parsePct } from "@/lib/criteria";
import {
  findPriceMetric,
  inferStrategy,
  planSummary,
  type StrategyKind,
  unitCountFromMetrics,
} from "@/lib/deal-strategy";
import type { ExtractionResult } from "@/lib/anthropic/types";

/**
 * Internal comps memory: every deal the user screens leaves extracted figures
 * behind (price, cap, units/SF). This derives a private comp set for a deal
 * from the user's OWN other screens of the same asset class — no external
 * comp data, no schema, just what their pipeline already knows.
 */

export interface InternalComp {
  dealId: string;
  name: string;
  market: string;
  /** ISO date the deal was screened (created) */
  screenedAt: string;
  /** verdict call if the screen finished: "pass" | "caution" | "pass_on" */
  call: string | null;
  /** raw extracted values — shown as extracted, never restated */
  priceLabel: string | null;
  capLabel: string | null;
  /** derived $/unit or $/SF when both sides parsed (label carries the basis);
   *  on a plan deal it is total cost over the planned units — "all-in" */
  basisLabel: string | null;
  /** the sibling's strategy — a plan deal's figures describe its finished project */
  kind: StrategyKind;
  /** "Conversion", "Value-add"… on a plan deal; null for a stabilized asset */
  kindLabel: string | null;
  /** a plan deal's stabilized NOI over total cost, e.g. "11.7%" — its answer
   *  where a stabilized asset shows a cap */
  yieldOnCostLabel: string | null;
}

interface MetricLike {
  label: string;
  value: string;
}

interface SiblingDealRow {
  id: string;
  name: string | null;
  asset_class: string | null;
  created_at: string;
  is_sample: boolean | null;
  verdict: unknown;
  extraction: unknown;
}

function effectiveClass(
  assetClass: string | null | undefined,
  extraction: { assetClass?: string } | null,
): string {
  const own = (assetClass ?? "").toLowerCase();
  if (own && own !== "auto") return own;
  return (extraction?.assetClass ?? "").toLowerCase();
}

const fmtCompact = (dollars: number) =>
  dollars >= 1e6
    ? `$${(dollars / 1e6).toFixed(1)}M`
    : dollars >= 1e3
      ? `$${Math.round(dollars / 1e3)}k`
      : `$${Math.round(dollars)}`;

/** Price per unit/SF from the extraction, derived only when both sides parse.
 *  A directly extracted "$/unit" metric wins over the derived one. */
function deriveBasis(
  metrics: MetricLike[],
  assetClass: string,
  price: number | null,
  /** the price is a plan deal's total cost: skip the OM's own per-unit line
   *  (whose basis is unknowable there) and say so in the label */
  allIn = false,
): string | null {
  if (!allIn) {
    const direct = findMetric(metrics, /per unit|\/unit|price\/unit|unit price/i);
    if (direct) return direct.value;
  }
  const suffix = allIn ? " all-in" : "";

  if (price == null) return null;
  if (assetClass === "multifamily") {
    // The shared count reader: "312 units" parses, a "Unit mix" row ahead
    // of "Units" never shadows it.
    const n = unitCountFromMetrics(metrics);
    if (n != null && n > 0) return `${fmtCompact(price / n)}/unit${suffix}`;
    return null;
  }
  // Office / industrial / retail: dollars per square foot.
  const sf = findMetric(
    metrics,
    /\b(total sf|square (foot|feet|footage)|sq\.? ?ft|rentable|nra|gla|building size|\bsf\b)/i,
    /price|\$|per|\/|psf/i,
  );
  const n = sf ? parseMoney(sf.value) : null; // handles "412,000" and "412k"
  if (n != null && n > 0) return `$${Math.round(price / n)}/SF${suffix}`;
  return null;
}

/**
 * Build the internal comp set for one deal from its sibling rows (whatever
 * the caller's RLS-scoped query returned: own + shared team deals).
 *
 * Honesty rules: the sample deal never appears (it isn't the user's screen),
 * and a sibling only qualifies when its extraction actually yielded a price
 * or a cap — no empty rows padding the table.
 */
export function deriveInternalComps(
  currentDealId: string,
  currentAssetClass: string,
  currentExtraction: { assetClass?: string } | null,
  siblings: SiblingDealRow[],
  limit = 8,
): InternalComp[] {
  const wanted = effectiveClass(currentAssetClass, currentExtraction);
  if (!wanted) return [];

  const comps: InternalComp[] = [];
  for (const row of siblings) {
    if (row.id === currentDealId || row.is_sample) continue;
    const extraction = row.extraction as {
      assetClass?: string;
      market?: string;
      metrics?: MetricLike[];
    } | null;
    const metrics = extraction?.metrics;
    if (!Array.isArray(metrics) || metrics.length === 0) continue;
    if (effectiveClass(row.asset_class, extraction) !== wanted) continue;

    // The sibling's kind first. A plan deal (value-add, lease-up, conversion,
    // development) has no going-in cap — its stabilized cap or yield on cost
    // describes the finished project — and its comparable basis is total
    // cost over the planned units, never a shell's price over apartments
    // that do not exist yet.
    const ext = { ...extraction, metrics } as ExtractionResult;
    const strategy = inferStrategy(ext);
    const plan = planSummary(ext, strategy);
    const price = findPriceMetric(metrics, strategy.kind);
    const cap = plan ? null : findGoingInCap(metrics);
    const yoc = plan?.yieldOnCost ?? null;
    if (!price && !cap && yoc == null) continue;
    // Only rows whose values actually parse — a garbled extraction ("TBD",
    // "see broker") isn't a comp.
    const priceNum = price ? parseMoney(price.value) : null;
    const capNum = cap ? parsePct(cap.value) : null;
    if (priceNum == null && capNum == null && yoc == null) continue;

    comps.push({
      dealId: row.id,
      name: row.name ?? "Untitled deal",
      market: extraction?.market ?? "",
      screenedAt: row.created_at,
      call: (row.verdict as { verdict?: string } | null)?.verdict ?? null,
      priceLabel: priceNum != null ? fmtCompact(priceNum) : null,
      capLabel: capNum != null ? cap!.value : null,
      basisLabel: plan
        ? plan.totalCost != null
          ? deriveBasis(metrics, wanted, plan.totalCost, true)
          : null
        : deriveBasis(metrics, wanted, priceNum),
      kind: strategy.kind,
      kindLabel: plan ? strategy.label : null,
      yieldOnCostLabel: yoc != null ? `${(yoc * 100).toFixed(1)}%` : null,
    });
    if (comps.length >= limit) break;
  }
  return comps;
}
