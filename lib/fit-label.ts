// The mandate-fit score in words, ONE way for every place it is drawn: the
// deal header's chip and the screen-complete email (lib/buy-box-chip), and
// the pipeline's card, list and CSV (app/(app)/deals/pipeline.tsx, a client
// module, which is why this imports nothing at run time), the meeting
// workbook (lib/pipeline-workbook), the compare table and the batch upload's
// chip. How much of the box a fit stands on is lib/criteria's
// `buyBoxCoverage`, counted once beside the fold; this says it.
import type { MandateVerdict } from "@/lib/mandate";
import type { BuyBoxCoverage } from "@/lib/criteria";

/** The score's call, as a reader is told it. */
export const MANDATE_WORD: Record<MandateVerdict, string> = {
  PURSUE: "Pursue",
  WATCH: "Watch",
  PASS: "Pass",
};

/** The fold's call, as an export cell and the pipeline's card say it. */
export const FOLD_WORD: Record<"fits" | "near" | "outside", string> = {
  fits: "Fits",
  near: "Near",
  outside: "Outside",
};

/** What a fit's words read off its coverage: the count, and whether a
 *  criterion the price decides is among those it could not check. */
type Coverage = Pick<BuyBoxCoverage, "checked" | "total"> & Partial<Pick<BuyBoxCoverage, "unchecked" | "priceUnchecked">>;

/** Not every criterion the box sets could be checked. */
function partial(c: Coverage | null | undefined): c is Coverage {
  return !!c && c.total > 0 && c.checked < c.total;
}

/**
 * How many of the box's criteria a fit stands on, said only where the
 * screen could not check every one: "2 of 4 checked", or "2 of 4" where a
 * slot is too narrow for the word and says it in its tooltip. Null where it
 * checked them all, so a fully checked deal's words stay as they were.
 */
export function checkedOf(coverage: Coverage | null | undefined, short = false): string | null {
  return partial(coverage) ? `${coverage.checked} of ${coverage.total}${short ? "" : " checked"}` : null;
}

/**
 * "Fit 82 · Pursue", or "Fit 18 · Outside box" wherever the deal misses its
 * buy box outright on any criterion — whatever the score's call, PASS
 * included. The box's fold reads every criterion, the price band and the
 * basis cap among them, which the 0–100 score does not weigh; a deal
 * outside it fails the mandate however it scores, which "Pass" — the
 * score's own word for a low score, and a word the verdict uses for "Go"
 * internally — did not say. The header had printed "Fit 18 · Pass" beside a
 * card's "Fit 18 · Outside box" for the same deal.
 *
 * Where the screen could not check every criterion, the label says how many
 * it did (research pass 35): the score rescales over what it could read, so
 * a note whose cap and return the box cannot judge read "Fit 100 · Pursue"
 * on two of its four. A call over part of the box is no call, so the count
 * stands in the call's place — "Fit 100 · 2 of 4 checked" — while a miss
 * outright is a miss whatever else went unchecked, and keeps its words:
 * "Fit 63 · Outside box · 3 of 4 checked".
 */
export function fitScoreLabel(
  score: number,
  call: MandateVerdict,
  outside: boolean,
  coverage?: Coverage | null,
): string {
  const count = checkedOf(coverage);
  if (outside) return `Fit ${score} · Outside box${count ? ` · ${count}` : ""}`;
  return `Fit ${score} · ${count ?? MANDATE_WORD[call]}`;
}

/** The tones a fit is drawn in, by what it says. */
export type FitTone = "pass" | "caution" | "kill" | "muted";

/** The score's call as a tone. */
export const MANDATE_TONE: Record<MandateVerdict, Exclude<FitTone, "muted">> = {
  PURSUE: "pass",
  WATCH: "caution",
  PASS: "kill",
};

/**
 * The tone a fit is drawn in — ONE rule for the deal header's chip, the
 * pipeline's card and list, the meeting workbook and the compare table: a
 * miss outright in red; else the score's call where there is one, else the
 * fold's — except that a fit is never green while a criterion the price
 * decides (the price band, the basis, the going-in cap, the target return)
 * could not be checked. Then it is muted: nothing about the price was
 * judged, which is neither a pass nor a warning about the deal. A near miss
 * keeps its amber and a low score its red, which a blank cannot clear.
 */
export function fitTone(
  call: MandateVerdict | null | undefined,
  fold: "fits" | "near" | "outside" | null | undefined,
  coverage?: Coverage | null,
): FitTone {
  if (fold === "outside") return "kill";
  const tone: FitTone = call ? MANDATE_TONE[call] : fold === "near" ? "caution" : fold === "fits" ? "pass" : "muted";
  return tone === "pass" && coverage?.priceUnchecked ? "muted" : tone;
}

/**
 * A fit's word as an export cell writes it — the meeting workbook's and the
 * pipeline CSV's Buy box column: "Fits", "Near", "Outside"; with how many
 * of the box's criteria it stands on where not every one could be checked,
 * "Fits (2 of 4)"; and a fit judged on the first signal marked as lib/
 * first-read marks it, "Near (first read)", or with the count, "Near (2 of
 * 4, first read)". A blank stays blank: there is nothing to qualify.
 */
export function fitCellText(word: string, coverage: Coverage | null | undefined, firstRead?: boolean | null): string {
  if (!word) return "";
  const parts = [checkedOf(coverage, true), firstRead ? "first read" : null].filter((p): p is string => p != null);
  return parts.length ? `${word} (${parts.join(", ")})` : word;
}

/** "a", "a and b", "a, b and c". */
function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The coverage as a sentence, for a cell's note and a tooltip: "Judged on 2
 * of the buy box's 4 criteria; going-in cap and target return could not be
 * checked." Null where every criterion was checked.
 */
export function checkedSentence(coverage: Coverage | null | undefined): string | null {
  if (!partial(coverage)) return null;
  const { checked, total } = coverage;
  if (checked === 0) {
    return total === 1 ? "The buy box's one criterion could not be checked." : `None of the buy box's ${total} criteria could be checked.`;
  }
  const unchecked = (coverage.unchecked ?? []).map((l) => l.toLowerCase());
  const head = `Judged on ${checked} of the buy box's ${total} criteria`;
  return unchecked.length ? `${head}; ${listOf(unchecked)} could not be checked.` : `${head}.`;
}
