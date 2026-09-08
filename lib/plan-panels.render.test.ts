// Render smoke tests for the plan-deal panels. They are plain React on pure
// math, so a static server render catches what the unit tests cannot: a
// runtime error in the markup, a figure formatted wrong, a sentence that no
// longer says what the numbers say. Same conversion fixture as the math.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { inferStrategy, planSummary } from "@/lib/deal-strategy";
import { PlanSensitivity } from "@/app/(app)/deals/[id]/plan-sensitivity";
import { ConstructionDebtPanel } from "@/app/(app)/deals/[id]/construction-debt-panel";

const CONVERSION: ExtractionResult = {
  dealName: "1200 K Street — Office-to-Residential Conversion",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1200 K St NW, Washington, DC",
  strategy: {
    kind: "conversion",
    summary: "Convert a vacant 300,000 SF office building into 320 apartments.",
    capitalBudget: "$160M hard and soft costs",
    timeline: "24 months of construction, 12 months of lease-up",
  },
  metrics: [
    { label: "Purchase price", value: "$20,000,000", flagged: false, page: "p. 3" },
    { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: false, page: "p. 12" },
    { label: "Total project cost", value: "$180,000,000", flagged: false, page: "p. 14" },
  ],
};
const plan = planSummary(CONVERSION, inferStrategy(CONVERSION))!;
const refCap = { pct: 0.06, provenance: "assumption" as const };

describe("PlanSensitivity — yield on cost, stressed", () => {
  it("renders the grid with the OM's case at 11.7% (+567 bps) and the two exact sentences", () => {
    const html = renderToStaticMarkup(React.createElement(PlanSensitivity, { plan, refCap }));
    expect(html).toContain("Yield on cost, stressed");
    expect(html).toContain("11.7%");
    expect(html).toContain("+567 bps");
    expect(html).toContain("OM NOI");
    expect(html).toContain("OM budget");
    // The NOI floor and the overrun that erases the spread.
    expect(html).toContain("$10.8M");
    expect(html).toMatch(/48\.6% under/);
    expect(html).toMatch(/106% over/);
    // The reference cap and where it came from.
    expect(html).toContain("6.00% reference cap");
    expect(html).toContain("exit-cap default");
    // 25 cells, each carrying a signed spread (the legend's "150–199 bps"
    // labels carry no sign, so they are not counted).
    expect((html.match(/[+-]\d+ bps</g) ?? []).length).toBe(25);
  });

  it("renders nothing without a plan or a reference cap", () => {
    expect(renderToStaticMarkup(React.createElement(PlanSensitivity, { plan: null, refCap }))).toBe("");
    expect(renderToStaticMarkup(React.createElement(PlanSensitivity, { plan, refCap: null }))).toBe("");
  });
});

describe("ConstructionDebtPanel — the plan's debt", () => {
  const props = {
    plan,
    planLabel: "Conversion",
    exitCapPct: 6,
    takeOutRatePct: 6.25,
    amortYears: 30,
    minDscr: 1.25,
    minDebtYieldPct: 8,
    maxLtvPct: 65,
    numCls: "input",
  };

  it("seeds from the OM (budget, NOI, three years) and sizes the loan to cost with headroom at take-out", () => {
    const html = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, props));
    expect(html).toContain("Construction loan");
    expect(html).toContain("$117.29M"); // 0.6 × $180M ÷ (1 − 0.6·0.08·3·0.55)
    expect(html).toContain("Take-out headroom");
    expect(html).not.toContain("Cash-in refinance");
    expect(html).toContain("$350M value at a 6% cap");
    expect(html).toContain("40% equity");
    // Seeded inputs: the OM's budget and NOI as exact dollars, the timeline as years.
    expect(html).toContain('value="$160,000,000"');
    expect(html).toContain('value="$21,000,000"');
    expect(html).toMatch(/aria-label="Years to take-out"[^>]*value="3"/);
    // Yield on cost with the carry inside it is below the OM's 11.7%.
    expect(html).toMatch(/Yield on total cost with the carry inside it:.*10\.\d%/);
  });

  it("says so when the OM states no timeline, and defaults the road to two years", () => {
    const noTimeline = planSummary(
      { ...CONVERSION, strategy: { ...CONVERSION.strategy!, timeline: "" } },
      inferStrategy(CONVERSION),
    )!;
    const html = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, { ...props, plan: noTimeline }));
    expect(html).toContain("states no timeline");
    expect(html).toMatch(/aria-label="Years to take-out"[^>]*value="2"/);
  });
});

describe("ConstructionDebtPanel — the opening sentence follows the kind of plan", () => {
  it("a value-add is bridge debt on an income-producing asset; a conversion borrows against cost alone", () => {
    const valueAdd = planSummary(
      {
        ...CONVERSION,
        dealName: "Maddox Apartments — value-add",
        strategy: { kind: "value_add", summary: "Renovate 248 units.", capitalBudget: "$6M", timeline: "18 months" },
        metrics: [
          { label: "Asking price", value: "$50,000,000", flagged: false, page: "p. 3" },
          { label: "NOI (in-place)", value: "$3,000,000", flagged: false, page: "p. 7" },
          { label: "NOI (stabilized, pro forma)", value: "$3,900,000", flagged: false, page: "p. 12" },
          { label: "Renovation budget", value: "$6,000,000", flagged: false, page: "p. 14" },
        ],
      },
      { kind: "value_add", label: "Value-add", summary: "Renovate 248 units.", source: "extraction" },
    )!;
    const base = {
      planLabel: "Value-add",
      exitCapPct: 6,
      takeOutRatePct: 6.25,
      amortYears: 30,
      minDscr: 1.25,
      minDebtYieldPct: 8,
      maxLtvPct: 65,
      numCls: "input",
    };
    const va = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, { ...base, plan: valueAdd }));
    expect(va).toContain("bridge debt sized to total cost");
    expect(va).not.toContain("income it does not have yet");
    expect(va).toMatch(/aria-label="Years to take-out"[^>]*value="1.5"/);
    const conv = renderToStaticMarkup(
      React.createElement(ConstructionDebtPanel, { ...base, plan, planLabel: "Conversion" }),
    );
    expect(conv).toContain("income it does not have yet");
  });
});
