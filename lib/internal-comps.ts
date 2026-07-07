import { findMetric, parseMoney, parsePct } from "@/lib/criteria";

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
  /** derived $/unit or $/SF when both sides parsed (label carries the basis) */
  basisLabel: string | null;
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
): string | null {
  const direct = findMetric(metrics, /per unit|\/unit|price\/unit|unit price/i);
  if (direct) return direct.value;

  if (price == null) return null;
  if (assetClass === "multifamily") {
    const units = findMetric(metrics, /^units?\b|number of units|unit count/i, /per|\/|price|\$/i);
    const n = units ? Number(units.value.replace(/[,\s]/g, "")) : NaN;
    if (Number.isFinite(n) && n > 0) return `${fmtCompact(price / n)}/unit`;
    return null;
  }
  // Office / industrial / retail: dollars per square foot.
  const sf = findMetric(
    metrics,
    /\b(total sf|square (foot|feet|footage)|sq\.? ?ft|rentable|nra|gla|building size|\bsf\b)/i,
    /price|\$|per|\/|psf/i,
  );
  const n = sf ? parseMoney(sf.value) : null; // handles "412,000" and "412k"
  if (n != null && n > 0) return `$${Math.round(price / n)}/SF`;
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

    const price = findMetric(
      metrics,
      /purchase price|asking price|\bprice\b/i,
      /unit|\/sf|per sf|per unit|psf/i,
    );
    const cap =
      findMetric(metrics, /going[- ]?in cap/i) ??
      findMetric(metrics, /\bcap rate\b/i, /exit|terminal|reversion/i);
    if (!price && !cap) continue;
    // Only rows whose values actually parse — a garbled extraction ("TBD",
    // "see broker") isn't a comp.
    const priceNum = price ? parseMoney(price.value) : null;
    const capNum = cap ? parsePct(cap.value) : null;
    if (priceNum == null && capNum == null) continue;

    comps.push({
      dealId: row.id,
      name: row.name ?? "Untitled deal",
      market: extraction?.market ?? "",
      screenedAt: row.created_at,
      call: (row.verdict as { verdict?: string } | null)?.verdict ?? null,
      priceLabel: priceNum != null ? fmtCompact(priceNum) : null,
      capLabel: capNum != null ? cap!.value : null,
      basisLabel: deriveBasis(metrics, wanted, priceNum),
    });
    if (comps.length >= limit) break;
  }
  return comps;
}
