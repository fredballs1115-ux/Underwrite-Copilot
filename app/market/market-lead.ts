import { isDataMetro } from "@/lib/market-match";

/**
 * What a link to a market's page calls it. A briefed market's page leads
 * with its research brief; a metro area the site reads without a brief
 * (`isDataMetro`: Pittsburgh, Phoenix …) has a page of its published figures
 * and no brief, so nothing that links to it may promise one.
 */
export function marketPageWord(id: string): "brief" | "figures" {
  return isDataMetro(id) ? "figures" : "brief";
}

/** The line under a signed-in reader's market page heading
 *  (`/market?metro=`): what the page opens on, then their own data. */
export function marketLeadLine(briefed: boolean): string {
  return briefed
    ? "The market’s brief first; your own market data follows it."
    : "The market’s published figures first; your own market data follows it.";
}
