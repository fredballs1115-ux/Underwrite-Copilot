// The words a deal's cap slot says where it holds no cap of the deal's own,
// for the pipeline's client module (its card, its list and its CSV) and its
// tests. No imports: lib/compare-interest, which decides the slot
// (`capSlotWithheld`, `noteCapSlot`) and holds the same words for the
// server's surfaces (`OWN_YIELD_WORDS`, `SHARE_CAP_WORDS`), reaches the
// whole interest reader, which the browser does not load; a test holds the
// two copies to each other.

/** Why a note's cap slot holds its yield, or "n/a": the collateral's cap is
 *  not the buyer's figure. */
export const NOTE_CAP_TITLE =
  "A note has no going-in cap: the collateral's income over a loan's price is a cap nobody earns. The note's yield to maturity at its price stands in its place, where the note pays or may.";

export type OwnYieldKind = "note" | "position";
export type CapWithheldKind = OwnYieldKind | "share";

/** A note's and a preferred equity position's own yield in the cap slot, in
 *  words: what it runs to, the list column's micro-label, the slot where
 *  none can be stated, the card's label and the tooltip. */
export const OWN_YIELD: Record<OwnYieldKind, { to: string; micro: string; na: string; label: string; title: string }> = {
  note: { to: "to maturity", micro: "ytm", na: "n/a — note", label: "Note yield", title: NOTE_CAP_TITLE },
  position: {
    to: "to redemption",
    micro: "ytr",
    na: "n/a — position",
    label: "Position yield",
    title:
      "A preferred equity position has no going-in cap: its price buys a rate and a redemption, never a slice of the building. Its yield to redemption at its price stands in its place, where the redemption date has not gone by.",
  },
};

/** Why a cap slot holds no cap: the slot where no figure stands, and its
 *  tooltip. A share beside the loan its entity carries has no yield of its
 *  own to show in the cap's place. */
export const CAP_WITHHELD: Record<CapWithheldKind, { na: string; title: string }> = {
  note: OWN_YIELD.note,
  position: OWN_YIELD.position,
  share: {
    na: "n/a — share",
    title:
      "Beside the loan its entity carries, a share's price grossed up is the equity's whole, not the building's: a cap stated against that price is on a basis the memorandum never says, so no cap is shown.",
  },
};

/** The words of the yield standing in a cap slot: a note's, else a
 *  position's (only those two carry one). */
export const ownYieldOf = (w: CapWithheldKind | null | undefined) => OWN_YIELD[w === "position" ? "position" : "note"];

/**
 * The cap slot as one cell of text, as the pipeline's CSV writes it: the
 * cap; else a note's or a position's own yield with what it runs to, the
 * figure the card shows ("17.0% to maturity"); else why the cap is
 * withheld; else blank. A plan deal's yield on cost has its own column.
 */
export function capCellText(slots: { cap: string | null; noteYield?: string | null; capWithheld?: CapWithheldKind | null }): string {
  if (slots.cap) return slots.cap;
  if (slots.noteYield) return `${slots.noteYield} ${ownYieldOf(slots.capWithheld).to}`;
  return slots.capWithheld ? CAP_WITHHELD[slots.capWithheld].na : "";
}
