// The photograph of the place a deal sits in, for a pipeline card whose
// building has no picture of its own (#438).
//
// The operator's rule for the pipeline: pictures, not maps. A card leads
// with the building's own photograph (its memorandum's cover, or one the
// reader added), then Street View where the deployment has a Google key,
// and until #438 fell to the USGS aerial with the building ringed — which
// is a real photograph of the site and reads, at card size, as a map. So a
// card with nothing of the building's own now shows the photograph its
// market is known by: the verified skyline its market page opens on
// (lib/skyline), credited to its photographer, with the market named on the
// picture so it never passes for the building. A suburb with no photograph
// of its own (Montgomery County) shows the metro its figures are borrowed
// from (`metroAliasOf`). Outside every photographed market there is nothing
// to borrow, and the aerial stays the picture: the site itself, from above.
//
// Pure: the page resolves it server-side and hands the card a plain source.

import type { StructuredAddress } from "@/lib/address";
import { metroAliasOf } from "@/lib/live-rates";
import { dataMetroForAddress, metroForAddress, metroForName } from "@/lib/market-match";
import { marketPageFor } from "@/lib/public-pages";
import { photographerLine, skylineFor, skylineTag } from "@/lib/skyline";

/**
 * The width a card asks the skyline route for. The files are panoramas, up
 * to 2.5:1, and a 16:10 card crops them to its own shape, so the picture is
 * asked wide enough that its height still covers a card on a dense screen
 * without being upscaled — and at the width the market pages' link previews
 * already ask Commons for (#436), so the route's copy is shared.
 */
export const MARKET_PHOTO_WIDTH = 1280;

export interface MarketPicture {
  /** the market whose photograph it is (the skyline table's key) */
  id: string;
  /** the market's name as the site names it: "Pittsburgh PA" */
  name: string;
  /** what the photograph shows, for the alt text: "Downtown Pittsburgh seen
   *  from Mt. Washington" */
  place: string;
  /** the skyline route, versioned by the file so a changed photograph is
   *  fetched anew */
  src: string;
  /** the photographer and the licence, which the licence obliges */
  credit: string;
}

/**
 * The market photograph for a deal, from its address (the briefed markets,
 * then the metro areas read without a brief) or, with no address to read,
 * the market the memorandum names — only where the text says which market
 * it is (`metroForName`: a bare city is never read). Null where no
 * photographed market answers.
 */
export function marketPictureFor(
  address: Partial<StructuredAddress> | null,
  marketText?: string | null,
): MarketPicture | null {
  const addr = address ?? {};
  const market = metroForAddress(addr) ?? dataMetroForAddress(addr) ?? metroForName(marketText ?? null);
  if (!market) return null;
  for (const id of [market.id, metroAliasOf(market.id)]) {
    if (!id) continue;
    const shot = skylineFor(id);
    if (!shot) continue;
    return {
      id,
      name: marketPageFor(id)?.name ?? market.name,
      place: shot.place,
      src: `/api/imagery/skyline/${encodeURIComponent(id)}?w=${MARKET_PHOTO_WIDTH}&v=${skylineTag(id)}`,
      credit: photographerLine(shot),
    };
  }
  return null;
}
