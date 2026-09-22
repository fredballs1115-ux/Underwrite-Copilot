/**
 * The photograph of the building, out of the offering memorandum itself.
 *
 * Every memorandum opens on a professional photograph of the property — it
 * is the one picture of the building the deal already owns, taken by
 * someone paid to make it look its best, and it sits on page one of a file
 * the user has already uploaded. Nothing on the site had used it: the deal
 * page showed an overhead of the site, or a Street View frame where a key
 * existed. This finds that photograph without rendering a page.
 *
 * HOW. A PDF stores a JPEG photograph as an image XObject whose stream is
 * the JPEG file itself (`/Filter /DCTDecode`), so the bytes can be lifted
 * out untouched: no rasteriser, no native dependency, no re-encoding of
 * the broker's picture. The scan walks every `/DCTDecode` in the file,
 * confirms the object is an image, reads the dictionary's width and height,
 * and then reads the JPEG's OWN start-of-frame marker and trusts that — a
 * dictionary can lie, a SOF cannot. A stream that is not a JPEG (double
 * encoded, truncated, a mask) is skipped rather than served.
 *
 * WHICH ONE. A memorandum carries dozens of images — interiors, amenities,
 * maps, the broker's logo, the comps' photographs. The cover is the largest
 * photograph in the file more often than not, and it sits early: a
 * linearised PDF puts page one's objects first, and the exporters brokers
 * use write objects in page order. So the pick is the largest image of a
 * photograph's shape, with the first third of the file preferred. It is a
 * heuristic and it says so; the deal page lets the reader replace it.
 *
 * Pure: bytes in, bytes out. The storing, the derivatives and the cache
 * are `lib/deal-picture.ts`.
 */

export interface OmImage {
  /** Where the object's dictionary starts in the file, in bytes. */
  offset: number;
  /** From the JPEG's own start-of-frame marker. */
  width: number;
  height: number;
  /** 1 grey, 3 colour, 4 CMYK (print exports; sharp converts it). */
  components: number;
  /** The JPEG file, byte for byte as the PDF carries it. */
  bytes: Uint8Array;
}

export interface JpegInfo {
  width: number;
  height: number;
  components: number;
}

/**
 * The frame header of a JPEG: its size and its channel count, read from
 * the SOF marker. Null for anything that is not a JPEG, or one whose scan
 * starts before any frame header.
 */
export function jpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    // Fill bytes and the standalone markers carry no length.
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;
    // SOF0–SOF15, less the three that share the range and are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      const components = bytes[i + 9];
      if (width === 0 || height === 0) return null;
      return { width, height, components };
    }
    // The scan began: no frame header came first, so this is not decodable.
    if (marker === 0xda) return null;
    i += 2 + len;
  }
  return null;
}

const DCT = "/DCTDecode";
const STREAM = /stream(\r\n|\n|\r)/g;

/** True when this image XObject is a JPEG and nothing else is layered on it. */
function plainJpegFilter(dict: string): boolean {
  const m = dict.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/);
  if (!m) return false;
  const names = m[1].match(/\/[A-Za-z0-9]+/g) ?? [];
  return names.length === 1 && names[0] === DCT;
}

/**
 * Every JPEG photograph stored in the PDF, in file order. Each one's size
 * comes from its own frame header; the dictionary's `/Width` and `/Height`
 * are read only to skip the obviously tiny before the marker walk.
 */
export function findOmImages(pdf: Uint8Array): OmImage[] {
  const text = latin1(pdf);
  const out: OmImage[] = [];
  let at = text.indexOf(DCT);
  while (at >= 0) {
    const next = text.indexOf(DCT, at + DCT.length);
    // The object this filter belongs to: back to its header, forward to its stream.
    const objAt = text.lastIndexOf(" obj", at);
    STREAM.lastIndex = at;
    const streamMatch = STREAM.exec(text);
    if (objAt >= 0 && streamMatch && (next < 0 || streamMatch.index < next)) {
      const dict = text.slice(objAt, streamMatch.index);
      if (/\/Subtype\s*\/Image\b/.test(dict) && plainJpegFilter(dict)) {
        const start = streamMatch.index + streamMatch[0].length;
        let end = text.indexOf("endstream", start);
        if (end > start) {
          // The stream's own bytes end before the keyword's line break.
          while (end > start && (text[end - 1] === "\n" || text[end - 1] === "\r" || text[end - 1] === " ")) end--;
          const bytes = pdf.subarray(start, end);
          const info = jpegInfo(bytes);
          if (info) {
            out.push({ offset: objAt, width: info.width, height: info.height, components: info.components, bytes });
          }
        }
      }
    }
    at = next;
  }
  return out;
}

/** The smallest photograph worth showing, and the shape of one. */
export const COVER_MIN = { width: 480, height: 320, maxBytes: 12 * 1024 * 1024 };
export const COVER_ASPECT = { min: 0.5, max: 2.6 };
/** The share of the file counted as "early", where the cover tends to sit. */
export const EARLY_SHARE = 0.3;
const EARLY_BONUS = 1.5;

/**
 * The image most likely to be the cover photograph: the largest of a
 * photograph's shape, with an image in the first third of the file
 * preferred over a larger one deeper in. Null when the memorandum carries
 * no usable photograph — a scanned deck, a text-only teaser — and the deal
 * keeps its overhead.
 */
export function pickCover(images: readonly OmImage[], fileLength: number): OmImage | null {
  let best: OmImage | null = null;
  let bestScore = 0;
  for (const im of images) {
    if (im.width < COVER_MIN.width || im.height < COVER_MIN.height) continue;
    if (im.bytes.length > COVER_MIN.maxBytes) continue;
    if (im.components !== 3 && im.components !== 4) continue;
    const aspect = im.width / im.height;
    if (aspect < COVER_ASPECT.min || aspect > COVER_ASPECT.max) continue;
    const early = fileLength > 0 && im.offset / fileLength < EARLY_SHARE;
    const score = im.width * im.height * (early ? EARLY_BONUS : 1);
    if (score > bestScore) {
      best = im;
      bestScore = score;
    }
  }
  return best;
}

/** The file as one byte-per-character string, so the scan can use `indexOf`. */
function latin1(bytes: Uint8Array): string {
  // TextDecoder("latin1") is windows-1252 in browsers and Node alike, which
  // remaps a handful of bytes — fine for finding ASCII keywords, and the
  // image bytes themselves are taken from the original array by offset.
  return new TextDecoder("latin1").decode(bytes);
}
