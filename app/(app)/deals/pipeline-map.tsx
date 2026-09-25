"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { BASEMAPS, BASEMAP_ORDER, type BasemapId } from "@/lib/basemaps";
import {
  MAX_TO_PLACE,
  PIN_LABEL,
  PIN_UNSCREENED,
  pinColor,
  pinHtml,
  placementLine,
  partitionForMap,
  tooltipHtml,
  type MapDeal,
  type MapPlace,
} from "@/lib/pipeline-map";

/**
 * The pipeline on one map (#431) — every deal the filters leave, where it
 * is, in the colour of its call. The view a deal team pins to the wall:
 * where the pipeline is concentrated, what the screen said about each
 * place, one hover from the building's picture and one click from its page.
 *
 * Each pin sits on the location lib/deal-location cached for the deal's own
 * pictures, so the map and the aerial agree. A deal with an address and no
 * location yet is placed here through the same cached route — a few at a
 * time, `MAX_TO_PLACE` at most — and joins the map as it resolves; one no
 * geocoder could place is counted, never guessed. In compare mode a click
 * selects instead of opening, as a card's does.
 */
const BASE_DEFAULT: BasemapId = "hybrid";
const CONCURRENCY = 3;

export function PipelineMap({
  deals,
  compareMode = false,
  selected,
  onToggle,
}: {
  deals: MapDeal[];
  compareMode?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  const router = useRouter();
  const part = useMemo(() => partitionForMap(deals), [deals]);
  // Locations resolved on this view, by deal id; a null is a definitive miss.
  const [resolved, setResolved] = useState<Record<string, MapPlace | null>>({});
  const [basemap, setBasemap] = useState<BasemapId>(BASE_DEFAULT);
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.TileLayer | null>(null);
  const pinsRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const touchedRef = useRef(false);
  const [ready, setReady] = useState(false);
  // The latest click behaviour, read by the pins without rebuilding them;
  // kept current in an effect, never written during render.
  const clickRef = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    clickRef.current = (id: string) => {
      if (compareMode && onToggle) onToggle(id);
      else router.push(`/deals/${id}`);
    };
  }, [compareMode, onToggle, router]);

  const points = useMemo(() => {
    const out: { deal: MapDeal; place: MapPlace }[] = part.placed.map((d) => ({ deal: d, place: d.place! }));
    for (const d of part.toPlace) {
      const p = resolved[d.id];
      if (p) out.push({ deal: d, place: p });
    }
    return out;
  }, [part, resolved]);

  const waiting = part.toPlace.filter((d) => !(d.id in resolved)).slice(0, MAX_TO_PLACE);
  const missed = part.toPlace.filter((d) => d.id in resolved && resolved[d.id] === null).length;
  const beyond = Math.max(0, part.toPlace.length - MAX_TO_PLACE);

  // Place what is not placed yet, a few at a time, through the cached route.
  useEffect(() => {
    const queue = part.toPlace.slice(0, MAX_TO_PLACE).map((d) => d.id);
    if (queue.length === 0) return;
    let cancelled = false;
    const next = async (): Promise<void> => {
      const id = queue.shift();
      if (!id || cancelled) return;
      let place: MapPlace | null = null;
      try {
        const res = await fetch(`/api/deals/${encodeURIComponent(id)}/location`, { signal: AbortSignal.timeout(12_000) });
        if (res.ok) place = (await res.json()) as MapPlace;
      } catch {
        place = null;
      }
      if (!cancelled) setResolved((r) => ({ ...r, [id]: place }));
      return next();
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => next()));
    return () => {
      cancelled = true;
    };
  }, [part]);

  // Build the map once.
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !divRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(divRef.current, { scrollWheelZoom: false, worldCopyJump: true }).setView([39.5, -96], 4);
      mapRef.current = map;
      const base = BASEMAPS[BASE_DEFAULT];
      layerRef.current = L.tileLayer(base.url, {
        maxZoom: base.maxZoom,
        maxNativeZoom: base.maxNativeZoom,
        attribution: base.attribution,
      }).addTo(map);
      L.control.scale({ imperial: true, metric: false }).addTo(map);
      pinsRef.current = L.layerGroup().addTo(map);
      // Once the reader moves the map, a pin that resolves late is added
      // where it belongs without pulling the view away from them.
      map.on("dragstart zoomstart", () => {
        touchedRef.current = true;
      });
      setReady(true);
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      pinsRef.current = null;
    };
  }, []);

  // Draw the pins, and frame them until the reader takes the map over.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const group = pinsRef.current;
    if (!ready || !L || !map || !group) return;
    group.clearLayers();
    for (const { deal, place } of points) {
      const isSelected = !!selected?.has(deal.id);
      const size = isSelected ? 30 : 22;
      const marker = L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          className: "uc-pin",
          html: pinHtml(deal.verdict, place.precision, isSelected),
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          tooltipAnchor: [0, -size / 2 - 1],
        }),
        title: deal.name,
        keyboard: true,
        riseOnHover: true,
      });
      marker.bindTooltip(tooltipHtml(deal), { direction: "top", className: "uc-maptip-wrap", opacity: 1 });
      marker.on("click", () => clickRef.current(deal.id));
      marker.on("keypress", (e: Leaflet.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === "Enter") clickRef.current(deal.id);
      });
      group.addLayer(marker);
    }
    if (touchedRef.current || points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].place.lat, points[0].place.lng], 13);
    } else {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.place.lat, p.place.lng] as [number, number])), {
        padding: [36, 36],
        maxZoom: 14,
      });
    }
  }, [ready, points, selected]);

  // Basemap switch: swap the tile layer in place, keeping the view and pins.
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
    layerRef.current.bringToBack();
  }, [basemap]);

  const counts = { placed: points.length, placing: waiting.length, later: beyond, unplaceable: part.unplaceable.length + missed };
  const legend: { label: string; color: string; n: number }[] = [
    ...(["pass", "caution", "pass_on"] as const).map((v) => ({
      label: PIN_LABEL[v],
      color: pinColor(v),
      n: points.filter((p) => p.deal.verdict === v).length,
    })),
    { label: "Not screened", color: PIN_UNSCREENED, n: points.filter((p) => !p.deal.verdict || !PIN_LABEL[p.deal.verdict]).length },
  ];

  return (
    <section aria-label="The pipeline on a map" data-view="map" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="relative">
        <div ref={divRef} className="uc-map h-[26rem] bg-faint md:h-[34rem]" />
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
        {/* The legend is the split bar's four calls, with how many of each
            are on the map. */}
        <ul
          aria-label="What each pin's colour means"
          className="absolute bottom-6 left-2 z-[1000] space-y-1 rounded-lg border border-line bg-surface/95 px-2.5 py-2 text-[11px] shadow-sm"
        >
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: l.color }} />
              <span>{l.label}</span>
              <span className="font-mono tabular-nums text-muted">{l.n}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-muted" data-map-count>
        {placementLine(counts)}
      </p>
    </section>
  );
}
