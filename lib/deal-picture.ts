import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeCache, type DealPicture, type DealVisualCache } from "@/lib/deal-location";
import { findOmImages, pickCover } from "@/lib/om-photo";
import {
  dealPhotoPath,
  downloadDealFile,
  downloadOmPdf,
  removeStorageFiles,
  uploadDealPhoto,
} from "@/lib/storage";

/**
 * The building's own photograph: found once, stored twice, shown first.
 *
 * FOUND ONCE. The cover of the deal's memorandum is lifted out of the PDF
 * (`lib/om-photo`) the first time anything asks for the deal's picture —
 * the pipeline row's thumbnail, the deal page — and never again: the
 * result, or the fact that there was none, is written to the deal's
 * imagery cache (`deals.photo`, the jsonb the geocoder and the Street View
 * verdict already share). A memorandum with no usable photograph is
 * re-searched a month later at most, and the sample deal is never searched
 * at all, because its memorandum is not ours to republish a page of.
 *
 * STORED TWICE. The broker's JPEG can be 6,000 pixels and several
 * megabytes, and a list row wants 36 of them. So sharp — already in the
 * tree as Next's own image dependency — writes two derivatives into the
 * private bucket under the deal: a hero no wider than 1,600px for the deal
 * page, and a 240px square crop for a row. The reader's own upload goes
 * through the same two sizes, so a picture is never served as the bytes
 * somebody uploaded.
 *
 * A LIMIT ON WHAT RUNS AT ONCE. The first view of a long pipeline asks for
 * every row's picture together; each answer for a deal with no picture yet
 * means downloading its memorandum. Two run at a time in a process; the
 * rest answer "not yet" and fall through to the overhead this time, and
 * find the stored picture on the next view.
 */

/** The hero's long side, in pixels; the thumbnail's square. */
export const HERO_MAX_PX = 1600;
export const THUMB_PX = 240;
/** How long a memorandum with no photograph stays unsearched. */
const RECHECK_MS = 30 * 86_400_000;
/** Extractions in flight per process. */
const MAX_IN_FLIGHT = 2;
/** The most an uploaded picture may weigh before it is even looked at. */
export const MAX_PICTURE_BYTES = 12 * 1024 * 1024;

/** What each origin is credited as, on the picture. */
export const PICTURE_CREDIT: Record<DealPicture["source"], string> = {
  om: "From the offering memorandum",
  upload: "Photograph added to the deal",
};

/** The two derivatives sharp writes from any picture it can read. */
export async function derivePicture(input: Buffer): Promise<{
  hero: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}> {
  // `rotate()` with no angle honours the EXIF orientation a phone writes;
  // `failOn: "none"` lets a slightly damaged broker JPEG through rather than
  // refusing the whole picture over a warning.
  const base = sharp(input, { failOn: "none", limitInputPixels: 80_000_000 }).rotate();
  const hero = await base
    .clone()
    .resize({ width: HERO_MAX_PX, height: HERO_MAX_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: THUMB_PX, height: THUMB_PX, fit: "cover", position: "attention" })
    .jpeg({ quality: 78 })
    .toBuffer();
  return { hero: hero.data, thumb, width: hero.info.width, height: hero.info.height };
}

/** The scope every photo path is read and written under. */
function photoScope(dealId: string) {
  return { kind: "deal", dealId, only: ["photo"] } as const;
}

/**
 * Store a picture as the deal's own — from the memorandum or from the
 * reader — replacing whatever was there, and say so in the cache.
 */
export async function storePicture(
  supabase: SupabaseClient,
  dealId: string,
  cache: DealVisualCache | null,
  input: Buffer,
  source: DealPicture["source"],
): Promise<DealPicture> {
  const derived = await derivePicture(input);
  const stamp = Date.now().toString(36);
  const hero = dealPhotoPath(dealId, stamp, "hero");
  const thumb = dealPhotoPath(dealId, stamp, "thumb");
  await uploadDealPhoto(hero, derived.hero, photoScope(dealId));
  await uploadDealPhoto(thumb, derived.thumb, photoScope(dealId));
  const picture: DealPicture = {
    hero,
    thumb,
    width: derived.width,
    height: derived.height,
    source,
    at: new Date().toISOString(),
  };
  await writeCache(supabase, dealId, cache, { picture, pictureCheckedAt: picture.at });
  // The previous pair is orphaned now — best effort, never fatal.
  if (cache?.picture) {
    await removeStorageFiles([cache.picture.hero, cache.picture.thumb], photoScope(dealId)).catch(() => {});
  }
  return picture;
}

/**
 * Forget a picture that came from the memorandum — the memorandum was
 * replaced, so its cover may have been too. A picture the reader put there
 * is theirs and stays.
 */
export async function clearOmPicture(
  supabase: SupabaseClient,
  dealId: string,
  cache: DealVisualCache | null,
): Promise<void> {
  const pic = cache?.picture;
  if (!pic || pic.source !== "om") {
    // No memorandum picture to drop, but a "nothing in there" verdict is
    // stale the moment the file changes.
    if (cache?.pictureCheckedAt) await writeCache(supabase, dealId, cache, { pictureCheckedAt: undefined });
    return;
  }
  await writeCache(supabase, dealId, cache, { picture: undefined, pictureCheckedAt: undefined });
  await removeStorageFiles([pic.hero, pic.thumb], photoScope(dealId)).catch(() => {});
}

/** Every storage path a deal's picture occupies — for the deletion sweeps. */
export function picturePaths(cache: DealVisualCache | null | undefined): string[] {
  const pic = cache?.picture;
  return pic ? [pic.hero, pic.thumb] : [];
}

const inFlight = new Set<string>();

/**
 * Whether the deal's memorandum may still hold a photograph nobody has
 * looked for: it has a memorandum, it is not the sample, no picture is
 * cached, and none was looked for in the last thirty days. A surface that
 * pins its sources (the pipeline's cards, #428) tries the picture route
 * first where this is true — the route lifts the cover on that first ask,
 * or answers 404 and the next source follows. `ensureDealPicture`'s own
 * rules, without its in-flight guard.
 */
export function pictureMayBeInMemorandum(opts: {
  omPath: string | null;
  isSample: boolean;
  cache: DealVisualCache | null;
}): boolean {
  const { cache } = opts;
  if (cache?.picture || opts.isSample || !opts.omPath) return false;
  return !(cache?.pictureCheckedAt && Date.now() - Date.parse(cache.pictureCheckedAt) < RECHECK_MS);
}

/**
 * The deal's picture, extracted from its memorandum on the first ask and
 * read from the cache after. Null means "none right now": no memorandum, a
 * memorandum with no photograph in it, the sample deal, or too many
 * extractions already running — the caller falls through to the overhead.
 */
export async function ensureDealPicture(
  supabase: SupabaseClient,
  dealId: string,
  opts: { omPath: string | null; isSample: boolean; cache: DealVisualCache | null },
): Promise<DealPicture | null> {
  const { cache } = opts;
  if (cache?.picture) return cache.picture;
  if (opts.isSample || !opts.omPath) return null;
  if (cache?.pictureCheckedAt && Date.now() - Date.parse(cache.pictureCheckedAt) < RECHECK_MS) return null;
  if (inFlight.size >= MAX_IN_FLIGHT || inFlight.has(dealId)) return null;
  inFlight.add(dealId);
  try {
    const pdf = await downloadOmPdf(opts.omPath, { kind: "deal", dealId, only: ["om"] });
    const cover = pickCover(findOmImages(pdf), pdf.length);
    if (!cover) {
      await writeCache(supabase, dealId, cache, { pictureCheckedAt: new Date().toISOString() });
      return null;
    }
    return await storePicture(supabase, dealId, cache, Buffer.from(cover.bytes), "om");
  } catch (err) {
    // A storage or decode failure is this request's problem, not the deal's:
    // nothing is written, so the next ask tries again.
    console.warn(`deal picture: ${dealId}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    inFlight.delete(dealId);
  }
}

/**
 * Which stored derivative fits a requested frame: the thumbnail when the
 * frame is no larger than it, the hero otherwise. The one rule for the
 * route that serves the bytes and the header that names them.
 */
export function pictureSizeFor(size: { width: number; height: number }): "hero" | "thumb" {
  return size.width <= THUMB_PX && size.height <= THUMB_PX ? "thumb" : "hero";
}

/** The stored derivative's bytes, for the routes. */
export async function readPictureBytes(
  dealId: string,
  picture: DealPicture,
  size: "hero" | "thumb",
): Promise<Buffer> {
  return downloadDealFile(size === "thumb" ? picture.thumb : picture.hero, photoScope(dealId));
}
