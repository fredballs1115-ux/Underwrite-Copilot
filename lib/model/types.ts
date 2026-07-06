import type { ModelInputs, CashFlowYear, ModelReturns } from "./compute";

export type Confidence = "high" | "medium" | "low";

/** One source's claim for a metric, with where it came from and what kind it is. */
export interface ModelSourceRef {
  doc: string; // e.g. "Rent roll", "OM", "T-12"
  value: string; // value as found in that document
  locator: string; // page / sheet / cell, "" if unknown
  basis: string; // "actual" | "pro forma" | "term sheet" | "appraisal" | ...
}

/** A metric after cross-source reconciliation — the audit trail + the choice. */
export interface ReconciledMetric {
  key: string; // canonical key, e.g. "occupancy"
  label: string; // "In-place occupancy"
  chosenValue: string; // the value carried into the model
  unit: string; // "%", "$/unit/mo", "$", "x", "units", ...
  sources: ModelSourceRef[];
  authority: string; // which document won, e.g. "Rent roll"
  rationale: string; // why it won
  confidence: Confidence;
  isConflict: boolean; // true when sources materially disagreed
}

/** A fact pulled from a single document during per-doc extraction. */
export interface DocFact {
  key: string;
  label: string;
  value: string;
  numeric: number | null;
  unit: string;
  locator: string;
  basis: string;
}
export interface DocFacts {
  docName: string;
  kind: string;
  facts: DocFact[];
}

/** The full first-draft model stored on the deal. */
export interface UnderwritingModel {
  generatedFrom: string[]; // document names used
  holdYears: number;
  metrics: ReconciledMetric[]; // sourced assumptions + reconciliation audit
  conflicts: ReconciledMetric[]; // subset where isConflict === true
  inputs: ModelInputs; // numeric inputs the math used
  cashFlow: CashFlowYear[];
  returns: ModelReturns;
  summary: string;
  caveats: string[];
}
