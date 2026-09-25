"use client";

import { useState } from "react";
import { FLOOD_ZOOM } from "@/lib/basemaps";
import { PropertyMap } from "./property-map";
import { ReplacePicture } from "./replace-picture";

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
 * The Flood tab (#425) is the USGS aerial at a wider frame with FEMA's flood
 * zones drawn over it in FEMA's own colours — the two images asked for the
 * same location, zoom and size, so they share one Web-Mercator frame — with
 * a ring at the frame's centre, which is the building, FEMA's key under it
 * and one sentence on the zone at the building. Only for a street address:
 * a neighbourhood placement's centre is not the building.
 */

type View = "photo" | "street" | "satellite" | "aerial" | "flood" | "map";

const AERIAL = { w: 1280, h: 576 }; // 16:9, the route's max width

export function PropertyVisual({
  dealId,
  label,
  hasStreetAddress,
  googleEnabled,
  hasAddress = true,
  picture = null,
  canReplace = true,
  flood = null,
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
  /** the deal's own photograph, with what it is credited as; null for none */
  picture?: { credit: string; source: "om" | "upload" } | null;
  /** the reader may put their own picture on the deal (never on the sample) */
  canReplace?: boolean;
  /** the Flood tab's key and sentence (lib/site-flags `floodKey`,
   *  `floodZoneLine`); null for no Flood tab */
  flood?: {
    key: { label: string; image: string | null; here: boolean }[];
    line: string | null;
  } | null;
}) {
  // Lead with the building's own photograph wherever one exists; the
  // aerial leads only when it is the best picture available.
  const canStreet = hasAddress && hasStreetAddress && googleEnabled;
  const [view, setView] = useState<View>(picture ? "photo" : canStreet ? "street" : "aerial");
  const [photoGone, setPhotoGone] = useState(false);
  const [aerialGone, setAerialGone] = useState(!hasAddress);
  const [streetGone, setStreetGone] = useState(false);
  const [satelliteGone, setSatelliteGone] = useState(false);
  const [floodGone, setFloodGone] = useState(false);

  const photoPossible = !!picture && !photoGone;
  const streetPossible = canStreet && !streetGone;
  const satellitePossible = hasAddress && googleEnabled && !satelliteGone;
  const floodPossible = hasAddress && hasStreetAddress && !!flood && !floodGone;
  // Nothing photographic resolved — collapse entirely.
  if (aerialGone && !photoPossible && !streetPossible && !satellitePossible) return null;

  const views: { id: View; label: string }[] = [
    ...(photoPossible ? [{ id: "photo" as const, label: "Photo" }] : []),
    ...(streetPossible ? [{ id: "street" as const, label: "Street" }] : []),
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
  const thumbs: Record<View, { src: string | null; over?: string; fail: () => void }> = {
    photo: { src: `/api/deals/${dealId}/picture?size=hero`, fail: () => setPhotoGone(true) },
    street: { src: `/api/deals/${dealId}/photo`, fail: () => setStreetGone(true) },
    satellite: { src: `/api/deals/${dealId}/aerial?src=satellite&w=${AERIAL.w}&h=${AERIAL.h}`, fail: () => setSatelliteGone(true) },
    aerial: { src: aerialSrc, fail: () => setAerialGone(true) },
    flood: { src: floodAerialSrc, over: floodSrc, fail: () => setFloodGone(true) },
    map: { src: null, fail: () => {} },
  };

  return (
    <figure className="shadow-card overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <figcaption className="truncate text-xs font-medium text-muted">{label}</figcaption>
        {canReplace && (
          <div className="flex shrink-0 items-center gap-2">
            <ReplacePicture dealId={dealId} hasPicture={!!picture} />
          </div>
        )}
      </div>

      <div className="relative">
        {photoPossible && (
          <div className={active === "photo" ? "" : "hidden"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
                auth-scoped route serving the stored derivative; next/image
                adds nothing over a route with its own cache headers */}
            <img
              src={`/api/deals/${dealId}/picture?size=hero`}
              alt={`Photograph of ${label}`}
              width={AERIAL.w}
              height={AERIAL.h}
              className="aspect-[16/9] w-full bg-faint object-cover"
              onError={() => setPhotoGone(true)}
            />
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              {picture?.credit}
            </span>
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
              className="aspect-[16/9] w-full bg-faint object-cover"
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
              className="aspect-[16/9] w-full bg-faint object-cover"
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

        {/* FEMA's zones over the aerial, both asked for one frame. Lazy, and
            hidden until opened, so neither loads for a reader who never looks;
            either failing takes the tab away rather than leaving a plain
            aerial under the word "Flood". */}
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
                className="aspect-[16/9] w-full bg-faint object-cover"
                onError={() => setFloodGone(true)}
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
              <img
                src={`/api/deals/${dealId}/flood?w=${AERIAL.w}&h=${AERIAL.h}&z=${FLOOD_ZOOM}`}
                alt={`FEMA flood hazard zones around ${label}`}
                width={AERIAL.w}
                height={AERIAL.h}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
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
              className="aspect-[16/9] w-full bg-faint object-cover"
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
          <PropertyMap dealId={dealId} label={label} heightClass="aspect-[16/9] w-full" />
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
                onClick={() => setView(v.id)}
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
    </figure>
  );
}
