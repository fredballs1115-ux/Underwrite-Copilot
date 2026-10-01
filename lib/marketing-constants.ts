// THE single source of truth for every number the marketing surfaces assert
// (homepage, layout metadata, /demo hero). No figure may appear as a literal
// in a marketing component — import it from here, so the same claim can never
// drift into two different values again (the 12%-vs-14% / 6%-vs-14% bug).
//
// Every constant carries its provenance: a real computation, the sample
// fixture, or a stated illustration assumption. If a number can't be
// justified, the claim gets cut — not invented support.
//
// (Universal module: server + client components import it.)

// ── The headline analyst-spread illustration ────────────────────────────────
// Stated illustration assumption (not a measured benchmark): two competent
// manual underwrites of the same OM landing 4 points apart. Chosen per
// direction — a 4-point spread is meaningful and credible; wider reads as
// hype, narrower as noise. The 400bps figure below MUST stay derived from
// these two so the copy can never disagree with the cards.
export const SPREAD_LOW_IRR_PCT = 10;
export const SPREAD_HIGH_IRR_PCT = 14;
export const SPREAD_BPS = (SPREAD_HIGH_IRR_PCT - SPREAD_LOW_IRR_PCT) * 100; // 400

// ── Timing claims ───────────────────────────────────────────────────────────
// Observed typical runs on mid-size OMs (subject to document size and model
// latency) — phrased with "about" in copy for honesty.
export const FIRST_READ_CLAIM = "about half a minute";
export const FULL_SCREEN_CLAIM = "minutes";

// ── Product shape facts (countable in the codebase) ─────────────────────────
// Six checkpointed analysis stages per OM: extract, challenge, comps,
// reconcile, market, verdict (lib/anthropic/pipeline.ts).
export const ANALYSIS_STAGES = 6;
// The three deal-killers the challenger stresses first: basis, exit, debt.
export const DEAL_KILLERS = 3;
// The IC memo is exactly one page (lib/memo/memo-document.tsx).
export const MEMO_PAGES = 1;
// The sensitivity playground's exit-cap slider sweep, each way
// (lib/underwrite/playground.ts LEVER_STEPS: 8 × 25bps).
export const SLIDER_SWEEP_BPS = 200;

// ── Research-layer facts (countable in the codebase) ────────────────────────
// Public-record comp jurisdictions: RE-EXPORTED from the provider registry
// itself (lib/public-comps/core.ts COVERAGE_SUMMARY, derived from configured
// providers) so marketing copy can never claim coverage the code doesn't have.
export { COVERAGE_SUMMARY as COMPS_JURISDICTIONS } from "@/lib/public-comps/core";
// The FRED series the weekday cron tracks are counted from the one table
// both the cron and the page read (data/fred-series.json via
// lib/live-rates.ts SERIES) — nothing here restates the number.

// ── The four deeper tools (beyond the six-stage screen) ─────────────────────
// ONE source for the homepage toolkit grid AND the sample screen's "what comes
// after the screen" block, so those two surfaces can never describe the
// product differently. Each entry names a real, shipped page — if a tool is
// removed from the app, its claim has to be deleted here, which deletes it
// from both surfaces at once.
export interface DeepTool {
  title: string;
  /** where it lives in the app, for the sample screen's label */
  where: string;
  blurb: string;
}

export const DEEP_TOOLS: readonly DeepTool[] = [
  {
    title: "Which assumption moved the IRR",
    where: "Deal → Bridge",
    blurb:
      "Re-run a deal with a lower price and a tighter exit cap and the return jumps — but which change did the work? The bridge attributes the move to each input by Shapley value, so the answer doesn't depend on the order you'd have applied them, and the bars sum to the headline change exactly.",
  },
  {
    title: "Two brokers, one asset, a $6.5M gap",
    where: "Deal → Valuations",
    blurb:
      "Upload both BOVs and the gap gets decomposed into Year-1 NOI, cap rate and capex treatment — with anything the identity can't explain shown as unexplained rather than smoothed over. Then each broker's price runs through your own model, so you see the levered IRR each one actually implies.",
  },
  {
    title: "The rent roll, normalized — and a workbook that's alive",
    where: "Deal → Rent roll",
    blurb:
      "Broker rent rolls are never the same twice: the header is rarely row 1 and the columns never match. Upload one, correct what the mapper missed, and get WALT weighted both ways, the rollover schedule and mark-to-market. Then download an Excel model whose formulas are live — change the exit cap on the Assumptions tab and the IRR recalculates.",
  },
  {
    title: "Exit cap and rent growth, checked against the submarket",
    where: "Market data → Submarkets",
    blurb:
      "The two assumptions that swing returns most are usually just typed in. Link a submarket and they get measured against what it has actually done — months of supply under construction, trailing rent CAGR on a consistent basis, trough vacancy. Overriding a warning is normal; it just needs a one-line reason, and that reason lands in the memo.",
  },
] as const;

// ── Pricing ─────────────────────────────────────────────────────────────────
// THE canonical price + free-tier numbers. lib/billing (server-only) derives
// its labels and arithmetic from these — that direction, because this module
// must stay importable from client components and billing can't. Must match
// the live Stripe prices the user configures.
export const PRICE_PRO_MONTHLY_USD = 29.99;
export const PRICE_TEAM_BASE_MONTHLY_USD = 49.99;
export const PRICE_TEAM_MEMBER_MONTHLY_USD = 9.99;
export const PRICE_PRO_MONTHLY = `$${PRICE_PRO_MONTHLY_USD.toFixed(2)}`;
export const PRICE_TEAM_BASE_MONTHLY = `$${PRICE_TEAM_BASE_MONTHLY_USD.toFixed(2)}`;
export const PRICE_TEAM_MEMBER_MONTHLY = `$${PRICE_TEAM_MEMBER_MONTHLY_USD.toFixed(2)}`;
export const FREE_DEALS = 3;

// ── What each plan includes ─────────────────────────────────────────────────
// ONE list for the homepage's plan cards and the billing page's, so the two
// can never sell different things. The billing page listed per-tab uploads
// and the multi-document reconciliation as Pro — nothing gates either, and
// the screen reconciles a rent roll or a T-12 on every plan — and neither
// page named Ask-the-deal, which is gated. Each Pro line names the gates in
// the code that hold it to Pro, and lib/plan-features.test.ts holds the
// list to them: a new gate with no line, or a line whose gate is gone,
// fails there.

/** The free plan's card, on the homepage and the billing page alike. */
export const FREE_PLAN: readonly string[] = [
  `${FREE_DEALS} deals, the full six-stage screen on each`,
  "Sourced ranges + the three deal-killers",
  "Recorded-sales comps + local rent-rule check by address",
  "Risk digest and side-by-side deal comparison",
  "Reconcile your own underwriting model",
];

/** Each `/billing?upsell=` key a Pro refusal sends the reader with, and
 *  what the billing page says they were trying to do. */
export const PRO_UPSELL = {
  memo: "export the one-page IC memo",
  report: "export the full multi-page report",
  underwrite: "export the institutional Excel model",
  rentroll: "export the live-formula rent-roll workbook",
  loi: "export the LOI draft",
  branding: "put your firm's name and logo on exported reports",
} as const;
export type ProUpsell = keyof typeof PRO_UPSELL;

/** A Pro gate refused where it stands — by the action, on the page — with
 *  no trip to the billing page. */
export type ProInPlace = "deal-cap" | "model-build" | "ask" | "comp-search";

export interface ProPlanLine {
  /** what both plan cards print */
  label: string;
  /** the gates that hold it to Pro */
  gates: readonly (ProUpsell | ProInPlace)[];
}

/** What Pro adds, gate by gate. */
export const PRO_PLAN: readonly ProPlanLine[] = [
  { label: "Unlimited deals", gates: ["deal-cap"] },
  { label: "IC memo, full PDF report, and LOI draft", gates: ["memo", "report", "loi"] },
  { label: "Excel models with live formulas — the underwrite and the rent roll", gates: ["underwrite", "rentroll"] },
  { label: "A first-draft model built from your documents", gates: ["model-build"] },
  { label: "Ask the deal — answers cite the OM's pages", gates: ["ask"] },
  { label: "Public-web comp search", gates: ["comp-search"] },
  { label: "Your firm's branding on memos, reports, workbooks & LOI", gates: ["branding"] },
];

/** The Pro card's lines, as both pages draw them. */
export const PRO_PLAN_LINES: readonly string[] = [...PRO_PLAN.map((l) => l.label), "Everything in Free"];

// ── Sample-deal narrative figures (fixture-sourced) ─────────────────────────
// All of these come from ONE story — the illustrative Maddox sample deal
// (lib/sample-deal.ts) — so the hero card, the demo tabs, and the bento tell
// the same tale. They are labeled illustrative wherever they render.
//
// The comp-premium line matches the sample's comp scrutiny narrative.
export const SAMPLE_COMP_PREMIUM_LINE =
  "$274k/unit is 7% above the last two comparable trades with no renovation premium to justify it.";

// NOTE deliberately absent: the Excel-preview IRR figures. Those are COMPUTED
// from the live engine on the sample model at render time (app/page.tsx
// imports computeModel + SAMPLE_DEAL) — hardcoding them here is exactly how
// they drifted (7.1% vs the engine's 6.9%).
