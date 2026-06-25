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
}
export interface ExtractionResult {
  dealName: string | null;
  assetClass: string;
  metrics: ExtractedMetric[];
}

/** Step 2 — Assumption Challenger */
export interface Challenge {
  assumption: string;
  severity: Severity;
  challenge: string;
  /** the exact question to put to the broker */
  question: string;
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
}
export interface MarketResult {
  checks: MarketCheck[];
  summary: string;
}

/** Step 6 — Verdict (synthesizes all of the above) */
export interface VerdictResult {
  verdict: VerdictCall;
  reason: string;
  topRisks: string[];
  nextSteps: string[];
}
