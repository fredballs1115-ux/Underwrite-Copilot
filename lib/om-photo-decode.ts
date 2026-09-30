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
 * - A photograph stored as JPEG 2000 (`/JPXDecode`), which Acrobat's
 *   optimiser writes. pdfjs decodes it with its WebAssembly decoder, and
 *   only once it is told where that lives (`lib/pdfjs-wasm`): before, every
 *   such picture failed to decode and was passed over.
 *
 * It never throws: a file it cannot read, or one that runs past its time,
 * reads as no photograph, and says whether the file was read at all
 * (`opened`) and whether the cover page was (`pageOneRead`) so the caller
 * knows when the byte scan's guess is all there is — and whether the read
 * reached its answer (`complete`): a read the time budget cut short found
 * nothing because it never looked, which is no reason to say the
 * memorandum has no photograph.
 */

import { COVER_ASPECT, COVER_MIN } from "@/lib/om-photo";
import { pdfjsWasmUrl } from "@/lib/pdfjs-wasm";

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
  /** the read reached its answer, one another read would give again: every
   *  page it covers was read to its end (or the cover page's photograph
   *  ended it), or the file cannot be opened at all — a password to open, a
   *  file pdfjs cannot parse. Never a read the time budget cut short, nor
   *  one made without pdfjs to make it. */
  complete: boolean;
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
 * A picture's difference hash (#448): 64 bits, one a comparison of two
 * neighbouring cells' brightness on a 9 × 8 grid, each cell the mean of a
 * 4 × 4 sample. The same photograph placed twice in a memorandum, at two
 * sizes or two qualities, hashes within a few bits of itself; two different
 * photographs lie twenty or more apart (`NEAR_BITS`).
 */
export function differenceHash(pixels: ArrayLike<number>, width: number, height: number, channels: number): bigint {
  const cols = 9;
  const rows = 8;
  const sub = 4;
  const cells: number[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      for (let sy = 0; sy < sub; sy++) {
        const y = Math.min(height - 1, Math.floor(((cy * sub + sy + 0.5) * height) / (rows * sub)));
        for (let sx = 0; sx < sub; sx++) {
          const x = Math.min(width - 1, Math.floor(((cx * sub + sx + 0.5) * width) / (cols * sub)));
          const o = (y * width + x) * channels;
          sum += 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2];
        }
      }
      cells.push(sum / (sub * sub));
    }
  }
  let hash = BigInt(0);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols - 1; cx++) {
      hash = (hash << BigInt(1)) | (cells[cy * cols + cx] > cells[cy * cols + cx + 1] ? BigInt(1) : BigInt(0));
    }
  }
  return hash;
}

/** How many of two hashes' 64 bits differ. */
export function hashDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x > BigInt(0)) {
    n += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return n;
}

/** Two pictures whose hashes differ in no more bits than this are one. */
export const NEAR_BITS = 10;

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

/** One image a page paints, decoded: its pixels and where it was found. */
interface PaintedPixels {
  width: number;
  height: number;
  kind: number;
  channels: 3 | 4;
  /** a view of pdfjs's own buffer, alive while the visit runs */
  pixels: Uint8Array;
  /** 1-based */
  page: number;
}

/**
 * Open a memorandum as a viewer does and hand every image its first `pages`
 * pages paint to `visit`, decoded, in page order; an image painted on
 * several pages is visited once. `visit` answers false to end the walk, and
 * `pageDone` is asked after each page whether to go on. Never throws: says
 * whether the file opened, which pages were read to their end, inside the
 * time, and whether the walk was `cut` short before its end — by the time
 * budget, or for want of pdfjs to walk with — rather than ended by its own
 * choice or by a file that cannot be opened.
 */
async function walkPaintedImages(
  pdf: Uint8Array,
  opts: { pages: number; budgetMs: number },
  visit: (img: PaintedPixels) => boolean | Promise<boolean>,
  pageDone?: (page: number) => boolean,
): Promise<{ opened: boolean; completed: Set<number>; cut: boolean }> {
  const out = { opened: false, completed: new Set<number>(), cut: false };
  let pdfjs: Pdfjs;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    // Nothing to read with: nothing is known about the file.
    out.cut = true;
    return out;
  }
  const deadline = Date.now() + opts.budgetMs;
  let task: ReturnType<Pdfjs["getDocument"]> | null = null;
  const visited = new Set<string>();
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
      // Its WebAssembly decoders, without which a photograph stored as JPEG
      // 2000 (`/JPXDecode`) cannot be decoded at all (lib/pdfjs-wasm).
      wasmUrl: pdfjsWasmUrl(),
    });
    const doc = await before(task.promise, deadline);
    out.opened = true;
    const last = Math.min(doc.numPages, opts.pages);
    let going = true;
    for (let p = 1; p <= last && going; p++) {
      if (Date.now() >= deadline) {
        out.cut = true;
        break;
      }
      let page: PdfPage | null = null;
      try {
        page = await before(doc.getPage(p), deadline);
        const ops = await before(page.getOperatorList(), deadline);
        for (let i = 0; i < ops.fnArray.length && going; i++) {
          if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
          const id = ops.argsArray[i]?.[0];
          if (typeof id !== "string") continue;
          // A document-wide image ("g_…") drawn again on a later page.
          if (id.startsWith("g_") && visited.has(id)) continue;
          visited.add(id);
          const img = await before(paintedImage(page, id), deadline);
          if (!img?.data) continue;
          const channels = img.kind === IMAGE_KIND.rgba ? 4 : 3;
          if (img.data.length < img.width * img.height * channels) continue;
          going = await visit({
            width: img.width,
            height: img.height,
            kind: img.kind,
            channels,
            pixels: new Uint8Array(img.data.buffer, img.data.byteOffset, img.width * img.height * channels),
            page: p,
          });
        }
        if (going) out.completed.add(p);
      } catch {
        // A page that fails or runs out of time: keep what earlier pages
        // gave. A page that fails on its own is the file's, and another read
        // fails it again; one the time ran out on is a read cut short.
        if (Date.now() >= deadline) {
          out.cut = true;
          break;
        }
      } finally {
        page?.cleanup();
      }
      if (going && pageDone && !pageDone(p)) going = false;
    }
    return out;
  } catch {
    // A password to open, a file pdfjs cannot parse — the file's own, and
    // another read meets it again — or no time left to open it: cut short.
    if (Date.now() >= deadline) out.cut = true;
    return out;
  } finally {
    try {
      await task?.destroy();
    } catch {
      // nothing to release
    }
  }
}

/** Weigh a decoded image the way the pick does. */
function candidateOf(img: PaintedPixels): ImageCandidate {
  const photo = img.kind === IMAGE_KIND.rgb || img.kind === IMAGE_KIND.rgba;
  return {
    width: img.width,
    height: img.height,
    kind: img.kind,
    page: img.page,
    grey: photo ? isGrey(img.pixels, img.channels) : true,
    flat: photo ? flatShare(img.pixels, img.width, img.height, img.channels) : 1,
  };
}

/**
 * The cover photograph of a memorandum as raw pixels (`pickDecodedCover`'s
 * rule), with what the read managed: a file that needs a password to open,
 * one pdfjs cannot parse, or a search out of time finds no cover and says
 * so. Page one is read first, and when it holds a photograph the pages
 * after it are never decoded. `budgetMs` is `DECODE_BUDGET_MS` but where a
 * test asks for a read the time cuts short.
 */
export async function decodeOmCover(pdf: Uint8Array, opts: { budgetMs?: number } = {}): Promise<OmCoverRead> {
  const read: OmCoverRead = { cover: null, opened: false, pageOneRead: false, complete: false };
  let best: ImageCandidate | null = null;
  const walk = await walkPaintedImages(
    pdf,
    { pages: COVER_PAGES, budgetMs: opts.budgetMs ?? DECODE_BUDGET_MS },
    (img) => {
      const candidate = candidateOf(img);
      if (pickDecodedCover(best ? [best, candidate] : [candidate]) === candidate && candidate !== best) {
        best = candidate;
        // A view, not a copy: the page's own store is emptied after the
        // page, and this reference is the one that keeps the pixels.
        read.cover = { width: img.width, height: img.height, channels: img.channels, pixels: img.pixels, page: img.page };
      }
      return true;
    },
    // The cover page's photograph is the cover: the rest is never decoded.
    (page) => !(page === 1 && read.cover),
  );
  read.opened = walk.opened;
  read.pageOneRead = walk.completed.has(1);
  read.complete = !walk.cut;
  return read;
}

/** How many pages the gallery is read from (#448). */
export const GALLERY_PAGES = 16;
/** The most photographs a gallery keeps beside the cover. */
export const GALLERY_MAX = 8;
/** The most the gallery's read may take. */
export const GALLERY_BUDGET_MS = 12_000;

/** A photograph the gallery read found, with its hash for the next one. */
export interface OmPhoto extends DecodedCover {
  hash: bigint;
}

/**
 * The memorandum's other photographs (#448): every picture its first
 * `GALLERY_PAGES` pages paint that is a photograph by the cover's own rules
 * (colour, a photograph's size and shape, never a map, a plan or a page of
 * text), in page order, each handed to `onPhoto` while its pixels are
 * alive — so one decoded picture is held at a time, never the set. A
 * picture within `NEAR_BITS` of one already taken, or of `skip` (the
 * cover's hash), is the same photograph placed again and is passed over.
 * Stops at `GALLERY_MAX` photographs or `GALLERY_BUDGET_MS`, and gives way
 * the moment `yieldTo` says something more pressing is waiting (`aborted`:
 * what was found is incomplete). Never throws.
 */
export async function decodeOmPhotos(
  pdf: Uint8Array,
  onPhoto: (photo: OmPhoto) => Promise<void> | void,
  opts: {
    skip?: readonly bigint[];
    max?: number;
    pages?: number;
    budgetMs?: number;
    yieldTo?: () => boolean;
  } = {},
): Promise<{ opened: boolean; found: number; aborted: boolean; cut: boolean }> {
  const max = opts.max ?? GALLERY_MAX;
  const taken: bigint[] = [...(opts.skip ?? [])];
  let found = 0;
  let aborted = false;
  const give = () => {
    if (opts.yieldTo?.()) aborted = true;
    return aborted;
  };
  if (max <= 0) return { opened: false, found, aborted, cut: false };
  const walk = await walkPaintedImages(
    pdf,
    { pages: opts.pages ?? GALLERY_PAGES, budgetMs: opts.budgetMs ?? GALLERY_BUDGET_MS },
    async (img) => {
      if (give()) return false;
      if (!coverShaped(candidateOf(img))) return true;
      const hash = differenceHash(img.pixels, img.width, img.height, img.channels);
      if (taken.some((h) => hashDistance(h, hash) <= NEAR_BITS)) return true;
      taken.push(hash);
      await onPhoto({ width: img.width, height: img.height, channels: img.channels, pixels: img.pixels, page: img.page, hash });
      found++;
      return found < max;
    },
    () => !give(),
  );
  // `cut`: the time budget ended the walk before its pages did, so the
  // photographs found are the ones read so far, not the file's.
  return { opened: walk.opened, found, aborted, cut: walk.cut && !aborted };
}
