// The capital stacks drawn as pictures above their figures: the first-draft
// model's loan and equity, the construction panel's cost, loan and take-out,
// and the plan's price plus budget. Each is drawn only where the price buys
// the building outright, and its key says every figure the bar draws.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { inferStrategy, planSummary, type PlanSummary } from "@/lib/deal-strategy";
import { modelReturnsRead } from "@/lib/compare-interest";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { ReturnsHeadline } from "@/app/(app)/deals/[id]/returns-headline";
import { ConstructionDebtPanel } from "@/app/(app)/deals/[id]/construction-debt-panel";
import { PlanStrip } from "@/app/(app)/deals/[id]/plausibility-panel";
import { planStackable } from "@/app/(app)/deals/[id]/stack-bar";
import { a11yIssues, gluedWords, visibleText } from "@/lib/render-lint";

const lint = (html: string) => {
  expect(a11yIssues(html)).toEqual([]);
  expect(gluedWords(visibleText(html))).toEqual([]);
};
const bars = (html: string, name: string) => (html.match(new RegExp(`data-bar="${name}"`, "g")) ?? []).length;

const MODEL = SAMPLE_DEAL.model!;

const blankInterest = { summary: "", share: "", groundLease: "", loan: "", page: "" };
const withInterest = (kind: string): ExtractionResult =>
  ({
    dealName: "Test",
    assetClass: "multifamily",
    market: "Philadelphia, PA",
    address: "1 Main St, Philadelphia, PA",
    metrics: [{ label: "Asking price", value: "$68,000,000", flagged: false, page: "p. 2" }],
    interest: { ...blankInterest, kind },
  }) as unknown as ExtractionResult;

describe("ReturnsHeadline — the model's loan and equity as one bar", () => {
  it("draws the loan and the equity, a tick at the price, and every figure in the key", () => {
    const html = renderToStaticMarkup(React.createElement(ReturnsHeadline, { model: MODEL }));
    expect(html).toContain('data-qa="model-capital-stack"');
    expect(bars(html, "model-loan")).toBe(1);
    expect(bars(html, "model-equity")).toBe(1);
    const r = MODEL.returns;
    const text = visibleText(html);
    expect(text).toContain("Loan $");
    expect(text).toContain("Equity $");
    // The equity pays the closing costs and fees past the price: the tick
    // marks the price, and the key names the rest.
    if (r.loanAmount + r.equity - r.purchasePrice > 1000) {
      expect(bars(html, "model-price")).toBe(1);
      expect(text).toMatch(/Price \$[\d.]+M; the \$[\d.,]+[kM]? past it is closing costs and fees, paid in equity/);
    }
    // The tiles stay, below the picture.
    expect(text).toContain("Levered IRR");
    expect(html.indexOf("model-capital-stack")).toBeLessThan(html.indexOf("Levered IRR"));
    lint(html);
  });

  it("draws no tick where the equity pays nothing past the price, and says so", () => {
    const r = MODEL.returns;
    const model = { ...MODEL, returns: { ...r, equity: r.purchasePrice - r.loanAmount } };
    const html = renderToStaticMarkup(React.createElement(ReturnsHeadline, { model }));
    expect(bars(html, "model-price")).toBe(0);
    expect(visibleText(html)).toMatch(/Loan and equity together pay the \$[\d.]+M price\./);
    lint(html);
  });

  it("draws no stack on a note, a share, a leased fee or a position", () => {
    for (const kind of ["note", "partial_interest", "leased_fee", "preferred_equity"]) {
      const ex = withInterest(kind);
      const interest = modelReturnsRead(ex, { ...MODEL.returns, holdYears: MODEL.holdYears });
      expect(interest.priceBuysBuilding, kind).toBe(false);
      const html = renderToStaticMarkup(React.createElement(ReturnsHeadline, { model: MODEL, interest }));
      expect(html, kind).not.toContain("model-capital-stack");
      expect(bars(html, "model-loan"), kind).toBe(0);
    }
    // A fee simple's stack stands.
    const fee = modelReturnsRead(withInterest("fee_simple"), { ...MODEL.returns, holdYears: MODEL.holdYears });
    expect(fee.priceBuysBuilding).toBe(true);
    expect(renderToStaticMarkup(React.createElement(ReturnsHeadline, { model: MODEL, interest: fee }))).toContain(
      "model-capital-stack",
    );
  });

  it("draws nothing without an equity cheque", () => {
    const model = { ...MODEL, returns: { ...MODEL.returns, equity: 0 } };
    expect(renderToStaticMarkup(React.createElement(ReturnsHeadline, { model }))).not.toContain("model-capital-stack");
  });
});

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

describe("ConstructionDebtPanel — cost, loan and take-out as pictures", () => {
  it("splits the total cost into price plus works and the reserve, and the loan against the equity", () => {
    const html = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, props));
    for (const b of ["cl-works", "cl-reserve", "cl-loan", "cl-equity", "cl-debt", "cl-takeout"]) expect(bars(html, b), b).toBe(1);
    // Headroom at take-out: no gap drawn, no kill tone.
    expect(bars(html, "cl-gap")).toBe(0);
    const text = visibleText(html);
    expect(text).toContain("Price + works $180M");
    expect(text).toMatch(/Interest reserve \$[\d.]+M/);
    expect(text).toContain("Construction loan $117.29M, 60% of cost");
    expect(text).toMatch(/The take-out carries the whole construction loan, \$[\d.]+M to spare\./);
    // The tiles stay, under the pictures.
    expect(html.indexOf("construction-stack")).toBeLessThan(html.indexOf("Take-out headroom"));
    expect(html).not.toContain("Cash-in refinance");
    lint(html);
  });

  it("draws the cash-in at take-out in the kill tone where the NOI cannot carry the loan", () => {
    const html = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, { ...props, minDscr: 3 }));
    expect(html).toContain("Cash-in refinance at take-out");
    expect(bars(html, "cl-gap")).toBe(1);
    expect(html).toMatch(/class="absolute inset-y-0 rounded-r-full bg-kill\/70" data-bar="cl-gap"/);
    expect(visibleText(html)).toMatch(/\$[\d.]+M of the construction loan the take-out does not carry: the sponsor pays it in at stabilization/);
    lint(html);
  });

  it("draws one part where the stated budget carries its own reserve", () => {
    const carried = planSummary(
      {
        ...CONVERSION,
        metrics: CONVERSION.metrics.map((m) =>
          m.label === "Total project cost" ? { ...m, label: "Total project cost (incl. interest reserve)" } : m,
        ),
      },
      inferStrategy(CONVERSION),
    )!;
    const html = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, { ...props, plan: carried }));
    expect(bars(html, "cl-works")).toBe(1);
    expect(bars(html, "cl-reserve")).toBe(0);
    expect(visibleText(html)).toContain("its interest reserve inside the stated budget");
    lint(html);
  });

  it("draws nothing beside a price the plan withholds or a share's whole", () => {
    const withheld: PlanSummary = { ...plan, priceWithheld: "A note's price is a loan's." };
    expect(planStackable(withheld)).toBe(false);
    const share: PlanSummary = { ...plan, priceLabel: "Whole price, the share grossed up" };
    expect(planStackable(share)).toBe(false);
    const whole: PlanSummary = { ...plan, equityWhole: 20_000_000 };
    expect(planStackable(whole)).toBe(false);
    for (const p of [withheld, share, whole]) {
      const html = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, { ...props, plan: p }));
      expect(html).not.toContain("construction-stack");
      expect(html).toContain("Construction loan"); // the tiles still stand
    }
  });
});

describe("PlanStrip — price plus budget is total cost", () => {
  const strategy = inferStrategy(CONVERSION);
  it("draws the price and the budget on one bar over the total cost", () => {
    const html = renderToStaticMarkup(React.createElement(PlanStrip, { strategy, plan }));
    expect(bars(html, "plan-price")).toBe(1);
    expect(bars(html, "plan-budget")).toBe(1);
    const text = visibleText(html);
    expect(text).toContain("Price $20.0M");
    expect(text).toContain("Budget $160.0M");
    expect(text).toContain("Total cost $180.0M.");
    expect(html.indexOf("plan-cost-stack")).toBeLessThan(html.indexOf("Yield on cost"));
    lint(html);
  });

  it("draws nothing beside a withheld price, a share's whole or an all-in total", () => {
    const cases: PlanSummary[] = [
      { ...plan, priceWithheld: "The land's price under a ground lease." },
      { ...plan, priceLabel: "Whole price, the share grossed up" },
      { ...plan, budget: { ...plan.budget!, isTotal: true } },
      { ...plan, yieldWithheld: "No yield on cost is struck." },
    ];
    for (const p of cases) {
      const html = renderToStaticMarkup(React.createElement(PlanStrip, { strategy, plan: p }));
      expect(html).not.toContain("plan-cost-stack");
      expect(html).toContain("The plan");
    }
  });
});
