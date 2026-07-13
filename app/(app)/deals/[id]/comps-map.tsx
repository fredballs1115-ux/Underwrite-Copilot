"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { haversineKm, fmtMiles, MAX_PLAUSIBLE_KM, type LatLng } from "@/lib/geo";

/** One pin/row on the comps map — OM broker comps and public-web comps carry
 *  the same shape with a different `kind` (and marker color). */
export interface MapComp {
  id: string;
  kind: "om" | "web";
  name: string;
  detail: string;
  /** "OM p. 14" / the public source name */
  sourceLabel: string;
  /** omUrl#page=N for OM comps, the article URL for web comps, null if none */
  sourceHref: string | null;
  /** the geocoding query (name + market / stated location) */
  query: string;
}

interface Placed extends MapComp {
  pos: LatLng | null;
  distanceKm: number | null;
}

const GEO_CACHE_KEY = "uc:geocode:v1";

function readGeoCache(): Record<string, LatLng | null> {
  try {
    return JSON.parse(sessionStorage.getItem(GEO_CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function writeGeoCache(cache: Record<string, LatLng | null>) {
  try {
    sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable — geocodes are per-mount only
  }
}

/** Free-text geocode via Photon (the same free service the address
 *  autocomplete uses). Returns null when nothing matches. */
async function geocode(q: string): Promise<LatLng | null> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    features?: { geometry?: { coordinates?: [number, number] } }[];
  };
  const c = json.features?.[0]?.geometry?.coordinates;
  return c && Number.isFinite(c[0]) && Number.isFinite(c[1])
    ? { lat: c[1], lng: c[0] }
    : null;
}

type SortKey = "distance" | "name" | "kind";

/**
 * COMPARABLE ANALYSIS map (Feature 4). Plots the subject property and the
 * comps — broker comps from the OM in one color, public-web comps in another —
 * on a free OpenStreetMap base layer (no API key), geocoded via Photon. A pin
 * that geocodes implausibly far from the subject is dropped from the MAP but
 * stays in the table with no distance: fuzzy geocoding must never invent a
 * location. The table sorts by distance/name and a row click zooms its pin.
 */
export function CompsMap({
  subjectLabel,
  market,
  comps,
}: {
  /** the subject's best address line (street address, else market) */
  subjectLabel: string;
  /** metro context appended to comp geocode queries */
  market: string;
  comps: MapComp[];
}) {
  const [placed, setPlaced] = useState<Placed[] | null>(null);
  const [subjectPos, setSubjectPos] = useState<LatLng | null>(null);
  const [phase, setPhase] = useState<"locating" | "ready" | "nomap">("locating");
  const [sortKey, setSortKey] = useState<SortKey>("distance");
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Map<string, Leaflet.CircleMarker>>(new Map());
  const mapDivRef = useRef<HTMLDivElement | null>(null);

  // ── Geocode subject + comps (cached, sequential — kind to the free API) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cache = readGeoCache();
      const lookup = async (q: string): Promise<LatLng | null> => {
        if (q in cache) return cache[q];
        try {
          const pos = await geocode(q);
          cache[q] = pos;
          writeGeoCache(cache);
          return pos;
        } catch {
          return null; // offline / blocked — table still renders
        }
      };

      const subj =
        (subjectLabel.trim() ? await lookup(subjectLabel.trim()) : null) ??
        (market.trim() ? await lookup(market.trim()) : null);
      if (cancelled) return;
      setSubjectPos(subj);

      const out: Placed[] = [];
      for (const c of comps) {
        const pos = c.query.trim() ? await lookup(c.query.trim()) : null;
        if (cancelled) return;
        // Plausibility gate: a name-match that lands metro-distances away is
        // NOT this comp — keep it off the map rather than pin it wrong.
        const plausible =
          pos && subj ? haversineKm(subj, pos) <= MAX_PLAUSIBLE_KM : !!pos && !subj;
        out.push({
          ...c,
          pos: plausible ? pos : null,
          distanceKm: plausible && pos && subj ? haversineKm(subj, pos) : null,
        });
      }
      if (cancelled) return;
      setPlaced(out);
      setPhase(subj || out.some((c) => c.pos) ? "ready" : "nomap");
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectLabel, market, comps]);

  // ── Build the Leaflet map once positions are in ──────────────────────────
  useEffect(() => {
    if (phase !== "ready" || !placed || !mapDivRef.current || mapRef.current) return;
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !mapDivRef.current || mapRef.current) return;

      const pts: LatLng[] = [
        ...(subjectPos ? [subjectPos] : []),
        ...placed.filter((c) => c.pos).map((c) => c.pos!),
      ];
      if (!pts.length) return;

      const map = L.map(mapDivRef.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      if (subjectPos) {
        L.marker(subjectPos, {
          icon: L.divIcon({
            className: "",
            html: '<div style="font-size:22px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))">★</div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
          title: "Subject property",
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindTooltip("Subject property");
      }

      for (const c of placed) {
        if (!c.pos) continue;
        const color = c.kind === "om" ? "#114e54" : "#a05a1c";
        const m = L.circleMarker(c.pos, {
          radius: 8,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.35,
        })
          .addTo(map)
          .bindTooltip(c.name)
          .bindPopup(
            `<div style="max-width:230px"><strong>${escapeHtml(c.name)}</strong>` +
              `<div style="margin-top:2px">${escapeHtml(c.detail)}</div>` +
              (c.sourceHref
                ? `<a href="${escapeAttr(c.sourceHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.sourceLabel)}</a>`
                : `<span>${escapeHtml(c.sourceLabel)}</span>`) +
              `</div>`,
          );
        markersRef.current.set(c.id, m);
      }

      const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.25), { maxZoom: 14 });
    })();
    // Snapshot the marker registry now — the ref object may be repopulated by
    // a re-run before this cleanup fires.
    const markers = markersRef.current;
    return () => {
      disposed = true;
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [phase, placed, subjectPos]);

  const rows = useMemo(() => {
    const list = [...(placed ?? [])];
    list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "kind") return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
      // distance: placed pins first (nearest first), unplaced last
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      return da - db || a.name.localeCompare(b.name);
    });
    return list;
  }, [placed, sortKey]);

  const zoomTo = (c: Placed) => {
    const m = c.id ? markersRef.current.get(c.id) : null;
    if (m && mapRef.current) {
      mapRef.current.flyTo(m.getLatLng(), 14, { duration: 0.6 });
      m.openPopup();
    }
  };

  if (!comps.length) return null;

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Comps on the map</p>
        <p className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "#114e54", background: "#114e5459" }} />
            OM broker comps
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "#a05a1c", background: "#a05a1c59" }} />
            Public-web comps
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden>★</span> Subject
          </span>
        </p>
      </div>

      {phase === "locating" && (
        <div className="mt-3 flex h-72 items-center justify-center rounded-lg bg-faint text-sm text-muted">
          Placing comps on the map…
        </div>
      )}
      {phase === "ready" && <div ref={mapDivRef} className="mt-3 h-72 rounded-lg" />}
      {phase === "nomap" && (
        <div className="mt-3 rounded-lg bg-faint px-3 py-2 text-sm text-muted">
          Couldn&apos;t place these comps on a map — the table below lists them all.
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-medium uppercase tracking-wide text-muted">
              <Th label="Comp" onClick={() => setSortKey("name")} active={sortKey === "name"} />
              <Th label="Distance" onClick={() => setSortKey("distance")} active={sortKey === "distance"} />
              <th className="py-1.5 pr-3 font-medium">Details</th>
              <Th label="Source" onClick={() => setSortKey("kind")} active={sortKey === "kind"} />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => zoomTo(c)}
                className={`border-b border-line/60 last:border-0 ${c.pos ? "cursor-pointer hover:bg-faint" : ""}`}
                title={c.pos ? "Show on the map" : "Not placeable on the map"}
              >
                <td className="max-w-52 truncate py-2 pr-3 font-medium">
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ background: c.kind === "om" ? "#114e54" : "#a05a1c" }}
                  />
                  {c.name}
                </td>
                <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs tabular-nums">
                  {c.distanceKm != null ? fmtMiles(c.distanceKm) : <span className="text-muted">—</span>}
                </td>
                <td className="max-w-72 truncate py-2 pr-3 text-muted">{c.detail}</td>
                <td className="whitespace-nowrap py-2 text-xs">
                  {c.sourceHref ? (
                    <a
                      href={c.sourceHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-brand hover:text-brand-strong"
                    >
                      {c.sourceLabel}
                    </a>
                  ) : (
                    <span className="text-muted">{c.sourceLabel}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Broker comps are read out of the OM; public-web comps come from publicly
        reported sales as cited by their sources. Pin locations are geocoded
        from names and addresses and are approximate — a comp that can&apos;t be
        placed confidently is listed without a pin, never guessed. Accuracy
        depends on public reporting and may lag the current market.
      </p>
    </div>
  );
}

function Th({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <th className="py-1.5 pr-3 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`uppercase tracking-wide transition-colors ${active ? "text-ink" : "hover:text-ink"}`}
      >
        {label}
        {active && <span aria-hidden> ↓</span>}
      </button>
    </th>
  );
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;",
  );
const escapeAttr = (s: string) => escapeHtml(s).replaceAll("`", "&#96;");
