/**
 * Shared shapes/helpers for "deals" (one screened OM). Kept here so the deals
 * list, the single-deal view, and (later) the worker all agree.
 */

export interface DealRow {
  id: string;
  name: string;
  asset_class: string;
  om_storage_path: string | null;
  // User-entered property address (StructuredAddress). Migration 0011.
  address?: unknown;
  // The fast headline read that lands ~30s into a run (FirstSignal).
  // Migration 0009; null on rows screened before it existed.
  first_signal?: unknown;
  // Snapshot of the previous run's extraction + verdict (PriorScreen),
  // written by the pipeline at the start of every re-screen. Migration 0010.
  prior_screen?: unknown;
  // Per-step results (filled in by the analysis pipeline in Phase 2).
  extraction: unknown;
  challenges: unknown;
  comps: unknown;
  reconciliation: unknown;
  market: unknown;
  verdict: unknown;
  // User-added data per section (notes + uploaded files). See migration 0002.
  supplements: unknown;
  // Generated first-draft underwriting model (UnderwritingModel). Migration 0003.
  model: unknown;
  // Public-web comp search results (unverified fallback). Migration 0004.
  comp_search: unknown;
  created_at: string;
  updated_at: string;
}

/** The six analysis steps, in order, keyed to the columns on `deals`. */
export const DEAL_STEPS = [
  { key: "extraction", label: "Extract & flag" },
  { key: "challenges", label: "Challenge the assumptions" },
  { key: "comps", label: "Scrutinize the broker comps" },
  { key: "reconciliation", label: "Reconcile your model" },
  { key: "market", label: "Market check" },
  { key: "verdict", label: "Verdict" },
] as const satisfies ReadonlyArray<{ key: keyof DealRow; label: string }>;
