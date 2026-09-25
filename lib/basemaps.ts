// Basemap sources for every map and every "real picture of the property" in
// the app. PURE and universal — the client map imports the tile templates,
// the server aerial route imports the static-export URL builder, and the
// tests import the Web-Mercator math. No I/O in this file.
//
// SOURCING RULE (same spirit as the Street View route): only real imagery of
// the real place, from a source we are allowed to use commercially.
//
//   · Satellite/aerial → USGS National Map "USGSImageryOnly". A work of the
//     US federal government, public domain, no API key, no per-request
//     licence. Covers the whole US at sub-metre NAIP resolution in most of
//     the country. https://apps.nationalmap.gov/services/
//   · Streets → OpenStreetMap raster tiles (ODbL, attribution required).
//   · Street-level building fronts → Google Street View, but ONLY through
//     /api/deals/[id]/photo and ONLY when GOOGLE_MAPS_API_KEY is set. There
//     is no keyless way to fetch Street View, so that view is optional.
//
// Deliberately NOT used: Esri's arcgisonline basemap tiles. They work without
// a key and everyone uses them, but Esri's terms tie basemap consumption to
// an ArcGIS subscription — not a footing to put a commercial product on.

export interface Basemap {
  id: BasemapId;
  /** control label */
  label: string;
  /** Leaflet tile-URL template */
  url: string;
  /** required attribution, rendered by the map control */
  attribution: string;
  /** highest zoom the map allows (over-zoomed past maxNativeZoom) */
  maxZoom: number;
  /** deepest zoom the source actually serves tiles for */
  maxNativeZoom: number;
  /** true when the basemap is photography rather than a drawing */
  photographic: boolean;
}

export type BasemapId = "satellite" | "hybrid" | "streets";

const USGS_IMAGERY =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer";
// The same orthoimagery with the National Map's transportation, boundary and
// place-name layers drawn over it — the "hybrid" view, and the reason Google's
// satellite mode is readable rather than just pretty. Also public domain.
const USGS_IMAGERY_TOPO =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer";

export const BASEMAPS: Record<BasemapId, Basemap> = {
  // ArcGIS tile services address tiles as {z}/{row}/{col} — i.e. y before x.
  // Leaflet substitutes by placeholder name, so the swapped order is correct
  // here and NOT a typo.
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: `${USGS_IMAGERY}/tile/{z}/{y}/{x}`,
    attribution:
      'Imagery: <a href="https://www.usgs.gov/" target="_blank" rel="noopener noreferrer">USGS</a> The National Map — public domain',
    maxZoom: 19,
    // The national mosaic thins out past z18; over-zoom rather than show the
    // gray "no tile" checkerboard at the zoom people actually want.
    maxNativeZoom: 18,
    photographic: true,
  },
  hybrid: {
    id: "hybrid",
    label: "Hybrid",
    url: `${USGS_IMAGERY_TOPO}/tile/{z}/{y}/{x}`,
    attribution:
      'Imagery &amp; map: <a href="https://www.usgs.gov/" target="_blank" rel="noopener noreferrer">USGS</a> The National Map — public domain',
    maxZoom: 19,
    maxNativeZoom: 18,
    photographic: true,
  },
  streets: {
    id: "streets",
    label: "Map",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
    maxNativeZoom: 19,
    photographic: false,
  },
};

/** Photography first: the point of the map is to show the real place. */
export const DEFAULT_BASEMAP: BasemapId = "satellite";

export const BASEMAP_ORDER: BasemapId[] = ["satellite", "hybrid", "streets"];

export function basemapById(id: string | null | undefined): Basemap {
  return BASEMAPS[(id ?? "") as BasemapId] ?? BASEMAPS[DEFAULT_BASEMAP];
}

// ── Web Mercator (EPSG:3857) ─────────────────────────────────────────────
// Only needed to ask the USGS export endpoint for a static image of an exact
// spot at an exact scale. Standard spherical Mercator, same constants every
// slippy-map uses.

const EARTH_R = 6378137;
/** Metres of projected space per pixel at zoom 0, 256px tiles. */
export const RES_Z0 = (2 * Math.PI * EARTH_R) / 256;
/** Mercator is undefined at the poles; every slippy map clamps here. */
export const MAX_MERCATOR_LAT = 85.051_128_78;

export interface Point {
  lat: number;
  lng: number;
}

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function toMercator({ lat, lng }: Point): { x: number; y: number } {
  const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  return {
    x: EARTH_R * ((lng * Math.PI) / 180),
    y: EARTH_R * Math.log(Math.tan(Math.PI / 4 + rad / 2)),
  };
}

/** Projected metres per pixel at a zoom level (256px tiles). */
export function resolution(zoom: number): number {
  return RES_Z0 / 2 ** zoom;
}

/** GROUND metres per pixel — the projected resolution shrinks by cos(lat). */
export function groundResolution(lat: number, zoom: number): number {
  const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  return resolution(zoom) * Math.cos((clamped * Math.PI) / 180);
}

/** The EPSG:3857 bbox a `width`×`height` image at `zoom` covers around a point. */
export function mercatorBbox(
  center: Point,
  zoom: number,
  width: number,
  height: number,
): Bbox {
  const res = resolution(zoom);
  const { x, y } = toMercator(center);
  const halfW = (width * res) / 2;
  const halfH = (height * res) / 2;
  return { minX: x - halfW, minY: y - halfH, maxX: x + halfW, maxY: y + halfH };
}

export interface AerialRequest {
  center: Point;
  /** slippy-map zoom; ~18 frames a single building, ~16 frames a block */
  zoom: number;
  width: number;
  height: number;
}

/**
 * A single static JPEG of the real place, from USGS. Used anywhere an
 * interactive map is the wrong tool: list thumbnails, the shared report,
 * the exported memo — all of which need an <img>, not a Leaflet canvas.
 */
export function usgsAerialUrl(req: AerialRequest): string {
  const params = new URLSearchParams({
    ...frameParams(req),
    format: "jpg",
    transparent: "false",
    f: "image",
  });
  return `${USGS_IMAGERY}/export?${params.toString()}`;
}

/** The frame an ArcGIS `export` draws: one definition, so two layers asked
 *  for the same request cover the same ground to the pixel. */
function frameParams({ center, zoom, width, height }: AerialRequest): Record<string, string> {
  const b = mercatorBbox(center, zoom, width, height);
  return {
    bbox: [b.minX, b.minY, b.maxX, b.maxY].map((n) => n.toFixed(3)).join(","),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${Math.round(width)},${Math.round(height)}`,
  };
}

/**
 * FEMA's National Flood Hazard Layer: the flood insurance rate maps as a map
 * service. A US federal work, public domain, no key.
 */
export const NFHL_ROOT = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";

/**
 * The Flood tab's frame. At the aerial's own zoom (z19 for a street address)
 * one zone fills the frame and the photograph is soft; at z17 the frame is
 * about 1.2 km across at US latitudes and shows the zone's edges and the
 * river or coast that makes it — judged on the runner's composites
 * (flood-sheet, 2026-09-25).
 */
export const FLOOD_ZOOM = 17;

/** Below this FEMA draws nothing: the zones layer's minScale, 1:36,112 as
 *  the runner printed it, is z14 at the equator, and a frame at the limit is
 *  a bet on rounding. */
export const FLOOD_MIN_ZOOM = 15;

/** The full report's flood map (#427): the Flood tab's own zoom, at print
 *  resolution for a figure the width of a LETTER page (524pt at 2x). The
 *  fetch and the PDF's frame both read it, so the picture is never
 *  stretched. */
export const REPORT_FLOOD_SIZE = { width: 1040, height: 468, zoom: FLOOD_ZOOM } as const;

/**
 * FEMA's flood zones for EXACTLY the frame `usgsAerialUrl` draws — the same
 * bbox from the same centre, zoom and size — as a transparent PNG, so the one
 * lies over the other pixel for pixel on the deal page's Flood tab. The layer
 * is the service's own zones layer, its id resolved from the service's layer
 * list (`resolveNfhlLayerId` in lib/site-flags), never a number written here.
 */
export function nfhlOverlayUrl(req: AerialRequest & { layerId: number; root?: string }): string {
  const params = new URLSearchParams({
    ...frameParams(req),
    format: "png32",
    transparent: "true",
    layers: `show:${req.layerId}`,
    f: "image",
  });
  return `${req.root ?? NFHL_ROOT}/export?${params.toString()}`;
}

/** Hosts the CSP must allow as image sources for any of the above to render. */
export const BASEMAP_IMG_HOSTS = [
  "https://basemap.nationalmap.gov",
  "https://tile.openstreetmap.org",
  "https://*.tile.openstreetmap.org",
];
