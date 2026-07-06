/**
 * The shape of every analysis step's output. These types are the single
 * contract shared by: the structured-output schema we send to Claude, the
 * background worker that stores results, and the UI that renders them.
 *
 * (camelCase here — in Phase 2 the Claude structured-output schema will use the
 * same field names so results map straight onto these types with no renaming.)
 */

export type AssetClass =
  | "auto"
  | "multifamily"
  | "office"
  | "industrial"
  | "retail";

export type Severity = "high" | "medium" | "low";
export type CompSupport = "supports" | "favorable" | "stretched";
export type ReconDirection = "favorable" | "unfavorable" | "neutral";
export type MarketAssessment = "in-line" | "aggressive" | "conservative";
export type VerdictCall = "pass" | "caution" | "pass_on";

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
}
export interface ExtractionResult {
  dealName: string | null;
  assetClass: string;
  /** Submarket / metro, e.g. "North Dallas, TX" ("" if unclear). Optional for
   *  backward-compatibility with extractions saved before this field existed. */
  market?: string;
  /** Full street address ("" if the OM never states it). Optional for
   *  backward-compatibility. The screen anchors on the address. */
  address?: string;
  metrics: ExtractedMetric[];
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
  /** how it compares to the subject deal, and whether it's cherry-picked */
  note: string;
  /** OM page the comp appears on ("" if unknown). Optional pre-cites. */
  page?: string;
}
export interface BrokerCompsResult {
  saleComps: BrokerComp[];
  leaseComps: BrokerComp[];
  /** cherry-picking and conspicuous-omission concerns */
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
  verdict: VerdictCall;
  reason: string;
  topRisks: string[];
  nextSteps: string[];
  /** The pre-model screen. Optional for verdicts saved before this existed. */
  screen?: ScreenResult;
}
