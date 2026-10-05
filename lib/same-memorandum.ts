/**
 * The same memorandum, byte for byte, already on another of the reader's
 * deals. Every screen stores the fingerprint of the deck it read on the
 * extraction (lib/om-fingerprint, `ExtractionResult.omFingerprint`), but an
 * upload never asked it: the same file under another name, or a minute
 * later, became a second deal, a second full screen and a second free slot,
 * and nothing said so (research pass 30). The deal page now says, on the
 * newer deal, which earlier deal holds the same file, with a link. It never
 * refuses the upload — a second copy can be deliberate. Pure: the page makes
 * the one read (the earlier deals it can see with the same fingerprint) and
 * hands the rows in.
 */

/** An earlier deal holding the same memorandum, as the page reads it. */
export interface TwinDeal {
  id: string;
  name: string | null;
  created_at: string;
}

export interface SameMemorandum {
  /** the earliest such deal */
  id: string;
  name: string;
  /** the day it was added ("Sep 12, 2026", in UTC), or null where the
   *  stamp does not parse */
  added: string | null;
  /** how many more of the reader's deals hold it too */
  more: number;
}

/** The earliest twin, or null where there is none. */
export function sameMemorandum(twins: readonly TwinDeal[] | null | undefined): SameMemorandum | null {
  const list = (twins ?? []).filter((t) => t && typeof t.id === "string" && t.id);
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const first = sorted[0];
  const t = Date.parse(first.created_at);
  return {
    id: first.id,
    name: first.name?.trim() || "an untitled deal",
    added: Number.isFinite(t)
      ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      : null,
    more: list.length - 1,
  };
}

/** The words after the linked deal's name. */
export function sameMemorandumTail(same: SameMemorandum): string {
  const added = same.added ? `, added ${same.added}` : "";
  const more = same.more > 0 ? `, and on ${same.more} more of your deals` : "";
  return `${added}${more} — open it to see that screen; this one reads the same file again.`;
}
