import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredAddress } from "@/lib/address";
import type { Point } from "@/lib/basemaps";

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
  /** how specific the address behind lat/lng was — drives the aerial's zoom */
  geoPrecision?: LocationPrecision;
  /** a geocode that definitively found nothing, so we stop re-asking */
  geoMiss?: boolean;
}

/** A street address frames one building; anything vaguer frames a district. */
export type LocationPrecision = "street" | "area";

export interface DealLocation extends Point {
  precision: LocationPrecision;
}

/** 30 days: buildings do not move, and Photon is a free service. */
const GEO_TTL_MS = 30 * 86_400_000;

export function addressPrecision(a: StructuredAddress | null): LocationPrecision {
  return a?.street?.trim() ? "street" : "area";
}

/** Zoom that frames the subject honestly for how precisely we located it. */
export function aerialZoom(precision: LocationPrecision): number {
  // z18 ≈ 0.4 m/px — one building and its parking. z15 ≈ 3 m/px — a district,
  // which is the most an area-level placement can truthfully claim.
  return precision === "street" ? 18 : 15;
}

function cacheFresh(cache: DealVisualCache | null): boolean {
  return (
    !!cache?.geoAt && Date.now() - Date.parse(cache.geoAt) < GEO_TTL_MS
  );
}

/**
 * Free-text geocode via Photon — the same service the address autocomplete
 * and the comps map already use, so the subject pin agrees with the comps.
 */
async function geocode(q: string): Promise<Point | null> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`,
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

/**
 * The deal's position, from cache when we have it and from Photon when we
 * don't. Returns null when the deal has no address or nothing matched — the
 * callers then render their no-imagery state. A transient failure is never
 * cached as a miss: a blocked network must not permanently blank a deal.
 */
export async function resolveDealLocation(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
): Promise<DealLocation | null> {
  const precision = addressPrecision(address);

  if (cacheFresh(cache)) {
    if (cache?.geoMiss) return null;
    if (typeof cache?.lat === "number" && typeof cache?.lng === "number") {
      return { lat: cache.lat, lng: cache.lng, precision: cache.geoPrecision ?? precision };
    }
  }

  const label = address?.label?.trim();
  if (!label) return null;

  let pos: Point | null = null;
  try {
    pos = await geocode(label);
    // A full street address that misses often still resolves at city level —
    // useful, but only if we downgrade the claim we make about it.
    if (!pos && precision === "street") {
      const area = [address?.city, address?.state].filter(Boolean).join(", ");
      if (area.trim()) {
        const areaPos = await geocode(area);
        if (areaPos) {
          await writeCache(supabase, dealId, cache, {
            lat: areaPos.lat,
            lng: areaPos.lng,
            geoAt: new Date().toISOString(),
            geoPrecision: "area",
            geoMiss: false,
          });
          return { ...areaPos, precision: "area" };
        }
      }
    }
  } catch {
    // Network/timeout — no imagery THIS request, but don't poison the cache.
    return null;
  }

  const patch: Partial<DealVisualCache> = pos
    ? {
        lat: pos.lat,
        lng: pos.lng,
        geoAt: new Date().toISOString(),
        geoPrecision: precision,
        geoMiss: false,
      }
    : { geoAt: new Date().toISOString(), geoMiss: true, lat: undefined, lng: undefined };
  await writeCache(supabase, dealId, cache, patch);

  return pos ? { ...pos, precision } : null;
}

/** Merge — never replace — so the Street View verdict and the geocode coexist. */
export async function writeCache(
  supabase: SupabaseClient,
  dealId: string,
  current: DealVisualCache | null,
  patch: Partial<DealVisualCache>,
): Promise<void> {
  try {
    await supabase
      .from("deals")
      .update({ photo: { ...(current ?? {}), ...patch } })
      .eq("id", dealId);
  } catch {
    // Pre-0027 schema has no `photo` column — imagery still works, just
    // without the cache. Never fail a page render over a cache write.
  }
}
