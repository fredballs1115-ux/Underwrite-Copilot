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
  /** characters of the deck's own text — the running lines discounted */
  totalChars: number;
  /** pages carrying at least DENSE_PAGE_CHARS characters of their own */
  densePages: number;
  /** distinct lines that recur across the pages — headers, footers, a
   *  disclaimer — counted on no page */
  boilerplateLines: number;
}

/** A page with fewer characters than this is a photo, a map, a divider —
 *  or a scan. */
export const DENSE_PAGE_CHARS = 200;

/** A deck under this many pages goes as its pages: a teaser costs little
 *  either way, and a cover letter over a scanned page must not read as a
 *  dense deck. */
export const MIN_TEXT_PAGES = 4;

/** A line's shape for the running-line test: lower-cased, digits out
 *  (page numbers differ), whitespace collapsed. Only a line with a few
 *  letters and some length can be furniture — a table's numeric rows,
 *  a lone word, never are. */
export function lineShape(line: string): string | null {
  const s = line.toLowerCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();
  return s.length >= 8 && (s.match(/[a-z]/g) ?? []).length >= 3 ? s : null;
}

/** A line's exact words for the tiled-caption test: lower-cased and
 *  whitespace-collapsed, digits kept — a rent roll's rows differ by theirs,
 *  the caption under every rendering does not. A line that carries a
 *  figure (three digits or more, or a currency sign) is never a caption:
 *  an inventory grouped by size repeats its rows across half a deck
 *  ("10 x 10 Non-Climate $125 Occupied"), and those rows are the deck. */
export function lineText(line: string): string | null {
  const s = line.toLowerCase().replace(/\s+/g, " ").trim();
  if (s.length < 8 || (s.match(/[a-z]/g) ?? []).length < 3) return null;
  if ((s.match(/\d/g) ?? []).length > 2 || /[$€£%]/.test(s)) return null;
  return s;
}

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
  const empty: PdfTextLayer = { pages: [], totalChars: 0, densePages: 0, boilerplateLines: 0 };
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

/** A shape seen more often than this on one page is a table's rows (a
 *  rent roll's lines share one shape once the digits are out), never a
 *  running line, however many pages it recurs on. */
const FURNITURE_PER_PAGE = 2;

/**
 * The layer's measure. A line that recurs on at least half the pages (and
 * on three), once or twice a page, is the deck's furniture — a running
 * header, a page footer, the disclaimer under every picture — and counts
 * on no page: a photo deck whose only text is that footer must read as the
 * pictures it is, not as a dense deck. So is a line whose exact words
 * recur on that many pages however many times a page — the caption
 * tiled under three renderings on every page — while a table's rows,
 * which share a shape but differ by their figures, never are. Each page's
 * own `chars` stays the raw count (the tagged document uses it to mark a
 * page with no text).
 */
export function summarize(pages: PdfTextPage[]): PdfTextLayer {
  const seenOn = new Map<string, number>();
  const exactOn = new Map<string, number>();
  const shaped = pages.map((p) => {
    const lines = p.text ? p.text.split("\n") : [];
    const onPage = new Map<string, number>();
    const exactHere = new Set<string>();
    for (const line of lines) {
      const s = lineShape(line);
      if (s) onPage.set(s, (onPage.get(s) ?? 0) + 1);
      const e = lineText(line);
      if (e) exactHere.add(e);
    }
    for (const [s, n] of onPage) {
      if (n <= FURNITURE_PER_PAGE) seenOn.set(s, (seenOn.get(s) ?? 0) + 1);
    }
    for (const e of exactHere) exactOn.set(e, (exactOn.get(e) ?? 0) + 1);
    return lines;
  });
  const need = Math.max(3, Math.ceil(pages.length / 2));
  const furniture = new Set<string>();
  for (const [s, n] of seenOn) if (n >= need) furniture.add(s);
  const tiled = new Set<string>();
  for (const [e, n] of exactOn) if (n >= need) tiled.add(e);
  const ownChars = shaped.map((lines) => {
    let chars = 0;
    const discounted = new Map<string, number>();
    for (const line of lines) {
      const e = lineText(line);
      if (e && tiled.has(e)) continue;
      const s = lineShape(line);
      if (s && furniture.has(s) && (discounted.get(s) ?? 0) < FURNITURE_PER_PAGE) {
        discounted.set(s, (discounted.get(s) ?? 0) + 1);
        continue;
      }
      chars += line.replace(/\s+/g, "").length;
    }
    return chars;
  });
  // Distinct running lines: a tiled line whose shape is already furniture
  // (the same footer on every page is both) is one line, not two.
  let boilerplateLines = furniture.size;
  for (const e of tiled) {
    const s = lineShape(e);
    if (!s || !furniture.has(s)) boilerplateLines++;
  }
  return {
    pages,
    totalChars: ownChars.reduce((a, c) => a + c, 0),
    densePages: ownChars.filter((c) => c >= DENSE_PAGE_CHARS).length,
    boilerplateLines,
  };
}

/** Enough of a text layer to stand in for the pages: a deck of a few pages
 *  at least, half of them dense with text of their own, and a few thousand
 *  characters in all. A glossy deck's photo pages are the sparse half it
 *  allows for; a scan fails every part. */
export function isDenseLayer(layer: PdfTextLayer): boolean {
  if (layer.pages.length < MIN_TEXT_PAGES || layer.totalChars < 3000) return false;
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
