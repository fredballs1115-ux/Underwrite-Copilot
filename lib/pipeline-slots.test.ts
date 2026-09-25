// The pipeline row's three slots follow the same rule as the meeting .xlsx,
// the analytics and the comp memory: a plan deal carries its yield on cost
// and no cap; a stabilized asset its going-in cap; the price reads through
// the shared reader with the first signal as the fallback.
import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { assetClassLabel } from "./asset-class";
import { pickSlots, shownAssetClass } from "./pipeline-slots";

describe("shownAssetClass — a row never says \"Auto\"", () => {
  it("shows the stored class, the extraction's read for an auto-detect deal, and nothing before any read", () => {
    expect(shownAssetClass("office", null)).toBe("office");
    expect(shownAssetClass("auto", { assetClass: "multifamily" })).toBe("multifamily");
    expect(shownAssetClass("Auto", { assetClass: "Industrial" })).toBe("industrial");
    expect(shownAssetClass("auto", null)).toBe("");
    expect(shownAssetClass("auto", { assetClass: "auto" })).toBe("");
    expect(shownAssetClass(null, { assetClass: "retail" })).toBe("retail");
    expect(shownAssetClass("", undefined)).toBe("");
  });

  it("a known class comes back as its key whatever its case; a class the model phrased itself keeps its case", () => {
    expect(shownAssetClass("Multifamily", null)).toBe("multifamily");
    expect(shownAssetClass("auto", { assetClass: "Self_Storage" })).toBe("self_storage");
    expect(shownAssetClass("auto", { assetClass: "NNN retail" })).toBe("NNN retail");
    expect(shownAssetClass("auto", { assetClass: "Medical office / MOB" })).toBe("Medical office / MOB");
    // …so the row's label never mangles an acronym the model wrote.
    expect(assetClassLabel(shownAssetClass("auto", { assetClass: "NNN retail" }))).toBe("NNN retail");
    expect(assetClassLabel(shownAssetClass("auto", { assetClass: "SFR portfolio" }))).toBe("SFR portfolio");
    expect(assetClassLabel(shownAssetClass("auto", { assetClass: "Self_Storage" }))).toBe("Self-storage");
  });
});

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });
const ex = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ dealName: "X", assetClass: "multifamily", market: "Dallas, TX", address: "", metrics, ...over }) as ExtractionResult;

describe("pickSlots — the pipeline row agrees with the export on which figure a deal carries", () => {
  it("a stabilized asset: its going-in cap, its price, no yield on cost", () => {
    const s = pickSlots(ex([m("Asking price", "$42,000,000"), m("Going-in cap rate", "5.50%"), m("In-place NOI", "$2,310,000")]), null);
    expect(s).toEqual({ cap: "5.50%", price: "$42,000,000", yoc: null, interest: null });
  });

  it("says what the price buys where it is not the building outright (#415)", () => {
    const base = [m("Asking price", "$20,000,000"), m("Going-in cap rate", "5.50%")];
    const with_ = (interest: NonNullable<ExtractionResult["interest"]>) =>
      pickSlots(ex(base, { interest }), null).interest;
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    expect(with_({ ...blank, kind: "partial_interest", share: "49% limited partnership interest" })).toBe("49% share");
    expect(with_({ ...blank, kind: "partial_interest", share: "a majority stake" })).toBe("Share");
    expect(with_({ ...blank, kind: "note" })).toBe("Note");
    expect(with_({ ...blank, kind: "leasehold" })).toBe("Leasehold");
    expect(with_({ ...blank, kind: "leased_fee" })).toBe("Leased fee");
    expect(with_({ ...blank, kind: "fee_simple", groundLease: "a 40-year lease under the deck" })).toBeNull();
    expect(with_({ ...blank, kind: "unknown" })).toBeNull();
    expect(pickSlots(ex(base), null).interest).toBeNull();
  });

  it("a value-add with a stated going-in cap: the yield on cost, and NO cap — as the .xlsx prints 'n/a — plan'", () => {
    const s = pickSlots(
      ex([m("Asking price", "$42,000,000"), m("Renovation budget", "$8,600,000"), m("Units", "240"), m("Going-in cap rate", "5.00%"), m("Stabilized NOI", "$3,400,000")], {
        strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" } as never,
      }),
      null,
    );
    expect(s.cap).toBeNull();
    expect(s.price).toBe("$42,000,000");
    expect(s.yoc).toBe(`${((3_400_000 / 50_600_000) * 100).toFixed(1)}%`);
  });

  it("a development priced at its land: the land cost is the price, the yield on cost is over land + budget", () => {
    const s = pickSlots(
      ex([m("Land cost", "$8,000,000"), m("Construction budget", "$92,000,000"), m("Units (proposed)", "420"), m("Stabilized NOI", "$11,000,000"), m("Stabilized cap rate", "7.0%")], {
        strategy: { kind: "development", summary: "", capitalBudget: "", timeline: "" } as never,
      }),
      null,
    );
    expect(s).toEqual({ cap: null, price: "$8,000,000", yoc: "11.0%", interest: null });
  });

  it("before the extraction lands, the first signal's ask fills the price — only when it is a figure", () => {
    const bare = ex([]);
    expect(pickSlots(bare, { askPrice: "$20,000,000", goingInCap: "", perUnit: "", assetClass: "", market: "", take: "", dealName: "" } as never).price).toBe("$20,000,000");
    expect(pickSlots(bare, { askPrice: "Call for offers", goingInCap: "", perUnit: "", assetClass: "", market: "", take: "", dealName: "" } as never).price).toBeNull();
  });
});
