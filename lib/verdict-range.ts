/**
 * The verdict's screening ranges as every surface reads them (pure, no
 * imports): the deal page's range cards, the shared screen, the memo and the
 * full report print a range's cells "Low", "Base" and "High" and draw the
 * base's place on one track from low to high.
 *
 * The verdict is asked for the smaller figure as `low` and the larger as
 * `high`, whichever end is the conservative one (research pass 18). Before
 * that it was asked for the conservative end first, so an exit cap stored
 * then can read "Low 5.75% / High 5.25%": a "Low" cell holding the larger
 * figure, and no track drawn. `rangeInOrder` reads such a pair with its ends
 * swapped, so every surface prints and draws one range the same way; ends
 * that do not both read as numbers are left as written.
 */

/** The first number in a display string ("$1,495" → 1495, "5.25%" → 5.25). */
export function firstNumber(text: string): number | null {
  const m = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** The range with its smaller figure as `low` and its larger as `high`. */
export function rangeInOrder<T extends { low: string; high: string }>(r: T): T {
  const lo = firstNumber(r.low);
  const hi = firstNumber(r.high);
  return lo != null && hi != null && lo > hi ? { ...r, low: r.high, high: r.low } : r;
}

/** Where the base sits inside low → high, 0..1, on the range read in order;
 *  null when the three figures do not parse as one scale. Which end is the
 *  sponsor's depends on the assumption (a higher rent is theirs, a higher
 *  vacancy the buyer's), so the position is drawn, never graded. */
export function basePosition(r: { low: string; base: string; high: string }): number | null {
  const o = rangeInOrder(r);
  const lo = firstNumber(o.low);
  const hi = firstNumber(o.high);
  const base = firstNumber(o.base);
  return lo != null && hi != null && base != null && hi > lo
    ? Math.min(1, Math.max(0, (base - lo) / (hi - lo)))
    : null;
}
