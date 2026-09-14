/**
 * The text layer of a PDF, page by page — what a reader's "select all"
 * would copy, rebuilt into lines.
 *
 * Why: a deck the model reads as PDF pages costs tokens for every page's
 * pixels; the same deck's text layer is a third to a quarter of that, on
 * every OM-reading step at once. Most OMs are exported from a layout tool
 * and carry a full text layer; a scanned deck carries none, and the
 * density read below is how the caller tells the two apart.
 *
 * pdfjs is loaded lazily and runs in-process (no worker thread, no canvas):
 * text extraction needs neither. Lines are rebuilt from the items'
 * positions — items on one baseline, left to right, with a space only
 * where the gap between them is wider than a fraction of the type size,
 * so "$21.0" and "M" read as "$21.0M" and a table's cells stay one line.
 */

export interface PdfTextPage {
  /** 1-based */
  page: number;
  /** the page's lines, joined with newlines; "" when the page has no text */
  text: string;
  /** characters of text on the page, whitespace collapsed */
  chars: number;
}

export interface PdfTextLayer {
  pages: PdfTextPage[];
  totalChars: number;
  /** pages carrying at least DENSE_PAGE_CHARS characters */
  densePages: number;
}

/** A page with fewer characters than this is a photo, a map, a divider —
 *  or a scan. */
export const DENSE_PAGE_CHARS = 200;

/** The gap, as a fraction of the type size, past which two items on one
 *  baseline are two words. */
const WORD_GAP = 0.18;

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

/** Items on one baseline, left to right, into one line. */
export function lineOf(items: Item[]): string {
  const sorted = items.slice().sort((a, b) => a.x - b.x);
  let out = "";
  let endX: number | null = null;
  for (const it of sorted) {
    const s = it.str;
    if (!s) continue;
    if (endX != null && out && !out.endsWith(" ") && !s.startsWith(" ")) {
      const gap = it.x - endX;
      if (gap > WORD_GAP * Math.max(it.size, 1)) out += " ";
    }
    out += s;
    endX = it.x + it.width;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Items into lines: grouped by baseline (within a fraction of the type
 *  size), top of the page first. */
export function linesOf(items: Item[]): string[] {
  const rows: { y: number; size: number; items: Item[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const tol = Math.max(it.size, 4) * 0.35;
    const row = rows.find((r) => Math.abs(r.y - it.y) <= tol);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, size: it.size, items: [it] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => lineOf(r.items))
    .filter(Boolean);
}

/**
 * Read every page's text. Never throws for an unreadable file: a PDF pdfjs
 * cannot open reads as no pages at all, and the caller falls back to the
 * PDF itself.
 */
export async function pdfTextLayer(pdf: Buffer): Promise<PdfTextLayer> {
  const empty: PdfTextLayer = { pages: [], totalChars: 0, densePages: 0 };
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    return empty;
  }
  let task: ReturnType<typeof pdfjs.getDocument> | null = null;
  try {
    task = pdfjs.getDocument({
      data: new Uint8Array(pdf),
      useSystemFonts: false,
      verbosity: 0,
    });
    const doc = await task.promise;
    const pages: PdfTextPage[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      let text = "";
      try {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const items: Item[] = [];
        for (const raw of content.items) {
          if (!("str" in raw)) continue;
          const t = raw.transform;
          items.push({
            str: raw.str,
            x: t[4],
            y: t[5],
            width: raw.width,
            size: Math.hypot(t[0], t[1]) || Math.abs(t[3]) || 10,
          });
        }
        text = linesOf(items).join("\n");
        page.cleanup();
      } catch {
        text = "";
      }
      pages.push({ page: p, text, chars: text.replace(/\s+/g, "").length });
    }
    return summarize(pages);
  } catch {
    return empty;
  } finally {
    try {
      await task?.destroy();
    } catch {
      // nothing to release
    }
  }
}

export function summarize(pages: PdfTextPage[]): PdfTextLayer {
  return {
    pages,
    totalChars: pages.reduce((a, p) => a + p.chars, 0),
    densePages: pages.filter((p) => p.chars >= DENSE_PAGE_CHARS).length,
  };
}

/** Enough of a text layer to stand in for the pages: at least half the
 *  pages dense, and a few thousand characters in all. A glossy deck's photo
 *  pages are the sparse half it allows for; a scan fails both. */
export function isDenseLayer(layer: PdfTextLayer): boolean {
  if (layer.pages.length === 0 || layer.totalChars < 3000) return false;
  return layer.densePages / layer.pages.length >= 0.5;
}

/**
 * The layer as one document: a header that says what it is and how to
 * cite it, then every page under a `[[page k]]` tag — a page with no text
 * says so, so the model never wonders whether a page went missing.
 */
export function pageTaggedText(layer: PdfTextLayer, title = "Offering memorandum"): string {
  const n = layer.pages.length;
  const head = [
    `${title} — text layer, ${n} page${n === 1 ? "" : "s"}.`,
    'Each page begins with a line "[[page k]]"; cite a page by that number. A page that carries no text (a photo, a map, a rendering) is marked as such.',
  ].join("\n");
  const body = layer.pages
    .map((p) => (p.chars > 0 ? `[[page ${p.page}]]\n${p.text}` : `[[page ${p.page}]] (no text on this page)`))
    .join("\n\n");
  return `${head}\n\n${body}`;
}
