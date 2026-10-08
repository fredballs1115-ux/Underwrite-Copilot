import "server-only";
import { inflateSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import { IMAGE_CREDIT, fetchOneImage, type BestImage } from "@/lib/imagery";
import { withOsmLocation } from "@/lib/basemaps";
import type { MemoCover } from "./memo-document";

/** The cover frame's pixels: twice the 104 × 58 pt box it prints in, so the
 *  frame stays sharp on paper without weighing the PDF down. */
export const COVER_SIZE = { width: 416, height: 234 };

/** react-pdf embeds JPEG and PNG; anything else would throw mid-render. */
const EMBEDDABLE = /^image\/(jpeg|jpg|png)\b/i;

/**
 * Whether the bytes are a picture react-pdf can decode. It decodes during
 * the render, and a PNG whose zlib stream fails its data check does not
 * throw there — it hangs the render, and the memo download with it. So a
 * PNG must carry its signature, inflate cleanly and end in IEND; a JPEG must
 * open with its start marker and close with its end marker.
 */
export function intactImage(bytes: Buffer, type: string): boolean {
  if (/png$/i.test(type)) {
    if (bytes.length < 8 + 12 + 12) return false;
    if (bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) return false;
    const idat: Buffer[] = [];
    let offset = 8;
    let ended = false;
    while (offset + 8 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const kind = bytes.toString("ascii", offset + 4, offset + 8);
      const start = offset + 8;
      if (start + length + 4 > bytes.length) return false;
      if (kind === "IDAT") idat.push(bytes.subarray(start, start + length));
      if (kind === "IEND") {
        ended = true;
        break;
      }
      offset = start + length + 4;
    }
    if (!ended || idat.length === 0) return false;
    try {
      inflateSync(Buffer.concat(idat));
      return true;
    } catch {
      return false;
    }
  }
  if (/jpe?g$/i.test(type)) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false;
    // The end marker, allowing a little trailing padding after it.
    const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
    return eoi >= 0 && eoi >= bytes.length - 64;
  }
  return false;
}

/**
 * A picture for the memo's cover from any way of getting one, bounded: the
 * memo is a download a person is waiting on, so imagery gets a few seconds
 * and then the memo prints without it. Nothing here throws — a failed or
 * slow source is the same as no source.
 */
export async function coverFrom(
  get: () => Promise<BestImage | null>,
  timeoutMs = 4_000,
  /** the credit to print where the source's own line is not the whole
   *  story — a deal's photograph is the memorandum's or the reader's */
  credit?: string,
): Promise<MemoCover | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const best = await Promise.race([
      get(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (!best) return null;
    const type = (best.response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!EMBEDDABLE.test(type)) return null;
    const bytes = Buffer.from(await best.response.arrayBuffer());
    if (bytes.length === 0 || !intactImage(bytes, type)) return null;
    return {
      dataUri: `data:${type.toLowerCase()};base64,${bytes.toString("base64")}`,
      // An overhead framed on a point Photon placed names OpenStreetMap too
      // (the batch-2 audit, LOW-8).
      credit: credit ?? withOsmLocation(IMAGE_CREDIT[best.source], best.placedBy === "photon"),
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The deal's USGS aerial for the memo's cover — the same frame the deal
 * page's Aerial tab shows, through the same resolver (so the cover, the map
 * pin and the page agree). Null when the deal has no address, nothing
 * frames, or the source is slow.
 */
export function coverAerialFor(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
): Promise<MemoCover | null> {
  if (!address?.label?.trim()) return Promise.resolve(null);
  return coverFrom(() => fetchOneImage("aerial", supabase, dealId, address, cache, COVER_SIZE));
}

/** A stored photograph cut to the cover's frame (#434): the hero derivative
 *  runs to 1600px, and a PDF needs only the frame's own pixels — twice the
 *  printed box, as the aerial is asked for — so the memo does not carry a
 *  megabyte for a picture an inch and a half wide. Cropped by attention, the
 *  way the pipeline's thumbnail is, so the building stays in the frame. */
export async function fitCover(bytes: Buffer, size: { width: number; height: number } = COVER_SIZE): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(bytes)
    .rotate()
    .resize(size.width, size.height, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}

/** A photograph's pixels on the report's photographs page (#459): twice
 *  the 256 × 170 pt frame it prints in, two to a row across the page. */
export const PHOTO_PAGE_SIZE = { width: 512, height: 340 };

/** The most photographs the page prints: two rows of two. */
export const PHOTO_PAGE_MAX = 4;

/**
 * The memorandum's other photographs for the full report's photographs page
 * (#459) — the ones the deal page's mosaic and filmstrip show, each cut to
 * the page's frame and credited with its page, in the memorandum's order.
 * Only the stored pictures: the report never reads the memorandum. Each is
 * bounded as the cover is, and one that fails is left out; fewer than two
 * is no page, since one photograph is what the memo's cover already prints.
 */
export async function galleryPhotosFor(dealId: string, cache: DealVisualCache | null): Promise<MemoCover[]> {
  const gallery = (cache?.gallery ?? []).slice(0, PHOTO_PAGE_MAX);
  if (gallery.length < 2) return [];
  const { memorandumPhotoCredit, readPictureBytes } = await import("@/lib/deal-picture");
  const photos = await Promise.all(
    gallery.map((g) =>
      coverFrom(
        async () => {
          const framed = await fitCover(await readPictureBytes(dealId, g, "hero"), PHOTO_PAGE_SIZE);
          return {
            source: "photo",
            response: new Response(new Uint8Array(framed), { headers: { "content-type": "image/jpeg" } }),
          };
        },
        4_000,
        memorandumPhotoCredit(g.page),
      ),
    ),
  );
  const kept = photos.filter((p): p is MemoCover => p != null);
  return kept.length >= 2 ? kept : [];
}

/**
 * The picture on the memo's cover — and so on the full report's first page
 * (#434): the building's OWN photograph where the deal has one stored (the
 * cover of its memorandum, or the one the reader put on the deal — the
 * picture its deal page leads with), cut to the cover's frame and credited
 * as the memorandum's or the reader's; the USGS aerial otherwise. The cover
 * had printed the aerial alone, so a memo for a building the reader was
 * looking at printed its roof. Google's frames stay off paper, as they
 * always have. Bounded and never throwing, as every cover is.
 */
export async function coverPictureFor(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
): Promise<MemoCover | null> {
  const picture = cache?.picture ?? null;
  if (picture) {
    // Loaded here, not at the top: the storage reader and sharp are for the
    // routes, never for the pure helpers' tests.
    const { PICTURE_CREDIT, readPictureBytes } = await import("@/lib/deal-picture");
    const own = await coverFrom(
      async () => {
        const framed = await fitCover(await readPictureBytes(dealId, picture, "hero"));
        return {
          source: "photo",
          response: new Response(new Uint8Array(framed), { headers: { "content-type": "image/jpeg" } }),
        };
      },
      4_000,
      PICTURE_CREDIT[picture.source],
    );
    if (own) return own;
  }
  return coverAerialFor(supabase, dealId, address, cache);
}
