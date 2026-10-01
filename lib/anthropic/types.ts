/**
 * The shape of every analysis step's output. These types are the single
 * contract shared by: the structured-output schema we send to Claude, the
 * background worker that stores results, and the UI that renders them.
 *
 * (camelCase here — in Phase 2 the Claude structured-output schema will use the
 * same field names so results map straight onto these types with no renaming.)
 */

/** The asset class a deal is filed under — a key of `ASSET_CLASS_LABEL`
 *  (`lib/asset-class`), or "auto" for a deal the extraction is to read.
 *  The words each one is spoken in are `lib/asset-words`. */
export type AssetClass =
  | "auto"
  | "multifamily"
  | "office"
  | "industrial"
  | "retail"
  | "net_lease"
  | "medical_office"
  | "mixed_use"
  | "sfr_btr"
  | "student_housing"
  | "senior_housing"
  | "manufactured_housing"
  | "self_storage"
  | "hospitality_str"
  | "data_center"
  | "parking"
  | "land_infill";

export type Severity = "high" | "medium" | "low";
export type CompSupport = "supports" | "favorable" | "stretched";
export type ReconDirection = "favorable" | "unfavorable" | "neutral";
export type MarketAssessment = "in-line" | "aggressive" | "conservative";
export type VerdictCall = "pass" | "caution" | "pass_on";

/**
 * Step 0 — First signal. A fast headline read that lands well before the full
 * extraction, so the buyer sees what the deal IS (and whether it's even in
 * their buy box) while the six-stage screen is still running. Superseded by
 * the extraction; every field is "as the OM states it", nothing verified.
 */
export interface FirstSignal {
  dealName: string | null;
  assetClass: string;
  /** submarket + metro, e.g. "North Dallas, TX" ("" if unclear) */
  market: string;
  /** asking price as stated, e.g. "$70,700,000" ("" if unpriced) */
  askPrice: string;
  /** e.g. "312 units" or "182,400 SF" ("" if unclear) */
  size: string;
  /** going-in cap as stated, e.g. "4.9%" ("" if not stated) */
  goingInCap: string;
  /** price per unit or per SF as stated ("" if not derivable) */
  perUnit: string;
  /** one skeptical sentence: what kind of deal this is and the first thing to check */
  take: string;
}

/** Step 1 — Extraction */
export interface ExtractedMetric {
  label: string;
  value: string;
  /** true = the buyer must verify this against the source document */
  flagged: boolean;
  /** OM page where the figure was found, e.g. "p. 12" ("" if unknown) */
  page: string;
  /** in-place reality vs. the sponsor's forward story. Optional for results
   *  saved before this field existed. */
  basis?: "in_place" | "pro_forma" | "na";
  /** ≤10-word verbatim quote of the surrounding OM text, for the source-chip
   *  hover. Optional for extractions saved before citations existed. */
  locatorSnippet?: string;
}
/**
 * What kind of deal the OM describes — the lens every figure is read
 * through. A "stabilized NOI" on a stabilized asset is next year's income;
 * on a conversion it is the finished building's income, years and a
 * construction budget away, and comparable only to total cost.
 */
export type DealStrategyKind =
  | "stabilized"
  | "value_add"
  | "lease_up"
  | "conversion"
  | "development"
  | "unknown";
export interface ExtractedStrategy {
  kind: DealStrategyKind;
  /** one sentence: the plan in the OM's own terms ("" if the OM states none) */
  summary: string;
  /** the renovation / construction budget as stated, hard and soft ("" if none) */
  capitalBudget: string;
  /** construction, downtime and lease-up timing to stabilization as stated ("" if none) */
  timeline: string;
}
/** One property of a portfolio OM, as the extraction states it — every
 *  figure a string, "" when the OM states none for THIS property. Read by
 *  lib/portfolio. */
export interface PortfolioProperty {
  name: string;
  /** street, city, state as the OM prints it */
  address: string;
  /** the count in the OM's own noun, as a bare figure ("128") */
  count: string;
  /** rentable area ("104,000 SF") */
  area: string;
  /** in-place NOI for this property */
  noi: string;
  /** today's occupancy ("94%") */
  occupancy: string;
  yearBuilt: string;
  /** the price the OM allocates to this property */
  allocatedPrice: string;
  /** "p. 12" or "" */
  page: string;
}
export interface ExtractionResult {
  dealName: string | null;
  assetClass: string;
  /** The deal's strategy as the OM states it. Optional for extractions saved
   *  before this existed — lib/deal-strategy infers it from the words then. */
  strategy?: ExtractedStrategy;
  /** Submarket / metro, e.g. "North Dallas, TX" ("" if unclear). Optional for
   *  backward-compatibility with extractions saved before this field existed. */
  market?: string;
  /** Full street address ("" if the OM never states it). Optional for
   *  backward-compatibility. The screen anchors on the address. */
  address?: string;
  /** The OM's total page count, used to validate cited pages: the text
   *  layer's exact count where the screen read the layer, else the model's
   *  own count of the PDF. 0 / absent when unknown or for pre-citation
   *  extractions. */
  totalPages?: number;
  /** How the screen read the memorandum: "text" — its own text layer,
   *  page-tagged — or "pdf" — the PDF itself, where the layer was not dense
   *  enough to stand in for the pages, or was found wanting (no figures, or
   *  no NOI: the tables were pictures) and the pages were read instead.
   *  Recorded with the extraction so Ask reads the memorandum the way the
   *  screen did (lib/anthropic/ask). Absent on an extraction saved before
   *  it was recorded, and on a deal entered by hand. */
  omRead?: "pdf" | "text";
  /** Free-text context typed by the buyer on MANUAL (no-OM) deals — condition,
   *  tenancy, the story. Never set by the OM extraction; rendered as prose,
   *  not a metric, and fed verbatim to the analysis fact sheet. */
  buyerNotes?: string;
  /** Each property of a portfolio OM (two or more separately addressed
   *  buildings or sites), in the OM's order; empty or absent for a
   *  single-property OM and for extractions saved before portfolios were
   *  read. The whole portfolio's figures stay in `metrics`. */
  properties?: PortfolioProperty[];
  /** WHAT IS BEING SOLD (#414): the land and the building outright, a
   *  leasehold on a ground lease, the leased fee under one (#415), a loan
   *  secured by the property, or a share of the owning entity — as the OM
   *  states it. Absent on an extraction saved before it was read, which
   *  reads as fee simple. */
  interest?: ExtractedInterest;
  /** AFFORDABLE HOUSING (#453): the recorded restrictions and rental-
   *  assistance contracts that set some or all of the rents — a LIHTC
   *  regulatory agreement, a Section 8 HAP contract, a bond set-aside, a
   *  tax exemption's covenant — as the OM states them. Absent on an
   *  extraction saved before it was read, and empty (no programs) on a
   *  market-rate deal. Read by lib/affordable. */
  affordable?: ExtractedAffordability;
  /** ONE TENANT LEASES THE WHOLE PROPERTY (#454): a single-tenant net
   *  lease, a build-to-suit, a sale-leaseback, a single-tenant warehouse,
   *  office or clinic — the tenant, its guarantor and the lease's terms as
   *  the OM states them. Absent on an extraction saved before it was read,
   *  and a blank tenant on a multi-tenant or vacant property. Read by
   *  lib/single-tenant. */
  singleTenant?: ExtractedSingleTenant;
  /** WHAT A HOTEL IS SOLD WITH (#455): its flag, its franchise, its
   *  management and whether the sale is encumbered by them, and the brand's
   *  property improvement plan — as the OM states them. Absent on an
   *  extraction saved before it was read, and blank on anything but a
   *  hotel. Read by lib/hotel-deal. */
  hotel?: ExtractedHotel;
  /** HOW THE PROPERTY IS SOLD (#456): a negotiated sale, an auction, a
   *  receiver's, a bankruptcy's or a lender's (REO) — with its terms and
   *  the condition it is sold in, as the OM states them. Absent on an
   *  extraction saved before it was read. Read by lib/sale-terms. */
  sale?: ExtractedSale;
  /** THE MAJOR TENANTS OF A MULTI-TENANT PROPERTY (#457) — an office, a
   *  shopping center, a multi-tenant industrial park, a medical office
   *  building — as its tenant summary lists them, each with what the OM
   *  states for THAT tenant. Empty on a single-tenant property (read by
   *  `singleTenant`), on housing, a hotel, storage and land. Absent on an
   *  extraction saved before it was read. Read by lib/tenant-roster. */
  tenants?: ExtractedTenant[];
  /** THE LISTING TEAM (#467): the brokers the OM names to contact, as its
   *  cover or contacts page prints them. Empty where it names no one, and
   *  absent on an extraction saved before it was read. Read by
   *  lib/offering. */
  listingTeam?: ExtractedBroker[];
  metrics: ExtractedMetric[];
}

/** One broker of the listing team, as the OM prints them (#467) — every
 *  field a string, "" where it prints none. Never looked up. */
export interface ExtractedBroker {
  name: string;
  /** "Executive Vice President" */
  title: string;
  /** the brokerage */
  firm: string;
  /** the direct line or mobile as printed */
  phone: string;
  email: string;
  page: string;
}

/** One tenant of a multi-tenant property, as the OM lists it (#457) —
 *  every field a string, "" where it states none. */
export interface ExtractedTenant {
  /** the tenant as the OM names it */
  name: string;
  /** "anchor" (an anchor or junior anchor the property is built around),
   *  "inline" (a shop or suite tenant), "outparcel" (a pad or outparcel
   *  building) or "other" */
  role: "anchor" | "inline" | "outparcel" | "other";
  /** whether its space is part of what is sold: "no" is an anchor the OM
   *  says is not part of the offering — it owns its store or leases its
   *  own parcel (a shadow anchor) */
  inSale: "yes" | "no" | "unknown";
  /** its leased area as stated ("58,000 SF") */
  sf: string;
  /** its rent as stated — the year's ("$725,000"), a figure a foot
   *  ("$12.50/SF") or a month's */
  rent: string;
  /** its lease's current term end exactly as written — never a date that
   *  assumes a renewal option is exercised; "Month-to-month" where so */
  leaseExpiration: string;
  /** its renewal options as stated */
  options: string;
  /** the first date it may end its lease early, exactly as written */
  earlyTermination: string;
  /** rights it holds that reach the owner or the other tenants, exactly as
   *  stated — a co-tenancy right, a right to go dark, a kick-out, an
   *  exclusive, a radius restriction, a right of first refusal */
  rights: string;
  /** the OM's page for the tenant */
  page: string;
}

/** How a property is sold (#456). */
export type SaleMethod = "negotiated" | "auction" | "receivership" | "bankruptcy" | "reo" | "unknown";

/** The sale as the OM states it — every field a string, "" where it
 *  states none. The auction's figures (the starting bid, the reserve, the
 *  buyer's premium, the bid deadline, a stalking-horse bid) are rows. */
export interface ExtractedSale {
  method: SaleMethod;
  /** the sale's terms as stated — the platform or court, the deposit, the
   *  closing period, the contingencies, the bid procedures */
  terms: string;
  /** the condition it is sold in as stated — "as-is, where-is", no
   *  representations or warranties */
  condition: string;
  /** the OM's page for the sale */
  page: string;
}

/** What a hotel's sale is subject to (#455): free of its brand and its
 *  manager, or encumbered by either or both. */
export type HotelEncumbrance = "unencumbered" | "brand" | "management" | "brand_and_management" | "unknown";

/** A hotel's contracts, as the OM states them — every field a string, ""
 *  where it states none. The figures (the PIP, the agreements' ends, ADR,
 *  RevPAR, the index, the FF&E reserve) are rows of their own. */
export interface ExtractedHotel {
  /** the flag as the OM names it ("Courtyard by Marriott"), or
   *  "Independent" where it says the hotel carries none */
  brand: string;
  /** the franchise or license agreement as stated — its term, its end,
   *  whether it transfers to the buyer */
  franchise: string;
  /** the management arrangement as stated — brand-managed, a third-party
   *  manager, owner-operated; the agreement's term and how it ends */
  management: string;
  /** what the sale is subject to */
  encumbrance: HotelEncumbrance;
  /** the brand's property improvement plan as stated — the renovation it
   *  requires on the change of ownership, its cost and timing */
  pip: string;
  /** the OM's page for them */
  page: string;
}

/** The one lease a single-tenant property is (#454), as the OM states it —
 *  every field a string, "" where it states none. The lease's figures (its
 *  end, the years left, the options, the increases, the rent, the rating)
 *  are rows of their own in `metrics`. */
export interface ExtractedSingleTenant {
  /** the tenant as the OM names it; "" on a multi-tenant or vacant
   *  property */
  tenant: string;
  /** who guarantees the rent, exactly as stated — the parent, a
   *  subsidiary, a franchisee, a person */
  guarantor: string;
  /** the lease type as stated: "Absolute NNN", "NNN", "NN" */
  leaseType: string;
  /** what the landlord pays or repairs, exactly as stated — the roof, the
   *  structure, the parking, HVAC replacement */
  landlordObligations: string;
  /** rights the tenant holds that reach the owner, exactly as stated — an
   *  early termination, a right of first refusal or offer on a sale, a
   *  purchase option, a right to go dark */
  tenantRights: string;
  /** the OM's page for the lease */
  page: string;
}

/** A restriction or contract that sets rents (#453): Section 42 housing tax
 *  credits, a Section 8 project-based HAP contract, a tax-exempt bond's
 *  set-aside, restricted units in exchange for a property-tax exemption (a
 *  PFC or HFC, 421-a, a PILOT), the zoning's inclusionary units, or any
 *  other recorded covenant (HOME, a state trust fund, Section 515). */
export type AffordableProgram = "lihtc" | "section8" | "bond" | "tax_exemption" | "inclusionary" | "other";

/** One income tier of the unit mix, as the OM states it — every figure a
 *  string, "" where it states none for the tier. */
export interface AffordableTierStated {
  /** the tier as the OM labels it: "60% AMI", "30% AMI", "Section 8",
   *  "Market" */
  label: string;
  /** the tier's units, a bare figure ("120") */
  units: string;
  /** the tier's average in-place rent per unit per month ("$1,245") */
  rent: string;
  /** the tier's maximum allowable rent per month, where the OM states one */
  maxRent: string;
}

export interface ExtractedAffordability {
  /** the programs whose restriction or contract binds the property today
   *  or will bind the buyer — never marketing words ("workforce",
   *  "naturally occurring affordable"); empty on a market-rate deal */
  programs: AffordableProgram[];
  /** one sentence, the restriction in the OM's own terms ("" if none) */
  summary: string;
  /** the regulatory agreement(s) as stated — the agency, the set-aside,
   *  the term ("" if none) */
  agreement: string;
  /** the rental-assistance contract as stated — its units, its rents, its
   *  term and renewals ("" if none) */
  assistance: string;
  /** the unit mix by income tier, in the OM's order */
  tiers: AffordableTierStated[];
  /** the OM's page for the restriction ("" if unknown) */
  page: string;
}

export type InterestKind = "fee_simple" | "leasehold" | "leased_fee" | "note" | "partial_interest" | "unknown";

export interface ExtractedInterest {
  kind: InterestKind;
  /** one sentence, the interest in the OM's own terms ("" if it states none) */
  summary: string;
  /** a partial interest's share as stated ("49% limited partnership
   *  interest"); "" otherwise */
  share: string;
  /** a ground lease as stated — the term left, the ground rent, its resets,
   *  any purchase option ("" if the OM states none) */
  groundLease: string;
  /** a note's terms as stated — the unpaid balance, the coupon, the
   *  maturity, whether it is performing ("" otherwise) */
  loan: string;
  /** the OM's page for the interest ("" if unknown) */
  page: string;
}

/** Step 2 — Assumption Challenger */
export interface Challenge {
  assumption: string;
  severity: Severity;
  challenge: string;
  /** the exact question to put to the broker */
  question: string;
  /** OM page of the challenged figure ("" if unknown). Optional pre-cites. */
  page?: string;
}
export interface ChallengerResult {
  challenges: Challenge[];
  stressTest: string;
}

/** Step 3 — Broker-comp scrutiny (the sale & lease comps inside the OM) */
export interface BrokerComp {
  name: string;
  /** price/unit or rent/unit, cap rate, date, size — as available in the OM */
  detail: string;
  support: CompSupport;
  /** how it compares to the subject deal, and how hard it supports it */
  note: string;
  /** OM page the comp appears on ("" if unknown). Optional pre-cites. */
  page?: string;
}
export interface BrokerCompsResult {
  saleComps: BrokerComp[];
  leaseComps: BrokerComp[];
  /** selection-bias and conspicuous-omission concerns */
  redFlags: string[];
  summary: string;
}

/** Step 4 — Reconciler (OM vs. the buyer's own model) */
export interface ReconRow {
  metric: string;
  omValue: string;
  myValue: string;
  gap: string;
  /** direction from the BUYER's perspective */
  direction: ReconDirection;
}
export interface ReconciliationResult {
  rows: ReconRow[];
  takeaway: string;
}

/** Step 5 — Market plausibility check */
export interface MarketCheck {
  assumption: string;
  omSays: string;
  typicalRange: string;
  assessment: MarketAssessment;
  note: string;
  /** OM page of the assumption ("" if unknown). Optional pre-cites. */
  page?: string;
}
export interface MarketResult {
  checks: MarketCheck[];
  summary: string;
  /** The metro's published figures the check was handed, where the deal
   *  sits in a covered market (lib/live-market-brief): the metro, the day
   *  they were read and one dated line a figure — stored with the result
   *  so the page can say what the check read, and absent (or null) on a
   *  deal outside the covered markets or a check run before this existed. */
  liveBrief?: LiveBriefRecord | null;
  /** A portfolio across markets (#413): each OTHER market's own published
   *  figures the check was handed, most properties first — one record a
   *  market, each saying how many of the portfolio's properties sit there.
   *  The national figures ride in `liveBrief` alone. Absent on a single
   *  property, a portfolio in one market, or a check run before this. */
  otherBriefs?: LiveBriefRecord[] | null;
}

export interface LiveBriefRecord {
  /** the covered metro's name — or the state's, for a deal outside the covered metros */
  metro: string;
  /** whose figures these are; absent on a record written before a state
   *  could be read, which is a covered metro's */
  grain?: "metro" | "state";
  readOn: string;
  lines: string[];
  /** the same figures as values (lib/live-market-brief `LiveFigure`), so a
   *  later screen can say what moved since; absent on a record written
   *  before they were stored */
  figures?: LiveBriefFigure[];
  /** a portfolio across markets: how many of its properties sit in THIS
   *  market (`here`) of how many in all (`of`) — absent otherwise */
  portfolio?: { here: number; of: number } | null;
  /** how many of `lines` — the last ones — are the nation's figures (the
   *  debt market, lessor rents, the insurance index, CRE prices), so no
   *  surface calls them the metro's; absent on a record written before */
  national?: number;
  /** where the deal's county alone placed it in this market (#447): "Collin
   *  County, TX" in "Dallas-Fort Worth-Arlington, TX" — every surface that
   *  heads the figures says so; absent where the address named the market */
  placedBy?: { county: string; area: string } | null;
}

export interface LiveBriefFigure {
  key: string;
  label: string;
  value: number;
  unit: "pct" | "pts" | "usd" | "count" | "days" | "rank" | "years";
  asOf: string;
}

/**
 * The pre-model screen: the deal-killer inputs as RANGES (never single hero
 * numbers), each tied to where it came from, plus the three deal-killers
 * stressed in order. This is what makes the verdict reproducible — same deal
 * in, same ranges out — and what "shows the work" before anyone opens a model.
 */
export interface ScreenRange {
  /** e.g. "Market rent / unit / mo", "Expense load", "Exit cap", "Basis / unit" */
  label: string;
  low: string;
  base: string;
  high: string;
  /** where the range comes from — a public/market source or the OM, named explicitly */
  source: string;
  /** one line on what drives the low vs. high end */
  basis: string;
  confidence: Severity;
}
export type DealKillerLever = "basis" | "exit" | "debt";
export interface DealKiller {
  lever: DealKillerLever;
  /** the current read on this lever */
  read: string;
  /** what would break the deal here */
  risk: string;
}
/** How the call moves across the ranges — the honest "where does this flip?" */
export type ScenarioKey = "conservative" | "base" | "sponsor";
export interface VerdictScenario {
  scenario: ScenarioKey;
  /** the resulting call at this end of the range */
  call: VerdictCall;
  /** one line on what drives the call here */
  note: string;
}
export interface ScreenResult {
  ranges: ScreenRange[];
  dealKillers: DealKiller[];
  /** the verdict at the conservative / base / sponsor ends of the range */
  sensitivity: VerdictScenario[];
}

/** Step 6 — Verdict (synthesizes all of the above) */
export interface VerdictResult {
  /** ISO timestamp stamped when this verdict generation landed */
  generatedAt?: string;
  verdict: VerdictCall;
  reason: string;
  topRisks: string[];
  nextSteps: string[];
  /** The pre-model screen. Optional for verdicts saved before this existed. */
  screen?: ScreenResult;
}
