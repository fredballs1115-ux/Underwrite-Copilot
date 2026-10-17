// A Census region's line in a market check's stored figures, read off the
// line itself — no imports, so the deal page's client fold and the shared
// screen can take it without lib/live-market-brief, which reaches the series
// table. lib/live-market-brief re-exports both readers.
//
// Research pass 41 said the region's rental vacancy line apart in the
// model's header and the verdict's brief; audit C4 (L7) found the deal
// page's fold, the report's heading and the shared screen's read still
// counting it among the metro's figures. Every surface that counts the
// stored lines reads them here.

/** How a Census region's rental vacancy line opens: "Rental vacancy, South
 *  Census region: 9.5% …". */
const REGION_LINE = /^Rental vacancy, ([^:]*\bCensus region):/;

/**
 * The Census region a stored line is for — "South Census region" — or null
 * for a line of the market's own or the nation's. A block's header, and the
 * verdict's brief over the stored lines, say a region's line apart from the
 * metro's, as they count the nation's lines apart (research pass 41: "each is
 * the metro area's" had stood over a South Census region line).
 */
export function regionOfLine(line: string): string | null {
  return REGION_LINE.exec(line)?.[1] ?? null;
}

/** " — save the rental vacancy line for the South Census region, which is
 *  the region's and says so" — or "" where no line is a region's. */
export function regionClause(lines: readonly string[]): string {
  const regions = [...new Set(lines.map(regionOfLine).filter((r): r is string => r != null))];
  if (regions.length === 0) return "";
  return ` — save the rental vacancy line for the ${regions.join(" and the ")}, which is the region's and says so`;
}

/**
 * Whose a block's stored lines are, counted: the market's own (`own`, "the
 * metro's"), each Census region's, and the last `national` the nation's —
 * one part a holder with lines, in that order: ["1 the metro's", "1 the
 * South Census region's", "1 the nation's"]. `apostrophe` is the surface's
 * own (the deal page writes ’). A block of one holder is one part.
 */
export function figureHolders(
  lines: readonly string[],
  national: number | null | undefined,
  own: string,
  apostrophe = "'",
): string[] {
  const n = lines.length;
  const nat = Math.min(Math.max(national ?? 0, 0), n);
  const local = lines.slice(0, n - nat);
  const byRegion = new Map<string, number>();
  for (const line of local) {
    const region = regionOfLine(line);
    if (region) byRegion.set(region, (byRegion.get(region) ?? 0) + 1);
  }
  const regional = [...byRegion.values()].reduce((a, b) => a + b, 0);
  const parts: string[] = [];
  if (local.length - regional > 0) parts.push(`${local.length - regional} ${own}`);
  for (const [region, count] of byRegion) parts.push(`${count} the ${region}${apostrophe}s`);
  if (nat > 0) parts.push(`${nat} the nation${apostrophe}s`);
  return parts;
}

/** "a, b and c" — the parts of a count joined as a sentence lists them. */
export function andList(parts: readonly string[]): string {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
