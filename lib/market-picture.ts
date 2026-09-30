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
// from (`metroAliasOf`). A deal in a metro area the site reads no figures
// for wears that metro area's own photograph where one has been chosen
// (#472), keyed by its Census code (`areaSkylineId`) and reached through the
// county the deal sits in. Outside every photographed place there is
// nothing to borrow, and the deal's drawn cover stays the picture.
//
// Pure: the page resolves it server-side and hands the card a plain source.

import type { StructuredAddress } from "@/lib/address";
import { metroAliasOf } from "@/lib/live-rates";
import { dataMetroForAddress, metroForAddress, metroForName } from "@/lib/market-match";
import { marketPageFor } from "@/lib/public-pages";
import { areaSkylineId, photographerLine, SKYLINE_WIDTH, skylineFor, skylineTag, type SkylineShot } from "@/lib/skyline";

/**
 * The width a card asks the skyline route for. The files are panoramas, up
 * to 2.5:1, and a 16:10 card crops them to its own shape, so it is the
 * picture's HEIGHT that has to cover the card: a phone's full-width card is
 * about 224px tall, 672 device pixels at 3x, which a 2.5:1 panorama only
 * reaches at 1,680px wide. At 1280 (the link previews' width, #436) it was
 * stretched 1.3x on every phone, soft where the site promises a crisp
 * picture (#446); at 1600 the stretch is 1.05x, which no eye sees.
 */
export const MARKET_PHOTO_WIDTH = 1600;

/** A phone's full-width card at 3x, in device pixels tall (#475): what the
 *  picture's height has to reach. */
export const CARD_DEVICE_HEIGHT = 672;

/**
 * The width a card asks for a photograph whose size the table knows: the
 * route's widest step, 2400 (a width it already serves in every srcset,
 * SKYLINE_SRCSET), where 1600 would leave a panorama cut to the card by its
 * height short of a phone card's 672 device pixels — Louisville's 4.2:1
 * river panorama is 383px tall at 1600 wide and 574 at 2400 — and 1600
 * otherwise, as for a photograph whose size is not recorded.
 */
export function marketPhotoWidth(shot: Pick<SkylineShot, "size">): number {
  const [w, h] = shot.size ?? [0, 0];
  if (!(w > 0 && h > 0)) return MARKET_PHOTO_WIDTH;
  return Math.round((MARKET_PHOTO_WIDTH * h) / w) < CARD_DEVICE_HEIGHT && w > MARKET_PHOTO_WIDTH
    ? SKYLINE_WIDTH.max
    : MARKET_PHOTO_WIDTH;
}

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
 *
 * `placed` is where a server page has already placed the deal
 * (lib/market-county's `placeDeal`: its briefed market, else the metro area
 * whose figures it reads — reached by its county where its address names no
 * place a market's keywords know, #447). Given, it stands in for the address
 * matchers, so a Frisco deal wears the Dallas-Fort Worth photograph its
 * figures are read for, and a Kingston, WA deal — in Kitsap County, not
 * Seattle's metro area — does not wear Seattle's.
 */
export function marketPictureFor(
  address: Partial<StructuredAddress> | null,
  marketText?: string | null,
  placed?: { id: string; name: string } | null,
  county?: { cbsa: string | null; area: string | null } | null,
): MarketPicture | null {
  const addr = address ?? {};
  const fromAddress = placed !== undefined ? placed : (metroForAddress(addr) ?? dataMetroForAddress(addr));
  const market = fromAddress ?? metroForName(marketText ?? null);
  for (const id of market ? [market.id, metroAliasOf(market.id)] : []) {
    if (!id) continue;
    const shot = skylineFor(id);
    if (!shot) continue;
    return picture(id, marketPageFor(id)?.name ?? market!.name, shot);
  }
  // The metro area the deal's county sits in, where the site reads no
  // figures for it but has chosen its photograph (#472), under the name the
  // table gives it, else the delineation's own title.
  if (county?.cbsa) {
    const id = areaSkylineId(county.cbsa);
    const shot = skylineFor(id);
    if (shot) return picture(id, shot.name ?? county.area ?? "", shot);
  }
  return null;
}

function picture(id: string, name: string, shot: SkylineShot): MarketPicture {
  return {
    id,
    name,
    place: shot.place,
    src: `/api/imagery/skyline/${encodeURIComponent(id)}?w=${marketPhotoWidth(shot)}&v=${skylineTag(id)}`,
    credit: photographerLine(shot),
  };
}
