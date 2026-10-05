// A stored photograph's sizes for a browser to choose from (lib/deal-picture):
// the hero, no wider than 1,600px, and — where the source was larger — the
// full-size copy up to 2,560px. A srcset names both with their widths, and
// `sizes` says how wide the picture is drawn, so a dense screen, a panorama
// covering a frame by its height or the full-screen viewer takes the full
// copy while every other screen takes the hero it always had. A pipeline
// card offers the card copy, 800px on its long side, beside the hero
// (`cardSrcSet`, research pass 29), so a laptop's card takes a third of the
// bytes it took.
//
// Pure and universal: the deal page's client components draw from it.

/** What a page knows of a stored photograph's derivatives. */
export interface StoredPhotoSizes {
  /** the hero's pixel size */
  width?: number | null;
  height?: number | null;
  /** the full-size copy's width, where one is stored */
  fullWidth?: number | null;
  /** the card copy's width, where one is stored (research pass 29) */
  cardWidth?: number | null;
}

/**
 * The card copy's long side (research pass 29): a pipeline card is 292 to
 * 368px wide on a laptop, so a dense laptop screen draws it from 584 to 736
 * pixels, and every card had downloaded the hero, up to 1,600, for it. The
 * copy is made from the photograph itself and never enlarged
 * (lib/deal-picture); a phone held at three device pixels to the CSS pixel
 * still takes the hero, which its 350px card needs.
 */
export const CARD_PX = 800;

/**
 * The card copy's width: the stored one's, else the one a copy made from the
 * hero would have — for a photograph stored before card copies, which the
 * picture route makes from the hero on its first ask — else none, where the
 * hero is no longer than a card copy and is its own card.
 */
export function cardWidthOf(sizes: StoredPhotoSizes | null | undefined): number | null {
  const stored = sizes?.cardWidth ?? 0;
  if (stored > 0) return Math.round(stored);
  const w = sizes?.width ?? 0;
  const h = sizes?.height ?? 0;
  const long = Math.max(w, h);
  if (!(w > 0 && h > 0) || long <= CARD_PX) return null;
  return Math.round((w * CARD_PX) / long);
}

/**
 * The srcset of a stored photograph on a card: the card copy and the hero,
 * each at its own width, so a browser takes the copy wherever the card's
 * slot (`sizes`) at its screen's density is no wider than it — or undefined
 * where there is no copy smaller than the hero, and the plain `src` is all
 * there is.
 */
export function cardSrcSet(
  url: (size: "card" | "hero") => string,
  sizes: StoredPhotoSizes | null | undefined,
): string | undefined {
  const hero = Math.round(sizes?.width ?? 0);
  const card = cardWidthOf(sizes);
  if (!(hero > 0) || card === null || !(card < hero)) return undefined;
  return `${url("card")} ${card}w, ${url("hero")} ${hero}w`;
}

/** A `sizes` list's entries, split at its top-level commas. */
function sizesEntries(sizes: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < sizes.length; i++) {
    const c = sizes[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(sizes.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(sizes.slice(from).trim());
  return out.filter(Boolean);
}

/** An entry's length, its last term: "292px", or "calc(50vw - 160px)". */
function entryLength(entry: string): string {
  if (!entry.endsWith(")")) return entry.split(/\s+/).pop() ?? entry;
  let depth = 0;
  for (let i = entry.length - 1; i >= 0; i--) {
    if (entry[i] === ")") depth++;
    else if (entry[i] === "(" && --depth === 0) {
      // The function the parentheses belong to (calc, min, max…), if any.
      let j = i;
      while (j > 0 && /[a-z-]/i.test(entry[j - 1])) j--;
      return entry.slice(j);
    }
  }
  return entry;
}

/**
 * A slot's `sizes` (a card's, `lib/pipeline-view`'s) for a photograph drawn
 * to cover it: as it is where the photograph is no wider than the frame's
 * shape, and each width scaled by how much wider it is where it covers the
 * frame by its height — a panorama in a 16:10 card is drawn wider than the
 * card, and a srcset chosen by the card's width alone would take the copy
 * and stretch it (`coverSizes`' rule for the deal header, #446).
 */
export function coverSlotSizes(sizes: string, aspect: number, frameAspect: number): string {
  const k = Math.round(Math.max(1, aspect / frameAspect) * 1000) / 1000;
  if (!(k > 1) || !Number.isFinite(k)) return sizes;
  return sizesEntries(sizes)
    .map((entry) => {
      const len = entryLength(entry);
      const media = entry.slice(0, entry.length - len.length).trim();
      const scaled = /^calc\(/i.test(len) ? `calc(${len.slice(4)} * ${k})` : `calc(${len} * ${k})`;
      return media ? `${media} ${scaled}` : scaled;
    })
    .join(", ");
}

/**
 * The srcset of a stored photograph — the hero and the full-size copy, each
 * at its own width — or undefined where there is no copy larger than the
 * hero, and the plain `src` is all there is.
 */
export function photoSrcSet(
  url: (size: "hero" | "full") => string,
  sizes: StoredPhotoSizes | null | undefined,
): string | undefined {
  const hero = sizes?.width ?? 0;
  const full = sizes?.fullWidth ?? 0;
  if (!(hero > 0) || !(full > hero)) return undefined;
  return `${url("hero")} ${Math.round(hero)}w, ${url("full")} ${Math.round(full)}w`;
}

/** A photograph's shape, width over height; 1.5 where it is not known. */
export function photoAspect(sizes: StoredPhotoSizes | null | undefined): number {
  const w = sizes?.width ?? 0;
  const h = sizes?.height ?? 0;
  return w > 0 && h > 0 ? w / h : 1.5;
}

/**
 * How wide the deal header's picture is drawn, by the window (#433): the
 * app's sidebar takes 240px from 768px up (`md`, `w-60`), the deal page's
 * column is at most 64rem with 20px (`px-5`) or, from 640px, 32px (`sm:px-8`)
 * each side, and the header splits at its own 48rem with the picture taking
 * 58% of it — 557px once the column is full (from 1264px), (100vw − 304px)
 * × 0.58 from the split (1072px). Below the split the picture spans the
 * header. The CSS is `app/(app)/app-shell.tsx`, `deal-hero.tsx` and
 * `property-visual.tsx`; this reads the same numbers.
 */
const HEADER_PICTURE: ReadonlyArray<readonly [string | null, string]> = [
  ["(min-width: 1264px)", "557px"],
  ["(min-width: 1072px)", "(58vw - 176px)"],
  ["(min-width: 768px)", "(100vw - 304px)"],
  ["(min-width: 640px)", "(100vw - 64px)"],
  [null, "(100vw - 40px)"],
];

/** The frame's shape where a picture sits alone: 16:9 (the stacked 21:9
 *  band is wider, so reading it as 16:9 only ever asks for more). */
const FRAME_ASPECT = 16 / 9;
/** A mosaic's cell (#458): two thirds or a third of the frame across, the
 *  whole or half of it down — at its squarest (the 16:9 mosaic) two thirds
 *  of 16:9. */
const MOSAIC_CELL_ASPECT = (2 / 3) * (16 / 9);

function widthOf(width: string, factor: number): string {
  const k = Math.round(factor * 1000) / 1000;
  if (k === 1) return width.startsWith("(") ? `calc${width}` : width;
  return `calc(${width} * ${k})`;
}

/**
 * `sizes` for a photograph drawn to cover a frame: the frame's width where
 * the photograph is no wider than the frame's shape, and wider by as much
 * as it is where it covers the frame by its height (a panorama). `share` is
 * the part of the header picture's width the frame takes (a mosaic's tile a
 * third), `frameAspect` the frame's shape.
 */
export function coverSizes(aspect: number, share = 1, frameAspect = FRAME_ASPECT): string {
  const factor = share * Math.max(1, aspect / frameAspect);
  return HEADER_PICTURE.map(([media, width]) => `${media ? `${media} ` : ""}${widthOf(width, factor)}`).join(", ");
}

/** `sizes` for the deal header's picture, and a mosaic's cover: the whole
 *  frame (a mosaic's cover is two thirds of it across, and no wider drawn). */
export function headerPhotoSizes(aspect: number): string {
  return coverSizes(aspect);
}

/** `sizes` for a mosaic's tile beside the cover (#458): a third across. */
export function mosaicTileSizes(aspect: number): string {
  return coverSizes(aspect, 1 / 3, MOSAIC_CELL_ASPECT);
}

/**
 * `sizes` for the full-screen viewer (#445), whose picture is as large as
 * fits a box `100vw − 8rem` wide (`100vw − 1rem` on a phone) and
 * `100vh − 11rem` tall, its shape kept (photo-viewer.tsx's classes): drawn
 * by its height wherever the window is wider than the photograph's shape.
 * With a srcset, `sizes` is also the picture's own width in the viewer, so
 * a stored photograph fills that box as a listing's viewer does.
 */
export function viewerSizes(sizes: StoredPhotoSizes | null | undefined): string {
  const w = Math.round(sizes?.width ?? 0);
  const h = Math.round(sizes?.height ?? 0);
  const byWidth = "(min-width: 640px) calc(100vw - 8rem), calc(100vw - 1rem)";
  if (!(w > 0 && h > 0)) return byWidth;
  const aspect = Math.round((w / h) * 1000) / 1000;
  return `(min-aspect-ratio: ${w}/${h}) calc((100vh - 11rem) * ${aspect}), ${byWidth}`;
}
