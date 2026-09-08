// The readers every surface shares — the unit count, the price — must read
// the row they are named for and nothing that merely starts with the same
// word. A "Unit mix" row read as forty units puts a wrong basis on the
// analytics, the share page and the IC memo; a "Sale price" row skipped
// drops a comp; a legacy row with no metrics array must not throw.
import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import {
  assessPlausibility,
  findPriceMetric,
  inferStrategy,
  parseCount,
  planSummary,
  unitCountFromMetrics,
  unitCountRow,
} from "./deal-strategy";

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });

describe("parseCount — a count is a whole number, alone or with what it counts", () => {
  it("reads the plain forms", () => {
    expect(parseCount("312")).toBe(312);
    expect(parseCount("1,248")).toBe(1248);
    expect(parseCount("312 units")).toBe(312);
    expect(parseCount("312 Units (proposed)")).toBe(312);
    expect(parseCount("312 units (285 market-rate, 27 affordable)")).toBe(312);
    expect(parseCount("approx. 300 apartments")).toBe(300);
    expect(parseCount("~300")).toBe(300);
    expect(parseCount("120 keys")).toBe(120);
    expect(parseCount("500+")).toBe(500);
  });

  it("refuses anything that is not a count", () => {
    expect(parseCount("40% studio / 60% 1BR")).toBeNull();
    expect(parseCount("650–1,200 SF")).toBeNull();
    expect(parseCount("312 / 285,000 SF")).toBeNull();
    expect(parseCount("$312,000")).toBeNull();
    expect(parseCount("1.5")).toBeNull();
    expect(parseCount("TBD")).toBeNull();
    expect(parseCount("")).toBeNull();
  });
});

describe("unitCountFromMetrics — the row that counts units, not the rows about them", () => {
  it("a 'Unit mix' row ahead of 'Units' never shadows the count", () => {
    expect(
      unitCountFromMetrics([m("Unit mix", "40% studio / 60% 1BR"), m("Units", "312")]),
    ).toBe(312);
    expect(unitCountFromMetrics([m("Unit sizes", "650–1,200 SF"), m("Units", "312")])).toBe(312);
    expect(unitCountFromMetrics([m("Unit type", "Garden-style"), m("Total units", "312")])).toBe(312);
  });

  it("a blank stays blank when only the 'about units' rows exist", () => {
    expect(unitCountFromMetrics([m("Unit mix", "40% studio / 60% 1BR")])).toBeNull();
    expect(unitCountFromMetrics([m("Unit sizes", "650–1,200 SF")])).toBeNull();
    expect(unitCountFromMetrics([m("Units per acre", "42")])).toBeNull();
    expect(unitCountFromMetrics([m("Unit price", "$312,000")])).toBeNull();
    expect(unitCountFromMetrics([m("Units", "312 / 285,000 SF")])).toBeNull();
  });

  it("reads the finished product's count on a plan deal", () => {
    expect(unitCountFromMetrics([m("Units (proposed)", "612")])).toBe(612);
    expect(unitCountFromMetrics([m("Units", "612 units (proposed)")])).toBe(612);
  });
});

describe("findPriceMetric — every name an OM gives the number being asked", () => {
  it("reads a sale, list, contract or whisper price as the price", () => {
    expect(findPriceMetric([m("Sale price", "$42,000,000")], "stabilized")?.value).toBe("$42,000,000");
    expect(findPriceMetric([m("List price", "$42,000,000")], "stabilized")?.value).toBe("$42,000,000");
    expect(findPriceMetric([m("Whisper price", "$42,000,000")], "stabilized")?.value).toBe("$42,000,000");
    expect(findPriceMetric([m("Whisper", "$42M")], "stabilized")?.value).toBe("$42M");
    expect(findPriceMetric([m("Contract price", "$42,000,000")], "value_add")?.value).toBe("$42,000,000");
  });

  it("reads an offer price; never a land allocation on an operating asset, never a price reduction", () => {
    expect(findPriceMetric([m("Offer price", "$42,000,000")], "stabilized")?.value).toBe("$42,000,000");
    expect(findPriceMetric([m("Land price", "$4,000,000")], "stabilized")).toBeNull();
    // On a development the land IS what is being bought.
    expect(findPriceMetric([m("Land price", "$4,000,000")], "development")?.value).toBe("$4,000,000");
    expect(
      findPriceMetric(
        [m("Price reduction", "$2,000,000"), m("Asking price", "$40,000,000")],
        "stabilized",
      )?.value,
    ).toBe("$40,000,000");
  });

  it("never reads what the building last traded for, or a per-unit price", () => {
    expect(findPriceMetric([m("Last sale price", "$30,000,000")], "stabilized")).toBeNull();
    expect(findPriceMetric([m("Prior sale price (2019)", "$30,000,000")], "stabilized")).toBeNull();
    expect(findPriceMetric([m("Sale price per unit", "$169,000")], "stabilized")).toBeNull();
    expect(findPriceMetric([m("Sale price / SF", "$420")], "stabilized")).toBeNull();
    expect(
      findPriceMetric(
        [m("Last sale price", "$30,000,000"), m("Asking price", "$42,000,000")],
        "stabilized",
      )?.value,
    ).toBe("$42,000,000");
  });
});

describe("a legacy row with no metrics array is read, not thrown on", () => {
  const legacy = {
    dealName: "Old Screen",
    assetClass: "multifamily",
    market: "Dallas, TX",
    address: "",
    buyerNotes: "Office-to-residential conversion of a 1970s tower.",
  } as unknown as ExtractionResult;

  it("infers the kind from the words it has", () => {
    expect(inferStrategy(legacy).kind).toBe("conversion");
  });

  it("summarises the plan as all blanks and finds nothing implausible", () => {
    const plan = planSummary(legacy, inferStrategy(legacy));
    expect(plan).toMatchObject({ kind: "conversion", price: null, totalCost: null, units: null });
    expect(assessPlausibility(legacy)).toEqual([]);
  });

  it("a legacy row with no plan words is unknown, never stabilized", () => {
    const bare = { dealName: "Old Screen", assetClass: "office", market: "", address: "" } as unknown as ExtractionResult;
    expect(inferStrategy(bare).kind).toBe("unknown");
  });
});

describe("unitCountFromMetrics — every row that counts units, no row that merely mentions them", () => {
  it("reads the names an OM uses for the count", () => {
    expect(unitCountFromMetrics([m("Residential units", "312")])).toBe(312);
    expect(unitCountFromMetrics([m("Apartment units", "312")])).toBe(312);
    expect(unitCountFromMetrics([m("Number of units", "312")])).toBe(312);
    expect(unitCountFromMetrics([m("Doors", "312")])).toBe(312);
    expect(unitCountFromMetrics([m("Keys", "180")])).toBe(180);
    expect(unitCountFromMetrics([m("Proposed units", "612")])).toBe(612);
  });

  it("a partial count is never the count", () => {
    expect(unitCountFromMetrics([m("Vacant units", "12")])).toBeNull();
    expect(unitCountFromMetrics([m("Affordable units", "27")])).toBeNull();
    expect(unitCountFromMetrics([m("Renovated units", "120")])).toBeNull();
    expect(unitCountFromMetrics([m("Vacant units", "12"), m("Units", "312")])).toBe(312);
  });

  it("unitCountRow hands back the OM's own row, with its page", () => {
    const row = unitCountRow([
      m("Unit mix", "40% studio / 60% 1BR"),
      { ...m("Units", "248 units"), page: "p. 4" },
    ]);
    expect(row?.value).toBe("248 units");
    expect(row?.page).toBe("p. 4");
  });
});

describe("assessPlausibility — the basis check divides by the real count", () => {
  const ex = (metrics: ExtractedMetric[]): ExtractionResult => ({
    dealName: "Maddox Apartments",
    assetClass: "multifamily",
    market: "Dallas, TX",
    address: "",
    metrics,
  });

  it("a 'Vacant units' or 'Unit mix' row never manufactures an out-of-band basis", () => {
    const f = assessPlausibility(
      ex([
        m("Asking price", "$50,000,000"),
        m("Vacant units", "12"),
        m("Unit mix", "40% studio / 60% 1BR"),
        m("Units", "248"),
      ]),
    );
    expect(f.find((x) => x.code === "basis_out_of_band")).toBeUndefined();
  });

  it("still names a basis no market trades at when the real count says so", () => {
    const f = assessPlausibility(ex([m("Asking price", "$50,000,000"), m("Vacant units", "12"), m("Units", "5")]));
    expect(f.find((x) => x.code === "basis_out_of_band")?.title).toContain("5 units");
  });
});
