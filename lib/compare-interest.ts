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
//   whole building's cash flows against a fraction of its cost.
//
//   EVERYTHING ELSE STANDS. A leasehold's and a leased fee's model runs at
//   what the price buys (the lease's building, the land's rent), and the
//   price row says which, with the years to the lease's end.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { askingPriceOf, buildingPriceOf } from "@/lib/deal-strategy";
import { interestOf, interestTag, readInterest } from "@/lib/interest";

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
   *  which has none, and on a share with no stated percentage */
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
