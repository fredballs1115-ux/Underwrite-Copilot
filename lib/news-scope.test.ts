// The scored news feed says what it lists (research pass 42, L2): the page
// reads the sweep's newest 200 stories and lists the newest 120, and the
// sector chips are the sectors among those 200 — none of which it said, so
// the feed read as every story the sweep had scored.
import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { SCORED_READ, SCORED_SHOWN, ScoredFeedView, scoredScopeLine, type ItemRow } from "@/app/(app)/news/scored-feed";
import { visibleText } from "./render-lint";

const story = (i: number, sector = "multifamily"): ItemRow => ({
  url: `https://example.com/${i}`,
  title: `Story ${i}`,
  source: "Bisnow",
  sector,
  relevance: 5,
  summary: null,
  action: null,
  published_at: null,
  created_at: new Date(Date.UTC(2026, 8, 1) + i * 3600e3).toISOString(),
});

describe("the scored feed's scope", () => {
  it("is said where the list is a cut, and not where it is every story", () => {
    expect(scoredScopeLine({ shown: 12, matched: 12, read: 12, total: 12, sector: null })).toBeNull();
    expect(scoredScopeLine({ shown: 120, matched: 200, read: 200, total: 1532, sector: null })).toBe(
      "The newest 120 of the 1,532 stories the sweep has scored; the sectors are those among the newest 200.",
    );
    expect(scoredScopeLine({ shown: 120, matched: 150, read: 150, total: 150, sector: null })).toBe(
      "The newest 120 of the 150 stories the sweep has scored.",
    );
    expect(scoredScopeLine({ shown: 37, matched: 37, read: 200, total: 1532, sector: "tax" })).toBe(
      "The newest 37 tax stories among the 200 newest the sweep has scored (of 1,532) — an older one is not read here.",
    );
    expect(scoredScopeLine({ shown: 9, matched: 9, read: 40, total: 40, sector: "tax" })).toBeNull();
  });

  it("is drawn over the feed", () => {
    const items = Array.from({ length: 200 }, (_, i) => story(i, i % 2 ? "tax" : "multifamily"));
    const text = visibleText(renderToStaticMarkup(React.createElement(ScoredFeedView, { items, alerts: [], wantSector: "", total: 640 })));
    expect(text).toContain("The newest 120 of the 640 stories the sweep has scored; the sectors are those among the newest 200.");
    expect(SCORED_SHOWN).toBe(120);
  });

  it("the page reads the newest SCORED_READ and counts every story", () => {
    expect(SCORED_READ).toBe(200);
    const page = readFileSync("app/(app)/news/page.tsx", "utf8");
    expect(page).toContain(".limit(SCORED_READ)");
    expect(page).toContain('supabase.from("market_intel_items").select("url", { count: "exact", head: true })');
    expect(page).toContain("total={total}");
  });
});
