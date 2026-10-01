/**
 * The canonical rent roll (Phase 3).
 *
 * Broker rent rolls are never in the same format twice: different column
 * names, a title block above the header, merged cells, dates in four formats,
 * rent stated monthly on one file and annually on the next. Everything
 * downstream — WALT, rollover, mark-to-market, the Excel export — reads THIS
 * shape and nothing else, so all the format-wrangling lives in one place.
 *
 * Pure types + the alias vocabulary the fuzzy mapper scores against.
 */

export type RentBasis = "NNN" | "MG" | "FSG" | "unknown";

/** One normalized lease. Every optional figure is `null` when the file didn't
 *  state it — never 0, which would silently sink WALT and rent totals. */
export interface Lease {
  /** 1-based row in the source file, so a validation issue can point at it */
  sourceRow: number;
  suite: string;
  tenant: string;
  sf: number | null;
  /** ISO yyyy-mm-dd */
  leaseStart: string | null;
  leaseExpiry: string | null;
  /** annual contract base rent, dollars */
  baseRentAnnual: number | null;
  /** annual $/SF — from the file when stated, else derived from rent ÷ SF */
  rentPsf: number | null;
  rentBasis: RentBasis;
  /** annual escalation as a decimal (0.03 = 3%) */
  escalationPct: number | null;
  reimbursementType: string;
  renewalOptions: string;
  freeRentMonths: number | null;
  notes: string;
  /** true when the space carries no tenant and no rent — a vacancy, not a lease */
  vacant: boolean;
}

export type CanonicalKey =
  | "suite"
  | "tenant"
  | "sf"
  | "leaseStart"
  | "leaseExpiry"
  | "baseRentAnnual"
  | "rentPsf"
  | "rentBasis"
  | "escalationPct"
  | "reimbursementType"
  | "renewalOptions"
  | "freeRentMonths"
  | "notes";

export type FieldType = "text" | "number" | "money" | "date" | "percent" | "basis";

export interface CanonicalField {
  key: CanonicalKey;
  label: string;
  type: FieldType;
  /** true when the analytics can't run without it */
  required: boolean;
  /**
   * Header spellings seen in the wild, normalized (lowercase, punctuation
   * stripped). Order doesn't matter — the mapper scores all of them.
   */
  aliases: string[];
  /** a monthly figure in this column gets annualized on import */
  monthlyAliases?: string[];
  help: string;
}

export const CANONICAL_FIELDS: CanonicalField[] = [
  {
    key: "suite",
    label: "Suite / unit",
    type: "text",
    required: false,
    aliases: [
      "suite", "suite no", "suite number", "unit", "unit no", "unit number", "space",
      "space id", "space no", "premises", "apt", "apartment", "bay", "store", "suite id",
    ],
    help: "The space identifier. Duplicates are flagged on import.",
  },
  {
    key: "tenant",
    label: "Tenant",
    type: "text",
    required: true,
    aliases: [
      "tenant", "tenant name", "lessee", "occupant", "resident", "resident name",
      "tenant trade name", "dba", "company", "name",
    ],
    help: "Blank, 'VACANT' or 'AVAILABLE' marks the space as vacant.",
  },
  {
    key: "sf",
    label: "Square feet",
    type: "number",
    required: true,
    aliases: [
      "sf", "rsf", "nra", "gla", "square feet", "square footage", "sq ft", "sqft",
      "rentable sf", "rentable area", "rentable square feet", "leased sf", "area",
      "size", "net rentable area", "occupied sf", "usable sf",
    ],
    help: "Rentable area for the space. The sum is checked against building NRA.",
  },
  {
    key: "leaseStart",
    label: "Lease start",
    type: "date",
    required: false,
    aliases: [
      "lease start", "start", "start date", "commencement", "commencement date",
      "lease from", "begin", "term start", "move in", "move in date", "from",
    ],
    help: "Used to sanity-check expiries and to price escalations.",
  },
  {
    key: "leaseExpiry",
    label: "Lease expiry",
    type: "date",
    required: true,
    aliases: [
      "lease expiry", "lease expiration", "expiration", "expiration date", "expiry",
      "expires", "lease end", "end date", "term end", "lease to", "to", "exp", "exp date",
      "maturity",
    ],
    help: "Drives WALT and the rollover schedule. A blank on occupied space is flagged.",
  },
  {
    key: "baseRentAnnual",
    label: "Base rent (annual)",
    type: "money",
    required: false,
    aliases: [
      "annual rent", "base rent annual", "annual base rent", "rent annual",
      "yearly rent", "annual contract rent", "base rent", "rent", "contract rent",
      "current rent", "in place rent", "scheduled rent",
    ],
    monthlyAliases: [
      "monthly rent", "base rent monthly", "monthly base rent", "rent monthly",
      "rent per month", "monthly contract rent", "current monthly rent", "mo rent",
    ],
    help: "Monthly columns are recognised by their header and annualized on import.",
  },
  {
    key: "rentPsf",
    label: "Rent $/SF",
    type: "number",
    required: false,
    aliases: [
      "rent psf", "psf", "rent per sf", "annual rent psf", "rate psf", "rate",
      "base rent psf", "annual psf", "rent sf", "per sf", "rent rate",
    ],
    monthlyAliases: ["monthly psf", "psf month", "rent psf month", "monthly rate psf"],
    help: "Derived from rent ÷ SF when the file doesn't state it.",
  },
  {
    key: "rentBasis",
    label: "Lease basis",
    type: "basis",
    required: false,
    aliases: [
      "basis", "rent basis", "lease type", "lease basis", "type", "structure",
      "expense structure", "nnn", "service type",
    ],
    help: "NNN, MG or FSG. Mixing bases in one mark-to-market is flagged.",
  },
  {
    key: "escalationPct",
    label: "Escalation %",
    type: "percent",
    required: false,
    aliases: [
      "escalation", "escalations", "escalation pct", "annual increase", "increase",
      "bump", "bumps", "annual escalation", "rent escalation", "growth",
    ],
    help: "Annual contractual bump, as a percent.",
  },
  {
    key: "reimbursementType",
    label: "Reimbursements",
    type: "text",
    required: false,
    aliases: [
      "reimbursement", "reimbursements", "reimbursement type", "recovery",
      "recoveries", "cam", "expense recovery", "opex recovery", "nnn recovery",
    ],
    help: "How the tenant reimburses operating expenses.",
  },
  {
    key: "renewalOptions",
    label: "Renewal options",
    type: "text",
    required: false,
    aliases: [
      "renewal options", "options", "option", "renewal", "renewals",
      "extension options", "option to renew",
    ],
    help: "Free text — shown alongside the rollover schedule.",
  },
  {
    key: "freeRentMonths",
    label: "Free rent (months)",
    type: "number",
    required: false,
    aliases: [
      "free rent", "free rent months", "abatement", "abated months", "concession",
      "concessions", "rent abatement",
    ],
    help: "Remaining abatement, in months.",
  },
  {
    key: "notes",
    label: "Notes",
    type: "text",
    required: false,
    aliases: ["notes", "comments", "remarks", "note", "comment"],
    help: "Carried through to the export untouched.",
  },
];

export const FIELD_BY_KEY: Record<CanonicalKey, CanonicalField> = Object.fromEntries(
  CANONICAL_FIELDS.map((f) => [f.key, f]),
) as Record<CanonicalKey, CanonicalField>;

/** Words that mark a row as a vacancy rather than a lease. */
export const VACANT_MARKERS = [
  "vacant",
  "vacancy",
  "available",
  "avail",
  "unoccupied",
  "empty",
  "spec suite",
  "-",
  "n/a",
];

/**
 * The words a TOTAL / subtotal / average line is labelled with — summing a
 * file that includes its own totals doubles the building. A word alone does
 * not make a totals line: "Total Wine & More" and "Sum Kitchen" are tenants.
 * lib/rentroll/parse `isTotalsLabel` reads a label as a totals line only where
 * every other word in it names what is totalled (TOTAL_QUALIFIERS).
 */
export const TOTAL_WORDS: ReadonlySet<string> = new Set([
  "total",
  "totals",
  "subtotal",
  "subtotals",
  "sum",
  "sums",
  "average",
  "averages",
  "avg",
  "mean",
]);

/** Words that say WHAT a totals line totals ("Grand Total", "Total Occupied
 *  SF", "Vacant Total", "Total Rentable Area", "Building Total"). A label's
 *  other words must all be these (or a number, or a building's letter) for it
 *  to read as a totals line. */
export const TOTAL_QUALIFIERS: ReadonlySet<string> = new Set([
  "grand", "sub", "weighted", "wtd", "overall", "combined", "all", "the", "and",
  "building", "buildings", "bldg", "property", "properties", "portfolio", "project",
  "center", "centre", "park", "site", "phase", "campus", "roll",
  "occupied", "vacant", "leased", "unleased", "available",
  "net", "gross", "rentable", "usable", "current", "in", "place",
  "sf", "rsf", "gla", "nra", "sq", "ft", "square", "feet", "footage", "area",
  "rent", "rents", "rental", "income", "revenue", "base", "contract",
  "annual", "annualized", "monthly", "psf", "per", "rate", "rates",
  "units", "unit", "suites", "suite", "tenants", "tenant", "leases", "lease",
  "spaces", "space", "expiring",
]);
