/**
 * Which Claude model each analysis step uses — kept in one place so cost and
 * quality are easy to tune without hunting through the codebase.
 *
 * Notes for later:
 *  - Model IDs are exact strings (never add a date suffix).
 *  - These models use *adaptive thinking* — there is no `budget_tokens` knob.
 *  - The flagship tier is the most capable; the mid tier is roughly 40% of its
 *    price per token and plenty for mechanical reads; the small tier is
 *    cheapest. We default to the flagship everywhere for quality.
 *
 * COST LEVERS, in the order to pull them:
 *  1. Prompt caching is already on: the OM document block carries
 *     `cache_control`, so the first signal writes the cache and extraction,
 *     challenger, comps and market read it back at a tenth of the input price.
 *     That only holds while the steps run back-to-back inside the cache
 *     window — a worker that pauses between steps pays for a fresh read.
 *  2. `MODEL_EXTRACTION` — the first signal and the extraction are look-up
 *     work (read the deck, fill a schema). They carry the one uncached full
 *     read of the PDF, so they are where a cheaper tier saves the most, with
 *     the least quality at stake. Set the env var to the mid-tier id to try it.
 *  3. `MODEL_REASONING` — the challenger, market check, reconciler and
 *     verdict are the judgement. Cheaper here changes the product; measure
 *     against saved verdicts before deciding.
 *
 * Both overrides are read once at boot from the environment, so a Render
 * env-var change plus a redeploy is the whole experiment — no code change.
 */

const FLAGSHIP = "claude-opus-4-8";

/** A model id from the environment, or the default. Blank counts as unset. */
function modelFromEnv(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v ? v : fallback;
}

export const MODELS = {
  /** Reasoning-heavy steps: challenger, reconciler, market check, verdict. */
  reasoning: modelFromEnv("MODEL_REASONING", FLAGSHIP),
  /** Extraction and the first signal — the mechanical reads of the OM. */
  extraction: modelFromEnv("MODEL_EXTRACTION", FLAGSHIP),
};

/** Output-token caps. Our outputs are compact JSON, so these stay small. */
export const MAX_TOKENS = {
  extraction: 8000,
  analysis: 8000,
  verdict: 4000,
  // The model reconciliation emits a large audit (every metric + sources +
  // numeric inputs), so it gets more room.
  model: 16000,
} as const;
