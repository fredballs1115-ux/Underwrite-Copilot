import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredAddress } from "@/lib/address";
import { usgsAerialUrl } from "@/lib/basemaps";
import { resolveDealLocation, type DealLocation, type DealVisualCache } from "@/lib/deal-location";
import type { GeocodeSource } from "@/lib/geocode";
import {
  IMAGE_CREDIT,
  MAX_SOURCE_ZOOM,
  aerialPlan,
  bearingDeg,
  frameZoom,
  imagePlan,
  type ImageSource,
} from "@/lib/imagery-plan";
import { pictureSizeFor, readPictureBytes } from "@/lib/deal-picture";
import { finishAerial } from "@/lib/aerial-finish";
import { RunGate } from "@/lib/anthropic/run-gate";
export { finishAerial };

// The ordering rule and the credits are pure, so they live in a universal
// module the client can import too — re-exported here so server callers have
// one import for all of it.
export { IMAGE_CREDIT, aerialPlan, frameZoom, imagePlan };
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

/**
 * Whether the Google sources (Street View photos, satellite imagery) can be
 * attempted at all. One key covers both; the project must have the Street
 * View Static API and the Maps Static API enabled on it.
 */
export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

/**
 * The cache-control every response carrying a Google image sends — Street
 * View's photograph or the satellite frame. Google's Street View policies:
 * "Content pre-fetching, indexing, storing, or caching is generally
 * prohibited, except for place IDs and panorama IDs" (developers.google.com/
 * maps/documentation/streetview/policies, as the runner printed it in zori
 * probe run 37258453291), so neither the browser nor a shared cache may keep
 * the image; the satellite frame is held to the same rule (the Static Maps
 * API's own policy page is the owner's to read before the key is set). The
 * routes had told browsers to keep both a day.
 */
export const GOOGLE_NO_STORE = "private, no-store";

/** Whether a source's image is Google's, and so never kept. */
export const isGoogleImage = (source: ImageSource): boolean => source === "streetview" || source === "satellite";

/**
 * Google Street View, metadata-checked. Returns the image response, or null
 * when there is no key, no imagery, or the request fails.
 *
 * Nothing Google answers is kept. Its Street View policies say "Content
 * pre-fetching, indexing, storing, or caching is generally prohibited,
 * except for place IDs and panorama IDs" (zori probe run 37258453291), and
 * its metadata request "provides data about Street View panoramas, such as
 * location, date, and panorama ID, without consuming quota" (run
 * 37258539449). So the metadata is asked on every request, its panorama's
 * position is read for this request's camera heading and dropped, and no
 * verdict is stored: the earlier cut kept "imagery here or not" and the
 * panorama's coordinates on the deal for 30 days.
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

  // Where the BUILDING is, from the shared geocoder. Street View is only
  // honest when the geocoder actually found the address: a block- or
  // area-level placement would photograph some other building on the same
  // road, which is worse than no photo. The same point drives the aerial
  // and the map pin, so all three agree by construction.
  const building = await resolveDealLocation(supabase, dealId, address, cache);
  if (!building || building.precision !== "street") return null;
  const target = `${building.lat},${building.lng}`;

  let pano: { lat: number; lng: number } | null = null;
  try {
    // Metadata by COORDINATES, not by re-sending the address string: Google
    // would geocode the string its own way, and a disagreement with our pin
    // meant the photo and the map showed two different places. `outdoor`
    // rules out business interiors and user-uploaded panos.
    const metaUrl =
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${target}&source=outdoor&key=${key}`;
    const meta = (await (
      await fetch(metaUrl, { signal: AbortSignal.timeout(8_000) })
    ).json()) as {
      status?: string;
      location?: { lat?: number; lng?: number };
    };
    // No imagery here, a quota or key refusal, an error: no photograph.
    if (meta.status !== "OK") return null;
    const { lat, lng } = meta.location ?? {};
    if (typeof lat === "number" && typeof lng === "number") pano = { lat, lng };
  } catch {
    return null;
  }

  // The camera stands where the pano is and must LOOK AT the building. The
  // first cut passed the pano's own coordinates as `location`, which asked
  // Google to point the camera at the spot it was standing on — an arbitrary
  // heading, and the reason so many "building photos" were a stretch of road.
  // `location` is the building; `heading` is computed from pano to building
  // so the orientation does not depend on Google inferring it.
  const params = new URLSearchParams({
    size: `${size.width}x${size.height}`,
    location: target,
    source: "outdoor",
    fov: "80",
    pitch: "0",
    key,
  });
  if (pano) params.set("heading", bearingDeg(pano, building).toFixed(1));
  try {
    const img = await fetch(
      `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`,
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
 * Google satellite imagery — the sharp overhead shot.
 *
 * The reason this exists: USGS NAIP is natively 0.6-1.0 m/px, so a frame
 * tight enough to show a building is already upscaled and soft. Google runs
 * about 0.15 m/px in cities, which is the difference between "a roof among
 * roofs" and a building you can actually read.
 *
 * `scale=2` is the other half of it: Google caps `size` at 640x640 on the
 * standard tier, but scale=2 returns twice the pixels for the SAME ground
 * area — so a 640x360 request comes back as a 1280x720 image of the same
 * frame. That is real added detail, not upscaling, and it is what makes the
 * shot look right on a retina display.
 */
export async function fetchGoogleSatelliteImage(
  loc: DealLocation,
  size: { width: number; height: number; zoom?: number },
): Promise<Response | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  // Ask for half the pixels at scale=2 — same frame, twice the detail.
  const w = Math.min(640, Math.max(48, Math.round(size.width / 2)));
  const h = Math.min(640, Math.max(48, Math.round(size.height / 2)));
  // Zoom is derived from `w`, the CSS-pixel width Google frames against —
  // NOT the output width, which scale=2 has already doubled.
  const zoom =
    size.zoom ??
    frameZoom({ widthPx: w, lat: loc.lat, precision: loc.precision, source: "satellite" });
  const url =
    `https://maps.googleapis.com/maps/api/staticmap?center=${loc.lat},${loc.lng}` +
    `&zoom=${zoom}&size=${w}x${h}&scale=2&maptype=satellite&format=jpg&key=${key}`;
  try {
    const img = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const type = img.headers.get("content-type") ?? "";
    // Static Maps answers 4xx with a text body when the key or the enabled-API
    // set is wrong, so content-type is the real success test.
    if (!img.ok || !img.body || !type.startsWith("image/")) return null;
    return img;
  } catch {
    return null;
  }
}

/**
 * How many building aerials this process asks USGS for at once, and how long
 * an ask waits for a turn (the security review of 2026-10-01): the market
 * overheads' rule (lib/metro-overhead), here for every deal's aerial. The
 * shared screen's aerial is public, and each frame is an export and a sharp
 * pass, so a burst past four waits its turn. Four is the compare page's four
 * columns in one round. An ask that finds no turn in time is a failure, and
 * nothing keeps it.
 */
export const AERIAL_IN_FLIGHT = 4;
const AERIAL_TURN_WAIT_MS = 30_000;
const aerialTurns = new RunGate(() => AERIAL_IN_FLIGHT);

/**
 * USGS aerial orthoimagery of the site. Needs no key, so this is what makes
 * "every deal has a real picture" true rather than aspirational — but at
 * 0.6-1.0 m/px it is the floor, not the good shot. Drawn no finer than the
 * photograph's own grain (`MAX_SOURCE_ZOOM.aerial`, z17 — an explicit zoom
 * is held to it too, so no caller can ask for the stretched frame) and
 * finished (`finishAerial`); a finish that fails serves the plain export.
 * At most `AERIAL_IN_FLIGHT` at once in this process, the finish included.
 */
export async function fetchAerialImage(
  loc: DealLocation,
  size: { width: number; height: number; zoom?: number },
): Promise<Response | null> {
  const zoom = Math.min(
    MAX_SOURCE_ZOOM.aerial,
    size.zoom ??
      frameZoom({
        widthPx: size.width,
        lat: loc.lat,
        precision: loc.precision,
        source: "aerial",
      }),
  );
  const release = await aerialTurns.acquireWithin(AERIAL_TURN_WAIT_MS);
  if (!release) return null;
  try {
    return await exportAerial(loc, size, zoom);
  } finally {
    release();
  }
}

async function exportAerial(
  loc: DealLocation,
  size: { width: number; height: number },
  zoom: number,
): Promise<Response | null> {
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
    const raw = Buffer.from(await img.arrayBuffer());
    let bytes: Buffer = raw;
    try {
      bytes = await finishAerial(raw);
    } catch {
      // The plain export is still the real picture.
    }
    return new Response(new Uint8Array(bytes), { headers: { "content-type": bytes === raw ? type : "image/jpeg" } });
  } catch {
    return null;
  }
}

export interface BestImage {
  response: Response;
  source: ImageSource;
  /** the geocoder that placed the point an overhead is framed on — "photon"
   *  asks the credit to name OpenStreetMap (lib/basemaps `withOsmLocation`) */
  placedBy?: GeocodeSource;
}

/**
 * The building's own photograph, from the bucket: the square crop for a
 * row-sized ask, the hero otherwise. Null when the deal has none stored —
 * the caller (`ensureDealPicture`) is what puts one there.
 */
async function fetchStoredPicture(
  dealId: string,
  cache: DealVisualCache | null,
  size: { width: number; height: number },
): Promise<Response | null> {
  const pic = cache?.picture;
  if (!pic) return null;
  try {
    const bytes = await readPictureBytes(dealId, pic, pictureSizeFor(size));
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg" } });
  } catch {
    return null;
  }
}

/** Fetch one named source. Null when it is unavailable or fails. */
async function fetchOneRaw(
  source: ImageSource,
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  size: { width: number; height: number; zoom?: number },
): Promise<{ response: Response; placedBy?: GeocodeSource } | null> {
  const only = (response: Response | null) => (response ? { response } : null);
  if (source === "photo") {
    return only(await fetchStoredPicture(dealId, cache, size));
  }
  if (source === "streetview") {
    return only(await fetchStreetViewImage(supabase, dealId, address, cache, size));
  }
  // Both overhead sources need coordinates; resolving also caches them for
  // the map, so the pin and the photo can never disagree.
  const loc = await resolveDealLocation(supabase, dealId, address, cache);
  if (!loc) return null;
  const response = source === "satellite" ? await fetchGoogleSatelliteImage(loc, size) : await fetchAerialImage(loc, size);
  return response ? { response, ...(loc.source ? { placedBy: loc.source } : {}) } : null;
}

/**
 * Exactly one source, no fallback. Callers use this when the answer must be
 * attributable: a tab that credits Google must not silently show USGS.
 */
export async function fetchOneImage(
  source: ImageSource,
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  size: { width: number; height: number; zoom?: number },
): Promise<BestImage | null> {
  const res = await fetchOneRaw(source, supabase, dealId, address, cache, size);
  return res ? { ...res, source } : null;
}

async function runPlan(
  plan: ImageSource[],
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  size: { width: number; height: number; zoom?: number },
): Promise<BestImage | null> {
  for (const source of plan) {
    const res = await fetchOneRaw(source, supabase, dealId, address, cache, size);
    if (res) return { ...res, source };
  }
  return null;
}

/**
 * The best real picture of this building we can get right now: its own
 * photograph where one is stored, else the Street View photograph, else
 * the sharp Google satellite frame, else the USGS aerial. Null when the
 * deal has no address, nothing geocodes, or every source failed — callers
 * then render nothing. With `overhead: false` the two overheads are never
 * tried (#443): null then means no photograph of the building answered.
 */
export async function fetchBestBuildingImage(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  size: { width: number; height: number },
  opts: { overhead?: boolean; google?: boolean } = {},
): Promise<BestImage | null> {
  return runPlan(
    imagePlan({
      hasStreetAddress: !!address?.street?.trim(),
      googleConfigured: googleConfigured(),
      hasPicture: !!cache?.picture,
      overhead: opts.overhead,
      google: opts.google,
    }),
    supabase,
    dealId,
    address,
    cache,
    size,
  );
}

/**
 * The best OVERHEAD picture — the Aerial tab means "the view from above",
 * so Street View is never a candidate here however good it is.
 */
export async function fetchBestAerialImage(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  size: { width: number; height: number; zoom?: number },
): Promise<BestImage | null> {
  return runPlan(
    aerialPlan({ googleConfigured: googleConfigured() }),
    supabase,
    dealId,
    address,
    cache,
    size,
  );
}
