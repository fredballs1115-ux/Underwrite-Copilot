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

/** A Closed deal's price (the owner's decision of 2026-10-21): the price the
 *  buyer paid is the buyer's own, negotiated with the screen in hand, so it
 *  is a decision, counted apart and in no share; only a third party's trade,
 *  reported on a deal moved to Dead, scores the price as a figure. */
export const PURCHASE_IS_DECISION =
  "A Closed deal's price is the buyer's own, negotiated with the screen in hand, so it is a decision, counted apart and in no share, never a market's verdict on the OM's figure.";

/** How a later document reaches the record (lib/anthropic/pipeline): a rent
 *  roll or T-12 is read on the deal's next screen, and each re-screen keeps
 *  the screen it replaces — every one, in screen_snapshots (migration 0038),
 *  beside deals.prior_screen — whose rows the document is scored against:
 *  each piece of later evidence scores a row of a key once, by the latest
 *  screen made before it. */
export const RESCREEN_RULE =
  "A rent roll or T-12 is read on the deal's next screen, so it is scored once the deal is re-screened: each re-screen keeps the screen it replaces, every one, and a piece of evidence scores an assumption once, against the latest screen made before it.";

/** The empty state's one line, under the grid of what can score what. */
export const RESCREEN_LINE = "Upload the document, then re-screen the deal.";

/** The sample's lack of a record, said beside its stress test. */
export const SAMPLE_NO_RECORD = "Nothing has arrived since the sample's screen, so it has no track record.";

/**
 * A vacancy is scored in its own measure, as the stress test decides it
 * (lib/stress-deciders `VACANCY_ORDER`): doors by doors, dollars by dollars.
 */
export const VACANCY_MEASURE_RULE =
  "A vacancy counted by doors is scored by a later rent roll (by area on a class priced by the foot); an economic one by a later T-12.";

/**
 * What can score which row, as lib/track-record's `laterFor` reads it: a
 * vacancy counted by doors by a rent roll, an economic one by a T-12, the
 * NOI by a T-12, the price by a reported trade; a Dead decision on price or
 * on financing answers the price or the loan as a direction, counted apart.
 * No later figure on the deal speaks to the rest (lib/track-record.test.ts
 * holds these lists to what the scorer scores, key by key).
 */
export const SCORED_BY =
  "A row is scored only where a later figure speaks to it: a vacancy by a rent roll (doors or area) or T-12 (dollars), dated after the verdict, unless the market decided it; the NOI by a T-12, neither on a plan deal; the price by a reported trade on a Dead deal.";

/** The rows the owner's decision of 2026-10-21 added, each scored by the
 *  later figure that speaks to it (lib/track-record `laterFor`; its test
 *  holds the words to the scorer). */
export const SCORED_BY_TOO =
  "The operating expenses are scored by a later T-12 on the row's own footing: a seller's operating lines are the building's own, and only its taxes and insurance are left out.";

/** A decision's part in the record, said apart from the figures'. */
export const DECISION_SCORES =
  "A Dead decision on price or financing answers the price or the loan, and a Closed deal's own price answers the price, each counted apart.";

/** The rows nothing on the deal can score yet — every key `laterFor` has no
 *  later figure for, the taxes and insurance said apart
 *  (`TAX_INSURANCE_NOT_SCORED`). */
export const NOT_YET_SCORABLE =
  "Rent growth, expense growth, the exit cap, taxes, insurance and a renovation premium have nothing yet that can score them, so those rows stay unscored.";

/** What the deal page's card scores against, in one sentence. */
export const CARD_SCOPE =
  "Each row of the stress test, holds included, is scored where a later figure can speak to it, and only against what arrived after the verdict: a rent roll or T-12 dated after it (its as-of or period end, not only its upload) — a rent roll for a vacancy counted by doors, a T-12 for an economic vacancy, unless the market's figure decided it, or the NOI, neither on a plan deal, or the operating expenses; a trade reported after it on a deal moved to Dead, and not dated on or before its day, for the price; your decision, a Closed deal's own price among them. A document the screen read is not evidence of it.";

/** Under this many scored rows the record is a start, and no share is
 *  printed (the owner's decision of 2026-10-20: five, not the comps' three).
 *  Here, with no imports, so the deal page's client card can read it. */
export const RECORD_FLOOR = 5;

/** A stress-test row's outcome: a flag (stretched or unsupported) borne out
 *  or not, a hold borne out or false. */
export type RowOutcome = "flag_right" | "flag_wrong" | "hold_right" | "false_hold";

/** A decision's badge: which way the decision points against the row's
 *  verdict, a Closed deal's own price said as the buyer's. */
export function decisionBadge(row: { verdict?: string | null; landing: string; purchase?: boolean }): string {
  const agrees = row.landing === "right";
  const flagged = row.verdict === "stretched" || row.verdict === "unsupported";
  if (row.purchase) return agrees ? "Your own price, on the test's side" : flagged ? "Your own price, against the flag" : "Your own price, against the hold";
  return agrees ? "A decision on the test's side" : flagged ? "A decision against the flag" : "A decision against the hold";
}

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

// ── Calibration, beside right and wrong (the owner's decision of 2026-10-21) ──
// Display only: no score changes with it. Plain data in, words out, so the
// deal page's client card reads them.

/** Where a flagged row's later figure landed on the line from the OM's
 *  figure (0%) to the evidence's (100%): short of the OM's figure, between
 *  the two, or past the evidence's (lib/track-record `gapCaptured`). */
export type CapturedPlace = "om_side" | "between" | "past";

export interface GapCapturedLike {
  /** the share of the gap the later figure covered, a whole percent: 0 at
   *  the OM's figure, 100 at the evidence's; unclamped */
  pct: number;
  place: CapturedPlace;
}

/** What the calibration is, said once beside it. */
export const CALIBRATION_NOTE =
  "Beside right or wrong, how far each flagged row's later figure went from the OM's figure toward the evidence's: shown, never scored, so no share or record changes with it.";

/** One flagged row's capture in a sentence, clamped as the track is: past
 *  the evidence's figure over 100%, the OM's side under 0. */
export function capturedWords(c: GapCapturedLike): string {
  if (c.place === "past") return "The later figure landed past the evidence's figure: the whole gap and more.";
  if (c.place === "om_side") return "The later figure landed on the OM's side of its own figure, away from the evidence's: none of the gap.";
  return `The later figure landed ${c.pct}% of the way from the OM's figure to the evidence's.`;
}

/** The track a capture is drawn on: the OM's figure at 25% of it, the
 *  evidence's at 75%. */
export const CAPTURE_TRACK = { om: 25, evidence: 75 } as const;

/** Where a share of the gap falls on that track, held inside it (`clipped`
 *  where it was held in, the words saying the rest). */
export function capturedAt(pct: number): { at: number; clipped: boolean } {
  const raw = CAPTURE_TRACK.om + (pct / 100) * (CAPTURE_TRACK.evidence - CAPTURE_TRACK.om);
  const at = Math.min(100, Math.max(0, raw));
  return { at, clipped: at !== raw };
}

/** "Of 4 flagged rows scored on figures: 2 landed between the OM's figure
 *  and the evidence's, 1 past the evidence's, 1 on the OM's side." Counts
 *  only, never a share or an average. Null with none. */
export function calibrationCountsLine(c: { between: number; past: number; omSide: number }): string | null {
  const n = c.between + c.past + c.omSide;
  if (n === 0) return null;
  return `Of ${n} flagged ${n === 1 ? "row" : "rows"} scored on figures: ${c.between} landed between the OM's figure and the evidence's, ${c.past} past the evidence's, ${c.omSide} on the OM's side.`;
}

/** Why the base rate is printed beside the record. */
export const BASE_RATE_WHY =
  "It is shown because if memoranda usually miss on the buyer's bad side, a flag that proves right says less: a test that flagged everything would be right that often.";

/** The base rate: of every scored row, whatever the test's verdict, how many
 *  later figures landed past the OM's on the buyer's bad side by more than
 *  the row's margin — the counts always, a share only from RECORD_FLOOR
 *  rows, with its count. Null with no row scored. */
export function baseRateLine(r: { scored: number; pastOm: number; pastOmPct: number | null }): string | null {
  const n = r.scored;
  if (n <= 0) return null;
  const word = "landed past the OM's figure on the buyer's bad side by more than the row's margin";
  if (n < RECORD_FLOOR || r.pastOmPct == null) {
    return `Base rate: ${r.pastOm} of ${n} scored ${n === 1 ? "row" : "rows"}, whatever the test's verdict, ${word}. No share is printed under ${RECORD_FLOOR} scored rows.`;
  }
  return `Base rate: ${shareWords(r.pastOm, n, "scored rows", word, r.pastOmPct)}, whatever the test's verdict.`;
}
