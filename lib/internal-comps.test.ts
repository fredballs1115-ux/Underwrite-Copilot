import { describe, expect, it } from "vitest";
import { deriveInternalComps } from "./internal-comps";

type Sibling = Parameters<typeof deriveInternalComps>[3][number];

const m = (label: string, value: string) => ({ label, value, flagged: false, page: "" });

const sib = (
  id: string,
  name: string,
  assetClass: string,
  extraction: unknown,
  over: Partial<Sibling> = {},
): Sibling => ({
  id,
  name,
  asset_class: assetClass,
  created_at: "2026-09-01T00:00:00Z",
  is_sample: false,
  verdict: { verdict: "pass" },
  extraction,
  ...over,
});

const STABILIZED = {
  dealName: "Maddox Apartments",
  assetClass: "multifamily",
  market: "Dallas, TX",
  metrics: [
    m("Asking price", "$50,000,000"),
    m("Going-in cap rate", "5.70%"),
    m("NOI (stabilized, pro forma)", "$3,300,000"),
    m("Units", "248"),
  ],
};

/** The deal that started this: a $20M office shell whose OM states the
 *  finished residential building's $21M NOI and an 11.7% stabilized cap. */
const CONVERSION = {
  dealName: "1200 K Street — Office-to-Residential Conversion",
  assetClass: "multifamily",
  market: "Washington, DC",
  metrics: [
    m("Purchase price", "$20,000,000"),
    m("Stabilized NOI (pro forma)", "$21,000,000"),
    m("Stabilized cap rate", "11.7%"),
    m("Total project cost", "$180,000,000"),
    m("Units (proposed)", "612"),
  ],
};

describe("deriveInternalComps — the unit count is the row that counts units", () => {
  it("a 'Unit mix' row ahead of 'Units' never shadows the basis, and '248 units' parses", () => {
    const comps = deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [
      sib("a", "Maddox", "multifamily", {
        ...STABILIZED,
        metrics: [
          m("Asking price", "$50,000,000"),
          m("Going-in cap rate", "5.70%"),
          m("Unit mix", "40% studio / 60% 1BR"),
          m("Units", "248 units"),
        ],
      }),
    ]);
    expect(comps[0].basisLabel).toBe("$202k/unit");
  });
});

describe("deriveInternalComps — a deal's one class, filed by its words (lib/asset-words dealClassKey)", () => {
  it("a sibling filed Auto whose deck says 'Garden-style multifamily' is a multifamily comp, priced per unit", () => {
    const comps = deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [
      sib("g", "Garden Court", "auto", { ...STABILIZED, assetClass: "Garden-style multifamily" }),
      sib("o", "Tysons", "auto", { ...STABILIZED, assetClass: "Class A office" }),
    ]);
    expect(comps.map((c) => c.dealId)).toEqual(["g"]);
    expect(comps[0].basisLabel).toBe("$202k/unit");
  });

  it("the current deal's own phrase is read the same way, and the analyst's class ahead of its deck's", () => {
    expect(
      deriveInternalComps("current", "auto", { assetClass: "Garden-style multifamily" }, [sib("a", "Maddox", "multifamily", STABILIZED)]).map(
        (c) => c.dealId,
      ),
    ).toEqual(["a"]);
    // Filed an office by the analyst: no multifamily comps, whatever its deck said.
    expect(deriveInternalComps("current", "office", { assetClass: "Apartments" }, [sib("a", "Maddox", "multifamily", STABILIZED)])).toEqual([]);
  });
});

describe("deriveInternalComps — the sibling's kind is read first", () => {
  const comps = deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [
    sib("current", "This deal", "multifamily", STABILIZED),
    sib("a", "Maddox", "multifamily", STABILIZED),
    sib("b", "1200 K", "multifamily", CONVERSION),
    sib("c", "Sample", "multifamily", STABILIZED, { is_sample: true }),
    sib("d", "Office tower", "office", {
      assetClass: "office",
      metrics: [m("Asking price", "$90,000,000"), m("Going-in cap rate", "7.5%")],
    }),
  ]);

  it("the current deal, the sample and other asset classes never appear", () => {
    expect(comps.map((c) => c.dealId)).toEqual(["a", "b"]);
  });

  it("a stabilized sibling carries its going-in cap and its price per unit", () => {
    const a = comps.find((c) => c.dealId === "a")!;
    expect(a.kind).toBe("stabilized");
    expect(a.kindLabel).toBeNull();
    expect(a.priceLabel).toBe("$50.0M");
    expect(a.capLabel).toBe("5.70%");
    expect(a.yieldOnCostLabel).toBeNull();
    expect(a.basisLabel).toBe("$202k/unit");
  });

  it("a conversion sibling is labelled, shows yield on cost where the cap would be, and an all-in basis", () => {
    const b = comps.find((c) => c.dealId === "b")!;
    expect(b.kind).toBe("conversion");
    expect(b.kindLabel).toBe("Conversion");
    expect(b.priceLabel).toBe("$20.0M");
    // Its 11.7% "stabilized cap" is the finished project's figure, never a comp cap.
    expect(b.capLabel).toBeNull();
    // To two decimals, as the sibling's own header prints it (lib/plan-facts).
    expect(b.yieldOnCostLabel).toBe("11.67%");
    // $180M over 612 planned units — not the $20M shell over them.
    expect(b.basisLabel).toBe("$294k/unit all-in");
  });
});

describe("deriveInternalComps — the basis follows the asset class before any per-unit row", () => {
  it("an office sibling with a stray 'Price per unit' row keeps its $/SF basis", () => {
    const [c] = deriveInternalComps("current", "office", { assetClass: "office" }, [
      sib("s1", "Tower", "office", {
        dealName: "Tower",
        assetClass: "office",
        market: "Washington, DC",
        metrics: [m("Asking price", "$60,000,000"), m("Price per unit", "$500,000"), m("Total SF", "200,000 SF")],
      }),
    ]);
    expect(c.basisLabel).toBe("$300/SF");
  });

  it("a multifamily sibling's own per-unit row still wins over the derived figure", () => {
    const [c] = deriveInternalComps("current", "multifamily", { assetClass: "multifamily" }, [
      sib("s1", "Maddox", "multifamily", {
        dealName: "Maddox",
        assetClass: "multifamily",
        market: "Dallas, TX",
        metrics: [m("Asking price", "$50,000,000"), m("Price per unit", "$201,613"), m("Units", "248")],
      }),
    ]);
    expect(c.basisLabel).toBe("$201,613");
  });
});

describe("deriveInternalComps — an outdoor-storage yard has no per-SF basis", () => {
  it("shows the yard's price and cap, and no price over its shop building", () => {
    const yard = {
      dealName: "Lot 9 yard",
      assetClass: "Industrial Outdoor Storage (IOS)",
      market: "Dallas, TX",
      metrics: [m("Asking price", "$12,000,000"), m("Going-in cap rate", "6.0%"), m("Building SF", "4,000")],
    };
    const warehouse = {
      dealName: "Dock 4",
      assetClass: "industrial",
      market: "Dallas, TX",
      metrics: [m("Asking price", "$20,000,000"), m("Total SF", "100,000 SF")],
    };
    const comps = deriveInternalComps("current", "industrial", { assetClass: "industrial" }, [
      sib("y", "Lot 9 yard", "industrial", yard),
      sib("w", "Dock 4", "industrial", warehouse),
    ]);
    const by = Object.fromEntries(comps.map((c) => [c.dealId, c]));
    // It had read "$3000/SF".
    expect(by.y.basisLabel).toBeNull();
    expect(by.y.priceLabel).toBe("$12.0M");
    expect(by.y.capLabel).toBe("6.0%");
    expect(by.w.basisLabel).toBe("$200/SF");
  });
});

describe("deriveInternalComps — what never becomes a comp figure", () => {
  it("a pro forma cap on an operating asset is not a comp cap (the row still qualifies on price)", () => {
    const [c] = deriveInternalComps("x", "multifamily", null, [
      sib("p", "Pro forma only", "multifamily", {
        assetClass: "multifamily",
        metrics: [m("Asking price", "$50,000,000"), m("Pro forma cap rate", "6.50%")],
      }),
    ]);
    expect(c.priceLabel).toBe("$50.0M");
    expect(c.capLabel).toBeNull();
    expect(c.kindLabel).toBeNull();
  });

  it("says what the price buys beside it, an acronym kept whole (research pass 37)", () => {
    const interest = (share: string, summary = "") => ({ kind: "partial_interest" as const, summary, share, groundLease: "", loan: "", page: "" });
    const [tic, gp, lp] = deriveInternalComps("x", "multifamily", null, [
      sib("t", "Summit TIC", "multifamily", {
        assetClass: "multifamily",
        interest: interest("30% tenant-in-common interest"),
        metrics: [m("Asking price", "$4,200,000")],
      }),
      sib("g", "Crescent GP", "multifamily", {
        assetClass: "multifamily",
        interest: interest("50% of the general partner interest"),
        metrics: [m("Asking price", "$3,200,000")],
      }),
      sib("l", "Harbor LP", "multifamily", {
        assetClass: "multifamily",
        interest: interest("49% limited partnership interest"),
        metrics: [m("Asking price", "$20,000,000")],
      }),
    ]);
    expect([tic.priceLabel, gp.priceLabel, lp.priceLabel]).toEqual(["$4.2M · TIC 30%", "$3.2M · GP stake 50%", "$20.0M · 49% share"]);
  });

  it("a plan deal with no stated total cost has no basis — a shell's price per planned unit is not one", () => {
    const [c] = deriveInternalComps("x", "multifamily", null, [
      sib("q", "Conversion, budget unstated", "multifamily", {
        ...CONVERSION,
        metrics: CONVERSION.metrics.filter((x) => !/total project cost/i.test(x.label)),
      }),
    ]);
    expect(c.kindLabel).toBe("Conversion");
    expect(c.priceLabel).toBe("$20.0M");
    expect(c.basisLabel).toBeNull();
    expect(c.yieldOnCostLabel).toBeNull();
  });

  it("a development's land cost is its price", () => {
    const [c] = deriveInternalComps("x", "multifamily", null, [
      sib("r", "Riverside", "multifamily", {
        // The kind is read from the extraction's own words, as in production.
        dealName: "Riverside — ground-up development site, fully entitled",
        assetClass: "multifamily",
        metrics: [
          m("Land cost", "$12,000,000"),
          m("Stabilized NOI (pro forma)", "$9,000,000"),
          m("Total development cost", "$120,000,000"),
          m("Units (proposed)", "300"),
        ],
      }),
    ]);
    expect(c.kindLabel).toBe("Development");
    expect(c.priceLabel).toBe("$12.0M");
    expect(c.yieldOnCostLabel).toBe("7.50%");
    expect(c.basisLabel).toBe("$400k/unit all-in");
  });

  it("a sibling that yields neither a price, a cap nor a yield is not a comp", () => {
    expect(
      deriveInternalComps("x", "multifamily", null, [
        sib("s", "Occupancy only", "multifamily", {
          assetClass: "multifamily",
          metrics: [m("Occupancy", "95%")],
        }),
      ]),
    ).toEqual([]);
  });
});

describe("deriveInternalComps — every class in its own noun and basis (lib/asset-words)", () => {
  it("a hotel sibling is priced per key, counted off its Keys row", () => {
    const [c] = deriveInternalComps("current", "hospitality_str", { assetClass: "hospitality_str" }, [
      sib("s1", "The Harbor Inn", "hospitality_str", {
        dealName: "The Harbor Inn",
        assetClass: "hospitality_str",
        market: "Norfolk, VA",
        metrics: [m("Asking price", "$24,000,000"), m("Keys", "120")],
      }),
    ]);
    expect(c.basisLabel).toBe("$200k/key");
  });

  it("a manufactured-housing sibling is priced per pad", () => {
    const [c] = deriveInternalComps("current", "manufactured_housing", { assetClass: "manufactured_housing" }, [
      sib("s1", "Pine Grove MHC", "manufactured_housing", {
        dealName: "Pine Grove MHC",
        assetClass: "manufactured_housing",
        market: "Richmond, VA",
        metrics: [m("Asking price", "$9,000,000"), m("Pads", "150")],
      }),
    ]);
    expect(c.basisLabel).toBe("$60k/pad");
  });

  it("a storage sibling is priced per SF, never per unit, whatever its unit count says", () => {
    const [c] = deriveInternalComps("current", "self_storage", { assetClass: "self_storage" }, [
      sib("s1", "StoreMore", "self_storage", {
        dealName: "StoreMore",
        assetClass: "self_storage",
        market: "Dallas, TX",
        metrics: [m("Asking price", "$12,000,000"), m("Units", "640"), m("Total SF", "80,000 SF")],
      }),
    ]);
    expect(c.basisLabel).toBe("$150/SF");
  });
});
