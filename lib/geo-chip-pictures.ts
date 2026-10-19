// The buy box page's covered-market chips, each with a thumbnail of its
// market's photograph (lib/skyline) — the one its market page opens on, a
// suburb with no photograph of its own borrowing its metro's
// (`metroAliasOf`, as lib/market-picture does for a pipeline card).
//
// Built on the server and handed to the geography picker, a client
// component, as plain data: the picture's URL and its credit's parts
// (lib/credit-parts), so the skyline table never reaches the browser
// (lib/client-bundle-tables.test.ts). The picker draws the credit as one
// line under the chips (lib/credit-parts `galleryCreditLineOf`).

import metrosSeed from "@/data/research/metros.json";
import { metroAliasOf } from "@/lib/live-rates";
import { skylineCredit, skylineFor, skylineTag } from "@/lib/skyline";
import type { PhotoCredit } from "@/lib/credit-parts";

/** One chip's picture: the skyline route at its smallest served width,
 *  versioned by the file, and the photograph's credit as data. */
export interface ChipPicture {
  src: string;
  credit: PhotoCredit;
  /** where the chip's market has no photograph of its own and wears its
   *  metro's: the title saying whose photograph it is ("Washington DC's
   *  photograph: Montgomery County MD has none of its own"), so it never
   *  passes for the suburb's */
  title?: string;
}

/** The width a chip's thumbnail is asked at: the skyline route's smallest
 *  step (lib/skyline `SKYLINE_WIDTHS`), since a chip draws it a few pixels
 *  wide and any other width is snapped to a step anyway. */
export const CHIP_PICTURE_WIDTH = 480;

/**
 * Each covered market's picture, keyed by the name its chip wears — the
 * market's own name, as lib/market-match `coveredMarketGeoTargets` labels
 * the chip. A market with no photograph of its own or its metro's has none.
 */
export function coveredMarketChipPictures(): Record<string, ChipPicture> {
  const out: Record<string, ChipPicture> = {};
  for (const m of metrosSeed.metros ?? []) {
    const label = m.name as string;
    for (const id of [m.id, metroAliasOf(m.id)]) {
      if (!id) continue;
      const shot = skylineFor(id);
      if (!shot) continue;
      const lender = id === m.id ? null : (metrosSeed.metros ?? []).find((x) => x.id === id);
      out[label] = {
        src: `/api/imagery/skyline/${encodeURIComponent(id)}?w=${CHIP_PICTURE_WIDTH}&v=${skylineTag(id)}`,
        credit: skylineCredit(shot),
        ...(id !== m.id
          ? { title: `${(lender?.name as string | undefined) ?? shot.name ?? id}'s photograph: ${label} has none of its own` }
          : {}),
      };
      break;
    }
  }
  return out;
}
