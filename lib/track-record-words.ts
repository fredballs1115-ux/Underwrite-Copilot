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

/** What a trade must be to score the price: reported after the verdict AND,
 *  where its date is stated, traded after the verdict's day (lib/track-record
 *  refuses one dated on or before it, as it refuses a document). */
export const TRADE_DATE_RULE =
  "A trade scores the price only where it was reported after the verdict and, where its date is stated, traded after the verdict's day.";

/** How a later document reaches the record (lib/anthropic/pipeline): a rent
 *  roll or T-12 is read on the deal's next screen, and each re-screen keeps
 *  the one screen it replaces (deals.prior_screen), whose rows the document
 *  is scored against. */
export const RESCREEN_RULE =
  "A rent roll or T-12 is read on the deal's next screen, so it is scored once the deal is re-screened, against the screen before: each re-screen keeps the one screen it replaces, none before it.";

/** The empty state's one line, under the grid of what can score what. */
export const RESCREEN_LINE = "Upload the document, then re-screen the deal.";

/** The sample's lack of a record, said beside its stress test. */
export const SAMPLE_NO_RECORD = "Nothing has arrived since the sample's screen, so it has no track record.";

/**
 * What can score which row, as lib/track-record's `laterFor` reads it: a
 * vacancy by a rent roll or a T-12, the NOI by a T-12, the price by a
 * reported trade; a Dead decision on price or on financing answers the price
 * or the loan as a direction, counted apart. No later figure on the deal
 * speaks to the rest (lib/track-record.test.ts holds these lists to what the
 * scorer scores, key by key).
 */
export const SCORED_BY =
  "A row is scored only where a later figure can speak to it: a vacancy by a rent roll or T-12 dated after the verdict, unless the market's figure decided it; the NOI by a T-12, neither on a plan deal; the price by a reported trade.";

/** A decision's part in the record, said apart from the figures'. */
export const DECISION_SCORES = "A Dead decision on price or financing answers the price or the loan, counted apart.";

/** The rows nothing on the deal can score yet — every key `laterFor` has no
 *  later figure for, the taxes and insurance said apart
 *  (`TAX_INSURANCE_NOT_SCORED`). */
export const NOT_YET_SCORABLE =
  "Rent growth, expense growth, the exit cap, taxes, insurance and a renovation premium have nothing yet that can score them, so those rows stay unscored.";

/** What the deal page's card scores against, in one sentence. */
export const CARD_SCOPE =
  "Each row of the stress test, holds included, is scored where a later figure can speak to it, and only against what arrived after the verdict: a rent roll or T-12 dated after it (its as-of or period end, not only its upload) for a vacancy, unless the market's figure decided it, or the NOI, neither on a plan deal; a trade reported after it, and not dated on or before its day, for the price; your decision. A document the screen read is not evidence of it.";

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

/** "3 of 5 rows right (60%)": a share is never printed without its count.
 *  `pct` is the share's own whole percent where the caller has rounded a set
 *  of shares together (`wholeShares`), so the set sums to 100. */
export function shareWords(n: number, of: number, noun: string, word: string, pct?: number): string {
  return `${n} of ${of} ${noun} ${word} (${pct ?? Math.round((n / of) * 100)}%)`;
}

/**
 * Whole percents for counts that make up one whole, by the largest
 * remainder: each count's floor first, then a point to the largest
 * remainders (the earlier count on a tie) until the set sums to 100 — so
 * three shares of 1, 1 and 1 read 34, 33 and 33, never 33, 33 and 33 or a
 * set that sums to 101. All zero where the total is.
 */
export function wholeShares(counts: readonly number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
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
  const [rightPct, wrongPct] = wholeShares([right, wrong]);
  return `${n} stress-test rows scored on this deal: ${shareWords(right, n, "rows", "right", rightPct)}, ${shareWords(wrong, n, "rows", "wrong", wrongPct)}${fh}.`;
}
