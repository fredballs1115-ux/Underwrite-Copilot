// Which pictures of a building to try, in order, on a surface that shows
// one picture per deal at card size — the compare page's columns (#418).
//
// Pure and universal: the page resolves the facts server-side (whether the
// deal has its own photograph and what it is credited as, whether the
// Google key is configured, how precise the address is) and hands the
// client component a plain list. Each entry pins ONE source, so the credit
// printed on it is exactly the picture on screen — the component advances
// to the next entry when one fails to load and the credit follows
// (CityPhoto's rule: naming the wrong source is a licence breach, and
// crediting USGS for a Google frame drops an attribution Google requires).
//
// The order is `imagePlan`'s: the deal's own photograph (the cover of its
// memorandum, or the reader's), then Street View where a key exists and the
// address reaches the street, then the USGS aerial wherever there is an
// address. Nothing else — never a stock photo, never another building. The
// Google satellite frame is left to the deal page's own tab: at card size an
// overhead is an overhead, and the keyless USGS one needs no second key.
//
// The pipeline's cards put ONE more source before the aerial (#438): the
// photograph the deal's market is known by (lib/market-picture), named on
// the picture as the market's. The operator's rule for the pipeline is
// pictures, not maps, and an overhead at card size reads as a map; the
// aerial stays behind it, for a market whose photograph fails to load and
// for a deal outside every photographed market. The compare page passes no
// market: two columns in one market would show one skyline twice, where
// their overheads tell the buildings apart.

import { IMAGE_CREDIT } from "@/lib/imagery-plan";
import type { MarketPicture } from "@/lib/market-picture";

export interface BannerSource {
  src: string;
  credit: string;
  kind: "photo" | "streetview" | "market" | "aerial";
  /** an overhead centred on a street address: the picture wears a ring at
   *  its centre, which is the building. Never on a placement vaguer than a
   *  street, whose centre is a district's, not a building's. */
  marker?: boolean;
  /** a market photograph's market, named on the picture so it never
   *  passes for the building (#438) */
  market?: string;
  /** a market photograph's alt text: what it shows, and whose it is */
  alt?: string;
  /** the deal's own photograph, not yet looked for in its memorandum
   *  (#440): the next source shows at once and this one takes over the
   *  moment it loads, or is dropped if the route has none */
  pending?: boolean;
}

export interface BannerFacts {
  dealId: string;
  /** the deal's own photograph's credit (lib/deal-picture's
   *  PICTURE_CREDIT, resolved server-side) — null where it has none */
  pictureCredit: string | null;
  /** no picture is cached but the deal's memorandum may hold one nobody has
   *  looked for (lib/deal-picture `pictureMayBeInMemorandum`): the picture
   *  route lifts the cover on this first ask, or answers 404 and the next
   *  source follows. Only the memorandum can be uncached — a picture the
   *  reader added is stored the moment it is added — so the credit is the
   *  memorandum's. */
  memorandumUnread?: boolean;
  /** GOOGLE_MAPS_API_KEY is set in this deployment */
  googleEnabled: boolean;
  /** the address reaches a street — Street View at a district centroid
   *  photographs some arbitrary block */
  hasStreetAddress: boolean;
  /** the deal has an address at all — without one there is no overhead */
  hasAddress: boolean;
  /** the photograph of the deal's market, tried before the aerial — the
   *  pipeline's cards only (#438); absent, the aerial follows Street View */
  market?: MarketPicture | null;
}

/** An overhead's frame: its size in pixels and, where the surface sets one,
 *  the zoom it is drawn at (the route's own per-width zoom otherwise). */
export interface BannerFrame {
  w: number;
  h: number;
  z?: number;
}

/** The overhead's frame at card size: 16:9, twice a 320px column for a
 *  sharp picture on a dense screen. */
export const BANNER: BannerFrame = { w: 640, h: 360 };

/** The pipeline's cards (#428): 16:10, twice a 360px card. */
export const CARD: BannerFrame = { w: 720, h: 450 };

export function bannerSources(f: BannerFacts, frame: BannerFrame = BANNER): BannerSource[] {
  const id = encodeURIComponent(f.dealId);
  const out: BannerSource[] = [];
  if (f.pictureCredit) out.push({ kind: "photo", src: `/api/deals/${id}/picture?size=hero`, credit: f.pictureCredit });
  else if (f.memorandumUnread) {
    out.push({ kind: "photo", src: `/api/deals/${id}/picture?size=hero`, credit: IMAGE_CREDIT.photo, pending: true });
  }
  if (f.googleEnabled && f.hasStreetAddress) {
    out.push({ kind: "streetview", src: `/api/deals/${id}/photo`, credit: IMAGE_CREDIT.streetview });
  }
  if (f.market) {
    out.push({
      kind: "market",
      src: f.market.src,
      credit: f.market.credit,
      market: f.market.name,
      alt: `${f.market.place}: the market this deal is in, ${f.market.name}. No photograph of the building yet.`,
    });
  }
  if (f.hasAddress) {
    const z = frame.z != null ? `&z=${frame.z}` : "";
    out.push({
      kind: "aerial",
      src: `/api/deals/${id}/aerial?src=usgs&w=${frame.w}&h=${frame.h}${z}`,
      credit: IMAGE_CREDIT.aerial,
      ...(f.hasStreetAddress ? { marker: true } : {}),
    });
  }
  return out;
}
