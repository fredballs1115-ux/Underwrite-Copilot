/**
 * The longest a `/tools` card runs, and the words that say a figure was
 * read at it.
 *
 * The cards build an answer a month or a year at a time, so a figure typed —
 * or carried in a link — as a million years is a loop a million long, and
 * the whole page stops while it runs: a 1,000,000-year hold on the loan
 * assumption ran past four minutes (the research pass of 2026-10-01). A
 * figure past a card's longest is not refused, since whoever typed it meant
 * something; it is READ at the longest, and the card says so beside its
 * fields — never a quiet clamp. Each bound sits well past any deal a card is
 * for, so a real figure is never held.
 *
 * Pure, no I/O: the modules hold their inputs here, and the page says it.
 */

/** A hold: thirty years, the bound the max-bid solver refuses past. */
export const MAX_HOLD_YEARS = 30;

/** A fixed-rate loan's months to maturity: fifty years. */
export const MAX_LOAN_MONTHS = 600;

/** A construction schedule: ten years of works. */
export const MAX_BUILD_MONTHS = 120;

/** A space lease's term, left to run or newly signed: 99 years. */
export const MAX_LEASE_YEARS = 99;

/** The months a space stands empty before a new tenant pays: ten years. */
export const MAX_DOWNTIME_MONTHS = 120;

/** A ground lease's years left: 999, a term some ground leases are written for. */
export const MAX_GROUND_LEASE_YEARS = 999;

/** A figure held to `max`: itself within it, `max` past it. */
export function heldTo(n: number, max: number): number {
  return n > max ? max : n;
}

/**
 * What a card says under its fields where a figure was read at the longest
 * it runs — "Hold read as 30 years, the longest this card runs." — and null
 * where it was read as typed (a blank included: a blank is never "held").
 */
export function heldNote(
  n: number | null | undefined,
  max: number,
  field: string,
  unit = "",
): string | null {
  if (typeof n !== "number" || !(n > max)) return null;
  return `${field} read as ${max.toLocaleString("en-US")}${unit ? ` ${unit}` : ""}, the longest this card runs.`;
}
