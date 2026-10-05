// The compare table's return figures, and which each one is (the audit of
// 2026-09-30). The table reads each deal's FIRST-DRAFT model (`deal.model`,
// lib/model/compute): built on request from the deal's documents, it
// carries no date and is not rebuilt when the memorandum is replaced. The
// deal's header and its pipeline card print the memorandum's own figures.
// Which one the table should read is the owner's call; until then it keeps
// reading the model, falls back to the header's own figure where the model
// has none, and says which each figure is.
//
// Pure: the extraction, the model's returns and the deal's kind come in.
//
//   A PLAN DEAL'S YIELD ON COST is the model's; with no model figure it is
//   the one the header prints, the stabilized NOI over the total cost the
//   plan's own reader (`planSummary`) states.
//
//   THE GOING-IN CAP is the model's, read for what the price buys
//   (lib/compare-interest); with none it is the memorandum's — else the
//   first signal's — read as the pipeline card and the deal header read it
//   (`statedCapSlot`). Never on a plan deal, and never where the cap slot is
//   withheld (lib/compare-interest `capSlotWithheld`: a note, a position, a
//   share beside the loan its entity carries). A share whose model did not
//   run at its whole shows the memorandum's cap where the model's struck on
//   the whole is not there, as its header and its card do: the table had
//   left it blank.

import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { parsePct } from "@/lib/criteria";
import { capSlotWithheld, compareInterest, type CapWithheld, type CompareInterest, type CompareModel } from "@/lib/compare-interest";
import { isPlanDeal, planSummary, type DealStrategy } from "@/lib/deal-strategy";
import { statedCapSlot } from "@/lib/pipeline-slots";

/** Where a figure came from: the deal's first-draft model, or the
 *  memorandum's own figure, where the model has none. */
export type FigureSource = "model" | "om";

export interface CompareModelReturns extends CompareModel {
  /** the model's stabilized NOI over total cost, percent; null on a model
   *  built before the plan existed, or on a stabilized asset */
  yieldOnCostPct?: number | null;
}

export interface CompareReturns extends CompareInterest {
  /** the deal carries a plan (value-add, lease-up, conversion,
   *  development): its answer is the yield on total cost, never a cap */
  planDeal: boolean;
  /** the going-in cap, percent: null on a plan deal, where the cap slot is
   *  withheld, and where neither the model nor the memorandum has one */
  cap: number | null;
  capFrom: FigureSource | null;
  /** why the cap slot is withheld on every surface (lib/compare-interest
   *  `capSlotWithheld`) — the cell says so rather than a dash; null where
   *  the cap stands, and on a plan deal, whose cell says "n/a — plan" */
  capWithheld: CapWithheld | null;
  /** a plan deal's yield on total cost, percent */
  yoc: number | null;
  yocFrom: FigureSource | null;
}

export function compareReturns(
  ex: ExtractionResult | null | undefined,
  model: CompareModelReturns | null | undefined,
  strategy: DealStrategy,
  asOf: Date = new Date(),
  /** the deal's first signal: its cap stands in where the memorandum states
   *  none, as on the deal header and the pipeline card */
  signal: FirstSignal | null = null,
): CompareReturns {
  const planDeal = isPlanDeal(strategy.kind);
  const ci = compareInterest(ex, model ?? null, asOf);
  const modelCap = planDeal ? null : ci.cap;
  const capWithheld = planDeal ? null : capSlotWithheld(ex);
  const statedCapText = !planDeal && modelCap == null ? statedCapSlot(ex ?? null, planDeal, signal) : null;
  const statedCap = statedCapText ? parsePct(statedCapText) : null;
  const modelYoc = model?.yieldOnCostPct ?? null;
  const planYoc = planDeal && modelYoc == null ? (planSummary(ex ?? null, strategy)?.yieldOnCost ?? null) : null;
  const statedYoc = planYoc != null ? planYoc * 100 : null;
  return {
    ...ci,
    planDeal,
    cap: modelCap ?? statedCap,
    capFrom: modelCap != null ? "model" : statedCap != null ? "om" : null,
    capWithheld,
    yoc: modelYoc ?? statedYoc,
    yocFrom: modelYoc != null ? "model" : statedYoc != null ? "om" : null,
  };
}
