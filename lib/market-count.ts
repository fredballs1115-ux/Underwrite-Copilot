// How many markets the site covers, counted the way a buyer counts them —
// PURE. One definition for every page that states a count: the homepage's
// stat and gallery, /why's marquee, the sign-in page, and /market's search
// description, which had said "44 US markets" beside the homepage's 15
// because it counted the Washington area's four briefs as four markets.

import metrosSeed from "@/data/research/metros.json";
import { DATA_METROS } from "@/lib/market-match";

/**
 * The markets with a research brief. The DMV core's four jurisdiction
 * entries are ONE market to a human; every other entry counts as itself,
 * whatever its region stamp — an unstamped future metro must move this
 * number, not silently vanish from it. lib/market-scope.test.ts pins it.
 */
export const MARKET_COUNT = new Set(
  (metrosSeed.metros ?? []).map((m) => ((m as { region?: string }).region === "DMV core" ? "DMV core" : m.id)),
).size;

/** The briefs themselves: one a jurisdiction entry, the Washington area's
 *  four included — what a grid of the markets' tiles shows. */
export const BRIEF_COUNT = (metrosSeed.metros ?? []).length;

/** Every market the site reads published figures for: the briefed markets,
 *  counted as above, and the metro areas read without a brief. */
export const MARKETS_READ = MARKET_COUNT + DATA_METROS.length;

/**
 * What one region's row of /market's chips counts, in `MARKET_COUNT`'s
 * units: the DMV core's chips are four briefs of ONE market, and every other
 * chip is a market of its own. The rows said "DMV core · 4 metros" beside a
 * homepage counting the same four as one market, and "Mid-Atlantic · 5
 * metros" over Newark / Jersey City, which is not a metro area of its own.
 */
export function regionCountLabel(region: string, briefs: number): string {
  if (region === "DMV core") return briefs === 1 ? "1 market" : `${briefs} briefs, one market`;
  return `${briefs} market${briefs === 1 ? "" : "s"}`;
}
