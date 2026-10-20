// The screening model's words held to the model: each default the sentence
// names is the one lib/underwrite/inputs runs, whatever the memorandum
// projects — on the sample, whose memorandum projects 4.0% rent growth and
// a 5.25% exit, and on a memorandum that states no cap.
import { describe, expect, it } from "vitest";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { SCREENING_DEFAULTS, SCREENING_MODEL_IS } from "@/lib/screening-model-words";
import type { ExtractionResult } from "@/lib/anthropic/types";

const pctOf = (re: RegExp) => Number(SCREENING_DEFAULTS.match(re)![1]) / 100;

describe("the screening model, as its words say it", () => {
  it("runs rent and expense growth at the default the sentence names, never the memorandum's", () => {
    const growth = pctOf(/growth at (\d+\.\d)% a year/);
    const { inputs } = sampleDerivedInputs();
    expect(SAMPLE_DEAL.extraction.metrics.find((m) => m.label === "Rent growth")!.value).toBe("4.0%/yr");
    expect(inputs.rentGrowthPct).toBeCloseTo(growth, 10);
    expect(inputs.expenseGrowthPct).toBeCloseTo(growth, 10);
  });

  it("runs the exit at the memorandum's going-in cap, never its stated exit, and at the named default where it states no cap", () => {
    const { inputs } = sampleDerivedInputs();
    const goingIn = Number(SAMPLE_DEAL.extraction.metrics.find((m) => m.label === "Going-in cap")!.value.replace("%", "")) / 100;
    expect(SAMPLE_DEAL.extraction.metrics.find((m) => m.label === "Exit cap")!.value).toBe("5.25%");
    expect(inputs.exitCapPct).toBeCloseTo(goingIn, 10);
    const noCap: ExtractionResult = {
      ...SAMPLE_DEAL.extraction,
      metrics: SAMPLE_DEAL.extraction.metrics.filter((m) => !/cap/i.test(m.label)),
    };
    const { inputs: bare } = deriveUnderwriteInputs(noCap, "No cap");
    expect(bare.exitCapPct).toBeCloseTo(pctOf(/\((\d+\.\d)% where it states none\)/), 10);
  });

  it("introduces the model with its defaults", () => {
    expect(SCREENING_MODEL_IS).toContain(SCREENING_DEFAULTS);
    expect(SCREENING_MODEL_IS).toMatch(/^the memorandum's price and terms/);
  });
});
