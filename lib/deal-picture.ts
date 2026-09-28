import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeCache, type DealPicture, type DealVisualCache } from "@/lib/deal-location";
import { RunGate } from "@/lib/anthropic/run-gate";
import { findOmImages, pickCover } from "@/lib/om-photo";
import { decodeOmCover } from "@/lib/om-photo-decode";
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
 * A LOCKED MEMORANDUM TOO (#440). The scan lifts a JPEG as the bytes it
 * is stored as, which a "secured" file (every stream encrypted under an
 * empty password) and a photograph stored as pixels both hide from it; a
 * scan that finds nothing hands the file to `lib/om-photo-decode`, which
 * opens it as a viewer does and reads the first pages' pictures. A verdict
 * of "no photograph" is kept with the search rules it was reached under
 * (`PICTURE_SEARCH_VERSION`), so a memorandum searched before a rule
 * changed is searched again on its next view rather than a month later.
 *
 * A LIMIT ON WHAT RUNS AT ONCE. The first view of a long pipeline asks for
 * every row's picture together; each answer for a deal with no picture yet
 * means downloading its memorandum. Two run at a time in a process, and the
 * rest wait their turn for up to `SEARCH_WAIT_MS` (#440), so the first view
 * shows every picture it can: before, they answered "not yet" at once and
 * fell through to the market's photograph or the overhead until a later
 * view. Two asks for one deal (the card, then the deal page) share one
 * search.
 */

/** The hero's long side, in pixels; the thumbnail's square. */
export const HERO_MAX_PX = 1600;
export const THUMB_PX = 240;
/** How long a memorandum with no photograph stays unsearched. */
const RECHECK_MS = 30 * 86_400_000;
/**
 * The memorandum search's rules. A "no photograph" verdict reached under
 * older rules is stale: 2 is the search that opens a locked file and
 * decodes a photograph stored as pixels (#440).
 */
export const PICTURE_SEARCH_VERSION = 2;
/** Extractions in flight per process. */
const MAX_IN_FLIGHT = 2;
/** How long an ask waits for its turn before it answers "not yet". */
export const SEARCH_WAIT_MS = 20_000;
/** The most an uploaded picture may weigh before it is even looked at. */
export const MAX_PICTURE_BYTES = 12 * 1024 * 1024;

/** What each origin is credited as, on the picture. */
export const PICTURE_CREDIT: Record<DealPicture["source"], string> = {
  om: "From the offering memorandum",
  upload: "Photograph added to the deal",
};

/** A picture as decoded pixels: what a locked memorandum's cover comes out as. */
export interface RawPicture {
  width: number;
  height: number;
  channels: 3 | 4;
  pixels: Uint8Array;
}

/** A picture's bytes as a file (a JPEG, a phone's upload), or as pixels. */
export type PictureInput = Buffer | RawPicture;

/** The two derivatives sharp writes from any picture it can read. */
export async function derivePicture(input: PictureInput): Promise<{
  hero: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}> {
  // `rotate()` with no angle honours the EXIF orientation a phone writes;
  // `failOn: "none"` lets a slightly damaged broker JPEG through rather than
  // refusing the whole picture over a warning. Pixels carry no orientation,
  // and a picture with an alpha channel is laid on white, as a page shows it.
  const base = Buffer.isBuffer(input)
    ? sharp(input, { failOn: "none", limitInputPixels: 80_000_000 }).rotate()
    : sharp(input.pixels, {
        raw: { width: input.width, height: input.height, channels: input.channels },
      }).flatten({ background: "#ffffff" });
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
  input: PictureInput,
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
  await writeCache(supabase, dealId, cache, {
    picture,
    pictureCheckedAt: picture.at,
    pictureSearchV: PICTURE_SEARCH_VERSION,
  });
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
    if (cache?.pictureCheckedAt) {
      await writeCache(supabase, dealId, cache, { pictureCheckedAt: undefined, pictureSearchV: undefined });
    }
    return;
  }
  await writeCache(supabase, dealId, cache, {
    picture: undefined,
    pictureCheckedAt: undefined,
    pictureSearchV: undefined,
  });
  await removeStorageFiles([pic.hero, pic.thumb], photoScope(dealId)).catch(() => {});
}

/** Every storage path a deal's picture occupies — for the deletion sweeps. */
export function picturePaths(cache: DealVisualCache | null | undefined): string[] {
  const pic = cache?.picture;
  return pic ? [pic.hero, pic.thumb] : [];
}

const searches = new RunGate(() => MAX_IN_FLIGHT);
/** The search running for each deal, so a second ask awaits the first. */
const inFlight = new Map<string, Promise<DealPicture | null>>();

/**
 * Whether a "no photograph" verdict still stands: reached under today's
 * search rules, inside the last thirty days.
 */
export function searchedRecently(cache: DealVisualCache | null, now = Date.now()): boolean {
  if (!cache?.pictureCheckedAt) return false;
  if (cache.pictureSearchV !== PICTURE_SEARCH_VERSION) return false;
  return now - Date.parse(cache.pictureCheckedAt) < RECHECK_MS;
}

/**
 * Whether the deal's memorandum may still hold a photograph nobody has
 * looked for: it has a memorandum, it is not the sample, no picture is
 * cached, and none was looked for in the last thirty days under today's
 * search rules. A surface that pins its sources (the pipeline's cards,
 * #428) tries the picture route first where this is true — the route lifts
 * the cover on that first ask, or answers 404 and the next source follows.
 * `ensureDealPicture`'s own rules, without its turn-taking.
 */
export function pictureMayBeInMemorandum(opts: {
  omPath: string | null;
  isSample: boolean;
  cache: DealVisualCache | null;
}): boolean {
  const { cache } = opts;
  if (cache?.picture || opts.isSample || !opts.omPath) return false;
  return !searchedRecently(cache);
}

/**
 * The cover out of a memorandum's bytes: the byte scan's JPEG where it
 * finds one, else the decoded search's pixels (a locked file, a photograph
 * stored as pixels), else null.
 */
export async function coverOf(pdf: Uint8Array): Promise<PictureInput | null> {
  const lifted = pickCover(findOmImages(pdf), pdf.length);
  if (lifted) return Buffer.from(lifted.bytes);
  const decoded = await decodeOmCover(pdf);
  return decoded
    ? { width: decoded.width, height: decoded.height, channels: decoded.channels, pixels: decoded.pixels }
    : null;
}

/**
 * The deal's picture, extracted from its memorandum on the first ask and
 * read from the cache after. Null means "none right now": no memorandum, a
 * memorandum with no photograph in it, the sample deal, or no turn free —
 * the caller falls through to the next picture.
 *
 * `waitMs` is how long the ask may wait for a turn, and whether it may
 * await a search another ask started for the same deal. A picture route,
 * whose image a page is already showing a placeholder for, waits
 * (`SEARCH_WAIT_MS`); a page render never does, so a busy process costs a
 * page its photograph this once and never its speed.
 */
export async function ensureDealPicture(
  supabase: SupabaseClient,
  dealId: string,
  opts: { omPath: string | null; isSample: boolean; cache: DealVisualCache | null; waitMs?: number },
): Promise<DealPicture | null> {
  const { cache } = opts;
  const waitMs = opts.waitMs ?? 0;
  if (cache?.picture) return cache.picture;
  if (opts.isSample || !opts.omPath) return null;
  if (searchedRecently(cache)) return null;
  const running = inFlight.get(dealId);
  if (running) return waitMs > 0 ? running : null;
  const search = searchMemorandum(supabase, dealId, opts.omPath, cache, waitMs);
  inFlight.set(dealId, search);
  try {
    return await search;
  } finally {
    inFlight.delete(dealId);
  }
}

async function searchMemorandum(
  supabase: SupabaseClient,
  dealId: string,
  omPath: string,
  cache: DealVisualCache | null,
  waitMs: number,
): Promise<DealPicture | null> {
  const release = await searches.acquireWithin(waitMs);
  if (!release) return null;
  try {
    const pdf = await downloadOmPdf(omPath, { kind: "deal", dealId, only: ["om"] });
    const cover = await coverOf(pdf);
    if (!cover) {
      await writeCache(supabase, dealId, cache, {
        pictureCheckedAt: new Date().toISOString(),
        pictureSearchV: PICTURE_SEARCH_VERSION,
      });
      return null;
    }
    return await storePicture(supabase, dealId, cache, cover, "om");
  } catch (err) {
    // A storage or decode failure is this request's problem, not the deal's:
    // nothing is written, so the next ask tries again.
    console.warn(`deal picture: ${dealId}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    release();
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
