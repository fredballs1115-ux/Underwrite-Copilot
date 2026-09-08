// The three figures a pipeline row shows beside a deal's name — its price,
// its going-in cap and, on a plan deal, its yield on total cost — read
// through the same readers every other surface uses, so the row, the deal
// page, the meeting .xlsx and the analytics agree on which figure a deal
// carries. Pure: no I/O, no LLM.
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { findGoingInCap } from "@/lib/criteria";
import { findPriceMetric, inferStrategy, planSummary, signalAskPrice } from "@/lib/deal-strategy";

export interface PipelineSlots {
  /** the going-in cap as the OM states it — null on a plan deal, which has
   *  none (its stabilized cap or yield on cost is the finished project's) */
  cap: string | null;
  price: string | null;
  /** a plan deal's yield on total cost — its answer where a stabilized
   *  asset shows a cap — null for a stabilized asset or an unstated plan */
  yoc: string | null;
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
  };
}
