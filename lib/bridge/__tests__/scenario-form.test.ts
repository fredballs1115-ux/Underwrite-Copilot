import { describe, expect, it } from "vitest";
import { buildBridge, bridgeSentence } from "../attribution";
import { changedPaths } from "../fields";
import type { Assumptions } from "../model";
import {
  SCENARIO_LEVERS,
  applyScenarioForm,
  leverFor,
  leverRefusalSentence,
  leverText,
  readLever,
  type LeverField,
} from "../scenario-form";

/** The probe's deal: every percent carries more places than the form shows. */
const BASE = {
  purchasePrice: 41_250_000.4,
  holdMonths: 60,
  acqFeePct: 0,
  acqFeeCap: 0,
  transferTaxPct: 0,
  recordationTaxPct: 0,
  generalHoldPct: 0.01,
  buyerLegal: 0,
  lenderLegal: 0,
  thirdPartyReports: 0,
  miscClosing: 0,
  inPlaceRentAnnual: 4_100_000,
  expenseRecoveriesAnnual: 0,
  otherRevenueAnnual: 150_000,
  vacancyPct: 0.0612,
  rentGrowthPct: 0.03,
  expenseLines: [{ label: "Operating expenses", annual: 1_650_000 }],
  mgmtFeePct: 0.03,
  expenseGrowthPct: 0.03,
  rsf: 170_000,
  reservesPsf: 0.3,
  capitalImprovementsYr1: 0,
  tiPsf: 0,
  lcPct: 0,
  amFeePctEquity: 0,
  ltc: 0.65,
  allInRatePct: 0.0678342,
  ioMonths: 24,
  amortMonths: 360,
  financingCostPct: 0.01,
  exitCapPct: 0.0587453,
  saleCostPct: 0.02,
} as Assumptions;

/** What the browser posts: every lever's prefilled text, with `typed` over it. */
const post =
  (typed: Partial<Record<LeverField, string>> = {}) =>
  (field: LeverField): string | null =>
    typed[field] ?? leverText(leverFor(field)!, BASE[field]);

describe("the scenario form saves only what the user moved", () => {
  it("re-posting every prefilled field changes nothing, at the base's full precision", () => {
    const form = applyScenarioForm(BASE, post());
    expect(form.refused).toBeNull();
    expect(form.changed).toEqual([]);
    expect(changedPaths(BASE, form.scenario)).toEqual([]);
    expect(form.scenario.exitCapPct).toBe(0.0587453);
  });

  it("moving the price alone moves the price alone — no 5.87% → 5.87% exit cap", () => {
    const form = applyScenarioForm(BASE, post({ purchasePrice: "39,000,000" }));
    expect(form.changed).toEqual(["purchasePrice"]);
    expect(changedPaths(BASE, form.scenario)).toEqual(["purchasePrice"]);
    const sentence = bridgeSentence(buildBridge(BASE, form.scenario));
    expect(sentence).toContain("Cutting purchase price by $2.25M");
    expect(sentence).not.toContain("exit cap");
  });

  it("a lever retyped to the same figure at the input's precision is still untouched", () => {
    const form = applyScenarioForm(BASE, post({ exitCapPct: "5.870", purchasePrice: "$41,250,000" }));
    expect(form.changed).toEqual([]);
  });

  it("reads a price the way people type it", () => {
    expect(applyScenarioForm(BASE, post({ purchasePrice: "$12.5M" })).scenario.purchasePrice).toBe(12_500_000);
    expect(applyScenarioForm(BASE, post({ purchasePrice: "500k" })).scenario.purchasePrice).toBe(500_000);
    expect(applyScenarioForm(BASE, post({ exitCapPct: "6.25%" })).scenario.exitCapPct).toBeCloseTo(0.0625, 12);
  });

  it("refuses, with a sentence, what it cannot read or what the lever cannot be", () => {
    const unreadable = applyScenarioForm(BASE, post({ purchasePrice: "about 12 million" }));
    expect(unreadable.refused?.refusal).toBe("unreadable");
    expect(unreadable.scenario).toBe(BASE);
    expect(leverRefusalSentence(unreadable.refused!.lever, "unreadable")).toContain("$12.5M");
    expect(applyScenarioForm(BASE, post({ exitCapPct: "6.5M" })).refused?.refusal).toBe("range");
    expect(applyScenarioForm(BASE, post({ vacancyPct: "-2" })).refused?.refusal).toBe("range");
    expect(applyScenarioForm(BASE, post({ holdMonths: "66" })).refused?.refusal).toBe("whole_years");
    expect(leverRefusalSentence(leverFor("holdMonths")!, "whole_years")).toContain("12, 24, 36");
  });

  it("leaves a blank lever as it was", () => {
    expect(readLever(SCENARIO_LEVERS[1], "  ")).toBeNull();
    expect(applyScenarioForm(BASE, post({ exitCapPct: "" })).changed).toEqual([]);
  });
});
