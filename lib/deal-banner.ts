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

import { IMAGE_CREDIT } from "@/lib/imagery-plan";

export interface BannerSource {
  src: string;
  credit: string;
  kind: "photo" | "streetview" | "aerial";
}

export interface BannerFacts {
  dealId: string;
  /** the deal's own photograph's credit (lib/deal-picture's
   *  PICTURE_CREDIT, resolved server-side) — null where it has none */
  pictureCredit: string | null;
  /** GOOGLE_MAPS_API_KEY is set in this deployment */
  googleEnabled: boolean;
  /** the address reaches a street — Street View at a district centroid
   *  photographs some arbitrary block */
  hasStreetAddress: boolean;
  /** the deal has an address at all — without one there is no overhead */
  hasAddress: boolean;
}

/** The overhead's frame at card size: 16:9, twice a 320px column for a
 *  sharp picture on a dense screen. */
export const BANNER = { w: 640, h: 360 };

export function bannerSources(f: BannerFacts): BannerSource[] {
  const id = encodeURIComponent(f.dealId);
  const out: BannerSource[] = [];
  if (f.pictureCredit) out.push({ kind: "photo", src: `/api/deals/${id}/picture?size=hero`, credit: f.pictureCredit });
  if (f.googleEnabled && f.hasStreetAddress) {
    out.push({ kind: "streetview", src: `/api/deals/${id}/photo`, credit: IMAGE_CREDIT.streetview });
  }
  if (f.hasAddress) {
    out.push({ kind: "aerial", src: `/api/deals/${id}/aerial?src=usgs&w=${BANNER.w}&h=${BANNER.h}`, credit: IMAGE_CREDIT.aerial });
  }
  return out;
}
