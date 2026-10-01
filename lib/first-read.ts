// A fit the screen judged on its first signal — its fast first pass over
// the memorandum, before the extraction lands — is provisional, and the
// pipeline card and the deal page mark it "First read". An export is read
// away from the page, so the pipeline's CSV and the meeting workbook carry
// the same mark on the figure itself: a provisional fit is never passed off
// as the screen's own. No imports: the pipeline (a client module) and the
// workbook (server-only) both read it.

/** What "First read" means, as the card's tooltip and the workbook's cell
 *  note say it. */
export const FIRST_READ_TITLE = "First read — judged on the first pass over the memorandum; the full screen refines it";

/**
 * An exported figure — a buy-box fit ("Near"), a mandate score ("64"), a
 * mandate call ("Watch") — marked where it was judged on the first signal:
 * "Near (first read)". A blank stays blank: there is nothing to mark.
 */
export function markFirstRead(value: string, firstRead: boolean | null | undefined): string {
  return firstRead && value ? `${value} (first read)` : value;
}
