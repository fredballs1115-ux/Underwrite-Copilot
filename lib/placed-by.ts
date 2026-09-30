// How a deal's county placed it in a market (#447), said the same way on
// every surface that heads the market check's figures: the market check's
// own header, the deal page's fold, the shared screen, the report and the
// verdict's brief. No imports, so a client component can take it without the
// series table riding along.

/** "Collin County, TX" in "Dallas-Fort Worth-Arlington, TX" (lib/market-county). */
export interface CountyPlacedBy {
  county: string;
  area: string;
}

/** " — placed there by its county: Collin County, TX, which the Census
 *  Bureau files in the Dallas-Fort Worth-Arlington, TX metro area"; nothing
 *  where the address named the market. */
export function placedByClause(p: CountyPlacedBy | null | undefined): string {
  return p ? ` — placed there by its county: ${p.county}, which the Census Bureau files in the ${p.area} metro area` : "";
}

/** The same said as a sentence of its own, for a heading that already ends
 *  in one (the report, the verdict's brief); nothing where the address named
 *  the market. Plain punctuation, so the report's Helvetica can set it. */
export function placedBySentence(p: CountyPlacedBy | null | undefined): string {
  return p
    ? ` The deal was placed in this market by its county: ${p.county}, which the Census Bureau files in the ${p.area} metro area. Its address names no place the market's own list does, so these are the metro area's figures, not the county's.`
    : "";
}
