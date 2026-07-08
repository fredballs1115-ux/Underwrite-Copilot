/**
 * Best-effort page count from a PDF's bytes — a FALLBACK only. The authoritative
 * count comes from the model that reads the native PDF (extraction.totalPages);
 * this is used when that's unavailable.
 *
 * Deliberately fail-SAFE: it counts /Type /Page leaf objects and NOTHING else.
 * It does NOT read /Count values — those live in the page tree AND in bookmark
 * (outline) dictionaries, and an outline /Count can exceed the real page count,
 * which would let a nonexistent cited page validate (fabrication). Leaf-counting
 * can only UNDER-count (e.g. object-stream PDFs whose page objects are
 * compressed out of the cleartext), which fails safe: an undercount just marks
 * a citation "source not located", it never shows a wrong page. Returns null
 * when it finds nothing.
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
