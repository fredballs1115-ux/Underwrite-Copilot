// Research pass 38, part 1's leftover (b): a plan's all-in basis per unit the
// plausibility check finds outside the band any market delivers at — a
// total cost stated in thousands, or a price and budget a few thousand
// dollars a door — still reached the deal context every Claude step reads,
// the verdict's basis line and the plan strip's basis cell beside the
// check's own finding. No basis is handed on or drawn while the finding
// stands; one sentence says why, and never prints the misread figure.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assessPlausibility, inferStrategy, planSummary, planWithBasisChecked } from "@/lib/deal-strategy";
import { YOC_WITHHELD, planFacts } from "@/lib/plan-facts";
import { buildPlanReport } from "@/lib/plan-sensitivity";
import { dealContextFor } from "@/lib/deal-context";
import { buildBrief } from "@/lib/anthropic/verdict";
import { buildMemoData } from "@/lib/memo/memo-document";
import { PlanStrip } from "@/app/(app)/deals/[id]/plausibility-panel";
import { SharePlan } from "@/app/share/[token]/plan-facts";
import { visibleText } from "@/lib/render-lint";
import { devTotalThousands, ex, m } from "@/lib/pass38.fixture";

// A value-add priced at $5,000 a door with a $2,500-a-door budget: its
// yield on cost stands (20%), its $7.5k all-in basis a door does not.
const vaCheap = ex({
  assetClass: "Multifamily",
  dealName: "Maple Ridge (value-add)",
  strategy: { kind: "value_add", summary: "Interior renovation of 200 units", capitalBudget: "", timeline: "" },
  metrics: [
    m("Asking price", "1,000,000"),
    m("Units", "200"),
    m("NOI (in-place)", "150,000", "in_place"),
    m("NOI (stabilized, pro forma)", "300,000"),
    m("Renovation budget", "500,000"),
  ],
});

const checked = (e: typeof vaCheap) => {
  const s = inferStrategy(e);
  return planWithBasisChecked(e, s, planSummary(e, s))!;
};

describe("a plan's all-in basis the plausibility check finds outside the band (research pass 38)", () => {
  it("is struck nowhere, and the sentence says why without the figure", () => {
    expect(assessPlausibility(vaCheap).some((f) => f.code === "basis_out_of_band")).toBe(true);
    const plan = checked(vaCheap);
    expect(plan.costPerUnit).toBeNull();
    expect(plan.yieldOnCost).toBeCloseTo(0.2, 6);
    expect(plan.basisWithheld).toBe(
      "No all-in basis is struck: the $1.5M total cost over the 200 units is outside the band any market delivers at, so the total cost or the count was most likely misread.",
    );
    expect(planFacts(plan, "unit")).toContainEqual(["Basis per unit (all-in)", YOC_WITHHELD]);
    // The development stated in thousands: planned units, still to be built.
    expect(checked(devTotalThousands).basisWithheld).toBe(
      "No all-in basis is struck: the $49k total cost over the 200 planned units is outside the band any market delivers at, so the total cost or the count was most likely misread.",
    );
  });

  it("keeps a basis inside the band as before", () => {
    const fine = ex({ ...vaCheap, metrics: vaCheap.metrics.map((r) => (r.label === "Asking price" ? m("Asking price", "30,000,000") : r)) });
    const plan = checked(fine);
    expect(plan.costPerUnit).toBe(152_500);
    expect(plan.basisWithheld ?? null).toBeNull();
  });

  it("reaches no Claude step: the deal context and the verdict's basis line say the sentence instead", () => {
    const context = dealContextFor(vaCheap, null, null, null)!;
    expect(context).toContain(checked(vaCheap).basisWithheld!);
    expect(context).not.toContain("per planned unit");
    expect(context).not.toContain("$7.5k");
    const brief = buildBrief({ extraction: vaCheap, dealContext: context, assetClass: "auto" } as never);
    const line = brief.slice(brief.indexOf("THE BUILDING'S BASIS"));
    expect(line).toContain("on this value-add deal it is total cost, and none is handed on.");
    expect(line.slice(0, line.indexOf("\n") < 0 ? undefined : line.indexOf("\n"))).not.toContain("$7.5k");
  });

  it("is drawn nowhere: the plan strip, the shared screen, the report's plan page and the memo", () => {
    const plan = checked(vaCheap);
    const strategy = inferStrategy(vaCheap);
    for (const html of [
      renderToStaticMarkup(React.createElement(PlanStrip, { strategy, plan })),
      renderToStaticMarkup(React.createElement(SharePlan, { strategy, plan })),
    ]) {
      const text = visibleText(html);
      expect(text).toContain(plan.basisWithheld!);
      expect(text).toContain(YOC_WITHHELD);
      expect(text).not.toContain("$7.5k");
    }
    const report = buildPlanReport(vaCheap, { pct: 0.06, provenance: "assumption" });
    expect(report?.plan.costPerUnit).toBeNull();
    expect(report?.plan.basisWithheld).toBe(plan.basisWithheld);
    const memo = buildMemoData({ name: "Maple Ridge", asset_class: "auto", extraction: vaCheap } as never, "October 5, 2026");
    expect(memo.strategyLine).toContain("20.00% yield on cost");
    expect(memo.strategyLine).not.toContain("all-in");
  });
});
