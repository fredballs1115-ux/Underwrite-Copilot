// Where a US address IS — the one geocoder every real-imagery surface shares.
//
// This exists because the first cut asked Photon for one result and believed
// it. Photon (OpenStreetMap data) is excellent at streets and cities and thin
// on US house numbers, especially commercial parcels. For most deals it
// returned the STREET CENTRELINE, or the city, and the caller stamped the
// point "street precision" because the INPUT had a street — so a 140-metre
// "this building" frame was drawn around a spot that was often a block away,
// the map pin said "Subject property" over a random mid-block point, and
// Street View was asked to photograph it. That is what "the pictures are
// terrible for most buildings" looked like from the inside.
//
// Two rules now:
//
//   1. Precision is read off the RESULT, never assumed from the input.
//   2. For a street address, the US Census Bureau's geocoder goes first. It
//      is free, keyless, public domain, and built for exactly this: it
//      matches the house number against TIGER address ranges and returns a
//      point on the correct block face, typically within a couple of parcels
//      of the door. Not a rooftop, but the right building's side of the
//      right street, which is the whole game. Photon is the fallback, and
//      when Photon answers we look at what KIND of thing it matched.
//
// Pure parsers are exported so the mapping from "what the service said" to
// "how tightly we may frame it" is tested on fixtures, not on the network.

import type { StructuredAddress } from "@/lib/address";
import type { LocationPrecision } from "@/lib/imagery-plan";

export type GeocodeSource = "census" | "photon";

export interface Geocoded {
  lat: number;
  lng: number;
  precision: LocationPrecision;
  source: GeocodeSource;
  /** the address the service says it matched — for the health probe */
  matched: string;
}

/** Injectable for tests; defaults to the platform fetch. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 8_000;
const UA = "underwrite-copilot/1.0 (property imagery)";

// ── US Census Bureau geocoder ─────────────────────────────────────────────

const CENSUS_ONELINE =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

export function censusUrl(oneline: string): string {
  const u = new URL(CENSUS_ONELINE);
  u.searchParams.set("address", oneline);
  u.searchParams.set("benchmark", "Public_AR_Current");
  u.searchParams.set("format", "json");
  return u.toString();
}

/**
 * The Census response shape:
 *   { result: { addressMatches: [ { coordinates: { x: lng, y: lat },
 *                                   matchedAddress: "…" }, … ] } }
 * An empty `addressMatches` is a definitive miss, not an error.
 */
export function parseCensusOneline(
  json: unknown,
): { lat: number; lng: number; matched: string } | null {
  const m = (json as { result?: { addressMatches?: unknown[] } })?.result
    ?.addressMatches?.[0] as
    | { coordinates?: { x?: unknown; y?: unknown }; matchedAddress?: unknown }
    | undefined;
  const x = m?.coordinates?.x;
  const y = m?.coordinates?.y;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // A coordinate of exactly 0,0 is the Gulf of Guinea, not a US address.
  if (x === 0 && y === 0) return null;
  return {
    lat: y,
    lng: x,
    matched: typeof m?.matchedAddress === "string" ? m.matchedAddress : "",
  };
}

// ── Photon (OpenStreetMap) ────────────────────────────────────────────────

export function photonUrl(q: string): string {
  return `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
}

/**
 * What Photon's `properties.type` means for how tightly we may frame the
 * point. `house` is an actual address point. `street` is the street's
 * centreline — the right road, an unknown distance from the door. Anything
 * else (locality, district, city, county, postcode, state) is a district.
 */
export function photonPrecision(type: string | undefined): LocationPrecision {
  if (type === "house") return "street";
  if (type === "street") return "block";
  return "area";
}

export function parsePhoton(
  json: unknown,
): { lat: number; lng: number; type: string | undefined; matched: string } | null {
  const f = (json as { features?: unknown[] })?.features?.[0] as
    | {
        geometry?: { coordinates?: unknown };
        properties?: { type?: unknown; name?: unknown; street?: unknown; housenumber?: unknown; city?: unknown };
      }
    | undefined;
  const c = f?.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const [lng, lat] = c as unknown[];
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const p = f?.properties ?? {};
  const matched = [p.housenumber, p.street ?? p.name, p.city]
    .filter((s) => typeof s === "string" && s.trim())
    .join(" ");
  return {
    lat,
    lng,
    type: typeof p.type === "string" ? p.type : undefined,
    matched,
  };
}

// ── The resolver ─────────────────────────────────────────────────────────

async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Resolve an address to a point, with an honest precision and the service
 * that answered.
 *
 * Order for a street address: Census, then Photon on the full label, then
 * Photon on "city, state" as an area-level last resort. An address with no
 * street skips straight to the area lookups — there is no door to find.
 *
 * Returns null on a definitive miss everywhere. THROWS only when every
 * service that was asked failed for network reasons, so the caller can tell
 * "nothing here" from "couldn't ask" and never caches the latter as a miss.
 */
export async function geocodeAddress(
  address: StructuredAddress | null,
  fetchImpl: FetchLike = fetch,
): Promise<Geocoded | null> {
  const label = address?.label?.trim();
  if (!label) return null;
  const hasStreet = !!address?.street?.trim();

  let asked = 0;
  let failed = 0;

  if (hasStreet) {
    asked++;
    try {
      const hit = parseCensusOneline(await getJson(censusUrl(label), fetchImpl));
      if (hit) return { ...hit, precision: "street", source: "census" };
    } catch {
      failed++;
    }
  }

  asked++;
  try {
    const hit = parsePhoton(await getJson(photonUrl(label), fetchImpl));
    if (hit) {
      return {
        lat: hit.lat,
        lng: hit.lng,
        // Without a street in the input, even a `house` match is a guess about
        // which house — frame the district.
        precision: hasStreet ? photonPrecision(hit.type) : "area",
        source: "photon",
        matched: hit.matched,
      };
    }
  } catch {
    failed++;
  }

  const area = [address?.city, address?.state].filter((s) => s?.trim()).join(", ");
  if (area && area !== label) {
    asked++;
    try {
      const hit = parsePhoton(await getJson(photonUrl(area), fetchImpl));
      if (hit) {
        return { lat: hit.lat, lng: hit.lng, precision: "area", source: "photon", matched: hit.matched };
      }
    } catch {
      failed++;
    }
  }

  if (asked > 0 && failed === asked) {
    throw new Error("geocode: every service failed to answer");
  }
  return null;
}
