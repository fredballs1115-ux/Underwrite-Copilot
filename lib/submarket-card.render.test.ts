import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { periodDay, periodMonth } from "./period-label";
import { submarketMetrics } from "./market/metrics";
import { applyExclusionRules } from "./market/exclusions";
import { EMPTY_RULES, type Submarket, type SubmarketPeriod } from "./market/types";

// The card's forms post to server actions; the render never calls them.
vi.mock("@/app/(app)/deals/[id]/submarket-actions", () => ({
  linkSubmarket: async () => {},
  dismissSubmarketWarning: async () => {},
  restoreSubmarketWarning: async () => {},
}));

const SUB: Submarket = {
  id: "s1",
  userId: "u1",
  name: "Navy Yard office",
  metro: "Washington, DC",
  assetClass: "office",
  exclusionRules: EMPTY_RULES,
  supplyWarningMonths: 24,
  notes: null,
  createdAt: "2026-01-02T00:00:00Z",
};

const period = (p: string, rent: number): SubmarketPeriod => ({
  id: p,
  submarketId: "s1",
  period: p,
  inventorySf: 4_000_000,
  vacancyPct: 0.14,
  netAbsorptionSf: 20_000,
  underConstructionSf: 120_000,
  askingRent: rent,
  rentBasis: "gross_direct",
  source: "costar.csv",
  unverified: false,
  sourceUrl: null,
});

function view() {
  const periods = [period("2024-12-31", 52), period("2025-03-31", 53)];
  return {
    submarket: SUB,
    periods,
    properties: [],
    applied: applyExclusionRules([], EMPTY_RULES, "2026-10-19"),
    metrics: submarketMetrics(periods, []),
  };
}

async function draw(props: Record<string, unknown>) {
  const { SubmarketCard } = await import("@/app/(app)/deals/[id]/submarket-card");
  return renderToStaticMarkup(
    React.createElement(SubmarketCard, { dealId: "d1", warnings: [], submarkets: [SUB], ...props } as never),
  );
}

describe("a submarket's period in words (lib/period-label)", () => {
  it("says a month and a day with the year, and leaves anything else as stored", () => {
    expect(periodMonth("2025-03-31")).toBe("Mar 2025");
    expect(periodDay("2025-03-31")).toBe("Mar 31, 2025");
    expect(periodDay("2025-03")).toBe("Mar 2025");
    expect(periodDay("Q1")).toBe("Q1");
  });
});

describe("the deal page's submarket card", () => {
  it("dates the latest period in words, never the stored ISO date", async () => {
    const html = await draw({ view: view() });
    const text = visibleText(html);
    expect(text).toContain("as of Mar 31, 2025");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
