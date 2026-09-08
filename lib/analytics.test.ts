import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { deriveAnalytics, median, type AnalyticsRow } from "./analytics";

const metric = (label: string, value: string): ExtractedMetric => ({
  label,
  value,
  flagged: false,
  page: "",
});

const row = (
  id: string,
  name: string,
  extraction: unknown,
  over: Partial<AnalyticsRow> = {},
): AnalyticsRow => ({
  id,
  name,
  asset_class: "multifamily",
  created_at: `2026-09-0${id}T12:00:00Z`,
  is_sample: false,
  stage: "screening",
  verdict: { verdict: "pass" },
  extraction,
  ...over,
});

const STABILIZED: ExtractionResult = {
  dealName: "Maddox Apartments",
  assetClass: "multifamily",
  market: "Dallas, TX",
  address: "1 Maddox Way, Dallas, TX",
  metrics: [
    metric("Asking price", "$50,000,000"),
    metric("Going-in cap rate", "5.70%"),
    metric("NOI (in-place)", "$2,850,000"),
    metric("NOI (stabilized, pro forma)", "$3,300,000"),
    metric("Units", "248"),
  ],
};

/** The deal that started this: a $20M office shell whose OM states the
 *  finished residential building's $21M NOI and an 11.7% stabilized cap. */
const CONVERSION: ExtractionResult = {
  dealName: "1200 K Street — Office-to-Residential Conversion",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1200 K St NW, Washington, DC",
  strategy: {
    kind: "conversion",
    summary: "Convert a vacant office building into 612 apartments.",
    capitalBudget: "",
    timeline: "30 months",
  },
  metrics: [
    metric("Purchase price", "$20,000,000"),
    metric("Stabilized NOI (pro forma)", "$21,000,000"),
    metric("Stabilized cap rate", "11.7%"),
    metric("Total project cost", "$180,000,000"),
    metric("Units (proposed)", "612"),
  ],
};

describe("deriveAnalytics — the deal's kind is read first", () => {
  const deals = deriveAnalytics([
    row("1", "Maddox", STABILIZED),
    row("2", "1200 K", CONVERSION),
    row("3", "Sample", STABILIZED, { is_sample: true }),
  ]);

  it("a stabilized asset carries its going-in cap and its price per unit", () => {
    const d = deals.find((x) => x.id === "1")!;
    expect(d.kind).toBe("stabilized");
    expect(d.capPct).toBeCloseTo(5.7, 5);
    expect(d.yieldOnCostPct).toBeNull();
    expect(d.perUnit).toBeCloseTo(50_000_000 / 248, 3);
    expect(d.price).toBe(50_000_000);
  });

  it("a conversion has no going-in cap — its 11.7% is a yield on cost, never a cap point", () => {
    const d = deals.find((x) => x.id === "2")!;
    expect(d.kind).toBe("conversion");
    expect(d.capPct).toBeNull();
    expect(d.yieldOnCostPct).toBeCloseTo((21 / 180) * 100, 3);
    expect(d.price).toBe(20_000_000);
  });

  it("a plan deal's basis per unit is total cost over the planned units, not the shell's price", () => {
    const d = deals.find((x) => x.id === "2")!;
    expect(d.perUnit).toBeCloseTo(180_000_000 / 612, 3);
    expect(d.perUnit).not.toBeCloseTo(20_000_000 / 612, 0);
  });

  it("the sample deal never counts, and the series reads oldest to newest", () => {
    expect(deals.map((d) => d.id)).toEqual(["1", "2"]);
  });

  it("the cap median is a median of going-in caps only", () => {
    const caps = deals.map((d) => d.capPct).filter((v): v is number => v != null);
    expect(median(caps)).toBeCloseTo(5.7, 5);
  });
});

describe("deriveAnalytics — no pro forma figure ever fills the cap slot", () => {
  it("a pro forma cap or a yield on cost on an operating asset is not a going-in cap", () => {
    const [d] = deriveAnalytics([
      row("4", "Pro forma only", {
        ...STABILIZED,
        metrics: [
          metric("Asking price", "$50,000,000"),
          metric("Pro forma cap rate", "6.50%"),
          metric("Yield on cost", "8.0%"),
        ],
      }),
    ]);
    expect(d.kind).toBe("stabilized");
    expect(d.capPct).toBeNull();
  });

  it("a development's price is its land cost when the OM states no asking price", () => {
    const [d] = deriveAnalytics([
      row("5", "Ground-up", {
        ...STABILIZED,
        dealName: "Riverside — ground-up development site, fully entitled",
        metrics: [
          metric("Land cost", "$12,000,000"),
          metric("Stabilized NOI (pro forma)", "$9,000,000"),
          metric("Total development cost", "$120,000,000"),
        ],
      }),
    ]);
    expect(d.kind).toBe("development");
    expect(d.price).toBe(12_000_000);
    expect(d.capPct).toBeNull();
    expect(d.yieldOnCostPct).toBeCloseTo(7.5, 5);
  });
});

describe("deriveAnalytics — rows saved before the fields existed", () => {
  it("an extraction with no metrics array does not throw and reads as unknown", () => {
    const [d] = deriveAnalytics([
      row("6", "Old deal", { dealName: "Old deal", assetClass: "office" }),
    ]);
    expect(d.kind).toBe("unknown");
    expect(d.capPct).toBeNull();
    expect(d.yieldOnCostPct).toBeNull();
    expect(d.perUnit).toBeNull();
    expect(d.assetClass).toBe("office");
  });

  it("a null extraction is skipped", () => {
    expect(deriveAnalytics([row("7", "Nothing", null)])).toEqual([]);
  });
});
