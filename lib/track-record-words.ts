// The track record's scope, in the words every surface that draws it says
// (lib/track-record re-exports them). No imports: the deal page's card is
// drawn inside a client component, and lib/track-record reaches the stress
// test's tables.

/**
 * Why no document scores a taxes or an insurance challenge. A seller's T-12
 * is the seller's operating history: its tax line is struck on the seller's
 * assessment, never the bill a sale may reset, and its premium is the
 * seller's expiring policy, never the quote a new owner gets — the stress
 * test's own tax row refuses it as evidence for the same reason. No document
 * kind on the deal is the buyer's own bill or quote, so these challenges are
 * scored by no document at all.
 */
export const TAX_INSURANCE_NOT_SCORED = "A seller's T-12 cannot show a new owner's tax bill or premium, so taxes and insurance rows are not scored by documents.";

/** What a document must be to score a challenge: uploaded after the verdict
 *  AND dated after it. */
export const DOCUMENT_DATE_RULE =
  "A rent roll or T-12 scores a row only where its own date — the roll's as-of, the T-12's period end — falls after the verdict, not merely its upload.";

/**
 * What can score which row, as lib/track-record's `laterFor` reads it: a
 * vacancy by a rent roll or a T-12, the NOI by a T-12, the price by a
 * reported trade; a Dead decision on price or on financing answers the price
 * or the loan as a direction, counted apart. No later figure on the deal
 * speaks to the rest (lib/track-record.test.ts holds these lists to what the
 * scorer scores, key by key).
 */
export const SCORED_BY =
  "A row is scored only where a later figure can speak to it: a vacancy by a rent roll or T-12 dated after the verdict, the NOI by a T-12, the price by a reported trade. A Dead decision on price or financing answers the price or the loan, counted apart.";

/** The rows nothing on the deal can score yet — every key `laterFor` has no
 *  later figure for, the taxes and insurance said apart
 *  (`TAX_INSURANCE_NOT_SCORED`). */
export const NOT_YET_SCORABLE =
  "Rent growth, expense growth, the exit cap, taxes, insurance and a renovation premium have nothing yet that can score them, so those rows stay unscored.";

/** What the deal page's card scores against, in one sentence. */
export const CARD_SCOPE =
  "Each row of the stress test, holds included, is scored where a later figure can speak to it, and only against what arrived after the verdict: a rent roll or T-12 dated after it (its as-of or period end, not only its upload) for a vacancy or the NOI, a reported trade for the price, your decision. A document the screen read is not evidence of it.";

/** Under this many scored rows the record is a start, and no share is
 *  printed (the owner's decision of 2026-10-20: five, not the comps' three).
 *  Here, with no imports, so the deal page's client card can read it. */
export const RECORD_FLOOR = 5;

/** A stress-test row's outcome: a flag (stretched or unsupported) borne out
 *  or not, a hold borne out or false. */
export type RowOutcome = "flag_right" | "flag_wrong" | "hold_right" | "false_hold";

/** The outcome in words, as the card's badge says it — never a colour alone. */
export const OUTCOME_WORD: Record<RowOutcome, string> = {
  flag_right: "Right: the flag stood",
  flag_wrong: "Wrong: the OM's figure stood",
  hold_right: "Right: the hold stood",
  false_hold: "Wrong: a false hold",
};

/** "3 of 5 rows right (60%)": a share is never printed without its count. */
export function shareWords(n: number, of: number, noun: string, word: string): string {
  return `${n} of ${of} ${noun} ${word} (${Math.round((n / of) * 100)}%)`;
}

/** One deal's scored stress-test rows in a line, the floor applied as on
 *  the account's record: the counts always, a share only from RECORD_FLOOR
 *  rows. Null where no row of the stress test is scored. Takes the rows'
 *  plain data (lib/track-record `ScoredRow`). */
export function dealRecordLine(record: {
  rows: readonly { fromTest?: boolean; decision?: boolean; landing: string; outcome?: RowOutcome | null }[];
}): string | null {
  const rows = record.rows.filter((r) => r.fromTest && !r.decision && (r.landing === "right" || r.landing === "wrong"));
  const n = rows.length;
  if (n === 0) return null;
  const right = rows.filter((r) => r.landing === "right").length;
  const wrong = n - right;
  const falseHolds = rows.filter((r) => r.outcome === "false_hold").length;
  const fh = falseHolds > 0 ? `, ${falseHolds} of them ${falseHolds === 1 ? "a false hold" : "false holds"}` : "";
  if (n < RECORD_FLOOR) {
    return `${n} stress-test row${n === 1 ? "" : "s"} scored on this deal: ${right} right, ${wrong} wrong${fh}. No share is printed under ${RECORD_FLOOR} scored rows.`;
  }
  return `${n} stress-test rows scored on this deal: ${shareWords(right, n, "rows", "right")}, ${shareWords(wrong, n, "rows", "wrong")}${fh}.`;
}
