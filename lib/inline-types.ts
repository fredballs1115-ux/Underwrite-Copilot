// The content types the private bucket serves inline from a signed URL.
// Everything else is stored as application/octet-stream, so a browser
// downloads it rather than rendering it: a user-uploaded text/html or SVG
// must never execute inline on the storage origin (stored-XSS defence; SVG
// is deliberately excluded as a script vector). Pure and universal, so the
// storage layer that sets the type and a page that labels the link ("View"
// or "Download") read one list and cannot disagree.

export const INLINE_SAFE_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/** Whether a file the reader uploaded opens in the browser rather than
 *  downloading: the type it was stored under is one served inline. */
export function servedInline(contentType: string | null | undefined): boolean {
  return INLINE_SAFE_TYPES.has((contentType ?? "").toLowerCase().split(";")[0].trim());
}
