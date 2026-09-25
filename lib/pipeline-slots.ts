// The three figures a pipeline row shows beside a deal's name — its price,
// its going-in cap and, on a plan deal, its yield on total cost — read
// through the same readers every other surface uses, so the row, the deal
// page, the meeting .xlsx and the analytics agree on which figure a deal
// carries, and what the price buys where it is not the building (#415).
// Pure: no I/O, no LLM.
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { ASSET_CLASS_LABEL } from "@/lib/asset-class";
import { findGoingInCap } from "@/lib/criteria";
import { findPriceMetric, inferStrategy, planSummary, signalAskPrice } from "@/lib/deal-strategy";
import { interestTag } from "@/lib/interest";
import { assumableTag } from "@/lib/assumable-debt";

export interface PipelineSlots {
  /** the going-in cap as the OM states it — null on a plan deal, which has
   *  none (its stabilized cap or yield on cost is the finished project's) */
  cap: string | null;
  price: string | null;
  /** a plan deal's yield on total cost — its answer where a stabilized
   *  asset shows a cap — null for a stabilized asset or an unstated plan */
  yoc: string | null;
  /** what the price buys where it is not the building outright — "49%
   *  share", "Note", "Leasehold", "Leased fee" (lib/interest
   *  `interestTag`); absent or null on a fee simple */
  interest?: string | null;
  /** the seller's loan where it is offered for assumption — "Assumable
   *  3.45%" (lib/assumable-debt `assumableTag`, #419); absent or null
   *  where none is */
  debt?: string | null;
}

/**
 * The asset class a pipeline row shows. A deal created with "Auto-detect"
 * keeps "auto" in its column, and what the deck turned out to be lives in
 * the extraction — so the row shows that read, and shows nothing (no rail,
 * no dot, a dash) while nothing has read the deck yet. "Auto" was never an
 * asset class, and a row that said so read as one.
 *
 * A known class comes back as its key, whatever its case, so the filter
 * and the colour rail match it; a class the model phrased itself keeps
 * its case — "NNN retail" is not "Nnn retail" — and `assetClassLabel`
 * only raises its first letter.
 */
export function shownAssetClass(
  stored: string | null | undefined,
  extraction: { assetClass?: string | null } | null | undefined,
): string {
  const norm = (v: string | null | undefined): string => {
    const t = (v ?? "").trim();
    const lower = t.toLowerCase();
    if (!t || lower === "auto") return "";
    return ASSET_CLASS_LABEL[lower] ? lower : t;
  };
  return norm(stored) || norm(extraction?.assetClass);
}

export function pickSlots(extraction: ExtractionResult, signal: FirstSignal | null): PipelineSlots {
  const metrics = extraction.metrics ?? [];
  // The same read the deal page makes — extraction plus the first signal —
  // so a deal never shows a price on one surface and none on the other.
  const strategy = inferStrategy(extraction, signal);
  const plan = planSummary(extraction, strategy);
  return {
    // The going-in cap only, and only on an operating asset: the same rule
    // the meeting .xlsx, the analytics and the comp memory apply, so a
    // value-add's row shows its yield on cost where the export shows "n/a
    // — plan", never a cap on one and a yield on the other.
    cap: plan ? null : (findGoingInCap(metrics)?.value ?? null),
    // The shared price reader; on a development with no asking price the
    // land or site cost is what is being bought. The first signal's ask
    // fills the slot before the extraction lands, as on the deal page —
    // only when it is a figure, never an "unpriced" or "call for offers".
    price: findPriceMetric(metrics, strategy.kind)?.value ?? signalAskPrice(signal),
    yoc: plan?.yieldOnCost != null ? `${(plan.yieldOnCost * 100).toFixed(1)}%` : null,
    // A share's price, a note's or the land's under a ground lease is not
    // the building's, and the row says so beside the figure.
    interest: interestTag(extraction),
    // Debt a buyer can take over is a screening fact of its own in 2026:
    // the row says so beside the price, and the deal page prices it.
    debt: assumableTag(extraction),
  };
}
