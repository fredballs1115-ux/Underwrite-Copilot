import { describe, expect, it } from "vitest";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { statedModelRate } from "./stated-rate";
import type { ReconciledMetric } from "./types";

const metric = (over: Partial<ReconciledMetric>): ReconciledMetric => ({
  key: "rate",
  label: "Interest rate",
  chosenValue: "6.25%",
  unit: "%",
  sources: [{ doc: "Loan terms", value: "6.25%", locator: "term sheet", basis: "term sheet" }],
  authority: "Loan terms",
  rationale: "",
  confidence: "high",
  isConflict: false,
  ...over,
});
const model = (metrics: ReconciledMetric[], ratePct = 6.25) => ({
  inputs: { ...SAMPLE_DEAL.model.inputs, loan: { ...SAMPLE_DEAL.model.inputs.loan, ratePct } },
  metrics,
});

describe("the first-draft model's loan rate is a quote only where a document states it", () => {
  it("takes a term sheet's rate, as the sample's", () => {
    expect(statedModelRate(model([metric({})]))).toBe(6.25);
    expect(statedModelRate(SAMPLE_DEAL.model)).toBe(6);
  });

  it("refuses a rate the reconciliation assumed, however it filed it", () => {
    expect(statedModelRate(model([metric({ authority: "Market", sources: [{ doc: "Market", value: "6.25%", locator: "", basis: "market norm" }] })]))).toBeNull();
    expect(statedModelRate(model([metric({ authority: "Today's index", sources: [{ doc: "FRED", value: "4.25%", locator: "", basis: "5-yr Treasury + spread, assumed" }] })]))).toBeNull();
    // No rate metric at all: the model's rate is its own pick.
    expect(statedModelRate(model([]))).toBeNull();
    expect(statedModelRate(null)).toBeNull();
  });

  it("never reads a cap rate, a growth rate or a vacancy rate as the loan's", () => {
    const others = [
      metric({ key: "exitCap", label: "Exit cap rate" }),
      metric({ key: "rentGrowth", label: "Rent growth rate" }),
      metric({ key: "vacancy", label: "Vacancy rate" }),
    ];
    expect(statedModelRate(model(others))).toBeNull();
  });
});
