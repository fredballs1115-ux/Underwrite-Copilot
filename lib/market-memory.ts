// Deal memory (Feature 6): the buyer's OWN past screens, turned into a private
// market read. "You've screened 4 other North Dallas multifamily deals — going
// in caps ran 4.9–5.5%, basis $180–240k/unit." No external comp data, no
// embeddings, no fabrication: every figure is one this account already
// extracted, aggregated with plain deterministic arithmetic.
//
// Own-account only. The caller passes deals the user CREATED (never a
// teammate's, never another account's); this module just shapes and groups
// them. Pure + unit-tested.

import { findMetric, parseMoney, parsePct, METRIC_FIND } from "@/lib/criteria";

export interface MarketComp {
  dealId: string;
  name: string;
  /** market as extracted, e.g. "North Dallas, TX" */
  market: string;
  /** normalized grouping key for the market */
  marketKey: string;
  /** normalized asset class */
  assetClass: string;
  screenedAt: string;
  /** verdict call if the screen finished */
  call: string | null;
  capPct: number | null;
  /** $/unit (multifamily) or $/SF (other), numeric, when derivable */
  perUnit: number | null;
  perUnitBasis: "unit" | "sf" | null;
}

export interface Stat {
  min: number;
  median: number;
  max: number;
}
export interface MarketGroup {
  assetClass: string;
  /** a representative display market for the group */
  market: string;
  marketKey: string;
  count: number;
  cap: Stat | null;
  perUnit: (Stat & { basis: "unit" | "sf" }) | null;
  calls: { pass: number; caution: number; pass_on: number };
  dealIds: string[];
}

interface MetricLike {
  label: string;
  value: string;
}
interface DealRowLike {
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

/** Normalize a market string for grouping — trims, lowercases, collapses
 *  whitespace. Deliberately literal (no metro guessing): "North Dallas, TX"
 *  and "Dallas, TX" stay distinct rather than inventing a shared metro. */
export function normalizeMarketKey(market: string): string {
  return market.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Numeric $/unit or $/SF for one deal, mirroring lib/internal-comps: a direct
 *  per-unit metric wins; else derive from price ÷ units (multifamily) or
 *  price ÷ SF (other). Returns null when nothing parses. */
function deriveBasis(
  metrics: MetricLike[],
  assetClass: string,
  price: number | null,
): { value: number; basis: "unit" | "sf" } | null {
  const direct = findMetric(metrics, METRIC_FIND.perUnit.inc);
  if (direct) {
    const n = parseMoney(direct.value);
    if (n != null && n > 0) return { value: n, basis: "unit" };
  }
  if (price == null) return null;
  if (assetClass === "multifamily") {
    const units = findMetric(metrics, /^units?\b|number of units|unit count/i, /per|\/|price|\$/i);
    const n = units ? Number(units.value.replace(/[,\s]/g, "")) : NaN;
    if (Number.isFinite(n) && n > 0) return { value: price / n, basis: "unit" };
    return null;
  }
  const sf = findMetric(metrics, METRIC_FIND.sf.inc, METRIC_FIND.sf.exc);
  const n = sf ? parseMoney(sf.value) : null;
  if (n != null && n > 0) return { value: price / n, basis: "sf" };
  return null;
}

/** Turn the account's own screened deals into market comps. Skips the sample,
 *  and any deal whose extraction yielded neither a cap nor a basis. */
export function buildComps(rows: DealRowLike[]): MarketComp[] {
  const comps: MarketComp[] = [];
  for (const row of rows) {
    if (row.is_sample) continue;
    const extraction = row.extraction as {
      assetClass?: string;
      market?: string;
      metrics?: MetricLike[];
    } | null;
    const metrics = extraction?.metrics;
    if (!Array.isArray(metrics) || metrics.length === 0) continue;

    const assetClass = effectiveClass(row.asset_class, extraction);
    if (!assetClass) continue;

    const cap =
      findMetric(metrics, METRIC_FIND.goingInCap.inc) ??
      findMetric(metrics, METRIC_FIND.capRate.inc, METRIC_FIND.capRate.exc);
    const capPct = cap ? parsePct(cap.value) : null;

    const priceMetric = findMetric(metrics, METRIC_FIND.price.inc, METRIC_FIND.price.exc);
    const price = priceMetric ? parseMoney(priceMetric.value) : null;
    const basis = deriveBasis(metrics, assetClass, price);

    // Nothing usable → not a comp (never pad the memory with empty rows).
    if (capPct == null && !basis) continue;

    const market = extraction?.market ?? "";
    comps.push({
      dealId: row.id,
      name: row.name ?? "Untitled deal",
      market,
      marketKey: normalizeMarketKey(market),
      assetClass,
      screenedAt: row.created_at,
      call: (row.verdict as { verdict?: string } | null)?.verdict ?? null,
      capPct,
      perUnit: basis ? basis.value : null,
      perUnitBasis: basis ? basis.basis : null,
    });
  }
  return comps;
}

/** Deterministic median (mean of the two middles for an even count). */
export function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function statOf(nums: number[]): Stat | null {
  if (!nums.length) return null;
  return { min: Math.min(...nums), median: median(nums), max: Math.max(...nums) };
}

/** Aggregate comps into per-(asset class × market) groups, most-screened
 *  first. Cap and basis stats are computed only over the comps that actually
 *  carried that figure. */
export function summarizeMarkets(comps: MarketComp[]): MarketGroup[] {
  const groups = new Map<string, MarketComp[]>();
  for (const c of comps) {
    const key = `${c.assetClass}|${c.marketKey}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }

  const out: MarketGroup[] = [];
  for (const members of groups.values()) {
    out.push(groupStat(members));
  }
  // Most screens first; ties alphabetical by market then class for stability.
  out.sort(
    (a, b) =>
      b.count - a.count ||
      a.market.localeCompare(b.market) ||
      a.assetClass.localeCompare(b.assetClass),
  );
  return out;
}

function groupStat(members: MarketComp[]): MarketGroup {
  const caps = members.map((c) => c.capPct).filter((n): n is number => n != null);
  // Basis is consistent within an asset class; take the members that carry it.
  const withBasis = members.filter((c) => c.perUnit != null && c.perUnitBasis);
  const basisVals = withBasis.map((c) => c.perUnit!);
  const perUnitStat = statOf(basisVals);
  const calls = { pass: 0, caution: 0, pass_on: 0 };
  for (const c of members) {
    if (c.call && c.call in calls) calls[c.call as keyof typeof calls]++;
  }
  // Representative display market: the longest-labeled member (most specific).
  const market =
    members.reduce((best, c) => (c.market.length > best.length ? c.market : best), "") ||
    "Unspecified market";
  return {
    assetClass: members[0].assetClass,
    market,
    marketKey: members[0].marketKey,
    count: members.length,
    cap: statOf(caps),
    perUnit: perUnitStat ? { ...perUnitStat, basis: withBasis[0].perUnitBasis! } : null,
    calls,
    dealIds: members.map((c) => c.dealId),
  };
}

/** The group matching one deal's (asset class × market), excluding that deal —
 *  the "across your past screens" strip for the deal page. Null when there's no
 *  comparable prior screen. */
export function marketMemoryFor(
  comps: MarketComp[],
  dealId: string,
  assetClass: string,
  market: string,
): MarketGroup | null {
  const cls = assetClass.toLowerCase();
  const key = normalizeMarketKey(market);
  if (!cls || !key) return null;
  const members = comps.filter(
    (c) => c.dealId !== dealId && c.assetClass === cls && c.marketKey === key,
  );
  if (!members.length) return null;
  return groupStat(members);
}

// ---- Display helpers (pure formatting) ------------------------------------

export const fmtBasis = (dollars: number, basis: "unit" | "sf") =>
  basis === "unit"
    ? dollars >= 1e3
      ? `$${Math.round(dollars / 1e3)}k/unit`
      : `$${Math.round(dollars)}/unit`
    : `$${Math.round(dollars)}/SF`;

/** "4.9–5.5%" or "5.2%" when the ends coincide. */
export function fmtCapRange(s: Stat): string {
  const lo = s.min.toFixed(1);
  const hi = s.max.toFixed(1);
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`;
}

export function fmtBasisRange(s: Stat & { basis: "unit" | "sf" }): string {
  if (s.min === s.max) return fmtBasis(s.min, s.basis);
  // Share the "/unit" or "/SF" suffix across the range.
  if (s.basis === "unit") {
    const lo = s.min >= 1e3 ? `$${Math.round(s.min / 1e3)}` : `$${Math.round(s.min)}`;
    const hi = s.max >= 1e3 ? `${Math.round(s.max / 1e3)}k` : `${Math.round(s.max)}`;
    return `${lo}–${hi}/unit`;
  }
  return `$${Math.round(s.min)}–${Math.round(s.max)}/SF`;
}
