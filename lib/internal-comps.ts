import { compactUsd } from "@/lib/money";
import {
  METRIC_FIND,
  buildingSfFromMetrics,
  findMetric,
  parsePrice,
  priceRange,
  priceRangeShort,
  screenYearOf,
} from "@/lib/criteria";
import {
  buildingPriceOf,
  findPriceMetric,
  inferStrategy,
  isOutdoorStorageYard,
  planSummary,
  statedBasisIsBuildings,
  type StrategyKind,
  unitCountFromMetrics,
} from "@/lib/deal-strategy";
import { interestOf, interestTag } from "@/lib/interest";
import { priceUnitCount } from "@/lib/condo-units";
import { statedCapRead } from "@/lib/compare-interest";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { assetWords, dealClassKey, perSuffix } from "@/lib/asset-words";
import { yieldOnCostText } from "@/lib/plan-facts";

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
  /** a plan deal's stabilized NOI over total cost, e.g. "11.67%" — its
   *  answer where a stabilized asset shows a cap */
  yieldOnCostLabel: string | null;
  /** a teammate's screen, not the reader's own — set where the caller says
   *  who is reading (`viewerId`), so the block says whose screens it shows */
  teammate?: boolean;
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
  /** the sibling's first signal (FirstSignal), read with its extraction for
   *  its kind, as its own page reads it; absent on a row the caller did not
   *  select it for */
  first_signal?: unknown;
  /** who added the sibling, for whose screens the block says they are */
  user_id?: string | null;
}

/** How many of the deal's own class the block reads in full, newest first:
 *  more than it shows, since a screen whose figures do not parse is no comp. */
export const INTERNAL_COMP_CANDIDATES = 40;

/** A screened deal as the light read finds it: its class keys alone. */
export interface CompKeyRow {
  id: string;
  asset_class: string | null;
  is_sample: boolean | null;
  created_at: string;
  /** `extraction->>assetClass` */
  ext_class: string | null;
}

/**
 * The ids of the reader's other screened deals of this deal's class, newest
 * first, at most `max` — whose full rows the "From your pipeline" block then
 * reads. The class is matched in the read, before any cut, as the market
 * memory's light read matches it (lib/market-memory `memoryCandidates`): the
 * page had read the forty newest screens of every class and kept those of the
 * deal's, so a team that screened forty offices since its last apartment deal
 * showed an apartment deal no comps at all (research pass 42).
 */
export function internalCompCandidates(
  rows: readonly CompKeyRow[],
  currentDealId: string,
  currentAssetClass: string,
  currentExtraction: { assetClass?: string } | null,
  max = INTERNAL_COMP_CANDIDATES,
): string[] {
  const wanted = dealClassKey(currentAssetClass, currentExtraction);
  if (!wanted) return [];
  return rows
    .filter(
      (r) => r.id !== currentDealId && !r.is_sample && dealClassKey(r.asset_class, { assetClass: r.ext_class ?? undefined }) === wanted,
    )
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, max)
    .map((r) => r.id);
}

const fmtCompact = (dollars: number) => compactUsd(dollars);

/** A price stated as a range, short — "$40–42M", the pipeline card's and
 *  the deal header's (lib/criteria `priceRangeShort`); null for one figure. */
const priceRangeOf = (stated: string): string | null => {
  const range = priceRange(stated);
  return range ? priceRangeShort(range) : null;
};

/** What the price buys (lib/interest `interestTag`) set inside the price's
 *  line — "$20.0M · 49% share", "$4.2M · TIC 30%": its first letter lowered,
 *  never an acronym's ("tic 30%", "gp stake 50%") or a month's further in
 *  ("Jun 2029"), as lowering the whole tag had (research pass 37). */
const tagInLine = (tag: string): string => (/^[A-Z]{2,}\b/.test(tag) ? tag : `${tag.charAt(0).toLowerCase()}${tag.slice(1)}`);

/** Price per unit/SF from the extraction, derived only when both sides parse.
 *  A directly extracted "$/unit" metric wins over the derived one. */
function deriveBasis(
  metrics: MetricLike[],
  assetClass: string,
  price: number | null,
  /** the price is a plan deal's total cost: skip the OM's own per-unit line
   *  (whose basis is unknowable there) and say so in the label */
  allIn = false,
  /** the OM's own per-unit line may be read — false where the price is not
   *  for the building bought outright (#415) */
  statedLine = true,
  /** the price over the building's feet is a basis — false for an
   *  outdoor-storage yard, which trades by the usable acre */
  perSfBasis = true,
  /** the count a plan's all-in cost divides by: the plan's own
   *  (lib/deal-strategy `planSummary`'s units — on a conversion or a
   *  development its proposed count, never today's building's); absent,
   *  the memorandum's count row */
  count?: number | null,
): string | null {
  const suffix = allIn ? " all-in" : "";

  // The branch on asset class comes FIRST, as in lib/market-memory: a stray
  // "per unit" row on an office deal must never flip its $/SF column to a
  // unit basis. The class says the basis and the noun (lib/asset-words):
  // a hotel's is "/key", a park's "/pad"; land trades per acre, which this
  // column has no reader for.
  const words = assetWords(assetClass);
  if (words.basis === "acre") return null;
  if (words.basis === "unit") {
    if (!allIn && statedLine) {
      // The shared per-unit reader: the price over the units, never a rent
      // or an expense per unit.
      const direct = findMetric(metrics, METRIC_FIND.perUnit.inc, METRIC_FIND.perUnit.exc);
      if (direct) return direct.value;
    }
    if (price == null) return null;
    // The shared count reader: "312 units" parses, a "Unit mix" row ahead
    // of "Units" never shadows it — and "212 keys" counts the same way. A
    // plan's all-in cost divides by the plan's own count.
    const n = count !== undefined ? count : unitCountFromMetrics(metrics);
    if (n != null && n > 0) return `${fmtCompact(price / n)}${perSuffix(words)}${suffix}`;
    return null;
  }
  if (price == null || !perSfBasis) return null;
  // Priced per SF: dollars per square foot, over the building's size — the
  // shared reader, never the land's or a unit's.
  const n = buildingSfFromMetrics(metrics);
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
  /** who is reading: each comp says whether it is a teammate's screen */
  viewerId?: string | null,
): InternalComp[] {
  // The deal's one class, filed by its words (lib/asset-words
  // `dealClassKey`): a sibling whose deck says "Garden-style multifamily" is
  // a multifamily comp, where the raw words had matched nothing.
  const wanted = dealClassKey(currentAssetClass, currentExtraction);
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
    if (dealClassKey(row.asset_class, extraction) !== wanted) continue;

    // The sibling's kind first. A plan deal (value-add, lease-up, conversion,
    // development) has no going-in cap — its stabilized cap or yield on cost
    // describes the finished project — and its comparable basis is total
    // cost over the planned units, never a shell's price over apartments
    // that do not exist yet.
    // Read with the sibling's first signal, as its own page reads its kind:
    // a value-add only the signal's take names had its in-place cap printed
    // as a comp's going-in cap.
    const ext = { ...extraction, metrics } as ExtractionResult;
    const signal = (row.first_signal as FirstSignal | null | undefined) ?? null;
    const strategy = inferStrategy(ext, signal);
    const plan = planSummary(ext, strategy);
    const price = findPriceMetric(metrics, strategy.kind, screenYearOf(ext));
    // The cap the sibling's own header prints (lib/compare-interest
    // `statedCapRead`): the memorandum's, else its first signal's — the
    // research pass's "one figure, one reader" named this column, which had
    // left the signal's cap out (the audit of 2026-10-05). No cap the header
    // withholds sits in a column of buildings' caps (`capSlotWithheld`: a
    // note's is the collateral's, a position's the building's, a share's
    // beside its entity's loan on a basis never said), and no plan deal's,
    // nor a leased fee's, a ground rent's (#415).
    const interestKind = interestOf(ext).kind;
    const cap = interestKind === "leased_fee" ? null : statedCapRead(ext, plan != null, signal);
    const yoc = plan?.yieldOnCost ?? null;
    if (!price && !cap && yoc == null) continue;
    // Only rows whose values actually parse — a garbled extraction ("TBD",
    // "see broker") isn't a comp.
    const priceNum = price ? parsePrice(price.value) : null;
    const capNum = cap?.pct ?? null;
    if (priceNum == null && capNum == null && yoc == null) continue;
    // An outdoor-storage yard trades by the acre: no per-SF column for its
    // shop building.
    const perSfBasis = !isOutdoorStorageYard(extraction?.assetClass) && !isOutdoorStorageYard(row.asset_class);

    comps.push({
      dealId: row.id,
      name: row.name ?? "Untitled deal",
      market: extraction?.market ?? "",
      screenedAt: row.created_at,
      call: (row.verdict as { verdict?: string } | null)?.verdict ?? null,
      // The price as asked, with what it buys where that is not the
      // building outright — "$20.0M · 49% share" — and the basis struck
      // only on the price the building's figures describe (#415). A range
      // stays a range, as on the sibling's card and header ("$40–42M"): its
      // top alone, "$42.0M", read as a price the memorandum never asked.
      priceLabel:
        priceNum != null
          ? `${priceRangeOf(price!.value) ?? fmtCompact(priceNum)}${interestTag(ext) ? ` · ${tagInLine(interestTag(ext)!)}` : ""}`
          : null,
      capLabel: capNum != null ? cap!.text : null,
      basisLabel: plan
        ? plan.totalCost != null
          ? deriveBasis(metrics, wanted, plan.totalCost, true, true, perSfBasis, plan.units)
          : null
        : // A bulk condominium purchase's price is over the units offered
          // (lib/condo-units `priceUnitCount`, the card's count).
          deriveBasis(metrics, wanted, buildingPriceOf(ext, priceNum), false, statedBasisIsBuildings(ext), perSfBasis, priceUnitCount(ext)),
      kind: strategy.kind,
      kindLabel: plan ? strategy.label : null,
      // To two decimals, as the sibling's own header and card print it.
      yieldOnCostLabel: yoc != null ? yieldOnCostText(yoc) : null,
      ...(viewerId !== undefined ? { teammate: row.user_id != null && row.user_id !== viewerId } : {}),
    });
    if (comps.length >= limit) break;
  }
  return comps;
}
