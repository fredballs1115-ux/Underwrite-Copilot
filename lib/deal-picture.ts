import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeCache, type DealPicture, type DealVisualCache } from "@/lib/deal-location";
import { RunGate } from "@/lib/anthropic/run-gate";
import { PREVIEW_PX, isPreview } from "@/lib/photo-preview";
import { CARD_PX, cardWidthOf } from "@/lib/photo-srcset";
import { MAX_OM_PAGES } from "@/lib/pdf";
import { EARLY_SHARE, findOmImages, scanShaped, type OmImage } from "@/lib/om-photo";
import {
  FLAT_SHARE,
  NEAR_BITS,
  decodeOmCover,
  decodeOmPhotos,
  differenceHash,
  flatShare,
  hashDistance,
  type DecodedCover,
} from "@/lib/om-photo-decode";
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
 * (`lib/om-photo`) by the screen itself, right after its extraction and
 * from the bytes the screen already holds, so a new deal's first view finds
 * its photograph stored — or, for a deal screened before that, the first
 * time anything asks for the deal's picture (the pipeline row's thumbnail,
 * the deal page) — and never again: the
 * result, or the fact that there was none, is written to the deal's
 * imagery cache (`deals.photo`, the jsonb the geocoder and the Street View
 * verdict already share). A memorandum with no usable photograph is
 * re-searched a month later at most, and the sample deal is never searched
 * at all, because its memorandum is not ours to republish a page of.
 *
 * STORED TWICE, AND MORE WHERE IT IS WORTH IT. The broker's JPEG
 * can be 6,000 pixels and several megabytes, and a list row wants 36 of
 * them. So sharp — already in the tree as Next's own image dependency —
 * writes derivatives into the private bucket under the deal: a hero no
 * wider than 1,600px for the deal page, a 240px square crop for a row, and,
 * where the source is larger than the hero, a full-size copy up to 2,560px
 * (`FULL_MAX_PX`) that a dense screen and the full-screen viewer ask for
 * through a srcset, where the hero alone was drawn stretched. A pipeline
 * card's srcset offers a card copy beside the hero, 800px on its long side
 * (`CARD_PX`, research pass 29): every card had downloaded the hero for a
 * slot of about 350px. The reader's own upload goes through the same sizes,
 * so a picture is never served as the bytes somebody uploaded.
 *
 * MADE AGAIN, QUIETLY. A memorandum's photograph derived under older rules
 * (`DERIVED_VERSION`: before the full-size copy) is made again from the
 * memorandum behind a view, in a turn of its own only when one is free, and
 * it keeps showing until the new derivatives replace it — only where the
 * cover the pages give now is the same photograph (by its hash), and only
 * onto the picture still stored then. It is tried once a deal whatever the
 * outcome. The reader's own upload, whose original bytes are not kept,
 * stands as it is.
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
 * A READ CUT SHORT SAYS NOTHING. The pages are read inside a time budget,
 * and a secured memorandum or a photograph stored as pixels is exactly what
 * the byte scan cannot see into, so a read the budget cut short on a busy
 * process used to be written down as "no photograph" and trusted for a
 * month. The verdict is written now only after a complete read (`readCover`'s
 * `complete`); a read cut short is counted instead (`pictureRetry`), the next
 * waits ten minutes, then two hours, and the third in a row stands as the
 * verdict — so a file the reader can never finish costs three decodes a
 * month, not one a view.
 *
 * THE COVER PAGE'S PHOTOGRAPH, NEVER A MAP (#444). The pages decide now
 * (`coverOf`): the old scan took the largest JPEG anywhere in the file, and
 * a memorandum's largest pictures are its aerial and its location maps. A
 * photograph lifted under the older rules is judged again on its next ask
 * (`staleOmPicture`): replaced where the cover page gives another, dropped
 * where the first pages hold none, and kept while the search cannot run.
 * A page render never waits on it (the old one shows this once); the
 * pipeline asks for it as a memorandum not yet looked in, over the next
 * picture. The reader's own picture is theirs and never judged again.
 *
 * A LIMIT ON WHAT RUNS AT ONCE. The first view of a long pipeline asks for
 * every row's picture together; each answer for a deal with no picture yet
 * means downloading its memorandum. Two run at a time in a process, and the
 * rest wait their turn for up to `SEARCH_WAIT_MS` (#440), so the first view
 * shows every picture it can: before, they answered "not yet" at once and
 * fell through to the market's photograph or the overhead until a later
 * view. Two asks for one deal (the card, then the deal page) share one
 * search.
 *
 * THE REST OF THE MEMORANDUM'S PHOTOGRAPHS (#448). A listing shows the
 * building from every side; a memorandum carries those pictures and the
 * site showed one. The gallery is every other photograph the first
 * `GALLERY_PAGES` pages paint, by the cover's own rules (never a map, a
 * plan or a page of text), the cover and any picture placed twice passed
 * over by their hashes, up to `GALLERY_MAX`, each stored as the same
 * derivatives and credited with its page. It is read behind the cover in
 * the same turn, so the cover shows while it is read, and for a deal whose
 * cover is current it is read in a turn of its own when one is free — a
 * gallery is never worth a wait. A photograph beside the cover is never
 * made the cover: past the first pages it may be the neighbourhood.
 */

/** The hero's long side, in pixels; the thumbnail's square. */
export const HERO_MAX_PX = 1600;
export const THUMB_PX = 240;
/**
 * The full-size copy's long side, kept only where the source is larger than
 * the hero. The deal page's frame is drawn at a hero's width on nearly every
 * screen; the full-screen viewer on a dense laptop, a panorama covering a
 * frame by its height and a phone held sideways need more, and got the hero
 * stretched.
 */
export const FULL_MAX_PX = 2560;
/**
 * The derivatives' rules: 1 keeps the full-size copy. A memorandum's
 * photograph derived under older ones is made again behind a view, once.
 */
export const DERIVED_VERSION = 1;
/**
 * The long side a small photograph's hero is enlarged to (#446). A
 * memorandum exported for email carries its cover at 600 to 900 pixels,
 * and a browser stretching that across a card on a dense screen draws it
 * soft. Enlarged here with Lanczos and a light unsharp mask it holds its
 * edges (compared by eye against a plain stretch of the same file), and
 * never by more than `MAX_ENLARGE`, past which no filter adds detail.
 */
export const HERO_MIN_PX = 1200;
export const MAX_ENLARGE = 2;
/** How long a memorandum with no photograph stays unsearched. */
const RECHECK_MS = 30 * 86_400_000;
/**
 * The memorandum search's rules. A "no photograph" verdict reached under
 * older rules is stale: 2 is the search that opens a locked file and
 * decodes a photograph stored as pixels (#440), 3 the one that reads the
 * cover page first and refuses a map, a plan or a page of text (#444), 4 the
 * one that enlarges a small cover's hero cleanly rather than leaving the
 * browser to stretch it (#446), 5 the one that says nothing where the time
 * budget cut its read short — so a verdict of none reached before, which may
 * have been exactly that, is looked at again — and 6 the one that decodes a
 * photograph stored as JPEG 2000 (lib/pdfjs-wasm), which every search before
 * it passed over, so a verdict of none reached before is looked at again.
 */
export const PICTURE_SEARCH_VERSION = 6;
/**
 * The oldest rules a photograph lifted from the memorandum still stands
 * under. A photograph lifted before 3 could be a map and is judged again
 * (#444), and one before 4 had its hero left for the browser to stretch
 * (#446). The rules since change what it takes to say there is none, and
 * find a cover stored as JPEG 2000 where none was found; a photograph
 * already lifted — the cover page's, or one from the pages after it — is
 * still a photograph of the building, so it is not judged again.
 */
export const PHOTO_RULES_SINCE = 4;
/**
 * Reads cut short by the time budget, in a row, before the last of them is
 * taken as the verdict. A read the time cuts short writes nothing — it never
 * looked, so it cannot say the memorandum holds no photograph — but a file
 * that runs out of time on every read must not be decoded on every view for
 * ever: the next read waits `RETRY_AFTER_MS` (ten minutes after the first,
 * two hours after the second, so a process that was merely busy gets its
 * answer the same day), and the third in a row stands as the verdict for
 * the month, as a complete read that found nothing does. So a memorandum
 * the reader can never finish costs at most three decodes a month.
 */
export const MAX_CUT_READS = 3;
export const RETRY_AFTER_MS: readonly number[] = [10 * 60_000, 2 * 3_600_000];
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

/**
 * The gallery's rules (#448): 1 reads the memorandum's first sixteen pages
 * for up to eight photographs beside the cover, and 2 keeps each one's
 * full-size copy (`DERIVED_VERSION`). A gallery read under other rules is
 * read again behind a view, the old one showing until it is replaced.
 */
export const GALLERY_VERSION = 2;

/**
 * A gallery photograph's page as a credit may print it: a whole number from
 * 1 to the longest memorandum the site reads (`MAX_OM_PAGES`), else none.
 * The page is stored in deals.photo, which the deal's owner can write, and it
 * goes into the picture route's `x-image-credit` header — where a line break
 * made the route answer 500 (research pass 22) — and into every credit and
 * alt text a gallery photograph wears. Every one of them reads it here.
 */
export function galleryPage(page: unknown): number | null {
  return typeof page === "number" && Number.isInteger(page) && page >= 1 && page <= MAX_OM_PAGES ? page : null;
}

/** A memorandum photograph beside the cover, credited with its page where
 *  it has one a credit may print (`galleryPage`). */
export function memorandumPhotoCredit(page: unknown): string {
  const n = galleryPage(page);
  return n ? `${PICTURE_CREDIT.om}, page ${n}` : PICTURE_CREDIT.om;
}

/** A picture as decoded pixels: what a locked memorandum's cover comes out as. */
export interface RawPicture {
  width: number;
  height: number;
  channels: 3 | 4;
  pixels: Uint8Array;
}

/** A picture's bytes as a file (a JPEG, a phone's upload), or as pixels. */
export type PictureInput = Buffer | RawPicture;

/** A derivative's bytes and its pixel size. */
export interface DerivedCopy {
  bytes: Buffer;
  width: number;
  height: number;
}

/** What sharp writes from a picture, before any of it is stored. */
export interface DerivedPicture {
  hero: Buffer;
  thumb: Buffer;
  /** the hero's pixel size */
  width: number;
  height: number;
  /** the full-size copy, where the source is larger than the hero */
  full: DerivedCopy | null;
  /** the card copy (research pass 29), where the hero is longer than one */
  card: DerivedCopy | null;
  /** the blur-up preview (#463), null where it could not be made */
  preview: string | null;
}

/** The card copy's encoding: the hero's, so a card's picture is the hero's
 *  photograph at fewer pixels and nothing else. */
const CARD_RESIZE = { width: CARD_PX, height: CARD_PX, fit: "inside", withoutEnlargement: true } as const;
const CARD_JPEG = { quality: 82, mozjpeg: true } as const;

/** The derivatives sharp writes from any picture it can read. */
export async function derivePicture(input: PictureInput): Promise<DerivedPicture> {
  // `rotate()` with no angle honours the EXIF orientation a phone writes;
  // `failOn: "none"` lets a slightly damaged broker JPEG through rather than
  // refusing the whole picture over a warning. Pixels carry no orientation,
  // and a picture with an alpha channel is laid on white, as a page shows it.
  const base = Buffer.isBuffer(input)
    ? sharp(input, { failOn: "none", limitInputPixels: 80_000_000 }).rotate()
    : sharp(input.pixels, {
        raw: { width: input.width, height: input.height, channels: input.channels },
      }).flatten({ background: "#ffffff" });
  const long = Buffer.isBuffer(input)
    ? await sharp(input, { failOn: "none", limitInputPixels: 80_000_000 })
        .metadata()
        .then((m) => Math.max(m.width ?? 0, m.height ?? 0))
    : Math.max(input.width, input.height);
  const sized =
    long >= HERO_MIN_PX
      ? base.clone().resize({ width: HERO_MAX_PX, height: HERO_MAX_PX, fit: "inside", withoutEnlargement: true })
      : (() => {
          const target = Math.min(HERO_MIN_PX, Math.round(long * MAX_ENLARGE));
          return base
            .clone()
            .resize({ width: target, height: target, fit: "inside", kernel: "lanczos3" })
            .sharpen({ sigma: 0.8, m1: 0.6, m2: 2.2 });
        })();
  const hero = await sized.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: THUMB_PX, height: THUMB_PX, fit: "cover", position: "attention" })
    .jpeg({ quality: 78 })
    .toBuffer();
  // The full-size copy, only where there is more of the photograph than the
  // hero holds: never an enlargement, and never a second copy of the hero.
  const full =
    long > HERO_MAX_PX
      ? await base
          .clone()
          .resize({ width: FULL_MAX_PX, height: FULL_MAX_PX, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer({ resolveWithObject: true })
      : null;
  // The card copy (research pass 29), wherever the hero is longer than one:
  // from the photograph itself, never enlarged, so a small photograph's copy
  // is its own pixels — where its hero was enlarged for the deal page.
  const card =
    Math.max(hero.info.width, hero.info.height) > CARD_PX
      ? await base.clone().resize(CARD_RESIZE).jpeg(CARD_JPEG).toBuffer({ resolveWithObject: true })
      : null;
  return {
    hero: hero.data,
    thumb,
    width: hero.info.width,
    height: hero.info.height,
    full: full ? { bytes: full.data, width: full.info.width, height: full.info.height } : null,
    card: card ? { bytes: card.data, width: card.info.width, height: card.info.height } : null,
    preview: await previewOf(hero.data),
  };
}

/**
 * A card copy made from a stored hero's bytes (research pass 29): what the
 * picture route serves a photograph stored before card copies on its first
 * ask, and stores after its response (`backfillCard`). Never enlarged; null
 * where the hero is no longer than a card copy, or could not be read.
 */
export async function cardOf(heroBytes: Buffer): Promise<DerivedCopy | null> {
  try {
    const meta = await sharp(heroBytes, { failOn: "none" }).metadata();
    if (!(Math.max(meta.width ?? 0, meta.height ?? 0) > CARD_PX)) return null;
    const { data, info } = await sharp(heroBytes, { failOn: "none" })
      .resize(CARD_RESIZE)
      .jpeg(CARD_JPEG)
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/**
 * The path a photograph's card copy is stored at: beside its hero, under the
 * hero's own stamp, so the URL that names the picture's version names the
 * copy too (lib/deal-banner `pictureVersion`). Null for a hero not of that
 * shape.
 */
export function cardPathOf(picture: DealPicture): string | null {
  const m = /^(photos\/[^/]+\/[a-z0-9]+)-hero\.jpg$/.exec(picture.hero ?? "");
  return m ? `${m[1]}-card.jpg` : null;
}

/**
 * Whether a stored photograph should have a card copy it does not have yet:
 * one stored before card copies, whose hero is longer than a copy
 * (lib/photo-srcset `cardWidthOf`). The picture route makes it from the hero
 * on the first ask.
 */
export function cardCopyDue(picture: DealPicture): boolean {
  return !picture.card && cardWidthOf({ width: picture.width, height: picture.height }) !== null && cardPathOf(picture) !== null;
}

/**
 * Store the card copy the picture route made for a photograph stored before
 * card copies, after its response (research pass 29) — as `backfillPreview`
 * stores a preview: the row is read again before the copy is put and again
 * just before the write, and the path goes only onto the photograph still
 * stored then, at its place (the cover, or the gallery's `gallery`th, from
 * 1), and only where it has no copy yet. A photograph replaced while the
 * copy was put has its copy taken away again: it is nobody's. Never throws.
 */
export async function backfillCard(
  supabase: SupabaseClient,
  dealId: string,
  picture: DealPicture,
  made: DerivedCopy,
  gallery?: number,
): Promise<void> {
  const path = picture.card ? null : cardPathOf(picture);
  if (!path) return;
  const read = async (): Promise<DealVisualCache | null> => {
    const { data } = await supabase.from("deals").select("photo").eq("id", dealId).maybeSingle();
    return (data as { photo?: DealVisualCache | null } | null)?.photo ?? null;
  };
  const placed = (photo: DealVisualCache | null): DealPicture | null =>
    (gallery ? photo?.gallery?.[gallery - 1] : photo?.picture) ?? null;
  let put = false;
  try {
    const before = placed(await read());
    if (!before || before.hero !== picture.hero || before.card) return;
    await uploadDealPhoto(path, made.bytes, photoScope(dealId));
    put = true;
    const current = await read();
    const still = placed(current);
    if (current && still && still.hero === picture.hero) {
      // Another ask stored the same copy meanwhile: it is in place.
      if (still.card) return;
      const next: DealPicture = { ...still, card: path, cardWidth: made.width, cardHeight: made.height };
      const photo: DealVisualCache = gallery
        ? { ...current, gallery: (current.gallery ?? []).map((g, i) => (i === gallery - 1 ? next : g)) }
        : { ...current, picture: next };
      const { error } = await supabase.from("deals").update({ photo }).eq("id", dealId);
      if (!error) return;
    }
  } catch {
    // A card copy is a saving, never a reason a request fails.
  }
  // Put, and not recorded on the photograph: nobody's file.
  if (put) await removeStorageFiles([path], photoScope(dealId)).catch(() => {});
}

/**
 * The photograph's blur-up preview (#463): the whole frame a couple of
 * dozen pixels long, a WebP of a few hundred bytes as a data URI, kept in
 * the photo cache beside the stored pair so the page that draws the
 * photograph paints its colours first. Made from the hero — the frame the
 * cards and the deal page show. Null on any failure: a preview is a nicety,
 * never a reason a picture is not stored.
 */
export async function previewOf(bytes: Buffer): Promise<string | null> {
  try {
    const webp = await sharp(bytes, { failOn: "none" })
      .resize({ width: PREVIEW_PX, height: PREVIEW_PX, fit: "inside" })
      .webp({ quality: 40 })
      .toBuffer();
    const uri = `data:image/webp;base64,${webp.toString("base64")}`;
    return isPreview(uri) ? uri : null;
  } catch {
    return null;
  }
}

/**
 * Give a photograph stored before previews existed its preview, from the
 * hero bytes a request already holds (#463) — the picture route's, so no
 * photograph is ever fetched for its preview alone. The row is read again
 * just before the write and the preview goes onto the picture stored THEN,
 * only where it is still the one the bytes are of: a photograph replaced
 * while the request ran is never put back. Never throws.
 */
export async function backfillPreview(
  supabase: SupabaseClient,
  dealId: string,
  picture: DealPicture,
  heroBytes: Buffer,
): Promise<void> {
  if (picture.preview) return;
  const preview = await previewOf(heroBytes);
  if (!preview) return;
  try {
    const { data } = await supabase.from("deals").select("photo").eq("id", dealId).maybeSingle();
    const current = (data as { photo?: DealVisualCache | null } | null)?.photo ?? null;
    if (!current?.picture || current.picture.hero !== picture.hero || current.picture.preview) return;
    await supabase
      .from("deals")
      .update({ photo: { ...current, picture: { ...current.picture, preview } } })
      .eq("id", dealId);
  } catch {
    // A preview is a nicety: never fail a request over one.
  }
}

/** The scope every photo path is read and written under. */
function photoScope(dealId: string) {
  return { kind: "deal", dealId, only: ["photo"] } as const;
}

/** Every stored file of one picture: its hero, its thumbnail, its card copy
 *  and its full-size copy. */
function pathsOf(picture: DealPicture): string[] {
  return [picture.hero, picture.thumb, ...(picture.card ? [picture.card] : []), ...(picture.full ? [picture.full] : [])];
}

/**
 * Upload a picture's derivatives under one new stamp and say where they
 * are, under today's derivation rules. Nothing is written to the cache.
 */
async function putDerived(
  dealId: string,
  derived: DerivedPicture,
  stamp: string,
  source: DealPicture["source"],
  at: string,
): Promise<DealPicture> {
  const hero = dealPhotoPath(dealId, stamp, "hero");
  const thumb = dealPhotoPath(dealId, stamp, "thumb");
  await uploadDealPhoto(hero, derived.hero, photoScope(dealId));
  await uploadDealPhoto(thumb, derived.thumb, photoScope(dealId));
  let card: Pick<DealPicture, "card" | "cardWidth" | "cardHeight"> = {};
  if (derived.card) {
    const path = dealPhotoPath(dealId, stamp, "card");
    await uploadDealPhoto(path, derived.card.bytes, photoScope(dealId));
    card = { card: path, cardWidth: derived.card.width, cardHeight: derived.card.height };
  }
  let full: Pick<DealPicture, "full" | "fullWidth" | "fullHeight"> = {};
  if (derived.full) {
    const path = dealPhotoPath(dealId, stamp, "full");
    await uploadDealPhoto(path, derived.full.bytes, photoScope(dealId));
    full = { full: path, fullWidth: derived.full.width, fullHeight: derived.full.height };
  }
  return {
    hero,
    thumb,
    width: derived.width,
    height: derived.height,
    ...card,
    ...full,
    source,
    at,
    derivedV: DERIVED_VERSION,
    ...(derived.preview ? { preview: derived.preview } : {}),
  };
}

/**
 * Store a picture as the deal's own — from the memorandum or from the
 * reader — and say so in the cache. The row is read at the write, never at
 * the search's start: a memorandum's cover goes only onto the picture the
 * search began from, so a reader's upload (or another search's cover)
 * stored while this one read the file wins and this cover's files go — the
 * screen's lift held its copy of the row through a thirty-second wait for a
 * turn, replaced an upload, and left the upload's files where no deletion
 * sweep knew of them (the pre-ship audit of 2026-09-30). A reader's upload
 * goes over whatever is there. The files removed are the picture actually
 * replaced. Answers the picture the deal holds afterwards.
 */
export async function storePicture(
  supabase: SupabaseClient,
  dealId: string,
  cache: DealVisualCache | null,
  input: PictureInput,
  source: DealPicture["source"],
): Promise<DealPicture | null> {
  const derived = await derivePicture(input);
  const picture = await putDerived(dealId, derived, Date.now().toString(36), source, new Date().toISOString());
  const swap = await swapPicture(
    supabase,
    dealId,
    cache,
    { picture, pictureCheckedAt: picture.at, pictureSearchV: PICTURE_SEARCH_VERSION, pictureRetry: undefined },
    source === "om" ? (cache?.picture?.hero ?? null) : undefined,
  );
  if (!swap.stored) {
    await removeStorageFiles(pathsOf(picture), photoScope(dealId)).catch(() => {});
    return swap.current;
  }
  // The picture replaced is orphaned now — best effort, never fatal.
  if (swap.replaced && swap.replaced.hero !== picture.hero) {
    await removeStorageFiles(pathsOf(swap.replaced), photoScope(dealId)).catch(() => {});
  }
  return picture;
}

/**
 * Merge a patch touching the picture into the cache, read at the write:
 * where `expectHero` is given (null for "no picture"), only while the
 * picture stored is still that one. Answers whether it wrote, the picture
 * it replaced and the one stored after.
 */
async function swapPicture(
  supabase: SupabaseClient,
  dealId: string,
  fallback: DealVisualCache | null,
  patch: Partial<DealVisualCache>,
  expectHero?: string | null,
): Promise<{ stored: boolean; replaced: DealPicture | null; current: DealPicture | null }> {
  let row: DealVisualCache = fallback ?? {};
  try {
    const { data } = await supabase.from("deals").select("photo").eq("id", dealId).maybeSingle();
    row = ((data as { photo?: DealVisualCache | null } | null)?.photo ?? fallback ?? {}) as DealVisualCache;
  } catch {
    // Read failed: the caller's copy stands in, as writeCache's does.
  }
  const was = row.picture ?? null;
  if (expectHero !== undefined && (was?.hero ?? null) !== expectHero) {
    return { stored: false, replaced: null, current: was };
  }
  try {
    await supabase.from("deals").update({ photo: { ...row, ...patch } }).eq("id", dealId);
  } catch {
    // Pre-0027 schema has no `photo` column — never fail over a cache write.
  }
  return { stored: true, replaced: was, current: "picture" in patch ? (patch.picture ?? null) : was };
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
  // The memorandum's other photographs were the old file's too (#448).
  const galleryFiles = galleryPaths(cache);
  const galleryPatch =
    cache?.galleryV !== undefined || cache?.galleryRetry !== undefined || galleryFiles.length > 0
      ? { gallery: undefined, galleryV: undefined, galleryRetry: undefined }
      : {};
  if (!pic || pic.source !== "om") {
    // No memorandum picture to drop, but a "nothing in there" verdict — and
    // a count of reads the time cut short — is stale the moment the file
    // changes.
    if (cache?.pictureCheckedAt || cache?.pictureRetry || "galleryV" in galleryPatch) {
      await writeCache(supabase, dealId, cache, {
        pictureCheckedAt: undefined,
        pictureSearchV: undefined,
        pictureRetry: undefined,
        ...galleryPatch,
      });
    }
    if (galleryFiles.length > 0) await removeStorageFiles(galleryFiles, photoScope(dealId)).catch(() => {});
    return;
  }
  await writeCache(supabase, dealId, cache, {
    picture: undefined,
    pictureCheckedAt: undefined,
    pictureSearchV: undefined,
    pictureRetry: undefined,
    ...galleryPatch,
  });
  await removeStorageFiles([...pathsOf(pic), ...galleryFiles], photoScope(dealId)).catch(() => {});
}

/** Every storage path the gallery occupies. */
function galleryPaths(cache: DealVisualCache | null | undefined): string[] {
  return (cache?.gallery ?? []).flatMap(pathsOf);
}

/** Every storage path a deal's pictures occupy — for the deletion sweeps. */
export function picturePaths(cache: DealVisualCache | null | undefined): string[] {
  const pic = cache?.picture;
  return [...(pic ? pathsOf(pic) : []), ...galleryPaths(cache)];
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
 * Whether a read the time budget cut short still holds the next one back:
 * one or two such reads in a row under today's rules, the last of them
 * inside its wait (`RETRY_AFTER_MS`). The third in a row is written as the
 * verdict and never counted here.
 */
export function retryWaiting(cache: DealVisualCache | null | undefined, now = Date.now()): boolean {
  const r = cache?.pictureRetry;
  if (!r || r.v !== PICTURE_SEARCH_VERSION || !(r.n >= 1)) return false;
  const wait = RETRY_AFTER_MS[Math.min(r.n, RETRY_AFTER_MS.length) - 1];
  return now - Date.parse(r.at) < wait;
}

/**
 * Whether the deal's memorandum may still hold a photograph nobody has
 * looked for: it has a memorandum, it is not the sample, no picture is
 * cached, and none was looked for in the last thirty days under today's
 * search rules — nor is a read the time cut short still waiting to be made
 * again. A surface that pins its sources (the pipeline's cards,
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
  if (opts.isSample || !opts.omPath || currentPicture(cache)) return false;
  // A read the time cut short is made again only once its wait is over;
  // meanwhile an old photograph is shown as it is.
  if (retryWaiting(cache)) return false;
  // A photograph lifted under older rules is looked for again (#444).
  if (staleOmPicture(cache)) return true;
  return !searchedRecently(cache);
}

/**
 * A photograph lifted from the memorandum under rules older than
 * `PHOTO_RULES_SINCE` (#444): those could take a map for the cover, so it
 * is judged again on its next ask. A picture the reader put there is theirs
 * and never is.
 */
export function staleOmPicture(cache: DealVisualCache | null | undefined): boolean {
  return cache?.picture?.source === "om" && (cache.pictureSearchV ?? 0) < PHOTO_RULES_SINCE;
}

/** The deal's picture as today's rules stand behind it: the reader's own,
 *  or the memorandum's lifted under today's search. */
export function currentPicture(cache: DealVisualCache | null | undefined): DealPicture | null {
  return cache?.picture && !staleOmPicture(cache) ? cache.picture : null;
}

/** An even 16 × 16 sample's mean colour, from raw pixels. */
function meanOf(pixels: ArrayLike<number>, width: number, height: number, channels: number): number[] {
  const sum = [0, 0, 0];
  for (let sy = 0; sy < 16; sy++) {
    const y = Math.min(height - 1, Math.floor(((sy + 0.5) * height) / 16));
    for (let sx = 0; sx < 16; sx++) {
      const x = Math.min(width - 1, Math.floor(((sx + 0.5) * width) / 16));
      const o = (y * width + x) * channels;
      for (let c = 0; c < 3; c++) sum[c] += pixels[o + c];
    }
  }
  return sum.map((v) => v / 256);
}

/** A stored JPEG's small sample, raw RGB: for the flat test and the match. */
async function jpegSample(bytes: Uint8Array, side: number): Promise<Buffer | null> {
  try {
    return await sharp(bytes, { failOn: "none" })
      .removeAlpha()
      .resize(side, side, { fit: "fill", kernel: "nearest" })
      .raw()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * The file's own JPEG of the picture the pages were read for, where the file
 * stores it as one: the same size, and the same colour on a small sample, so
 * a different picture of the same size is never taken for it. The camera's
 * bytes rather than a re-encoding of pdfjs's pixels.
 */
async function storedJpegOf(images: readonly OmImage[], cover: DecodedCover): Promise<OmImage | null> {
  const want = meanOf(cover.pixels, cover.width, cover.height, cover.channels);
  for (const im of images) {
    if (im.width !== cover.width || im.height !== cover.height || !scanShaped(im)) continue;
    const sample = await jpegSample(im.bytes, 16);
    if (!sample) continue;
    const got = meanOf(sample, 16, 16, 3);
    if (got.every((v, i) => Math.abs(v - want[i]) <= 16)) return im;
  }
  return null;
}

/**
 * The cover out of a memorandum's bytes (#444): the photograph the pages
 * say it is (`lib/om-photo-decode`: the cover page's first, never a map, a
 * plan or a page of text, nothing past page four), as the file's own JPEG
 * where it stores one and as pixels otherwise. Only where pdfjs could not
 * read the file, or ran out of time before the cover page was weighed, does
 * the byte scan guess: the first photograph-shaped JPEG in the file's first
 * 30% that is not a flat map. It no longer takes the largest in the file,
 * which was how a memorandum's high-resolution aerial or location map beat
 * its cover.
 */
export async function coverOf(pdf: Uint8Array): Promise<PictureInput | null> {
  return (await readCover(pdf)).cover;
}

/**
 * `coverOf`, and whether "none" is an answer (`complete`). A search that
 * finds no cover says so for a month only where the read reached its end —
 * every page it covers read, or a file that cannot be opened at all — and
 * the byte scan, where it had to guess, found nothing either. Where the time
 * budget cut the read short (a secured memorandum's pages, or a photograph
 * stored as pixels, on a slow or busy process: exactly the files the scan
 * cannot see into), it never looked, so it says nothing.
 */
export async function readCover(
  pdf: Uint8Array,
  opts: { budgetMs?: number } = {},
): Promise<{ cover: PictureInput | null; complete: boolean }> {
  const read = await decodeOmCover(pdf, opts);
  const stored = findOmImages(pdf);
  if (read.cover) {
    const jpeg = await storedJpegOf(stored, read.cover);
    if (jpeg) return { cover: Buffer.from(jpeg.bytes), complete: true };
    const { width, height, channels, pixels } = read.cover;
    return { cover: { width, height, channels, pixels }, complete: true };
  }
  if (read.opened && read.pageOneRead) return { cover: null, complete: read.complete };
  const early = stored
    .filter((im) => pdf.length > 0 && im.offset / pdf.length < EARLY_SHARE && scanShaped(im))
    .sort((a, b) => a.offset - b.offset);
  for (const im of early) {
    const sample = await jpegSample(im.bytes, 64);
    if (sample && flatShare(sample, 64, 64, 3) < FLAT_SHARE) return { cover: Buffer.from(im.bytes), complete: true };
  }
  return { cover: null, complete: read.complete };
}

/**
 * A picture's difference hash (lib/om-photo-decode), from pixels or from a
 * file, so the cover — found as either — is passed over by the gallery.
 */
export async function hashOf(input: PictureInput): Promise<bigint | null> {
  if (!Buffer.isBuffer(input)) return differenceHash(input.pixels, input.width, input.height, input.channels);
  try {
    const { data, info } = await sharp(input, { failOn: "none", limitInputPixels: 80_000_000 })
      .rotate()
      .removeAlpha()
      .resize(144, 128, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return differenceHash(data, info.width, info.height, info.channels);
  } catch {
    return null;
  }
}

/** A gallery photograph, derived and not yet stored. */
interface DerivedPhoto extends DerivedPicture {
  page: number;
}

/**
 * The memorandum's photographs beside the cover (#448, `decodeOmPhotos`),
 * each derived as it is read — as the file's own JPEG where it stores one,
 * as pixels otherwise — so one decoded picture is held at a time. `skip`
 * holds the cover's hash. Null where it gave way to `yieldTo` before the
 * end: an incomplete gallery is never stored as the gallery. `cut` where
 * the time budget ended the read first: the photographs are the ones read
 * so far, which `readGallery` never stamps as the file's all.
 */
export async function galleryOf(
  pdf: Uint8Array,
  skip: readonly bigint[],
  yieldTo?: () => boolean,
  opts: { budgetMs?: number } = {},
): Promise<{ photos: DerivedPhoto[]; cut: boolean } | null> {
  const stored = findOmImages(pdf);
  const out: DerivedPhoto[] = [];
  const read = await decodeOmPhotos(
    pdf,
    async (photo) => {
      const jpeg = await storedJpegOf(stored, photo);
      const input: PictureInput = jpeg
        ? Buffer.from(jpeg.bytes)
        : { width: photo.width, height: photo.height, channels: photo.channels, pixels: photo.pixels };
      out.push({ ...(await derivePicture(input)), page: photo.page });
    },
    { skip, yieldTo, budgetMs: opts.budgetMs },
  );
  return read.aborted ? null : { photos: out, cut: read.cut };
}

/**
 * Whether a gallery read should give way: a cover search is waiting for a
 * turn. A cover is what a card or a page is showing a placeholder for; a
 * gallery is read again on a later view.
 */
const coverWaiting = () => searches.queued > 0;

/** Reads behind an answer running, by deal — a gallery, or a cover made
 *  again (`refreshBehind`): one deal's is never run twice at once. */
const behindInFlight = new Set<string>();

/** Whether the deal's gallery was read under today's rules. */
export function galleryCurrent(cache: DealVisualCache | null | undefined): boolean {
  return cache?.galleryV === GALLERY_VERSION;
}

/** Whether a gallery read the time cut short still holds the next back —
 *  the cover's rule (`retryWaiting`), counted apart. */
export function galleryRetryWaiting(cache: DealVisualCache | null | undefined, now = Date.now()): boolean {
  const r = cache?.galleryRetry;
  if (!r || r.v !== GALLERY_VERSION || !(r.n >= 1)) return false;
  const wait = RETRY_AFTER_MS[Math.min(r.n, RETRY_AFTER_MS.length) - 1];
  return now - Date.parse(r.at) < wait;
}

/** Whether the gallery should be read now: not read under today's rules,
 *  and no read the time cut short still waiting its turn. */
function galleryDue(cache: DealVisualCache | null | undefined): boolean {
  return !galleryCurrent(cache) && !galleryRetryWaiting(cache);
}

/**
 * Read the memorandum's gallery and store it, replacing the one before
 * (#448). Never throws: a failure writes nothing, so a later view reads it
 * again.
 */
async function readGallery(
  supabase: SupabaseClient,
  dealId: string,
  cache: DealVisualCache | null,
  pdf: Uint8Array,
  skip: readonly bigint[],
): Promise<void> {
  try {
    const read = await galleryOf(pdf, skip, coverWaiting);
    // Gave way to a cover: nothing is written, so a later view reads it.
    if (!read) return;
    const at = new Date().toISOString();
    // A read the time cut short found the photographs read so far, not the
    // file's (the pre-ship audit of 2026-09-30: it was stamped as the
    // gallery for good). Counted as the cover's are: stored without
    // `galleryV`, the next read waiting its turn, the third in a row taken
    // as the gallery — and never over a stored gallery it found fewer of.
    const prior = cache?.galleryRetry?.v === GALLERY_VERSION ? cache.galleryRetry.n : 0;
    const n = read.cut ? prior + 1 : 0;
    const final = !read.cut || n >= MAX_CUT_READS;
    const stamp: Partial<DealVisualCache> = final
      ? { galleryV: GALLERY_VERSION, galleryRetry: undefined }
      : { galleryV: undefined, galleryRetry: { n, at, v: GALLERY_VERSION } };
    const had = cache?.gallery ?? [];
    if (read.cut && read.photos.length <= had.length) {
      await writeCache(supabase, dealId, cache, stamp);
      return;
    }
    const base = Date.now().toString(36);
    const gallery: DealPicture[] = [];
    for (const [i, d] of read.photos.entries()) {
      gallery.push({ ...(await putDerived(dealId, d, `${base}g${i + 1}`, "om", at)), page: d.page });
    }
    await writeCache(supabase, dealId, cache, {
      gallery: gallery.length > 0 ? gallery : undefined,
      ...stamp,
    });
    // The gallery before is orphaned now — best effort, never fatal.
    const old = galleryPaths(cache);
    if (old.length > 0) await removeStorageFiles(old, photoScope(dealId)).catch(() => {});
  } catch (err) {
    console.warn(`deal gallery: ${dealId}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Whether a stored photograph was derived under older rules than today's
 * (`DERIVED_VERSION`) and can be made again: a memorandum's, whose source is
 * the memorandum. The reader's own upload is kept only as its derivatives.
 */
export function derivedOutdated(picture: DealPicture | null | undefined): boolean {
  return !!picture && picture.source === "om" && (picture.derivedV ?? 0) < DERIVED_VERSION;
}

/**
 * Put `next` in the place of the stored picture `was`, read again just
 * before the write: only while `was` is still the one stored, so a picture
 * the reader put there meanwhile, or a new memorandum's, is never replaced.
 */
async function replaceStoredPicture(
  supabase: SupabaseClient,
  dealId: string,
  was: DealPicture,
  next: DealPicture,
): Promise<boolean> {
  try {
    const { data } = await supabase.from("deals").select("photo").eq("id", dealId).maybeSingle();
    const current = (data as { photo?: DealVisualCache | null } | null)?.photo ?? null;
    if (!current?.picture || current.picture.hero !== was.hero) return false;
    const { error } = await supabase
      .from("deals")
      .update({ photo: { ...current, picture: next } })
      .eq("id", dealId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * A memorandum's cover derived under older rules, made again from the
 * memorandum (`DERIVED_VERSION`): only where the cover the pages give now is
 * the same photograph as the one stored (its hash within `NEAR_BITS` of the
 * stored hero's — never a quiet swap for another picture), and only onto the
 * picture still stored then. Otherwise the stored picture is marked with
 * today's rules as it is, so each deal is tried once. Answers the cover's
 * hash, for the gallery to pass over; null where the stored hero could not
 * be read, and nothing is marked, so a later view tries again.
 */
async function deriveCoverAgain(
  supabase: SupabaseClient,
  dealId: string,
  was: DealPicture,
  pdf: Uint8Array,
): Promise<bigint | null> {
  const storedHero = await readPictureBytes(dealId, was, "hero").catch(() => null);
  const storedHash = storedHero ? await hashOf(storedHero) : null;
  if (storedHash === null) return null;
  const { cover } = await readCover(pdf);
  const hash = cover ? await hashOf(cover) : null;
  const same = !!cover && hash !== null && hashDistance(hash, storedHash) <= NEAR_BITS;
  const next = same
    ? await putDerived(dealId, await derivePicture(cover), Date.now().toString(36), "om", new Date().toISOString())
    : null;
  const wrote = await replaceStoredPicture(supabase, dealId, was, next ?? { ...was, derivedV: DERIVED_VERSION });
  // Whichever files lost — the old ones replaced, or new ones never put in
  // place — go; best effort, never fatal.
  if (next) await removeStorageFiles(pathsOf(wrote ? was : next), photoScope(dealId)).catch(() => {});
  return same ? hash : storedHash;
}

/**
 * What a deal whose cover needs no search still needs from its memorandum,
 * read behind whatever asked in a turn of its own only if one is free now:
 * a memorandum's cover derived under older rules, made again
 * (`deriveCoverAgain`), and a gallery read under older rules, or never
 * (#448: the reader's own picture, a cover lifted under today's rules, or a
 * memorandum whose first pages hold none), the cover's hash passed over.
 */
function refreshBehind(
  supabase: SupabaseClient,
  dealId: string,
  opts: { omPath: string | null; isSample: boolean; cache: DealVisualCache | null },
): void {
  const { cache, omPath } = opts;
  const cover = currentPicture(cache);
  const redoCover = derivedOutdated(cover);
  const redoGallery = galleryDue(cache);
  if (opts.isSample || !omPath || (!redoCover && !redoGallery)) return;
  if (behindInFlight.has(dealId) || inFlight.has(dealId) || coverWaiting()) return;
  behindInFlight.add(dealId);
  void (async () => {
    const release = await searches.acquireWithin(0);
    if (!release) return;
    try {
      const pdf = await downloadOmPdf(omPath, { kind: "deal", dealId, only: ["om"] });
      let hash: bigint | null = null;
      if (cover && redoCover) {
        hash = await deriveCoverAgain(supabase, dealId, cover, pdf);
      } else if (cover) {
        const bytes = await readPictureBytes(dealId, cover, "hero").catch(() => null);
        hash = bytes ? await hashOf(bytes) : null;
      }
      if (redoGallery) await readGallery(supabase, dealId, cache, pdf, hash === null ? [] : [hash]);
    } catch (err) {
      console.warn(`deal picture behind: ${dealId}:`, err instanceof Error ? err.message : err);
    } finally {
      release();
    }
  })().finally(() => behindInFlight.delete(dealId));
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
 *
 * A memorandum photograph lifted under older rules (#444) is judged again:
 * a route waits for the verdict; a page render gets the old photograph at
 * once and the search runs behind it. Where the search cannot run (no turn,
 * no memorandum, a storage failure, a read the time cut short), the old
 * photograph stands.
 *
 * A read the time budget cut short says nothing (`readCover`'s
 * `complete`): no verdict is written, and the next ask reads again once its
 * wait is over (`retryWaiting`), the third such read in a row standing as
 * the verdict (`MAX_CUT_READS`).
 *
 * A caller that already holds the memorandum's bytes — the screen, which
 * lifts the cover right after its extraction so a new deal's first view
 * finds its photograph stored — hands them over as `pdf`, and the search
 * reads those rather than downloading the file a second time.
 */
export async function ensureDealPicture(
  supabase: SupabaseClient,
  dealId: string,
  opts: {
    omPath: string | null;
    isSample: boolean;
    cache: DealVisualCache | null;
    waitMs?: number;
    /** false for the cover alone (#464, the worker before a screen's
     *  email): the gallery is left to the deal's first view, so a worker
     *  about to run the next screen never decodes sixteen pages beside it */
    gallery?: boolean;
    /** the memorandum at `omPath`, where the caller already holds it: read
     *  in place of a download. pdfjs is handed a copy, so the caller's
     *  buffer is never detached or changed */
    pdf?: Uint8Array;
  },
): Promise<DealPicture | null> {
  const { cache } = opts;
  const waitMs = opts.waitMs ?? 0;
  const gallery = opts.gallery !== false;
  const current = currentPicture(cache);
  if (current) {
    // Shown as it is; derived again, or its gallery read, behind the answer.
    if (gallery) refreshBehind(supabase, dealId, opts);
    return current;
  }
  const stale = cache?.picture ?? null;
  if (opts.isSample || !opts.omPath) return stale;
  // A read the time cut short waits its turn to be made again.
  if (retryWaiting(cache)) return stale;
  if (!stale && searchedRecently(cache)) {
    // No cover on the first pages, but photographs may sit further in.
    if (gallery) refreshBehind(supabase, dealId, opts);
    return null;
  }
  const running = inFlight.get(dealId);
  if (running) return waitMs > 0 ? running : stale;
  const search = searchMemorandum(supabase, dealId, opts.omPath, cache, waitMs, gallery, opts.pdf)
    .then((outcome) => (outcome.settled ? outcome.picture : stale))
    .finally(() => inFlight.delete(dealId));
  inFlight.set(dealId, search);
  if (stale && waitMs === 0) {
    // Judged behind the render: the old photograph shows this once.
    search.catch(() => {});
    return stale;
  }
  return search;
}

/** A search's answer: `settled` when the memorandum was read and the cache
 *  written, and not when no turn was free or the read failed. */
interface SearchOutcome {
  picture: DealPicture | null;
  settled: boolean;
}

async function searchMemorandum(
  supabase: SupabaseClient,
  dealId: string,
  omPath: string,
  cache: DealVisualCache | null,
  waitMs: number,
  withGallery = true,
  given?: Uint8Array,
): Promise<SearchOutcome> {
  const release = await searches.acquireWithin(waitMs);
  if (!release) return { picture: null, settled: false };
  // Held until the gallery behind the cover is read, when there is one.
  let held = true;
  try {
    const pdf = given ?? (await downloadOmPdf(omPath, { kind: "deal", dealId, only: ["om"] }));
    const { cover, complete } = await readCover(pdf);
    let outcome: SearchOutcome;
    // The memorandum picture already stored, lifted under older rules (#444).
    const older = cache?.picture?.source === "om" ? cache.picture : null;
    if (!cover && !complete) {
      // The time budget cut the read short: it never looked, so it says
      // nothing — no verdict, and an older photograph is neither dropped nor
      // replaced. The read is counted, and the next waits its turn; the
      // third in a row stands as the verdict, so a file the reader can never
      // finish is not decoded on every view for ever.
      const prior = cache?.pictureRetry?.v === PICTURE_SEARCH_VERSION ? cache.pictureRetry.n : 0;
      const n = prior + 1;
      const at = new Date().toISOString();
      if (n < MAX_CUT_READS) {
        await writeCache(supabase, dealId, cache, { pictureRetry: { n, at, v: PICTURE_SEARCH_VERSION } });
        outcome = { picture: null, settled: false };
      } else {
        // The third in a row is the verdict for the month. An older
        // photograph was lifted under rules that could take a map for the
        // building (#444), and no read has judged it: it goes, rather than
        // stand as the building's under today's stamp for good (the pre-ship
        // audit of 2026-09-30) — and only if it is still the one stored.
        const verdict = { pictureCheckedAt: at, pictureSearchV: PICTURE_SEARCH_VERSION, pictureRetry: undefined };
        if (older) {
          const swap = await swapPicture(supabase, dealId, cache, { picture: undefined, ...verdict }, older.hero);
          if (swap.stored) {
            await removeStorageFiles(pathsOf(older), photoScope(dealId)).catch(() => {});
            outcome = { picture: null, settled: true };
          } else {
            outcome = { picture: swap.current, settled: true };
          }
        } else {
          await writeCache(supabase, dealId, cache, verdict);
          outcome = { picture: null, settled: true };
        }
      }
    } else if (!cover) {
      // Read to its end, and none on the cover pages. A photograph lifted
      // under older rules that today's search does not find there was not
      // the cover (#444): it goes.
      const verdict = {
        pictureCheckedAt: new Date().toISOString(),
        pictureSearchV: PICTURE_SEARCH_VERSION,
        pictureRetry: undefined,
      };
      if (older) {
        // Only if it is still the one stored: an upload meanwhile stands.
        const swap = await swapPicture(supabase, dealId, cache, { picture: undefined, ...verdict }, older.hero);
        if (swap.stored) {
          // Every size, the full copy included.
          await removeStorageFiles(pathsOf(older), photoScope(dealId)).catch(() => {});
          outcome = { picture: null, settled: true };
        } else {
          outcome = { picture: swap.current, settled: true };
        }
      } else {
        await writeCache(supabase, dealId, cache, verdict);
        outcome = { picture: null, settled: true };
      }
    } else {
      // The reader's own picture is theirs and is never replaced here: only
      // a memorandum picture, or none, reaches this search.
      outcome = { picture: await storePicture(supabase, dealId, cache, cover, "om"), settled: true };
    }
    // The rest of the memorandum's photographs (#448), behind the answer and
    // in the same turn: the cover shows while they are read. Not behind a
    // read the time cut short: a file that slow would only run out of time
    // again on sixteen pages.
    if (
      withGallery &&
      (cover || complete) &&
      galleryDue(cache) &&
      !behindInFlight.has(dealId) &&
      !coverWaiting()
    ) {
      const hash = cover ? await hashOf(cover) : null;
      held = false;
      behindInFlight.add(dealId);
      void readGallery(supabase, dealId, cache, pdf, hash === null ? [] : [hash]).finally(() => {
        behindInFlight.delete(dealId);
        release();
      });
    }
    return outcome;
  } catch (err) {
    // A storage or decode failure is this request's problem, not the deal's:
    // nothing is written, so the next ask tries again.
    console.warn(`deal picture: ${dealId}:`, err instanceof Error ? err.message : err);
    return { picture: null, settled: false };
  } finally {
    if (held) release();
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

/** A stored size of a picture: the hero, the square thumbnail, the
 *  full-size copy, or the card copy (research pass 29). */
export type PictureSize = "hero" | "thumb" | "full" | "card";

/** The stored file a size is served from: the full-size copy is the hero
 *  where the source was no larger than the hero, or the picture predates it,
 *  and so is the card copy where none is stored — the picture route makes
 *  one stored before from the hero (`cardCopyDue`). */
export function picturePathFor(picture: DealPicture, size: PictureSize): string {
  if (size === "thumb") return picture.thumb;
  if (size === "full") return picture.full ?? picture.hero;
  if (size === "card") return picture.card ?? picture.hero;
  return picture.hero;
}

/** The stored derivative's bytes, for the routes. */
export async function readPictureBytes(dealId: string, picture: DealPicture, size: PictureSize): Promise<Buffer> {
  return downloadDealFile(picturePathFor(picture, size), photoScope(dealId));
}
