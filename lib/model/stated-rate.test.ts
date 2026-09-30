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
const source = (doc: string, basis: string, value = "6.25%") => ({ doc, value, locator: "", basis });

describe("the first-draft model's loan rate is a quote only where a loan's own paper states it", () => {
  it("takes a term sheet's rate, as the sample's", () => {
    expect(statedModelRate(model([metric({})]))).toBe(6.25);
    expect(statedModelRate(SAMPLE_DEAL.model)).toBe(6);
  });

  it("takes a quote whatever words its basis uses", () => {
    // A lender quotes over an index; the index's name is not an assumption.
    const overIndex = metric({ sources: [source("Term sheet", "5-yr Treasury index + 185 bps")], authority: "Term sheet" });
    expect(statedModelRate(model([overIndex]))).toBe(6.25);
    const overBenchmark = metric({ sources: [source("Loan terms", "benchmark + 185 bps")] });
    expect(statedModelRate(model([overBenchmark]))).toBe(6.25);
    // A market QUOTE is a quote.
    const indicative = metric({ authority: "Lender's indicative market quote", sources: [source("Lender quote", "indicative")] });
    expect(statedModelRate(model([indicative]))).toBe(6.25);
    // An assumABLE loan's coupon is a stated rate, not an assumption.
    const assumable = metric({ authority: "OM (assumable loan)", sources: [source("OM", "assumable loan, as stated")] });
    expect(statedModelRate(model([assumable]))).toBe(6.25);
  });

  it("refuses a rate the reconciliation took from a feed, a norm or an assumption, however it filed it", () => {
    // The filing the model is most likely to produce, handed today's rates.
    const fred = metric({
      authority: "FRED",
      chosenValue: "6.78%",
      sources: [source("FRED", "5-yr Treasury 4.78% + 200 bps multifamily spread", "6.78%")],
    });
    expect(statedModelRate(model([fred], 6.78))).toBeNull();
    const today = metric({ authority: "Today's rates", sources: [source("Today's rates (read today)", "10-yr + spread")] });
    expect(statedModelRate(model([today]))).toBeNull();
    const market = metric({ authority: "Market", sources: [source("Market", "market norm")] });
    expect(statedModelRate(model([market]))).toBeNull();
    const assumed = metric({ authority: "Model assumption", sources: [source("Model", "assumed")] });
    expect(statedModelRate(model([assumed]))).toBeNull();
    // A broker's pro forma financing line is the broker's assumption.
    const proForma = metric({ authority: "OM", sources: [source("OM", "pro forma financing")] });
    expect(statedModelRate(model([proForma]))).toBeNull();
    // No rate metric at all: the model's rate is its own pick.
    expect(statedModelRate(model([]))).toBeNull();
    expect(statedModelRate(null)).toBeNull();
  });

  it("never reads another rate as the loan's", () => {
    const others = [
      metric({ key: "exitCap", label: "Exit cap rate" }),
      metric({ key: "rentGrowth", label: "Rent growth rate" }),
      metric({ key: "vacancy", label: "Vacancy rate" }),
      metric({ key: "taxRate", label: "Property tax rate" }),
      metric({ key: "mgmtFee", label: "Management fee rate" }),
      metric({ key: "turnover", label: "Turnover rate" }),
      metric({ key: "rateType", label: "Rate type" }),
    ];
    expect(statedModelRate(model(others))).toBeNull();
    // Listed ahead of an assumed loan rate, they do not stand in for it.
    const assumedLoan = metric({ authority: "Market", sources: [source("Market", "market norm")] });
    expect(statedModelRate(model([...others, assumedLoan]))).toBeNull();
    // And ahead of a quoted one, they do not hide it.
    expect(statedModelRate(model([...others, metric({})]))).toBe(6.25);
  });

  it("is the rate the model runs on, or none", () => {
    // A term sheet's 5.90% is not the 6.25% the model carries.
    const other = metric({ chosenValue: "5.90%" });
    expect(statedModelRate(model([other]))).toBeNull();
    // A value written as a fraction is still the rate.
    expect(statedModelRate(model([metric({ chosenValue: "0.0625" })]))).toBe(6.25);
  });
});
