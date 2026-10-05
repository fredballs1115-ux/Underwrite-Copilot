// What a file picker says when it refuses a file. A 32.0–32.5 MB file read
// "is 32 MB — the limit is 32 MB": its size was rounded to the nearest
// whole MB and set beside the limit, so the refusal read as a file equal to
// the limit. A size is now said to the nearest tenth beside the limit to a
// tenth — "is 32.4 MB — over the 32 MB limit" — and a file within a tenth
// of the limit, which has no size of its own to say, is "just over the
// 32 MB limit". (Rounding up instead said a file one byte over was
// "32.1 MB".) And a type refusal keeps the hint's own words: it had
// lower-cased "PDF … up to 32 MB" into "pdf … up to 32 mb".
//
// Pure: no DOM, so a test drives it; the pickers (app/(app)/file-drop.tsx,
// app/(app)/file-field.tsx) call it.

const MB = 1024 * 1024;

/** The server actions' upload cap: past it a request dies as a raw 500. */
export const UPLOAD_MAX_BYTES = 32 * MB;

/** Tenths of a MB as a figure, a whole one without its ".0". */
const fromTenths = (tenths: number): string => (tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1));

/** A file's size and the limit, as the refusal says them, each to the
 *  nearest tenth of a MB. A file whose tenth is the limit's, or under it,
 *  has no size that tells the two apart: `size` is null, and the refusal
 *  says the file is just over. A file over the limit never reads as equal
 *  to it, and none reads larger than it is. */
export function sizeAgainstLimit(bytes: number, maxBytes: number): { size: string | null; limit: string } {
  const limitTenths = Math.round((maxBytes / MB) * 10);
  const sizeTenths = Math.round((bytes / MB) * 10);
  return { size: sizeTenths > limitTenths ? fromTenths(sizeTenths) : null, limit: fromTenths(limitTenths) };
}

/** What to do with a file over the limit, by what the file is: a part of a
 *  supplement is useful, a part of a memorandum is screened as if it were
 *  the whole (research pass 32), and a photograph is simply taken smaller. */
export const TOO_LARGE_REMEDY = {
  document: "Try compressing or splitting it.",
  memorandum: "Compress it and upload it again — split, it would be screened on part of the memorandum.",
  picture: "Try a smaller copy.",
} as const;

/** The refusal of a file over the limit. */
export function tooLargeMessage(
  name: string,
  bytes: number,
  maxBytes: number,
  remedy: keyof typeof TOO_LARGE_REMEDY = "document",
): string {
  const { size, limit } = sizeAgainstLimit(bytes, maxBytes);
  const over = size ? `is ${size} MB — over the ${limit} MB limit` : `is just over the ${limit} MB limit`;
  return `"${name}" ${over}. ${TOO_LARGE_REMEDY[remedy]}`;
}

/** The refusal of a file of a type the picker does not take, in the hint's
 *  own words and case. */
export function wrongTypeMessage(name: string, hint?: string): string {
  return `"${name}" isn't a supported file type${hint ? ` — ${hint}.` : "."}`;
}
