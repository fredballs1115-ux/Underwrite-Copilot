/**
 * Which Claude model each analysis step uses — kept in one place so cost and
 * quality are easy to tune without hunting through the codebase.
 *
 * Notes for later:
 *  - Model IDs are exact strings (never add a date suffix).
 *  - Thinking is OFF as these calls are made. None sends a `thinking`
 *    field, and on the model in use (Claude Opus 4.8) no `thinking` field
 *    means thinking off — Anthropic's thinking documentation tabulates each
 *    model's default; where thinking is wanted on these models it is
 *    adaptive (`thinking: { type: "adaptive" }`), and a `budget_tokens`
 *    setting is refused. On the newer models a lever below could move a
 *    step to — Claude Opus 5 and Claude Sonnet 5 among them — no `thinking`
 *    field means adaptive thinking, ON, and `max_tokens` caps the thinking
 *    and the answer together. `MAX_TOKENS` below is sized for the answers
 *    alone, so a step moved to such a model needs its cap reviewed, or an
 *    explicit thinking setting sent, first.
 *  - We default to the flagship everywhere for quality.
 *
 * WHAT A SCREEN COSTS. Each run writes its ledger to the job row
 * (`analysis_jobs.usage`, migration 0035) and one log line — read those,
 * not this comment, for the number. The shape of the bill, for a deck the
 * model reads as ~300k tokens of PDF: five steps read the OM — the first
 * signal, the extraction, the challenger, the comps and the market check —
 * each sending it as the first block after the system prompt with a cache
 * breakpoint on it; the verdict never reads the deck at all; and the
 * outputs are compact.
 *
 * WHETHER ONE STEP READS ANOTHER'S CACHE IS NOT ESTABLISHED. Each step also
 * sends its own structured-output format (`output_config.format`, a schema
 * a step), and Anthropic's structured-outputs documentation says the API
 * adds a system prompt describing that format and that changing the format
 * invalidates the prompt cache — so each step may write the deck to a cache
 * of its own rather than read back the first signal's. A real screen's
 * ledger settles it, call by call: a `cacheRead` about the size of the deck
 * is a step that read an earlier one's cache, a `cacheWrite` about the size
 * of the deck is a step that wrote its own. The two bills are far apart —
 * one write and four reads put the deck at about 1.65 times its input price
 * a screen (1.25 + 4 × 0.1), five writes at about 6.25 times — so no figure
 * for a screen is believed before the ledger is read.
 *
 * COST LEVERS, in the order to pull them:
 *  1. Prompt caching is marked: the OM document block carries
 *     `cache_control`. A request reads a cache only where everything before
 *     its breakpoint matches an earlier request's — the system prompt, the
 *     format the API adds for structured outputs, and the document — and
 *     only inside the cache window. The same step sent again (a retry, a
 *     resumed run, a second question asked of the deck) matches its own
 *     earlier request; whether two different steps match is the ledger's to
 *     say (above). A worker that pauses past the window pays a fresh write.
 *  2. The cache is PER MODEL. Where the ledger shows the steps reading one
 *     cache, splitting the extraction onto a cheaper model while the
 *     judgement stays on the flagship writes the deck to two caches — it
 *     costs MORE, not less: move the OM-reading steps together,
 *     `MODEL_EXTRACTION` and `MODEL_REASONING` to the same id. The one step
 *     that can differ for free is the verdict (`MODEL_VERDICT`), which
 *     reads the gathered results, never the deck.
 *  3. The mid tier at its list price in the table below ($2 in / $10 out per million
 *     against the flagship's $5 / $25) bills the same tokens at two fifths
 *     of the flagship's price — near-flagship quality on this kind of read,
 *     but it changes the product; judge a few screens against their saved
 *     verdicts first. It thinks by default where the flagship does not (the
 *     note on thinking above): review the caps before the switch.
 *  4. Fewer tokens per deck — ON by default: the OM goes as its own text
 *     layer, page-tagged, whenever that layer is dense enough to stand in
 *     for the pages (`lib/pdf-text.ts`, `omSourceFor` with `textFirst`),
 *     a third to a quarter of the PDF's token count on every step at once.
 *     A scan or a picture-heavy deck still goes as PDF. `OM_READ=pdf`
 *     forces the pages for every deck; the ledger shows the difference.
 *     That is the lever that keeps the flagship.
 *
 * The model overrides are read once at boot from the environment, so a
 * Render env-var change plus a redeploy is the whole experiment — no code
 * change. `OM_READ` is read per call.
 */

const FLAGSHIP = "claude-opus-4-8";

/**
 * The month the price table below was read from the published list prices,
 * as an ISO month. List prices move and the table does not move with them,
 * so a dollar figure it turns the ledger into says when its prices were read
 * (the operator's cost card: "list prices as of Sep 2026"). Change it with
 * the table.
 */
export const PRICES_AS_OF = "2026-09";

/**
 * List prices per million tokens, by model-id prefix, as published when
 * this table was written (`PRICES_AS_OF`). The ledger's token meters are the
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

/** Output-token caps. Our outputs are compact JSON, so these stay small —
 *  sized for the answer alone, with thinking off as these calls are made
 *  (the note above). On a model that thinks by default the thinking counts
 *  against the same cap. */
export const MAX_TOKENS = {
  // A portfolio lists every property (up to 150, lib/anthropic/prompts). At
  // an estimated ~65 tokens a property, a tape of 75-odd homes would run
  // past 8,000, and a cut-off fails the whole screen. The cap bounds the
  // answer; only the tokens written are billed.
  extraction: 16000,
  analysis: 8000,
  verdict: 4000,
  // The model reconciliation emits a large audit (every metric + sources +
  // numeric inputs), so it gets more room.
  model: 16000,
} as const;
