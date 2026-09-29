/**
 * The memorandum's cover photograph, read the way a viewer draws the pages
 * (#440, #444).
 *
 * Every memorandum is read this way now (#444). The byte scan
 * (`lib/om-photo`) alone weighed every JPEG in the whole file by its area,
 * with a bonus for the first 30% of the bytes, and knew nothing of pages: a
 * memorandum's "property aerial" and its location maps are the largest
 * pictures it carries (a 4800 × 3600 export beside a 1600 × 1200 cover), so
 * a card could show a map, credited as the building's own photograph. Here
 * the pages decide:
 *
 * - THE COVER PAGE FIRST. Page one's photograph wins outright, whatever is
 *   larger further in; only a memorandum whose first page holds none is
 *   searched on the next three, and the largest photograph there is taken.
 *   Nothing past page four is ever a candidate.
 * - A PHOTOGRAPH, NOT A MAP. A location map, a site plan, a chart or a page
 *   of text is a handful of flat colours, and a photograph is not
 *   (`flatShare`, `FLAT_SHARE`): an image whose eight commonest colours
 *   cover most of it is never the cover.
 *
 * Two kinds of memorandum gave the scan nothing to lift at all, and are why
 * this reader exists (#440):
 *
 * - A LOCKED file. A broker's memorandum is often "secured": anyone can
 *   open it, with printing or copying restricted. Those permissions are an
 *   owner password set over an EMPTY user password, and every stream in
 *   the file, the photographs included, is encrypted under the key that
 *   empty password yields. Every PDF reader opens such a file without
 *   asking, and pdfjs does too. A file that asks for a password to OPEN is
 *   not read.
 * - A photograph stored as PIXELS (`/FlateDecode`, usually with PNG
 *   predictors): a PNG, or an image a layout tool flattened or edited,
 *   rather than the camera's JPEG.
 *
 * It never throws: a file it cannot read, or one that runs past its time,
 * reads as no photograph, and says whether the file was read at all
 * (`opened`) and whether the cover page was (`pageOneRead`) so the caller
 * knows when the byte scan's guess is all there is.
 */

import { COVER_ASPECT, COVER_MIN } from "@/lib/om-photo";

/** How many pages are searched: the cover, and a page or three after it. */
export const COVER_PAGES = 4;
/** Images larger than this many pixels are skipped rather than decoded. */
export const MAX_DECODE_PIXELS = 40_000_000;
/** The most the search may take before it settles for what it has. */
export const DECODE_BUDGET_MS = 8_000;
/**
 * The share of a picture its eight commonest colours may cover and still be
 * a photograph (`flatShare`). Measured on real pictures: 23 photographs of
 * cities reached 0.39 and 18 USGS aerials and 12 flood-map composites 0.46,
 * where a road map read 0.87 as a JPEG and 0.98 as a PNG, a site plan 1.00
 * and a page of text 0.96.
 */
export const FLAT_SHARE = 0.6;
/** The side of the even sample `flatShare` reads. */
const FLAT_SAMPLE = 64;

/** pdfjs's pixel layouts: 1 is a bilevel mask, 2 is RGB, 3 is RGBA. */
export const IMAGE_KIND = { mask: 1, rgb: 2, rgba: 3 } as const;

/** One painted image, as the pick weighs it. */
export interface ImageCandidate {
  width: number;
  height: number;
  /** pdfjs's `ImageKind` */
  kind: number;
  /** 1-based */
  page: number;
  /** every sampled pixel has equal channels: a greyscale picture */
  grey: boolean;
  /** `flatShare` of its pixels: near 1 for a map, a plan or a page of
   *  text. Absent reads as a photograph's. */
  flat?: number;
}

/** The cover the search settled on, as pixels sharp can take raw. */
export interface DecodedCover {
  width: number;
  height: number;
  channels: 3 | 4;
  pixels: Uint8Array;
  page: number;
}

/** What reading a memorandum's first pages found. */
export interface OmCoverRead {
  cover: DecodedCover | null;
  /** pdfjs opened the file */
  opened: boolean;
  /** every image the cover page paints was weighed, inside the time */
  pageOneRead: boolean;
}

/**
 * Whether a picture is greyscale, from an even sample of its pixels. A
 * one-channel JPEG is skipped by the scan as a mask; pdfjs hands a grey
 * image over as RGB, so the same rule reads its pixels instead.
 */
export function isGrey(pixels: ArrayLike<number>, channels: 3 | 4, samples = 2048): boolean {
  const count = Math.floor(pixels.length / channels);
  if (count === 0) return true;
  const step = Math.max(1, Math.floor(count / samples));
  for (let i = 0; i < count; i += step) {
    const o = i * channels;
    if (pixels[o] !== pixels[o + 1] || pixels[o + 1] !== pixels[o + 2]) return false;
  }
  return true;
}

/**
 * How flat a picture is: the share of an even 64 × 64 sample of its pixels,
 * each colour cut to five bits a channel, that its eight commonest colours
 * take. A photograph's light and texture spread it over hundreds of colours;
 * a map, a plan, a chart or a page of text is a few flat fills.
 */
export function flatShare(pixels: ArrayLike<number>, width: number, height: number, channels: number): number {
  if (width <= 0 || height <= 0) return 1;
  const counts = new Map<number, number>();
  for (let sy = 0; sy < FLAT_SAMPLE; sy++) {
    const y = Math.min(height - 1, Math.floor(((sy + 0.5) * height) / FLAT_SAMPLE));
    for (let sx = 0; sx < FLAT_SAMPLE; sx++) {
      const x = Math.min(width - 1, Math.floor(((sx + 0.5) * width) / FLAT_SAMPLE));
      const o = (y * width + x) * channels;
      const key = ((pixels[o] >> 3) << 10) | ((pixels[o + 1] >> 3) << 5) | (pixels[o + 2] >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const top = [...counts.values()].sort((a, b) => b - a).slice(0, 8);
  return top.reduce((a, b) => a + b, 0) / (FLAT_SAMPLE * FLAT_SAMPLE);
}

/**
 * Whether an image could be the cover: a colour picture of a photograph's
 * size and shape, by the scan's own rules, that is not a handful of flat
 * colours.
 */
export function coverShaped(im: ImageCandidate): boolean {
  if (im.kind !== IMAGE_KIND.rgb && im.kind !== IMAGE_KIND.rgba) return false;
  if (im.grey) return false;
  if ((im.flat ?? 0) >= FLAT_SHARE) return false;
  if (im.width < COVER_MIN.width || im.height < COVER_MIN.height) return false;
  const aspect = im.width / im.height;
  return aspect >= COVER_ASPECT.min && aspect <= COVER_ASPECT.max;
}

/**
 * The likeliest cover among the painted images, or null when none is a
 * photograph: the largest on the cover page wherever it holds one, else the
 * largest on the pages after it.
 */
export function pickDecodedCover<T extends ImageCandidate>(images: readonly T[]): T | null {
  const shaped = images.filter(coverShaped);
  const onCover = shaped.filter((im) => im.page === 1);
  let best: T | null = null;
  for (const im of onCover.length > 0 ? onCover : shaped) {
    if (!best || im.width * im.height > best.width * best.height) best = im;
  }
  return best;
}

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfPage = Awaited<ReturnType<Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>["getPage"]>>;

/** A decoded image object as pdfjs hands it over without a canvas. */
interface PaintedImage {
  width: number;
  height: number;
  kind: number;
  data?: Uint8Array | Uint8ClampedArray;
}

/** Settle a promise, or give up at the deadline. */
function before<T>(work: Promise<T>, deadline: number): Promise<T> {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.reject(new Error("out of time"));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("out of time")), left);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** An image the page painted, out of whichever store pdfjs filed it in. */
function paintedImage(page: PdfPage, id: string): Promise<PaintedImage | null> {
  // An image drawn on several pages is filed once for the document ("g_…").
  const store = id.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    try {
      store.get(id, (obj: unknown) => resolve((obj as PaintedImage | null) ?? null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * The cover photograph of a memorandum as raw pixels (`pickDecodedCover`'s
 * rule), with what the read managed: a file that needs a password to open,
 * one pdfjs cannot parse, or a search out of time finds no cover and says
 * so. Page one is read first, and when it holds a photograph the pages
 * after it are never decoded.
 */
export async function decodeOmCover(pdf: Uint8Array): Promise<OmCoverRead> {
  const read: OmCoverRead = { cover: null, opened: false, pageOneRead: false };
  let pdfjs: Pdfjs;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    return read;
  }
  const deadline = Date.now() + DECODE_BUDGET_MS;
  let task: ReturnType<Pdfjs["getDocument"]> | null = null;
  let best: ImageCandidate | null = null;
  try {
    task = pdfjs.getDocument({
      // A copy: pdfjs may take ownership of the buffer it is handed.
      data: new Uint8Array(pdf),
      verbosity: 0,
      useSystemFonts: false,
      // No canvas and no browser decoder in Node: pdfjs decodes the pixels itself.
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      maxImageSize: MAX_DECODE_PIXELS,
    });
    const doc = await before(task.promise, deadline);
    read.opened = true;
    const last = Math.min(doc.numPages, COVER_PAGES);
    for (let p = 1; p <= last; p++) {
      if (Date.now() >= deadline) break;
      let page: PdfPage | null = null;
      try {
        page = await before(doc.getPage(p), deadline);
        const ops = await before(page.getOperatorList(), deadline);
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
          const id = ops.argsArray[i]?.[0];
          if (typeof id !== "string") continue;
          const img = await before(paintedImage(page, id), deadline);
          if (!img?.data) continue;
          const channels = img.kind === IMAGE_KIND.rgba ? 4 : 3;
          if (img.data.length < img.width * img.height * channels) continue;
          const photo = img.kind === IMAGE_KIND.rgb || img.kind === IMAGE_KIND.rgba;
          const candidate: ImageCandidate = {
            width: img.width,
            height: img.height,
            kind: img.kind,
            page: p,
            grey: photo ? isGrey(img.data, channels) : true,
            flat: photo ? flatShare(img.data, img.width, img.height, channels) : 1,
          };
          if (pickDecodedCover(best ? [best, candidate] : [candidate]) === candidate && candidate !== best) {
            best = candidate;
            read.cover = {
              width: img.width,
              height: img.height,
              channels,
              // A view, not a copy: the page's own store is emptied below,
              // and this reference is the one that keeps the pixels.
              pixels: new Uint8Array(img.data.buffer, img.data.byteOffset, img.width * img.height * channels),
              page: p,
            };
          }
        }
        if (p === 1) read.pageOneRead = true;
      } catch {
        // A page that fails or runs out of time: keep what earlier pages gave.
        if (Date.now() >= deadline) break;
      } finally {
        page?.cleanup();
      }
      // The cover page's photograph is the cover: the rest is never decoded.
      if (p === 1 && read.cover) break;
    }
    return read;
  } catch {
    // A password to open, a file pdfjs cannot parse, or no time left to open it.
    return read;
  } finally {
    try {
      await task?.destroy();
    } catch {
      // nothing to release
    }
  }
}
