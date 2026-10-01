/**
 * What the screening model's figures ARE on a deal whose price does not buy
 * a stabilized building — said above them on the Assumption Bridge and the
 * Valuations page, and carried into the sentence each page offers to copy.
 *
 * Both pages run the deal's derived screening model and printed its IRRs
 * (and Valuations its going-in cap) with no word, while the compare table
 * withholds the same figures ("n/a — note", "n/a — plan"):
 *
 *   - A NOTE: the model underwrites the collateral as if bought outright at
 *     the note's price — not the note's return (lib/interest's caveat).
 *   - A PLAN DEAL (value-add, lease-up, conversion, development): the model
 *     books the budget in year 1 and runs year-1 income as modelled — its
 *     returns are not the plan's, which is judged on its yield on cost (the
 *     sensitivity playground's words).
 *   - A SHARE, A LEASEHOLD, A LEASED FEE: the deal page's own model caveat
 *     for that interest, where lib/interest has one.
 *
 * The words are the deal page's own wherever it has them; the tests hold
 * them to it. Pure.
 */
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { askingPriceOf, inferStrategy, isPlanDeal } from "@/lib/deal-strategy";
import { interestOf, readInterest } from "@/lib/interest";

/** The playground's plan sentence (PLAN_RETURNS_CAVEAT's first), word for
 *  word — a test holds the two together. */
export const PLAN_MODEL_CAVEAT =
  "On a plan deal these returns run the screening model — the budget booked in year 1, year-1 income as modelled — not the plan's return, which is judged on its yield on cost.";

/** Where a page also prints the model's going-in cap. */
const PLAN_CAP_CLAUSE = "Its going-in cap is year-1 income over the price, not the plan's yield on cost.";

export interface ModelCaveat {
  kind: "note" | "plan" | "interest";
  /** said above the figures */
  text: string;
  /** one sentence for the end of the copied line */
  copy: string;
}

const firstSentence = (s: string): string => {
  const m = /^(.+?[.!?])(\s|$)/.exec(s.trim());
  return m ? m[1] : s.trim();
};

export function screeningModelCaveat(
  extraction: ExtractionResult | null | undefined,
  firstSignal?: FirstSignal | null,
  options: { cap?: boolean } = {},
): ModelCaveat | null {
  if (!extraction) return null;
  const interest = readInterest(extraction, askingPriceOf(extraction));
  if (interestOf(extraction).kind === "note" && interest?.modelCaveat) {
    return {
      kind: "note",
      text: interest.modelCaveat,
      copy: "These are the screening model's figures for the collateral as if bought outright at the note's price, not the note's return.",
    };
  }
  if (isPlanDeal(inferStrategy(extraction, firstSignal ?? null).kind)) {
    return {
      kind: "plan",
      text: options.cap ? `${PLAN_MODEL_CAVEAT} ${PLAN_CAP_CLAUSE}` : PLAN_MODEL_CAVEAT,
      copy: "These are the screening model's figures, not the plan's return, which is judged on its yield on cost.",
    };
  }
  if (interest?.modelCaveat) {
    return { kind: "interest", text: interest.modelCaveat, copy: firstSentence(interest.modelCaveat) };
  }
  return null;
}
