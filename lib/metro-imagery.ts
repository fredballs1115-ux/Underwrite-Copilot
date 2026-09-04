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

/** Keyed by the `id` in data/research/metros.json — the test enforces that. */
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
};

/**
 * How much ground a metro card shows. ~1.2km reads as "a downtown": enough
 * blocks to recognise the skyline's footprint, not so wide it turns into
 * undifferentiated grey.
 */
export const METRO_FRAME_METRES = 1200;

export function metroView(id: string): MetroView | null {
  return METRO_VIEWS[id] ?? null;
}

/** Rough continental-US bounds, incl. Alaska/Hawaii headroom — a coordinate
 *  outside these is a typo, and the test treats it as one. */
export const US_BOUNDS = { minLat: 18, maxLat: 72, minLng: -180, maxLng: -66 };
