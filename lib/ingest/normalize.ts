// Bulk-ingestion normalizer: county land-use vocabularies → our asset
// classes, with single-family DROPPED at the gate (policy: SFR never enters
// the property database). PURE + unit-tested; each market's pipeline feeds
// its raw code through here. (Universal module.)

export type NormalizedClass =
  | "multifamily"
  | "mixed_use"
  | "commercial_retail"
  | "office"
  | "industrial"
  | "hospitality"
  | "land"
  | "specialty"
  | "other";

export interface NormalizeResult {
  /** null = row is DROPPED (single-family / single residential unit) */
  assetClass: NormalizedClass | null;
  /** why a row dropped or fell to 'other' — kept for ingest logs */
  note?: string;
}

/** Philadelphia OPA `category_code_description` values (reference-verified
 *  vocabulary; unknown strings fall to 'other', never invented classes). */
export function normalizePhillyCategory(raw: string | null | undefined): NormalizeResult {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return { assetClass: "other", note: "empty category" };
  if (v.includes("SINGLE FAMILY")) return { assetClass: null, note: "sfr dropped" };
  if (v.includes("CONDO")) return { assetClass: null, note: "single condo unit dropped" };
  if (v.includes("MULTI FAMILY") || v.includes("MULTI-FAMILY") || v.includes("APARTMENT")) {
    return { assetClass: "multifamily" };
  }
  if (v.includes("MIXED")) return { assetClass: "mixed_use" };
  if (v.includes("HOTEL") || v.includes("MOTEL")) return { assetClass: "hospitality" };
  if (v.includes("INDUSTRIAL") || v.includes("WAREHOUSE")) return { assetClass: "industrial" };
  if (v.includes("OFFICE")) return { assetClass: "office" };
  // Specific tokens before the generic COMMERCIAL catch: OPA labels parking
  // stock "GARAGE - COMMERCIAL", which is specialty, not retail.
  if (v.includes("GARAGE") || v.includes("PARKING")) return { assetClass: "specialty" };
  if (v.includes("STORE") || v.includes("RETAIL") || v.includes("COMMERCIAL")) {
    return { assetClass: "commercial_retail" };
  }
  if (v.includes("VACANT") || v.includes("LAND")) return { assetClass: "land" };
  return { assetClass: "other", note: `unmapped: ${v}` };
}

/** Absentee-owner heuristic: the mailing address differs materially from the
 *  situs address. Conservative — null when either side is missing; matching
 *  street numbers on the same street = owner-occupied-ish. */
export function absenteeFlag(
  situs: string | null | undefined,
  mailing: string | null | undefined
): boolean | null {
  const norm = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .replace(/\b(STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|LANE|LN|BOULEVARD|BLVD|PLACE|PL|COURT|CT)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const a = situs?.trim() ? norm(situs) : "";
  const b = mailing?.trim() ? norm(mailing) : "";
  if (!a || !b) return null;
  return a !== b && !b.startsWith(a) && !a.startsWith(b);
}

/** Money/int coercion shared by pipelines — null-safe (Number(null)=0 trap). */
export const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[,$]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};
