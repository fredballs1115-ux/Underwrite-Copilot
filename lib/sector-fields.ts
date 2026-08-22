// Per-sector deal fields (research build, Phase 2 item 3). Catalog-driven so
// adding a sector = adding rows here; the form, storage, and rule-subject
// mapping all read this. PURE — unit-tested. (Universal module.)

export type SectorFieldType = "number" | "text" | "boolean" | "percent";

export interface SectorFieldDef {
  key: string;
  label: string;
  type: SectorFieldType;
  /** shown as a hint under the input */
  help?: string;
  /** unit suffix rendered after number inputs, e.g. "ft", "acres", "yrs" */
  unit?: string;
}

/** Asset-class values as the deals table stores them (free text; these are
 *  the ones the UI offers). "auto" and unknown classes get the multifamily
 *  regulatory fields — the rules engine's open questions apply to any
 *  residential rental, and they're all optional. */
export const SECTOR_FIELDS: Record<string, SectorFieldDef[]> = {
  multifamily: [
    {
      key: "year_built",
      label: "Year built",
      type: "number",
      help: "Settles age-based coverage: NYC pre-1974, Jersey City pre-1987, LA pre-1979, Montgomery County's under-23-years exemption. Only needed if the screen below still asks.",
    },
    {
      key: "will_owner_occupy",
      label: "You'll live in one unit",
      type: "boolean",
      help: "Owner-occupied small buildings duck the caps in Chicago, Newark, and MoCo — and the CA, WA, and NY statewide regimes.",
    },
    {
      key: "building_permit_year",
      label: "Building permit year",
      type: "number",
      help: "Drives DC rent-stabilization coverage (pre-1976 = presumptively covered).",
    },
    {
      key: "rad_exemption_registered",
      label: "RAD exemption registered",
      type: "boolean",
      help: "DC: the natural-person ≤4-unit exemption must be registered to hold.",
    },
    {
      key: "owner_units_in_jurisdiction",
      label: "Your other rental units in this jurisdiction",
      type: "number",
      help: "DC exemption: 0 others required. PG County: ≤5 total in the county. NY Good Cause: ≤10 statewide.",
    },
  ],
  retail: [
    { key: "lease_term_years", label: "Remaining lease term", type: "number", unit: "yrs" },
    { key: "tenant_credit", label: "Tenant credit", type: "text", help: "e.g. corporate NNN, franchisee, local" },
    { key: "rent_bumps", label: "Rent bumps", type: "text", help: "e.g. 10% every 5 yrs" },
  ],
  industrial: [
    { key: "clear_height_ft", label: "Clear height", type: "number", unit: "ft" },
    { key: "ios_acreage", label: "IOS acreage", type: "number", unit: "acres", help: "Outdoor-storage yards: usable, by-right acreage." },
    { key: "dock_doors", label: "Dock doors", type: "number" },
    { key: "zoning_by_right", label: "Use is by-right", type: "boolean", help: "IOS lives or dies on by-right outdoor-storage zoning." },
  ],
  office: [
    { key: "medical_tenancy_pct", label: "Medical tenancy", type: "percent", help: "MOB share — the resilient corner of office." },
    { key: "walt_years", label: "WALT", type: "number", unit: "yrs" },
  ],
  self_storage: [
    { key: "unit_count", label: "Unit count", type: "number" },
    { key: "occupancy_pct", label: "Occupancy", type: "percent" },
    { key: "climate_controlled_pct", label: "Climate-controlled share", type: "percent" },
  ],
  manufactured_housing: [
    { key: "lot_count", label: "Lots", type: "number" },
    { key: "tenant_owned_homes_pct", label: "Tenant-owned homes", type: "percent", help: "Higher = closer to land-lease purity." },
    { key: "city_utilities", label: "City water/sewer", type: "boolean" },
  ],
  hospitality_str: [
    { key: "keys", label: "Keys / bedrooms", type: "number" },
    { key: "str_permitted", label: "STR use verified permitted in writing", type: "boolean" },
  ],
  land_infill: [
    { key: "acreage", label: "Acreage", type: "number", unit: "acres" },
    { key: "entitled", label: "Entitled / shovel-ready", type: "boolean" },
    { key: "by_right_units", label: "By-right unit count", type: "number" },
  ],
  sfr_btr: [
    { key: "beds", label: "Bedrooms", type: "number" },
    { key: "year_built", label: "Year built", type: "number" },
  ],
};

/** Classes whose deals should also show the multifamily regulatory fields
 *  (any residential rental evaluates against the same rules). */
const RESIDENTIAL_CLASSES = new Set(["auto", "multifamily", "sfr_btr", "student_housing"]);

export function fieldsForAssetClass(assetClass: string | null | undefined): SectorFieldDef[] {
  const cls = (assetClass ?? "auto").toLowerCase();
  const own = SECTOR_FIELDS[cls] ?? [];
  if (cls !== "multifamily" && RESIDENTIAL_CLASSES.has(cls)) {
    return [...SECTOR_FIELDS.multifamily, ...own.filter((f) => !SECTOR_FIELDS.multifamily.some((m) => m.key === f.key))];
  }
  return own;
}

export type SectorFieldValues = Record<string, string | number | boolean>;

/** Parse a submitted form into typed values. Empty inputs are dropped —
 *  absence must stay absence for the tri-state rules engine. */
export function parseSectorFields(
  assetClass: string | null | undefined,
  form: Record<string, unknown>
): SectorFieldValues {
  const out: SectorFieldValues = {};
  for (const def of fieldsForAssetClass(assetClass)) {
    const raw = form[def.key];
    if (raw === undefined || raw === null) continue;
    const s = String(raw).trim();
    if (s === "") continue; // absence stays absence — the tri-state engine's "unknown"
    if (def.type === "boolean") {
      // Rendered as a three-way select (Unknown / Yes / No): an explicit "no"
      // is a real answer (e.g. "RAD exemption NOT registered" fails the
      // exemption), distinct from never having answered.
      if (s === "true") out[def.key] = true;
      else if (s === "false") out[def.key] = false;
    } else if (def.type === "number" || def.type === "percent") {
      const n = Number(s.replace(/[,%$]/g, ""));
      if (Number.isFinite(n)) out[def.key] = n;
    } else {
      out[def.key] = s.slice(0, 200);
    }
  }
  return out;
}
