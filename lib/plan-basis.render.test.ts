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

  it("holds a conversion that labels no count planned to no band over today's count, and says why once (audit C5, MED-3)", () => {
    // Today's count on a conversion: the plan strikes no basis over it
    // (`costPerUnitWithheld`), so no band is held to it either — the check
    // had said "not read as the finished project's" and "misread" of one deal.
    const conv = ex({
      assetClass: "Multifamily",
      dealName: "The Statler (hotel to apartments)",
      strategy: { kind: "conversion", summary: "Convert a 150-room hotel to apartments", capitalBudget: "", timeline: "" },
      metrics: [m("Total project cost", "48,500 ($000s)"), m("NOI (stabilized, pro forma)", "3,200,000"), m("Units", "150")],
    });
    const plan = checked(conv);
    expect(plan.costPerUnitWithheld).toBe(
      "No basis per unit (all-in) is struck: the memorandum labels no count proposed or planned, so its 150 units are not read as the finished project's.",
    );
    expect(plan.basisWithheld ?? null).toBeNull();
    expect(assessPlausibility(conv).map((f) => f.code)).not.toContain("basis_out_of_band");
    // The office-to-hotel case: today's 40 office units are never "keys".
    const hotel = ex({
      assetClass: "Hospitality",
      dealName: "The Exchange (office to hotel)",
      strategy: { kind: "conversion", summary: "Convert a 40-unit office building to a hotel", capitalBudget: "", timeline: "" },
      metrics: [m("Asking price", "$20,000,000"), m("Units", "40"), m("Total project cost", "$120,000,000"), m("NOI (stabilized, pro forma)", "$9,000,000")],
    });
    const findings = assessPlausibility(hotel);
    expect(findings.map((f) => f.code)).not.toContain("basis_out_of_band");
    expect(JSON.stringify(findings)).not.toMatch(/40 keys|per key/);
    const hotelPlan = checked(hotel);
    expect(hotelPlan.basisWithheld ?? null).toBeNull();
    expect(hotelPlan.costPerUnitWithheld).toContain("its 40 units are not read as the finished project's");
  });

  it("judges the basis over the count the plan states, and says it over that count (audit C3b MED-2)", () => {
    // An office-to-hotel conversion: $120M over the 160 proposed keys is
    // $750k a key, inside the band. The check had divided by today's 40
    // units, flagged $3.0M a key and withheld the plan's basis.
    const hotel = (keys: string) =>
      ex({
        assetClass: "Hospitality",
        dealName: "The Exchange (office to hotel)",
        strategy: { kind: "conversion", summary: "Convert a 40-unit office building to a 160-key hotel", capitalBudget: "", timeline: "" },
        metrics: [
          m("Asking price", "$20,000,000"),
          m("Units", "40"),
          m("Keys (proposed)", keys),
          m("Total project cost", "$120,000,000"),
          m("NOI (stabilized, pro forma)", "$9,000,000"),
        ],
      });
    const sound = hotel("160");
    expect(assessPlausibility(sound).map((f) => f.code)).not.toContain("basis_out_of_band");
    expect(checked(sound)).toMatchObject({ costPerUnit: 750_000 });
    expect(checked(sound).basisWithheld ?? null).toBeNull();
    // The reverse: a planned count that puts the basis outside the band is
    // judged on it, whatever today's count says.
    const two = hotel("2");
    expect(assessPlausibility(two).find((f) => f.code === "basis_out_of_band")?.title).toBe("$120.0M of total cost over 2 keys is $60.0M per key");
    expect(checked(two).basisWithheld).toContain("over the 2 planned keys");
  });

  it("says a development's unlabelled count as the count it states, never the building today's (audit C3b MED-2)", () => {
    const dev = ex({
      assetClass: "Multifamily",
      dealName: "Ridge Site",
      strategy: { kind: "development", summary: "Ground-up apartments", capitalBudget: "", timeline: "" },
      metrics: [m("Total project cost", "$3,000,000"), m("NOI (stabilized, pro forma)", "$400,000"), m("Units", "240")],
    });
    const plan = checked(dev);
    expect(plan.basisWithheld).toBe(
      "No all-in basis is struck: the $3.0M total cost over the 240 units it states, not labelled proposed or planned, is outside the band any market delivers at, so the total cost or the count was most likely misread.",
    );
    expect(plan.basisWithheld).not.toContain("building today");
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
