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
import { countNounOf } from "./criteria";
import { deriveInternalComps } from "./internal-comps";
import { buildComps } from "./market-memory";

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
    // The basis a comp is held against: all-in cost over the planned units.
    expect(plan.units).toBe(240);
    expect(plan.costPerUnit).toBe(250_000);
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
    expect(facts["Yield on cost"]).toBe("7.50%");
    expect(facts["Price"]).toBe("not stated");
    expect(facts["Basis per unit (all-in)"]).toBe("$250k");
    // No unit count, no basis row — never a guess.
    const noUnits = planFacts(
      planSummary({ ...OWNED_LAND, metrics: OWNED_LAND.metrics.filter((x) => !/^units/i.test(x.label)) })!,
    );
    expect(noUnits.map(([label]) => label)).not.toContain("Basis per unit (all-in)");
  });

  it("the challenger's brief says the acquisition is not separable, and never 'less the price'", () => {
    const s = inferStrategy(OWNED_LAND);
    const note = plausibilityNote([], s, planSummary(OWNED_LAND, s));
    expect(note).toContain("$60.0M all-in");
    expect(note).toContain("the acquisition inside it is not separable");
    expect(note).toContain("total cost $60.0M");
    expect(note).toContain("yield on total cost 7.50%");
    expect(note).not.toContain("less the price");
  });
});

// The audit of 2026-10-05 (LOW-9): a conversion's all-in cost was divided by
// the first count row the memorandum states — today's building's — so an
// office-to-hotel conversion stating "Units 40", "Keys (proposed) 160" and a
// $60M total cost printed "Basis per unit (all-in) $1.5M" where a proposed
// key costs $375k.
describe("a plan's basis divides by the count of what its total cost buys", () => {
  const conversion = (rows: ExtractedMetric[]): ExtractionResult => ({
    dealName: "Midtown Suites — office to hotel",
    assetClass: "hospitality",
    market: "Dallas, TX",
    address: "100 Main St, Dallas, TX",
    strategy: { kind: "conversion", summary: "Office to hotel", capitalBudget: "", timeline: "" },
    metrics: rows,
  });
  const ROWS = [
    m("Asking price", "$30,000,000"),
    m("Units", "40"),
    m("Total project cost", "$60,000,000"),
    m("Stabilized NOI", "$5,000,000"),
  ];

  it("on a conversion, the proposed count in its own noun, never today's", () => {
    const ex = conversion([...ROWS, m("Keys (proposed)", "160")]);
    const plan = planSummary(ex, inferStrategy(ex))!;
    expect(plan.units).toBe(160);
    expect(plan.costPerUnit).toBe(375_000);
    expect(plan.costPerUnitWithheld).toBeNull();
    // The plan's figures but the count are unchanged.
    expect(plan).toMatchObject({ price: 30_000_000, totalCost: 60_000_000 });
    expect(plan.yieldOnCost).toBeCloseTo(5 / 60, 9);
    const noun = countNounOf(ex.metrics, "hospitality", "conversion").one;
    expect(noun).toBe("key");
    expect(planFacts(plan, noun)).toContainEqual(["Basis per key (all-in)", "$375k"]);
    // Read without the kind, the noun is today's count row's, as before.
    expect(countNounOf(ex.metrics, "hospitality").one).toBe("unit");
  });

  it("with no count labelled proposed or planned, no basis per unit — and the plan says why", () => {
    const ex = conversion(ROWS);
    const plan = planSummary(ex, inferStrategy(ex))!;
    expect(plan.units).toBeNull();
    expect(plan.costPerUnit).toBeNull();
    expect(plan.costPerUnitWithheld).toBe(
      "No basis per unit (all-in) is struck: the memorandum labels no count proposed or planned, so its 40 units are not read as the finished project's.",
    );
    expect(planFacts(plan, "unit").map(([label]) => label)).not.toContain("Basis per unit (all-in)");
    // The rest of the plan stands.
    expect(plan).toMatchObject({ totalCost: 60_000_000 });
  });

  it("a development reads its proposed count; a value-add's units stand as they are", () => {
    const dev = {
      ...conversion([m("Land cost", "$12,000,000"), m("Total development cost", "$120,000,000"), m("Units (proposed)", "300")]),
      strategy: undefined,
    };
    expect(planSummary(dev, inferStrategy(dev))).toMatchObject({ kind: "development", units: 300, costPerUnit: 400_000 });
    const va: ExtractionResult = {
      ...conversion([m("Asking price", "$48,000,000"), m("Units", "240"), m("Renovation budget", "$12,000,000"), m("Stabilized NOI", "$4,200,000")]),
      assetClass: "multifamily",
      strategy: { kind: "value_add", summary: "Interior upgrades", capitalBudget: "", timeline: "" },
    };
    expect(planSummary(va, inferStrategy(va))).toMatchObject({ units: 240, costPerUnit: 250_000, costPerUnitWithheld: null });
  });

  it("the comp and market memories pool the plan's own basis, in the proposed count's noun", () => {
    const ex = conversion([...ROWS, m("Keys (proposed)", "160")]);
    const row = { id: "c", name: "Midtown Suites", asset_class: "hospitality", created_at: "2026-10-01T00:00:00Z", is_sample: false, verdict: null, extraction: ex };
    const [comp] = deriveInternalComps("other", "hospitality", { assetClass: "hospitality" }, [row]);
    expect(comp.basisLabel).toBe("$375k/key all-in");
    const [pooled] = buildComps([row]);
    expect(pooled).toMatchObject({ perUnit: 375_000, perUnitBasis: "unit", perUnitNoun: "key", allIn: true });
    // With no count labelled proposed, neither pools a basis.
    const bare = { ...row, extraction: conversion(ROWS) };
    expect(deriveInternalComps("other", "hospitality", { assetClass: "hospitality" }, [bare])[0]?.basisLabel ?? null).toBeNull();
    expect(buildComps([bare])[0]?.perUnit ?? null).toBeNull();
  });
});
