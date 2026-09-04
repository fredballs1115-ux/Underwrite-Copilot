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
export function usgsAerialUrl({ center, zoom, width, height }: AerialRequest): string {
  const b = mercatorBbox(center, zoom, width, height);
  const params = new URLSearchParams({
    bbox: [b.minX, b.minY, b.maxX, b.maxY].map((n) => n.toFixed(3)).join(","),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${Math.round(width)},${Math.round(height)}`,
    format: "jpg",
    transparent: "false",
    f: "image",
  });
  return `${USGS_IMAGERY}/export?${params.toString()}`;
}

/** Hosts the CSP must allow as image sources for any of the above to render. */
export const BASEMAP_IMG_HOSTS = [
  "https://basemap.nationalmap.gov",
  "https://tile.openstreetmap.org",
  "https://*.tile.openstreetmap.org",
];
