// Why deals die, and what they traded at (research pass 24, B4): stored on
// the stage move that ended the deal, kept by every later stage change.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseStageHistory, type StageChange } from "./stages";
import {
  OUTCOME_FORM_ERROR,
  currentOutcome,
  deathReasons,
  outcomeWords,
  readOutcomeForm,
  tradePriceText,
  tradeWords,
  withOutcome,
} from "./deal-outcome";
import { deriveInternalComps } from "./internal-comps";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({}) }));

const NOW = "2026-10-02T15:00:00.000Z";
const dead: StageChange[] = [
  { stage: "tracking", at: "2026-08-01T10:00:00Z" },
  { stage: "dead", at: "2026-09-30T10:00:00Z" },
];

describe("the outcome rides on the move that ended the deal", () => {
  it("is set on the last entry where it is the deal's Dead move, and a stage change's re-parse keeps it", () => {
    const form = readOutcomeForm({ reason: "price", price: "$41.5M", buyer: "Blackstone", date: "2026-09-30" }, "jane@firm.com", NOW);
    expect(form.ok).toBe(true);
    const history = withOutcome("dead", dead, (form as { ok: true; outcome: never }).outcome)!;
    // Stored and read back as JSON, as the column holds it.
    const stored = parseStageHistory(JSON.parse(JSON.stringify(history)));
    expect(currentOutcome("dead", stored)).toEqual({
      reason: "price",
      trade: { price: 41_500_000, buyer: "Blackstone", date: "2026-09-30", reportedBy: "jane@firm.com", reportedAt: NOW },
    });
    // setStage rewrites the array from the parse and appends the move: the
    // outcome on the earlier entry survives it.
    const revived = [...stored, { stage: "tracking" as const, at: "2026-10-05T10:00:00Z" }];
    const again = parseStageHistory(JSON.parse(JSON.stringify(revived)));
    expect(again[1].outcome?.reason).toBe("price");
    // …and the deal back in play has no current outcome.
    expect(currentOutcome("tracking", again)).toBeNull();
  });

  it("refuses a deal whose move to Dead or Closed was never recorded, and one still in play", () => {
    const outcome = { reason: "timing" as const, trade: null };
    expect(withOutcome("dead", [], outcome)).toBeNull();
    expect(withOutcome("dead", [{ stage: "tracking", at: "2026-08-01T10:00:00Z" }], outcome)).toBeNull();
    expect(withOutcome("tracking", dead, outcome)).toBeNull();
  });

  it("keeps no reason on a closed deal — it was won — and drops a malformed stored outcome", () => {
    const closed: StageChange[] = [{ stage: "closed", at: "2026-09-30T10:00:00Z" }];
    const h = withOutcome("closed", closed, { reason: "price", trade: null });
    expect(h).toEqual([{ stage: "closed", at: "2026-09-30T10:00:00Z" }]);
    expect(
      parseStageHistory([{ stage: "dead", at: "x", outcome: { reason: "aliens", trade: { price: -5, reportedAt: NOW } } }]),
    ).toEqual([{ stage: "dead", at: "x" }]);
    expect(parseStageHistory([{ stage: "tracking", at: "x", outcome: { reason: "price" } }])).toEqual([{ stage: "tracking", at: "x" }]);
  });
});

// Audit C8, L4: the card said "with your name" and stored the email; the
// reporter is now their account, named as the team's roster names it.
describe("who reported a trade", () => {
  it("keeps the reporter's account beside the name, and the page's roster names them", () => {
    const id = "6f1c2a7e-0d4b-4a51-9a3e-2f8b9c1d0e11";
    const form = readOutcomeForm({ price: "$41.5M" }, { id, name: "Jane Analyst" }, NOW);
    expect(form.ok && form.outcome.trade).toMatchObject({ reportedBy: "Jane Analyst", reportedById: id });
    const trade = (form as { ok: true; outcome: { trade: Parameters<typeof tradeWords>[0] } }).outcome.trade;
    // Stored and read back as the column holds it.
    const history = withOutcome("dead", dead, { reason: null, trade })!;
    const back = parseStageHistory(JSON.parse(JSON.stringify(history)));
    expect(back[back.length - 1].outcome?.trade?.reportedById).toBe(id);
    expect(tradeWords(trade)).toContain("reported by Jane Analyst");
    expect(tradeWords(trade, { [id]: "Jane Q. Analyst" })).toContain("reported by Jane Q. Analyst");
    expect(outcomeWords({ reason: null, trade }, { [id]: "Jane Q. Analyst" })).toContain("reported by Jane Q. Analyst");
    // A trade reported before the account was kept reads as it did.
    expect(tradeWords({ ...trade, reportedById: undefined }, { [id]: "Jane Q. Analyst" })).toContain("reported by Jane Analyst");
  });
});

// Audit C8, L11: the deal page kept its own copy of the form's words, its
// date message without the year bounds.
describe("the deal page's refusal words are the form's", () => {
  it("reads OUTCOME_FORM_ERROR, the years and all", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(app)/deals/[id]/deal-view.tsx", "utf8");
    expect(src).toContain("outcomedate: OUTCOME_FORM_ERROR.date");
    expect(src).toContain("outcomeprice: OUTCOME_FORM_ERROR.price");
    expect(src).toContain("outcomereason: OUTCOME_FORM_ERROR.reason");
    expect(OUTCOME_FORM_ERROR.date).toMatch(/between \d{4} and \d{4}/);
  });
});

describe("readOutcomeForm", () => {
  it("reads a reason alone, a trade with a blank buyer and day, and refuses what is no figure or no day", () => {
    expect(readOutcomeForm({ reason: "lost_to_bidder" }, null, NOW)).toEqual({ ok: true, outcome: { reason: "lost_to_bidder", trade: null } });
    expect(readOutcomeForm({ price: "41,500,000" }, "Jane", NOW)).toEqual({
      ok: true,
      outcome: { reason: null, trade: { price: 41_500_000, buyer: null, date: null, reportedBy: "Jane", reportedAt: NOW } },
    });
    expect(readOutcomeForm({ reason: "aliens" }, null, NOW)).toEqual({ ok: false, error: "reason" });
    // "41.5" meant millions; it is refused rather than read as $41.50.
    expect(readOutcomeForm({ price: "41.5" }, null, NOW)).toEqual({ ok: false, error: "price" });
    expect(readOutcomeForm({ price: "$41.5M", date: "2026-02-30" }, null, NOW)).toEqual({ ok: false, error: "date" });
  });

  it("says a trade as reported, never as a record", () => {
    const t = { price: 41_500_000, buyer: "Blackstone", date: "2026-09-30", reportedBy: "Jane", reportedAt: NOW };
    expect(tradeWords(t)).toBe("Traded at $41.50M to Blackstone on Sep 30, 2026 — reported by Jane, Oct 2, 2026");
    expect(outcomeWords({ reason: "price", trade: null })).toBe("Why: Price");
  });
});

describe("deathReasons", () => {
  it("counts each reason over the dead deals, every reason listed, the unrecorded counted apart", () => {
    const withReason = (reason: "price" | "financing") => withOutcome("dead", dead, { reason, trade: null })!;
    const out = deathReasons([
      { stage: "dead", history: withReason("price") },
      { stage: "dead", history: withReason("price") },
      { stage: "dead", history: withReason("financing") },
      { stage: "dead", history: dead },
      { stage: "tracking", history: [] },
    ]);
    expect(out.dead).toBe(4);
    expect(out.unrecorded).toBe(1);
    expect(out.reasons.slice(0, 2).map((r) => [r.label, r.count])).toEqual([
      ["Price", 2],
      ["Financing", 1],
    ]);
    expect(out.reasons).toHaveLength(7);
  });
});

describe("the internal comps show a reported trade as its own figure, never as the ask", () => {
  it("carries the trade beside the ask", () => {
    const history = withOutcome("dead", dead, {
      reason: "lost_to_bidder",
      trade: { price: 39_000_000, buyer: null, date: null, reportedBy: "Jane", reportedAt: NOW },
    });
    const comps = deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [
      {
        id: "lost",
        name: "Lost deal",
        asset_class: "multifamily",
        created_at: "2026-08-01T00:00:00Z",
        is_sample: false,
        verdict: null,
        extraction: { assetClass: "multifamily", metrics: [{ label: "Asking price", value: "$41,000,000" }] },
        stage: "dead",
        stage_history: history,
      },
    ]);
    expect(comps[0].priceLabel).toBe("$41.0M");
    expect(comps[0].tradedLabel).toBe(tradePriceText(39_000_000));
    expect(comps[0].tradedTitle).toContain("reported by Jane");
  });

  // Audit C8, L1: the label wrote $41,250,000 "$41.3M" beside a title of
  // "Traded at $41.25M" — one trade, two figures.
  it("writes the trade one way, the label and its title alike", () => {
    const history = withOutcome("dead", dead, {
      reason: "lost_to_bidder",
      trade: { price: 41_250_000, buyer: null, date: null, reportedBy: "Jane", reportedAt: NOW },
    });
    const comps = deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [
      {
        id: "lost",
        name: "Lost deal",
        asset_class: "multifamily",
        created_at: "2026-08-01T00:00:00Z",
        is_sample: false,
        verdict: null,
        extraction: { assetClass: "multifamily", metrics: [{ label: "Asking price", value: "$42,000,000" }] },
        stage: "dead",
        stage_history: history,
      },
    ]);
    expect(comps[0].tradedLabel).toBe("$41.25M");
    expect(comps[0].tradedTitle).toContain(`Traded at ${comps[0].tradedLabel}`);
  });
});

describe("DealOutcomeCard", () => {
  it("offers the reasons on a dead deal, the trade it holds, and nothing on a deal in play", async () => {
    const { DealOutcomeCard } = await import("@/app/(app)/deals/[id]/deal-outcome");
    const history = withOutcome("dead", dead, {
      reason: "price",
      trade: { price: 41_500_000, buyer: "Blackstone", date: "2026-09-30", reportedBy: "Jane", reportedAt: NOW },
    })!;
    const html = renderToStaticMarkup(React.createElement(DealOutcomeCard, { dealId: "d1", stage: "dead", history }));
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(html).toContain("Why it died");
    expect(html).toContain('aria-pressed="true"');
    expect(visibleText(html)).toContain("Traded at $41.50M to Blackstone on Sep 30, 2026 — reported by Jane, Oct 2, 2026");
    expect(renderToStaticMarkup(React.createElement(DealOutcomeCard, { dealId: "d1", stage: "tracking", history }))).toBe("");
    const closed = renderToStaticMarkup(
      React.createElement(DealOutcomeCard, { dealId: "d1", stage: "closed", history: [{ stage: "closed", at: NOW }] }),
    );
    expect(closed).toContain("What it closed at");
    expect(closed).not.toContain("Why it died");
  });
});
