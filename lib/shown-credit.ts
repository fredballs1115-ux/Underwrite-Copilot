// A grid of market pictures owes ONE credit line under it, and the line
// names the pictures actually on screen (audit C9, L3): a tile whose
// photograph fails falls back to its market's USGS overhead (app/city-photo),
// and a line fixed in advance would still name the Commons photographer —
// naming the wrong one is a licence breach. Each tile reports what it
// settled on; this reads the reports. No imports but types, so the client
// line and its test read one rule.
import type { PhotoCredit } from "./credit-parts";

/** What a market tile is showing: its photograph, its overhead, or nothing. */
export type ShownMode = "skyline" | "aerial" | "none";

/** One market a grid pictures, as the server resolved it: its photograph's
 *  credit (null where it has none) and whether it has an overhead to fall
 *  back to. */
export interface GridPicture {
  id: string;
  skyline: PhotoCredit | null;
  overhead: boolean;
}

/** What a tile shows before it has said otherwise: the first picture
 *  `CityPhotoView` tries (the server's render, before any load settles). */
export function firstMode(p: GridPicture): ShownMode {
  return p.skyline ? "skyline" : p.overhead ? "aerial" : "none";
}

/**
 * The line's parts: the photographs shown, in the grid's order, and whether
 * any tile shows an overhead. `reports` is each tile's settled mode by its
 * market; a market no tile has reported for reads as its first picture.
 */
export function shownCredit(
  pictures: readonly GridPicture[],
  reports: ReadonlyMap<string, readonly ShownMode[]>,
): { photos: PhotoCredit[]; overhead: boolean } {
  const photos: PhotoCredit[] = [];
  let overhead = false;
  for (const p of pictures) {
    const modes = reports.get(p.id)?.length ? reports.get(p.id)! : [firstMode(p)];
    if (p.skyline && modes.includes("skyline")) photos.push(p.skyline);
    if (modes.includes("aerial")) overhead = true;
  }
  return { photos, overhead };
}
