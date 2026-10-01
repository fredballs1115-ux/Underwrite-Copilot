import { describe, expect, it } from "vitest";
import { costAssumptionsLine } from "./cost-note";

describe("the costs the page's returns carry, said beside them", () => {
  it("says no transfer tax is the model's default, never the jurisdiction's rate", () => {
    const line = costAssumptionsLine({ transferTaxPct: 0, recordationTaxPct: 0, generalHoldPct: 0.01, saleCostPct: 0.02 });
    expect(line).toBe(
      "These returns carry a 1.0% closing hold and a 2.0% cost of sale, and no transfer or recordation tax: the model's default, not this jurisdiction's rate. Set each in the Excel model.",
    );
  });

  it("states a tax the inputs carry, and takes the figure's own article", () => {
    const line = costAssumptionsLine({ transferTaxPct: 0.0145, recordationTaxPct: 0.0145, generalHoldPct: 0.011, saleCostPct: 0.08 });
    expect(line).toContain("2.9% of the price in transfer and recordation tax");
    expect(line).toContain("a 1.1% closing hold");
    expect(line).toContain("an 8.0% cost of sale");
  });
});
