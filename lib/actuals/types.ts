// Property actuals (Feature 1): the shared shapes for rent roll + T-12
// ingestion. The `extraction` shapes are what the LLM returns (raw rows + page
// refs, no derived math); the `summary` shapes are what the deterministic
// analytics in ./analyze produce. Both are stored on the deal and rendered in
// the PROPERTY ACTUALS card.

// ---- Rent roll -------------------------------------------------------------

/** One row of the rent roll as extracted — never computed. */
export interface RentRollRow {
  /** tenant name (commercial) or unit label (multifamily); "" if unknown */
  tenant: string;
  suiteUnit: string;
  /** rentable SF for the unit, null if not stated */
  sf: number | null;
  /** lease expiry as ISO yyyy-mm-dd, "" if vacant / not stated */
  leaseExpiry: string;
  /** in-place rent, total $/month for the unit, null if vacant / not stated */
  inPlaceRentMonthly: number | null;
  /** annual $/SF if the roll states it, else null (derived downstream) */
  rentPsf: number | null;
  /** true when the unit is leased; false for a vacant/down unit */
  occupied: boolean;
  freeRentMonths: number | null;
  tiPsf: number | null;
  /** OM/rent-roll page the row was read from, e.g. "p. 4" ("" if unknown) */
  page: string;
}

export interface RentRollExtraction {
  /** the roll's "as of" date, ISO yyyy-mm-dd ("" if not stated) */
  asOfDate: string;
  rows: RentRollRow[];
  /** true when the roll had more rows than were captured */
  truncated: boolean;
  page: string;
}

/** % of occupied SF expiring in each window (each 0..1). */
export interface ExpiryBuckets {
  next12mo: number;
  y1to3: number;
  y3to5: number;
  y5plus: number;
}

/** The consolidated rent-roll analytics — all derived deterministically. */
export interface RentRollSummary {
  unitCount: number;
  occupiedUnits: number;
  totalSf: number;
  occupiedSf: number;
  /** occupiedSf / totalSf, null when no SF is known */
  sfWeightedOccupancy: number | null;
  /** SF-weighted average years to lease expiry (occupied units), null if none */
  waltYears: number | null;
  /** SF-weighted in-place rent PSF (occupied units), null if not derivable */
  weightedAvgRentPsf: number | null;
  /** buckets over the occupied SF that carried an expiry date, null if none */
  expiryBuckets: ExpiryBuckets | null;
  /** occupied SF that actually carried an expiry date (the buckets' basis) */
  expiryCoveredSf: number;
  truncated: boolean;
}

// ---- T-12 operating statement ---------------------------------------------

export interface T12OpexLine {
  key: string;
  label: string;
  amount: number;
  page: string;
}

export interface T12Extraction {
  /** trailing-12 period-end date, ISO yyyy-mm-dd ("" if not stated) */
  periodEndDate: string;
  collectedRent: number | null;
  vacancyLoss: number | null;
  otherIncome: number | null;
  egi: number | null;
  opex: T12OpexLine[];
  totalOpex: number | null;
  noi: number | null;
  page: string;
}

/** The normalized operating statement — extracted values, with EGI/NOI
 *  reconstructed deterministically when the statement omits the subtotal. */
export interface T12Summary {
  collectedRent: number | null;
  vacancyLoss: number | null;
  otherIncome: number | null;
  egi: number | null;
  opex: T12OpexLine[];
  totalOpex: number | null;
  noi: number | null;
  /** true when noi was reconstructed (egi − opex) rather than stated */
  noiDerived: boolean;
}

// ---- OM-vs-actual NOI comparison ------------------------------------------

export type ActualsSeverity = "in_line" | "material" | "red_flag";

export interface NoiComparison {
  omNoi: number;
  t12Noi: number;
  /** signed (omNoi − t12Noi) / |t12Noi|; positive = OM optimistic vs actual */
  deltaPct: number;
  severity: ActualsSeverity;
  direction: "above" | "below" | "in_line";
}
