// Geodesic helpers for the comps map (Feature 4). PURE — unit-tested against
// known city-pair distances. (Universal module: client map + tests.)

export interface LatLng {
  lat: number;
  lng: number;
}

const R_KM = 6371.0088; // mean Earth radius
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres (haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const kmToMiles = (km: number): number => km * 0.621371;

/** "0.4 mi" / "12 mi" — the table's distance display. */
export function fmtMiles(km: number): string {
  const mi = kmToMiles(km);
  if (!Number.isFinite(mi)) return "—";
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/** A geocoded pin only counts as plausibly "the comp" when it lands within a
 *  metro-scale radius of the subject; a fuzzy name-match that geocodes to
 *  another state is dropped from the map (still listed in the table). */
export const MAX_PLAUSIBLE_KM = 300;
