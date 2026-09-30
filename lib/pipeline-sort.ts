// How the pipeline orders its deals: one figure against another in the
// list's direction. Pure, so the client list and its test read one rule.

export type SortDir = "asc" | "desc";

/**
 * Two deals' figures in the list's direction: text A→Z, numbers and ISO
 * dates by size. A deal with nothing to sort on — no call-for-offers date —
 * sorts after every deal that has one, whichever way the list runs: a deal
 * with no deadline is neither the soonest nor the latest.
 */
export function compareSortValues(
  a: string | number | null,
  b: string | number | null,
  dir: SortDir,
): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  const cmp =
    typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : (a as number) - (b as number);
  return dir === "asc" ? cmp : -cmp;
}
