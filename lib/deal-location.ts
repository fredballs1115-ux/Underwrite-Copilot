import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredAddress } from "@/lib/address";
import type { Point } from "@/lib/basemaps";
import { geocodeAddress, type Geocoded, type GeocodeSource } from "@/lib/geocode";
import type { FloodFrameRecord } from "@/lib/flood-frame-core";

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
  /** Google's Street View answer as an earlier cut kept it: the metadata's
   *  verdict, the point it was reached for and the panorama's coordinates.
   *  No longer written (Google's policies prohibit storing its content but
   *  for place and panorama IDs, lib/imagery `fetchStreetViewImage`); a row
   *  written before may carry them, and the next write drops them
   *  (`writeCache`). */
  status?: "ok" | "none" | "unconfigured";
  checkedAt?: string;
  checkedFor?: string;
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
  /** the address this entry was resolved for, as `geoKey` writes it (#441) */
  geoFor?: string;
  /** a geocode that definitively found nothing, so we stop re-asking */
  geoMiss?: boolean;
  /** the building's own photograph, stored as its derivatives (lib/deal-picture) */
  picture?: DealPicture;
  /** when the memorandum was last searched for one and none was found */
  pictureCheckedAt?: string;
  /** the search rules that verdict was reached under; see PICTURE_SEARCH_VERSION */
  pictureSearchV?: number;
  /** reads of the memorandum in a row that the time budget cut short before
   *  they found a photograph (lib/deal-picture): how many, when the last one
   *  ended, under which search rules. Such a read writes no verdict; the
   *  next one waits, and the third in a row is taken as the verdict */
  pictureRetry?: { n: number; at: string; v: number };
  /** the memorandum's other photographs, beside the cover, in page order
   *  (#448, lib/deal-picture) — each stored as the cover's derivatives are */
  gallery?: DealPicture[];
  /** the rules the gallery was read under; see GALLERY_VERSION. Set, with
   *  no gallery, where the memorandum held no other photograph */
  galleryV?: number;
  /** gallery reads in a row that the time budget cut short (lib/deal-
   *  picture, as `pictureRetry` counts the cover's): such a read stores what
   *  it found without `galleryV`, the next waits its turn, and the third in
   *  a row is taken as the gallery */
  galleryRetry?: { n: number; at: string; v: number };
  /** the Flood view's drawn frame (#472, lib/flood-map) — the picture and
   *  the classes each crop shows, for the point it was drawn around */
  floodFrame?: FloodFrameRecord;
}

/** The building's own photograph — where it came from and where its sizes live. */
export interface DealPicture {
  /** `photos/<dealId>/<stamp>-hero.jpg`, up to 1600px on the long side */
  hero: string;
  /** `photos/<dealId>/<stamp>-thumb.jpg`, a 240px square crop for a list row */
  thumb: string;
  /** the hero's pixel size */
  width: number;
  height: number;
  /** `photos/<dealId>/<stamp>-full.jpg`, up to 2560px on the long side:
   *  kept only where the source is larger than the hero, for a dense screen
   *  and the full-screen viewer (lib/deal-picture) */
  full?: string;
  /** the full derivative's pixel size */
  fullWidth?: number;
  fullHeight?: number;
  /** `photos/<dealId>/<stamp>-card.jpg`, up to 800px on the long side, never
   *  enlarged: what a pipeline card's srcset offers beside the hero
   *  (research pass 29). Kept wherever the hero is longer than it; one
   *  stored before is made from the hero on its first ask (lib/deal-picture
   *  `backfillCard`) */
  card?: string;
  /** the card derivative's pixel size */
  cardWidth?: number;
  cardHeight?: number;
  /** the derivatives' rules it was made under (lib/deal-picture's
   *  DERIVED_VERSION); absent on one made before they were counted */
  derivedV?: number;
  /** lifted from the memorandum's cover, or uploaded by the reader */
  source: "om" | "upload";
  at: string;
  /** the memorandum's page it was lifted from (1-based), where known */
  page?: number;
  /** a blur-up preview (#463): a WebP a couple of dozen pixels long, as a
   *  data URI kept inline so a page has the photograph's colours before it
   *  fetches the photograph (lib/photo-preview) */
  preview?: string;
}

// Precision now lives with the framing rules it drives (lib/imagery-plan),
// so the zoom table and the thing it switches on cannot drift apart.
export type { LocationPrecision } from "@/lib/imagery-plan";
import type { LocationPrecision } from "@/lib/imagery-plan";

export interface DealLocation extends Point {
  precision: LocationPrecision;
  /** which geocoder placed it: a map or a picture framed on a point Photon
   *  placed credits OpenStreetMap (lib/basemaps `OSM_LOCATION_PARTS`).
   *  Absent on a point cached before the source was recorded. */
  source?: GeocodeSource;
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
 *   3 — the entry is kept with the address it was resolved for (`geoFor`,
 *       #441). Nothing tied the two before: an edited address kept the old
 *       one's point, so the aerial, the pin and the flood zone showed the
 *       old place for up to a month, and a typed line whose street was read
 *       out later kept the district-wide frame it got without one.
 */
export const GEO_VERSION = 3;

/**
 * What a cached location was resolved FOR: whether the address named a
 * street (the geocoder asks the street-level service only then) and its line,
 * whitespace and case aside. A location resolved for another key is stale.
 */
export function geoKey(address: StructuredAddress | null): string {
  const line = (address?.label ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${address?.street?.trim() ? "street" : "area"}:${line}`;
}

/** The most an address's WORDING can support — the geocoder may deliver less. */
export function addressPrecision(a: StructuredAddress | null): LocationPrecision {
  return a?.street?.trim() ? "street" : "area";
}

/**
 * Whether the cached location still stands: resolved under today's rules,
 * inside the month, and — given the deal's address — for THAT address.
 */
export function cacheFresh(
  cache: DealVisualCache | null,
  now = Date.now(),
  address?: StructuredAddress | null,
): boolean {
  return (
    !!cache?.geoAt &&
    cache.geoV === GEO_VERSION &&
    now - Date.parse(cache.geoAt) < GEO_TTL_MS &&
    (address === undefined || cache.geoFor === geoKey(address))
  );
}

/** Whether a picture framed on the deal's point may ring its centre as the
 *  building: a street address the geocoder placed at the house itself. A
 *  point placed only to the street (its centreline) or to the town is that
 *  street's or that town's centre, never the building's, and a point not
 *  yet placed for this address says nothing — so none of them is ringed
 *  (the batch-2 audit: the shared screen ringed a town's centre as "the
 *  building" wherever the address named a street). */
export function pointIsBuilding(
  cache: DealVisualCache | null,
  address: StructuredAddress | null,
  now = Date.now(),
): boolean {
  return (
    !!address?.street?.trim() &&
    cacheFresh(cache, now, address) &&
    cache?.geoMiss !== true &&
    typeof cache?.lat === "number" &&
    typeof cache?.lng === "number" &&
    cache?.geoPrecision === "street"
  );
}

/** Whether the deal's point, as cached for this address, was placed by
 *  Photon — a geocoder on OpenStreetMap's data, asked where the Census
 *  geocoder found nothing — so a picture or a map framed on it credits
 *  OpenStreetMap (the batch-2 audit, LOW-8). A point not placed for this
 *  address yet says nothing. */
export function placedByOpenStreetMap(
  cache: DealVisualCache | null,
  address: StructuredAddress | null,
  now = Date.now(),
): boolean {
  return (
    cacheFresh(cache, now, address) &&
    cache?.geoMiss !== true &&
    typeof cache?.lat === "number" &&
    typeof cache?.lng === "number" &&
    cache?.geoSource === "photon"
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

  if (cacheFresh(cache, now(), address)) {
    if (cache?.geoMiss) return null;
    if (typeof cache?.lat === "number" && typeof cache?.lng === "number") {
      return {
        lat: cache.lat,
        lng: cache.lng,
        precision: cache.geoPrecision ?? addressPrecision(address),
        ...(cache.geoSource ? { source: cache.geoSource } : {}),
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

  const stamp = { geoAt: new Date(now()).toISOString(), geoV: GEO_VERSION, geoFor: geoKey(address) };
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

  return hit ? { lat: hit.lat, lng: hit.lng, precision: hit.precision, source: hit.source } : null;
}

/** The cache with Google's Street View answer taken out: an earlier cut
 *  stored the metadata's verdict and the panorama's coordinates, which
 *  Google's policies do not allow (only place and panorama IDs may be
 *  kept), so every write drops them. */
export function withoutGoogleContent(cache: DealVisualCache): DealVisualCache {
  const out = { ...cache };
  delete out.status;
  delete out.checkedAt;
  delete out.checkedFor;
  delete out.panoLat;
  delete out.panoLng;
  return out;
}

/**
 * The stored files a photo cache names, by the path that names each: its
 * photograph's hero, its gallery's first photograph and its flood frame —
 * each stamped anew whenever it is stored, so a record whose paths match is
 * the record that was read (research pass 39).
 */
export function photoRecordKeys(cache: DealVisualCache | null | undefined): {
  picture: string | null;
  gallery: string | null;
  flood: string | null;
} {
  return {
    picture: cache?.picture?.hero ?? null,
    gallery: cache?.gallery?.[0]?.hero ?? null,
    flood: cache?.floodFrame?.path ?? null,
  };
}

interface PhotoFilters<Q> {
  eq(column: string, value: string): Q;
  is(column: string, value: null): Q;
}

/**
 * An update of `deals.photo` held to the record it was made from: it
 * matches the row only while the photograph, the gallery and the flood
 * frame stored are still the ones `read` names (or still none). A write
 * that matches nothing changed nothing — another writer's photograph, read
 * since, is never undone by a copy made before it (the conditional write
 * lib/deal-picture `backfillCard` makes, for every writer of the column).
 */
export function onPhotoRecord<Q extends PhotoFilters<Q>>(query: Q, read: DealVisualCache | null | undefined): Q {
  const keys = photoRecordKeys(read);
  const held = (q: Q, column: string, value: string | null): Q => (value ? q.eq(column, value) : q.is(column, null));
  return held(held(held(query, "photo->picture->>hero", keys.picture), "photo->gallery->0->>hero", keys.gallery), "photo->floodFrame->>path", keys.flood);
}

/** Reads of the record a cache write makes before it gives up. */
export const CACHE_WRITE_TRIES = 3;

/** What a cache update did: whether it wrote, and the record it wrote over
 *  (or last read, where it wrote nothing). */
export interface CacheUpdate {
  wrote: boolean;
  read: DealVisualCache | null;
}

/**
 * Change the deal's photo cache by what `change` makes of the record as the
 * database holds it now — a patch to merge over it, or null for none —
 * written only onto that record (`onPhotoRecord`). Where another writer
 * stored a photograph, a gallery or a flood frame between the read and the
 * write, the write matches nothing and the record is read again and `change`
 * asked again, so it decides on what is there, never on a copy from before.
 */
export async function updateCache(
  supabase: SupabaseClient,
  dealId: string,
  fallback: DealVisualCache | null,
  change: (read: DealVisualCache | null) => Partial<DealVisualCache> | null,
): Promise<CacheUpdate> {
  let read: DealVisualCache | null = fallback;
  try {
    for (let tries = 0; tries < CACHE_WRITE_TRIES; tries++) {
      const { data, error: readErr } = await supabase
        .from("deals")
        .select("photo")
        .eq("id", dealId)
        .maybeSingle();
      // A read that failed stands in the caller's copy, as before; a read
      // that answered is the record, an empty one included.
      read = readErr ? fallback : (((data as { photo?: DealVisualCache | null } | null)?.photo ?? null) as DealVisualCache | null);
      const patch = change(read);
      if (!patch) return { wrote: false, read };
      const { data: wrote, error } = await onPhotoRecord(
        supabase
          .from("deals")
          .update({ photo: withoutGoogleContent({ ...(read ?? {}), ...patch }) })
          .eq("id", dealId),
        read,
      ).select("id");
      if (error) return { wrote: false, read };
      if (Array.isArray(wrote) && wrote.length > 0) return { wrote: true, read };
    }
  } catch {
    // Pre-0027 schema has no `photo` column — imagery still works, just
    // without the cache. Never fail a page render over a cache write.
  }
  return { wrote: false, read };
}

/**
 * Merge `patch` into the deal's photo cache without losing anything another
 * writer stored.
 *
 * The cache is one jsonb column shared by the geocoder, the picture search,
 * the reader's own photograph and the flood frame. The first cut merged the
 * patch over the copy of the column the CALLER had loaded, so a fresh point
 * written meanwhile was dropped; then the current row was read first and the
 * patch merged over that — but written unconditionally, so a photograph
 * stored between the read and the write was put back to the one before, its
 * files recorded nowhere (research pass 39). Now the patch is merged over
 * the record as it stands and written onto that record only (`updateCache`).
 * A patch that changes the photograph itself decides on the record it reads:
 * use `updateCache`. Answers whether it wrote.
 */
export async function writeCache(
  supabase: SupabaseClient,
  dealId: string,
  fallback: DealVisualCache | null,
  patch: Partial<DealVisualCache>,
): Promise<boolean> {
  return (await updateCache(supabase, dealId, fallback, () => patch)).wrote;
}
