// The asset classes a deal is filed under, and the words each one shows.
// The keys are what the deal row stores (the new-deal forms' option values,
// or the extraction's read — a known class as its key, a phrase of the
// model's own as written); every surface that prints one —
// the pipeline row and its filter, the CSV and the meeting .xlsx, the
// compare table, the shared screen, the market cards — goes through
// `assetClassLabel`, so a stored `self_storage` never reaches a page as
// "Self_storage". Pure: no I/O.

export const ASSET_CLASS_LABEL: Record<string, string> = {
  multifamily: "Multifamily",
  office: "Office",
  industrial: "Industrial",
  retail: "Retail",
  sfr_btr: "SFR / BTR",
  self_storage: "Self-storage",
  manufactured_housing: "Manufactured housing",
  hospitality_str: "Hospitality / STR",
  land_infill: "Land / infill",
};

/** The forms' option list, in the order the map declares — one source for
 *  the new-deal form and the manual-deal form. "Auto-detect" is the
 *  form's own first option, not a class. */
export const ASSET_CLASS_OPTIONS: readonly (readonly [string, string])[] = Object.entries(ASSET_CLASS_LABEL);

/**
 * The label a stored asset class shows. A known key reads from the map; a
 * class the extraction phrased itself ("mixed-use", "student housing")
 * shows with its underscores as spaces and its first letter up; nothing
 * (or "auto", which is a form setting and not a class) shows as "".
 */
export function assetClassLabel(key: string | null | undefined): string {
  const k = (key ?? "").trim();
  if (!k) return "";
  const lower = k.toLowerCase();
  if (lower === "auto") return "";
  const known = ASSET_CLASS_LABEL[lower];
  if (known) return known;
  const words = k.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
