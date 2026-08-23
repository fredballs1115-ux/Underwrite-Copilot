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

/** The single newest entry, for compact stamps. */
export function latestChange(): ChangelogEntry | null {
  return changelogEntries(1)[0] ?? null;
}
