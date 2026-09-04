import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredAddress } from "@/lib/address";
import { usgsAerialUrl } from "@/lib/basemaps";
import {
  aerialZoom,
  resolveDealLocation,
  writeCache,
  type DealLocation,
  type DealVisualCache,
} from "@/lib/deal-location";
import { IMAGE_CREDIT, imagePlan, type ImageSource } from "@/lib/imagery-plan";

// The ordering rule and the credits are pure, so they live in a universal
// module the client can import too — re-exported here so server callers have
// one import for all of it.
export { IMAGE_CREDIT, imagePlan };
export type { ImageSource };

/**
 * Every way the app can obtain a real picture of a real building, in one
 * place. The routes are thin wrappers over these.
 *
 * Two sources, and the order matters:
 *
 *   1. STREET VIEW — an actual photograph of the building's front, which is
 *      what "a picture of this property" means to anyone in this business.
 *      Needs GOOGLE_MAPS_API_KEY and a billing account; there is no keyless
 *      way to fetch it. Only ever used for a street-level address, because a
 *      neighborhood-level placement would return some arbitrary block.
 *   2. AERIAL — USGS National Map orthoimagery. Public domain, no key, and
 *      it works for every US address, so it is the floor that guarantees
 *      every deal has a real picture of its real site.
 *
 * There is no third case on purpose. No stock photography, no AI-generated
 * building, no scraped listing photo — a picture that isn't of this property
 * is worse than no picture.
 */

/** Whether Street View can be attempted at all in this deployment. */
export function streetViewConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

const STREET_VIEW_TTL_MS = 30 * 86_400_000;

/**
 * Google Street View, metadata-checked. Returns the image response, or null
 * when there is no key, no imagery, or the request fails.
 *
 * The metadata endpoint is asked FIRST and its verdict cached on the deal, so
 * a building Google has never photographed costs one lookup ever rather than
 * one per page view. Transient states (quota, denied) 404 the request without
 * poisoning that cache.
 */
export async function fetchStreetViewImage(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  size: { width: number; height: number },
): Promise<Response | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const label = address?.label?.trim();
  if (!key || !label || !address?.street?.trim()) return null;

  let verdict = cache;
  const fresh =
    !!verdict?.checkedAt &&
    Date.now() - Date.parse(verdict.checkedAt) < STREET_VIEW_TTL_MS;

  if (!fresh) {
    try {
      const metaUrl =
        `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(label)}&key=${key}`;
      const meta = (await (
        await fetch(metaUrl, { signal: AbortSignal.timeout(8_000) })
      ).json()) as {
        status?: string;
        location?: { lat?: number; lng?: number };
      };
      if (meta.status === "OK") {
        verdict = {
          ...cache,
          status: "ok",
          checkedAt: new Date().toISOString(),
          panoLat: meta.location?.lat,
          panoLng: meta.location?.lng,
        };
      } else if (meta.status === "ZERO_RESULTS" || meta.status === "NOT_FOUND") {
        // Definitive "Google has never driven here" — safe to remember.
        verdict = { ...cache, status: "none", checkedAt: new Date().toISOString() };
      } else {
        // OVER_QUERY_LIMIT / REQUEST_DENIED / UNKNOWN_ERROR: configuration or
        // transient states. Fail this request, never cache the verdict.
        return null;
      }
    } catch {
      return null;
    }
    await writeCache(supabase, dealId, cache, verdict ?? {});
  }

  if (verdict?.status !== "ok") return null;

  // Prefer the pano coordinates the metadata echoed — same address string can
  // otherwise resolve differently between the two calls.
  const loc =
    verdict.panoLat !== undefined && verdict.panoLng !== undefined
      ? `${verdict.panoLat},${verdict.panoLng}`
      : label;
  try {
    const img = await fetch(
      `https://maps.googleapis.com/maps/api/streetview?size=${size.width}x${size.height}&location=${encodeURIComponent(loc)}&key=${key}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const type = img.headers.get("content-type") ?? "";
    if (!img.ok || !img.body || !type.startsWith("image/")) return null;
    return img;
  } catch {
    return null;
  }
}

/**
 * USGS aerial orthoimagery of the site. Needs no key, so this is what makes
 * "every deal has a real picture" true rather than aspirational.
 */
export async function fetchAerialImage(
  loc: DealLocation,
  size: { width: number; height: number; zoom?: number },
): Promise<Response | null> {
  const zoom = size.zoom ?? aerialZoom(loc.precision);
  try {
    const img = await fetch(
      usgsAerialUrl({
        center: { lat: loc.lat, lng: loc.lng },
        zoom,
        width: size.width,
        height: size.height,
      }),
      { signal: AbortSignal.timeout(10_000) },
    );
    // The ArcGIS export endpoint answers 200 with a JSON error body when it
    // dislikes a request, so content-type is the real success test.
    const type = img.headers.get("content-type") ?? "";
    if (!img.ok || !img.body || !type.startsWith("image/")) return null;
    return img;
  } catch {
    return null;
  }
}

export interface BestImage {
  response: Response;
  source: ImageSource;
}

/**
 * The best real picture of this building we can get right now: Street View
 * where it exists, the aerial otherwise. Null when the deal has no address,
 * nothing geocodes, or every source failed — callers then render nothing.
 */
export async function fetchBestBuildingImage(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  size: { width: number; height: number },
): Promise<BestImage | null> {
  const plan = imagePlan({
    hasStreetAddress: !!address?.street?.trim(),
    streetViewConfigured: streetViewConfigured(),
  });

  for (const source of plan) {
    if (source === "streetview") {
      const res = await fetchStreetViewImage(supabase, dealId, address, cache, size);
      if (res) return { response: res, source };
      continue;
    }
    // Aerial needs coordinates; resolving also caches them for the map.
    const loc = await resolveDealLocation(supabase, dealId, address, cache);
    if (!loc) return null;
    const res = await fetchAerialImage(loc, size);
    if (res) return { response: res, source };
  }
  return null;
}
