"use client";

import { useState } from "react";
import { PropertyMap } from "./property-map";

/**
 * The real property, at the top of its deal page: a street-level photograph
 * of the building where one exists, an aerial photograph of the site, and an
 * interactive map — three views of the same real place, no illustration.
 *
 * The Street tab leads whenever it can, because a photo of the building's
 * front is what "a picture of this property" means; the aerial leads when it
 * is the best picture available, which is every deal until a Google key is
 * configured.
 *
 * Sourcing is unchanged from the site-polish rule: only imagery OF this
 * address, from a source we may use. Aerial is USGS (public domain, always
 * available). Street is Google Street View and only exists when
 * GOOGLE_MAPS_API_KEY is configured — `streetViewEnabled` is that check,
 * resolved server-side, so the browser never probes a route that can't answer.
 *
 * Every view degrades to nothing rather than to a placeholder: if neither
 * photo loads, the whole card unmounts and the page reads exactly as it did
 * before. No stock photos, no AI imagery, no "photo unavailable" graphic.
 */

type View = "aerial" | "street" | "map";

const AERIAL = { w: 1280, h: 576 }; // 16:9, the route's max width

export function PropertyVisual({
  dealId,
  label,
  hasStreetAddress,
  streetViewEnabled,
}: {
  dealId: string;
  /** the deal's address line — the caption, and the map pin's tooltip */
  label: string;
  /** street-level imagery is only honest for a street-level address */
  hasStreetAddress: boolean;
  /** GOOGLE_MAPS_API_KEY is set (checked server-side) */
  streetViewEnabled: boolean;
}) {
  // Lead with the building's own photograph wherever one can exist; the
  // aerial leads only when it is the best picture available.
  const canStreet = hasStreetAddress && streetViewEnabled;
  const [view, setView] = useState<View>(canStreet ? "street" : "aerial");
  const [aerialGone, setAerialGone] = useState(false);
  const [streetGone, setStreetGone] = useState(false);

  const streetPossible = canStreet && !streetGone;
  // Nothing photographic resolved — collapse entirely.
  if (aerialGone && !streetPossible) return null;

  const views: { id: View; label: string }[] = [
    ...(streetPossible ? [{ id: "street" as const, label: "Street" }] : []),
    ...(aerialGone ? [] : [{ id: "aerial" as const, label: "Aerial" }]),
    { id: "map" as const, label: "Map" },
  ];
  // The active view can disappear underneath us when an image 404s.
  const active = views.some((v) => v.id === view) ? view : views[0].id;

  return (
    <figure className="shadow-card overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <figcaption className="truncate text-xs font-medium text-muted">{label}</figcaption>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-line">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              aria-pressed={active === v.id}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active === v.id ? "bg-brand text-white" : "hover:bg-faint"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {/* The aerial stays mounted across tab switches so returning to it is
            instant and never re-fetches. */}
        {!aerialGone && (
          <div className={active === "aerial" ? "" : "hidden"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- proxied,
                auth-scoped route; next/image would add a second cache layer
                over an image that is already cached server- and client-side */}
            <img
              src={`/api/deals/${dealId}/aerial?w=${AERIAL.w}&h=${AERIAL.h}`}
              alt={`Aerial photograph of ${label}`}
              width={AERIAL.w}
              height={AERIAL.h}
              className="aspect-[16/9] w-full bg-faint object-cover"
              onError={() => setAerialGone(true)}
            />
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              Imagery: USGS The National Map
            </span>
            {/* An area-level address (the sample deal, say) can only truthfully
                show the district — never let a wide frame read as "this is the
                building". */}
            {!hasStreetAddress && (
              <span className="absolute bottom-0 left-0 rounded-tr bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                Neighborhood placement — no street address on this deal
              </span>
            )}
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
        {active === "map" && (
          <PropertyMap dealId={dealId} label={label} heightClass="aspect-[16/9] w-full" />
        )}
      </div>
    </figure>
  );
}
