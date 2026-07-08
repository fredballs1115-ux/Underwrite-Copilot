/**
 * The analysis prompts, folded in from the working prototype.
 *
 * What's preserved from the prototype: the analytical substance — exactly what
 * to extract and flag, how an investment committee grills a pro forma, how to
 * scrutinize the OM's comp set for selection bias, the buyer's-perspective
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
export const ANALYST_SYSTEM = `You are a sharp, skeptical commercial real estate acquisitions analyst helping a buyer screen a deal. You are precise with numbers, you name the specific figure when you critique it, and you know sell-side assumptions tend to run optimistic, so you verify pro forma figures rather than take them at face value. When you are uncertain, say so rather than inventing detail.`;

/** A small helper so each step handles "auto-detect" vs. a chosen asset class. */
function assetClassClause(assetClass: AssetClass): string {
  return assetClass === "auto"
    ? "Detect the asset class from the document."
    : `The asset class is ${assetClass}; apply its norms.`;
}

/** Step 0 — First signal: the 30-second headline read, before the deep pass. */
export function firstSignalInstruction(assetClass: AssetClass): string {
  return `Give ONLY the headline read of the attached offering memorandum — the 30-second version an analyst gives when a deal first hits their desk. ${assetClassClause(
    assetClass,
  )}

These are look-up facts from the OM's summary pages — answer immediately, no deep analysis: the property/deal name, the asset class, the \`market\` (submarket + metro, like "North Dallas, TX"), the asking price exactly as stated (empty string if the OM is unpriced), the size ("312 units" or "182,400 SF"), the going-in cap rate as stated, and the price per unit or per SF as stated. Use an empty string for anything the summary doesn't give — do NOT compute or estimate figures the OM doesn't state.

Then \`take\`: ONE skeptical sentence — what kind of deal this is and the first thing worth checking. The full six-stage screen runs next; this is just the instant signal.`;
}

/** Step 1 — Extraction */
export function extractionInstruction(assetClass: AssetClass): string {
  return `Extract the key terms from the attached offering memorandum. ${assetClassClause(
    assetClass,
  )}

Capture: asking price (and per-unit / per-SF if given), NOI (year 1 and stabilized), going-in and pro forma cap rates, occupancy, in-place and pro forma rents, expense ratio, exit cap, IRR, financing (LTV, rate, lender), hold period, unit count and/or total SF, year built / renovated, seller, and broker. Also capture the property / deal name if present, the \`market\` — the submarket and metro the property sits in, as a short string like "North Dallas, TX" (empty string if you can't tell) — and the \`address\`: the property's full street address (street, city, state; empty string if the OM never states it). The screen anchors on the address, not the deck's narrative.

Tag each figure's \`basis\`: "in_place" for current / historical facts the property is actually producing (in-place rents, current occupancy, T-12 NOI, taxes paid), "pro_forma" for the sponsor's forward projections (stabilized NOI, pro forma rents, rent growth, exit cap, IRR), "na" for identity facts (price, seller, broker, year built, unit count). The buyer must be able to tell the property's reality from the sponsor's story at a glance.

Set \`flagged\` to true ONLY for the figures most worth independent verification — forward-looking or seller-controlled numbers that drive returns and tend to run optimistic (pro forma rents, stabilized NOI, projected rent growth, exit cap, IRR, expense ratios). Do NOT flag hard, present-day, third-party-verifiable facts (asking price, unit or SF count, year built, in-place occupancy, seller, broker, stated loan terms). Flag selectively: if nearly everything is flagged, the flags stop being useful. Also record, for each figure, the page in the OM where you found it as a short string like "p. 12" (use an empty string if you can't tell).`;
}

/** Step 2 — Assumption Challenger */
export function challengerInstruction(assetClass: AssetClass): string {
  return `Challenge the optimistic assumptions in the attached offering memorandum the way a skeptical investment committee would grill a junior analyst. ${assetClassClause(
    assetClass,
  )}

Grill the deal in the order deals die: (1) BASIS — is the asking price per unit / per SF defensible against the OM's own comps and any replacement-cost logic, or is the buyer overpaying going in; (2) EXIT — exit cap vs. going-in cap (compression is a red flag) and how much of the return the residual carries; (3) DEBT — financing assumptions at current rates, DSCR headroom, and refinance risk. Then the supporting assumptions, checking the four documented pro-forma traps by name where the OM gives you the inputs: real-estate taxes NOT reset to the sale price (compare the tax line against the asking price at a plausible assessment ratio and millage — the most common pro forma gap); an operating-expense ratio under roughly 30% of gross potential rent (a near-certain sign of understated R&M, an excluded management fee, or deferred maintenance); aggressive loss-to-lease or concession burn-off inflating year-one effective gross income beyond what the in-place rent roll supports; and insurance carried at the seller's legacy premium instead of a realistic new-owner quote. Plus the perennials: pro forma rent growth vs. realistic market growth, vacancy and lease-up optimism, and renovation / value-add premium claims.

Give 3–6 challenges, most severe first. For each, give a specific, numerate critique, the exact question to put to the broker, and \`page\` — the OM page where the challenged figure appears, as a short string like "p. 12" (empty string if unknown). Then give a one-paragraph stress test: what happens to returns if the one or two most aggressive assumptions revert to market.`;
}

/** Step 3 — Broker-comp scrutiny (the sale & lease comps inside the OM) */
export function brokerCompsInstruction(): string {
  return `Scrutinize the comparable sales and lease comps included in the attached offering memorandum. These come from the OM itself — do NOT use any outside data source. An OM's comp set is assembled by the sell side to support the asking price — that's the incentive at work, not misconduct — so your job is to extract every comp shown, judge how well each actually supports the subject deal's pricing and rents, and flag selection bias. Describe the incentive, never the party: say "the comp set leans favorable" or "seller assumptions run aggressive," not that anyone cherry-picked or misled.

Extract both sale comps and lease comps if present. For each comp, record \`page\` — the OM page it appears on, as a short string like "p. 31" (empty string if unknown) — then compare it to the subject property and rate it: \`supports\` (genuinely backs the OM's numbers), \`favorable\` (leans the seller's way), or \`stretched\` (doesn't really support the deal). Also identify what's conspicuously missing — recent weaker trades omitted, only the best submarkets shown, or stale comps used because recent ones are unfavorable.

If the OM contains no comps at all, say so clearly in the summary and return empty comp lists. Finish with a one-sentence verdict: does the OM's comp set actually justify the pricing, or is it stretched?`;
}

/** Step 4 — Reconciler (OM vs. the buyer's own model) */
export function reconcilerInstruction(): string {
  return `Compare the offering memorandum against the buyer's own underwriting (their ARGUS export or Excel model, provided separately). Find every meaningful discrepancy and explain what it means for the deal.

For each row, give the metric, the OM's value, the buyer's value, and a plain-language description of the gap. Set \`direction\` from the BUYER's perspective: \`unfavorable\` means the buyer's model is worse than the OM claims, \`favorable\` means better, \`neutral\` means immaterial.

Finish with a one-sentence takeaway: does the buyer's model support or undercut the OM's story?`;
}

/** Step 5 — Market plausibility check */
export function marketCheckInstruction(assetClass: AssetClass): string {
  return `Sanity-check the offering memorandum's key assumptions against general market norms for the asset class and submarket. ${assetClassClause(
    assetClass,
  )}

You do NOT have a live comps feed — reason from typical ranges and explicitly flag anything that looks off-market. For each assumption, give what the OM says, a typical range, an assessment (\`in-line\`, \`aggressive\`, or \`conservative\`), short reasoning, and \`page\` — the OM page where the assumption appears, as a short string like "p. 40" (empty string if unknown). Finish with a one-sentence overall plausibility summary.

Be clear throughout that these are rules-of-thumb, not pulled comps, and must be verified against real market data.`;
}

/** Model generator — pass 1: extract underwriting facts from ONE document. */
export function docExtractionInstruction(kind: string, name: string): string {
  const kindLabel =
    {
      om: "offering memorandum",
      rent_roll: "rent roll",
      t12: "T-12 / trailing operating statement",
      financials: "offering financials",
      loan_terms: "loan term sheet",
      other: "supporting document",
    }[kind] ?? "supporting document";

  return `You are reading ONE source document for a CRE deal — a ${kindLabel} ("${name}"). Extract every fact relevant to building an underwriting model. Be faithful to THIS document only; do not infer from anything outside it.

For each fact, give:
- \`key\`: a canonical snake_case key. Use these where they apply: units, sf, purchase_price, price_per_unit, going_in_cap, exit_cap, in_place_occupancy, economic_occupancy, gross_potential_rent, in_place_rent, market_rent, vacancy_pct, other_income, total_opex, expense_ratio, real_estate_taxes, insurance, noi_actual, noi_proforma, rent_growth, expense_growth, loan_amount, ltv, interest_rate, amortization_years, io_years, loan_term, hold_period. Otherwise pick a sensible key.
- \`label\`: a short human label.
- \`value\`: the value exactly as written in the document.
- \`numeric\`: the value as a plain number with no symbols (convert "$1,250,000" to 1250000 and "92%" to 92), or null if not numeric.
- \`unit\`: one of "%", "$", "$/unit/mo", "$/sf", "units", "sf", "years", "x", or "".
- \`locator\`: where in the document (e.g. "p. 7", "Sheet1!B12"), or "" if unknown.
- \`basis\`: the single most important field. Use exactly one of: "actual" (historical / in-place — what rent rolls and T-12s report), "pro_forma" (the sponsor's forward projection — what OM pro formas report), "term_sheet" (loan terms), "appraisal", or "other".

Capture BOTH actuals and pro forma figures when the document shows both (e.g. a statement with actual and projected columns). Getting \`basis\` right is essential: the model uses it to decide which source wins when documents disagree.`;
}

/** Model generator — pass 2: reconcile across sources and produce model inputs. */
export function reconciliationInstruction(): string {
  return `You are building a FIRST-DRAFT underwriting model for a BUYER by reconciling facts extracted from several source documents (provided below as JSON). These documents frequently DISAGREE — the OM's pro forma will not match the rent roll's in-place figures or the T-12's actuals. Reconcile every disagreement transparently. NEVER silently merge conflicting numbers.

Source-authority rules — apply them, and explain each choice:
- IN-PLACE / ACTUAL operations (current occupancy, in-place rents, actual income and expenses, trailing NOI): the RENT ROLL and T-12 actuals are authoritative over the OM's pro forma claims.
- FORWARD-LOOKING figures (pro forma rents, rent and expense growth, stabilized NOI, exit cap): these are the sponsor's ASSUMPTIONS, not facts. Treat them as lower-confidence; carry a defensible, market-grounded or actuals-derived value rather than the sponsor's most optimistic number, and flag it.
- DEBT terms (rate, LTV, amortization, IO, term): a loan term sheet is authoritative over an OM summary.
- PHYSICAL facts (unit count, SF, year built): cross-check; if the rent roll's unit count differs from the OM, flag the conflict and prefer the rent roll.

For EVERY metric that matters to the model, output a reconciled entry: key, label, chosenValue (string including the unit), unit, the full list of sources (each with doc, value, locator, basis), authority (which document won), a one-sentence rationale, confidence (high/medium/low), and isConflict. Set isConflict=true whenever two sources gave materially different values for the same metric — surface it, do not bury it.

Then produce \`inputs\`: the numeric inputs the cash-flow math needs, derived from your CHOSEN values, all as plain numbers:
- units, purchasePrice (if not stated, derive from year-1 NOI ÷ going-in cap), closingCostPct (due diligence + closing costs as % of price — use 2 if unstated), loanFeePct (financing/origination fees as % of the loan — use 1 when there is debt, 0 otherwise), year1Gpr (annual gross potential rent), vacancyPct, otherIncomeAnnual, year1Opex (annual total), capexReserveAnnual (annual capital / replacement reserve, deducted BELOW NOI — from a capital plan or PCA if provided; otherwise a market-reasonable reserve: multifamily ≈ $250–300/unit/yr, commercial ≈ $0.15–0.25/SF/yr; use 0 only if you truly cannot ground it), rentGrowthPct, expenseGrowthPct, otherIncomeGrowthPct, exitCapPct, sellingCostPct (use 2 if unstated), holdYears (use 5 if unstated), and loan { ltvPct, ratePct, amortYears (use 30 if unstated), ioYears (use 0 if unstated) }.
CONVENTION: every field ending in Pct (including ltvPct and ratePct) is a percentage on a 0–100 scale — write 5.5% as 5.5, NEVER 0.055; an exit cap of 5.25% is 5.25. Pick conservative, defensible inputs consistent with your reconciliation; where a figure is the sponsor's forward assumption, prefer an actuals-derived or market-reasonable value. The capital reserve is a single flat annual figure — note in a caveat if a detailed capital plan is needed.

Finally: a one-paragraph \`summary\` of how the sources reconciled and what drives the returns, and \`caveats\` — what the buyer must verify, what was uncertain or missing, and the model's simplifications. Everything is a first draft to verify, with every number traceable to a source.`;
}

/** Step 6 — Verdict (synthesizes everything above) */
export function verdictInstruction(): string {
  return `You are the head of acquisitions making a first-pass screen decision. Using the gathered analysis provided below — the extracted terms, the challenges and stress test, the comp scrutiny, the reconciliation against the buyer's model, and the market plausibility check — give a clear go / no-go for spending more time on this deal.

Choose a verdict: \`pass\` (worth deeper work), \`caution\` (proceed only with named conditions), or \`pass_on\` (kill it). Give a two-sentence rationale, the top risks, and — if pursuing — the 2–3 concrete next steps.

Then produce the pre-model \`screen\` — the part that makes this reproducible instead of a coin flip:
- \`ranges\`: the deal-defining inputs as RANGES, never single hero numbers. Always include market rent (per unit/mo or per SF), the expense load (ratio or per-unit), and the exit cap; add basis (price per unit/SF) and any other input that swings the deal. For each give a \`low\`, \`base\`, and \`high\` (low = conservative, base = your defensible pick, high = the sponsor's optimistic end), the \`source\` it traces to (name it explicitly — a public/market norm, a comp, or the OM page; if it's only the sponsor's claim, say so), a one-line \`basis\` for what drives the spread, and a \`confidence\`. A 10% drift hides inside a single number — the range is the honesty.
- \`dealKillers\`: stress the three that kill deals first, in this order — \`basis\` (are you buying right?), \`exit\` (does the exit cap hold?), \`debt\` (does the financing pencil and survive a shock?). For each give the current \`read\` and the \`risk\` that would break it.
- \`sensitivity\`: how the call moves across the ranges — at the \`conservative\` end (low rents, high expenses, soft exit), at your \`base\`, and at the \`sponsor\`'s optimistic end. Give all three; for each, the resulting \`call\` (pass / caution / pass_on) and a one-line \`note\` on what drives it. This is the honest answer to "where does this deal flip?"

Every figure must name where it came from. This is a first-pass screen, not investment advice.`;
}
