import { describe, expect, it } from "vitest";
import { costAssumptionsLine } from "./cost-note";

describe("the costs the page's returns carry, said beside them", () => {
  it("says no transfer tax is modelled, never that a jurisdiction has a rate, and that the exit carries none either", () => {
    const line = costAssumptionsLine({ transferTaxPct: 0, recordationTaxPct: 0, generalHoldPct: 0.01, saleCostPct: 0.02 });
    expect(line).toBe(
      "These returns carry a 1.0% closing hold and a 2.0% cost of sale, and no transfer or recordation tax: none is modelled on the purchase, and the cost of sale carries none a seller may owe at the exit. Set each in the Excel model, entering the jurisdiction's tax where it levies one.",
    );
    // A Texas deal levies none: the line must not read as if its rate were
    // merely left out (research pass 27).
    expect(line).not.toMatch(/this jurisdiction's rate/);
  });

  it("states a tax the inputs carry, where the model charges it, and takes the figure's own article", () => {
    const line = costAssumptionsLine({ transferTaxPct: 0.0145, recordationTaxPct: 0.0145, generalHoldPct: 0.011, saleCostPct: 0.08 });
    expect(line).toContain("2.9% of the price in transfer and recordation tax on the purchase");
    expect(line).toContain("a 1.1% closing hold");
    expect(line).toContain("an 8.0% cost of sale");
  });
});
