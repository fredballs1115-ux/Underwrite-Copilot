// The pipeline's fit filter, in the card's own words (signed-in gaps, M8).
//
// The filter had offered "Pursue · 75+ / Watch · 50–74 / Pass · <50" — the
// score's three bands — while the card and the row print "Outside box"
// wherever a deal misses its box outright, whatever its score, and "2 of 4
// checked" in the call's place where the screen could not judge the whole
// box (lib/fit-label `fitScoreLabel`). A 63-score deal reading "Outside box"
// filed under "Watch", and "Pass", which in this trade means decline, sat a
// select away from the verdict's "No-go". Here a deal files under the words
// its chip says, in the same order of precedence: a miss outright first,
// then a fit judged on part of the box, then the score's band (or, with no
// score, the fold's word). Pure and import-free at run time, so the client
// pipeline reads it and a test holds it to the chip.
import type { BuyBoxCoverage } from "@/lib/criteria";
import { checkedOf, FOLD_WORD } from "@/lib/fit-label";

/** The score bands' floors, as lib/mandate sets them (PURSUE_MIN,
 *  WATCH_MIN). Kept here as literals so the client bundle never loads
 *  lib/mandate; lib/fit-filter.test.ts holds them to it. */
export const FIT_FILTER_BANDS = { pursue: 75, watch: 50 } as const;

/** What the filter reads off a deal: the pipeline card's own fields. */
export type FitFilterDeal = {
  score: number | null;
  mandateVerdict: "PURSUE" | "WATCH" | "PASS" | null;
  fit: "fits" | "near" | "outside" | null;
  fitCoverage?: Pick<BuyBoxCoverage, "checked" | "total"> | null;
};

/** The low band's key. "PASS" was its key and its word; a view saved under
 *  it is read as this (`normalizeFitFilter`). */
const LOW = "LOW";

/**
 * The option a deal files under, or null where it has no fit to file (no
 * buy box, not screened): "outside" for a miss outright; "checked:2/4"
 * where not every criterion could be checked; else the score's band
 * ("PURSUE", "WATCH", "LOW"), or with no score the fold's ("fits", "near").
 */
export function fitFilterKey(d: FitFilterDeal): string | null {
  const scored = d.score != null && !!d.mandateVerdict;
  if (!scored && !d.fit) return null;
  if (d.fit === "outside") return "outside";
  const cov = d.fitCoverage;
  if (cov && checkedOf(cov)) return `checked:${cov.checked}/${cov.total}`;
  if (scored) return d.mandateVerdict === "PASS" ? LOW : d.mandateVerdict;
  return d.fit;
}

/** An option's words: the chip's own. */
export function fitFilterLabel(key: string): string {
  const checked = /^checked:(\d+)\/(\d+)$/.exec(key);
  if (checked) return checkedOf({ checked: Number(checked[1]), total: Number(checked[2]) }) ?? key;
  switch (key) {
    case "PURSUE":
      return `Pursue · ${FIT_FILTER_BANDS.pursue}+`;
    case "WATCH":
      return `Watch · ${FIT_FILTER_BANDS.watch}–${FIT_FILTER_BANDS.pursue - 1}`;
    case LOW:
      // The card draws a low score as its figure in red; never "Pass",
      // which beside the verdict's chips reads as a decline.
      return `Fit under ${FIT_FILTER_BANDS.watch}`;
    case "fits":
      return `${FOLD_WORD.fits} box`;
    case "near":
      return `${FOLD_WORD.near} box`;
    case "outside":
      return `${FOLD_WORD.outside} box`;
    default:
      return key;
  }
}

/** Where each kind of option sits in the list: the strongest fit first. */
function rank(key: string): number {
  const fixed: Record<string, number> = { PURSUE: 0, WATCH: 1, fits: 2, near: 3, [LOW]: 5, outside: 6 };
  if (key in fixed) return fixed[key];
  return 4;
}

/** A filter value read back from a saved view: the old "PASS" is the low
 *  band; anything else as it was. */
export function normalizeFitFilter(v: string): string {
  return v === "PASS" ? LOW : v;
}

/**
 * The options the filter offers: "All fit", then one for each key a deal
 * files under, strongest first (a fit judged on part of the box by how much
 * of it, most first) — and the one selected, should no deal file under it
 * any more, so the select never shows a value it does not list.
 */
export function fitFilterOptions(deals: FitFilterDeal[], selected = "all"): [string, string][] {
  const keys = new Set<string>();
  for (const d of deals) {
    const k = fitFilterKey(d);
    if (k) keys.add(k);
  }
  if (selected !== "all") keys.add(selected);
  const share = (k: string) => {
    const m = /^checked:(\d+)\/(\d+)$/.exec(k);
    return m ? Number(m[1]) / Number(m[2]) : 0;
  };
  const sorted = [...keys].sort((a, b) => rank(a) - rank(b) || share(b) - share(a) || a.localeCompare(b));
  return [["all", "All fit"], ...sorted.map((k) => [k, fitFilterLabel(k)] as [string, string])];
}
