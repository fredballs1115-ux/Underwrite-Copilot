// The compare table's return figures (the audit of 2026-09-30): the
// first-draft model's where it has them, the memorandum's own where it does
// not — the yield on cost the deal's header prints, the going-in cap the
// pipeline card prints — each said as which it is.
import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { inferStrategy, planSummary } from "./deal-strategy";
import { compareReturns } from "./compare-figures";
import { pickSlots } from "./pipeline-slots";

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });
const ex = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ dealName: "X", assetClass: "multifamily", market: "Dallas, TX", address: "", metrics, ...over }) as ExtractionResult;
const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };

const stabilized = ex([m("Asking price", "$42,000,000"), m("Going-in cap rate", "5.50%"), m("In-place NOI", "$2,310,000")]);
const valueAdd = ex(
  [m("Asking price", "$42,000,000"), m("Renovation budget", "$8,600,000"), m("Units", "240"), m("Going-in cap rate", "5.00%"), m("Stabilized NOI", "$3,400,000")],
  { strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" } as never },
);

describe("compareReturns — the model's figures, else the memorandum's, each said as which", () => {
  it("a plan deal with no model: the yield on cost its header prints, said as the memorandum's", () => {
    const strategy = inferStrategy(valueAdd);
    const r = compareReturns(valueAdd, null, strategy);
    expect(r.planDeal).toBe(true);
    expect(r.yoc).toBeCloseTo(planSummary(valueAdd, strategy)!.yieldOnCost! * 100, 10);
    expect(r.yocFrom).toBe("om");
    // The table's figure and the header's (and the pipeline card's) read
    // one, to the two decimals each prints it at (lib/plan-facts).
    expect(`${r.yoc!.toFixed(2)}%`).toBe(pickSlots(valueAdd, null).yoc);
    expect(pickSlots(valueAdd, null).yoc).toBe("6.72%");
    // Never a cap on a plan deal, the memorandum's stated one included.
    expect(r.cap).toBeNull();
    expect(r.capFrom).toBeNull();
    // The model's own figure stands where it has one…
    const model = { purchasePrice: 42_000_000, year1Noi: -900_000, goingInCapPct: -2.1 };
    const withModel = compareReturns(valueAdd, { ...model, yieldOnCostPct: 6.2 }, strategy);
    expect(withModel.yoc).toBe(6.2);
    expect(withModel.yocFrom).toBe("model");
    // …and a model built before the plan existed has none: the header's.
    expect(compareReturns(valueAdd, { ...model, yieldOnCostPct: null }, strategy).yocFrom).toBe("om");
  });

  it("a stabilized deal whose model has no cap: the memorandum's going-in cap, as the pipeline card reads it", () => {
    const strategy = inferStrategy(stabilized);
    const r = compareReturns(stabilized, null, strategy);
    expect(r.cap).toBe(5.5);
    expect(r.capFrom).toBe("om");
    expect(pickSlots(stabilized, null).cap).toBe("5.50%");
    // No yield on cost on a stabilized asset, from either.
    expect(r.yoc).toBeNull();
    expect(r.yocFrom).toBeNull();
    // The model's cap stands where it has one.
    const withModel = compareReturns(stabilized, { purchasePrice: 41_000_000, year1Noi: 2_304_200, goingInCapPct: 5.62 }, strategy);
    expect(withModel.cap).toBe(5.62);
    expect(withModel.capFrom).toBe("model");
    // Nothing stated and no model: nothing shown, never a guess.
    const bare = ex([m("Asking price", "$42,000,000")]);
    const none = compareReturns(bare, null, inferStrategy(bare));
    expect(none.cap).toBeNull();
    expect(none.capFrom).toBeNull();
  });

  it("never falls back where the price does not buy the building (#423): a note's cap is withheld, a share's unrun model is no whole's", () => {
    const note = ex(stabilized.metrics, { interest: { ...blank, kind: "note" } });
    const n = compareReturns(note, null, inferStrategy(note));
    expect(n.withheld).toBe("note");
    expect(n.cap).toBeNull();
    expect(n.capFrom).toBeNull();
    const share = ex(stabilized.metrics, { interest: { ...blank, kind: "partial_interest", share: "49% limited partnership interest" } });
    const s = compareReturns(share, null, inferStrategy(share));
    expect(s.withheld).toBe("share");
    expect(s.cap).toBeNull();
    expect(s.capFrom).toBeNull();
  });
});
