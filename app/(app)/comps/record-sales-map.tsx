"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { fmtMiles } from "@/lib/geo";
import {
  BASEMAPS,
  BASEMAP_ORDER,
  DEFAULT_BASEMAP,
  OSM_ATTRIBUTION,
  type BasemapId,
} from "@/lib/basemaps";
import { safeHttpUrl } from "@/lib/safe-url";

/** One recorded sale on the map: its pin number is its row in the table. */
export interface MapSale {
  n: number;
  lat: number;
  lng: number;
  address: string;
  /** the price as the table writes it */
  priceText: string;
  /** "Aug 2026" */
  soldText: string;
  distanceKm: number;
  sourceUrl: string;
}

const PIN = "#114e54";

function pinHtml(n: number): string {
  return (
    `<svg class="uc-pin" width="26" height="34" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M15 39C15 39 28 24.5 28 14A13 13 0 1 0 2 14C2 24.5 15 39 15 39Z" fill="${PIN}" stroke="#ffffff" stroke-width="2"/>` +
    `<text x="15" y="18.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#ffffff">${n}</text>` +
    `</svg>`
  );
}

function subjectPinHtml(): string {
  return (
    `<svg class="uc-pin" width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M18 47C18 47 34 29.5 34 17A16 16 0 1 0 2 17C2 29.5 18 47 18 47Z" fill="#18211f" stroke="#ffffff" stroke-width="2"/>` +
    `<path d="M18 8.5l2.6 5.3 5.9.9-4.2 4.1 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.2-4.1 5.9-.9z" fill="#7fd6cc"/>` +
    `</svg>`
  );
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;",
  );
const escapeAttr = (s: string) => escapeHtml(s).replaceAll("`", "&#96;");

/**
 * The recorded sales around an address, on aerial photography by default
 * (the street map one click away). The subject is the star; each sale is a
 * pin numbered as its row in the table; the dashed ring is the search's own
 * radius. The positions are the records' own, never geocoded here; the
 * subject was placed by Photon on OpenStreetMap's data, so the map credits
 * OpenStreetMap whatever basemap is drawn.
 */
export function RecordSalesMap({
  subject,
  sales,
  radiusKm,
}: {
  subject: { lat: number; lng: number; label: string };
  sales: MapSale[];
  radiusKm: number | null;
}) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const baseRef = useRef<Leaflet.TileLayer | null>(null);
  const appliedRef = useRef<BasemapId>(DEFAULT_BASEMAP);
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (disposed || !divRef.current || mapRef.current) return;
        const map = L.map(divRef.current, { scrollWheelZoom: false });
        mapRef.current = map;
        leafletRef.current = L;
        const base = BASEMAPS[appliedRef.current];
        baseRef.current = L.tileLayer(base.url, {
          maxZoom: base.maxZoom,
          maxNativeZoom: base.maxNativeZoom,
          attribution: base.attribution,
        }).addTo(map);
        map.attributionControl?.addAttribution(OSM_ATTRIBUTION);
        L.control.scale({ imperial: true, metric: false }).addTo(map);

        const center: [number, number] = [subject.lat, subject.lng];
        if (radiusKm) {
          L.circle(center, {
            radius: radiusKm * 1000,
            color: PIN,
            weight: 1,
            opacity: 0.45,
            dashArray: "4 5",
            fillColor: PIN,
            fillOpacity: 0.03,
            interactive: false,
          }).addTo(map);
        }
        L.marker(center, {
          icon: L.divIcon({ className: "", html: subjectPinHtml(), iconSize: [36, 48], iconAnchor: [18, 47], tooltipAnchor: [0, -40] }),
          title: "The address searched",
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindTooltip(escapeHtml(subject.label));

        const pts: [number, number][] = [center];
        for (const s of sales) {
          if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
          const href = safeHttpUrl(s.sourceUrl);
          L.marker([s.lat, s.lng], {
            icon: L.divIcon({ className: "", html: pinHtml(s.n), iconSize: [26, 34], iconAnchor: [13, 33], tooltipAnchor: [0, -28], popupAnchor: [0, -28] }),
            title: s.address,
          })
            .addTo(map)
            .bindTooltip(escapeHtml(`${s.n}. ${s.priceText}`))
            .bindPopup(
              `<div style="max-width:240px"><strong>${escapeHtml(`${s.n}. ${s.address}`)}</strong>` +
                `<div style="margin-top:3px;font-variant-numeric:tabular-nums">${escapeHtml(`${s.priceText} · sold ${s.soldText}`)}</div>` +
                `<div style="margin-top:3px;color:#5f6b69;font-variant-numeric:tabular-nums">${escapeHtml(`${fmtMiles(s.distanceKm)} from the address`)}</div>` +
                (href ? `<div style="margin-top:4px"><a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">The record</a></div>` : "") +
                `</div>`,
            );
          pts.push([s.lat, s.lng]);
        }
        if (radiusKm) {
          // Frame the whole ring: the search's reach is part of the picture.
          const lat = radiusKm / 111.32;
          const lng = radiusKm / (111.32 * Math.cos((subject.lat * Math.PI) / 180) || 1);
          pts.push([subject.lat + lat, subject.lng + lng], [subject.lat - lat, subject.lng - lng]);
        }
        map.fitBounds(L.latLngBounds(pts).pad(0.08), { maxZoom: 16 });
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      baseRef.current = null;
      leafletRef.current = null;
    };
  }, [subject, sales, radiusKm]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || appliedRef.current === basemap) return;
    const next = BASEMAPS[basemap];
    baseRef.current?.remove();
    baseRef.current = L.tileLayer(next.url, {
      maxZoom: next.maxZoom,
      maxNativeZoom: next.maxNativeZoom,
      attribution: next.attribution,
    }).addTo(map);
    baseRef.current.bringToBack();
    appliedRef.current = basemap;
  }, [basemap]);

  if (failed) {
    return (
      <p className="mt-3 rounded-lg bg-faint px-3 py-2 text-sm text-muted">
        The map did not load — the table below lists every sale.
      </p>
    );
  }

  return (
    // Its own stacking context, so Leaflet's z-indexes never draw over the
    // app's sticky bars (#437).
    <div className="relative isolate mt-3">
      <div
        ref={divRef}
        className="uc-map h-72 overflow-hidden rounded-lg border border-line md:h-96"
        role="region"
        aria-label={`Map of ${sales.length} recorded ${sales.length === 1 ? "sale" : "sales"} around the address`}
      />
      <div className="absolute right-2 top-2 z-[1000] flex overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
        {BASEMAP_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setBasemap(id)}
            aria-pressed={basemap === id}
            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${basemap === id ? "bg-brand text-white" : "hover:bg-faint"}`}
          >
            {BASEMAPS[id].label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Copies the table, tab-delimited with the numbers raw, for a spreadsheet. */
export function CopySalesButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false);
        }
      }}
      className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand print:hidden"
      aria-live="polite"
    >
      {done ? "Copied" : "Copy as table"}
    </button>
  );
}
