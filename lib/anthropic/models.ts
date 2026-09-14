/**
 * Which Claude model each analysis step uses — kept in one place so cost and
 * quality are easy to tune without hunting through the codebase.
 *
 * Notes for later:
 *  - Model IDs are exact strings (never add a date suffix).
 *  - These models use *adaptive thinking* — there is no `budget_tokens` knob.
 *  - We default to the flagship everywhere for quality.
 *
 * WHAT A SCREEN COSTS. Each run writes its ledger to the job row
 * (`analysis_jobs.usage`, migration 0035) and one log line — read those,
 * not this comment, for the number. The shape of the bill, for a deck the
 * model reads as ~300k tokens of PDF: the first signal writes the OM to the
 * prompt cache once (the write premium on the whole deck — the largest
 * single item), the extraction, challenger, comps and market check read it
 * back at a tenth, the verdict never reads the deck at all, and the
 * outputs are compact. On the flagship that is about $3 a screen; the
 * cache write is ~60% of it.
 *
 * COST LEVERS, in the order to pull them:
 *  1. Prompt caching is already on: the OM document block carries
 *     `cache_control`. That only holds while the steps run back-to-back
 *     inside the cache window — a worker that pauses between steps pays for
 *     a fresh read, and the ledger shows it as a second cache write.
 *  2. The cache is PER MODEL. Splitting the extraction onto a cheaper model
 *     while the judgement stays on the flagship writes the deck to two
 *     caches — it costs MORE, not less. Move the OM-reading steps together:
 *     `MODEL_EXTRACTION` and `MODEL_REASONING` to the same id. The one step
 *     that can differ for free is the verdict (`MODEL_VERDICT`), which
 *     reads the gathered results, never the deck.
 *  3. The mid tier at its current list price ($2 in / $10 out per million
 *     against the flagship's $5 / $25) puts the same screen near $1.25 —
 *     near-flagship quality on this kind of read, but it changes the
 *     product; judge a few screens against their saved verdicts first.
 *  4. Fewer tokens per deck: a text-first read of the OM (the PDF's own
 *     text layer, page-tagged, with the pages only where the text is
 *     sparse) cuts the deck to a third or a quarter of its PDF token count
 *     on every step at once. That is the lever that keeps the flagship.
 *
 * The overrides are read once at boot from the environment, so a Render
 * env-var change plus a redeploy is the whole experiment — no code change.
 */

const FLAGSHIP = "claude-opus-4-8";

/**
 * List prices per million tokens, by model-id prefix, as published when
 * this table was written (2026-09). The ledger's token meters are the
 * measurement; these turn them into an estimate. A model not listed here
 * is still metered — its dollars show blank until it is added.
 */
export const PRICES: readonly { prefix: string; input: number; output: number }[] = [
  { prefix: "claude-opus-4-8", input: 5, output: 25 },
  { prefix: "claude-opus-5", input: 5, output: 25 },
  { prefix: "claude-sonnet-5", input: 2, output: 10 },
  { prefix: "claude-sonnet-4-6", input: 3, output: 15 },
];
/** A cache write bills at 1.25× the input price (the default 5-minute TTL). */
export const CACHE_WRITE_FACTOR = 1.25;
/** A cache read bills at a tenth of the input price. */
export const CACHE_READ_FACTOR = 0.1;

/** A model id from the environment, or the default. Blank counts as unset. */
function modelFromEnv(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v ? v : fallback;
}

const reasoning = modelFromEnv("MODEL_REASONING", FLAGSHIP);

export const MODELS = {
  /** Reasoning-heavy steps that read the OM: challenger, market check, reconciler. */
  reasoning,
  /** Extraction and the first signal — the mechanical reads of the OM. */
  extraction: modelFromEnv("MODEL_EXTRACTION", FLAGSHIP),
  /** The verdict reads the gathered results, never the deck — so it can
   *  differ from the reasoning model without a second cache write. Follows
   *  the reasoning model unless set. */
  verdict: modelFromEnv("MODEL_VERDICT", reasoning),
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
