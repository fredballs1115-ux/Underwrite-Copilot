/**
 * Which Claude model each analysis step uses — kept in one place so cost and
 * quality are easy to tune without hunting through the codebase.
 *
 * Notes for later:
 *  - Model IDs are exact strings (never add a date suffix).
 *  - These models use *adaptive thinking* — there is no `budget_tokens` knob.
 *  - Opus 4.8 is the most capable; Sonnet 4.6 is cheaper/faster; Haiku 4.5 is
 *    cheapest. We default to Opus everywhere for quality and treat Sonnet as a
 *    cost lever once we've measured real per-deal cost.
 */
export const MODELS = {
  /** Reasoning-heavy steps: challenger, reconciler, market check, verdict. */
  reasoning: "claude-opus-4-8",
  /** Extraction is more mechanical — switch to "claude-sonnet-4-6" to cut cost. */
  extraction: "claude-opus-4-8",
} as const;

/** Output-token caps. Our outputs are compact JSON, so these stay small. */
export const MAX_TOKENS = {
  extraction: 8000,
  analysis: 8000,
  verdict: 4000,
} as const;
