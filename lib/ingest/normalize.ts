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

/** NYC DOF rolling-sales `building_class_category` (values like
 *  "01 ONE FAMILY DWELLINGS", "07 RENTALS - WALKUP APARTMENTS"). Individual
 *  condo and co-op UNITS drop with single-family — they are apartments, not
 *  buildings. Order matters: CONDO/COOP tokens are checked before APARTMENT
 *  ("12 CONDOS - WALKUP APARTMENTS" contains both). */
export function normalizeNycCategory(raw: string | null | undefined): NormalizeResult {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return { assetClass: "other", note: "empty category" };
  if (v.includes("ONE FAMILY")) return { assetClass: null, note: "one-family dropped" };
  if (v.includes("CONDO")) return { assetClass: null, note: "condo unit dropped" };
  if (v.includes("COOP")) return { assetClass: null, note: "co-op unit dropped" };
  if (
    v.includes("TWO FAMILY") ||
    v.includes("THREE FAMILY") ||
    v.includes("RENTALS") ||
    v.includes("APARTMENT")
  ) {
    return { assetClass: "multifamily" };
  }
  if (v.includes("MIXED")) return { assetClass: "mixed_use" };
  if (v.includes("HOTEL")) return { assetClass: "hospitality" };
  if (v.includes("WAREHOUSE") || v.includes("FACTOR") || v.includes("INDUSTRIAL") || v.includes("LOFT")) {
    return { assetClass: "industrial" };
  }
  if (v.includes("OFFICE")) return { assetClass: "office" };
  if (v.includes("GARAGE") || v.includes("PARKING")) return { assetClass: "specialty" };
  if (v.includes("STORE") || v.includes("RETAIL")) return { assetClass: "commercial_retail" };
  if (v.includes("VACANT") || v.includes("LAND")) return { assetClass: "land" };
  return { assetClass: "other", note: `unmapped: ${v}` };
}

/** NYC PLUTO/DOF single-letter building-class prefixes (standard DOF
 *  vocabulary: A one-family, B two-family, C walk-up, D elevator, R condo
 *  units, S mixed residence+store, O office, E/F warehouse, K store,
 *  G garage, H hotel, V vacant land). */
export function normalizeNycBuildingClass(raw: string | null | undefined): NormalizeResult {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return { assetClass: "other", note: "empty class" };
  const c = v[0];
  if (c === "A") return { assetClass: null, note: "one-family dropped" };
  if (c === "R") return { assetClass: null, note: "condo unit dropped" };
  if (c === "B" || c === "C" || c === "D") return { assetClass: "multifamily" };
  if (c === "S") return { assetClass: "mixed_use" };
  if (c === "O") return { assetClass: "office" };
  if (c === "E" || c === "F" || c === "L") return { assetClass: "industrial" };
  if (c === "K") return { assetClass: "commercial_retail" };
  if (c === "G" || c === "T" || c === "U") return { assetClass: "specialty" };
  if (c === "H") return { assetClass: "hospitality" };
  if (c === "V") return { assetClass: "land" };
  return { assetClass: "other", note: `unmapped class: ${v}` };
}

/** Cook County CCAO major/minor property classes. Class 2xx is residential:
 *  211/212 are the 2-6 unit apartment classes (kept — that's the product);
 *  the rest of 2xx is single-family/condo stock and drops. 3xx multifamily,
 *  4xx not-for-profit-ish, 5xx commercial/industrial. Source: assessor
 *  classcode definitions (cookcountyassessoril.gov). */
export function normalizeCookClass(raw: string | number | null | undefined): NormalizeResult {
  const v = String(raw ?? "").trim();
  if (!v) return { assetClass: "other", note: "empty class" };
  if (v === "211" || v === "212") return { assetClass: "multifamily" };
  if (/^2/.test(v)) return { assetClass: null, note: `sfr/condo class ${v} dropped` };
  if (/^3/.test(v)) return { assetClass: "multifamily" };
  if (/^1/.test(v)) return { assetClass: "land", note: `vacant/farm class ${v}` };
  if (/^5/.test(v)) return { assetClass: "commercial_retail", note: `commercial class ${v} — subtype not split` };
  if (/^0|^EX|^RR/i.test(v)) return { assetClass: "other", note: `exempt/rail class ${v}` };
  return { assetClass: "other", note: `unmapped class: ${v}` };
}

/** Boston Property Assessment `LU` land-use codes (documented vocabulary from
 *  the yearly Analyze Boston roll: R1 single-family, R2 two-family, R3
 *  three-family, R4 four-to-six-plus apartment, RL residential land, RC
 *  residential/commercial mix, CD condo unit, CM condo main, CP condo parking,
 *  A apartment 7+, C/CC commercial, CL commercial land, I industrial, E/EA
 *  exempt, AH agricultural). R1 and per-unit condo rows drop at the gate. */
export function normalizeBostonLU(raw: string | null | undefined): NormalizeResult {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return { assetClass: "other", note: "empty LU" };
  if (v === "R1") return { assetClass: null, note: "single-family dropped" };
  if (v === "CD" || v === "CP") return { assetClass: null, note: "condo unit dropped" };
  if (v === "R2" || v === "R3" || v === "R4" || v === "A" || v === "CM") {
    return { assetClass: "multifamily" };
  }
  if (v === "RC") return { assetClass: "mixed_use" };
  if (v === "C" || v === "CC") return { assetClass: "commercial_retail" };
  if (v === "I") return { assetClass: "industrial" };
  if (v === "RL" || v === "CL" || v === "AH") return { assetClass: "land" };
  if (v === "E" || v === "EA") return { assetClass: "other", note: "exempt" };
  return { assetClass: "other", note: `unmapped LU: ${v}` };
}

/** King County assessor PresentUse — normalized from the DESCRIPTION text in
 *  the LOOKUP file that ships inside the EXTR bundle (LU type 102), never
 *  from bare numeric codes (the code list isn't verifiable from the build
 *  environment; descriptions are self-describing). The ingest script joins
 *  code → description first and fails loudly when the lookup is missing. */
export function normalizeKingCountyUseDesc(raw: string | null | undefined): NormalizeResult {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return { assetClass: "other", note: "empty present use" };
  if (v.includes("SINGLE FAMILY") || v.includes("TOWNHOUSE") || v.includes("MOBILE HOME"))
    return { assetClass: null, note: "sfr/townhome dropped" };
  if (v.includes("CONDO")) return { assetClass: null, note: "condo unit dropped" };
  if (
    v.includes("DUPLEX") ||
    v.includes("TRIPLEX") ||
    v.includes("4-PLEX") ||
    v.includes("APARTMENT")
  ) {
    return { assetClass: "multifamily" };
  }
  if (v.includes("HOTEL") || v.includes("MOTEL")) return { assetClass: "hospitality" };
  if (v.includes("WAREHOUSE") || v.includes("INDUSTRIAL")) return { assetClass: "industrial" };
  if (v.includes("OFFICE")) return { assetClass: "office" };
  if (v.includes("PARKING") || v.includes("GARAGE")) return { assetClass: "specialty" };
  if (v.includes("RETAIL") || v.includes("STORE") || v.includes("SHOPPING") || v.includes("RESTAURANT")) {
    return { assetClass: "commercial_retail" };
  }
  if (v.includes("VACANT") || v.includes("LAND") || v.includes("ACREAGE")) {
    return { assetClass: "land" };
  }
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
