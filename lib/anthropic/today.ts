/**
 * Today's date, as every Claude step is told it.
 *
 * No step was told the date, so "recent", "current" and "this year" were
 * judged from whatever the model's training suggested: the public-web comp
 * search asked for "recent" sales, a lease or a loan stated to end on a day
 * now past could read as running, and the steward's re-verification could
 * "confirm" a figure for a period that had ended. So every step is handed
 * one line naming the day, in ISO and in words.
 *
 * It rides AFTER the document, as the last block of the request — never in
 * ANALYST_SYSTEM or anything before the cached memorandum, whose prefix
 * must stay byte-identical from step to step and day to day (the prompt
 * cache, lib/anthropic/om-source). Each call reads the clock when it is
 * made, so a test pins the day by faking the clock.
 *
 * Imports nothing at run time: the steward and the intel job load it under
 * plain Node.
 */

/** "2026-10-01 (October 1, 2026)", read in UTC — the site's day. */
export function todayWords(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  const words = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${iso} (${words})`;
}

/** The line a step is handed after the document. */
export function todayLine(now: Date = new Date()): string {
  return `Today's date is ${todayWords(now)}. Read "recent", "current", "this year" and every date the documents state against it — a date before it has passed, and a lease, a loan or a period that ends before it has ended — never against a date your training suggests.`;
}
