import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveUnderwriteInputs } from "./inputs";
import { computeUnderwrite } from "./engine";
import { regulationForDeal } from "@/lib/rent-regulation";
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

describe("the area a deal states none of", () => {
  it("runs a counted building on units × the class's typical size, and says so", () => {
    const m = deriveUnderwriteInputs(
      ex([metric("Asking price", "$42,000,000"), metric("NOI (in-place)", "$2,500,000"), metric("Units", "248")], {
        assetClass: "multifamily",
      }),
      "fallback",
    );
    expect(m.meta.units).toBe(248);
    expect(m.meta.rsf).toBe(248 * 850);
    expect(m.sources.rsf?.provenance).toBe("assumption");
    expect(m.sources.rsf?.note).toBe("248 units × 850 SF typical — enter the rentable SF");
  });

  // Research pass 28: licensed beds are a count now, so a care facility
  // that states no area runs on its beds × the class's 600 SF where it ran
  // on the 100,000 SF placeholder; a marina's slips change no figure, its
  // class (none) carrying no typical size.
  it("runs a care facility on its licensed beds, and a marina's slips on the placeholder still", () => {
    const snf = deriveUnderwriteInputs(
      ex([metric("Asking price", "$18,000,000"), metric("NOI (in-place)", "$1,350,000"), metric("Licensed beds", "120")], {
        assetClass: "Skilled Nursing Facility",
      }),
      "fallback",
    );
    expect(snf.meta.units).toBe(120);
    expect(snf.meta.rsf).toBe(120 * 600);
    expect(snf.sources.rsf?.note).toBe("120 units × 600 SF typical — enter the rentable SF");
    const marina = deriveUnderwriteInputs(
      ex([metric("Asking price", "$14,000,000"), metric("NOI (in-place)", "$1,050,000"), metric("Wet slips", "250")], { assetClass: "Marina" }),
      "fallback",
    );
    expect(marina.meta.units).toBe(250);
    expect(marina.meta.rsf).toBe(100_000);
  });

  it("speaks a hotel's count in keys", () => {
    const m = deriveUnderwriteInputs(
      ex([metric("Asking price", "$24,000,000"), metric("NOI (in-place)", "$2,000,000"), metric("Keys", "120")], {
        assetClass: "hospitality_str",
      }),
      "fallback",
    );
    expect(m.meta.rsf).toBe(120 * 550);
    expect(m.sources.rsf?.note).toBe("120 keys × 550 SF typical — enter the rentable SF");
  });

  it("falls to the placeholder only with no count at all, and a stated area still wins", () => {
    const none = deriveUnderwriteInputs(
      ex([metric("Asking price", "$30,000,000"), metric("NOI (in-place)", "$1,800,000")], { assetClass: "office" }),
      "fallback",
    );
    expect(none.meta.rsf).toBe(100_000);
    expect(none.sources.rsf?.note).toBe("Enter rentable SF");
    const stated = deriveUnderwriteInputs(
      ex(
        [metric("Asking price", "$42,000,000"), metric("NOI (in-place)", "$2,500,000"), metric("Units", "248"), metric("Total SF", "220,000 SF")],
        { assetClass: "multifamily" },
      ),
      "fallback",
    );
    expect(stated.meta.rsf).toBe(220_000);
    expect(stated.sources.rsf?.provenance).toBe("extracted");
  });
});

describe("deriveUnderwriteInputs — a hotel's PIP is the buyer's capital (#455)", () => {
  const hotel = { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "management" as const, pip: "", page: "" };
  const base = [metric("Asking price", "$26,000,000"), metric("NOI (in-place)", "$2,080,000"), metric("Keys", "120")];

  it("carries a stated PIP as the first year's capital where no other budget is stated, and the returns pay for it", () => {
    const m = deriveUnderwriteInputs(ex([...base, metric("PIP cost", "$4,200,000")], { assetClass: "hospitality_str", hotel }), "fallback");
    expect(m.inputs.capitalImprovementsYr1).toBe(4_200_000);
    expect(m.sources.capitalImprovementsYr1?.provenance).toBe("extracted");
    expect(m.sources.capitalImprovementsYr1?.note).toMatch(/^PIP cost — the brand's property improvement plan, as stated/);
    expect(computeUnderwrite(m.inputs).cashFlow[0].capitalImprovements).toBe(4_200_000);
    expect(m.meta.hotel?.line).toBe("Hotel: flagged Courtyard by Marriott, sold encumbered by management; PIP $4.2M ($35k a key)");
    expect(m.meta.hotel?.read).toContain("The model carries the $4.2M PIP as its first year's capital");
  });

  it("a PIP stated per key is multiplied out over the keys", () => {
    const m = deriveUnderwriteInputs(ex([...base, metric("PIP cost per key", "$35,000")], { assetClass: "hospitality_str", hotel }), "fallback");
    expect(m.inputs.capitalImprovementsYr1).toBe(4_200_000);
  });

  it("a stated renovation budget is read as including the PIP — never the two added", () => {
    const m = deriveUnderwriteInputs(
      ex([...base, metric("PIP cost", "$4,200,000"), metric("Renovation budget", "$6,000,000")], { assetClass: "hospitality_str", hotel }),
      "fallback",
    );
    expect(m.inputs.capitalImprovementsYr1).toBe(6_000_000);
    expect(m.sources.capitalImprovementsYr1?.note).toMatch(/Renovation budget/);
    expect(m.meta.hotel?.read).toContain("read as including the $4.2M PIP rather than added to it");
  });

  it("nothing changes on a hotel with no PIP, or on anything but a hotel", () => {
    const none = deriveUnderwriteInputs(ex(base, { assetClass: "hospitality_str", hotel }), "fallback");
    expect(none.inputs.capitalImprovementsYr1).toBe(0);
    expect(none.meta.hotel?.line).toBe("Hotel: flagged Courtyard by Marriott, sold encumbered by management; no PIP stated");
    const office = deriveUnderwriteInputs(ex([metric("Asking price", "$30,000,000"), metric("NOI (in-place)", "$1,800,000")], { assetClass: "office" }), "fallback");
    expect(office.meta.hotel).toBeNull();
  });
});

describe("deriveUnderwriteInputs — a student building's pre-leasing against the model's vacancy (#468)", () => {
  it("says the read in a line and the beds still to sign against the model's occupancy", () => {
    const m = deriveUnderwriteInputs(
      ex([metric("Asking price", "$61,200,000"), metric("NOI (in-place)", "$3,300,000"), metric("Beds", "612"), metric("Pre-leased", "87% for Fall 2026")], {
        assetClass: "student_housing",
      }),
      "fallback",
    );
    expect(m.meta.student?.line).toBe("Student housing: 87% pre-leased for Fall 2026; 612 beds at $100k a bed");
    expect(m.meta.student?.read).toMatch(/^The model's \d+(\.\d)?% vacancy /);
    expect(m.meta.student?.read).toContain("87% pre-leased for Fall 2026");
    // Anything else carries none.
    expect(deriveUnderwriteInputs(ex([metric("Asking price", "$20,000,000"), metric("Units", "240")]), "fallback").meta.student).toBeNull();
  });
});

describe("deriveUnderwriteInputs — a manufactured-housing park's gap to market, homes and utilities (#470)", () => {
  it("says the read in a line and what the model does with the gap, the park's homes and a private system", () => {
    const m = deriveUnderwriteInputs(
      ex(
        [
          metric("Asking price", "$9,300,000"),
          metric("NOI (in-place)", "$560,000"),
          metric("Pads", "150"),
          metric("Occupied pads", "132"),
          metric("Lot rent", "$430"),
          metric("Market lot rent", "$525"),
          metric("Park-owned homes", "18"),
          metric("Water and sewer", "Private well and septic"),
        ],
        { assetClass: "manufactured_housing" },
      ),
      "fallback",
    );
    expect(m.meta.mh?.line).toBe(
      "Manufactured housing: 150 pads at $62k a pad, 88% occupied; lot rent $430 (market $525); 18 park-owned homes (12%); private water & sewer",
    );
    expect(m.meta.mh?.read).toContain("Closed by the sale, the gap to the memorandum's market lot rent is $150k a year of income");
    expect(m.meta.mh?.read).toContain(`at the model's ${(m.inputs.exitCapPct * 100).toFixed(2)}% exit cap`);
    expect(m.meta.mh?.read).toContain("It capitalises the whole income at one exit cap, the park-owned homes' rent with the lots'.");
    expect(m.meta.mh?.read).toContain("Its reserve is the class's screening default, not a figure for the park's own water and sewer.");
    // Anything else carries none.
    expect(deriveUnderwriteInputs(ex([metric("Asking price", "$20,000,000"), metric("Units", "240")]), "fallback").meta.mh).toBeNull();
  });
});

describe("deriveUnderwriteInputs — a self-storage facility's premium over street and its lease-up (#471)", () => {
  it("says the read in a line and what the model does with the premium and the vacancy", () => {
    const m = deriveUnderwriteInputs(
      ex(
        [
          metric("Asking price", "$9,800,000"),
          metric("NOI (in-place)", "$600,000"),
          metric("Units", "612"),
          metric("Occupancy", "80%"),
          metric("In-place rent", "$1.38/SF/month"),
          metric("Street rate", "$1.14/SF/month"),
        ],
        { assetClass: "self_storage" },
      ),
      "fallback",
    );
    expect(m.meta.storage?.line).toBe("Self-storage: 80% occupied by units; in-place $1.38/SF a month against street $1.14/SF a month (+21.1%)");
    expect(m.meta.storage?.read).toMatch(/^The model grows today's rent, the rate increases' premium included; with every tenant at street its year-one rent would be \$\d+k lower/);
    expect(m.meta.storage?.read).toContain(`Its ${Math.round(m.inputs.vacancyPct * 1000) / 10}% vacancy is held flat across its years`);
    expect(deriveUnderwriteInputs(ex([metric("Asking price", "$20,000,000"), metric("Units", "240")]), "fallback").meta.storage).toBeNull();
  });
});

describe("deriveUnderwriteInputs — the rent rules that reach the building, beside the model's one growth rate (lib/rent-regulation)", () => {
  const walkUp = ex([
    metric("Asking price", "$14,000,000"),
    metric("NOI (in-place)", "$700,000"),
    metric("Units", "48"),
    metric("Year built", "1931"),
    metric("Rent-regulated units", "41"),
  ]);
  const regulation = regulationForDeal(
    { extraction: walkUp, address: { state: "NY", city: "Brooklyn", county: "Kings County" }, siteFlags: null, assetClass: "multifamily" },
    "2026-10-05",
  );

  it("says the read in a line and sets the model's growth beside the allowance in force, never changing it", () => {
    const m = deriveUnderwriteInputs(walkUp, "fallback", undefined, undefined, { regulation });
    expect(m.meta.regulation?.line).toBe(
      "Rent regulation: NYC rent stabilization applies; 41 of the 48 units rent-regulated as stated (85%); 0% on a one-year lease for leases commencing Oct 1, 2026 to Sep 30, 2027",
    );
    expect(m.meta.regulation?.read).toBe(
      `The model grows every rent ${Math.round(m.inputs.rentGrowthPct * 10000) / 100}% a year; NYC rent stabilization allows 0% on a one-year lease for leases commencing Oct 1, 2026 to Sep 30, 2027 (the Rent Guidelines Board's Apartment/Loft Order #58), and 41 of the 48 units are regulated as the memorandum states. The model's one growth rate is the market-rate units', not the regulated ones'.`,
    );
    // The model is the same model: no input moves for the regulation.
    expect(m.inputs).toEqual(deriveUnderwriteInputs(walkUp, "fallback").inputs);
    // Absent where the caller read none.
    expect(deriveUnderwriteInputs(walkUp, "fallback").meta.regulation).toBeNull();
  });

  it("carries the memorandum's own claim with no model read where no rule the site holds reaches the building", () => {
    const claim = regulationForDeal(
      { extraction: walkUp, address: { state: "TX", city: "Austin" }, siteFlags: null, assetClass: "multifamily" },
      "2026-10-05",
    );
    const m = deriveUnderwriteInputs(walkUp, "fallback", undefined, undefined, { regulation: claim });
    expect(m.meta.regulation?.line).toMatch(/^Rent regulation: The memorandum states regulated rents, which no rule the site holds reaches here/);
    expect(m.meta.regulation?.read).toBe("");
  });
});

describe("deriveUnderwriteInputs — a forward purchase, said and never changed (lib/forward-purchase)", () => {
  const strategy = (summary: string) => ({ kind: "development" as const, summary, capitalBudget: "", timeline: "" });
  const btr = ex(
    [
      metric("Purchase price", "$72,000,000"),
      metric("Homes", "180"),
      metric("NOI (stabilized, pro forma)", "$3,960,000"),
      metric("Estimated delivery", "June 2028"),
      metric("Deposit", "10% at signing, non-refundable after due diligence"),
    ],
    { assetClass: "sfr_btr", strategy: strategy("Forward purchase of a 180-home build-to-rent community, purchase at certificate of occupancy") },
  );

  it("says the purchase in a line and the model's year-one NOI beside the memorandum's at delivery", () => {
    const m = deriveUnderwriteInputs(btr, "fallback");
    expect(m.meta.forward?.line).toBe("Forward purchase: $72.0M paid at delivery (June 2028), the works the developer's; 5.50% at delivery on the stated NOI; deposit 10% at signing, non-refundable after due diligence");
    expect(m.meta.forward?.read).toBe(
      "The model runs the price as paid at closing with income from its first year: on a forward purchase that day is delivery, June 2028, and the deposit paid at signing sits outside its cash flows. Its year-one NOI is an assumed 6.00% of the price, $4.32M, above the $3.96M the memorandum states at delivery.",
    );
    // No budget is the buyer's: the capital line's note says the developer
    // funds the works, never "enter the construction cost".
    expect(m.inputs.capitalImprovementsYr1).toBe(0);
    expect(m.sources.capitalImprovementsYr1?.note).toBe(
      "No construction budget is the buyer's: on a forward purchase the developer funds the works and the price is all-in at delivery",
    );
    // Anything else carries none.
    expect(deriveUnderwriteInputs(ex([metric("Asking price", "$20,000,000"), metric("Units", "240")]), "fallback").meta.forward).toBeNull();
  });

  it("says a budget stated on a forward deck is the developer's, and charges it as before — the model's figures are the owner's to change", () => {
    const withBudget = ex([...btr.metrics, metric("Construction budget", "$58,000,000", { page: "p. 12" })], {
      assetClass: "sfr_btr",
      strategy: btr.strategy,
    });
    const m = deriveUnderwriteInputs(withBudget, "fallback");
    expect(m.inputs.capitalImprovementsYr1).toBe(58_000_000);
    expect(m.sources.capitalImprovementsYr1?.note).toBe(
      "Construction budget — the developer's budget: on a forward purchase the developer funds the works and the price is all-in at delivery, yet this model charges it as the buyer's first-year capital; enter 0 to run the price alone",
    );
    // The same deck the buyer builds reads as before.
    const own = ex(withBudget.metrics, { assetClass: "sfr_btr", strategy: strategy("Ground-up 180-home community") });
    const o = deriveUnderwriteInputs(own, "fallback");
    expect(o.meta.forward).toBeNull();
    expect(o.inputs).toEqual(m.inputs);
    expect(o.sources.capitalImprovementsYr1?.note).toBe("Construction budget — spent in year 1 in this annual model; the OM's own timeline may run longer");
    expect(deriveUnderwriteInputs(ex(btr.metrics, { assetClass: "sfr_btr", strategy: strategy("Ground-up 180-home community") }), "fallback").sources.capitalImprovementsYr1?.note).toBe(
      "A development deal with no budget in the OM — enter the construction / renovation cost; yield on cost is meaningless without it",
    );
  });
});

describe("deriveUnderwriteInputs — a mixed-use building's two incomes under one cap (lib/mixed-use)", () => {
  it("says the two incomes in a line and that the model capitalises and grows both at one rate, and changes nothing", () => {
    const mixed = ex(
      [
        metric("Asking price", "$25,000,000"),
        metric("Units", "48"),
        metric("NOI (in-place)", "$1,400,000"),
        metric("Going-in cap rate", "5.60%"),
        metric("Residential income", "$1,520,000"),
        metric("Commercial income", "$610,000"),
      ],
      { assetClass: "Retail / Multifamily" },
    );
    const m = deriveUnderwriteInputs(mixed, "fallback");
    expect(m.meta.mixedUse?.line).toBe("Mixed-use: $1.52M residential and $610k commercial income (28.6% commercial)");
    expect(m.meta.mixedUse?.read).toBe(
      "The model capitalises the $610k of commercial income at the same 5.60% exit cap as the residential and grows it at the same 3.0% a year: one cap and one growth rate for two incomes that trade to different buyers at different caps, the commercial 28.6% of it.",
    );
    // The model is the same model: no input moves for the read.
    expect(m.inputs).toEqual(deriveUnderwriteInputs(ex(mixed.metrics.slice(0, 4), { assetClass: "Retail / Multifamily" }), "fallback").inputs);
    expect(deriveUnderwriteInputs(ex([metric("Asking price", "$20,000,000"), metric("Units", "240")]), "fallback").meta.mixedUse).toBeNull();
  });
});

describe("deriveUnderwriteInputs — the PCA's immediate repairs are capital at closing (#465)", () => {
  const base = [metric("Asking price", "$42,000,000"), metric("NOI (in-place)", "$2,520,000"), metric("Units", "240")];

  it("carries the stated immediate repairs as the first year's capital where no budget is stated, and the returns pay for them", () => {
    const m = deriveUnderwriteInputs(ex([...base, metric("PCA immediate repairs", "$630,000", { page: "p. 48" })], { totalPages: 80 }), "fallback");
    expect(m.inputs.capitalImprovementsYr1).toBe(630_000);
    expect(m.sources.capitalImprovementsYr1?.provenance).toBe("extracted");
    expect(m.sources.capitalImprovementsYr1?.note).toMatch(/PCA immediate repairs — the property condition report's work the building needs now, as stated/);
    expect(computeUnderwrite(m.inputs).cashFlow[0].capitalImprovements).toBe(630_000);
    expect(m.meta.siteReports?.line).toBe("Reports: PCA immediate repairs $630,000");
    expect(m.meta.siteReports?.read).toBe(
      "The model carries the PCA's $630,000 of immediate repairs as its year-1 capital, as stated; a lender may hold more than that in escrow at closing.",
    );
  });

  it("a stated budget is read as including the repairs — never the two added", () => {
    const m = deriveUnderwriteInputs(
      ex([...base, metric("PCA immediate repairs", "$630,000"), metric("Renovation budget", "$2,400,000")]),
      "fallback",
    );
    expect(m.inputs.capitalImprovementsYr1).toBe(2_400_000);
    expect(m.meta.siteReports?.read).toContain("The model's year-1 capital of $2.4M is read as including the PCA's $630,000 of immediate repairs");
  });

  it("a hotel's PIP is read as including them too", () => {
    const hotel = { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "management" as const, pip: "", page: "" };
    const m = deriveUnderwriteInputs(
      ex([metric("Asking price", "$26,000,000"), metric("NOI (in-place)", "$2,080,000"), metric("Keys", "120"), metric("PIP cost", "$4,200,000"), metric("PCA immediate repairs", "$300,000")], {
        assetClass: "hospitality_str",
        hotel,
      }),
      "fallback",
    );
    expect(m.inputs.capitalImprovementsYr1).toBe(4_200_000);
    expect(m.meta.siteReports?.read).toContain("read as including the PCA's $300,000 of immediate repairs");
  });

  it("no repairs, no capital; no reports, no read", () => {
    const none = deriveUnderwriteInputs(ex([...base, metric("PCA immediate repairs", "None"), metric("Phase I ESA findings", "No RECs")]), "fallback");
    expect(none.inputs.capitalImprovementsYr1).toBe(0);
    expect(none.meta.siteReports?.read).toBe("");
    expect(deriveUnderwriteInputs(ex(base), "fallback").meta.siteReports).toBeNull();
  });
});

describe("deriveUnderwriteInputs — an auction's starting bid is where the price starts (#456)", () => {
  const sale = { method: "auction" as const, terms: "", condition: "As-is", page: "" };
  const base = [metric("NOI (in-place)", "$480,000"), metric("Total SF", "62,000 SF")];

  it("runs at the starting bid plus the premium, never the $10M placeholder, and says the returns are ceilings", () => {
    const m = deriveUnderwriteInputs(
      ex([...base, metric("Starting bid", "$2,500,000", { page: "p. 3" }), metric("Buyer's premium", "5%")], { assetClass: "office", sale, totalPages: 30 }),
      "fallback",
    );
    expect(m.inputs.purchasePrice).toBe(2_625_000);
    expect(m.sources.purchasePrice?.provenance).toBe("derived");
    expect(m.sources.purchasePrice?.note).toBe(
      "The $2,500,000 starting bid plus the 5% buyer's premium — the floor of what a winning bidder pays, so every return here is a ceiling; enter the price you would bid",
    );
    expect(m.sources.purchasePrice?.page).toBe("p. 3");
    expect(m.meta.sale?.line).toBe("Sold at auction: bidding opens at $2.5M; a 5% buyer's premium ($2.63M all-in at the opening bid)");
    expect(m.meta.sale?.read).toMatch(/^(At a 15% levered IRR the model pays at most|The model still clears a 15% levered IRR)/);
  });

  it("a stated asking price still wins; a negotiated sale carries no sale line", () => {
    const asked = deriveUnderwriteInputs(
      ex([...base, metric("Asking price", "$3,000,000"), metric("Starting bid", "$2,500,000")], { assetClass: "office", sale }),
      "fallback",
    );
    expect(asked.inputs.purchasePrice).toBe(3_000_000);
    const plain = deriveUnderwriteInputs(ex([...base, metric("Asking price", "$3,000,000")], { assetClass: "office", sale: { ...sale, method: "negotiated" } }), "fallback");
    expect(plain.meta.sale).toBeNull();
  });
});

describe("deriveUnderwriteInputs — a multi-tenant property's listed tenants (#457)", () => {
  // Read on a pinned day: the model reads the roster off the clock, and a
  // test counting years from the real one failed every December 2–31.
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 30)), toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const y = 2026;
  const t = (name: string, over: Record<string, string>) => ({
    name, role: "inline" as const, inSale: "yes" as const, sf: "", rent: "", leaseExpiration: "", options: "", earlyTermination: "", rights: "", page: "", ...over,
  });
  const tenants = [
    t("Staples", { sf: "10,000 SF", rent: "$300,000", leaseExpiration: String(y + 2) }),
    t("Kroger", { sf: "40,000 SF", rent: "$600,000", leaseExpiration: String(y + 30) }),
  ];
  const base = [metric("Asking price", "$14,000,000"), metric("NOI (in-place)", "$900,000"), metric("Total SF", "60,000 SF")];

  it("says the leasing capital the model does not carry for the roll before its sale", () => {
    const m = deriveUnderwriteInputs(ex(base, { assetClass: "retail", tenants }), "fallback");
    expect(m.inputs.tiPsf).toBe(0);
    expect(m.inputs.lcPct).toBe(0);
    expect(m.meta.roster?.line).toBe("Two tenants listed on 83% of the building; 33% of their rent expires before year 5, the most in year 2; Kroger pays 67% of the listed rent");
    expect(m.meta.roster?.read).toContain(
      "The model carries no leasing capital — its tenant improvements and commissions are placeholders of zero — while 33% of the listed rent expires before its sale in year 5",
    );
    expect(m.meta.roster?.read).toContain("through year 2, when 33% rolls at once.");
  });

  it("nothing on housing, or where the memorandum lists fewer than two tenants", () => {
    expect(deriveUnderwriteInputs(ex(base, { assetClass: "multifamily", tenants }), "fallback").meta.roster).toBeNull();
    expect(deriveUnderwriteInputs(ex(base, { assetClass: "retail", tenants: tenants.slice(0, 1) }), "fallback").meta.roster).toBeNull();
  });
});

describe("deriveUnderwriteInputs — a property-tax abatement (#461)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says where the abatement ends against the model's sale, and the step-up at its exit cap", () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 30)), toFake: ["Date"] });
    const m = deriveUnderwriteInputs(
      ex([
        metric("Asking price", "$55,000,000"),
        metric("NOI (in-place)", "$3,000,000"),
        metric("Units", "248"),
        metric("Tax abatement", "10-year Philadelphia tax abatement"),
        metric("Tax abatement expiration", "2029"),
        metric("Abated real estate taxes", "$70,000"),
        metric("Unabated real estate taxes", "$520,000"),
      ]),
      "fallback",
    );
    expect(m.meta.taxAbatement?.line).toBe(
      "Tax abatement: 10-year Philadelphia tax abatement; ends 2029, 2.3 years from today; $450,000 a year more once it ends (15% of the in-place NOI)",
    );
    expect(m.meta.taxAbatement?.read).toContain("the abatement ends 2029, 2.3 years into its 5-year hold, so its exit is struck on a NOI the building no longer earns — the step-up is");
    // The model is untouched: the abatement is read, never modelled.
    expect(m.inputs.capitalImprovementsYr1).toBe(0);
  });

  it("nothing where the memorandum states none", () => {
    expect(deriveUnderwriteInputs(ex([metric("Asking price", "$55,000,000"), metric("NOI (in-place)", "$3,000,000")]), "fallback").meta.taxAbatement).toBeNull();
  });
});

describe("deriveUnderwriteInputs — a note the seller offers to carry (#462)", () => {
  it("says the note as stated, then what it is worth against the model's own new loan", () => {
    const m = deriveUnderwriteInputs(
      ex([
        metric("Asking price", "$20,000,000"),
        metric("NOI (in-place)", "$1,300,000"),
        metric("Units", "120"),
        metric("Seller financing amount", "$14,000,000"),
        metric("Seller financing rate", "5.00%"),
        metric("Seller financing term", "5 years"),
        metric("Seller financing amortization", "25 years"),
      ]),
      "fallback",
    );
    expect(m.meta.sellerNote?.line).toBe("The seller offers to carry financing: $14.0M at 5.00% for 5 years, amortizing over 25 years");
    expect(m.meta.sellerNote?.read).toMatch(/^The seller's note (is worth|returns)/);
  });
});

describe("deriveUnderwriteInputs — a value-add renovation program (#460)", () => {
  const strategy = { kind: "value_add" as const, summary: "", capitalBudget: "", timeline: "" };
  const program = [
    metric("Asking price", "$48,000,000"),
    metric("NOI (in-place)", "$2,500,000"),
    metric("Units", "248"),
    metric("Renovation budget", "$2,880,000"),
    metric("Units to renovate", "192"),
    metric("Renovation cost per unit", "$15,000"),
    metric("Renovation premium", "$250"),
  ];

  it("says what a door is worth at the model's exit cap, and that the model spends the budget but carries none of the premium", () => {
    const m = deriveUnderwriteInputs(ex(program, { strategy }), "fallback");
    expect(m.inputs.capitalImprovementsYr1).toBe(2_880_000);
    expect(m.meta.valueAdd?.line).toBe("Value-add program: 192 doors to renovate; $15,000 a door; $250 a month premium (20% on cost); no achieved premium stated");
    expect(m.meta.valueAdd?.read).toContain("and the premium breaks even at");
    expect(m.meta.valueAdd?.read).toContain(
      "The screening model spends $2.88M of capital in its first year and grows today's rent at 3.0%: the premium is in none of its returns, so its IRR is not the program's.",
    );
  });

  it("nothing where the memorandum states no program", () => {
    expect(deriveUnderwriteInputs(ex(program.slice(0, 3), { strategy }), "fallback").meta.valueAdd).toBeNull();
  });

  it("with no total stated, spends the doors times a door's cost — derived, and the note says the arithmetic", () => {
    const perDoor = program.filter((m) => m.label !== "Renovation budget");
    const m = deriveUnderwriteInputs(ex(perDoor, { strategy }), "fallback");
    expect(m.inputs.capitalImprovementsYr1).toBe(2_880_000);
    expect(m.sources.capitalImprovementsYr1?.provenance).toBe("derived");
    expect(m.sources.capitalImprovementsYr1?.note).toContain(
      "192 doors × $15,000 a door, the renovation program as stated — spent in year 1 in this annual model",
    );
    expect(m.meta.valueAdd?.read).toContain("The screening model spends $2.88M of capital in its first year");
    // A deal the memorandum calls stabilized carries no program it lists.
    const stabilized = deriveUnderwriteInputs(
      ex(perDoor, { strategy: { ...strategy, kind: "stabilized" as const } }),
      "fallback",
    );
    expect(stabilized.inputs.capitalImprovementsYr1).toBe(0);
  });
});
