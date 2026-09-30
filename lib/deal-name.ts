// A deal's name from its memorandum's file name. The batch upload names
// each deal this way, and the single upload pre-fills its name field the
// same way — one rule, so the two never name the same PDF differently.

/** "the-maddox_OM_v2.pdf" → "The maddox OM v2" — a starting point the user
 *  can edit before the deal is created. */
export function nameFromFile(fileName: string): string {
  const base = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
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
