import { describe, expect, it } from "vitest";
import type { ExtractionResult, ExtractedMetric } from "@/lib/anthropic/types";
import {
  FORWARD_READING,
  IMPLIED_CAP_CEILING,
  STRATEGY_READING,
  assessPlausibility,
  budgetFromText,
  capitalBudgetFromMetrics,
  classifyNoi,
  findPriceMetric,
  inferStrategy,
  isForwardPurchase,
  isOutdoorStorageYard,
  isPlanDeal,
  buildsSomething,
  noiFigures,
  planSummary,
  plausibilityNote,
  priceRowIsLand,
  renovationCostPerDoor,
  renovationProgramBudget,
  timelineFromMetrics,
} from "./deal-strategy";
import { parseMoney, screenYearOf } from "./criteria";
import { planFacts } from "./plan-facts";

/** The year the bare rows below were screened in; none carries a year. */
const SCREEN_YEAR = 2026;

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
    expect(classifyNoi(metric("NOI/key", "$14,200"))).toBeNull();
    expect(classifyNoi(metric("NOI / door", "$9,800"))).toBeNull();
    expect(classifyNoi(metric("NOI / month", "$98,000"))).toBeNull();
    expect(classifyNoi(metric("NOI margin", "62%"))).toBeNull();
    expect(classifyNoi(metric("NOI growth", "3%"))).toBeNull();
    expect(classifyNoi(metric("Asking price", "$20M"))).toBeNull();
  });

  it("a slash between two names for the period is not a rate: the NOI stated under it classifies", () => {
    expect(classifyNoi(metric("NOI (T-12 / TTM)", "$1,200,000"))).toBe("in_place");
    expect(classifyNoi(metric("NOI / cash flow (in place)", "$1,200,000"))).toBe("in_place");
    expect(classifyNoi(metric("Net operating income (2025 / 2026 budget)", "$1,250,000"))).toBe("year1");
    expect(classifyNoi(metric("NOI / T-12 actual", "$1,200,000"))).toBe("in_place");
  });

  it("any other word after a slash is a denominator — a rate or a ratio the list never has to have heard of", () => {
    for (const label of [
      "NOI / RSF",
      "NOI/RSF",
      "NOI / NRA",
      "NOI / GLA",
      "NOI / Rentable SF",
      "NOI / Lot",
      "NOI / Space",
      "NOI / Property",
      "NOI / Quarter",
      "NOI / Month",
      "NOI / Price",
      "NOI / EGI",
      "Price / NOI",
      "T-12 NOI / RSF",
      "NOI / year",
    ]) {
      expect(classifyNoi(metric(label, "$12.10")), label).toBeNull();
    }
  });

  it("a year with its estimate letter, an accounting '(Loss)' and the classifiers' own period words after a slash are periods, not denominators", () => {
    expect(classifyNoi(metric("Net Operating Income / 2026E", "$1,300,000"))).toBe("year1");
    expect(classifyNoi(metric("NOI / 2026P", "$1,300,000"))).toBe("year1");
    expect(classifyNoi(metric("NOI / FY26E", "$1,300,000"))).toBe("year1");
    expect(classifyNoi(metric("NOI (2025A / 2026B)", "$1,300,000"))).toBe("year1");
    expect(classifyNoi(metric("Net Operating Income / (Loss)", "$1,300,000"))).toBe("year1");
    expect(classifyNoi(metric("NOI/(Loss)", "$1,300,000"))).toBe("year1");
    expect(classifyNoi(metric("NOI / Current", "$1,200,000"))).toBe("in_place");
    expect(classifyNoi(metric("NOI / As-Is", "$1,200,000"))).toBe("in_place");
    expect(classifyNoi(metric("NOI / At Completion", "$1,900,000"))).toBe("stabilized");
    expect(classifyNoi(metric("NOI / Untrended", "$1,900,000"))).toBe("stabilized");
    // the order of the two names does not decide
    expect(classifyNoi(metric("NOI (Current / Stabilized)", "$1,900,000"))).toBe("stabilized");
    expect(classifyNoi(metric("NOI (Stabilized / Current)", "$1,900,000"))).toBe("stabilized");
    expect(classifyNoi(metric("NOI / Yr 1", "$1,300,000"))).toBe("year1");
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

  it("builds something only on a development, a conversion, or a value-add that states its budget", () => {
    expect(buildsSomething(null, "development")).toBe(true);
    expect(buildsSomething(CONVERSION, "conversion")).toBe(true);
    // A lease-up's building is already built.
    expect(buildsSomething(ex([]), "lease_up")).toBe(false);
    expect(buildsSomething(STABILIZED, "stabilized")).toBe(false);
    // A value-add builds only where it states what it will spend.
    expect(buildsSomething(ex([metric("Asking price", "$30,000,000")]), "value_add")).toBe(false);
    expect(buildsSomething(ex([metric("Renovation budget", "$4,500,000")]), "value_add")).toBe(true);
    expect(
      buildsSomething(ex([metric("Units to renovate", "192"), metric("Renovation cost per unit", "$15,000")]), "value_add"),
    ).toBe(true);
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
    // No price to take out of an all-in figure: the figure stands as the
    // total cost itself — not "less the price", since nothing was taken out.
    expect(capitalBudgetFromMetrics([metric("All-in cost", "$180M")], null)).toMatchObject({
      budget: 180_000_000,
      allIn: false,
      isTotal: true,
    });
  });

  it("never reads a per-unit line, an annual reserve, or a misparse as the budget", () => {
    expect(capitalBudgetFromMetrics([metric("Renovation cost per unit", "$12,000")], 50_000_000)).toBeNull();
    expect(capitalBudgetFromMetrics([metric("Capital reserve (annual)", "$74,400")], 50_000_000)).toBeNull();
    expect(capitalBudgetFromMetrics([metric("Construction budget", "$900,000,000")], 30_000_000)).toBeNull();
    expect(capitalBudgetFromMetrics([metric("Total project cost", "$15M")], 20_000_000)).toBeNull(); // below the price
    expect(capitalBudgetFromMetrics([metric("Construction budget", "—")], 20_000_000)).toBeNull();
  });

  it("takes the total wherever it sits, and never a line of the budget for it", () => {
    // Hard costs listed ahead of the total: the first matching row had won,
    // so the soft costs and the land dropped out of the plan's cost.
    const lines = [
      metric("Hard costs", "$18,000,000"),
      metric("Soft costs", "$4,000,000"),
      metric("Total project cost", "$40,000,000", { page: "p. 14" }),
    ];
    expect(capitalBudgetFromMetrics(lines, 10_000_000)).toMatchObject({
      budget: 30_000_000,
      allIn: true,
      label: "Total project cost",
      page: "p. 14",
    });
    // A works budget as a whole wins over a line listed ahead of it too.
    expect(capitalBudgetFromMetrics([metric("Hard costs", "$18,000,000"), metric("Construction budget", "$22,000,000")], 10_000_000)).toMatchObject({
      budget: 22_000_000,
      label: "Construction budget",
    });
    // A total wins over a works budget, wherever the two sit.
    expect(capitalBudgetFromMetrics([metric("Construction budget", "$22,000,000"), metric("Total development cost", "$34,000,000")], 10_000_000)).toMatchObject({
      budget: 24_000_000,
      label: "Total development cost",
    });
    expect(capitalBudgetFromMetrics([metric("Total capitalization", "$40,000,000")], 10_000_000)).toMatchObject({ budget: 30_000_000, allIn: true });
  });

  it("says where the budget's own words include its interest reserve, and reads such a total at all", () => {
    // "reserve" in the label had thrown the total out entirely.
    expect(capitalBudgetFromMetrics([metric("Total project cost (incl. interest reserve)", "$180,000,000")], 20_000_000)).toMatchObject({
      budget: 160_000_000,
      allIn: true,
      includesReserve: true,
    });
    expect(capitalBudgetFromMetrics([metric("Total project cost", "$180,000,000 including capitalized interest")], 20_000_000)?.includesReserve).toBe(true);
    expect(budgetFromText("$180 million total project cost, including the interest reserve", 20_000_000)?.includesReserve).toBe(true);
    // Left out, or not said: no flag, and a reserve row is still no budget.
    expect(capitalBudgetFromMetrics([metric("Total project cost", "$180,000,000")], 20_000_000)?.includesReserve).toBeUndefined();
    expect(capitalBudgetFromMetrics([metric("Construction budget", "$160,000,000 excl. financing costs")], 20_000_000)?.includesReserve).toBeUndefined();
    expect(capitalBudgetFromMetrics([metric("Replacement reserve", "$74,400")], 20_000_000)).toBeNull();
    expect(capitalBudgetFromMetrics([metric("Interest reserve", "$6,000,000")], 20_000_000)).toBeNull();
  });

  it("with only lines of the budget stated there is no stated total: null, never a sum", () => {
    expect(capitalBudgetFromMetrics([metric("Hard costs", "$18,000,000")], 10_000_000)).toBeNull();
    expect(capitalBudgetFromMetrics([metric("Hard costs", "$18,000,000"), metric("Soft costs", "$4,000,000"), metric("Land cost", "$10,000,000")], 10_000_000)).toBeNull();
    for (const label of [
      "Construction hard costs",
      "Construction budget (hard costs)",
      "Renovation budget – soft costs",
      "Construction cost – contingency",
      "Construction budget: developer fee",
      "Renovation budget (FF&E)",
      "Construction budget – interest reserve",
      "Construction cost (land)",
    ]) {
      expect(capitalBudgetFromMetrics([metric(label, "$4,000,000")], 10_000_000), label).toBeNull();
    }
    // Hard and soft together are the works' whole; a line named only to say
    // what the figure includes or leaves out is a note, not the row.
    for (const label of ["Hard and soft costs", "Construction budget (hard & soft)", "Renovation budget (incl. contingency)", "Construction budget, excl. land", "Construction cost (land excluded)"]) {
      expect(capitalBudgetFromMetrics([metric(label, "$4,000,000")], 10_000_000)?.budget, label).toBe(4_000_000);
    }
  });

  it("the plan and the model's capital line read the one reader: hard costs ahead of the total never flatter the yield", async () => {
    const e = ex(
      [
        metric("Purchase price", "$20,000,000"),
        metric("Hard costs", "$120,000,000"),
        metric("NOI (stabilized, pro forma)", "$21,000,000"),
        metric("Total project cost", "$180,000,000"),
      ],
      { strategy: { kind: "conversion", summary: "", capitalBudget: "", timeline: "" } },
    );
    const p = planSummary(e)!;
    expect(p.budget?.label).toBe("Total project cost");
    expect(p.totalCost).toBe(180_000_000);
    // $21M over the hard costs and the price alone would have read 15.0%.
    expect(p.yieldOnCost).toBeCloseTo(21 / 180, 9);
    const { deriveUnderwriteInputs } = await import("./underwrite/inputs");
    expect(deriveUnderwriteInputs(e, "x").inputs.capitalImprovementsYr1).toBe(160_000_000);
    // Hard costs alone: no budget, no total cost, no yield on cost — and
    // the model carries no capital it was never told.
    const bare = ex([metric("Purchase price", "$20,000,000"), metric("Hard costs", "$120,000,000"), metric("NOI (stabilized, pro forma)", "$21,000,000")], {
      strategy: { kind: "conversion", summary: "", capitalBudget: "", timeline: "" },
    });
    expect(planSummary(bare)).toMatchObject({ budget: null, totalCost: null, yieldOnCost: null });
    expect(deriveUnderwriteInputs(bare, "x").inputs.capitalImprovementsYr1).toBe(0);
  });
});

describe("renovationProgramBudget — a value-add program stated a door at a time (#460)", () => {
  const VALUE_ADD = (extra: ExtractedMetric[] = [], kind: "value_add" | "stabilized" = "value_add") =>
    ex(
      [
        metric("Asking price", "$48,000,000", { basis: "na", page: "p. 3" }),
        metric("NOI (in-place)", "$2,500,000", { basis: "in_place" }),
        metric("NOI (stabilized, pro forma)", "$3,100,000", { basis: "pro_forma", page: "p. 20" }),
        metric("Units", "248", { basis: "na" }),
        metric("Units to renovate", "192", { page: "p. 14" }),
        metric("Renovation cost per unit", "$15,000", { page: "p. 14" }),
        ...extra,
      ],
      { strategy: { kind, summary: "", capitalBudget: "", timeline: "" } },
    );

  it("the plan's budget is the doors times a door's cost, derived and labelled with the arithmetic", () => {
    const p = planSummary(VALUE_ADD())!;
    expect(p.budget).toEqual({
      budget: 2_880_000,
      allIn: false,
      program: true,
      label: "192 doors × $15,000 a door, the renovation program as stated",
      page: "p. 14",
    });
    expect(p.totalCost).toBe(50_880_000);
    expect(p.yieldOnCost).toBeCloseTo(3_100_000 / 50_880_000, 6);
    // The challenger's plan line prints the arithmetic, never a stated figure.
    expect(plausibilityNote([], inferStrategy(VALUE_ADD()), p)).toContain(
      "$2.9M (192 doors × $15,000 a door, the renovation program as stated)",
    );
    // A stabilized NOI never sits above a price: it sits above today's
    // income, and over the price alone reads as a cap not earned today
    // (research pass 18 — the note had told the challenger the first).
    const note = plausibilityNote([], inferStrategy(VALUE_ADD()), p);
    expect(note).not.toContain("far above the acquisition price");
    expect(note).toContain("it is expected to sit above today's income");
  });

  it("a total the memorandum states wins, and is never added to the program", () => {
    const p = planSummary(VALUE_ADD([metric("Renovation budget", "$4,000,000", { page: "p. 15" })]))!;
    expect(p.budget).toMatchObject({ budget: 4_000_000, label: "Renovation budget" });
    expect(p.budget?.program).toBeUndefined();
    expect(p.totalCost).toBe(52_000_000);
  });

  it("no budget from a range, a total typed into the per-door row, one row alone, or a deal that is not a value-add", () => {
    const without = (label: string) => VALUE_ADD().metrics.filter((m) => m.label !== label);
    expect(renovationCostPerDoor("$12,000 - $15,000")).toBeNull();
    expect(renovationCostPerDoor("$12,000–$15,000")).toBeNull();
    expect(renovationCostPerDoor("$2,880,000")).toBeNull();
    expect(renovationCostPerDoor("$15k per unit")).toBe(15_000);
    expect(renovationProgramBudget(without("Units to renovate"), 48_000_000)).toBeNull();
    expect(renovationProgramBudget(without("Renovation cost per unit"), 48_000_000)).toBeNull();
    // An interior line that states no "per unit" is not a door's cost.
    expect(
      renovationProgramBudget([metric("Units to renovate", "192"), metric("Interior upgrade cost", "$2,000,000")], 48_000_000),
    ).toBeNull();
    // A deal the memorandum calls stabilized keeps its program as an
    // option: the plan and its budget are a value-add's alone.
    expect(planSummary(VALUE_ADD([], "stabilized"))).toBeNull();
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

  it("never calls a fitted data center or an outdoor-storage yard a misread for its price per foot", () => {
    const codes = (assetClass: string, price: string, sf: string) =>
      assessPlausibility(
        ex([metric("Asking price", price), metric("Rentable square feet", sf)], { assetClass }),
      ).map((f) => f.code);
    // $600M over 150,000 SF is $4,000/SF: a data center's price is its power.
    expect(codes("Data center", "$600,000,000", "150,000")).not.toContain("basis_out_of_band");
    // The same figures on an office are no market's.
    expect(codes("Office", "$600,000,000", "150,000")).toContain("basis_out_of_band");
    // A yard trades by the acre: $18M over a 5,000 SF shop is no misread.
    expect(codes("Industrial Outdoor Storage", "$18,000,000", "5,000")).not.toContain("basis_out_of_band");
    // A data center under the band's floor is still one.
    expect(codes("Data center", "$400,000", "150,000")).toContain("basis_out_of_band");
    // A self-storage facility that also lets outdoor storage is priced by
    // its buildings' feet: held to the band like any storage facility.
    expect(codes("Self storage with outdoor storage", "$18,000,000", "5,000")).toContain("basis_out_of_band");
  });

  it("isOutdoorStorageYard reads a yard off the deck's own words, the one test every basis reader shares", () => {
    for (const cls of ["Industrial Outdoor Storage (IOS)", "IOS", "Outdoor storage yard", "Truck terminal", "Truck yard", "Storage yard"]) {
      expect(isOutdoorStorageYard(cls), cls).toBe(true);
    }
    for (const cls of ["Industrial", "industrial", "Warehouse / distribution", "Self storage with outdoor storage", "Self-Storage", "Portfolios", "Studios", "", null, undefined]) {
      expect(isOutdoorStorageYard(cls), String(cls)).toBe(false);
    }
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
    expect(note).toMatch(/yield on total cost 11\.67%/);
    expect(note).toMatch(/not a misread/);
    expect(note).toMatch(/as conservative as the deck presents it/);
    expect(note).not.toMatch(/FIGURES THAT DO NOT TIE/);
  });

  it("says whose strategy the deal type is on a note or a leased fee, as the deal header does", () => {
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    const sold = (kind: "note" | "leased_fee" | "fee_simple") =>
      ex([metric("Asking price", "$9M"), metric("Renovation budget", "$1M")], { interest: { ...blank, kind } });
    const noteFor = (kind: "note" | "leased_fee" | "fee_simple") => {
      const e = sold(kind);
      const s = inferStrategy(e);
      return plausibilityNote([], s, planSummary(e, s), e);
    };
    expect(noteFor("note")).toMatch(/^DEAL STRATEGY: Value-add \(the collateral\) /);
    expect(noteFor("leased_fee")).toMatch(/^DEAL STRATEGY: Value-add \(the leaseholder's building\) /);
    // A price that buys the building keeps the label as it stands.
    expect(noteFor("fee_simple")).toMatch(/^DEAL STRATEGY: Value-add /);
    expect(noteFor("fee_simple")).not.toMatch(/\(the /);
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

// A forward purchase or a build-to-suit bought at delivery (research pass
// 28): the developer funds the works, so the plan's total cost is the price,
// a budget the memorandum states is the developer's, and the yield on cost
// is the NOI at delivery over the price — the buyer carries no construction.
describe("planSummary / plausibilityNote — a forward purchase", () => {
  const dev = { kind: "development" as const, summary: "", capitalBudget: "", timeline: "" };
  const bts = ex(
    [
      metric("Purchase price", "$48,000,000"),
      metric("NOI (Year 1)", "$2,880,000"),
      metric("Cap rate", "6.00%"),
      metric("Construction budget", "$31,000,000"),
      metric("Delivery date", "Q3 2027"),
    ],
    {
      assetClass: "industrial",
      strategy: { ...dev, summary: "Forward purchase of a 300,000 SF build-to-suit distribution center at completion" },
    },
  );
  const btr = ex([metric("Purchase price", "$72,000,000"), metric("Homes", "180"), metric("NOI (stabilized, pro forma)", "$3,960,000")], {
    assetClass: "sfr_btr",
    strategy: { ...dev, summary: "Forward purchase of a 180-home build-to-rent community, purchase at certificate of occupancy" },
  });

  it("builds nothing the buyer pays for: what building costs is the developer's to bear", () => {
    // The market check reads the construction cost indexes only where the
    // deal builds something; a forward purchase's works are the developer's.
    expect(buildsSomething(bts, "development")).toBe(false);
    expect(buildsSomething(btr, "development")).toBe(false);
    const own = ex(bts.metrics, { assetClass: "industrial", strategy: { ...dev, summary: "Ground-up distribution center" } });
    expect(buildsSomething(own, "development")).toBe(true);
  });

  it("strikes the total cost at the price, says the stated budget is the developer's, and reads the yield at delivery", () => {
    const plan = planSummary(bts, inferStrategy(bts))!;
    expect(plan).toMatchObject({ forward: true, price: 48_000_000, budget: null, totalCost: 48_000_000 });
    expect(plan.developerBudget?.budget).toBe(31_000_000);
    // A build-to-suit's NOI at delivery is the lease's first year.
    expect(plan.stabilizedNoi).toMatchObject({ label: "NOI (Year 1)", value: 2_880_000 });
    expect(plan.yieldOnCost).toBeCloseTo(0.06, 10);
    // A community's is its stabilized figure, over the price alone.
    const community = planSummary(btr, inferStrategy(btr))!;
    expect(community).toMatchObject({ forward: true, budget: null, developerBudget: null, totalCost: 72_000_000 });
    expect(community.yieldOnCost).toBeCloseTo(0.055, 10);
    // The same deck the buyer builds is a development: price plus budget.
    const own = ex(bts.metrics, { assetClass: "industrial", strategy: { ...dev, summary: "Ground-up distribution center" } });
    const ownPlan = planSummary(own, inferStrategy(own))!;
    expect(ownPlan.forward).toBeUndefined();
    expect(ownPlan.totalCost).toBe(79_000_000);
    expect(ownPlan.stabilizedNoi).toBeNull();
  });

  it("says the plan's facts as a forward purchase: the NOI at delivery and the developer's budget", () => {
    expect(planFacts(planSummary(bts, inferStrategy(bts))!)).toEqual([
      ["NOI at delivery", "$2.9M"],
      ["Price", "$48.0M"],
      ["Budget", "$31.0M, the developer's"],
      ["Total cost", "$48.0M"],
      ["Yield on cost", "6.00%"],
    ]);
    expect(planFacts(planSummary(btr, inferStrategy(btr))!)[2]).toEqual(["Budget", "the developer's"]);
  });

  // The audit of 2026-10-05: a lender's forward or take-out commitment was
  // read as a purchase at delivery, so a LIHTC development financed with one
  // struck its plan's cost at the land price — a 57.8% yield on cost where
  // the stated total makes it 4.2%.
  it("reads a lender's forward or take-out commitment as a loan, and never strikes a plan's cost at a land price", () => {
    const lihtc = ex(
      [
        metric("Land cost", "$4,500,000"),
        metric("Total development cost", "$62,000,000"),
        metric("NOI (stabilized, pro forma)", "$2,600,000"),
        metric("Units (proposed)", "180"),
      ],
      {
        assetClass: "Affordable Housing (LIHTC)",
        strategy: { ...dev, summary: "New construction of 180 LIHTC units, financed with tax-exempt bonds and a Freddie Mac forward commitment.", timeline: "24-month construction" },
      },
    );
    const lifeCo = ex(
      [
        metric("Land price", "$6,000,000"),
        metric("Total development cost", "$48,000,000"),
        metric("NOI (stabilized, pro forma)", "$3,100,000"),
        metric("Units (proposed)", "240"),
      ],
      {
        assetClass: "Multifamily",
        strategy: { ...dev, summary: "Entitled site for a 240-unit ground-up development; the sponsor has a construction loan with a take-out commitment from a life company." },
      },
    );
    for (const [what, deal, total] of [
      ["a forward commitment", lihtc, 62_000_000],
      ["a take-out commitment", lifeCo, 48_000_000],
    ] as const) {
      const s = inferStrategy(deal);
      expect(isForwardPurchase(deal, s), what).toBe(false);
      expect(buildsSomething(deal, s.kind), what).toBe(true);
      const plan = planSummary(deal, s)!;
      expect(plan.forward, what).toBeUndefined();
      expect(plan.totalCost, what).toBe(total);
      expect(plan.yieldOnCost!, what).toBeLessThan(0.07);
    }
    expect(planSummary(lihtc, inferStrategy(lihtc))!.yieldOnCost).toBeCloseTo(2.6 / 62, 6);
    // A purchase at completion priced at the land is the buyer's own build.
    const atLand = ex([metric("Land cost", "$6,000,000"), metric("Total development cost", "$48,000,000")], {
      assetClass: "industrial",
      strategy: { ...dev, summary: "Forward purchase of a distribution center at completion" },
    });
    expect(isForwardPurchase(atLand, inferStrategy(atLand))).toBe(false);
    // The words of a purchase still read one beside the whole asset's price.
    expect(isForwardPurchase(bts, inferStrategy(bts))).toBe(true);
    expect(isForwardPurchase(btr, inferStrategy(btr))).toBe(true);
  });

  it("hands the challenger the purchase's plan text in place of the construction paragraph", () => {
    const s = inferStrategy(bts);
    const note = plausibilityNote(assessPlausibility(bts, s), s, planSummary(bts, s), bts);
    expect(note).toMatch(/^DEAL STRATEGY: Development/);
    expect(note).toContain("NOI at delivery $2.9M (NOI (Year 1))");
    expect(note).toContain("the $31.0M budget (Construction budget) is the developer's, who funds the works — never added to the price");
    expect(note).toContain("total cost $48.0M, the price");
    expect(note).toContain("yield on total cost 6.00%");
    expect(note).toContain("A FORWARD PURCHASE: the buyer pays the price at delivery and the developer funds the works, so the buyer carries no construction");
    expect(note).not.toContain("against the cost of construction debt");
    // The community states no budget: none is the buyer's.
    const sb = inferStrategy(btr);
    expect(plausibilityNote([], sb, planSummary(btr, sb), btr)).toContain("no construction budget is the buyer's: the developer funds the works");
    // A development the buyer builds keeps the construction paragraph: here
    // its budget, tested, and its stabilized NOI said to be unstated — a
    // year-1 NOI is no finished project's pro forma.
    const own = ex(bts.metrics, { assetClass: "industrial", strategy: { ...dev, summary: "Ground-up distribution center" } });
    const so = inferStrategy(own);
    const ownNote = plausibilityNote([], so, planSummary(own, so), own);
    expect(ownNote).toContain("Test the budget it states and its schedule against comparable projects");
    expect(ownNote).toContain("The memorandum states no stabilized NOI");
    expect(ownNote).not.toContain("A FORWARD PURCHASE");
  });

  it("opens on the purchase's own line, never a development's budget (research pass 41)", () => {
    const s = inferStrategy(bts);
    const note = plausibilityNote(assessPlausibility(bts, s), s, planSummary(bts, s), bts);
    expect(note).toMatch(/^DEAL STRATEGY: Development — Forward purchase of a 300,000 SF build-to-suit distribution center at completion/);
    expect(note).toContain(FORWARD_READING);
    expect(note).not.toContain("only a budget");
    expect(note).not.toContain(STRATEGY_READING.development);
    // Read from the deck's words alone, the purchase's line is the inferred
    // summary too, and said once.
    const inferred = ex(bts.metrics, {
      assetClass: "industrial",
      dealName: "Forward purchase of a to-be-built distribution center",
      strategy: { kind: "unknown", summary: "", capitalBudget: "", timeline: "" },
    });
    const si = inferStrategy(inferred);
    expect(si.kind).toBe("development");
    expect(si.summary).toBe(FORWARD_READING);
    const inferredNote = plausibilityNote([], si, planSummary(inferred, si), inferred);
    expect(inferredNote.split(FORWARD_READING)).toHaveLength(2);
    expect(inferredNote).not.toContain(STRATEGY_READING.development);
    // A development the buyer builds keeps its own line.
    const own = ex(bts.metrics, { assetClass: "industrial", strategy: { ...dev, summary: "Ground-up distribution center" } });
    const so = inferStrategy(own);
    expect(plausibilityNote([], so, planSummary(own, so), own)).toContain(STRATEGY_READING.development);
    const ownInferred = ex(bts.metrics, {
      assetClass: "industrial",
      dealName: "A to-be-built distribution center",
      strategy: { kind: "unknown", summary: "", capitalBudget: "", timeline: "" },
    });
    expect(inferStrategy(ownInferred).summary).toBe(STRATEGY_READING.development);
  });
});

describe("budgetFromText — the budget from the strategy's own words", () => {
  it("reads a stated budget with a unit suffix or word", () => {
    expect(budgetFromText("$160M hard and soft costs", 20_000_000)).toMatchObject({
      budget: 160_000_000,
      allIn: false,
      label: "stated capital budget",
    });
    expect(budgetFromText("approximately $160 million, hard and soft", 20_000_000)?.budget).toBe(160_000_000);
    expect(budgetFromText("$1.2bn of works", 200_000_000)?.budget).toBe(1_200_000_000);
    expect(budgetFromText("$450,000 renovation", 3_000_000)?.budget).toBe(450_000);
  });

  it("takes the price out of an all-in figure, and never invents one", () => {
    expect(budgetFromText("$180 million total project cost", 20_000_000)).toMatchObject({
      budget: 160_000_000,
      allIn: true,
    });
    expect(budgetFromText("", 20_000_000)).toBeNull();
    expect(budgetFromText(null, 20_000_000)).toBeNull();
    expect(budgetFromText("to be determined", 20_000_000)).toBeNull();
    // A rate is not a budget; ten times the price is not a budget either.
    expect(budgetFromText("$50/SF for the lobby", 20_000_000)).toBeNull();
    expect(budgetFromText("$900M", 20_000_000)).toBeNull();
    // An all-in figure at or below the price is no budget at all.
    expect(budgetFromText("$20M all-in basis", 20_000_000)).toBeNull();
  });

  it("planSummary falls back to the strategy text when no metric row carries the budget", () => {
    const noBudgetRow = ex(
      [
        metric("Asking price", "$20,000,000", { basis: "na", page: "p. 3" }),
        metric("Stabilized NOI (pro forma)", "$21,000,000", { basis: "pro_forma", page: "p. 41" }),
      ],
      {
        dealName: "1200 K Street — Office-to-Residential Conversion",
        strategy: {
          kind: "conversion",
          summary: "Convert the vacant office building into 320 apartments.",
          capitalBudget: "$160M hard and soft costs",
          timeline: "24 months of works",
        },
      },
    );
    const plan = planSummary(noBudgetRow)!;
    expect(plan.budget).toMatchObject({ budget: 160_000_000, allIn: false });
    expect(plan.budget?.page).toBeUndefined();
    expect(plan.totalCost).toBe(180_000_000);
    expect(plan.yieldOnCost).toBeCloseTo(21 / 180, 9);
    // The metric row still wins when both exist — it carries a page.
    const both = ex([...noBudgetRow.metrics, metric("Renovation budget", "$150,000,000", { page: "p. 44" })], {
      strategy: noBudgetRow.strategy,
    });
    expect(planSummary(both)!.budget).toMatchObject({ budget: 150_000_000, page: "p. 44" });
  });
});

describe("timelineFromMetrics — the plan's timing from metric rows", () => {
  it("joins the rows that speak to timing and ignores blanks", () => {
    const t = timelineFromMetrics([
      metric("Construction period", "30 months"),
      metric("Stabilized in", "year 4"),
      metric("Lease-up period", "—"),
      metric("Asking price", "$20M"),
    ]);
    expect(t).toBe("Construction period: 30 months; Stabilized in: year 4");
    expect(timelineFromMetrics([metric("Asking price", "$20M")])).toBe("");
  });

  it("planSummary uses the strategy's words first and the rows only when they are blank", () => {
    const rowsOnly = planSummary(CONVERSION)!; // CONVERSION carries "Construction period: 30 months"
    expect(rowsOnly.timeline).toBe("Construction period: 30 months");
    const stated = planSummary(
      ex(CONVERSION.metrics, {
        dealName: CONVERSION.dealName,
        strategy: { kind: "conversion", summary: "", capitalBudget: "", timeline: "24 months of works, 12 of lease-up" },
      }),
    )!;
    expect(stated.timeline).toBe("24 months of works, 12 of lease-up");
  });
});

describe("findPriceMetric — a development buys land", () => {
  const DEVELOPMENT = ex(
    [
      metric("Land cost", "$8,000,000", { basis: "na", page: "p. 2" }),
      metric("Total development cost", "$60,000,000", { basis: "pro_forma", page: "p. 9" }),
      metric("Stabilized NOI (pro forma)", "$4,500,000", { basis: "pro_forma", page: "p. 11" }),
      metric("Land value (appraised)", "$9,500,000", { basis: "na" }),
    ],
    { dealName: "Ground-up development — 240 units, fully entitled" },
  );

  it("reads the land cost as the price on a development, never the appraised land value", () => {
    expect(inferStrategy(DEVELOPMENT).kind).toBe("development");
    expect(findPriceMetric(DEVELOPMENT.metrics, "development", screenYearOf(DEVELOPMENT))?.value).toBe("$8,000,000");
    const p = planSummary(DEVELOPMENT)!;
    expect(p.price).toBe(8_000_000);
    expect(p.budget).toMatchObject({ budget: 52_000_000, allIn: true });
    expect(p.totalCost).toBe(60_000_000);
    expect(p.yieldOnCost).toBeCloseTo(4.5 / 60, 9);
  });

  it("the asking price still wins when both are stated, and other deals never read a land line as the price", () => {
    const both = [metric("Land cost", "$8,000,000"), metric("Asking price", "$50,000,000")];
    expect(findPriceMetric(both, "development", SCREEN_YEAR)?.value).toBe("$50,000,000");
    expect(findPriceMetric([metric("Land cost", "$8,000,000")], "stabilized", SCREEN_YEAR)).toBeNull();
    expect(findPriceMetric([metric("Land cost", "$8,000,000")], "conversion", SCREEN_YEAR)).toBeNull();
    expect(findPriceMetric([metric("Land cost per acre", "$400,000")], "development", SCREEN_YEAR)).toBeNull();
    expect(findPriceMetric([metric("Land value", "$9,500,000")], "development", SCREEN_YEAR)).toBeNull();
  });
});

describe("planSummary.priceLabel — what the price figure is", () => {
  it("says Land cost on a development bought as land, Price everywhere else", () => {
    const dev = planSummary(
      ex(
        [
          metric("Land cost", "$8,000,000", { page: "p. 2" }),
          metric("Total development cost", "$60,000,000"),
          metric("Stabilized NOI (pro forma)", "$4,500,000"),
        ],
        { dealName: "Ground-up development — 240 units" },
      ),
    )!;
    expect(dev.priceLabel).toBe("Land cost");
    expect(planSummary(CONVERSION)!.priceLabel).toBe("Price");
    // A development with a stated asking price is priced, not land-costed.
    const priced = planSummary(
      ex(
        [
          metric("Asking price", "$12,000,000"),
          metric("Land cost", "$8,000,000"),
          metric("Total development cost", "$60,000,000"),
          metric("Stabilized NOI (pro forma)", "$4,500,000"),
        ],
        { dealName: "Ground-up development — 240 units" },
      ),
    )!;
    expect(priced.priceLabel).toBe("Price");
    expect(priced.price).toBe(12_000_000);
  });
});

// The seventh review read the derivation layer — the readers' consumers —
// and verified twelve findings by execution. The budget readers' and the
// plausibility check's are pinned here.
describe("the seventh review's budget and plausibility cases", () => {
  const mm = (label: string, value: string, page = ""): ExtractedMetric => ({ label, value, flagged: false, page });
  const exx = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult =>
    ({ dealName: "X", assetClass: "multifamily", market: "Dallas, TX", address: "", metrics, ...over }) as ExtractionResult;
  const dev = { kind: "development", summary: "", capitalBudget: "", timeline: "" } as unknown as ExtractionResult["strategy"];

  it("a per-unit or per-SF rate in the strategy's words is never the budget", () => {
    for (const t of [
      "$18,000 per unit",
      "$25,000/unit interior renovation",
      "approximately $30,000 per door",
      "$45,000 per key soft goods refresh",
      "$12,500 per unit across 312 units",
      "$85 psf of tenant improvements",
      "$60 / SF hard costs",
    ]) {
      expect(budgetFromText(t, 42_000_000), t).toBeNull();
    }
    // A whole budget in the same sentence shape still reads.
    expect(budgetFromText("$4.3M interior renovation program", 42_000_000)?.budget).toBe(4_300_000);
    expect(budgetFromText("$160M hard and soft costs", 20_000_000)?.budget).toBe(160_000_000);
  });

  it("against a land price the works are bounded by the absolute ceiling, not ten times the site", () => {
    const rows = [mm("Land cost", "$8,000,000"), mm("Construction budget", "$92,000,000")];
    // The reader, told the price is the land: the budget stands.
    expect(capitalBudgetFromMetrics(rows, 8_000_000, false)?.budget).toBe(92_000_000);
    // Told (wrongly) it is the whole asset, the old bound applies.
    expect(capitalBudgetFromMetrics(rows, 8_000_000, true)).toBeNull();
    expect(budgetFromText("$92 million construction budget", 8_000_000, false)?.budget).toBe(92_000_000);
    // A whole-asset price still refuses ten times itself — a misparse.
    expect(capitalBudgetFromMetrics([mm("Asking price", "$30,000,000"), mm("Construction budget", "$900,000,000")], 30_000_000)).toBeNull();
    // And nothing clears the absolute ceiling.
    expect(capitalBudgetFromMetrics([mm("Land cost", "$8,000,000"), mm("Construction budget", "$20,000,000,000")], 8_000_000, false)).toBeNull();
    // planSummary reads the price row's nature itself, for every land share.
    for (const [land, budget] of [
      ["$3,000,000", "$120,000,000"],
      ["$5,000,000", "$120,000,000"],
      ["$8,000,000", "$92,000,000"],
      ["$10,000,000", "$92,000,000"],
    ]) {
      const e = exx([mm("Land cost", land), mm("Construction budget", budget), mm("Stabilized NOI", "$11,000,000"), mm("Units (proposed)", "420")], { strategy: dev });
      const plan = planSummary(e, inferStrategy(e));
      expect(plan?.budget?.budget, `${land} + ${budget}`).toBe(parseMoney(budget));
      expect(plan?.totalCost, `${land} + ${budget}`).toBe(parseMoney(land)! + parseMoney(budget)!);
    }
    expect(priceRowIsLand(mm("Land cost", "$8,000,000"))).toBe(true);
    expect(priceRowIsLand(mm("Site acquisition", "$8,000,000"))).toBe(true);
    expect(priceRowIsLand(mm("Asking price", "$8,000,000"))).toBe(false);
    expect(priceRowIsLand(null)).toBe(false);
  });

  it("a plan deal's basis band judges total cost over the planned units — never the land or the shell", () => {
    // $12k of land per apartment to be built is what a development trades at.
    const land = exx([mm("Land price", "$5,000,000"), mm("Units (proposed)", "420"), mm("Construction budget", "$90,000,000"), mm("Stabilized NOI", "$9,000,000")], { strategy: dev });
    expect(assessPlausibility(land).map((f) => f.code)).not.toContain("basis_out_of_band");
    // $4.44/SF for a dead office shell being converted is what it costs.
    const shell = exx([mm("Asking price", "$4,000,000"), mm("Building size", "900,000 SF"), mm("Stabilized NOI", "$21,000,000")], {
      assetClass: "office",
      strategy: { ...dev, kind: "conversion" } as ExtractionResult["strategy"],
    });
    expect(assessPlausibility(shell).map((f) => f.code)).not.toContain("basis_out_of_band");
    // But an all-in cost no market delivers at is still named — as total cost.
    const cheap = exx([mm("Land cost", "$1,000,000"), mm("Construction budget", "$4,000,000"), mm("Units (proposed)", "420"), mm("Stabilized NOI", "$5,000,000")], { strategy: dev });
    const f = assessPlausibility(cheap).find((x) => x.code === "basis_out_of_band")!;
    expect(f.title).toMatch(/of total cost over 420 units/);
    expect(f.detail).toMatch(/total cost or the unit count/);
    // An operating asset is still judged on its price.
    const op = assessPlausibility(exx([mm("Asking price", "$5,000,000"), mm("Units", "420"), mm("NOI", "$300,000")])).find((x) => x.code === "basis_out_of_band")!;
    expect(op.title).toMatch(/of price over 420 units/);
    // A plan deal with no total cost has nothing to judge — no finding.
    const noCost = exx([mm("Land price", "$5,000,000"), mm("Units (proposed)", "420")], { strategy: dev });
    expect(assessPlausibility(noCost).map((f) => f.code)).not.toContain("basis_out_of_band");
  });
});

describe("an implied going-in cap under the floor is a finding, said as the rule of thumb it is (research pass 38)", () => {
  // The pass's fixtures, row for row.
  const rows = (assetClass: string, list: [string, string, string?][]) =>
    ex(
      list.map(([label, value, basis]) => metric(label, value, { page: "p. 3", ...(basis ? { basis: basis as ExtractedMetric["basis"] } : {}) })),
      { assetClass, address: "", market: "" },
    );
  const RULE =
    "Under 2% of the price is under the going-in cap a stabilized building trades at — a rule of thumb, not a market figure: an NOI that low is, most often, a price for land or a redevelopment, a figure stated a month at a time or in thousands, or a misread.";

  it("names an NOI stated a month at a time, which every return ran as a year's", () => {
    const monthly = rows("Retail", [["Asking price", "6,500,000"], ["NOI (monthly)", "45,000", "in_place"], ["Total SF", "28,000 SF"]]);
    const [f] = assessPlausibility(monthly);
    expect(f).toEqual({
      code: "implied_cap_low",
      severity: "medium",
      title: "NOI (monthly) of $45k implies a 0.69% cap rate on the $6.5M price",
      detail: `${RULE} The row reads “NOI (monthly): 45,000” — a month's figure, which every return here runs as a year's. Check the source page before relying on any return built from these two figures.`,
    });
    // The value's own words count too, beside a stated cap that disagrees.
    const perMonth = rows("Retail", [["Asking price", "6,500,000"], ["NOI (in-place)", "45,000 per month", "in_place"], ["Going-in cap rate", "8.30%"], ["Total SF", "28,000 SF"]]);
    const codes = assessPlausibility(perMonth);
    expect(codes.map((x) => x.code).sort()).toEqual(["cap_mismatch", "implied_cap_low"]);
    expect(codes.find((x) => x.code === "implied_cap_low")!.detail).toContain("The row reads “NOI (in-place): 45,000 per month” — a month's figure");
  });

  it("names an NOI stated in thousands, which every return ran as dollars", () => {
    const thousands = rows("Office", [["Asking price", "45,000,000"], ["NOI (in-place)", "2,450 ($000s)", "in_place"], ["Total SF", "310,000 SF"]]);
    const [f] = assessPlausibility(thousands);
    expect(f.code).toBe("implied_cap_low");
    expect(f.title).toBe("NOI (in-place) of $2k implies a 0.01% cap rate on the $45.0M price");
    expect(f.detail).toContain("The row reads “NOI (in-place): 2,450 ($000s)” — a figure in thousands of dollars, which every return here runs as dollars.");
  });

  it("says the rule alone where the row's words say neither, and only on a deal read as stabilized", () => {
    const low = rows("Multifamily", [["Asking price", "50,000,000"], ["NOI (in-place)", "600,000", "in_place"], ["Units", "100"]]);
    const [f] = assessPlausibility(low);
    expect(f.code).toBe("implied_cap_low");
    expect(f.title).toBe("NOI (in-place) of $600k implies a 1.20% cap rate on the $50.0M price");
    expect(f.detail).toBe(`${RULE} Check the source page before relying on any return built from these two figures.`);
    // A 3%-occupied office earning $45k on $8.5M.
    const occ3 = rows("Office", [["Asking price", "8,500,000"], ["Total SF", "42,000 SF"], ["Occupancy", "3%", "in_place"], ["NOI (in-place)", "45,000", "in_place"]]);
    expect(assessPlausibility(occ3).map((x) => x.code)).toEqual(["implied_cap_low"]);
    // At the floor and over it, nothing; a plan deal's in-place income is the plan's to judge.
    const atFloor = rows("Multifamily", [["Asking price", "50,000,000"], ["NOI (in-place)", "1,000,000", "in_place"], ["Units", "100"]]);
    expect(assessPlausibility(atFloor).map((x) => x.code)).not.toContain("implied_cap_low");
    const plan = { ...low, strategy: { kind: "value_add" as const, summary: "", capitalBudget: "", timeline: "" } };
    expect(assessPlausibility(plan).map((x) => x.code)).not.toContain("implied_cap_low");
    // No income at all is rule 5's, never a cap under the floor.
    const negative = rows("Office", [["Asking price", "8,500,000"], ["NOI (in-place)", "(310,000)", "in_place"]]);
    expect(assessPlausibility(negative).map((x) => x.code)).toEqual(["no_income_in_place"]);
  });
});

describe("a plan's own figures are held to each other, with or without a price row (research pass 38)", () => {
  // The pass's fixtures, row for row.
  const DEV = { kind: "development" as const, summary: "Ground-up 240-unit apartment development", capitalBudget: "", timeline: "" };
  const VA = { kind: "value_add" as const, summary: "Interior renovation of 200 units", capitalBudget: "", timeline: "" };
  const plan = (strategy: ExtractionResult["strategy"], list: [string, string, ExtractedMetric["basis"]?][], assetClass = "Multifamily") =>
    ex(
      list.map(([label, value, basis]) => metric(label, value, { page: "p. 3", ...(basis ? { basis } : {}) })),
      { assetClass, strategy, address: "", market: "" },
    );
  const devTotalThousands = plan(DEV, [["Total project cost", "48,500 ($000s)"], ["NOI (stabilized, pro forma)", "3,200,000"], ["Units (proposed)", "200"]]);
  const vaBudgetTiny = plan(VA, [
    ["Asking price", "20,000,000"],
    ["Units", "200"],
    ["NOI (in-place)", "1,100,000", "in_place"],
    ["NOI (stabilized, pro forma)", "1,500,000"],
    ["Renovation budget", "2,500"],
  ]);
  const REFUSED =
    "No yield on cost is struck: the $3.2M stabilized NOI is 25% or more of the $49k total cost, a yield no project earns, so the total cost or the NOI was most likely misread.";

  it("refuses a yield on cost at or past the ceiling, as the cap reader refuses a cap, and says why wherever the yield would stand", () => {
    const s = inferStrategy(devTotalThousands);
    const p = planSummary(devTotalThousands, s)!;
    expect(p.totalCost).toBe(48_500);
    expect(p.yieldOnCost).toBeNull();
    expect(p.yieldWithheld).toBe(REFUSED);
    // The plan's facts say so in the cell, never 6597.94% and never a dash;
    // the challenger's and the verdict's paragraph says the sentence.
    expect(planFacts(p)).toContainEqual(["Yield on cost", "n/a — figures don't tie"]);
    const note = plausibilityNote(assessPlausibility(devTotalThousands, s), s, p, devTotalThousands);
    expect(note).not.toMatch(/6597|6,597/);
    expect(note).toContain(
      "no yield on cost is struck: the $3.2M stabilized NOI is 25% or more of the $49k total cost, a yield no project earns, so the total cost or the NOI was most likely misread",
    );
    // At the ceiling it is refused; under it, it stands as it did.
    const at = plan(VA, [["Asking price", "$9,000,000"], ["Renovation budget", "$1,000,000"], ["NOI (stabilized, pro forma)", "$2,500,000"]]);
    expect(planSummary(at)).toMatchObject({ totalCost: 10_000_000, yieldOnCost: null });
    expect(planSummary(at)!.yieldWithheld).toContain("$2.5M stabilized NOI is 25% or more of the $10.0M total cost");
    const under = plan(VA, [["Asking price", "$9,000,000"], ["Renovation budget", "$1,000,000"], ["NOI (stabilized, pro forma)", "$2,499,000"]]);
    expect(planSummary(under)!.yieldOnCost).toBeCloseTo(0.2499, 10);
    expect(planSummary(under)!.yieldWithheld).toBeNull();
    const sound = plan(DEV, [["Land cost", "6,000,000"], ["Total project cost", "72,000,000"], ["NOI (stabilized, pro forma)", "4,600,000"], ["Units (proposed)", "240"]]);
    expect(planFacts(planSummary(sound)!)).toContainEqual(["Yield on cost", "6.39%"]);
    // A forward purchase's yield is the NOI at delivery over the price.
    const forward = plan(
      { ...DEV, summary: "Forward purchase of a 300,000 SF build-to-suit distribution center at completion" },
      [["Purchase price", "$10,000,000"], ["NOI (Year 1)", "$3,000,000"]],
      "industrial",
    );
    expect(planSummary(forward)).toMatchObject({ forward: true, yieldOnCost: null });
    expect(planSummary(forward)!.yieldWithheld).toBe(
      "No yield on cost is struck: the $3.0M NOI at delivery is 25% or more of the $10.0M price, a yield no delivered building earns, so the price or the NOI was most likely misread.",
    );
  });

  it("runs the plan's total-cost basis band whether or not the memorandum states a price", () => {
    expect(assessPlausibility(devTotalThousands)).toEqual([
      {
        code: "basis_out_of_band",
        severity: "medium",
        title: "$49k of total cost over 200 units is $243 per unit",
        detail:
          "No multifamily market delivers there. The total cost or the unit count was most likely misread — check both against their source pages before the all-in basis is used anywhere. The row reads “Total project cost: 48,500 ($000s)” — a figure in thousands of dollars, which the plan's cost here reads as dollars.",
      },
    ]);
    // A sound plan with no price row says nothing; a stabilized deal with
    // none says nothing, as before; what the price buys still decides.
    const sound = plan(DEV, [["Total project cost", "48,500,000"], ["NOI (stabilized, pro forma)", "3,200,000"], ["Units (proposed)", "200"]]);
    expect(assessPlausibility(sound)).toEqual([]);
    expect(assessPlausibility(ex([metric("NOI (Year 1)", "$21,000,000")]))).toEqual([]);
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    expect(assessPlausibility({ ...devTotalThousands, interest: { ...blank, kind: "note" } })).toEqual([]);
  });

  it("names a works budget under about $1,000 a unit or 1% of the price, said as the rule of thumb it is", () => {
    expect(assessPlausibility(vaBudgetTiny)).toEqual([
      {
        code: "budget_low",
        severity: "medium",
        title: "Renovation budget of $2,500 is $12.50 per unit and 0.01% of the $20.0M price",
        detail:
          "A works budget under about $1,000 a unit or 1% of the price is under what a renovation or construction program costs — a rule of thumb, not a market figure: a budget that small is, most often, a figure in thousands, one unit's cost entered as the whole program's, or a misread. Check the source page before the total cost, the yield on cost or any return built on the budget is relied on.",
      },
    ]);
    // A row in thousands is quoted.
    const thousands = plan(VA, [["Asking price", "20,000,000"], ["Units", "200"], ["NOI (stabilized, pro forma)", "1,500,000"], ["Renovation budget", "2,500 ($000s)"]]);
    expect(assessPlausibility(thousands)[0].detail).toContain(
      "The row reads “Renovation budget: 2,500 ($000s)” — a figure in thousands of dollars, which the plan's cost here reads as dollars.",
    );
    // Either floor alone: a unit's on a cheap building, the price's with no count.
    const perUnit = plan(VA, [["Asking price", "4,000,000"], ["Units", "200"], ["Renovation budget", "150,000"]]);
    expect(assessPlausibility(perUnit).map((f) => f.title)).toEqual(["Renovation budget of $150k is $750 per unit"]);
    const share = plan(VA, [["Asking price", "20,000,000"], ["Renovation budget", "150,000"]], "Office");
    expect(assessPlausibility(share).map((f) => f.title)).toEqual(["Renovation budget of $150k is 0.75% of the $20.0M price"]);
    // A sound budget, a lease-up's leasing capital and a development with
    // its land as the price are held to nothing they meet.
    const fine = plan(VA, [["Asking price", "20,000,000"], ["Units", "200"], ["Renovation budget", "3,000,000"]]);
    expect(assessPlausibility(fine)).toEqual([]);
    const leaseUp = plan({ ...VA, kind: "lease_up" }, [["Asking price", "20,000,000"], ["Units", "200"], ["Capital budget", "150,000"]]);
    expect(assessPlausibility(leaseUp).map((f) => f.code)).not.toContain("budget_low");
  });

  it("calls the stabilized NOI \"not a misread\" only where no finding stands and no yield was refused", () => {
    const tied = (e: ExtractionResult) => {
      const s = inferStrategy(e);
      return plausibilityNote(assessPlausibility(e, s), s, planSummary(e, s), e);
    };
    expect(tied(CONVERSION)).toMatch(/not a misread/);
    for (const e of [devTotalThousands, vaBudgetTiny]) {
      expect(tied(e)).not.toMatch(/not a misread/);
      expect(tied(e)).toContain("But the plan's figures do not all tie, as said here, so it or the cost it is set against may be a misread");
      expect(tied(e)).toMatch(/FIGURES THAT DO NOT TIE/);
    }
    // A yield refused past the ceiling with no other finding says so too.
    const refusedOnly = plan(VA, [["Asking price", "$9,000,000"], ["Renovation budget", "$1,000,000"], ["NOI (stabilized, pro forma)", "$3,000,000"]]);
    expect(assessPlausibility(refusedOnly)).toEqual([]);
    expect(tied(refusedOnly)).not.toMatch(/not a misread/);
    expect(tied(refusedOnly)).toContain("may be a misread");
  });
});
