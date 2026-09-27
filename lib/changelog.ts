// The product changelog, typed. One checked-in source feeds the pipeline's
// What's-new card AND the homepage footer's latest-improvement stamp, so the
// homepage can never claim an improvement the app doesn't ship (and vice
// versa). (Universal module: JSON + pure helpers only.)

import changelogSeed from "@/data/changelog.json";

export interface ChangelogEntry {
  /** ISO date the improvement went live */
  date: string;
  title: string;
  blurb: string;
  /** where in the app to see it */
  href: string;
}

/** Newest-first entries, defensively filtered (a malformed row renders as
 *  nothing, never as a broken card). */
export function changelogEntries(limit = 6): ChangelogEntry[] {
  return ((changelogSeed.entries ?? []) as ChangelogEntry[])
    .filter((e) => e && e.date && e.title && e.href)
    .slice(0, Math.max(0, limit));
}

/** /whats-new draws the newest this-many entries in full, and every older one
 *  as a line in its archive (#433) — so a title never falls off the page as
 *  the log grows: a tool card's note stays where its guard reads it, and a
 *  round's live-verify marker keeps finding its title. */
export const FULL_NOTES = 100;

/** The entries older than the newest `FULL_NOTES`, newest first: the page's
 *  archive, one line each. */
export function changelogArchive(): ChangelogEntry[] {
  return changelogEntries(Number.MAX_SAFE_INTEGER).slice(FULL_NOTES);
}

/** The single newest entry, for compact stamps. */
export function latestChange(): ChangelogEntry | null {
  return changelogEntries(1)[0] ?? null;
}

/** A note longer than this reads as a wall of text on a phone; /whats-new
 *  folds it behind its opening. */
export const LONG_NOTE = 600;

/** The opening of a note — whole sentences up to about `max` characters,
 *  ending with an ellipsis when the note goes on — for a card or a folded
 *  entry. A short note comes back whole. */
export function blurbExcerpt(blurb: string, max = 320): string {
  const s = blurb.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(": "));
  // A sentence boundary in the back half of the window keeps whole
  // sentences; otherwise break at the last word.
  if (end >= max * 0.4) return cut.slice(0, end + 1).trimEnd() + " …";
  const word = cut.lastIndexOf(" ");
  return (word > 0 ? cut.slice(0, word) : cut).replace(/[,;:—–-]+$/, "") + " …";
}
