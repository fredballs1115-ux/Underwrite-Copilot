// What the compare table's model figures mean where the price is not the
// building's (#423). The table reads each deal's document-generated model,
// which runs at the price the documents state — and on a note that is a
// loan's price, on a share the share's. The model's cap and returns then
// set a building's income against a price that did not buy the building,
// and the table printed them in a row beside deals whose price did.
//
// Pure: the extraction and the model's own figures come in.
//
// Three rules, each the deal page's own (lib/interest):
//
//   A NOTE HAS NO CAP. The collateral's NOI over a loan's price is a cap
//   nobody earns, so the cap row says the note's yield to maturity at its
//   price instead — only where the note pays or may, since a yield nobody
//   earns is not a figure to compare on — and the model's returns are
//   withheld: they are the collateral's, bought outright, not the note's.
//
//   A SHARE'S PRICE IS FOR THE SHARE. The cap is struck on the whole the
//   share's price implies (`buildingPriceOf`), the building's figure beside
//   other buildings'. The returns stand only where the model already ran at
//   that whole — within 2% of it; run at the share's price they set the
//   whole building's cash flows against a fraction of its cost. Beside a
//   loan its entity carries, the share grossed up is the equity's whole, no
//   building's price: no cap is struck and the returns are withheld.
//
//   EVERYTHING ELSE STANDS. A leasehold's and a leased fee's model runs at
//   what the price buys (the lease's building, the land's rent), and the
//   price row says which, with the years to the lease's end.
//
// The first rule reaches past the table (the audit of 2026-09-30): the deal
// header, the pipeline card and the meeting workbook printed a note's
// collateral cap as its going-in cap, and the deal page's leverage read ran
// on it. `noteCapSlot` and `goingInCapFigure` say it for them.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { askingPriceOf, buildingPriceOf } from "@/lib/deal-strategy";
import { interestOf, interestTag, isWholeShare, readInterest } from "@/lib/interest";

export interface CompareModel {
  purchasePrice?: number | null;
  /** year-1 NOI, $ */
  year1Noi?: number | null;
  /** the model's going-in cap, percent */
  goingInCapPct?: number | null;
}

export interface CompareInterest {
  /** what the price buys, beside it — "Note", "49% share", "Leasehold, 45
   *  yrs left", "Leased fee" — null on a fee simple */
  tag: string | null;
  /** the going-in cap on the building's price, percent — null on a note,
   *  which has none, and on a share with no stated percentage or beside the
   *  loan its entity carries (`buildingPriceOf` has no building's price) */
  cap: number | null;
  /** a note's yield to maturity at its price, percent, where it pays or
   *  may; null otherwise */
  noteYtmPct: number | null;
  /** why the model's returns are withheld; null where they stand */
  withheld: "note" | "share" | null;
}

/** How near the model's price must be to the whole's for its returns to be
 *  the whole asset's rather than a share's price against a building. */
const SAME_PRICE = 0.02;

export function compareInterest(
  ex: ExtractionResult | null | undefined,
  model: CompareModel | null | undefined,
  asOf: Date = new Date(),
): CompareInterest {
  const tag = ex ? interestTag(ex, asOf) : null;
  const modelCap = model?.goingInCapPct ?? null;
  if (!ex) return { tag, cap: modelCap, noteYtmPct: null, withheld: null };
  const { kind } = interestOf(ex);

  if (kind === "note") {
    const n = readInterest(ex, askingPriceOf(ex), asOf)?.note ?? null;
    const pays = n != null && !n.matured && n.terms.status !== "non_performing";
    return { tag, cap: null, noteYtmPct: pays ? n.ytmPct : null, withheld: "note" };
  }

  if (kind === "partial_interest") {
    const whole = buildingPriceOf(ex, askingPriceOf(ex));
    const noi = model?.year1Noi ?? null;
    const cap = whole != null && noi != null && noi > 0 ? (noi / whole) * 100 : null;
    const price = model?.purchasePrice ?? null;
    const atWhole = whole != null && price != null && price > 0 && Math.abs(price - whole) / whole <= SAME_PRICE;
    return { tag, cap, noteYtmPct: null, withheld: atWhole ? null : "share" };
  }

  return { tag, cap: modelCap, noteYtmPct: null, withheld: null };
}

/**
 * The deal page's Model tab under the same rules: the first-draft model it
 * draws is the one this table reads, run at the documents' price, and it
 * printed a note's or a share's cap and returns as figures beside the very
 * deals whose returns this table withholds. Its rule and why, in one
 * sentence the tab prints over the withheld figures — null where they stand.
 */
export interface ModelReturnsRead extends CompareInterest {
  /** a share of the owning entity: its cap is the whole's, said so */
  share: boolean;
  line: string | null;
}

export function modelReturnsRead(
  ex: ExtractionResult | null | undefined,
  model: CompareModel | null | undefined,
  asOf: Date = new Date(),
): ModelReturnsRead {
  const ci = compareInterest(ex, model, asOf);
  const line =
    ci.withheld === "note"
      ? "A note's price is a loan's: this model runs the collateral as if bought outright at it, so its cap and returns are the collateral's, not the note's, and are withheld."
      : ci.withheld === "share"
        ? ci.cap != null
          ? "A share's price is for the share: this model ran the whole building's cash flows at it rather than at the whole the price implies, so its returns are withheld, and the cap is struck on that whole."
          : interestOf(ex).entityLoan != null
            ? isWholeShare(interestOf(ex).sharePct)
              ? // All of the entity's interests (a stated 100%, research pass 28).
                "This price buys all of the entity's interests, and beside the loan the entity carries it is the equity's whole, not the building's: this model ran the whole building's cash flows at it, so its cap and returns are withheld."
              : "A share's price is for the share, and grossed up beside the loan its entity carries it is the equity's whole, not the building's: this model ran the whole building's cash flows at it, so its cap and returns are withheld."
            : "A share's price is for the share, and the memorandum states no percentage to gross it up by: this model ran the whole building's cash flows at it, so its cap and returns are withheld."
        : null;
  return { ...ci, share: !!ex && interestOf(ex).kind === "partial_interest", line };
}

/**
 * A note's going-in cap slot, by the first rule above, wherever a deal's
 * figures are summarized — the deal header, the pipeline card and the
 * meeting workbook withhold the cap this table withholds: the collateral's
 * income over a loan's price is a cap nobody earns. In its place, the
 * note's yield to maturity at its price, where the note pays or may. Null on
 * anything but a note, whose cap slot stands.
 */
export function noteCapSlot(
  ex: ExtractionResult | null | undefined,
  asOf: Date = new Date(),
): { ytmPct: number | null } | null {
  if (!ex || interestOf(ex).kind !== "note") return null;
  return { ytmPct: compareInterest(ex, null, asOf).noteYtmPct };
}

/**
 * The going-in cap slot beside a deal's price in its header (and the bar
 * that repeats it): the cap as the memorandum states it — or, on a note,
 * its yield to maturity at its price where it pays or may, else the cap
 * withheld ("n/a — note", the compare table's words).
 */
export function goingInCapFigure(
  ex: ExtractionResult | null | undefined,
  statedCap: string | null,
  asOf: Date = new Date(),
): { label: string; value: string | null } {
  const note = noteCapSlot(ex, asOf);
  if (!note) return { label: "Going-in cap", value: statedCap };
  return note.ytmPct != null
    ? { label: "Yield to maturity", value: `${note.ytmPct.toFixed(1)}%` }
    : { label: "Going-in cap", value: "n/a — note" };
}
