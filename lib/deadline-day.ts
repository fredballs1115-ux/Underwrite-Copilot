/**
 * A deal's offers-due date as a reader types it (research pass 33).
 *
 * A date field reports a complete value at every digit of its year — 0002,
 * 0020 and 0202 on the way to 2027 — so a deadline that saved on each change
 * saved year 2 at the first digit, and the field, keyed by the saved value,
 * remounted under the rest of the typing: the deal read "Offers were due" two
 * thousand years ago. A deadline is a real day inside the years a
 * memorandum's own deadline is read in (lib/offering reads its call for
 * offers between 2000 and 2100); anything else is a year still being typed,
 * never a deadline. No imports: the date field's client component and the
 * save action both read it.
 */

export const DEADLINE_FIRST_YEAR = 2000;
export const DEADLINE_LAST_YEAR = 2100;

/** The ISO day a typed deadline states, or null where it is no real day in
 *  those years (a 31st of June, a 13th month, year 0002). */
export function deadlineDay(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < DEADLINE_FIRST_YEAR || y > DEADLINE_LAST_YEAR) return null;
  if (mo < 1 || mo > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  return m[0];
}

/** What the date field does with what it holds when the reader commits it:
 *  "save" a real deadline or a cleared field, nothing for the value already
 *  saved ("same"), and "refuse" a date half typed (which a date field reports
 *  as empty, with `halfTyped` its validity's badInput) or no real deadline. */
export function deadlineCommit(value: string, halfTyped: boolean, saved: string | null): "save" | "same" | "refuse" {
  const kept = value === "" ? !halfTyped : deadlineDay(value) != null;
  if (!kept) return "refuse";
  return value === (saved ?? "") ? "same" : "save";
}
