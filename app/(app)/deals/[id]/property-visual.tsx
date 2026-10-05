"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketPicture } from "@/lib/market-picture";
import {
  FLOOD_CLASS_LABEL,
  floodStyleOf,
  floodSwatchBackground,
  floodSwatchBorder,
  type FloodClassKey,
} from "@/lib/flood-style";
import { photographerParts } from "@/lib/credit-parts";
import { CreditPartsText } from "@/app/credit-parts";
import { MarketCaption } from "../market-caption";
import { PhotoViewer, type ViewerFrame } from "./photo-viewer";
import { PropertyMap } from "./property-map";
import { ReplacePicture } from "./replace-picture";
import { previewStyle } from "@/lib/photo-preview";
import { DEAL_AERIAL_VIEW, DEAL_AERIAL_VIEWER } from "@/lib/image-frames";
import {
  headerPhotoSizes,
  mosaicTileSizes,
  photoAspect,
  photoSrcSet,
  viewerSizes,
  type StoredPhotoSizes,
} from "@/lib/photo-srcset";

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
 * The Flood tab (#425) is the deal's flood frame (#472, lib/flood-map): the
 * USGS aerial at a wider frame, calmed, with FEMA's flood zones drawn over it
 * in the site's palette, drawn once a deal on the server and kept — one
 * picture, cut to the view's shape — with a ring at the frame's centre,
 * which is the building, a key of the zones the frame actually shows under
 * it and one sentence on the zone at the building. A frame not drawn yet
 * shows that it is being drawn, and one that does not come says so beside
 * the key and the sentence rather than taking them away. Only for a street
 * address: a neighbourhood placement's centre is not the building.
 *
 * Where the deal has no photograph of the building's own and no Street View,
 * the picture leads with the photograph its market is known by (#439), the
 * one its pipeline card shows (#438): named on its face as the market's,
 * never passed for the building, with the aerial, the flood map and the map
 * one step along the filmstrip. The reader's "Add photo" sits on it. Its
 * credit carries what the licence asks — the photographer linked to the
 * file's page on Commons, the licence to its text, and "cropped to fit" in
 * the frame that crops it, never in the viewer, which shows it whole.
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
 *
 * A stored photograph whose source was larger than its hero has a full-size
 * copy too (lib/deal-picture), and every picture of it here — the cover, a
 * mosaic tile, a gallery view, the viewer — names both in a srcset with the
 * width it is drawn at (lib/photo-srcset), so a dense screen, a panorama
 * covering the frame by its height and the viewer take the full copy where
 * the hero would be stretched, and every other screen the hero it had.
 */

/** A view's id: the fixed views, and the memorandum's other photographs
 *  as `g1`, `g2`… (#448). */
type View = "photo" | "street" | "market" | "satellite" | "aerial" | "flood" | "map" | `g${number}`;

/** The overhead views' frame, and the overheads' in the full-screen viewer:
 *  lib/image-frames' own, the frames the aerial route draws (research pass
 *  22), so this page and its route cannot drift apart. */
const AERIAL = DEAL_AERIAL_VIEW;
const VIEWER = DEAL_AERIAL_VIEWER;
/** The Flood view's crop of the deal's flood frame (#472): the view's own
 *  16:9, so nothing the key describes is cut away by the box. */
const FLOOD_VIEW = { w: 1280, h: 720 };

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
  /** the deal's own photograph, with what it is credited as, its blur-up
   *  preview (#463) and its stored sizes (the hero's, and the full-size
   *  copy's width where one is stored); null for none */
  picture?: ({ credit: string; source: "om" | "upload"; preview?: string | null } & StoredPhotoSizes) | null;
  /** the reader may put their own picture on the deal (never on the sample) */
  canReplace?: boolean;
  /** the Flood tab (#472): the frame's URL stem (the route, with the point
   *  it is drawn around, so a moved deal asks for a new picture), the
   *  classes the page's and the viewer's crops show where the frame is
   *  drawn already, the class the building's own zone is drawn in, the zone
   *  in a word for the picture, and the sentence (lib/site-flags
   *  `floodZoneLine`); null for no Flood tab */
  flood?: {
    src: string;
    classes: { page: FloodClassKey[]; full: FloodClassKey[] } | null;
    here: FloodClassKey | null;
    zone: string | null;
    line: string | null;
  } | null;
  /** the photograph the deal's market is known by (lib/market-picture),
   *  leading only where the deal has no photograph of its own and no
   *  Street View (#439); null for none */
  market?: MarketPicture | null;
  /** the memorandum's other photographs, in page order, each with its
   *  credit (#448) and its stored sizes; served as `?g=1`, `?g=2`… */
  gallery?: ({ page: number | null; credit: string; preview?: string | null } & StoredPhotoSizes)[];
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
  // The flood frame (#472) is drawn on the server behind the page's first
  // render, so the first ask may find it still being drawn. A picture that
  // does not come is asked about — `?meta=1` answers by its status: 404,
  // nothing to draw (the view goes); 503, not drawn yet — and asked for
  // again, a little later each time, three times before the view says it
  // did not come. The key and the sentence stay either way.
  const [floodTry, setFloodTry] = useState(0);
  const [floodState, setFloodState] = useState<"loading" | "ready" | "failed">("loading");
  const [floodClasses, setFloodClasses] = useState(flood?.classes ?? null);
  // The try that failed, once: the view and its thumbnail failing together
  // ask about it one time.
  const [floodFailed, setFloodFailed] = useState<number | null>(null);
  const floodImg = useRef<HTMLImageElement>(null);
  const floodStem = flood?.src ?? null;
  const onFloodError = () => setFloodFailed(floodTry);
  const onFloodLoad = () => setFloodState("ready");
  useEffect(() => {
    if (floodFailed === null || !floodStem) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      let status = 0;
      try {
        const res = await fetch(`${floodStem}&meta=1`);
        status = res.status;
        if (res.ok) {
          const meta = (await res.json()) as { classes?: { page: FloodClassKey[]; full: FloodClassKey[] } };
          if (!cancelled && meta.classes) setFloodClasses(meta.classes);
        }
      } catch {
        status = 0;
      }
      if (cancelled) return;
      if (status === 404) return setFloodGone(true);
      if (floodFailed >= 3) return setFloodState("failed");
      timer = setTimeout(
        () => {
          setFloodFailed(null);
          setFloodTry(floodFailed + 1);
        },
        status === 200 ? 300 : 4000 * (floodFailed + 1),
      );
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [floodFailed, floodStem]);
  useEffect(() => {
    // A page rendered before the frame existed learns its key once the
    // picture has come.
    if (floodState !== "ready" || floodClasses || !floodStem) return;
    let cancelled = false;
    fetch(`${floodStem}&meta=1`)
      .then((r) => (r.ok ? (r.json() as Promise<{ classes?: { page: FloodClassKey[]; full: FloodClassKey[] } }>) : null))
      .then((meta) => {
        if (!cancelled && meta?.classes) setFloodClasses(meta.classes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [floodState, floodClasses, floodStem]);
  useEffect(() => {
    // A picture that settled before hydration fired its event unheard.
    const img = floodImg.current;
    if (!img?.complete) return;
    if (img.naturalWidth > 0) setFloodState("ready");
    else setFloodFailed(0);
  }, []);
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
  if (aerialGone && !photoPossible && !streetPossible && !satellitePossible && !marketPossible && !floodPossible && galleryLive.length === 0) {
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
  // The flood frame's crops (#472): the view's 16:9 at 1x and 2x, the
  // filmstrip's, and the viewer's whole frame — each retry a new URL.
  const floodR = floodTry ? `&r=${floodTry}` : "";
  const floodView = flood ? `${flood.src}&w=${FLOOD_VIEW.w}&h=${FLOOD_VIEW.h}${floodR}` : "";
  const floodView2x = flood ? `${flood.src}&w=${FLOOD_VIEW.w * 2}&h=${FLOOD_VIEW.h * 2}${floodR}` : "";
  const thumbs: Record<string, { src: string | null; fail: () => void }> = {
    photo: { src: `/api/deals/${dealId}/picture?size=hero`, fail: () => setPhotoGone(true) },
    street: { src: `/api/deals/${dealId}/photo`, fail: () => setStreetGone(true) },
    market: { src: market?.src ?? null, fail: () => setMarketGone(true) },
    satellite: { src: `/api/deals/${dealId}/aerial?src=satellite&w=${AERIAL.w}&h=${AERIAL.h}`, fail: () => setSatelliteGone(true) },
    aerial: { src: aerialSrc, fail: () => setAerialGone(true) },
    flood: { src: flood && floodState !== "failed" ? `${flood.src}&w=192&h=108${floodR}` : null, fail: onFloodError },
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
  // Each stored photograph at its hero's width and, where one is stored, its
  // full-size copy's (lib/photo-srcset): the browser takes whichever the
  // width it is drawn at on this screen needs.
  const coverSrcSet = photoSrcSet((size) => `/api/deals/${dealId}/picture?size=${size}`, picture);
  const gallerySrcSet = (g: StoredPhotoSizes & { i: number }) =>
    photoSrcSet((size) => `/api/deals/${dealId}/picture?size=${size}&g=${g.i}`, g);

  // The full-screen viewer's pictures (#445): the views the page has, the
  // map apart, each credited exactly as its own view is.
  const viewerAerial = `/api/deals/${dealId}/aerial?src=usgs&w=${VIEWER.w}&h=${VIEWER.h}`;
  const frames: ViewerFrame[] = views.flatMap((v): ViewerFrame[] => {
    const thumb = thumbs[v.id].src ?? "";
    const photo = galleryLive.find((g) => g.id === v.id);
    if (photo) {
      const srcSet = gallerySrcSet(photo);
      return [
        {
          id: v.id,
          label: v.label,
          src: galleryHero(photo.i),
          ...(srcSet ? { srcSet, sizes: viewerSizes(photo) } : {}),
          alt: galleryAlt(photo),
          credit: photo.credit,
          thumb,
        },
      ];
    }
    switch (v.id) {
      case "photo":
        return [
          {
            id: v.id,
            label: v.label,
            src: `/api/deals/${dealId}/picture?size=hero`,
            ...(coverSrcSet ? { srcSet: coverSrcSet, sizes: viewerSizes(picture) } : {}),
            alt: `Photograph of ${label}`,
            credit: picture?.credit ?? "",
            thumb,
          },
        ];
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
                // Linked, and never "cropped to fit": the viewer shows the
                // photograph whole.
                credit: [`Market photo: ${market.name} · `, ...photographerParts(market.author, market.license, false)],
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
        return flood
          ? [
              {
                id: v.id,
                label: v.label,
                // The whole frame, at the pixels it is drawn at.
                src: `${flood.src}&w=${VIEWER.w * 2}&h=${VIEWER.h * 2}${floodR}`,
                alt: `Aerial photograph of the blocks around ${label}, with FEMA's flood hazard zones drawn over it`,
                credit: "FEMA flood zones · USGS imagery",
                thumb,
                ring: true,
              },
            ]
          : [];
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
  // The Flood view's key (#472): the zones the view's crop actually shows,
  // read off the frame when it was drawn, the building's own first.
  const floodKeyList: { key: FloodClassKey; here: boolean }[] | null = floodClasses
    ? (() => {
        const shown = floodClasses.page;
        const own = flood?.here && shown.includes(flood.here) ? flood.here : null;
        return (own ? [own, ...shown.filter((c) => c !== own)] : shown).map((key) => ({ key, here: key === own }));
      })()
    : null;

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
                  srcSet={coverSrcSet}
                  sizes={coverSrcSet ? headerPhotoSizes(photoAspect(picture)) : undefined}
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
                    const srcSet = gallerySrcSet(g);
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
                          srcSet={srcSet}
                          sizes={srcSet ? mosaicTileSizes(photoAspect(g)) : undefined}
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
                srcSet={gallerySrcSet(g)}
                sizes={gallerySrcSet(g) ? headerPhotoSizes(photoAspect(g)) : undefined}
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
            {/* The photographer linked to the file's page and the licence to
                its text, and "cropped to fit": the frame crops it. The
                picture under the caption is no link, so the links stand on
                their own, each taking its click back from the caption. */}
            <MarketCaption
              market={market.name}
              credit={
                <CreditPartsText
                  parts={photographerParts(market.author, market.license, true)}
                  linkClassName="pointer-events-auto underline decoration-dotted underline-offset-2 hover:text-white"
                />
              }
              size="hero"
            />
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

        {/* The deal's flood frame (#472): one picture, drawn on the server —
            the aerial calmed, FEMA's zones in the site's palette over it —
            shown only once whole, over a plate that says it is being drawn.
            One that does not come says so here, and the key and the
            sentence stay. */}
        {floodPossible && flood && (
          <div className={active === "flood" ? "" : "hidden"}>
            <div className="relative">
              {floodState === "failed" ? (
                <div
                  data-picture="flood-failed"
                  className={`${FRAME} flex w-full items-center justify-center bg-faint px-6 text-center text-sm text-muted`}
                >
                  FEMA&rsquo;s flood map did not come through just now. It is asked for again on your next visit.
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
                      auth-scoped route cutting a stored frame, with its own cache headers */}
                  <img
                    key={floodTry}
                    ref={floodImg}
                    src={floodView}
                    srcSet={`${floodView} ${FLOOD_VIEW.w}w, ${floodView2x} ${FLOOD_VIEW.w * 2}w`}
                    sizes="(min-width: 64rem) 50vw, 100vw"
                    alt={`Aerial photograph of the blocks around ${label}, with FEMA's flood hazard zones drawn over it`}
                    width={FLOOD_VIEW.w}
                    height={FLOOD_VIEW.h}
                    onClick={open}
                    onLoad={onFloodLoad}
                    onError={onFloodError}
                    data-picture="flood"
                    className={`${FRAME} w-full cursor-zoom-in bg-faint object-cover transition-opacity duration-500 ${
                      floodState === "ready" ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  {floodState === "loading" && (
                    <div aria-hidden data-picture="flood-drawing" className="absolute inset-0 flex items-end overflow-hidden bg-faint">
                      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-faint via-surface to-faint motion-reduce:animate-none" />
                      <span className="relative m-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
                        Drawing FEMA&rsquo;s flood map&hellip;
                      </span>
                    </div>
                  )}
                  {floodState === "ready" && (
                    <>
                      {/* The frame is drawn around the building's location. */}
                      <span
                        aria-hidden
                        data-picture="flood-pin"
                        className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.45),0_1px_6px_rgba(0,0,0,0.5)]"
                      >
                        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                      </span>
                      {flood.zone ? (
                        <span
                          data-picture="flood-zone"
                          className="absolute bottom-0 left-0 rounded-tr bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white"
                        >
                          {`${flood.zone} at the building`}
                        </span>
                      ) : null}
                    </>
                  )}
                </>
              )}
              <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                FEMA flood zones · USGS imagery
              </span>
            </div>
            <div className="border-t border-line px-4 py-3">
              {floodKeyList ? (
                floodKeyList.length > 0 ? (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted" aria-label="Flood zones in this picture">
                    {floodKeyList.map((k) => {
                      const style = floodStyleOf(k.key);
                      return (
                        <li key={k.key} className={`flex items-center gap-1.5 ${k.here ? "font-semibold text-ink" : ""}`}>
                          <span
                            aria-hidden
                            data-flood-swatch={k.key}
                            className="h-3.5 w-3.5 shrink-0 rounded-sm border-[1.5px]"
                            style={{ background: floodSwatchBackground(style), borderColor: floodSwatchBorder(style) }}
                          />
                          <span>{k.here ? `${FLOOD_CLASS_LABEL[k.key]} — at the building` : FLOOD_CLASS_LABEL[k.key]}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted">FEMA draws no flood hazard zone inside this frame.</p>
                )
              ) : null}
              {flood.line ? <p className="mt-1.5 text-xs leading-relaxed text-ink">{flood.line}</p> : null}
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
                  // eslint-disable-next-line @next/next/no-img-element -- the view's own URL, cached by the browser once for both
                  <img key={t.src} src={t.src} alt="" aria-hidden width={96} height={56} className="absolute inset-0 h-full w-full object-cover" onError={t.fail} />
                ) : v.id === "flood" ? (
                  <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-brand/5 text-brand">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                      <path d="M3 9c2 0 2-1.5 4.5-1.5S9.5 9 12 9s2.5-1.5 4.5-1.5S19 9 21 9M3 14c2 0 2-1.5 4.5-1.5S9.5 14 12 14s2.5-1.5 4.5-1.5S19 14 21 14M3 19c2 0 2-1.5 4.5-1.5S9.5 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19" />
                    </svg>
                  </span>
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
