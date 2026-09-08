import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { dealContextFor } from "./deal-context";

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });

const CONVERSION: ExtractionResult = {
  dealName: "1200 K Street — Office-to-Residential Conversion",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1200 K St NW, Washington, DC",
  strategy: {
    kind: "conversion",
    summary: "Convert the vacant office building into 612 apartments.",
    capitalBudget: "",
    timeline: "24 months of construction, 12 months of lease-up.",
  },
  metrics: [
    m("Purchase price", "$20,000,000"),
    m("NOI (stabilized, pro forma)", "$21,000,000"),
    m("Total project cost", "$180,000,000"),
    m("Units (proposed)", "612"),
  ],
};

describe("dealContextFor — what the screen established, for every step that reads the OM", () => {
  it("names the kind, the stabilized NOI over total cost, the all-in basis per planned unit and the timeline", () => {
    const ctx = dealContextFor(CONVERSION)!;
    expect(ctx).toContain("Deal type: Conversion — Convert the vacant office building into 612 apartments.");
    expect(ctx).toContain("over $180.0M of total cost it is a 11.7% yield on cost");
    expect(ctx).toContain("Total cost is $294k per planned unit (612 units)");
    expect(ctx).toContain("never the shell's price");
    // One period, even though the OM's timeline ended with its own.
    expect(ctx).toContain("Timeline as stated: 24 months of construction, 12 months of lease-up.");
    expect(ctx).not.toContain("lease-up..");
  });

  it("a development's basis is never the land price", () => {
    const ctx = dealContextFor({
      ...CONVERSION,
      dealName: "Riverside — ground-up development site, fully entitled",
      strategy: undefined,
      metrics: [
        m("Land cost", "$12,000,000"),
        m("Stabilized NOI (pro forma)", "$9,000,000"),
        m("Total development cost", "$120,000,000"),
        m("Units (proposed)", "300"),
      ],
    })!;
    expect(ctx).toContain("Deal type: Development");
    expect(ctx).toContain("Total cost is $400k per planned unit (300 units)");
    expect(ctx).toContain("never the land price");
    expect(ctx).not.toContain("Timeline as stated");
  });

  it("says nothing about units or timing the OM does not state", () => {
    const ctx = dealContextFor({
      ...CONVERSION,
      strategy: { ...CONVERSION.strategy!, timeline: "" },
      metrics: CONVERSION.metrics.filter((x) => !/^units/i.test(x.label)),
    })!;
    expect(ctx).toContain("11.7% yield on cost");
    expect(ctx).not.toContain("per planned unit");
    expect(ctx).not.toContain("Timeline as stated");
  });

  it("a stabilized asset gets only its type; an unknown strategy gets nothing", () => {
    expect(
      dealContextFor({
        ...CONVERSION,
        dealName: "Maddox Apartments",
        strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
        metrics: [m("Asking price", "$50,000,000"), m("Going-in cap rate", "5.70%")],
      }),
    ).toBe("Deal type: Stabilized.");
    expect(dealContextFor(null)).toBeNull();
  });
});
