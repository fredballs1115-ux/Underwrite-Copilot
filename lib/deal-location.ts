import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredAddress } from "@/lib/address";
import type { Point } from "@/lib/basemaps";
import { geocodeAddress, type Geocoded, type GeocodeSource } from "@/lib/geocode";

/**
 * Where a deal IS, resolved once and cached — the shared dependency of every
 * real-imagery surface (the aerial route, the Street View route, the map).
 *
 * The cache lives in the existing `deals.photo` jsonb column (migration 0027)
 * rather than new lat/lng columns, deliberately: this ships without adding to
 * the migration backlog, and both routes merge into the same object instead
 * of clobbering each other's half of it.
 */
export interface DealVisualCache {
  /** Street View metadata verdict (set by the photo route) */
  status?: "ok" | "none" | "unconfigured";
  checkedAt?: string;
  /** pano location echo from Street View metadata */
  panoLat?: number;
  panoLng?: number;
  /** geocoded subject position (set here) */
  lat?: number;
  lng?: number;
  geoAt?: string;
  /** how specific the geocoder's ANSWER was — drives the aerial's zoom */
  geoPrecision?: LocationPrecision;
  /** which service placed it */
  geoSource?: GeocodeSource;
  /** the geocoding rules this entry was produced under; see GEO_VERSION */
  geoV?: number;
  /** a geocode that definitively found nothing, so we stop re-asking */
  geoMiss?: boolean;
}

// Precision now lives with the framing rules it drives (lib/imagery-plan),
// so the zoom table and the thing it switches on cannot drift apart.
export type { LocationPrecision } from "@/lib/imagery-plan";
import type { LocationPrecision } from "@/lib/imagery-plan";

export interface DealLocation extends Point {
  precision: LocationPrecision;
}

/** 30 days: buildings do not move, and both geocoders are free services. */
const GEO_TTL_MS = 30 * 86_400_000;

/**
 * Bump this when the geocoding RULES change, not just the data. Entries
 * written under an older version are re-resolved on their next view even if
 * their TTL has not expired — otherwise a rules fix would take a month to
 * reach the deals that already exist.
 *
 *   1 — Photon first result, precision assumed from the input address.
 *   2 — Census first for street addresses, Photon fallback, precision read
 *       off the geocoder's answer (lib/geocode). The fix for "the pictures
 *       are terrible for most buildings".
 */
export const GEO_VERSION = 2;

/** The most an address's WORDING can support — the geocoder may deliver less. */
export function addressPrecision(a: StructuredAddress | null): LocationPrecision {
  return a?.street?.trim() ? "street" : "area";
}

export function cacheFresh(cache: DealVisualCache | null, now = Date.now()): boolean {
  return (
    !!cache?.geoAt &&
    cache.geoV === GEO_VERSION &&
    now - Date.parse(cache.geoAt) < GEO_TTL_MS
  );
}

/** Swappable in tests; production uses the shared resolver. */
export interface LocationDeps {
  geocode?: (address: StructuredAddress | null) => Promise<Geocoded | null>;
  now?: () => number;
}

/**
 * The deal's position, from cache when we have a current one and from the
 * geocoders when we don't. Returns null when the deal has no address or
 * nothing matched — the callers then render their no-imagery state.
 *
 * A network failure is never cached as a miss: a blocked network must not
 * permanently blank a deal. A definitive miss IS cached, so a deal at an
 * address no service knows costs one lookup, not one per page view.
 */
export async function resolveDealLocation(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  deps: LocationDeps = {},
): Promise<DealLocation | null> {
  const now = deps.now ?? Date.now;
  const geocode = deps.geocode ?? geocodeAddress;

  if (cacheFresh(cache, now())) {
    if (cache?.geoMiss) return null;
    if (typeof cache?.lat === "number" && typeof cache?.lng === "number") {
      return {
        lat: cache.lat,
        lng: cache.lng,
        precision: cache.geoPrecision ?? addressPrecision(address),
      };
    }
  }

  if (!address?.label?.trim()) return null;

  let hit: Geocoded | null;
  try {
    hit = await geocode(address);
  } catch {
    // Every service failed to answer — no imagery THIS request, and nothing
    // written, so the next view asks again.
    return null;
  }

  const stamp = { geoAt: new Date(now()).toISOString(), geoV: GEO_VERSION };
  const patch: Partial<DealVisualCache> = hit
    ? {
        ...stamp,
        lat: hit.lat,
        lng: hit.lng,
        geoPrecision: hit.precision,
        geoSource: hit.source,
        geoMiss: false,
      }
    : { ...stamp, geoMiss: true, lat: undefined, lng: undefined, geoPrecision: undefined, geoSource: undefined };
  await writeCache(supabase, dealId, cache, patch);

  return hit ? { lat: hit.lat, lng: hit.lng, precision: hit.precision } : null;
}

/**
 * Merge a patch into the deal's imagery cache without losing anything another
 * writer just stored.
 *
 * The cache is one jsonb column shared by the geocoder and the Street View
 * verdict. The first cut merged the patch over the copy of the column the
 * CALLER had loaded — so when the geocoder wrote a fresh point and the Street
 * View check then wrote its verdict over its own, older copy, the new point
 * was silently dropped and the deal went back to the wrong spot. Now the
 * current row is read first and the patch merged over THAT. One small extra
 * read, on a path that runs about once a month per deal.
 */
export async function writeCache(
  supabase: SupabaseClient,
  dealId: string,
  fallback: DealVisualCache | null,
  patch: Partial<DealVisualCache>,
): Promise<void> {
  try {
    const { data } = await supabase
      .from("deals")
      .select("photo")
      .eq("id", dealId)
      .maybeSingle();
    const current = ((data as { photo?: DealVisualCache | null } | null)?.photo ??
      fallback ??
      {}) as DealVisualCache;
    await supabase
      .from("deals")
      .update({ photo: { ...current, ...patch } })
      .eq("id", dealId);
  } catch {
    // Pre-0027 schema has no `photo` column — imagery still works, just
    // without the cache. Never fail a page render over a cache write.
  }
}
