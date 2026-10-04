/** The most pages the analysis service reads in one pass: the upload refuses
 *  a longer memorandum before it becomes a deal (lib/pdf-open), and the
 *  pipeline stops one that got past it before any model call. */
export const MAX_OM_PAGES = 600;

/**
 * Best-effort page count from a PDF's bytes — a FALLBACK only. The authoritative
 * count comes from the model that reads the native PDF (extraction.totalPages);
 * this is used when that's unavailable.
 *
 * It counts /Type /Page leaf objects and NOTHING else. It does NOT read /Count
 * values — those live in the page tree AND in bookmark (outline) dictionaries,
 * and an outline /Count can exceed the real page count, which would let a
 * nonexistent cited page validate (fabrication). Leaf-counting miscounts BOTH
 * ways, though. It under-counts an object-stream PDF, whose page objects are
 * compressed out of the cleartext — which fails safe: an undercount just marks
 * a citation "source not located", it never shows a wrong page. And it
 * over-counts an incrementally saved file, which re-emits each revised page as
 * a new copy of its object after the original, every copy counted: a two-page
 * deck with one page revised reads as three. So a reader holding a citation to
 * it takes the smaller of it and any count it has from a read of the pages
 * (`citablePageCount`). Returns null when it finds nothing.
 */
export function countPdfPages(pdf: Buffer): number | null {
  // latin1 keeps every byte 1:1 so the structural tokens survive intact.
  const s = pdf.toString("latin1");
  // /Type /Page leaves only — the (?![a-zA-Z]) guard excludes /Type /Pages.
  const pageRe = /\/Type\s*\/Page(?![a-zA-Z])/g;
  let pages = 0;
  while (pageRe.exec(s) !== null) pages++;
  return pages > 0 ? pages : null;
}

/**
 * The length a cited page is held to where no read of the pages gave one
 * (Ask over a memorandum the screen read as a PDF): the memorandum's length
 * as the screen's extraction stored it (`ExtractionResult.totalPages`, the
 * model's count of the pages it read), held to the byte counter where both
 * answer — the smaller of the two. The stored count fixes the counter's
 * over-count of an incrementally saved file; the counter keeps a count
 * stored for a memorandum since replaced, and not yet re-read, from
 * validating a page the new deck does not have. Either alone where only one
 * answers; null where neither does, and then no cited page validates.
 */
export function citablePageCount(stated: number | null | undefined, counted: number | null): number | null {
  const s = typeof stated === "number" && Number.isFinite(stated) && stated >= 1 ? Math.floor(stated) : null;
  if (s !== null && counted !== null) return Math.min(s, counted);
  return s ?? counted;
}
