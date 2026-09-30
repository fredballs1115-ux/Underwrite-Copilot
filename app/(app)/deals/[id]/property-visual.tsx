"use client";

import { useState } from "react";
import { FLOOD_ZOOM } from "@/lib/basemaps";
import type { MarketPicture } from "@/lib/market-picture";
import { MarketCaption } from "../market-caption";
import { PhotoViewer, type ViewerFrame } from "./photo-viewer";
import { PropertyMap } from "./property-map";
import { ReplacePicture } from "./replace-picture";
import { previewStyle } from "@/lib/photo-preview";

/**
 * The real property, at the top of its deal page: the building's OWN
 * photograph where the deal has one — the cover of its memorandum, lifted
 * out of the file, or the picture the reader put there — then a
 * street-level photograph where one exists, a sharp satellite frame, the
 * keyless USGS aerial, and an interactive map. Every one a real view of the
 * same real place, no illustration.
 *
 * Each tab pins ONE source (`?src=`, or its own route) rather than taking
 * best-available, so its credit line is always exactly what is on screen:
 * crediting Google for a USGS frame is sloppy, and crediting USGS for a
 * Google frame drops an attribution Google requires.
 *
 * The Photo tab leads whenever the deal has a picture of its own, because a
 * photograph taken to sell the building is what "a picture of this
 * property" means; the Street tab leads next where it can; the aerial leads
 * when it is the best picture available, which is a deal with no
 * memorandum and no Google key.
 *
 * Sourcing is unchanged from the site-polish rule: only imagery OF this
 * property, from a source we may use. The photograph came out of the deal's
 * own file or the reader's own hand; aerial is USGS (public domain); Street
 * is Google Street View and only exists when GOOGLE_MAPS_API_KEY is
 * configured — `googleEnabled` is that check, resolved server-side, so the
 * browser never probes a route that can't answer.
 *
 * Every view degrades to nothing rather than to a placeholder: if nothing
 * loads, the whole card unmounts and the page reads exactly as it did
 * before. No stock photos, no AI imagery, no "photo unavailable" graphic.
 *
 * The views are a filmstrip under the picture (#432) — each one's own
 * picture under its name, the one on screen ringed — where they were a row
 * of words: a thumbnail draws the very URL its view draws, so it costs no
 * request of its own, and one that fails takes its view away.
 *
 * It is the deal header's picture (#433, `DealHero`): no card of its own,
 * beside the name and the figures where the header is wide and above them
 * where it is not, with the reader's Replace photo on the picture itself.
 *
 * The Flood tab (#425) is the USGS aerial at a wider frame with FEMA's flood
 * zones drawn over it in FEMA's own colours — the two images asked for the
 * same location, zoom and size, so they share one Web-Mercator frame — with
 * a ring at the frame's centre, which is the building, FEMA's key under it
 * and one sentence on the zone at the building. Only for a street address:
 * a neighbourhood placement's centre is not the building.
 *
 * Where the deal has no photograph of the building's own and no Street View,
 * the picture leads with the photograph its market is known by (#439), the
 * one its pipeline card shows (#438): named on its face as the market's,
 * never passed for the building, with the aerial, the flood map and the map
 * one step along the filmstrip. The reader's "Add photo" sits on it.
 *
 * Every picture opens full screen (#445, `PhotoViewer`): a click on it, or
 * the expand control at its top left, shows the views one at a time at the
 * largest size the site holds them, each with its own credit, the overheads
 * at a taller frame than the header's band.
 *
 * The memorandum's other photographs follow the cover (#448, `gallery`),
 * each a view of its own in the filmstrip and the viewer, credited with its
 * page, and a count on the picture says how many there are. Each one's
 * full-size picture is asked for only once its view is opened; the
 * filmstrip draws the stored 240px crops. None of them ever leads: past the
 * cover a memorandum's photograph may be the neighbourhood.
 *
 * Where the deal has its own cover and two more photographs, the cover opens
 * as a mosaic from the header's 42rem up (#458), the way a listing does: the
 * cover across two thirds of the frame and the next two stacked beside it,
 * each asked for at the cover's size (lazily, since a phone keeps the one
 * picture), each credited, each opening the viewer at itself, the last saying
 * how many more there are.
 */

/** A view's id: the fixed views, and the memorandum's other photographs
 *  as `g1`, `g2`… (#448). */
type View = "photo" | "street" | "market" | "satellite" | "aerial" | "flood" | "map" | `g${number}`;

const AERIAL = { w: 1280, h: 576 }; // the route's max width
/** The overheads' frame in the full-screen viewer: the route's width, 4:3. */
const VIEWER = { w: 1280, h: 960 };

/** Every view's frame, read against the deal header it sits in (#433): 16:9
 *  on a phone, a wider band where the header stacks at a tablet's width (so
 *  the name and the figures stay on the first screen), and 16:9 again in the
 *  split, where the picture takes the left of the header. */
const FRAME = "aspect-[16/9] @2xl:aspect-[21/9] @3xl:aspect-[16/9]";

/** The mosaic (#458): the same frame split the way a listing opens — the
 *  cover across two thirds, two more photographs stacked beside it — from
 *  the header's 42rem up; a phone keeps the one picture. */
const MOSAIC =
  "@2xl:grid @2xl:aspect-[21/9] @3xl:aspect-[16/9] @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @2xl:gap-0.5";
/** The cover inside the mosaic: the frame's own shape on a phone, the
 *  mosaic's full height beside the tiles. */
const MOSAIC_COVER = "aspect-[16/9] @2xl:aspect-auto @2xl:h-full";

export function PropertyVisual({
  dealId,
  label,
  hasStreetAddress,
  googleEnabled,
  hasAddress = true,
  picture = null,
  canReplace = true,
  flood = null,
  market = null,
  gallery = [],
}: {
  dealId: string;
  /** the deal's address line — the caption, and the map pin's tooltip */
  label: string;
  /** street-level imagery is only honest for a street-level address */
  hasStreetAddress: boolean;
  /** GOOGLE_MAPS_API_KEY is set (checked server-side) — unlocks the Street
   *  photo AND the sharp satellite frame, which are separate Google APIs */
  googleEnabled: boolean;
  /** the deal has an address at all — without one there is no overhead and no map */
  hasAddress?: boolean;
  /** the deal's own photograph, with what it is credited as and its
   *  blur-up preview (#463); null for none */
  picture?: { credit: string; source: "om" | "upload"; preview?: string | null } | null;
  /** the reader may put their own picture on the deal (never on the sample) */
  canReplace?: boolean;
  /** the Flood tab's key and sentence (lib/site-flags `floodKey`,
   *  `floodZoneLine`); null for no Flood tab */
  flood?: {
    key: { label: string; image: string | null; here: boolean }[];
    line: string | null;
  } | null;
  /** the photograph the deal's market is known by (lib/market-picture),
   *  leading only where the deal has no photograph of its own and no
   *  Street View (#439); null for none */
  market?: MarketPicture | null;
  /** the memorandum's other photographs, in page order, each with its
   *  credit (#448); served as `?g=1`, `?g=2`… */
  gallery?: { page: number | null; credit: string; preview?: string | null }[];
}) {
  // Lead with the building's own photograph wherever one exists; the
  // aerial leads only when it is the best picture available.
  const canStreet = hasAddress && hasStreetAddress && googleEnabled;
  const [view, setView] = useState<View>(picture ? "photo" : canStreet ? "street" : market ? "market" : "aerial");
  const [photoGone, setPhotoGone] = useState(false);
  const [aerialGone, setAerialGone] = useState(!hasAddress);
  const [streetGone, setStreetGone] = useState(false);
  const [satelliteGone, setSatelliteGone] = useState(false);
  const [floodGone, setFloodGone] = useState(false);
  const [marketGone, setMarketGone] = useState(false);
  const [viewing, setViewing] = useState<View | null>(null);
  // The gallery photographs that failed to load, by their 1-based index, and
  // the views opened so far: a gallery photograph's full-size picture is
  // asked for only once its view is, then kept mounted for the way back.
  const [galleryGone, setGalleryGone] = useState<ReadonlySet<number>>(new Set());
  const [opened, setOpened] = useState<ReadonlySet<View>>(new Set());
  const choose = (v: View) => {
    setView(v);
    setOpened((o) => (o.has(v) ? o : new Set(o).add(v)));
  };
  const loseGallery = (i: number) => setGalleryGone((g) => (g.has(i) ? g : new Set(g).add(i)));

  const photoPossible = !!picture && !photoGone;
  const galleryLive = gallery
    .map((g, k) => ({ ...g, i: k + 1, id: `g${k + 1}` as View }))
    .filter((g) => !galleryGone.has(g.i));
  // The photographs in the order the filmstrip shows them: the cover, then
  // the rest. Numbered only where there is more than one.
  const photoIds: View[] = [...(photoPossible ? ["photo" as const] : []), ...galleryLive.map((g) => g.id)];
  const photoLabel = (id: View) => (photoIds.length > 1 ? `Photo ${photoIds.indexOf(id) + 1}` : "Photo");
  const streetPossible = canStreet && !streetGone;
  const satellitePossible = hasAddress && googleEnabled && !satelliteGone;
  const floodPossible = hasAddress && hasStreetAddress && !!flood && !floodGone;
  // The market's photograph stands in only for the building's own pictures:
  // a deal with a photograph or a street view never shows a skyline.
  const marketPossible = !!market && !marketGone && !photoPossible && !streetPossible;
  // Nothing photographic resolved — collapse entirely.
  if (aerialGone && !photoPossible && !streetPossible && !satellitePossible && !marketPossible && galleryLive.length === 0) {
    return null;
  }

  const views: { id: View; label: string }[] = [
    ...(photoPossible ? [{ id: "photo" as const, label: photoLabel("photo") }] : []),
    ...galleryLive.map((g) => ({ id: g.id, label: photoLabel(g.id) })),
    ...(streetPossible ? [{ id: "street" as const, label: "Street" }] : []),
    ...(marketPossible ? [{ id: "market" as const, label: "Market" }] : []),
    ...(satellitePossible ? [{ id: "satellite" as const, label: "Satellite" }] : []),
    ...(aerialGone ? [] : [{ id: "aerial" as const, label: "Aerial" }]),
    ...(floodPossible ? [{ id: "flood" as const, label: "Flood" }] : []),
    ...(hasAddress ? [{ id: "map" as const, label: "Map" }] : []),
  ];
  // The active view can disappear underneath us when an image 404s.
  const active = views.some((v) => v.id === view) ? view : views[0].id;

  // Each view's own picture, for its place in the filmstrip: the very URL
  // the view draws, so a thumbnail costs no request the view does not
  // already make, and a thumbnail that fails takes its view away just as
  // the view failing would.
  const aerialSrc = `/api/deals/${dealId}/aerial?src=usgs&w=${AERIAL.w}&h=${AERIAL.h}`;
  const floodAerialSrc = `${aerialSrc}&z=${FLOOD_ZOOM}`;
  const floodSrc = `/api/deals/${dealId}/flood?w=${AERIAL.w}&h=${AERIAL.h}&z=${FLOOD_ZOOM}`;
  const thumbs: Record<string, { src: string | null; over?: string; fail: () => void }> = {
    photo: { src: `/api/deals/${dealId}/picture?size=hero`, fail: () => setPhotoGone(true) },
    street: { src: `/api/deals/${dealId}/photo`, fail: () => setStreetGone(true) },
    market: { src: market?.src ?? null, fail: () => setMarketGone(true) },
    satellite: { src: `/api/deals/${dealId}/aerial?src=satellite&w=${AERIAL.w}&h=${AERIAL.h}`, fail: () => setSatelliteGone(true) },
    aerial: { src: aerialSrc, fail: () => setAerialGone(true) },
    flood: { src: floodAerialSrc, over: floodSrc, fail: () => setFloodGone(true) },
    map: { src: null, fail: () => {} },
    // A gallery photograph's place in the filmstrip is its stored 240px
    // crop: its full-size picture waits for its view to be opened.
    ...Object.fromEntries(
      galleryLive.map((g) => [g.id, { src: `/api/deals/${dealId}/picture?size=thumb&g=${g.i}`, fail: () => loseGallery(g.i) }]),
    ),
  };
  const galleryHero = (i: number) => `/api/deals/${dealId}/picture?size=hero&g=${i}`;
  const galleryAlt = (g: { page: number | null }) =>
    g.page ? `Photograph from page ${g.page} of the memorandum for ${label}` : `Photograph from the memorandum for ${label}`;

  // The full-screen viewer's pictures (#445): the views the page has, the
  // map apart, each credited exactly as its own view is.
  const viewerAerial = `/api/deals/${dealId}/aerial?src=usgs&w=${VIEWER.w}&h=${VIEWER.h}`;
  const frames: ViewerFrame[] = views.flatMap((v): ViewerFrame[] => {
    const thumb = thumbs[v.id].src ?? "";
    const photo = galleryLive.find((g) => g.id === v.id);
    if (photo) {
      return [{ id: v.id, label: v.label, src: galleryHero(photo.i), alt: galleryAlt(photo), credit: photo.credit, thumb }];
    }
    switch (v.id) {
      case "photo":
        return [{ id: v.id, label: v.label, src: `/api/deals/${dealId}/picture?size=hero`, alt: `Photograph of ${label}`, credit: picture?.credit ?? "", thumb }];
      case "street":
        return [{ id: v.id, label: v.label, src: `/api/deals/${dealId}/photo`, alt: `Street view of ${label}`, credit: "Street View imagery © Google", thumb }];
      case "market":
        return market
          ? [
              {
                id: v.id,
                label: v.label,
                src: market.src,
                alt: `${market.place}: the market this deal is in, ${market.name}. No photograph of the building yet.`,
                credit: `Market photo: ${market.name} · ${market.credit}`,
                thumb,
              },
            ]
          : [];
      case "satellite":
        return [
          {
            id: v.id,
            label: v.label,
            src: `/api/deals/${dealId}/aerial?src=satellite&w=${VIEWER.w}&h=${VIEWER.h}`,
            alt: `Satellite view of ${label}`,
            credit: "Satellite imagery © Google",
            thumb,
          },
        ];
      case "aerial":
        return [
          {
            id: v.id,
            label: v.label,
            src: viewerAerial,
            alt: `Aerial photograph of ${label}`,
            credit: hasStreetAddress
              ? "Imagery: USGS The National Map"
              : "Imagery: USGS The National Map · neighborhood placement, no street address on this deal",
            thumb,
            ring: hasStreetAddress,
          },
        ];
      case "flood":
        return [
          {
            id: v.id,
            label: v.label,
            src: `${viewerAerial}&z=${FLOOD_ZOOM}`,
            over: `/api/deals/${dealId}/flood?w=${VIEWER.w}&h=${VIEWER.h}&z=${FLOOD_ZOOM}`,
            alt: `Aerial photograph of the blocks around ${label}, with FEMA's flood hazard zones`,
            credit: "FEMA flood zones · USGS imagery",
            thumb,
            thumbOver: thumbs.flood.over,
            ring: true,
          },
        ];
      default:
        return [];
    }
  });
  const open = () => setViewing(active);
  // Where the picture on screen sits among the photographs, for the count.
  const photoAt = photoIds.indexOf(active);
  // The mosaic (#458): the cover with the next two photographs beside it,
  // where the deal has both; how many more the viewer holds.
  const tiles = photoPossible ? galleryLive.slice(0, 2) : [];
  const mosaic = tiles.length === 2;
  const moreCount = photoIds.length - 3;

  return (
    // The deal header's own picture (#433): no card of its own — the header
    // is the card — and marked, so the header lays itself out as a split
    // only while a picture is actually there. It rounds the card's top
    // corners itself (the card cannot clip, or its popovers would be cut):
    // both on a narrow header, the left one beside the facts.
    <figure data-hero-picture className="min-w-0 overflow-hidden rounded-t-[15px] bg-surface @3xl:rounded-tr-none">
      <figcaption className="sr-only">{label}</figcaption>

      <div className="relative">
        {photoPossible && (
          <div className={active === "photo" ? "" : "hidden"}>
            <div className={mosaic ? MOSAIC : ""} data-picture={mosaic ? "mosaic" : undefined}>
              <div className="relative min-h-0 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
                    auth-scoped route serving the stored derivative; next/image
                    adds nothing over a route with its own cache headers */}
                <img
                  src={`/api/deals/${dealId}/picture?size=hero`}
                  alt={`Photograph of ${label}`}
                  width={AERIAL.w}
                  height={AERIAL.h}
                  onClick={open}
                  // Its blur-up preview paints the frame until the
                  // photograph covers it (#463): its colours, never grey.
                  style={previewStyle(picture?.preview)}
                  data-preview={picture?.preview ? "hero" : undefined}
                  className={`${mosaic ? MOSAIC_COVER : FRAME} w-full cursor-zoom-in bg-faint object-cover`}
                  onError={() => setPhotoGone(true)}
                />
                <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                  {picture?.credit}
                </span>
                {/* On the mosaic, the reader's Replace photo sits on the
                    cover it replaces, never over the next photograph. */}
                {mosaic && canReplace && (
                  <div className="absolute right-2 top-2 z-[5]">
                    <ReplacePicture dealId={dealId} hasPicture={!!picture} tone="overlay" />
                  </div>
                )}
              </div>
              {/* The next two photographs, each at the size the cover is
                  held at, so neither is a stretched crop; lazy, so a phone,
                  which does not show them, need not fetch them. Each opens
                  the viewer at itself, and the last says how many more there
                  are. */}
              {mosaic && (
                <div className="hidden min-h-0 min-w-0 @2xl:grid @2xl:grid-rows-2 @2xl:gap-0.5">
                  {tiles.map((g, k) => {
                    const at = photoIds.indexOf(g.id) + 1;
                    const more = k === tiles.length - 1 && moreCount > 0;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setViewing(g.id)}
                        aria-label={
                          more
                            ? `Photograph ${at} of ${photoIds.length}, and ${moreCount} more: see them full screen`
                            : `Photograph ${at} of ${photoIds.length}: see it full screen`
                        }
                        title={g.credit}
                        data-mosaic-tile={g.i}
                        className="group/tile relative min-h-0 cursor-zoom-in overflow-hidden bg-faint focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- proxied, auth-scoped route serving the stored derivative */}
                        <img
                          src={galleryHero(g.i)}
                          alt=""
                          width={AERIAL.w}
                          height={AERIAL.h}
                          loading="lazy"
                          style={previewStyle(g.preview)}
                          className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover/tile:scale-[1.04]"
                          onError={() => loseGallery(g.i)}
                        />
                        {more && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white">
                            {`+${moreCount} more`}
                          </span>
                        )}
                        <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                          {g.page ? `Memorandum, p. ${g.page}` : "Memorandum"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* The memorandum's other photographs (#448): each asked for once its
            view is opened, and kept for the way back. */}
        {galleryLive.map((g) =>
          active === g.id || opened.has(g.id) ? (
            <div key={g.id} className={active === g.id ? "" : "hidden"} data-gallery-photo={g.i}>
              {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
                  auth-scoped route serving the stored derivative */}
              <img
                src={galleryHero(g.i)}
                alt={galleryAlt(g)}
                width={AERIAL.w}
                height={AERIAL.h}
                onClick={open}
                style={previewStyle(g.preview)}
                className={`${FRAME} w-full cursor-zoom-in bg-faint object-cover`}
                onError={() => loseGallery(g.i)}
              />
              <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                {g.credit}
              </span>
            </div>
          ) : null,
        )}

        {marketPossible && market && (
          <div className={active === "market" ? "" : "hidden"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the skyline
                route, proxied from Commons with its own immutable cache headers */}
            <img
              src={market.src}
              alt={`${market.place}: the market this deal is in, ${market.name}. No photograph of the building yet.`}
              width={AERIAL.w}
              height={AERIAL.h}
              onClick={open}
              className={`${FRAME} w-full cursor-zoom-in bg-faint object-cover`}
              onError={() => setMarketGone(true)}
            />
            <MarketCaption market={market.name} credit={market.credit} size="hero" />
          </div>
        )}

        {/* The aerial stays mounted across tab switches so returning to it is
            instant and never re-fetches. */}
        {satellitePossible && (
          <div className={active === "satellite" ? "" : "hidden"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
                auth-scoped route with its own cache headers */}
            <img
              src={`/api/deals/${dealId}/aerial?src=satellite&w=${AERIAL.w}&h=${AERIAL.h}`}
              alt={`Satellite view of ${label}`}
              width={AERIAL.w}
              height={AERIAL.h}
              onClick={open}
              className={`${FRAME} w-full cursor-zoom-in bg-faint object-cover`}
              onError={() => setSatelliteGone(true)}
            />
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              Satellite imagery &copy; Google
            </span>
          </div>
        )}

        {!aerialGone && (
          <div className={active === "aerial" ? "" : "hidden"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
                auth-scoped route; next/image would add a second cache layer
                over an image that is already cached server- and client-side */}
            <img
              src={`/api/deals/${dealId}/aerial?src=usgs&w=${AERIAL.w}&h=${AERIAL.h}`}
              alt={`Aerial photograph of ${label}`}
              width={AERIAL.w}
              height={AERIAL.h}
              onClick={open}
              className={`${FRAME} w-full cursor-zoom-in bg-faint object-cover`}
              onError={() => setAerialGone(true)}
            />
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              Imagery: USGS The National Map
            </span>
            {/* The overhead is drawn at the photograph's own grain (#429), a
                block or two across, so a street address's building is ringed
                at the frame's centre — never a neighbourhood placement's,
                whose centre is a district's. */}
            {hasStreetAddress && (
              <span
                aria-hidden
                data-picture="aerial-pin"
                className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.35),0_1px_6px_rgba(0,0,0,0.45)]"
              >
                <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
              </span>
            )}
            {/* An area-level address (the sample deal, say) can only truthfully
                show the district — never let a wide frame read as "this is the
                building". A street address that the geocoder could only place
                to the block is framed wider by the route itself; the map tab's
                pin tooltip says exactly how far the placement can be trusted. */}
            {!hasStreetAddress && (
              <span className="absolute bottom-0 left-0 rounded-tr bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                Neighborhood placement — no street address on this deal
              </span>
            )}
          </div>
        )}

        {/* FEMA's zones over the aerial, both asked for one frame. The
            filmstrip's Flood thumbnail asks for the same two URLs, so they
            load with the page's other pictures and this view is drawn from
            the browser's cache when opened; either failing takes the view
            away rather than leaving a plain aerial under the word "Flood". */}
        {floodPossible && (
          <div className={active === "flood" ? "" : "hidden"}>
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
                  auth-scoped route with its own cache headers */}
              <img
                src={`/api/deals/${dealId}/aerial?src=usgs&w=${AERIAL.w}&h=${AERIAL.h}&z=${FLOOD_ZOOM}`}
                alt={`Aerial photograph of the blocks around ${label}`}
                width={AERIAL.w}
                height={AERIAL.h}
                loading="lazy"
                className={`${FRAME} w-full bg-faint object-cover`}
                onError={() => setFloodGone(true)}
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
              <img
                src={`/api/deals/${dealId}/flood?w=${AERIAL.w}&h=${AERIAL.h}&z=${FLOOD_ZOOM}`}
                alt={`FEMA flood hazard zones around ${label}`}
                width={AERIAL.w}
                height={AERIAL.h}
                loading="lazy"
                onClick={open}
                className="absolute inset-0 h-full w-full cursor-zoom-in object-cover"
                onError={() => setFloodGone(true)}
              />
              {/* Both frames are centred on the building's location. */}
              <span
                aria-hidden
                data-picture="flood-pin"
                className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.65)]"
              />
              <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                FEMA flood zones · USGS imagery
              </span>
            </div>
            <div className="border-t border-line px-4 py-3">
              {flood && flood.key.length > 0 ? (
                <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted" aria-label="FEMA's key">
                  {flood.key.map((k) => (
                    <li key={k.label} className={`flex items-center gap-1.5 ${k.here ? "font-semibold text-ink" : ""}`}>
                      {k.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- FEMA's own 20px swatch, a data URI
                        <img src={k.image} alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-sm border border-line" />
                      ) : null}
                      <span>{k.here ? `${k.label} — at the building` : k.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {flood?.line ? <p className="mt-1.5 text-xs leading-relaxed text-ink">{flood.line}</p> : null}
            </div>
          </div>
        )}

        {streetPossible && (
          <div className={active === "street" ? "" : "hidden"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img
              src={`/api/deals/${dealId}/photo`}
              alt={`Street view of ${label}`}
              onClick={open}
              className={`${FRAME} w-full cursor-zoom-in bg-faint object-cover`}
              loading="lazy"
              onError={() => setStreetGone(true)}
            />
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              Street View imagery &copy; Google
            </span>
          </div>
        )}

        {/* Leaflet only mounts once the map tab is actually opened — no tile
            traffic for the readers who never look at it. */}
        {active === "map" && hasAddress && (
          <PropertyMap dealId={dealId} label={label} heightClass={`${FRAME} w-full`} />
        )}

        {/* The picture full screen (#445), from its top left corner: the
            top right is the reader's Replace photo. Never over the map. */}
        {active !== "map" && frames.length > 0 && (
          <button
            type="button"
            onClick={open}
            aria-label={`See the pictures of ${label} full screen`}
            title="Full screen"
            data-picture="expand"
            className="absolute left-2 top-2 z-[5] flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        )}

        {/* How many photographs the deal has (#448), beside the expand
            control: on a photograph, which one this is; on any other view,
            a way to the first of them. Never over the map. */}
        {active !== "map" && photoIds.length > 1 && (
          <button
            type="button"
            onClick={() => (photoAt >= 0 ? setViewing(active) : choose(photoIds[0]))}
            aria-label={
              photoAt >= 0
                ? `Photograph ${photoAt + 1} of ${photoIds.length}: see them full screen`
                : `See the ${photoIds.length} photographs of ${label}`
            }
            data-picture="photo-count"
            className="absolute left-12 top-2 z-[5] flex h-8 items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-semibold text-white shadow-sm backdrop-blur-sm transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <span>{photoAt >= 0 ? `${photoAt + 1} / ${photoIds.length}` : `${photoIds.length} photos`}</span>
          </button>
        )}

        {/* "That's not the building": on the picture itself, where a cover
            photograph's own control sits — never over the map, whose corner
            belongs to its controls. */}
        {canReplace && active !== "map" && !(mosaic && active === "photo") && (
          <div className="absolute right-2 top-2 z-[5]">
            <ReplacePicture dealId={dealId} hasPicture={!!picture} tone="overlay" />
          </div>
        )}
      </div>

      {/* The views as a filmstrip (#432), the way a listing shows its
          photographs: each one's own picture under its name, the one on
          screen ringed. */}
      {views.length > 1 && (
        <div role="group" aria-label="Views of the property" className="flex gap-2 overflow-x-auto border-t border-line bg-faint/60 px-3 py-2.5">
          {views.map((v) => {
            const t = thumbs[v.id];
            const on = active === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => choose(v.id)}
                aria-pressed={on}
                data-view-thumb={v.id}
                className={`group relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border bg-surface text-left transition ${
                  on ? "border-brand ring-2 ring-brand" : "border-line opacity-80 hover:opacity-100"
                }`}
              >
                {t.src ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- the view's own URL, cached by the browser once for both */}
                    <img src={t.src} alt="" aria-hidden width={96} height={56} className="absolute inset-0 h-full w-full object-cover" onError={t.fail} />
                    {t.over ? (
                      // eslint-disable-next-line @next/next/no-img-element -- FEMA's zones over the same frame, as the view draws them
                      <img src={t.over} alt="" aria-hidden width={96} height={56} className="absolute inset-0 h-full w-full object-cover" onError={t.fail} />
                    ) : null}
                  </>
                ) : (
                  <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-brand/5 text-brand">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
                      <path d="M9 4v13M15 6.5v13" />
                    </svg>
                  </span>
                )}
                <span
                  className={`absolute inset-x-0 bottom-0 px-1.5 pb-0.5 pt-3 text-[10px] font-semibold ${
                    t.src ? "bg-gradient-to-t from-black/70 to-transparent text-white" : "text-brand"
                  }`}
                >
                  {v.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {viewing && frames.length > 0 && (
        <PhotoViewer
          frames={frames}
          start={Math.max(0, frames.findIndex((f) => f.id === viewing))}
          title={label}
          onClose={() => setViewing(null)}
        />
      )}
    </figure>
  );
}
