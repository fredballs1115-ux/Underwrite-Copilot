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
    expect(b.yieldOnCostLabel).toBe("11.7%");
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
    expect(c.yieldOnCostLabel).toBe("7.5%");
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
