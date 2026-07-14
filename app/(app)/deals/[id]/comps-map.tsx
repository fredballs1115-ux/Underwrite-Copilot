"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { haversineKm, fmtMiles, MAX_PLAUSIBLE_KM, type LatLng } from "@/lib/geo";
import { safeHttpUrl } from "@/lib/safe-url";

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
  /** ordered geocode queries, most specific first (lib/geo geocodeCandidates) */
  queries: string[];
}

interface Placed extends MapComp {
  /** 1-based pin number, shared verbatim by the map pin and the table row */
  n: number;
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
    // A hung endpoint must fail fast into the table-only fallback, not leave
    // the card stuck on "Placing comps…" forever.
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
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

const PIN_COLOR: Record<MapComp["kind"], string> = {
  om: "#114e54",
  web: "#a05a1c",
};
const MILE_M = 1609.344;

/** Numbered teardrop pin (SVG in a divIcon) — the number ties the pin to its
 *  table row, the fill color to its source. */
function pinHtml(n: number, color: string): string {
  return (
    `<svg class="uc-pin" width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M15 39C15 39 28 24.5 28 14A13 13 0 1 0 2 14C2 24.5 15 39 15 39Z" fill="${color}" stroke="#ffffff" stroke-width="2"/>` +
    `<text x="15" y="18.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#ffffff">${n}</text>` +
    `</svg>`
  );
}

/** The subject's star pin — larger, always on top. */
function subjectPinHtml(): string {
  return (
    `<svg class="uc-pin" width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M18 47C18 47 34 29.5 34 17A16 16 0 1 0 2 17C2 29.5 18 47 18 47Z" fill="#18211f" stroke="#ffffff" stroke-width="2"/>` +
    `<path d="M18 8.5l2.6 5.3 5.9.9-4.2 4.1 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.2-4.1 5.9-.9z" fill="#7fd6cc"/>` +
    `</svg>`
  );
}

/**
 * COMPARABLE ANALYSIS map (Feature 4). Plots the subject property and the
 * comps — broker comps from the OM in teal, public-web comps in orange — on
 * a desaturated OpenStreetMap base (no API key), geocoded via Photon with an
 * address-first query ladder. Pins are numbered to match the table rows;
 * hovering a row lifts its pin, clicking flies to it. Dashed rings mark 1
 * and 3 miles around the subject. A pin that geocodes implausibly far from
 * the subject is dropped from the MAP but stays in the table with no
 * distance: fuzzy geocoding must never invent a location.
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
  const markersRef = useRef<Map<string, Leaflet.Marker>>(new Map());
  const mapDivRef = useRef<HTMLDivElement | null>(null);

  // ── Geocode subject + comps (cached, sequential — kind to the free API) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cache = readGeoCache();
      const lookupOne = async (q: string): Promise<LatLng | null> => {
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
      // Try each candidate query until one lands — cache remembers misses,
      // so a re-mount never re-pays a known-dead query.
      const lookup = async (queries: string[]): Promise<LatLng | null> => {
        for (const q of queries) {
          const pos = await lookupOne(q);
          if (pos || cancelled) return pos;
        }
        return null;
      };

      const subj =
        (subjectLabel.trim() ? await lookupOne(subjectLabel.trim()) : null) ??
        (market.trim() ? await lookupOne(market.trim()) : null);
      if (cancelled) return;
      setSubjectPos(subj);

      const out: Placed[] = [];
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        const pos = await lookup(c.queries);
        if (cancelled) return;
        // Plausibility gate: a name-match that lands metro-distances away is
        // NOT this comp — keep it off the map rather than pin it wrong.
        const plausible =
          pos && subj ? haversineKm(subj, pos) <= MAX_PLAUSIBLE_KM : !!pos && !subj;
        out.push({
          ...c,
          n: i + 1,
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
        // Distance rings before the pins so they sit underneath.
        for (const miles of [1, 3]) {
          L.circle(subjectPos, {
            radius: miles * MILE_M,
            color: "#114e54",
            weight: 1,
            opacity: 0.35,
            dashArray: "4 5",
            fillColor: "#114e54",
            fillOpacity: 0.02,
            interactive: false,
          }).addTo(map);
        }
        L.marker(subjectPos, {
          icon: L.divIcon({
            className: "",
            html: subjectPinHtml(),
            iconSize: [36, 48],
            iconAnchor: [18, 47],
            tooltipAnchor: [0, -40],
          }),
          title: "Subject property",
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindTooltip("Subject property");
      }

      for (const c of placed) {
        if (!c.pos) continue;
        // Comp names/details/links are LLM output over hostile documents:
        // Leaflet innerHTMLs tooltip AND popup strings, so EVERYTHING is
        // escaped, and hrefs pass the http(s) allowlist or don't render.
        const href = safeHttpUrl(c.sourceHref);
        const m = L.marker(c.pos, {
          icon: L.divIcon({
            className: "",
            html: pinHtml(c.n, PIN_COLOR[c.kind]),
            iconSize: [30, 40],
            iconAnchor: [15, 39],
            tooltipAnchor: [0, -34],
            popupAnchor: [0, -34],
          }),
          title: c.name,
        })
          .addTo(map)
          .bindTooltip(escapeHtml(c.name))
          .bindPopup(
            `<div style="max-width:240px"><strong>${escapeHtml(`${c.n}. ${c.name}`)}</strong>` +
              `<div style="margin-top:3px;color:#5f6b69">${escapeHtml(c.detail)}</div>` +
              (c.distanceKm != null
                ? `<div style="margin-top:3px;font-variant-numeric:tabular-nums">${escapeHtml(fmtMiles(c.distanceKm))} from the subject</div>`
                : "") +
              `<div style="margin-top:4px">` +
              (href
                ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.sourceLabel)}</a>`
                : `<span>${escapeHtml(c.sourceLabel)}</span>`) +
              `</div></div>`,
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
    // The comps are already in hand — list them immediately; distances fill
    // in when geocoding completes (never gate the data behind the network).
    const list: Placed[] = placed
      ? [...placed]
      : comps.map((c, i) => ({ ...c, n: i + 1, pos: null, distanceKm: null }));
    list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "kind") return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
      // distance: placed pins first (nearest first), unplaced last
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      return da - db || a.name.localeCompare(b.name);
    });
    return list;
  }, [placed, comps, sortKey]);

  const placedCount = placed?.filter((c) => c.pos).length ?? 0;

  const zoomTo = (c: Placed) => {
    const m = c.id ? markersRef.current.get(c.id) : null;
    if (m && mapRef.current) {
      mapRef.current.flyTo(m.getLatLng(), 14, { duration: 0.6 });
      m.openPopup();
    }
  };
  // Row hover lifts the matching pin — the map and table read as one unit.
  const setActive = (c: Placed, on: boolean) => {
    const el = markersRef.current.get(c.id)?.getElement();
    el?.querySelector(".uc-pin")?.classList.toggle("uc-pin-active", on);
  };

  if (!comps.length) return null;

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          Comps on the map
          {placed && (
            <span className="ml-2 font-normal text-muted">
              {placedCount} of {placed.length} placed
            </span>
          )}
        </p>
        <p className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLOR.om }} />
            OM comps
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLOR.web }} />
            Public-web comps
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full border border-dashed"
              style={{ borderColor: "#114e54" }}
            />
            1 &amp; 3 mi rings
          </span>
        </p>
      </div>

      {phase === "locating" && (
        <div className="mt-3 flex h-80 items-center justify-center rounded-lg bg-faint text-sm text-muted md:h-96">
          Placing comps on the map…
        </div>
      )}
      {phase === "ready" && (
        <div ref={mapDivRef} className="uc-map mt-3 h-80 overflow-hidden rounded-lg border border-line md:h-96" />
      )}
      {phase === "nomap" && (
        <div className="mt-3 rounded-lg bg-faint px-3 py-2 text-sm text-muted">
          Couldn&apos;t place these comps on a map — the table below lists them all.
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-medium uppercase tracking-wide text-muted">
              <th className="w-8 py-1.5 pr-2 font-medium" aria-label="Pin number" />
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
                onMouseEnter={() => setActive(c, true)}
                onMouseLeave={() => setActive(c, false)}
                className={`border-b border-line/60 last:border-0 ${c.pos ? "cursor-pointer hover:bg-faint" : ""}`}
                title={c.pos ? "Show on the map" : "Not placeable on the map"}
              >
                <td className="py-2 pr-2">
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      c.pos ? "" : "opacity-35"
                    }`}
                    style={{ background: PIN_COLOR[c.kind] }}
                  >
                    {c.n}
                  </span>
                </td>
                <td className="max-w-52 truncate py-2 pr-3 font-medium">{c.name}</td>
                <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs tabular-nums">
                  {c.distanceKm != null ? (
                    fmtMiles(c.distanceKm)
                  ) : placed ? (
                    <span
                      className="rounded-full bg-faint px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted"
                      title="Couldn't be located confidently — never guessed"
                    >
                      no pin
                    </span>
                  ) : (
                    <span className="text-muted">…</span>
                  )}
                </td>
                <td className="max-w-72 truncate py-2 pr-3 text-muted">{c.detail}</td>
                <td className="whitespace-nowrap py-2 text-xs">
                  {(() => {
                    const href = safeHttpUrl(c.sourceHref);
                    return href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-brand hover:text-brand-strong"
                      >
                        {c.sourceLabel}
                      </a>
                    ) : (
                      <span className="text-muted">{c.sourceLabel}</span>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Broker comps are read out of the OM; public-web comps come from publicly
        reported sales as cited by their sources. Pins are geocoded from
        addresses when one is stated, else the comp&apos;s name — locations are
        approximate, and a comp that can&apos;t be placed confidently is listed
        without a pin, never guessed. Accuracy depends on public reporting and
        may lag the current market.
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
