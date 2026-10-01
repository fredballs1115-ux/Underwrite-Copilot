// Where to point a camera for each covered market, so the homepage can show
// the real places the product covers instead of drawn icons.
//
// PURE and universal — a lookup table plus framing constants, no I/O.
//
// Each point is that market's BUSINESS DISTRICT, not its geographic centroid.
// A county centroid is usually a field; the CBD is what a reader recognises
// and what the market actually trades on.
//
// A note on source quality, because it differs from the deal pages: at this
// scale USGS is not the limiting factor. A ~1.2km frame across a 400px card
// needs about 3 m/px, and USGS NAIP is natively 0.6-1.0 m/px, so the image is
// downsampled — sharp — rather than upscaled. The softness that made
// building-scale shots bad does not apply here, which is why the homepage
// needs no API key and costs nothing to serve.

import type { Point } from "@/lib/basemaps";

export interface MetroView extends Point {
  /** what the frame is actually centred on, for the caption/alt text */
  place: string;
}

/** Keyed by the `id` in data/research/metros.json, or in data/data-metros.json for a metro read without a brief — the test enforces that. */
export const METRO_VIEWS: Record<string, MetroView> = {
  dc: { lat: 38.9007, lng: -77.033, place: "Downtown Washington, DC" },
  pg_county: { lat: 38.7808, lng: -77.0169, place: "National Harbor, MD" },
  montgomery_county: { lat: 38.9847, lng: -77.0947, place: "Downtown Bethesda, MD" },
  nova: { lat: 38.8963, lng: -77.0714, place: "Rosslyn, Arlington, VA" },
  baltimore: { lat: 39.2854, lng: -76.6105, place: "Inner Harbor, Baltimore, MD" },
  richmond: { lat: 37.5407, lng: -77.436, place: "Downtown Richmond, VA" },
  norfolk_hampton_roads: { lat: 36.85, lng: -76.2858, place: "Downtown Norfolk, VA" },
  philadelphia: { lat: 39.9526, lng: -75.1652, place: "Center City, Philadelphia, PA" },
  newark_jc: { lat: 40.7178, lng: -74.0431, place: "Exchange Place, Jersey City, NJ" },
  nyc: { lat: 40.7549, lng: -73.984, place: "Midtown Manhattan, NY" },
  boston: { lat: 42.3555, lng: -71.0565, place: "Downtown Boston, MA" },
  chicago: { lat: 41.8827, lng: -87.6233, place: "The Loop, Chicago, IL" },
  los_angeles: { lat: 34.0505, lng: -118.2551, place: "Downtown Los Angeles, CA" },
  san_francisco: { lat: 37.7929, lng: -122.3993, place: "Financial District, San Francisco, CA" },
  seattle: { lat: 47.6101, lng: -122.3344, place: "Downtown Seattle, WA" },
  miami: { lat: 25.7686, lng: -80.1918, place: "Downtown Miami, FL" },
  atlanta: { lat: 33.759, lng: -84.388, place: "Downtown Atlanta, GA" },
  dallas: { lat: 32.7791, lng: -96.7987, place: "Downtown Dallas, TX" },
  // The metro areas read without a brief (data/data-metros.json, #404):
  // the same rule, the business district each is known by. A frame is
  // checked by eye on the deployed page, never assumed — a coordinate here
  // is a claim about a place until someone has looked at the picture.
  pittsburgh: { lat: 40.4406, lng: -79.9959, place: "Golden Triangle, Pittsburgh, PA" },
  phoenix: { lat: 33.4484, lng: -112.074, place: "Downtown Phoenix, AZ" },
  denver: { lat: 39.7473, lng: -104.9943, place: "Downtown Denver, CO" },
  nashville: { lat: 36.1627, lng: -86.7816, place: "Downtown Nashville, TN" },
  charlotte: { lat: 35.2271, lng: -80.8431, place: "Uptown Charlotte, NC" },
  austin: { lat: 30.2672, lng: -97.7431, place: "Downtown Austin, TX" },
  houston: { lat: 29.7589, lng: -95.3677, place: "Downtown Houston, TX" },
  minneapolis: { lat: 44.9778, lng: -93.265, place: "Downtown Minneapolis, MN" },
  san_diego: { lat: 32.7157, lng: -117.1611, place: "Downtown San Diego, CA" },
  las_vegas: { lat: 36.1699, lng: -115.1398, place: "Downtown Las Vegas, NV" },
  tampa: { lat: 27.9478, lng: -82.4584, place: "Downtown Tampa, FL" },
  orlando: { lat: 28.5421, lng: -81.379, place: "Downtown Orlando, FL" },
  raleigh: { lat: 35.7796, lng: -78.6382, place: "Downtown Raleigh, NC" },
  salt_lake_city: { lat: 40.7608, lng: -111.891, place: "Downtown Salt Lake City, UT" },
  san_antonio: { lat: 29.4252, lng: -98.4946, place: "Downtown San Antonio, TX" },
  sacramento: { lat: 38.5816, lng: -121.4944, place: "Downtown Sacramento, CA" },
  columbus: { lat: 39.9612, lng: -82.9988, place: "Downtown Columbus, OH" },
  indianapolis: { lat: 39.7684, lng: -86.1581, place: "Downtown Indianapolis, IN" },
  kansas_city: { lat: 39.0997, lng: -94.5786, place: "Downtown Kansas City, MO" },
  st_louis: { lat: 38.627, lng: -90.1994, place: "Downtown St. Louis, MO" },
  cincinnati: { lat: 39.1031, lng: -84.512, place: "Downtown Cincinnati, OH" },
  jacksonville: { lat: 30.3244, lng: -81.6557, place: "Downtown Jacksonville, FL" },
  riverside: { lat: 33.9806, lng: -117.3755, place: "Downtown Riverside, CA" },
  detroit: { lat: 42.3314, lng: -83.0458, place: "Downtown Detroit, MI" },
  portland: { lat: 45.5202, lng: -122.6742, place: "Downtown Portland, OR" },
  cleveland: { lat: 41.4993, lng: -81.6944, place: "Downtown Cleveland, OH" },
};

/**
 * How much ground a metro card shows. ~1.2km reads as "a downtown": enough
 * blocks to recognise the skyline's footprint, not so wide it turns into
 * undifferentiated grey.
 */
export const METRO_FRAME_METRES = 1200;

/** A market's frame, or null. The id may come straight off a URL (the
 *  overhead route), so only the table's OWN keys answer — an indexed read
 *  also finds what every object inherits ("constructor", "__proto__"). */
export function metroView(id: string): MetroView | null {
  return Object.hasOwn(METRO_VIEWS, id) ? METRO_VIEWS[id] : null;
}

/** Rough continental-US bounds, incl. Alaska/Hawaii headroom — a coordinate
 *  outside these is a typo, and the test treats it as one. */
export const US_BOUNDS = { minLat: 18, maxLat: 72, minLng: -180, maxLng: -66 };

/**
 * Every frame, width × height, the overhead route draws (the security review
 * of 2026-09-30): the sizes the site's own pages ask for — CityPhoto's
 * `width` × `height`, and twice that where a tile offers a dense screen its
 * 2x — and nothing else. Any other size is snapped to the nearest of these
 * rather than refused, so a page cached before a size changed still gets its
 * picture, and USGS is asked for a market at most once a frame per process
 * whatever sizes a caller types. A new size on a page belongs here too; the
 * imagery routes' test holds the pages' sizes to this list.
 */
export const METRO_FRAMES: readonly (readonly [number, number])[] = [
  [480, 360], // the coverage gallery's 4:3 tile (app/markets-gallery)…
  [960, 720], // …and its 2x
  [480, 192], // a submarket card's strip (app/market/submarket-cards)…
  [960, 384], // …and its 2x
  [1400, 420], // /tools' band
  [1400, 480], // a market's own band (MarketBand)
  [1400, 600], // a page's opening band (PlaceBand)
  [1400, 900], // the homepage's hero and the sign-in page
  [1200, 630], // a market page's link preview (lib/og-card)
  [1600, 900], // the largest frame, live-verify's AERIALS probe
];

/** The frame a request that names no size is drawn at: the gallery's tile. */
export const METRO_FRAME_DEFAULT: readonly [number, number] = [480, 360];

/**
 * A requested size as the overhead route draws it: the listed frame nearest
 * in both proportion and size (the sum of the two sides' log ratios), the
 * larger on a tie so a picture is never softer than asked. A missing or
 * unreadable side is the default frame's — `Number(null)` is 0, which is
 * finite, and a request with no `?w=` once came back 96px wide.
 */
export function metroFrame(
  rawW: number | string | null | undefined,
  rawH: number | string | null | undefined,
): readonly [number, number] {
  const side = (raw: number | string | null | undefined, fallback: number): number => {
    const n = typeof raw === "number" ? raw : raw == null || raw.trim() === "" ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? Math.min(10_000, Math.max(1, n)) : fallback;
  };
  const w = side(rawW, METRO_FRAME_DEFAULT[0]);
  const h = side(rawH, METRO_FRAME_DEFAULT[1]);
  let best = METRO_FRAMES[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const f of METRO_FRAMES) {
    const d = Math.abs(Math.log(f[0] / w)) + Math.abs(Math.log(f[1] / h));
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && f[0] * f[1] > best[0] * best[1])) {
      best = f;
      bestD = d;
    }
  }
  return best;
}
