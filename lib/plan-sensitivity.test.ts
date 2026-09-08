import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { inferStrategy, planSummary } from "./deal-strategy";
import {
  BUDGET_STOPS,
  NOI_STOPS,
  buildYieldOnCostGrid,
  planBreakevens,
  spreadBucket,
} from "./plan-sensitivity";

// The conversion that started all of this: $20M shell, $160M of works
// ($180M total project cost as the OM states it), $21M stabilized NOI.
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
const plan = planSummary(CONVERSION, inferStrategy(CONVERSION));
const REF_CAP = 0.06;

describe("buildYieldOnCostGrid", () => {
  const grid = buildYieldOnCostGrid(plan, REF_CAP)!;

  it("is 5×5 with the OM's own figures at the outlined base cell", () => {
    expect(grid).not.toBeNull();
    expect(grid.noiRows).toHaveLength(NOI_STOPS.length);
    expect(grid.budgetCols).toHaveLength(BUDGET_STOPS.length);
    expect(grid.cells).toHaveLength(5);
    grid.cells.forEach((row) => expect(row).toHaveLength(5));
    const base = grid.cells[grid.baseRow][grid.baseCol];
    expect(grid.noiRows[grid.baseRow].noi).toBe(21_000_000);
    expect(grid.budgetCols[grid.baseCol].totalCost).toBe(180_000_000);
    expect(base.yieldOnCost).toBeCloseTo(21 / 180, 6);
    expect(base.yieldOnCost).toBeCloseTo(plan!.yieldOnCost!, 9);
    expect(base.spreadBps).toBe(Math.round((21 / 180 - 0.06) * 10_000)); // 567
  });

  it("falls as NOI falls down the rows and as the budget rises across the columns", () => {
    for (let r = 1; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        expect(grid.cells[r][c].yieldOnCost).toBeGreaterThan(grid.cells[r - 1][c].yieldOnCost);
      }
    }
    for (let c = 1; c < 5; c++) {
      for (let r = 0; r < 5; r++) {
        expect(grid.cells[r][c].yieldOnCost).toBeLessThan(grid.cells[r][c - 1].yieldOnCost);
      }
    }
  });

  it("stresses the budget in the direction budgets move: one saving, three overruns", () => {
    expect(BUDGET_STOPS.filter((d) => d < 0)).toHaveLength(1);
    expect(BUDGET_STOPS.filter((d) => d > 0)).toHaveLength(3);
    // The worst corner: NOI 20% short, budget 30% over — still a real yield.
    const worst = grid.cells[0][4];
    expect(worst.yieldOnCost).toBeCloseTo((21 * 0.8) / (20 + 160 * 1.3), 6);
  });

  it("is null when the OM did not state a budget, an NOI or a price — a blank is never a grid", () => {
    // No budget row AND no budget in the strategy's own words (the text is a
    // fallback the plan summary reads when no metric row carries it).
    const noBudget = planSummary(
      {
        ...CONVERSION,
        strategy: { ...CONVERSION.strategy!, capitalBudget: "" },
        metrics: CONVERSION.metrics.filter((m) => !/project cost/i.test(m.label)),
      },
      inferStrategy(CONVERSION),
    );
    expect(noBudget?.budget ?? null).toBeNull();
    expect(buildYieldOnCostGrid(noBudget, REF_CAP)).toBeNull();
    const noNoi = planSummary(
      { ...CONVERSION, metrics: CONVERSION.metrics.filter((m) => !/NOI/.test(m.label)) },
      inferStrategy(CONVERSION),
    );
    expect(buildYieldOnCostGrid(noNoi, REF_CAP)).toBeNull();
    expect(buildYieldOnCostGrid(null, REF_CAP)).toBeNull();
    expect(buildYieldOnCostGrid(plan, 0)).toBeNull();
    expect(buildYieldOnCostGrid(plan, Number.NaN)).toBeNull();
  });

  it("is null for a stabilized asset, which has no plan to stress", () => {
    const stabilized: ExtractionResult = {
      ...CONVERSION,
      dealName: "Meridian Logistics Center",
      strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
      metrics: [
        { label: "Asking price", value: "$50,000,000", flagged: false, page: "p. 5" },
        { label: "Net operating income", value: "$3,000,000", flagged: false, page: "p. 7" },
      ],
    };
    expect(planSummary(stabilized, inferStrategy(stabilized))).toBeNull();
    expect(buildYieldOnCostGrid(planSummary(stabilized, inferStrategy(stabilized)), REF_CAP)).toBeNull();
  });
});

describe("spreadBucket", () => {
  it("bands the development spread at 200 / 150 / 75 / 0 bps", () => {
    expect(spreadBucket(567)).toBe("wide");
    expect(spreadBucket(200)).toBe("wide");
    expect(spreadBucket(199)).toBe("adequate");
    expect(spreadBucket(150)).toBe("adequate");
    expect(spreadBucket(149)).toBe("thin");
    expect(spreadBucket(75)).toBe("thin");
    expect(spreadBucket(74)).toBe("none");
    expect(spreadBucket(0)).toBe("none");
    expect(spreadBucket(-1)).toBe("negative");
    expect(spreadBucket(Number.NaN)).toBe("none");
  });
});

describe("planBreakevens", () => {
  const be = planBreakevens(plan, REF_CAP)!;

  it("names the NOI floor and the cushion under the OM's figure", () => {
    expect(be.noiAtRefCap).toBeCloseTo(0.06 * 180_000_000, 6); // $10.8M
    expect(be.noiCushion).toBeCloseTo(1 - 10.8 / 21, 6); // 48.6%
  });

  it("names the overrun that erases the spread, and it plugs back exactly", () => {
    expect(be.overrunToRefCap).toBeCloseTo(1.0625, 9);
    const yieldAtOverrun = 21_000_000 / (20_000_000 + 160_000_000 * (1 + be.overrunToRefCap!));
    expect(yieldAtOverrun).toBeCloseTo(REF_CAP, 12);
  });

  it("reports a negative cushion and no overrun when the pro forma already yields less than the cap", () => {
    const under = planBreakevens(plan, 0.125)!; // 12.5% cap > 11.7% yield
    expect(under.noiCushion).toBeLessThan(0);
    expect(under.overrunToRefCap).toBeNull();
  });

  it("is null on the same blanks as the grid", () => {
    expect(planBreakevens(null, REF_CAP)).toBeNull();
    expect(planBreakevens(plan, 0)).toBeNull();
  });
});
