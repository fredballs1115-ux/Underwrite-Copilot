/**
 * The analysis prompts, folded in from the working prototype.
 *
 * What's preserved from the prototype: the analytical substance — exactly what
 * to extract and flag, how an investment committee grills a pro forma, how to
 * scrutinize the broker's comps for cherry-picking, the buyer's-perspective
 * reconciliation, the rules-of-thumb market caveat, and the pass / caution /
 * kill verdict semantics.
 *
 * What's upgraded: in the real app Claude reads the actual OM (a PDF document
 * block) rather than pasted text, and we enforce the JSON output shape with
 * structured outputs (see types.ts) instead of asking the model to "respond
 * ONLY with JSON." That's far more reliable than string-parsing a reply.
 *
 * These are just the instruction strings. The wiring that attaches the PDF and
 * calls Claude lands in Phase 2 (the worker + the analysis functions).
 */

import type { AssetClass } from "./types";

/** Shared persona/guardrails prepended to every analysis call. */
export const ANALYST_SYSTEM = `You are a sharp, skeptical commercial real estate acquisitions analyst helping a buyer screen a deal. You are precise with numbers, you name the specific figure when you critique it, and you never accept a broker's pro forma at face value. When you are uncertain, say so rather than inventing detail.`;

/** A small helper so each step handles "auto-detect" vs. a chosen asset class. */
function assetClassClause(assetClass: AssetClass): string {
  return assetClass === "auto"
    ? "Detect the asset class from the document."
    : `The asset class is ${assetClass}; apply its norms.`;
}

/** Step 1 — Extraction */
export function extractionInstruction(assetClass: AssetClass): string {
  return `Extract the key terms from the attached offering memorandum. ${assetClassClause(
    assetClass,
  )}

Capture: asking price (and per-unit / per-SF if given), NOI (year 1 and stabilized), going-in and pro forma cap rates, occupancy, in-place and pro forma rents, expense ratio, exit cap, IRR, financing (LTV, rate, lender), hold period, seller, and broker. Also capture the property / deal name if present.

For each figure, set \`flagged\` to true if it is a number the buyer must independently verify against source documents rather than trust the OM on — anything forward-looking, sponsor-projected, or easily inflated (pro forma rents, stabilized NOI, projected growth, exit cap, IRR). Set it false for hard, present-day facts.`;
}

/** Step 2 — Assumption Challenger */
export function challengerInstruction(assetClass: AssetClass): string {
  return `Challenge the optimistic assumptions in the attached offering memorandum the way a skeptical investment committee would grill a junior analyst. ${assetClassClause(
    assetClass,
  )}

Focus on: exit cap vs. going-in cap (compression is a red flag), pro forma rent growth vs. realistic market growth, thin or understated expense ratios, vacancy and lease-up optimism, real-estate taxes held flat despite reassessment on sale, renovation / value-add premium claims, and financing assumptions that may not hold at current rates.

Give 3–6 challenges, most severe first. For each, give a specific, numerate critique and the exact question to put to the broker. Then give a one-paragraph stress test: what happens to returns if the one or two most aggressive assumptions revert to market.`;
}

/** Step 3 — Broker-comp scrutiny (the sale & lease comps inside the OM) */
export function brokerCompsInstruction(): string {
  return `Scrutinize the comparable sales and lease comps the broker included in the attached offering memorandum. These come from the OM itself — do NOT use any outside data source. Brokers cherry-pick comps to justify pricing; your job is to extract every comp shown, judge how well each actually supports the subject deal's pricing and rents, and flag the cherry-picking.

Extract both sale comps and lease comps if present. For each comp, compare it to the subject property and rate it: \`supports\` (genuinely backs the broker's numbers), \`favorable\` (leans the broker's way), or \`stretched\` (doesn't really support the deal). Also identify what's conspicuously missing — recent weaker trades omitted, only the best submarkets shown, or stale comps used because recent ones are unfavorable.

If the OM contains no comps at all, say so clearly in the summary and return empty comp lists. Finish with a one-sentence verdict: do the broker's comps actually justify the pricing, or are they stretched?`;
}

/** Step 4 — Reconciler (OM vs. the buyer's own model) */
export function reconcilerInstruction(): string {
  return `Compare the broker's offering memorandum against the buyer's own underwriting (their ARGUS export or Excel model, provided separately). Find every meaningful discrepancy and explain what it means for the deal.

For each row, give the metric, the OM's value, the buyer's value, and a plain-language description of the gap. Set \`direction\` from the BUYER's perspective: \`unfavorable\` means the buyer's model is worse than the OM claims, \`favorable\` means better, \`neutral\` means immaterial.

Finish with a one-sentence takeaway: does the buyer's model support or undercut the OM's story?`;
}

/** Step 5 — Market plausibility check */
export function marketCheckInstruction(assetClass: AssetClass): string {
  return `Sanity-check the offering memorandum's key assumptions against general market norms for the asset class and submarket. ${assetClassClause(
    assetClass,
  )}

You do NOT have a live comps feed — reason from typical ranges and explicitly flag anything that looks off-market. For each assumption, give what the OM says, a typical range, an assessment (\`in-line\`, \`aggressive\`, or \`conservative\`), and short reasoning. Finish with a one-sentence overall plausibility summary.

Be clear throughout that these are rules-of-thumb, not pulled comps, and must be verified against real market data.`;
}

/** Step 6 — Verdict (synthesizes everything above) */
export function verdictInstruction(): string {
  return `You are the head of acquisitions making a first-pass screen decision. Using the gathered analysis provided below — the extracted terms, the challenges and stress test, the broker-comp scrutiny, the reconciliation against the buyer's model, and the market plausibility check — give a clear go / no-go for spending more time on this deal.

Choose a verdict: \`pass\` (worth deeper work), \`caution\` (proceed only with named conditions), or \`pass_on\` (kill it). Give a two-sentence rationale, the top risks, and — if pursuing — the 2–3 concrete next steps.

This is a first-pass screen, not investment advice.`;
}
