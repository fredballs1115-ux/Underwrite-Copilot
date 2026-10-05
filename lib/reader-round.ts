/**
 * Which round of readers a screen was read under (research pass 42, M11).
 *
 * Each round since #411 added a field the extraction asks the memorandum for
 * — the portfolio's properties, what is being sold, the tenants, the
 * affordability, the hotel, the sale, the single tenant, the listing team —
 * and an extraction stored before a round reads each field it never asked as
 * none. Where that absence changes what a figure means, the deal must say it
 * was screened before the site read it: lib/interest reads a missing interest
 * as fee simple, so a 49% share screened before #414 prints the whole
 * building's basis — $83k a unit for $170k — with no tag.
 *
 * Every extraction the screen or the manual-deal path stores is stamped with
 * READER_ROUND (`ExtractionResult.readerRound`, beside `screenedOn`). One
 * stored before the stamp is round 0. A reader listed below with its round is
 * one a screen of an earlier round never ran; read by lib/older-screen.
 *
 * No imports: lib/manual-deal stamps it, and lib/older-screen reads both.
 */

/** The round every screen stored from now on is read under. Raise it when
 *  the extraction asks a new field (or a new labelled row) whose absence on
 *  an older screen changes what a figure means, and list the reader in
 *  OLDER_SCREEN_READERS under the new round. 1: every reader through
 *  research pass 42 (October 2026), the interest conveyed among them. */
export const READER_ROUND = 1;

/** A reader whose absence on an older screen changes what a figure means. */
export interface OlderScreenReader {
  /** the extraction's field the reader fills — absent on a screen stored
   *  before the reader asked for it */
  field: "interest";
  /** the first stamped round that asked for it: a screen stamped with this
   *  round or a later one was read with it, so its absence is the
   *  memorandum's, never the reader's */
  round: number;
  /** what the site did not read, in the sentence the deal page says:
   *  "Screened before the site read <what>" */
  what: string;
}

/**
 * The readers an older screen predates, the one that changes the most first.
 * Only fields whose absence changes a figure: a missing interest reads as fee
 * simple, so the price, the basis and the cap are read as the whole
 * building's whatever the memorandum sold (lib/interest). A missing portfolio,
 * tenant list or listing team hides a panel; the figures stand as read.
 */
export const OLDER_SCREEN_READERS: readonly OlderScreenReader[] = [
  { field: "interest", round: 1, what: "what is being sold" },
];

/** The round a stored extraction was read under: its stamp, or 0 for one
 *  stored before the stamp (or a stamp that is no round). */
export function readerRoundOf(ex: { readerRound?: unknown } | null | undefined): number {
  const r = ex?.readerRound;
  return typeof r === "number" && Number.isInteger(r) && r > 0 ? r : 0;
}
