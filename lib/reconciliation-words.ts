// Whose model a reconciliation sets the OM against, said one way on every
// surface that prints one: the deal page's Reconciler tab, its risk digest,
// the homepage's walkthrough, /demo and the full report.
//
// The reconciler (lib/anthropic/pipeline `runReconciliation`) reads a model
// the reader uploaded, so its rows are "your model". The sample's rows are
// the first-draft model's, built from its documents (lib/sample-deal), and
// its result says so (`against: "first_draft"`): an investor walking the
// sample read "your model vs. the OM" over a model nobody had uploaded.
//
// Type-only import: client-safe.
import type { ReconciliationResult } from "@/lib/anthropic/types";

export interface ReconciledAgainst {
  /** in a sentence: "your model" / "the first-draft model" */
  name: string;
  /** a column's or a label's head: "Your model" / "First-draft model" */
  label: string;
}

const YOURS: ReconciledAgainst = { name: "your model", label: "Your model" };
const FIRST_DRAFT: ReconciledAgainst = { name: "the first-draft model", label: "First-draft model" };

/** Whose model the result's rows are. */
export function reconciledAgainst(result: Pick<ReconciliationResult, "against"> | null | undefined): ReconciledAgainst {
  return result?.against === "first_draft" ? FIRST_DRAFT : YOURS;
}

/** The section's heading: "Reconciliation — your model vs. the OM". */
export function reconciliationHeading(result: Pick<ReconciliationResult, "against"> | null | undefined): string {
  return `Reconciliation — ${reconciledAgainst(result).name} vs. the OM`;
}
