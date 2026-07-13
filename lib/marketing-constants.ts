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
// (lib/underwrite/playground.ts LEVER_STEPS: 16 × 25bps).
export const SLIDER_SWEEP_BPS = 400;

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

// ── Sample-deal narrative figures (fixture-sourced) ─────────────────────────
// All of these come from ONE story — the illustrative Maddox sample deal
// (lib/sample-deal.ts) — so the hero card, the demo tabs, and the bento tell
// the same tale. They are labeled illustrative wherever they render.
//
// The comp-premium line matches the sample's comp scrutiny narrative.
export const SAMPLE_COMP_PREMIUM_LINE =
  "$274k/unit is 7% above the last two comparable trades with no renovation premium to justify it.";
// The retrade tile: broker cut the sample deal's price in a reissued deck.
export const SAMPLE_RETRADE_DELTA = "−$1.8M (−2.5%)";
// The your-model-vs-OM tile rows (sample reconciliation story).
export const SAMPLE_RECONCILE_ROWS: [string, string, string][] = [
  ["Exit cap", "you 5.75 · OM 5.25", "+50 bps"],
  ["Yr-1 rents", "you $1.41k · OM $1.54k", "−8.4%"],
];

// NOTE deliberately absent: the Excel-preview IRR figures. Those are COMPUTED
// from the live engine on the sample model at render time (app/page.tsx
// imports computeModel + SAMPLE_DEAL) — hardcoding them here is exactly how
// they drifted (7.1% vs the engine's 6.9%).
