// What a file picker says when it refuses a file. A 32.0–32.5 MB file read
// "is 32 MB — the limit is 32 MB": its size was rounded to the nearest
// whole MB and set beside the limit, so the refusal read as a file equal to
// the limit. A size is now said to a tenth, rounded UP, beside the limit
// rounded to a tenth, and never at or under it — "is 32.1 MB — over the
// 32 MB limit". And a type refusal keeps the hint's own words: it had
// lower-cased "PDF … up to 32 MB" into "pdf … up to 32 mb".
//
// Pure: no DOM, so a test drives it; the pickers (app/(app)/file-drop.tsx,
// app/(app)/file-field.tsx) call it.

const MB = 1024 * 1024;

/** The server actions' upload cap: past it a request dies as a raw 500. */
export const UPLOAD_MAX_BYTES = 32 * MB;

/** Tenths of a MB as a figure, a whole one without its ".0". */
const fromTenths = (tenths: number): string => (tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1));

/** A file's size and the limit, as the refusal says them: the limit to the
 *  nearest tenth of a MB, the file's rounded up — and, where that still
 *  could not tell them apart, a tenth over the limit — so a file over the
 *  limit never reads as equal to it. */
export function sizeAgainstLimit(bytes: number, maxBytes: number): { size: string; limit: string } {
  const limitTenths = Math.round((maxBytes / MB) * 10);
  const sizeTenths = Math.max(Math.ceil((bytes / MB) * 10), limitTenths + 1);
  return { size: fromTenths(sizeTenths), limit: fromTenths(limitTenths) };
}

/** The refusal of a file over the limit. */
export function tooLargeMessage(name: string, bytes: number, maxBytes: number): string {
  const { size, limit } = sizeAgainstLimit(bytes, maxBytes);
  return `"${name}" is ${size} MB — over the ${limit} MB limit. Try compressing or splitting it.`;
}

/** The refusal of a file of a type the picker does not take, in the hint's
 *  own words and case. */
export function wrongTypeMessage(name: string, hint?: string): string {
  return `"${name}" isn't a supported file type${hint ? ` — ${hint}.` : "."}`;
}
