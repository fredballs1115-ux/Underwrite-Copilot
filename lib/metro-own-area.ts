import type { MetroSeriesMeta } from "@/lib/live-rates";

/**
 * Whose figure a market's live tile shows.
 *
 * A tile borrowed from the metro area (a suburb's payrolls) or the Census
 * region (the region's rental vacancy) always named its area. A tile filed
 * under the market itself never did, and two kinds of them are not the
 * market's own (the research pass of 2026-10-01): Northern Virginia's one
 * series of its own is Fairfax County's unemployment, while the panel's note
 * told a reader an untagged tile is Northern Virginia's; and several metro
 * areas' house prices are FHFA's index for one DIVISION of the metro area
 * ("Philadelphia division", "Newark division"), not the metro area the other
 * tiles are for. Pure.
 */

/**
 * The area the market's own figures are for — the one most of its own
 * series carry — where that area IS the market: a metro area (a market page
 * of a metro area is that area's), or a county the market's own name names
 * ("Prince George's County" for Prince George's County MD). Null where the
 * market's own figures are some other area's (Northern Virginia's are
 * Fairfax County's, Newark's the Newark division's), so every tile says
 * whose it is.
 */
export function marketOwnArea(
  metas: readonly Pick<MetroSeriesMeta, "metro" | "area">[],
  metroId: string,
  metroName: string,
): string | null {
  const counts = new Map<string, number>();
  for (const m of metas) if (m.metro === metroId) counts.set(m.area, (counts.get(m.area) ?? 0) + 1);
  let best: string | null = null;
  for (const [area, n] of counts) if (best === null || n > counts.get(best)!) best = area;
  if (best === null) return null;
  if (/\bMSA$/.test(best)) return best;
  return metroName.toLowerCase().startsWith(best.toLowerCase()) ? best : null;
}

/** Whether a tile names its area: a borrowed figure always; a figure filed
 *  under the market wherever its area is not the market's own. */
export function namesItsArea(meta: Pick<MetroSeriesMeta, "metro" | "area">, metroId: string, ownArea: string | null): boolean {
  if (meta.metro !== metroId) return true;
  return ownArea === null || meta.area !== ownArea;
}
