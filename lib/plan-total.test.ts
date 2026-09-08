// An OM that states an all-in total cost and no price — a sponsor who already
// owns the land, a recapitalisation — still states a total cost. The plan is
// judged on it: total cost, yield on cost, the stressed grid and the
// construction sizer all work, and nothing calls the figure "less the price".
import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import {
  budgetFromText,
  capitalBudgetFromMetrics,
  inferStrategy,
  planSummary,
  plausibilityNote,
} from "./deal-strategy";
import { buildYieldOnCostGrid, planBreakevens } from "./plan-sensitivity";
import { planFacts } from "./plan-facts";

const m = (label: string, value: string, page = ""): ExtractedMetric => ({
  label,
  value,
  flagged: false,
  page,
});

/** A development whose sponsor already owns the land: the OM states the
 *  all-in development cost and the finished project's NOI, and no price. */
const OWNED_LAND: ExtractionResult = {
  dealName: "Riverside — ground-up development, 240 units, fully entitled",
  assetClass: "multifamily",
  market: "Dallas, TX",
  address: "1 Riverside Dr, Dallas, TX",
  metrics: [
    m("Total development cost", "$60,000,000", "p. 9"),
    m("Stabilized NOI (pro forma)", "$4,500,000", "p. 11"),
    m("Units (proposed)", "240"),
  ],
};

describe("a stated total cost with no price is still a total cost", () => {
  it("the budget readers flag the figure as the total, never as 'less the price'", () => {
    expect(capitalBudgetFromMetrics(OWNED_LAND.metrics, null)).toMatchObject({
      budget: 60_000_000,
      allIn: false,
      isTotal: true,
      label: "Total development cost",
      page: "p. 9",
    });
    expect(budgetFromText("$180 million total project cost", null)).toMatchObject({
      budget: 180_000_000,
      allIn: false,
      isTotal: true,
      label: "stated total project cost",
    });
    // With a price, the split happens and the flag is off.
    expect(capitalBudgetFromMetrics(OWNED_LAND.metrics, 8_000_000)).toMatchObject({
      budget: 52_000_000,
      allIn: true,
      isTotal: false,
    });
    // A plain budget line is neither.
    expect(budgetFromText("$6M renovation budget", null)).toMatchObject({
      budget: 6_000_000,
      allIn: false,
      isTotal: false,
      label: "stated capital budget",
    });
  });

  it("the plan summary carries the total and the yield on cost, with no price", () => {
    const plan = planSummary(OWNED_LAND, inferStrategy(OWNED_LAND))!;
    expect(plan.kind).toBe("development");
    expect(plan.price).toBeNull();
    expect(plan.totalCost).toBe(60_000_000);
    expect(plan.yieldOnCost).toBeCloseTo(0.075, 9);
  });

  it("the grid and the breakevens stress that total, with nothing to add to it", () => {
    const plan = planSummary(OWNED_LAND)!;
    const grid = buildYieldOnCostGrid(plan, 0.06)!;
    expect(grid).not.toBeNull();
    expect(grid.budgetCols[grid.baseCol].totalCost).toBe(60_000_000);
    expect(grid.cells[grid.baseRow][grid.baseCol].yieldOnCost).toBeCloseTo(0.075, 9);
    expect(grid.cells[grid.baseRow][grid.baseCol].spreadBps).toBe(150);
    const be = planBreakevens(plan, 0.06)!;
    expect(be.noiAtRefCap).toBeCloseTo(3_600_000, 6);
    expect(be.overrunToRefCap).toBeCloseTo(4.5 / 0.06 / 60 - 1, 9); // a 25% overrun
  });

  it("the five facts say the budget sits inside the stated total, and show the total and the yield", () => {
    const facts = Object.fromEntries(planFacts(planSummary(OWNED_LAND)!));
    expect(facts["Budget"]).toBe("inside the stated total");
    expect(facts["Total cost"]).toBe("$60.0M");
    expect(facts["Yield on cost"]).toBe("7.5%");
    expect(facts["Price"]).toBe("not stated");
  });

  it("the challenger's brief says the acquisition is not separable, and never 'less the price'", () => {
    const s = inferStrategy(OWNED_LAND);
    const note = plausibilityNote([], s, planSummary(OWNED_LAND, s));
    expect(note).toContain("$60.0M all-in");
    expect(note).toContain("the acquisition inside it is not separable");
    expect(note).toContain("total cost $60.0M");
    expect(note).toContain("yield on total cost 7.5%");
    expect(note).not.toContain("less the price");
  });
});
