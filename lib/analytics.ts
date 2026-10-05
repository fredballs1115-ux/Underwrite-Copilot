import { compactUsd } from "@/lib/money";
import { METRIC_FIND, findMetric, parseMoney, parsePrice, screenYearOf } from "@/lib/criteria";
import {
  buildingPriceOf,
  findPriceMetric,
  inferStrategy,
  planSummary,
  planWithBasisChecked,
  statedBasisIsBuildings,
  unitCountFromMetrics,
  type StrategyKind,
} from "@/lib/deal-strategy";
import { interestOf } from "@/lib/interest";
import { statedCapRead } from "@/lib/compare-interest";
import { dealClassKey } from "@/lib/asset-words";
import { MEDIAN_FLOOR } from "@/lib/public-comps/core";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { isOpenStage, normalizeStage, type Stage } from "@/lib/stages";

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
  /** the screen's first signal (FirstSignal): its take names a plan the
   *  extraction's rows may not, as the deal page reads it */
  first_signal?: unknown;
}

/**
 * What the analytics page's figures are of, as its read finds them (research
 * pass 42, H3): every screened deal the reader can see, which row-level
 * security makes their own and their team's. Said as the reader's own only
 * where no teammate's screen is among them — never "an OM you ran" over a
 * teammate's deal. Whose deals the page pools is the owner's call; these
 * words follow the read.
 */
export function analyticsScope(own: number, team: number): string {
  if (team <= 0) return "What your own screens add up to — every figure below was extracted from an OM you screened, never restated.";
  return `What the screens in your pipeline add up to — ${own} of yours and ${team} of your team's — every figure below was extracted from a screened OM, never restated.`;
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
    // The deal's kind as its own page reads it: the extraction and the
    // first signal, whose take can name the plan the rows do not — read
    // alone, a value-add the signal names was plotted as a stabilized cap.
    const signal = (r.first_signal as FirstSignal | null | undefined) ?? null;
    const strategy = inferStrategy(extraction, signal);
    const plan = planWithBasisChecked(extraction, strategy, planSummary(extraction, strategy));

    // The cap the deal's own header prints (lib/compare-interest
    // `statedCapRead`): the memorandum's going-in cap, else its first
    // signal's, which the series had left out (the audit of 2026-10-05). A
    // plan deal is judged on its yield on total cost: a stabilized or pro
    // forma cap, or a yield on cost, describes the finished project, not the
    // price paid. …and no cap the header withholds is plotted
    // (`capSlotWithheld`: a note's is the collateral's, a position's the
    // building's, a share's beside its entity's loan on a basis never said),
    // nor a leased fee's, a ground rent's (#415), among buildings' going-in
    // caps.
    const interestKind = interestOf(extraction).kind;
    const capPct = interestKind === "leased_fee" ? null : (statedCapRead(extraction, plan != null, signal)?.pct ?? null);

    // The asking / purchase price — or, on a development, the land cost.
    const priceMetric = findPriceMetric(metrics, strategy.kind, screenYearOf(extraction));
    const price = priceMetric ? parsePrice(priceMetric.value) : null;

    // A $/unit only for multifamily — the class the series is named for.
    // A hotel's price per key, an office's per suite and a storage deal's
    // per locker are not the same basis, and one of them pooled into the
    // "Price per unit" chart rescales it for every apartment deal on it.
    // (lib/market-memory and lib/internal-comps branch on class the same
    // way; the other classes are $/SF there.) The deal's one class, the
    // analyst's first, filed by its words (lib/asset-words `dealClassKey`):
    // a deck's "Garden-style multifamily" is multifamily.
    const cls = dealClassKey(r.asset_class, extraction);
    let perUnit: number | null = null;
    if (cls !== "multifamily") {
      perUnit = null;
    } else if (plan) {
      // Basis per planned unit: what a finished unit costs all-in. The
      // shell's price over units still to be built is not a comparable
      // figure, so with no total cost there is no point to plot.
      perUnit = plan.costPerUnit;
    } else {
      // The shared per-unit reader: the price over the units, never a rent
      // or an expense per unit.
      // Only where the price is the building's (#415): a share's grossed up
      // to the whole, never a note's or a leased fee's over the units.
      const directPer = statedBasisIsBuildings(extraction)
        ? findMetric(metrics, METRIC_FIND.perUnit.inc, METRIC_FIND.perUnit.exc)
        : null;
      if (directPer) perUnit = parseMoney(directPer.value);
      const basisPrice = buildingPriceOf(extraction, price);
      if (perUnit == null && basisPrice != null) {
        const units = unitCountFromMetrics(metrics);
        if (units != null) perUnit = basisPrice / units;
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

/** Where the screened deals stand: live — still in play, on the ladder
 *  short of Closed (lib/stages `isOpenStage`, the digest's and the meeting
 *  workbook's rule) — closed, and dead. A closed deal is neither live nor
 *  dead: the headline tile had counted it live. */
export interface StageCounts {
  live: number;
  closed: number;
  dead: number;
}

export function stageCounts(deals: readonly Pick<AnalyticsDeal, "stage">[]): StageCounts {
  const out: StageCounts = { live: 0, closed: 0, dead: 0 };
  for (const d of deals) {
    if (isOpenStage(d.stage)) out.live++;
    else if (d.stage === "closed") out.closed++;
    else out.dead++;
  }
  return out;
}

/** "5 live · 2 closed · 3 dead" — the closed said only where a deal is. */
export function stageCountLine(c: StageCounts): string {
  return [`${c.live} live`, ...(c.closed > 0 ? [`${c.closed} closed`] : []), `${c.dead} dead`].join(" · ");
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * What a handful of figures is strong enough to be called — the site's rule
 * for a median (lib/public-comps `MEDIAN_FLOOR`): three figures before the
 * middle one is a median at all. Under that there is no middle: one deal's
 * figure is that deal's, and two are the two, low and high — never a
 * "median" of one deal dressed as a portfolio's.
 */
export type MiddleRead =
  | { kind: "none"; n: 0 }
  | { kind: "one"; n: 1; value: number }
  | { kind: "two"; n: 2; low: number; high: number }
  | { kind: "median"; n: number; value: number };

export function middleRead(values: readonly number[]): MiddleRead {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return { kind: "none", n: 0 };
  if (v.length === 1) return { kind: "one", n: 1, value: v[0] };
  if (v.length < MEDIAN_FLOOR) return { kind: "two", n: 2, low: v[0], high: v[1] };
  return { kind: "median", n: v.length, value: median(v)! };
}

/** The read as a page prints it: the median, the one deal's figure, or the
 *  two deals' "low–high" (one figure where the two agree); null for none. */
export function middleText(r: MiddleRead, fmt: (n: number) => string): string | null {
  switch (r.kind) {
    case "none":
      return null;
    case "two": {
      const lo = fmt(r.low);
      const hi = fmt(r.high);
      return lo === hi ? lo : `${lo}–${hi}`;
    }
    default:
      return fmt(r.value);
  }
}

/** "3 deals parsed", "the one deal that parsed", "the two deals that
 *  parsed", "none parsed" — the count behind a read, said as what it is. */
export function parsedPhrase(n: number): string {
  if (n <= 0) return "none parsed";
  if (n === 1) return "the one deal that parsed";
  if (n === 2) return "the two deals that parsed";
  return `${n} deals parsed`;
}

export const fmtUsdCompact = (dollars: number): string => compactUsd(dollars);
