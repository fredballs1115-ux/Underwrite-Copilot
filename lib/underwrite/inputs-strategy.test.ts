import { describe, expect, it } from "vitest";
import { deriveUnderwriteInputs } from "./inputs";
import { computeUnderwrite } from "./engine";
import type { ExtractionResult, ExtractedMetric } from "@/lib/anthropic/types";

const metric = (
  label: string,
  value: string,
  extra: Partial<ExtractedMetric> = {},
): ExtractedMetric => ({ label, value, flagged: false, page: "", ...extra });

const ex = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  dealName: "Test Deal",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1 Test St, Washington, DC",
  metrics,
  ...over,
});

/** The deal that started this: a $20M office building whose OM states the
 *  finished residential building's $21M pro forma NOI. The old anchor took
 *  the first NOI it saw and reconstructed year-1 income to $21M — a 105%
 *  going-in cap in the workbook, presented as the OM's own number. */
const CONVERSION = ex(
  [
    metric("Asking price", "$20,000,000", { basis: "na", page: "p. 3" }),
    metric("NOI (stabilized, pro forma)", "$21,000,000", { basis: "pro_forma", page: "p. 41" }),
    metric("Total project cost", "$180,000,000", { basis: "pro_forma", page: "p. 44" }),
    metric("Rentable square feet", "420,000", { basis: "na" }),
  ],
  { dealName: "1200 K Street — Office-to-Residential Conversion" },
);

describe("deriveUnderwriteInputs — a conversion's stabilized pro forma is not the going-in NOI", () => {
  const { inputs, sources, meta } = deriveUnderwriteInputs(CONVERSION, "fallback");
  const r = computeUnderwrite(inputs);

  it("reads the strategy off the deal", () => {
    expect(meta.strategy).toBe("conversion");
  });

  it("refuses to anchor year-1 NOI on the $21M pro forma", () => {
    expect(r.cashFlow[0].noi).toBeLessThan(20_000_000 * 0.25);
    expect(r.returns.goingInCapPct).toBeLessThan(0.25);
  });

  it("names the figure it did not use, and what it used instead", () => {
    const note = sources.inPlaceRentAnnual?.note ?? "";
    expect(note).toMatch(/\$21,000,000/);
    expect(note).toMatch(/105% of price/);
    expect(note).toMatch(/finished project's stabilized figure/);
    expect(note).toMatch(/does not anchor year 1/);
    expect(note).toMatch(/conversion/);
    expect(sources.inPlaceRentAnnual?.provenance).toBe("assumption");
  });

  it("carries the construction budget (total project cost less price) into the model's capital line", () => {
    expect(inputs.capitalImprovementsYr1).toBe(160_000_000);
    expect(sources.capitalImprovementsYr1?.provenance).toBe("extracted");
    expect(sources.capitalImprovementsYr1?.page).toBe("p. 44");
    // The engine books capital improvements as a year-1 outflow in the
    // ladder (not in Uses, to match the workbook and avoid double counting),
    // so the budget must show up there — and the returns must carry it.
    expect(r.sourcesUses.capitalImprovements).toBe(160_000_000);
    expect(r.cashFlow[0].capitalImprovements).toBe(160_000_000);
    expect(r.cashFlow[0].leveredCashFlow).toBeLessThan(-100_000_000);
    expect(r.sourcesUses.balanced).toBe(true);
  });

  it("and the going-in yield is a real number, not a 105% cap rate", () => {
    expect(r.returns.goingInCapPct).toBeCloseTo(0.06, 3); // the labelled 6% assumption
    expect(r.returns.stabilizedYieldPct).toBeLessThan(0.1);
  });
});

describe("deriveUnderwriteInputs — with a stated going-in cap on the building as it stands", () => {
  const { inputs, sources } = deriveUnderwriteInputs(
    ex(
      [
        ...CONVERSION.metrics,
        metric("Going-in cap rate", "5.0%", { basis: "in_place", page: "p. 5" }),
      ],
      { dealName: CONVERSION.dealName },
    ),
    "fallback",
  );
  const r = computeUnderwrite(inputs);

  it("sets year-1 NOI from price × the stated cap and says so", () => {
    expect(r.cashFlow[0].noi).toBeCloseTo(1_000_000, 0);
    expect(sources.inPlaceRentAnnual?.provenance).toBe("derived");
    expect(sources.inPlaceRentAnnual?.note).toMatch(/price × the stated going-in cap/);
  });
});

describe("deriveUnderwriteInputs — which NOI anchors a stabilized deal", () => {
  it("prefers the in-place figure over the stabilized pro forma when both are stated", () => {
    const { inputs, sources } = deriveUnderwriteInputs(
      ex([
        metric("Asking price", "$68,000,000"),
        metric("NOI (stabilized, pro forma)", "$4,300,000", { basis: "pro_forma" }),
        metric("NOI (in-place)", "$3,876,000", { basis: "in_place", page: "p. 8" }),
      ]),
      "fallback",
    );
    const r = computeUnderwrite(inputs);
    expect(r.cashFlow[0].noi).toBeCloseTo(3_876_000, 0);
    expect(sources.inPlaceRentAnnual?.page).toBe("p. 8");
  });

  it("uses a lone stabilized figure on a stabilized asset — there it is next year's income", () => {
    const { inputs, sources } = deriveUnderwriteInputs(
      ex([
        metric("Asking price", "$68,000,000"),
        metric("Stabilized NOI", "$4,000,000", { basis: "pro_forma" }),
      ]),
      "fallback",
    );
    const r = computeUnderwrite(inputs);
    expect(r.cashFlow[0].noi).toBeCloseTo(4_000_000, 0);
    expect(sources.inPlaceRentAnnual?.note).toMatch(/next year's income/);
  });

  it("but never a lone stabilized figure on a value-add — that one belongs over total cost", () => {
    const { inputs, sources } = deriveUnderwriteInputs(
      ex([
        metric("Asking price", "$50,000,000"),
        metric("Stabilized NOI (pro forma)", "$3,900,000", { basis: "pro_forma" }),
        metric("Renovation budget", "$6,000,000", { page: "p. 22" }),
        metric("Going-in cap rate", "5.2%"),
      ]),
      "fallback",
    );
    const r = computeUnderwrite(inputs);
    expect(r.cashFlow[0].noi).toBeCloseTo(2_600_000, 0); // price × the stated cap
    expect(inputs.capitalImprovementsYr1).toBe(6_000_000);
    expect(sources.capitalImprovementsYr1?.note).toMatch(/Renovation budget/);
    expect(sources.capitalImprovementsYr1?.page).toBe("p. 22");
  });

  it("still anchors on a bare 'Net operating income' line as before", () => {
    const { inputs } = deriveUnderwriteInputs(
      ex([metric("Asking price", "$50,000,000"), metric("Net operating income", "$3,000,000")]),
      "fallback",
    );
    expect(computeUnderwrite(inputs).cashFlow[0].noi).toBeCloseTo(3_000_000, 0);
  });
});

describe("deriveUnderwriteInputs — a stabilized cap is not the going-in cap", () => {
  it("does not price year-1 NOI or the exit off a plan deal's stabilized / pro forma cap", () => {
    const { inputs, sources } = deriveUnderwriteInputs(
      ex(
        [
          metric("Asking price", "$20,000,000"),
          metric("Stabilized cap rate (pro forma)", "11.7%", { basis: "pro_forma" }),
          metric("NOI (stabilized, pro forma)", "$21,000,000", { basis: "pro_forma" }),
        ],
        { dealName: "Office-to-Residential Conversion" },
      ),
      "fallback",
    );
    const r = computeUnderwrite(inputs);
    // No going-in cap in the OM → the labelled 6% default, not 11.7%.
    expect(r.cashFlow[0].noi).toBeCloseTo(1_200_000, 0);
    expect(inputs.exitCapPct).toBeCloseTo(0.06, 6);
    expect(sources.exitCapPct?.provenance).toBe("assumption");
  });
});

describe("deriveUnderwriteInputs — capital budget guards", () => {
  it("takes a capital improvements line on a stabilized deal into Uses", () => {
    const { inputs, sources } = deriveUnderwriteInputs(
      ex([
        metric("Asking price", "$30,000,000"),
        metric("Net operating income", "$1,800,000"),
        metric("Capital improvements budget", "$1,500,000"),
      ]),
      "fallback",
    );
    expect(inputs.capitalImprovementsYr1).toBe(1_500_000);
    expect(sources.capitalImprovementsYr1?.provenance).toBe("extracted");
  });

  it("ignores a budget beyond ten times the price — a misparse, not a plan", () => {
    const { inputs, sources } = deriveUnderwriteInputs(
      ex([
        metric("Asking price", "$30,000,000"),
        metric("Net operating income", "$1,800,000"),
        metric("Construction budget", "$900,000,000"),
      ]),
      "fallback",
    );
    expect(inputs.capitalImprovementsYr1).toBe(0);
    expect(sources.capitalImprovementsYr1?.provenance).toBe("assumption");
  });

  it("never reads a per-unit or annual reserve line as the budget", () => {
    const { inputs } = deriveUnderwriteInputs(
      ex([
        metric("Asking price", "$30,000,000"),
        metric("Net operating income", "$1,800,000"),
        metric("Capital reserve (annual)", "$74,400"),
        metric("Renovation cost per unit", "$12,000"),
      ]),
      "fallback",
    );
    expect(inputs.capitalImprovementsYr1).toBe(0);
  });

  it("tells a plan deal with no budget that yield on cost needs one", () => {
    const { sources, meta } = deriveUnderwriteInputs(
      ex([metric("Asking price", "$30,000,000"), metric("NOI (in-place)", "$1,500,000", { basis: "in_place" })], {
        dealName: "Value-add repositioning of Park Terrace",
      }),
      "fallback",
    );
    expect(meta.strategy).toBe("value_add");
    expect(sources.capitalImprovementsYr1?.note).toMatch(/enter the construction \/ renovation cost/);
  });
});

describe("deriveUnderwriteInputs — the budget from the strategy's own words", () => {
  it("books a budget that appears only in the extraction's strategy text, and says so", () => {
    const textOnly = ex(
      CONVERSION.metrics.filter((m) => !/project cost/i.test(m.label)),
      {
        dealName: CONVERSION.dealName,
        strategy: {
          kind: "conversion",
          summary: "Convert the vacant office building into 612 apartments.",
          capitalBudget: "approximately $160 million, hard and soft",
          timeline: "30 months of construction",
        },
      },
    );
    const { inputs, sources } = deriveUnderwriteInputs(textOnly, "fallback");
    expect(inputs.capitalImprovementsYr1).toBe(160_000_000);
    expect(sources.capitalImprovementsYr1?.provenance).toBe("extracted");
    expect(sources.capitalImprovementsYr1?.page).toBeUndefined();
    expect(sources.capitalImprovementsYr1?.note).toMatch(/^stated capital budget — spent in year 1/);
  });

  it("still prefers a metric row with a page over the text", () => {
    const both = ex(CONVERSION.metrics, {
      dealName: CONVERSION.dealName,
      strategy: { kind: "conversion", summary: "", capitalBudget: "$150M", timeline: "" },
    });
    const { inputs, sources } = deriveUnderwriteInputs(both, "fallback");
    expect(inputs.capitalImprovementsYr1).toBe(160_000_000);
    expect(sources.capitalImprovementsYr1?.page).toBe("p. 44");
  });
});

describe("deriveUnderwriteInputs — a development's price is its land cost", () => {
  it("anchors the price on the land cost and says so, instead of a $10M placeholder", () => {
    const dev = ex(
      [
        metric("Land cost", "$8,000,000", { basis: "na", page: "p. 2" }),
        metric("Total development cost", "$60,000,000", { basis: "pro_forma", page: "p. 9" }),
        metric("Stabilized NOI (pro forma)", "$4,500,000", { basis: "pro_forma", page: "p. 11" }),
      ],
      { dealName: "Ground-up development — 240 units, fully entitled" },
    );
    const { inputs, sources, meta } = deriveUnderwriteInputs(dev, "fallback");
    expect(meta.strategy).toBe("development");
    expect(inputs.purchasePrice).toBe(8_000_000);
    expect(sources.purchasePrice?.provenance).toBe("extracted");
    expect(sources.purchasePrice?.note).toMatch(/land \/ site cost/);
    expect(sources.purchasePrice?.page).toBe("p. 2");
    // The build is the capital plan: total development cost less the land.
    expect(inputs.capitalImprovementsYr1).toBe(52_000_000);
  });
});

describe("the seventh review's derivation cases", () => {
  const dev = { kind: "development", summary: "", capitalBudget: "", timeline: "" } as unknown as ExtractionResult["strategy"];

  it("a stated total project cost with no price is the workbook's capital budget — never thrown out against the placeholder", () => {
    const { inputs, sources } = deriveUnderwriteInputs(
      ex([metric("Total project cost", "$140,000,000", { page: "p. 9" }), metric("Stabilized NOI", "$9,800,000"), metric("Units (proposed)", "420")], {
        strategy: dev,
      }),
      "fallback",
    );
    expect(sources.purchasePrice?.provenance).toBe("assumption");
    expect(inputs.capitalImprovementsYr1).toBe(140_000_000);
    expect(sources.capitalImprovementsYr1?.provenance).toBe("extracted");
    // No note quotes a percentage of a price the OM never stated.
    expect(sources.inPlaceRentAnnual?.note ?? "").not.toMatch(/% of price/);
    expect(sources.inPlaceRentAnnual?.note ?? "").toMatch(/finished project/);
  });

  it("the provenance note tells the truth about why a stated NOI was not the anchor", () => {
    const zero = deriveUnderwriteInputs(ex([metric("Asking price", "$42,000,000"), metric("In-place NOI", "$0"), metric("Units", "240")]), "fallback");
    expect(zero.sources.inPlaceRentAnnual?.note).toMatch(/no income in place to anchor year 1 on/);
    expect(zero.sources.inPlaceRentAnnual?.note).not.toMatch(/finished project/);
    const high = deriveUnderwriteInputs(ex([metric("Asking price", "$42,000,000"), metric("NOI", "$16,800,000"), metric("Units", "240")]), "fallback");
    expect(high.sources.inPlaceRentAnnual?.note).toMatch(/is 40% of price — above any going-in cap on this price/);
    const plan = deriveUnderwriteInputs(
      ex([metric("Asking price", "$20,000,000"), metric("Stabilized NOI (pro forma)", "$21,000,000")], {
        strategy: { ...dev, kind: "conversion" } as ExtractionResult["strategy"],
      }),
      "fallback",
    );
    expect(plan.sources.inPlaceRentAnnual?.note).toMatch(/is 105% of price — the finished project's stabilized figure on a conversion deal/);
  });

  it("the OM's in-place occupancy seeds the vacancy line, marked extracted, and a rent roll still outranks it", () => {
    const leaseUp = ex(
      [metric("Asking price", "$30,000,000"), metric("In-place NOI", "$400,000"), metric("Occupancy", "18%", { page: "p. 9" }), metric("Stabilized occupancy", "95%"), metric("Total SF", "200,000 SF")],
      { assetClass: "office", strategy: { ...dev, kind: "lease_up" } as ExtractionResult["strategy"] },
    );
    const d = deriveUnderwriteInputs(leaseUp, "fallback");
    expect(d.inputs.vacancyPct).toBeCloseTo(0.82, 6);
    expect(d.sources.vacancyPct?.provenance).toBe("extracted");
    expect(d.sources.vacancyPct?.note).toMatch(/OM in-place occupancy 18%/);
    expect(d.sources.vacancyPct?.page).toBe("p. 9");
    expect(d.meta.occupancyPct).toBeCloseTo(0.18, 6);
    // No occupancy row at all → the class default, marked as one.
    const none = deriveUnderwriteInputs(ex([metric("Asking price", "$30,000,000"), metric("In-place NOI", "$1,800,000")], { assetClass: "office" }), "fallback");
    expect(none.inputs.vacancyPct).toBeCloseTo(0.1, 6);
    expect(none.sources.vacancyPct?.provenance).toBe("assumption");
    // A stabilized figure alone states no occupancy today → still the default.
    const stabilizedOnly = deriveUnderwriteInputs(ex([metric("Asking price", "$30,000,000"), metric("In-place NOI", "$1,800,000"), metric("Stabilized occupancy", "95%")], { assetClass: "office" }), "fallback");
    expect(stabilizedOnly.sources.vacancyPct?.provenance).toBe("assumption");
  });
});
