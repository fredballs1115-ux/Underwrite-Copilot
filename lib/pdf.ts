/**
 * Count the pages in a PDF from its bytes — no external parser. Used to
 * VALIDATE the page numbers the extraction reports: a citation beyond the
 * document's real length is not a citation (Feature 2's "source not located").
 *
 * Heuristic but conservative for that purpose: the page tree's root /Count is
 * authoritative (and is the largest /Count in the file), with a /Type /Page
 * tally as a fallback. Returns null when neither can be found.
 */
export function countPdfPages(pdf: Buffer): number | null {
  // latin1 keeps every byte 1:1 so the structural tokens survive intact.
  const s = pdf.toString("latin1");

  let maxCount = 0;
  const countRe = /\/Count\s+(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = countRe.exec(s)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maxCount) maxCount = n;
  }
  if (maxCount > 0) return maxCount;

  // Fallback: count page leaf objects (/Type /Page, not /Pages).
  const pageRe = /\/Type\s*\/Page(?![a-zA-Z])/g;
  let pages = 0;
  while (pageRe.exec(s) !== null) pages++;
  return pages > 0 ? pages : null;
}
