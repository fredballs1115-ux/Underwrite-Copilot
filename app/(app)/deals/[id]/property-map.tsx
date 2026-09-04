"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BASEMAPS,
  BASEMAP_ORDER,
  DEFAULT_BASEMAP,
  type BasemapId,
} from "@/lib/basemaps";
import type { LocationPrecision } from "@/lib/deal-location";

/**
 * The subject property on a real map — satellite photography by default,
 * street map one click away.
 *
 * Coordinates come from /api/deals/[id]/location (resolved and cached once
 * server-side) rather than a browser geocode, so this map, the aerial photo
 * and the comps map all agree on where the deal is.
 */

interface DealLocation {
  lat: number;
  lng: number;
  precision: LocationPrecision;
}

/** A street address frames the building; an area placement frames the district. */
const ZOOM: Record<LocationPrecision, number> = { street: 17, area: 13 };

function subjectPinHtml(): string {
  return (
    `<svg width="34" height="46" viewBox="0 0 34 46" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M17 45C17 45 32 28 32 16A15 15 0 1 0 2 16C2 28 17 45 17 45Z" fill="#18211f" stroke="#ffffff" stroke-width="2.5"/>` +
    `<circle cx="17" cy="16" r="5.5" fill="#7fd6cc"/>` +
    `</svg>`
  );
}

export function PropertyMap({
  dealId,
  label,
  heightClass = "h-72 md:h-96",
}: {
  dealId: string;
  /** the address line, shown in the pin tooltip */
  label: string;
  heightClass?: string;
}) {
  const [loc, setLoc] = useState<DealLocation | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "none">("loading");
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.TileLayer | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/deals/${dealId}/location`, {
          signal: AbortSignal.timeout(12_000),
        });
        if (cancelled) return;
        if (!res.ok) return setPhase("none");
        setLoc((await res.json()) as DealLocation);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  // Build the map once coordinates land.
  useEffect(() => {
    if (phase !== "ready" || !loc || !divRef.current || mapRef.current) return;
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !divRef.current || mapRef.current) return;
      leafletRef.current = L;

      const map = L.map(divRef.current, { scrollWheelZoom: false }).setView(
        [loc.lat, loc.lng],
        ZOOM[loc.precision],
      );
      mapRef.current = map;

      const base = BASEMAPS[DEFAULT_BASEMAP];
      layerRef.current = L.tileLayer(base.url, {
        maxZoom: base.maxZoom,
        maxNativeZoom: base.maxNativeZoom,
        attribution: base.attribution,
      }).addTo(map);

      L.control.scale({ imperial: true, metric: false }).addTo(map);

      L.marker([loc.lat, loc.lng], {
        icon: L.divIcon({
          className: "",
          html: subjectPinHtml(),
          iconSize: [34, 46],
          iconAnchor: [17, 45],
          tooltipAnchor: [0, -38],
        }),
        title: label,
      })
        .addTo(map)
        .bindTooltip(
          loc.precision === "street"
            ? "Subject property"
            : "Approximate — no street address on this deal",
        );
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [phase, loc, label]);

  // Basemap switch: swap the tile layer in place, keeping view and pins.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const next = BASEMAPS[basemap];
    layerRef.current?.remove();
    layerRef.current = L.tileLayer(next.url, {
      maxZoom: next.maxZoom,
      maxNativeZoom: next.maxNativeZoom,
      attribution: next.attribution,
    }).addTo(map);
  }, [basemap]);

  if (phase === "none") {
    return (
      <div className={`flex ${heightClass} items-center justify-center rounded-lg bg-faint px-4 text-center text-sm text-muted`}>
        Couldn&apos;t place this address on a map — no location is guessed.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={divRef}
        className={`uc-map ${heightClass} overflow-hidden rounded-lg border border-line bg-faint`}
      />
      {phase === "ready" && (
        <div className="absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
          {BASEMAP_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setBasemap(id)}
              aria-pressed={basemap === id}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                basemap === id ? "bg-brand text-white" : "hover:bg-faint"
              }`}
            >
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>
      )}
      {phase === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          Locating the property…
        </div>
      )}
    </div>
  );
}
