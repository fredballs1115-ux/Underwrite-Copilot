import { describe, expect, it } from "vitest";
import type { ExtractionResult, ExtractedMetric } from "@/lib/anthropic/types";
import {
  IMPLIED_CAP_CEILING,
  assessPlausibility,
  capitalBudgetFromMetrics,
  classifyNoi,
  inferStrategy,
  isPlanDeal,
  noiFigures,
  planSummary,
  plausibilityNote,
} from "./deal-strategy";

const metric = (
  label: string,
  value: string,
  extra: Partial<ExtractedMetric> = {},
): ExtractedMetric => ({ label, value, flagged: false, page: "", ...extra });

const ex = (
  metrics: ExtractedMetric[],
  over: Partial<ExtractionResult> = {},
): ExtractionResult => ({
  dealName: "Test Deal",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1 Test St, Washington, DC",
  metrics,
  ...over,
});

/** The deal that started this: an office building priced at $20M whose OM
 *  states the residential pro forma NOI of $21M — read by the old code as
 *  Year 1 income, a 105% cap rate displayed as fact. */
const CONVERSION = ex(
  [
    metric("Asking price", "$20,000,000", { basis: "na", page: "p. 3" }),
    metric("Stabilized NOI (pro forma)", "$21,000,000", { basis: "pro_forma", page: "p. 41" }),
    metric("Total project cost", "$180,000,000", { basis: "pro_forma", page: "p. 44" }),
    metric("Units (proposed)", "612", { basis: "pro_forma" }),
    metric("Construction period", "30 months", { basis: "pro_forma" }),
  ],
  { dealName: "1200 K Street — Office-to-Residential Conversion", assetClass: "multifamily" },
);

const STABILIZED = ex([
  metric("Asking price", "$68,000,000", { basis: "na" }),
  metric("Going-in cap rate", "5.7%", { basis: "in_place" }),
  metric("NOI (in-place)", "$3,876,000", { basis: "in_place" }),
  metric("NOI (stabilized, pro forma)", "$4,300,000", { basis: "pro_forma" }),
  metric("Units", "248", { basis: "na" }),
]);

describe("inferStrategy", () => {
  it("reads a conversion off the deal's own name", () => {
    const s = inferStrategy(CONVERSION);
    expect(s.kind).toBe("conversion");
    expect(s.source).toBe("inferred");
  });

  it("takes the extraction's stated strategy over the heuristics", () => {
    const s = inferStrategy(
      ex(CONVERSION.metrics, {
        dealName: "1200 K Street",
        strategy: { kind: "lease_up", summary: "Lease the vacant floors.", capitalBudget: "", timeline: "" },
      }),
    );
    expect(s.kind).toBe("lease_up");
    expect(s.source).toBe("extraction");
    expect(s.summary).toBe("Lease the vacant floors.");
  });

  it("ignores an extraction strategy of unknown and falls back to the words", () => {
    const s = inferStrategy(
      ex(CONVERSION.metrics, {
        dealName: "Ground-up development site, fully entitled",
        strategy: { kind: "unknown", summary: "", capitalBudget: "", timeline: "" },
      }),
    );
    expect(s.kind).toBe("development");
  });

  it("reads value-add from a renovation budget line, lease-up from the first signal's take", () => {
    expect(
      inferStrategy(ex([metric("Renovation budget", "$4,200,000")], { dealName: "Maddox Apartments" })).kind,
    ).toBe("value_add");
    expect(
      inferStrategy(ex([metric("Asking price", "$9M")], { dealName: "Plain Name" }), {
        take: "A spec industrial building in lease-up with no tenants signed.",
      }).kind,
    ).toBe("lease_up");
  });

  it("names the most specific plan when several words appear", () => {
    // A conversion is also renovation and also a lease-up: say conversion.
    expect(
      inferStrategy(
        ex([metric("Renovation budget", "$90M"), metric("Lease-up period", "18 months")], {
          dealName: "Adaptive reuse of the Carr Building",
        }),
      ).kind,
    ).toBe("conversion");
  });

  it("calls an operating asset with no plan words stabilized, and nothing at all unknown", () => {
    expect(inferStrategy(STABILIZED).kind).toBe("stabilized");
    expect(inferStrategy(null).kind).toBe("unknown");
    expect(inferStrategy(ex([], { dealName: null }))).toMatchObject({ kind: "unknown", source: "none" });
  });
});

describe("classifyNoi / noiFigures", () => {
  it("tells the three NOIs apart by label, then by basis", () => {
    expect(classifyNoi(metric("NOI (in-place)", "$1"))).toBe("in_place");
    expect(classifyNoi(metric("T-12 NOI", "$1"))).toBe("in_place");
    expect(classifyNoi(metric("Net operating income", "$1", { basis: "in_place" }))).toBe("in_place");
    expect(classifyNoi(metric("NOI (Year 1)", "$1"))).toBe("year1");
    expect(classifyNoi(metric("Net operating income", "$1"))).toBe("year1");
    expect(classifyNoi(metric("Net operating income", "$1", { basis: "pro_forma" }))).toBe("year1");
    expect(classifyNoi(metric("Stabilized NOI (pro forma)", "$1"))).toBe("stabilized");
    expect(classifyNoi(metric("Year 3 NOI", "$1"))).toBe("stabilized");
    expect(classifyNoi(metric("NOI at completion", "$1"))).toBe("stabilized");
  });

  it("is not fooled by per-unit figures, margins or growth", () => {
    expect(classifyNoi(metric("NOI per unit", "$15,600"))).toBeNull();
    expect(classifyNoi(metric("NOI / SF", "$12.10"))).toBeNull();
    expect(classifyNoi(metric("NOI margin", "62%"))).toBeNull();
    expect(classifyNoi(metric("NOI growth", "3%"))).toBeNull();
    expect(classifyNoi(metric("Asking price", "$20M"))).toBeNull();
  });

  it("drops a blank — a dash is not zero", () => {
    expect(noiFigures([metric("NOI (in-place)", "—"), metric("NOI (Year 1)", "n/a")])).toEqual([]);
  });
});

describe("planSummary / capitalBudgetFromMetrics", () => {
  it("reads the plan off the conversion: stabilized NOI, budget less price, total cost, yield on cost", () => {
    const p = planSummary(CONVERSION)!;
    expect(p).not.toBeNull();
    expect(p.kind).toBe("conversion");
    expect(p.price).toBe(20_000_000);
    expect(p.stabilizedNoi?.value).toBe(21_000_000);
    expect(p.budget).toMatchObject({ budget: 160_000_000, allIn: true, label: "Total project cost", page: "p. 44" });
    expect(p.totalCost).toBe(180_000_000);
    expect(p.yieldOnCost).toBeCloseTo(21 / 180, 4);
  });

  it("is null for a stabilized asset — there is no plan to summarize", () => {
    expect(planSummary(STABILIZED)).toBeNull();
    expect(planSummary(null)).toBeNull();
    expect(isPlanDeal("stabilized")).toBe(false);
    expect(isPlanDeal("conversion")).toBe(true);
  });

  it("carries the OM's own words for the budget and the timeline when the extraction states them", () => {
    const p = planSummary(
      ex(CONVERSION.metrics, {
        dealName: CONVERSION.dealName,
        strategy: {
          kind: "conversion",
          summary: "Convert 18 office floors to 612 apartments.",
          capitalBudget: "$160M hard and soft",
          timeline: "30 months of construction, stabilized in year 4",
        },
      }),
    )!;
    expect(p.capitalBudgetText).toBe("$160M hard and soft");
    expect(p.timeline).toBe("30 months of construction, stabilized in year 4");
  });

  it("reads a budget line as-is and an all-in figure less the price", () => {
    expect(capitalBudgetFromMetrics([metric("Renovation budget", "$6,000,000")], 50_000_000)).toMatchObject({
      budget: 6_000_000,
      allIn: false,
    });
    expect(capitalBudgetFromMetrics([metric("Total project cost", "$180M")], 20_000_000)).toMatchObject({
      budget: 160_000_000,
      allIn: true,
    });
    // No price to take out of an all-in figure: the figure stands, flagged all-in.
    expect(capitalBudgetFromMetrics([metric("All-in cost", "$180M")], null)).toMatchObject({
      budget: 180_000_000,
      allIn: true,
    });
  });

  it("never reads a per-unit line, an annual reserve, or a misparse as the budget", () => {
    expect(capitalBudgetFromMetrics([metric("Renovation cost per unit", "$12,000")], 50_000_000)).toBeNull();
    expect(capitalBudgetFromMetrics([metric("Capital reserve (annual)", "$74,400")], 50_000_000)).toBeNull();
    expect(capitalBudgetFromMetrics([metric("Construction budget", "$900,000,000")], 30_000_000)).toBeNull();
    expect(capitalBudgetFromMetrics([metric("Total project cost", "$15M")], 20_000_000)).toBeNull(); // below the price
    expect(capitalBudgetFromMetrics([metric("Construction budget", "—")], 20_000_000)).toBeNull();
  });
});

describe("assessPlausibility", () => {
  it("does NOT flag a conversion's stabilized NOI above the price — that is the plan, judged on yield on cost", () => {
    expect(assessPlausibility(CONVERSION)).toEqual([]);
  });

  it("on a plan deal, flags only a figure labelled as TODAY's income at that size — a label mix-up", () => {
    const f = assessPlausibility(
      ex(
        [
          metric("Asking price", "$20,000,000"),
          metric("NOI (Year 1)", "$21,000,000", { basis: "pro_forma" }),
          metric("Total project cost", "$180,000,000"),
        ],
        { dealName: "1200 K Street — Office-to-Residential Conversion" },
      ),
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: "label_mismatch", severity: "medium" });
    expect(f[0].detail).toMatch(/stabilized pro forma carrying an in-place or Year-1 label/);
  });

  it("on a deal read as stabilized, a stabilized figure far above the price means the strategy is unsettled", () => {
    const f = assessPlausibility(
      ex([metric("Asking price", "$20,000,000"), metric("Stabilized NOI (pro forma)", "$21,000,000")], {
        dealName: "Plain Building",
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: "strategy_unsettled", severity: "medium" });
    expect(f[0].detail).toMatch(/Settle what the deal is first/);
  });

  it("calls the same impossible ratio a misread when nothing says there is a plan", () => {
    const f = assessPlausibility(
      ex([metric("Asking price", "$20,000,000"), metric("Net operating income", "$21,000,000")], {
        dealName: "Plain Building",
      }),
    );
    expect(f[0]).toMatchObject({ code: "noi_exceeds_price", severity: "high" });
    expect(f[0].detail).toMatch(/misread/);
  });

  it("flags a cap rate the price could never pay even when NOI is below price", () => {
    const f = assessPlausibility(
      ex([metric("Asking price", "$20,000,000"), metric("NOI (Year 1)", "$8,000,000")], {
        dealName: "Plain Building",
      }),
    );
    expect(f[0]).toMatchObject({ code: "implied_cap_impossible", severity: "high" });
    expect(f[0].title).toContain("40%");
    expect(8_000_000 / 20_000_000).toBeGreaterThanOrEqual(IMPLIED_CAP_CEILING);
  });

  it("lets a clean stabilized deal through in silence", () => {
    expect(assessPlausibility(STABILIZED)).toEqual([]);
  });

  it("does not raise the stabilized-vs-price alarm on a value-add whose stabilized NOI is a normal yield", () => {
    const f = assessPlausibility(
      ex(
        [
          metric("Asking price", "$50,000,000"),
          metric("NOI (in-place)", "$2,600,000", { basis: "in_place" }),
          metric("Stabilized NOI (pro forma)", "$3,900,000", { basis: "pro_forma" }),
          metric("Renovation budget", "$6,000,000"),
        ],
        { dealName: "Value-add garden apartments", assetClass: "multifamily" },
      ),
    );
    expect(f.find((x) => x.code === "noi_exceeds_price" || x.code === "implied_cap_impossible")).toBeUndefined();
  });

  it("catches a stated cap that disagrees with NOI ÷ price", () => {
    const f = assessPlausibility(
      ex([
        metric("Asking price", "$50,000,000"),
        metric("Going-in cap rate", "6.0%"),
        metric("NOI (Year 1)", "$2,000,000"), // 4.0% — 200 bps off the stated cap
      ]),
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: "cap_mismatch", severity: "medium" });
    expect(f[0].title).toContain("6.00%");
    expect(f[0].title).toContain("4.00%");
  });

  it("tolerates a cap within 150 bps of the implied figure (reserves, rounding, a different year)", () => {
    expect(
      assessPlausibility(
        ex([
          metric("Asking price", "$50,000,000"),
          metric("Going-in cap rate", "6.0%"),
          metric("NOI (Year 1)", "$2,600,000"), // 5.2%
        ]),
      ),
    ).toEqual([]);
  });

  it("flags a per-unit price no market trades at as a misread of price or units", () => {
    const f = assessPlausibility(
      ex([metric("Asking price", "$68,000,000"), metric("Units", "24,800")]),
    );
    expect(f[0]).toMatchObject({ code: "basis_out_of_band", severity: "medium" });
    expect(f[0].detail).toMatch(/misread/);
  });

  it("uses per-SF bands for the commercial classes", () => {
    const f = assessPlausibility(
      ex([metric("Asking price", "$50,000,000"), metric("Rentable square feet", "2,500")], {
        assetClass: "industrial",
      }),
    );
    expect(f[0]).toMatchObject({ code: "basis_out_of_band" });
    expect(f[0].title).toContain("per SF");
  });

  it("reads a zero in-place NOI on a supposedly stabilized deal as a strategy question", () => {
    const f = assessPlausibility(
      ex([metric("Asking price", "$12,000,000"), metric("NOI (in-place)", "$0", { basis: "in_place" })]),
    );
    expect(f.find((x) => x.code === "no_income_in_place")).toBeDefined();
  });

  it("says nothing without a price to test against, and nothing for a missing extraction", () => {
    expect(assessPlausibility(ex([metric("NOI (Year 1)", "$21,000,000")]))).toEqual([]);
    expect(assessPlausibility(null)).toEqual([]);
  });

  it("reports each problem once, most severe first", () => {
    const f = assessPlausibility(
      ex([
        metric("Asking price", "$20,000,000"),
        metric("NOI (Year 1)", "$21,000,000"),
        metric("NOI (stabilized, pro forma)", "$24,000,000"),
        metric("Units", "5"),
      ]),
    );
    const codes = f.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(f[0].severity).toBe("high");
    expect(f.at(-1)!.severity).toBe("medium");
  });
});

describe("the going-in cap is never read off a plan deal's stabilized cap", () => {
  it("ignores a stabilized / pro forma cap rate when testing the stated cap against NOI ÷ price", () => {
    // 11.7% is the finished project's yield, not a going-in cap. Against the
    // in-place NOI it would read as a 500 bps mismatch — a false alarm.
    const f = assessPlausibility(
      ex(
        [
          metric("Asking price", "$20,000,000"),
          metric("NOI (in-place)", "$1,200,000", { basis: "in_place" }),
          metric("Stabilized cap rate (pro forma)", "11.7%", { basis: "pro_forma" }),
          metric("Total project cost", "$180,000,000"),
        ],
        { dealName: "Office-to-Residential Conversion" },
      ),
    );
    expect(f.find((x) => x.code === "cap_mismatch")).toBeUndefined();
  });
});

describe("plausibilityNote", () => {
  it("is empty for a clean stabilized deal — nothing to tell the skeptic", () => {
    expect(plausibilityNote([], inferStrategy(STABILIZED))).toBe("");
  });

  it("hands the challenger the plan's figures and asks it to test the pro forma's conservatism — not a misread", () => {
    const s = inferStrategy(CONVERSION);
    const note = plausibilityNote(assessPlausibility(CONVERSION, s), s, planSummary(CONVERSION, s));
    expect(note).toMatch(/DEAL STRATEGY: Conversion/);
    expect(note).toMatch(/THE PLAN AS THE OM STATES IT/);
    expect(note).toMatch(/stabilized NOI \$21\.0M/);
    expect(note).toMatch(/total cost \$180\.0M/);
    expect(note).toMatch(/yield on total cost 11\.7%/);
    expect(note).toMatch(/not a misread/);
    expect(note).toMatch(/as conservative as the deck presents it/);
    expect(note).not.toMatch(/FIGURES THAT DO NOT TIE/);
  });

  it("says plainly what the plan does not state", () => {
    const e = ex([metric("Asking price", "$9M"), metric("Renovation budget", "$1M")]);
    const s = inferStrategy(e);
    const note = plausibilityNote([], s, planSummary(e, s));
    expect(note).toMatch(/DEAL STRATEGY: Value-add/);
    expect(note).toMatch(/stabilized NOI not stated/);
    expect(note).toMatch(/timeline to stabilization not stated/);
    expect(note).toMatch(/total cost \$10\.0M/);
    expect(note).not.toMatch(/FIGURES THAT DO NOT TIE/);
  });

  it("still carries a plan deal's genuine findings alongside the plan", () => {
    const e = ex(
      [
        metric("Asking price", "$20,000,000"),
        metric("NOI (Year 1)", "$21,000,000"),
        metric("Total project cost", "$180,000,000"),
      ],
      { dealName: "Office-to-Residential Conversion" },
    );
    const s = inferStrategy(e);
    const note = plausibilityNote(assessPlausibility(e, s), s, planSummary(e, s));
    expect(note).toMatch(/THE PLAN AS THE OM STATES IT/);
    expect(note).toMatch(/FIGURES THAT DO NOT TIE/);
    expect(note).toMatch(/label/);
  });
});
