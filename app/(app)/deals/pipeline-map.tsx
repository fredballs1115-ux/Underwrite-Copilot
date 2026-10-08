"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { BASEMAPS, BASEMAP_ORDER, OSM_ATTRIBUTION, type BasemapId } from "@/lib/basemaps";
import {
  MAX_TO_PLACE,
  PIN_LABEL,
  PIN_UNSCREENED,
  pinColor,
  pinHtml,
  pinTapAction,
  pinTitle,
  placementLine,
  partitionForMap,
  osmPlacedAny,
  previewHtml,
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
 * selects instead of opening, as a card's does. On a touch screen, which has
 * no hover, a pin's first tap shows its card and a second tap — on the pin
 * or on the card — opens the deal (`pinTapAction`).
 */
const BASE_DEFAULT: BasemapId = "hybrid";
const CONCURRENCY = 3;
/** How long the hover card waits, once the pointer leaves the pin or the
 *  card, before it closes: long enough to cross the gap between the two
 *  (the card's arrow takes no pointer), so the card can be hovered
 *  (WCAG 1.4.13). */
const CARD_CLOSE_DELAY_MS = 300;

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
  const compareRef = useRef(compareMode);
  useEffect(() => {
    compareRef.current = compareMode;
    clickRef.current = (id: string) => {
      if (compareMode && onToggle) onToggle(id);
      else router.push(`/deals/${id}`);
    };
  }, [compareMode, onToggle, router]);
  // The pointer that last pressed a pin, and whether that pin's card was
  // open as it did: read when the click lands, after Leaflet has already
  // toggled the card, so a finger's second tap on a pin still opens it.
  const tapRef = useRef<{ id: string; pointer: string; open: boolean } | null>(null);
  // The deal whose card is open on a touch screen. The pins are rebuilt
  // whenever the list re-renders — the pipeline refreshes every few seconds
  // while a deal screens, and the map places pins as they resolve — and a
  // rebuild removes the open card with its marker, so the second tap only
  // showed the card again. The card is re-opened on the rebuilt pin.
  const openRef = useRef<string | null>(null);

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
    // Escape dismisses the open card wherever the focus is, without moving
    // the pointer or the focus (WCAG 1.4.13).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      pinsRef.current?.eachLayer((layer) => {
        layer.closeTooltip();
      });
      mapRef.current?.closePopup();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      document.removeEventListener("keydown", onKey);
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
    // Read before the clear: removing a marker closes its card, and the
    // close would forget which one was open.
    const reopen = openRef.current;
    group.clearLayers();
    openRef.current = reopen;
    // A touch screen has no hover to show a card on: there the card is a
    // popup a pin's first tap opens, and the card itself is a way in. In
    // compare mode a tap picks at once, so no card is bound to flash open
    // and pan the map on every pick.
    const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const withCard = coarse && !compareMode;
    let reopened: Leaflet.Marker | null = null;
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
          popupAnchor: [0, -size / 2],
        }),
        title: pinTitle(deal),
        keyboard: true,
        riseOnHover: true,
      });
      if (withCard) {
        marker.bindPopup(previewHtml(deal), { closeButton: false, className: "uc-maptip-pop", maxWidth: 280, autoPanPadding: [16, 16] });
        marker.on("popupclose", () => {
          if (openRef.current === deal.id) openRef.current = null;
        });
        // Leaflet writes the card afresh on every open, so its link is
        // wired on every open. A click with a modifier is the browser's.
        marker.on("popupopen", (e: Leaflet.PopupEvent) => {
          openRef.current = deal.id;
          const link = e.popup.getElement()?.querySelector<HTMLAnchorElement>("a[data-maptip-link]");
          if (!link) return;
          link.onclick = (ev) => {
            if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
            ev.preventDefault();
            clickRef.current(deal.id);
          };
        });
      } else if (!coarse) {
        // The card takes the pointer (`interactive`), and its pointer events
        // reach this marker, Leaflet's parent for them. Leaflet closes the
        // card the moment the pointer leaves the pin, before it can reach
        // the card; that close is swapped for one that waits a moment, and
        // entering the pin or the card again keeps the card open.
        marker.bindTooltip(tooltipHtml(deal), { direction: "top", className: "uc-maptip-wrap", opacity: 1, interactive: true });
        marker.off("mouseout", marker.closeTooltip);
        let closing: ReturnType<typeof setTimeout> | undefined;
        marker.on("mouseout", () => {
          clearTimeout(closing);
          closing = setTimeout(() => marker.closeTooltip(), CARD_CLOSE_DELAY_MS);
        });
        marker.on("mouseover", () => clearTimeout(closing));
      }
      marker.on("click", () => {
        const tap = tapRef.current?.id === deal.id ? tapRef.current : null;
        tapRef.current = null;
        const action = pinTapAction({
          coarse,
          compare: compareRef.current,
          pointer: tap?.pointer ?? null,
          previewOpen: tap?.open ?? false,
        });
        // "preview": Leaflet's own click handler has just opened the card.
        // "open" with a card bound (a mouse on a touch-first device) closes
        // the card it opened on the way out.
        if (action === "open") {
          if (withCard) marker.closePopup();
          clickRef.current(deal.id);
        }
      });
      marker.on("keypress", (e: Leaflet.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === "Enter") clickRef.current(deal.id);
      });
      group.addLayer(marker);
      marker.getElement()?.addEventListener("pointerdown", (ev) => {
        tapRef.current = { id: deal.id, pointer: ev.pointerType, open: marker.isPopupOpen() };
      });
      if (withCard && reopen === deal.id) reopened = marker;
    }
    // The card that was open before the rebuild, open again where it was —
    // without the pan an open asks for, since the reader has not moved.
    if (reopened) {
      const popup = reopened.getPopup();
      if (popup) {
        popup.options.autoPan = false;
        reopened.openPopup();
        popup.options.autoPan = true;
      }
    } else if (reopen) {
      openRef.current = null;
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
  }, [ready, points, selected, compareMode]);

  // A pin Photon placed is OpenStreetMap's data: the map credits it over
  // every basemap while one is drawn (the batch-2 audit, LOW-8). The street
  // tiles carry the same string, which the control prints once.
  const osmPins = osmPlacedAny(points);
  const osmCredited = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || osmPins === osmCredited.current) return;
    if (osmPins) map.attributionControl?.addAttribution(OSM_ATTRIBUTION);
    else map.attributionControl?.removeAttribution(OSM_ATTRIBUTION);
    osmCredited.current = osmPins;
  }, [ready, osmPins]);

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
      {/* Its own stacking context: Leaflet sets z-index 400–1000 on its panes
          and these controls, which would otherwise draw over the app's sticky
          bars as the map scrolls under them (#437). */}
      <div className="relative isolate">
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
