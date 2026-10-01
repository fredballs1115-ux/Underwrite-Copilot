/**
 * A field left blank on `/tools`, named rather than read as zero.
 *
 * A blank is null, never zero. Read as zero, a loan rate left empty priced
 * a 0% loan: Max bid read $29.50M where the typed rate bids $25.54M, and
 * Hold or sell said "sell in year 9" where the loan says year 5 (the
 * research pass of 2026-10-01). So a card that cannot answer without a
 * field answers nothing while it is blank, and says which field — in the
 * card's own words, which is why each name is the caller's.
 *
 * Pure, no I/O; the page reads every field through `readFigure`, so this
 * does too.
 */
import { readFigure } from "@/lib/money";

/** The names of the fields whose figures are blank or unreadable, in order. */
export function blanks(fields: ReadonlyArray<readonly [name: string, raw: string]>): string[] {
  return fields.filter(([, raw]) => readFigure(raw) === null).map(([name]) => name);
}

/** What a card says in place of an answer while a field it needs is blank. */
export function fillIn(names: readonly string[]): string {
  const list =
    names.length < 2
      ? names.join("")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Fill in ${list} — a blank is not read as zero.`;
}
