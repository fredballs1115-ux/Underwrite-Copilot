import "server-only";
import { inflateSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import { IMAGE_CREDIT, fetchOneImage, type BestImage } from "@/lib/imagery";
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
      credit: IMAGE_CREDIT[best.source],
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
