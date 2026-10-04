// How the pipeline orders its deals: each deal's figure under a column, and
// one figure against another in the list's direction. Pure, so the client
// list and its test read one rule.

import { parsePct, parsePrice } from "@/lib/criteria";

export type SortDir = "asc" | "desc";

/** The columns the pipeline list sorts by. */
export type PipelineSortKey = "name" | "asset" | "price" | "cap" | "fit" | "status" | "added" | "due";

/** What a deal's sort reads: the pipeline card's own fields, no more. */
export interface SortableDeal {
  name: string;
  assetClass: string;
  createdAt: string;
  /** "pass" | "caution" | "pass_on" | null */
  verdict: string | null;
  jobStatus?: "running" | "stalled" | "failed" | null;
  fit: "fits" | "near" | "outside" | null;
  score: number | null;
  /** the call-for-offers date, an ISO day */
  offersDue: string | null;
  slots: { price: string | null; cap: string | null };
}

/** The call, worst to best — the status column's order. */
const VERDICT_RANK: Record<string, number> = { pass_on: 0, caution: 1, pass: 2 };
/** The buy box's fold, outside to fits — the fit column's order before a
 *  score was read. */
const FIT_RANK: Record<NonNullable<SortableDeal["fit"]>, number> = { outside: 0, near: 1, fits: 2 };

/** A call above any run state: a finished screen, then one running, one
 *  stalled, one failed, and none. */
function statusRank(d: SortableDeal): number {
  if (d.verdict) return (VERDICT_RANK[d.verdict] ?? 0) + 2;
  if (d.jobStatus === "running") return 1;
  if (d.jobStatus === "stalled") return 0.75;
  if (d.jobStatus === "failed") return 0.5;
  return 0;
}

/**
 * A deal's figure under a column. A blank — no price, cap or fit, or a
 * figure that does not parse ("Call for offers") — is null, so it sorts
 * after every deal with a figure whichever way the list runs, as a deal
 * with no deadline does: it had been -1, and the cheapest-first list
 * opened on every unpriced deal as the cheapest.
 */
export function pipelineSortValue(d: SortableDeal, key: PipelineSortKey): string | number | null {
  switch (key) {
    case "name":
      return d.name.toLowerCase();
    case "asset":
      return d.assetClass;
    case "price":
      return d.slots.price ? parsePrice(d.slots.price) : null;
    case "cap":
      return d.slots.cap ? parsePct(d.slots.cap) : null;
    case "fit":
      // Sort by the numeric mandate score when present (the column shows it),
      // falling back to the coarse fold rank for pre-score deals.
      return d.score ?? (d.fit ? FIT_RANK[d.fit] : null);
    case "status":
      return statusRank(d);
    case "added":
      return d.createdAt;
    case "due":
      // An ISO day, so the text sorts as the date; a deal with no deadline
      // has nothing to sort on and goes after every deal that has one.
      return d.offersDue;
  }
}

/**
 * Two deals' figures in the list's direction: text A→Z, numbers and ISO
 * dates by size. A deal with nothing to sort on — no call-for-offers date,
 * no price, no cap, no fit — sorts after every deal that has one, whichever
 * way the list runs: a deal with no deadline is neither the soonest nor the
 * latest, and one with no price neither the cheapest nor the dearest.
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
