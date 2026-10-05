// The mandate-fit score in words, ONE way for every place it is drawn: the
// deal header's chip and the screen-complete email (lib/buy-box-chip), and
// the pipeline's card, list and CSV (app/(app)/deals/pipeline.tsx, a client
// module, which is why this imports nothing at run time).
import type { MandateVerdict } from "@/lib/mandate";

/** The score's call, as a reader is told it. */
export const MANDATE_WORD: Record<MandateVerdict, string> = {
  PURSUE: "Pursue",
  WATCH: "Watch",
  PASS: "Pass",
};

/**
 * "Fit 82 · Pursue", or "Fit 18 · Outside box" wherever the deal misses its
 * buy box outright on any criterion — whatever the score's call, PASS
 * included. The box's fold reads every criterion, the price band and the
 * basis cap among them, which the 0–100 score does not weigh; a deal
 * outside it fails the mandate however it scores, which "Pass" — the
 * score's own word for a low score, and a word the verdict uses for "Go"
 * internally — did not say. The header had printed "Fit 18 · Pass" beside a
 * card's "Fit 18 · Outside box" for the same deal.
 */
export function fitScoreLabel(score: number, call: MandateVerdict, outside: boolean): string {
  return `Fit ${score} · ${outside ? "Outside box" : MANDATE_WORD[call]}`;
}
