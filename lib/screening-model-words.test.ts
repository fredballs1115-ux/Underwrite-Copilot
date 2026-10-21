// The screening model's words held to the model: the rule the sentence
// names for its growth and its exit is the one lib/underwrite/inputs runs
// on a real deal (lib/model-evidence: never more optimistic than the
// memorandum — the more cautious of the stress test's deciding figure and
// the memorandum's stated figure, else the one that stands, else the
// default), and the defaults
// it names are the ones it runs on the sample, whose memorandum projects
// 4.0% rent growth and a 5.25% exit, and on a memorandum that states none.
import { describe, expect, it } from "vitest";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { NO_DEBT_SEEDS } from "@/lib/debt-index";
import { modelMarketFor } from "@/lib/model-market";
import { modelEvidenceFor } from "@/lib/model-evidence";
import {
  SCREENING_BUILT_ON,
  SCREENING_DEFAULTS,
  SCREENING_GROWTH_EXIT_LINE,
  SCREENING_MODEL_LINES,
  sampleScreeningPinned,
  SCREENING_GROWTH_EXIT_SAMPLE,
  SCREENING_GROWTH_EXIT_SHORT,
  SCREENING_MODEL_IS,
  SCREENING_SAMPLE_CLAUSE,
} from "@/lib/screening-model-words";
import { DEAL_TOOL_TITLE, SAMPLE_MODEL_TOOL_TITLE } from "@/app/(app)/deals/[id]/header-tools";
import { LEVER_STEPS } from "@/lib/underwrite/playground";
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
  it("names the cautious side for each, never more optimistic than the memorandum, and the conditions a figure must meet", () => {
    expect(SCREENING_DEFAULTS).toMatch(/^never more optimistic than the memorandum: rent growth at the lower of the memorandum's stated rate and the published figure the stress test decides it by, expense growth at the higher of the two/);
    expect(SCREENING_DEFAULTS).toContain("the exit at the higher of the memorandum's stated exit and the cap the stress test decides it by");
    // The conditions: the growth band (the playground's own), a fresh
    // figure, a held range read beside a fresh 10-year.
    const band = SCREENING_DEFAULTS.match(/inside (−?\d+)% to \+(\d+)% a year/)!;
    expect(Number(band[1].replace("−", "-")) / 100).toBe(LEVER_STEPS.rentGrowthPct.min);
    expect(Number(band[2]) / 100).toBe(LEVER_STEPS.rentGrowthPct.max);
    expect(SCREENING_DEFAULTS).toContain("the published one only where it is fresh");
    expect(SCREENING_DEFAULTS).toContain("where that range is fresh, dated, for the whole stock and read beside a fresh 10-year Treasury");
    expect(SCREENING_DEFAULTS.endsWith(`; ${SCREENING_SAMPLE_CLAUSE}`)).toBe(true);
  });

  it("tells the sample's surfaces its figures are pinned, never that it runs a published figure", () => {
    for (const s of [SCREENING_GROWTH_EXIT_SAMPLE, SAMPLE_MODEL_TOOL_TITLE]) {
      expect(s).not.toMatch(/published|stress test decides/);
      expect(s).toContain("pinned at 3.0% a year and its exit at its going-in cap");
    }
    expect(DEAL_TOOL_TITLE.model).toContain(SCREENING_GROWTH_EXIT_SHORT);
    expect(SCREENING_GROWTH_EXIT_SHORT).toContain("never more optimistic than the memorandum");
    const { inputs } = sampleDerivedInputs();
    expect(inputs.rentGrowthPct).toBeCloseTo(Number(SCREENING_GROWTH_EXIT_SAMPLE.match(/pinned at (\d+\.\d)%/)![1]) / 100, 10);
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

  it("runs the exit at the higher of the going-in cap and the stated exit, the one that stands alone, and the named default where neither is stated", () => {
    const goingIn = Number(SAMPLE_DEAL.extraction.metrics.find((m) => m.label === "Going-in cap")!.value.replace("%", "")) / 100;
    // The sample's 5.45% going-in cap over its 5.25% stated exit.
    expect(real(SAMPLE_DEAL.extraction).inputs.exitCapPct).toBeCloseTo(goingIn, 10);
    // A 5.75% stated exit over the going-in cap runs instead.
    const wide: ExtractionResult = {
      ...SAMPLE_DEAL.extraction,
      metrics: SAMPLE_DEAL.extraction.metrics.map((m) => (m.label === "Exit cap" ? { ...m, value: "5.75%" } : m)),
    };
    expect(real(wide).inputs.exitCapPct).toBeCloseTo(0.0575, 10);
    const noGoingIn: ExtractionResult = { ...SAMPLE_DEAL.extraction, metrics: SAMPLE_DEAL.extraction.metrics.filter((m) => !/going-in|pro forma cap/i.test(m.label)) };
    expect(real(noGoingIn).inputs.exitCapPct).toBeCloseTo(0.0525, 10);
    const noCap: ExtractionResult = { ...SAMPLE_DEAL.extraction, metrics: SAMPLE_DEAL.extraction.metrics.filter((m) => !/cap/i.test(m.label)) };
    expect(real(noCap).inputs.exitCapPct).toBeCloseTo(pctOf(/going-in cap it states or (\d+\.\d)%/), 10);
    const { inputs: bare } = deriveUnderwriteInputs(noCap, "No cap");
    expect(bare.exitCapPct).toBeCloseTo(pctOf(/going-in cap it states or (\d+\.\d)%/), 10);
  });

  it("says the sample's pinned figures off its own derived model, never typed", () => {
    const { inputs } = sampleDerivedInputs();
    const goingIn = SAMPLE_DEAL.extraction.metrics.find((m) => m.label === "Going-in cap")!.value;
    expect(sampleScreeningPinned(inputs)).toBe(`The sample's figures are pinned: 3.0% growth and an exit at its ${goingIn} going-in cap.`);
    expect(sampleScreeningPinned(inputs)).not.toMatch(/published|stress test decides/);
    // Two growths apart are said apart.
    expect(sampleScreeningPinned({ ...inputs, expenseGrowthPct: 0.034 })).toContain("3.0% rent growth, 3.4% expense growth");
  });

  it("the short lines and /how-we-test's whole rule say what the model runs", () => {
    // The more cautious of the two, never "the deciding figure" alone: the
    // OM's own figure runs where it is the more cautious (audit of PR #486).
    expect(SCREENING_GROWTH_EXIT_LINE).toBe("Growth and the exit run the more cautious of the stress test's deciding figure and the OM's, else a default");
    expect(SCREENING_BUILT_ON).toMatch(/^Built on the OM's price and terms/);
    for (const line of SCREENING_MODEL_LINES) expect(line.length, line).toBeLessThanOrEqual(260);
    const all = SCREENING_MODEL_LINES.join(" ");
    // The rule's own conditions and defaults, the ones the model runs.
    expect(all).toContain("lower of the OM's stated rate and the published figure the stress test decides it by; expense growth at the higher of the two");
    const band = all.match(/inside (−?\d+)% to \+(\d+)% a year/)!;
    expect(Number(band[1].replace("−", "-")) / 100).toBe(LEVER_STEPS.rentGrowthPct.min);
    expect(Number(band[2]) / 100).toBe(LEVER_STEPS.rentGrowthPct.max);
    expect(Number(all.match(/where neither does, (\d+\.\d)% a year/)![1]) / 100).toBeCloseTo(real({ ...SAMPLE_DEAL.extraction, metrics: SAMPLE_DEAL.extraction.metrics.filter((m) => !/growth/i.test(m.label)) }).inputs.rentGrowthPct, 10);
    const noCap: ExtractionResult = { ...SAMPLE_DEAL.extraction, metrics: SAMPLE_DEAL.extraction.metrics.filter((m) => !/cap/i.test(m.label)) };
    expect(Number(all.match(/the going-in cap the OM states, or (\d+\.\d)%/)![1]) / 100).toBeCloseTo(real(noCap).inputs.exitCapPct, 10);
    expect(all).toContain("higher of the OM's stated exit and the cap the stress test decides it by");
    expect(all).toContain("where that range is fresh, dated, for the whole stock and read beside a fresh 10-year Treasury");
    // Cautious only where the OM's own figure is the more optimistic one.
    expect(all).toContain("more cautious than it only where the OM's own figure is the more optimistic one");
    expect(all).toContain("Read off a trailing year, it is a stance, not a forecast");
    expect(all).not.toContain("a cautious stance");
    // A plan deal's rows re-run its yield on total cost, never the model.
    expect(all).toContain("On a stabilized deal a row re-runs the screening model's return; a plan deal's rows re-run its yield on total cost");
    // The sample's line, held to its model.
    const { inputs } = sampleDerivedInputs();
    expect(all).toContain(`it keeps ${(inputs.rentGrowthPct * 100).toFixed(1)}% growth and its going-in cap`);
  });

  it("introduces the model with how its growth and exit are set", () => {
    expect(SCREENING_MODEL_IS).toContain(SCREENING_DEFAULTS);
    expect(SCREENING_MODEL_IS).toMatch(/^the memorandum's price and terms/);
  });
});
