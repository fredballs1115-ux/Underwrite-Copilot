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
import { PlanStrip } from "@/app/(app)/deals/[id]/plausibility-panel";
import { SharePlan } from "@/app/share/[token]/plan-facts";
import { yieldOnCostText } from "@/lib/plan-facts";
import { DEFAULT_DRAW_PROFILE } from "@/lib/construction-debt";
import { gluedWords, visibleText } from "@/lib/render-lint";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  it("renders the grid with the OM's case at 11.67% (+567 bps) and the two exact sentences", () => {
    const html = renderToStaticMarkup(React.createElement(PlanSensitivity, { plan, refCap }));
    expect(html).toContain("Yield on cost, stressed");
    expect(html).toContain("11.67%");
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
    // The bands are a rule of thumb, said beside the swatches and in each
    // cell's title; no band's label hands down a verdict of its own.
    expect(html).toContain(
      "Shaded by a rule of thumb, not a verdict: 150–200 bps over the cap is the conventional ask for construction and lease-up risk.",
    );
    expect(html).toContain('title="200+ bps over the cap (a rule-of-thumb band)"');
    expect(html).not.toContain("built for the market");
  });

  it("prints each cell's yield to the spread's own precision, so yield less cap is the spread it prints (2026-09-30)", () => {
    // The research pass: "11.7%" over a "6.00%" cap beside "+567 bps" — one
    // number in two roundings. Every cell now reads to two decimals.
    const html = renderToStaticMarkup(React.createElement(PlanSensitivity, { plan, refCap }));
    const cells = [...html.matchAll(/font-semibold">(\d+\.\d\d)%<\/span><span class="block text-\[10px\] text-muted">([+-]?\d+) bps/g)];
    expect(cells.length).toBe(25);
    for (const [, yieldPct, bps] of cells) {
      expect(Math.round((Number(yieldPct) - refCap.pct * 100) * 100), `${yieldPct}% / ${bps} bps`).toBe(Number(bps));
    }
    expect(yieldOnCostText(plan.yieldOnCost!)).toBe("11.67%");
  });

  it("pins its row labels while the grid scrolls sideways on a phone (2026-09-30)", () => {
    // The research pass: at 390px the 560px grid scrolled inside a 266px
    // card and its row labels ("OM NOI", "−10%") scrolled away with it.
    const html = renderToStaticMarkup(React.createElement(PlanSensitivity, { plan, refCap }));
    const pinned = html.match(/<th scope="(?:row|col)" class="sticky left-0 z-10 bg-surface /g) ?? [];
    // The corner and the five NOI rows; the budget columns scroll.
    expect(pinned.length).toBe(6);
    expect(html).toMatch(/data-qa="plan-grid"[^>]*><table class="w-full min-w-\[560px\]/);
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
    // Yield on cost with the carry inside it is below the OM's 11.67%.
    expect(html).toMatch(/Yield on total cost with the carry inside it:.*10\.\d\d%/);
  });

  it("adds no second interest reserve where the stated budget includes its own, and says so", () => {
    const carried = planSummary(
      {
        ...CONVERSION,
        metrics: CONVERSION.metrics.map((m) =>
          m.label === "Total project cost" ? { ...m, label: "Total project cost (incl. interest reserve)" } : m,
        ),
      },
      inferStrategy(CONVERSION),
    )!;
    expect(carried.budget?.includesReserve).toBe(true);
    const html = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, { ...props, plan: carried }));
    // 60% of the stated $180M, with nothing added on top of it.
    expect(html).toContain("$108M");
    expect(html).not.toContain("$117.29M");
    expect(html).toContain("the stated budget includes its interest reserve");
    expect(html).toContain('data-qa="reserve-in-budget"');
    expect(html).not.toContain("The draw is assumed to average");
    // The OM's own 11.67% stands: the carry is already inside it.
    expect(html).toMatch(/Yield on total cost with the carry inside it:.*11\.67%/);
    // Without the words, the reserve goes on top as before.
    const plain = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, props));
    expect(plain).not.toContain("the stated budget includes its interest reserve");
    expect(plain).toContain("The draw is assumed to average");
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

  // The research pass: with no seed the 8% rate carried no sentence, and
  // the 60% loan-to-cost and the 6% exit cap no word that they are
  // defaults, though the model's own exit cap note says "Default 6.0% — set
  // your exit view" (lib/underwrite/inputs).
  it("says each fallback is a default where it is one: the flat rate, the loan-to-cost, the exit cap", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConstructionDebtPanel, { ...props, exitCapPct: null, rateSeed: null }),
    );
    expect(html).toMatch(/aria-label="Construction loan rate percent"[^>]*value="8"/);
    expect(html).toMatch(/aria-label="Maximum loan to cost percent"[^>]*value="60"/);
    expect(html).toMatch(/aria-label="Exit cap rate percent"[^>]*value="6"/);
    const text = visibleText(html);
    expect(text).toContain("Construction rate: a flat 8.00% placeholder, not seeded from an index — enter your quote.");
    expect(text).toContain("Default 60% loan-to-cost — enter your quote.");
    expect(text).toContain("Default 6.0% exit cap — set your exit view.");
    expect(gluedWords(text)).toEqual([]);
  });

  it("a seeded rate keeps its dated note, and an exit cap the model gave is no default", () => {
    const rateSeed = {
      pct: 7.81,
      note: "30-day avg SOFR 4.31% (FRED, Sep 17, 2026) + 350 bps construction spread, a screening default — enter your quote",
    };
    const html = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, { ...props, exitCapPct: 5.5, rateSeed }));
    expect(html).toMatch(/aria-label="Construction loan rate percent"[^>]*value="7.81"/);
    expect(html).toMatch(/aria-label="Exit cap rate percent"[^>]*value="5.5"/);
    const text = visibleText(html);
    expect(text).toContain(`Construction rate seeded from the live index: ${rateSeed.note}.`);
    expect(text).not.toContain("placeholder");
    expect(text).toContain("Default 60% loan-to-cost — enter your quote.");
    expect(text).not.toContain("exit cap — set your exit view");
  });

  it("states the draw's average from the module's own constant, never a second copy of it", () => {
    const html = renderToStaticMarkup(React.createElement(ConstructionDebtPanel, props));
    expect(visibleText(html)).toContain(
      `The draw is assumed to average ${Math.round(DEFAULT_DRAW_PROFILE * 100)}% outstanding across the works.`,
    );
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/construction-debt-panel.tsx"), "utf8");
    expect(src).not.toMatch(/\b0\.55\b/);
    expect(src).toContain("DEFAULT_DRAW_PROFILE");
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

describe("SharePlan — the plan on the shared screen", () => {
  const strategy = inferStrategy(CONVERSION);

  it("names the kind, prints the five figures and says how to read them", () => {
    const html = renderToStaticMarkup(React.createElement(SharePlan, { strategy, plan }));
    expect(html).toContain("Conversion");
    expect(html).toContain("$21.0M"); // stabilized NOI
    expect(html).toContain("$20.0M"); // price
    expect(html).toContain("Budget (total cost less price)");
    expect(html).toContain("$160.0M");
    expect(html).toContain("$180.0M"); // total cost
    expect(html).toContain("11.67%"); // yield on cost
    expect(html).toContain("24 months of construction");
    expect(html).toContain("A conversion deal has no going-in cap");
    expect(html).toContain("never a cap rate on the acquisition price");
    // Nothing from the deal page that has no counterpart here.
    expect(html).not.toContain("challenger");
  });

  it("renders nothing on a stabilized asset", () => {
    expect(renderToStaticMarkup(React.createElement(SharePlan, { strategy, plan: null }))).toBe("");
  });

  it("labels a value-add's budget as the doors times a door's cost, where that is what it is (#460)", () => {
    const va: ExtractionResult = {
      dealName: "The Parkline",
      assetClass: "multifamily",
      strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" },
      metrics: [
        { label: "Asking price", value: "$48,000,000", flagged: false, page: "p. 3" },
        { label: "NOI (stabilized, pro forma)", value: "$3,100,000", flagged: false, page: "p. 20" },
        { label: "Units to renovate", value: "192", flagged: false, page: "p. 14" },
        { label: "Renovation cost per unit", value: "$15,000", flagged: false, page: "p. 14" },
      ],
    };
    const vaStrategy = inferStrategy(va);
    const vaPlan = planSummary(va, vaStrategy)!;
    for (const html of [
      renderToStaticMarkup(React.createElement(SharePlan, { strategy: vaStrategy, plan: vaPlan })),
      renderToStaticMarkup(React.createElement(PlanStrip, { strategy: vaStrategy, plan: vaPlan })),
    ]) {
      expect(html).toContain("Budget (doors × cost a door)");
      expect(html).toContain("$2.9M");
      expect(html).toContain("$50.9M"); // total cost
      expect(html).toContain("6.09%"); // yield on cost
    }
  });

  it("prints the same five facts as the deal page's plan strip", () => {
    const share = renderToStaticMarkup(React.createElement(SharePlan, { strategy, plan }));
    const strip = renderToStaticMarkup(React.createElement(PlanStrip, { strategy, plan }));
    for (const figure of ["$21.0M", "$20.0M", "$160.0M", "$180.0M", "11.67%"]) {
      expect(share).toContain(figure);
      expect(strip).toContain(figure);
    }
  });

  // Research pass 23 said the grossed-up figure beside the entity's stated
  // loan is the equity's whole on every other surface; the plan's facts
  // still called it the whole price.
  it("calls a share's grossed-up price the equity's whole beside the entity's loan, on both panels", () => {
    const recap: ExtractionResult = {
      dealName: "Harbor View Apartments",
      assetClass: "multifamily",
      totalPages: 40,
      interest: {
        kind: "partial_interest",
        summary: "A 4.5% LP interest in the owning partnership",
        share: "4.5% limited partnership interest",
        groundLease: "",
        loan: "",
        page: "",
      },
      strategy: { kind: "value_add", summary: "Renovate 240 units", capitalBudget: "", timeline: "" },
      metrics: [
        { label: "Asking price", value: "$1,800,000", flagged: false, page: "p. 2" },
        { label: "Units", value: "240", flagged: false, page: "p. 2" },
        { label: "Entity loan balance", value: "$56,500,000", flagged: false, page: "p. 9" },
        { label: "Renovation budget", value: "$5,000,000", flagged: false, page: "p. 7" },
        { label: "NOI (stabilized, pro forma)", value: "$6,000,000", flagged: false, page: "p. 8" },
      ],
    };
    const s = inferStrategy(recap);
    const p = planSummary(recap, s)!;
    for (const html of [
      renderToStaticMarkup(React.createElement(SharePlan, { strategy: s, plan: p })),
      renderToStaticMarkup(React.createElement(PlanStrip, { strategy: s, plan: p })),
    ]) {
      const text = visibleText(html);
      expect(text).toContain("Equity's whole, the share grossed up");
      expect(text).toContain("$40.0M, the entity's $56.5M loan on top");
      expect(text).not.toContain("Whole price");
      // No total cost is struck on the equity's whole (it read $45.0M), and
      // the panel says why in one sentence.
      expect(text).not.toContain("$45.0M");
      expect(text).toContain(
        "No total cost or yield on cost is struck on the equity's whole: the building's cost is that plus the entity's $56.5M loan, which the model does not add.",
      );
      expect(gluedWords(text)).toEqual([]);
    }
  });
});
