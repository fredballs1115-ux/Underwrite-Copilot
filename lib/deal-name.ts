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
