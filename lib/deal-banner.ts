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
// pictures, not maps, and an overhead at card size reads as a map — so the
// pipeline now leaves the aerial out altogether (`aerial: false`, #442) and
// draws the deal's cover (lib/deal-cover) where no photograph answers, on
// the card and on the list row's thumbnail (the THUMB frame, which takes
// the stored 240px crop of the deal's own photograph). The compare page
// passes no market and keeps the aerial: two columns in one market would
// show one skyline twice, where their overheads tell the buildings apart.

import { IMAGE_CREDIT } from "@/lib/imagery-plan";
import { withOsmLocation } from "@/lib/basemaps";
import { DEAL_BANNER, DEAL_CARD, DEAL_THUMB } from "@/lib/image-frames";
import { isPreview } from "@/lib/photo-preview";
import { cardSrcSet, coverSlotSizes, type StoredPhotoSizes } from "@/lib/photo-srcset";
import type { MarketPicture } from "@/lib/market-picture";
import type { PhotoCredit } from "@/lib/credit-parts";

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
  /** a market photograph's table id (lib/skyline), for the page's one
   *  credit line with the photographer's and the licence's links */
  marketId?: string;
  /** a market photograph's credit as data — what it shows, its photographer
   *  and its licence, each linked — so the page's one credit line is drawn
   *  in the browser without lib/skyline's table (research pass 25) */
  marketCredit?: PhotoCredit;
  /** a market photograph's alt text: what it shows, and whose it is */
  alt?: string;
  /** the deal's own photograph, not yet looked for in its memorandum
   *  (#440): the next source shows at once and this one takes over the
   *  moment it loads, or is dropped if the route has none */
  pending?: boolean;
  /** the photograph's blur-up preview (#463, lib/photo-preview): drawn
   *  blurred in the frame until the photograph has loaded whole */
  preview?: string;
  /** a stored photograph's card copy and its hero, each at its width
   *  (lib/photo-srcset `cardSrcSet`, research pass 29): the browser takes
   *  the copy wherever the card's slot allows. `src` stays the hero, the
   *  source's identity */
  srcSet?: string;
  /** the photograph's shape, width over height, so a panorama's `sizes` says
   *  the width it is drawn at to cover the card (lib/photo-srcset
   *  `coverSlotSizes`) */
  aspect?: number;
}

/**
 * A stored photograph's card copy as a source carries it: the srcset of its
 * card copy and its hero, and its shape — for the deal's own photograph and
 * each gallery photograph a card flips to (`g`, from 1). Nothing where the
 * hero is no longer than a card copy, or its sizes are not known.
 */
export function cardPictureSet(
  dealId: string,
  sizes: StoredPhotoSizes | null | undefined,
  version?: string | null,
  g?: number,
): Pick<BannerSource, "srcSet" | "aspect"> {
  const id = encodeURIComponent(dealId);
  const at = g ? `&g=${g}` : "";
  const srcSet = cardSrcSet((size) => `/api/deals/${id}/picture?size=${size}${at}${versionQuery(version)}`, sizes);
  if (!srcSet) return {};
  const w = sizes?.width ?? 0;
  const h = sizes?.height ?? 0;
  return { srcSet, aspect: Math.round((w / h) * 1000) / 1000 };
}

/**
 * The `sizes` a source's picture is asked with: the slot's, where it offers
 * one width; and where it offers a srcset, the width it is drawn at to cover
 * a frame of `frameAspect` — wider than the slot for a panorama, so the
 * browser never takes the card copy and stretches it. One rule for the
 * card's picture and for the card's asking ahead for the next photograph.
 */
export function bannerSizes(source: BannerSource, slot: string | undefined, frameAspect: number): string | undefined {
  if (!slot || !source.srcSet || !source.aspect) return slot;
  return coverSlotSizes(slot, source.aspect, frameAspect);
}

export interface BannerFacts {
  dealId: string;
  /** the deal's own photograph's credit (lib/deal-picture's
   *  PICTURE_CREDIT, resolved server-side) — null where it has none */
  pictureCredit: string | null;
  /** its blur-up preview, where the photo cache holds one (#463) */
  picturePreview?: string | null;
  /** the stored photograph's version (`pictureVersion`): carried in its
   *  URL, so the browser keeps the picture until it is replaced */
  pictureVersion?: string | null;
  /** the stored photograph's sizes, where the surface offers its card copy
   *  beside the hero (the pipeline's cards, research pass 29): its hero's
   *  width and height and its card copy's width */
  pictureSizes?: StoredPhotoSizes | null;
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
  /** the aerial's centre is the building's own point (lib/deal-location
   *  `pointIsBuilding`): only then is it ringed. Absent, the street address
   *  decides, as it did before the point's precision was read. */
  pointIsBuilding?: boolean;
  /** Photon — a geocoder on OpenStreetMap's data — placed the point the
   *  aerial is framed on (lib/deal-location `placedByOpenStreetMap`): its
   *  credit names OpenStreetMap too (the batch-2 audit, LOW-8) */
  osmPlaced?: boolean;
  /** the deal has an address at all — without one there is no overhead */
  hasAddress: boolean;
  /** the photograph of the deal's market, tried before the aerial — the
   *  pipeline's cards only (#438); absent, the aerial follows Street View */
  market?: MarketPicture | null;
  /** whether the overhead is tried at all. The pipeline says no (#442): its
   *  rule is pictures, not maps, and where no photograph answers it draws
   *  the deal's cover instead. The compare page keeps it, where two
   *  columns' overheads tell two buildings apart. */
  aerial?: boolean;
}

/** An overhead's frame: its size in pixels and, where the surface sets one,
 *  the zoom it is drawn at (the route's own per-width zoom otherwise). */
export interface BannerFrame {
  w: number;
  h: number;
  z?: number;
}

/** The overhead's frame at card size: 16:9, twice a 320px column for a
 *  sharp picture on a dense screen. Each frame here is lib/image-frames' —
 *  the aerial route draws those frames and no others. */
export const BANNER: BannerFrame = DEAL_BANNER;

/** The pipeline's cards (#428): 16:10, twice a 360px card. */
export const CARD: BannerFrame = DEAL_CARD;

/** A list row's thumbnail (#442): square, three times a phone's 56px slot. */
export const THUMB: BannerFrame = DEAL_THUMB;

/** The market photograph a card leads with before anything has loaded: its
 *  first source, a pending memorandum photograph aside (that one is asked
 *  for OVER the next and shows only once it loads). */
export function leadMarketId(sources: BannerSource[]): string | null {
  const lead = sources.find((s) => !s.pending);
  return lead?.kind === "market" ? (lead.marketId ?? null) : null;
}

/** The market photographs on screen, for the page's one credit line (#438),
 *  in the cards' order, each once: a card's own report where it has made
 *  one (the picture it settled on — a market photograph that failed, or one
 *  a memorandum photograph loaded over, is no longer on screen, and its
 *  photographer is not credited for it), else the photograph it leads with,
 *  which is what the server drew. */
export function shownMarketIds(
  cards: { id: string; pictures?: BannerSource[] }[],
  reported: ReadonlyMap<string, string | null>,
): string[] {
  const out: string[] = [];
  for (const c of cards) {
    const id = reported.has(c.id) ? (reported.get(c.id) ?? null) : leadMarketId(c.pictures ?? []);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The credits of the market photographs on screen (`shownMarketIds`), in
 *  the same order: each read off a card's own market source, so the line is
 *  built from what the cards carry and never from the table. */
export function shownMarketCredits(
  cards: { id: string; pictures?: BannerSource[] }[],
  reported: ReadonlyMap<string, string | null>,
): PhotoCredit[] {
  const byId = new Map<string, PhotoCredit>();
  for (const c of cards) {
    for (const p of c.pictures ?? []) {
      if (p.kind === "market" && p.marketId && p.marketCredit && !byId.has(p.marketId)) byId.set(p.marketId, p.marketCredit);
    }
  }
  return shownMarketIds(cards, reported)
    .map((id) => byId.get(id))
    .filter((c): c is PhotoCredit => c !== undefined);
}

/**
 * A stored photograph's version: the stamp its files are stored under
 * (`photos/<dealId>/<stamp>-<size>.jpg`, lib/storage-paths). Every picture
 * the site stores — a memorandum's cover, a gallery photograph, an upload, a
 * derivation under new rules — is written under a stamp of its own, so the
 * stamp is the picture's identity. Carried in the picture's URL (`v`), it
 * lets the route answer a matching request as never changing: research
 * pass 25 found every card on the pipeline asking its picture again on
 * every view, each answer a revalidation behind a sign-in check and a read
 * of the deal. Null for a path not of that shape.
 */
export function pictureVersion(path: string | null | undefined): string | null {
  const m = /\/([A-Za-z0-9]+)-(?:hero|thumb|full|card)\.jpg$/.exec(path ?? "");
  return m ? m[1] : null;
}

/** `&v=<version>`, or nothing where the picture has none. */
function versionQuery(version: string | null | undefined): string {
  return version ? `&v=${encodeURIComponent(version)}` : "";
}

export function bannerSources(f: BannerFacts, frame: BannerFrame = BANNER): BannerSource[] {
  const id = encodeURIComponent(f.dealId);
  const out: BannerSource[] = [];
  // A thumbnail's frame takes the stored 240px crop; anything larger the hero.
  const size = frame.w <= 240 && frame.h <= 240 ? "thumb" : "hero";
  if (f.pictureCredit) {
    out.push({
      kind: "photo",
      src: `/api/deals/${id}/picture?size=${size}${versionQuery(f.pictureVersion)}`,
      credit: f.pictureCredit,
      ...(isPreview(f.picturePreview) ? { preview: f.picturePreview } : {}),
      // The card copy beside the hero, where the surface handed the sizes
      // over (research pass 29); a row's thumbnail is its own crop.
      ...(size === "hero" ? cardPictureSet(f.dealId, f.pictureSizes, f.pictureVersion) : {}),
    });
  }
  else if (f.memorandumUnread) {
    out.push({ kind: "photo", src: `/api/deals/${id}/picture?size=${size}`, credit: IMAGE_CREDIT.photo, pending: true });
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
      marketId: f.market.id,
      marketCredit: { place: f.market.place, author: f.market.author, license: f.market.license },
      alt: `${f.market.place}: the market this deal is in, ${f.market.name}. No photograph of the building yet.`,
    });
  }
  if (f.hasAddress && f.aerial !== false) {
    const z = frame.z != null ? `&z=${frame.z}` : "";
    out.push({
      kind: "aerial",
      src: `/api/deals/${id}/aerial?src=usgs&w=${frame.w}&h=${frame.h}${z}`,
      credit: withOsmLocation(IMAGE_CREDIT.aerial, f.osmPlaced === true),
      ...((f.pointIsBuilding ?? f.hasStreetAddress) ? { marker: true } : {}),
    });
  }
  return out;
}
