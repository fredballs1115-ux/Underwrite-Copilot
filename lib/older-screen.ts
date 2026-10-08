/**
 * A screen stored before a reader existed (research pass 42, M11): said once,
 * briefly, where the deal is summarized — "Screened before the site read what
 * is being sold — re-screen to read it" on the deal page's header, with the
 * re-screen control it already has, and as a chip on the pipeline's card and
 * row, the sentence in its title.
 *
 * Never on a deal typed in by hand (its facts were never a memorandum's read:
 * lib/manual-deal `typedByHand`), never on the sample, and never where the
 * field is present: an extraction that carries it was read with it, whatever
 * round it was stamped under. Pure.
 */
import type { ExtractionResult } from "@/lib/anthropic/types";
import { typedByHand } from "@/lib/manual-deal";
import { OLDER_SCREEN_READERS, readerRoundOf, type OlderScreenReader } from "@/lib/reader-round";

/** The chip the pipeline's card and row wear, the sentence in its title. */
export const OLDER_SCREEN_CHIP = "Older screen";

export interface OlderScreen {
  /** the field the screen predates */
  field: OlderScreenReader["field"];
  /** the sentence: "Screened before the site read what is being sold —
   *  re-screen to read it" */
  line: string;
}

/** The sentence for a reader the screen predates. */
export function olderScreenLine(reader: Pick<OlderScreenReader, "what">): string {
  return `Screened before the site read ${reader.what} — re-screen to read it`;
}

/**
 * The first reader a stored extraction predates whose field it lacks, or null:
 * none on a deal with no extraction, a deal typed by hand, the sample, an
 * extraction carrying the field, or one stamped under a round that asked for
 * it (its absence is then the memorandum's).
 */
export function olderScreen(
  ex: ExtractionResult | null | undefined,
  { isSample = false }: { isSample?: boolean } = {},
): OlderScreen | null {
  if (!ex || isSample || typedByHand(ex)) return null;
  const round = readerRoundOf(ex);
  for (const reader of OLDER_SCREEN_READERS) {
    if (ex[reader.field] !== undefined && ex[reader.field] !== null) continue;
    if (round >= reader.round) continue;
    return { field: reader.field, line: olderScreenLine(reader) };
  }
  return null;
}
