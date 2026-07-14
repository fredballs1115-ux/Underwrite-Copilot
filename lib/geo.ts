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

const STREET_ADDRESS =
  /\d{1,5}\s+[A-Za-z][A-Za-z0-9.' -]{2,40}?\b(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Pkwy|Parkway|Way|Ct|Court|Pl|Place|Hwy|Highway|Ter|Terrace|Cir|Circle|Trl|Trail)\b\.?/i;

/**
 * Ordered geocode queries for one comp — most specific first. Property NAMES
 * ("The Berkley at Legacy") rarely exist in OpenStreetMap, which is why the
 * original single name-query left most comps unplaced. The ladder:
 *   1. a street address, if one hides in the name or detail text
 *   2. the name with building/annotation clutter stripped
 *   3. the raw name
 * each anchored with the locale. Duplicates collapse, order preserved.
 */
export function geocodeCandidates(
  name: string,
  detail: string,
  locale: string,
): string[] {
  const out: string[] = [];
  const add = (q: string | null | undefined) => {
    const s = (q ?? "").trim().replace(/\s+/g, " ");
    if (!s) return;
    const full = locale.trim() ? `${s}, ${locale.trim()}` : s;
    if (!out.includes(full)) out.push(full);
  };

  add(name.match(STREET_ADDRESS)?.[0] ?? detail.match(STREET_ADDRESS)?.[0]);
  // Strip trailing annotations: "HQ — Building C, 4801 …" → "HQ"; "(Phase II)".
  const cleaned = name
    .split(/\s+[—–-]\s+/)[0]
    .replace(/\(.*?\)/g, "")
    .replace(/,\s*(Building|Bldg|Suite|Ste|Unit|Phase)\b.*$/i, "")
    .trim();
  if (cleaned && cleaned.length >= 3) add(cleaned);
  add(name);
  return out;
}
