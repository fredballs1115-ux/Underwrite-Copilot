// A deal's name from its memorandum's file name. The batch upload names
// each deal this way, and the single upload pre-fills its name field the
// same way — one rule, so the two never name the same PDF differently.
//
// And the one cap every name is stored under (research pass 42): the upload
// had stored a name of any length while the rename cut it to 120, the manual
// form to 120 and the batch to 80, so a 200-character name could not survive
// its own rename and ran the one-page memo to two. No imports: the forms and
// the actions read it alike.

/** The longest name a deal is stored under, in characters (code points, so
 *  an emoji is never cut in half): the upload, the batch, the manual form and
 *  the rename all cut a name to it, and each form's field holds it. */
export const DEAL_NAME_MAX = 120;

/** A name as a deal stores it: trimmed and cut to DEAL_NAME_MAX characters
 *  — "" where nothing is left, which every caller refuses as no name. */
export function dealNameOf(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const chars = Array.from(s);
  return chars.length > DEAL_NAME_MAX ? chars.slice(0, DEAL_NAME_MAX).join("").trim() : s;
}

/** "the-maddox_OM_v2.pdf" → "The maddox OM v2" — a starting point the user
 *  can edit before the deal is created, cut to the one cap (the batch names
 *  a deal this way, so its cut is the stored name's, not a display's). */
export function nameFromFile(fileName: string): string {
  const base = dealNameOf(
    fileName
      .replace(/\.pdf$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " "),
  );
  if (!base) return "Untitled OM";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * What the single upload's name field becomes when a PDF is chosen: the
 * file's name where the field is empty or still holds the name the last
 * chosen file gave it, and null — leave the field alone — where the reader
 * typed a name of their own.
 */
export function prefillName(current: string, lastFilled: string | null, fileName: string): string | null {
  if (current.trim() && current !== lastFilled) return null;
  return nameFromFile(fileName);
}

/** Whether the name in the field is the one the last chosen file gave it —
 *  what the new-deal draft marks, so a reload or an upload error keeps the
 *  file's name the next file's to replace (the file itself cannot be
 *  restored), while a name the reader typed is never marked. */
export function nameIsFromFile(name: string, lastFilled: string | null): boolean {
  return lastFilled != null && name === lastFilled;
}

/** The name a restored draft hands back as a file's own: its name where the
 *  draft marked it so, else null — a typed name stays the reader's. */
export function restoredFileName(d: { name?: string | null; nameFromFile?: boolean } | null): string | null {
  return d?.nameFromFile && d.name ? d.name : null;
}
