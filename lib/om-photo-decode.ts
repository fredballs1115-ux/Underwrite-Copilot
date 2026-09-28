/**
 * The memorandum's cover photograph, where the byte scan (`lib/om-photo`)
 * finds none (#440).
 *
 * The scan lifts a JPEG out of the file as the bytes it is stored as, and
 * two common kinds of memorandum give it nothing to lift:
 *
 * - A LOCKED file. A broker's memorandum is often "secured": anyone can
 *   open it, with printing or copying restricted. Those permissions are an
 *   owner password set over an EMPTY user password, and every stream in
 *   the file, the photographs included, is encrypted under the key that
 *   empty password yields. No JPEG starts where the scan looks, so the deal
 *   showed a map. Every PDF reader opens such a file without asking, and
 *   pdfjs does too. A file that asks for a password to OPEN is not read.
 * - A photograph stored as PIXELS (`/FlateDecode`, usually with PNG
 *   predictors): a PNG, or an image a layout tool flattened or edited,
 *   rather than the camera's JPEG.
 *
 * pdfjs decodes both, the way a viewer draws the page. It reads the images
 * each of the first pages paints, since the cover sits there. It takes the
 * largest one of a photograph's size and shape, by `lib/om-photo`'s own
 * rules, with page one preferred as the scan prefers the start of the file.
 * It never throws: a file it cannot read, or one that runs past its time,
 * reads as no photograph. It runs only after the scan comes back empty,
 * because it decodes pixels where the scan copies bytes.
 */

import { COVER_ASPECT, COVER_MIN } from "@/lib/om-photo";

/** How many pages are searched: the cover, and a page or three after it. */
export const COVER_PAGES = 4;
/** Images larger than this many pixels are skipped rather than decoded. */
export const MAX_DECODE_PIXELS = 40_000_000;
/** The most the search may take before it settles for what it has. */
export const DECODE_BUDGET_MS = 8_000;
/** Page one's weight against a larger picture further in. */
const PAGE_ONE_BONUS = 1.5;

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
}

/** The cover the search settled on, as pixels sharp can take raw. */
export interface DecodedCover {
  width: number;
  height: number;
  channels: 3 | 4;
  pixels: Uint8Array;
  page: number;
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

/** Whether an image could be the cover, by the scan's own size and shape rules. */
export function coverShaped(im: ImageCandidate): boolean {
  if (im.kind !== IMAGE_KIND.rgb && im.kind !== IMAGE_KIND.rgba) return false;
  if (im.grey) return false;
  if (im.width < COVER_MIN.width || im.height < COVER_MIN.height) return false;
  const aspect = im.width / im.height;
  return aspect >= COVER_ASPECT.min && aspect <= COVER_ASPECT.max;
}

/** An image's claim to be the cover: its area, weighted up on page one. */
export function coverScore(im: ImageCandidate): number {
  return coverShaped(im) ? im.width * im.height * (im.page === 1 ? PAGE_ONE_BONUS : 1) : 0;
}

/** The likeliest cover among the painted images, or null when none is a photograph. */
export function pickDecodedCover<T extends ImageCandidate>(images: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const im of images) {
    const score = coverScore(im);
    if (score > bestScore) {
      best = im;
      bestScore = score;
    }
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
 * The cover photograph of a memorandum the byte scan could not read, as raw
 * pixels, or null: no photograph on the first pages, a file that needs a
 * password to open, a file pdfjs cannot parse, or a search out of time.
 */
export async function decodeOmCover(pdf: Uint8Array): Promise<DecodedCover | null> {
  let pdfjs: Pdfjs;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    return null;
  }
  const deadline = Date.now() + DECODE_BUDGET_MS;
  let task: ReturnType<Pdfjs["getDocument"]> | null = null;
  let best: DecodedCover | null = null;
  let bestScore = 0;
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
          const candidate: ImageCandidate = {
            width: img.width,
            height: img.height,
            kind: img.kind,
            page: p,
            grey: img.kind === IMAGE_KIND.mask ? true : isGrey(img.data, channels),
          };
          const score = coverScore(candidate);
          if (score > bestScore && img.data.length >= img.width * img.height * channels) {
            best = {
              width: img.width,
              height: img.height,
              channels,
              // A view, not a copy: the page's own store is emptied below,
              // and this reference is the one that keeps the pixels.
              pixels: new Uint8Array(img.data.buffer, img.data.byteOffset, img.width * img.height * channels),
              page: p,
            };
            bestScore = score;
          }
        }
      } catch {
        // A page that fails or runs out of time: keep what earlier pages gave.
        if (Date.now() >= deadline) break;
      } finally {
        page?.cleanup();
      }
    }
    return best;
  } catch {
    // A password to open, a file pdfjs cannot parse, or no time left to open it.
    return best;
  } finally {
    try {
      await task?.destroy();
    } catch {
      // nothing to release
    }
  }
}
