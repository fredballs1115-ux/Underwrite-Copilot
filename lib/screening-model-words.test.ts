// The screening model's words held to the model: the order the sentence
// names for its growth and its exit is the one lib/underwrite/inputs runs
// on a real deal (lib/model-evidence: the stress test's deciding figure,
// else the memorandum's stated figure, else the default), and the defaults
// it names are the ones it runs on the sample, whose memorandum projects
// 4.0% rent growth and a 5.25% exit, and on a memorandum that states none.
import { describe, expect, it } from "vitest";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { NO_DEBT_SEEDS } from "@/lib/debt-index";
import { modelMarketFor } from "@/lib/model-market";
import { modelEvidenceFor } from "@/lib/model-evidence";
import { SCREENING_DEFAULTS, SCREENING_MODEL_IS } from "@/lib/screening-model-words";
import type { ExtractionResult } from "@/lib/anthropic/types";

const pctOf = (re: RegExp) => Number(SCREENING_DEFAULTS.match(re)![1]) / 100;
const real = (extraction: ExtractionResult) =>
  deriveUnderwriteInputs(
    extraction,
    "Real",
    undefined,
    modelMarketFor(false, NO_DEBT_SEEDS, modelEvidenceFor({ extraction, storedAssetClass: SAMPLE_DEAL.asset_class, metro: null, reads: null })),
  );

describe("the screening model, as its words say it", () => {
  it("names the published figure first, then the memorandum's, then the default, for growth and the exit", () => {
    expect(SCREENING_DEFAULTS).toMatch(/^rent and expense growth at the published figure the stress test decides each by where it is fresh, else the memorandum's stated rate, else \d+\.\d% a year; the exit at its going-in cap/);
    expect(SCREENING_DEFAULTS).toMatch(/else the research tracker's cap range at its low end, else the memorandum's stated exit, else the going-in cap it states or \d+\.\d%;/);
  });

  it("a real deal with no published figure read runs the memorandum's stated rent growth, and the named default where it states none", () => {
    const growth = pctOf(/else (\d+\.\d)% a year/);
    const { inputs } = real(SAMPLE_DEAL.extraction);
    expect(inputs.rentGrowthPct).toBeCloseTo(0.04, 10);
    // The sample's memorandum states no expense growth.
    expect(inputs.expenseGrowthPct).toBeCloseTo(growth, 10);
  });

  it("the sample keeps the named default growth and its going-in cap, never the memorandum's", () => {
    const growth = pctOf(/keeps (\d+\.\d)% and its going-in cap/);
    const { inputs } = sampleDerivedInputs();
    expect(SAMPLE_DEAL.extraction.metrics.find((m) => m.label === "Rent growth")!.value).toBe("4.0%/yr");
    expect(inputs.rentGrowthPct).toBeCloseTo(growth, 10);
    expect(inputs.expenseGrowthPct).toBeCloseTo(growth, 10);
    const goingIn = Number(SAMPLE_DEAL.extraction.metrics.find((m) => m.label === "Going-in cap")!.value.replace("%", "")) / 100;
    expect(SAMPLE_DEAL.extraction.metrics.find((m) => m.label === "Exit cap")!.value).toBe("5.25%");
    expect(inputs.exitCapPct).toBeCloseTo(goingIn, 10);
  });

  it("runs the exit at the going-in cap where one decides, the stated exit where none does, and the named default where neither is stated", () => {
    const goingIn = Number(SAMPLE_DEAL.extraction.metrics.find((m) => m.label === "Going-in cap")!.value.replace("%", "")) / 100;
    expect(real(SAMPLE_DEAL.extraction).inputs.exitCapPct).toBeCloseTo(goingIn, 10);
    const noGoingIn: ExtractionResult = { ...SAMPLE_DEAL.extraction, metrics: SAMPLE_DEAL.extraction.metrics.filter((m) => !/going-in|pro forma cap/i.test(m.label)) };
    expect(real(noGoingIn).inputs.exitCapPct).toBeCloseTo(0.0525, 10);
    const noCap: ExtractionResult = { ...SAMPLE_DEAL.extraction, metrics: SAMPLE_DEAL.extraction.metrics.filter((m) => !/cap/i.test(m.label)) };
    expect(real(noCap).inputs.exitCapPct).toBeCloseTo(pctOf(/going-in cap it states or (\d+\.\d)%/), 10);
    const { inputs: bare } = deriveUnderwriteInputs(noCap, "No cap");
    expect(bare.exitCapPct).toBeCloseTo(pctOf(/going-in cap it states or (\d+\.\d)%/), 10);
  });

  it("introduces the model with how its growth and exit are set", () => {
    expect(SCREENING_MODEL_IS).toContain(SCREENING_DEFAULTS);
    expect(SCREENING_MODEL_IS).toMatch(/^the memorandum's price and terms/);
  });
});
