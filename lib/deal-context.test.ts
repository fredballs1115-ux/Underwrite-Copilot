import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { dealContextFor } from "./deal-context";

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });

const CONVERSION: ExtractionResult = {
  dealName: "1200 K Street — Office-to-Residential Conversion",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1200 K St NW, Washington, DC",
  strategy: {
    kind: "conversion",
    summary: "Convert the vacant office building into 612 apartments.",
    capitalBudget: "",
    timeline: "24 months of construction, 12 months of lease-up.",
  },
  metrics: [
    m("Purchase price", "$20,000,000"),
    m("NOI (stabilized, pro forma)", "$21,000,000"),
    m("Total project cost", "$180,000,000"),
    m("Units (proposed)", "612"),
  ],
};

describe("dealContextFor — what the screen established, for every step that reads the OM", () => {
  it("names the kind, the stabilized NOI over total cost, the all-in basis per planned unit and the timeline", () => {
    const ctx = dealContextFor(CONVERSION)!;
    expect(ctx).toContain("Deal type: Conversion — Convert the vacant office building into 612 apartments.");
    expect(ctx).toContain("over $180.0M of total cost it is an 11.67% yield on cost");
    expect(ctx).toContain("Total cost is $294k per planned unit (612 units)");
    expect(ctx).toContain("never the shell's price");
    // One period, even though the OM's timeline ended with its own.
    expect(ctx).toContain("Timeline as stated: 24 months of construction, 12 months of lease-up.");
    expect(ctx).not.toContain("lease-up..");
  });

  it("a development's basis is never the land price", () => {
    const ctx = dealContextFor({
      ...CONVERSION,
      dealName: "Riverside — ground-up development site, fully entitled",
      strategy: undefined,
      metrics: [
        m("Land cost", "$12,000,000"),
        m("Stabilized NOI (pro forma)", "$9,000,000"),
        m("Total development cost", "$120,000,000"),
        m("Units (proposed)", "300"),
      ],
    })!;
    expect(ctx).toContain("Deal type: Development");
    expect(ctx).toContain("Total cost is $400k per planned unit (300 units)");
    expect(ctx).toContain("never the land price");
    expect(ctx).not.toContain("Timeline as stated");
  });

  it("says nothing about units or timing the OM does not state", () => {
    const ctx = dealContextFor({
      ...CONVERSION,
      strategy: { ...CONVERSION.strategy!, timeline: "" },
      metrics: CONVERSION.metrics.filter((x) => !/^units/i.test(x.label)),
    })!;
    expect(ctx).toContain("11.67% yield on cost");
    expect(ctx).not.toContain("per planned unit");
    expect(ctx).not.toContain("Timeline as stated");
  });

  it("reads the kind with the first signal beside the extraction, as the market figures and the deal page do (research pass 18)", () => {
    // The extraction names no plan; the first signal calls it a conversion.
    const unnamed: ExtractionResult = {
      ...CONVERSION,
      dealName: "1200 K Street",
      strategy: { kind: "unknown", summary: "", capitalBudget: "", timeline: "" },
      metrics: [m("Asking price", "$20,000,000"), m("NOI (in place)", "$1,200,000")],
    };
    const signal = { take: "A conversion of a vacant office tower to apartments — check the budget." };
    expect(dealContextFor(unnamed)).toBe("Deal type: Stabilized.");
    const read = dealContextFor(unnamed, null, signal)!;
    expect(read).toMatch(/^Deal type: Conversion — /);
    expect(read).not.toContain("Stabilized");
    // A signal that names no plan changes nothing.
    expect(dealContextFor(unnamed, null, { take: "A stabilized asset — check the rent roll." })).toBe("Deal type: Stabilized.");
  });

  it("a price stated as a range says which end every figure is struck at (#466, research pass 18)", () => {
    const ranged: ExtractionResult = {
      ...CONVERSION,
      dealName: "Maddox Apartments",
      strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
      metrics: [m("Asking price", "$40,000,000 – $42,000,000"), m("Units", "150")],
    };
    expect(dealContextFor(ranged)).toBe(
      "The asking price is stated as a range, $40–42M: every figure here is struck at its top, $42.0M, the end that does not flatter a return. Deal type: Stabilized.",
    );
    // Guidance in the OM's own shorthand reads the same.
    expect(dealContextFor({ ...ranged, metrics: [m("Pricing guidance", "$40–42M")] })).toContain(
      "The pricing guidance is stated as a range, $40–42M: every figure here is struck at its top, $42.0M",
    );
    // One figure: nothing said.
    expect(dealContextFor({ ...ranged, metrics: [m("Asking price", "$42,000,000")] })).toBe("Deal type: Stabilized.");
  });

  it("a stabilized asset gets only its type; an unknown strategy gets nothing", () => {
    expect(
      dealContextFor({
        ...CONVERSION,
        dealName: "Maddox Apartments",
        strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
        metrics: [m("Asking price", "$50,000,000"), m("Going-in cap rate", "5.70%")],
      }),
    ).toBe("Deal type: Stabilized.");
    expect(dealContextFor(null)).toBeNull();
  });
});

describe("dealContextFor — a portfolio OM says what it offers", () => {
  const property = (name: string, address: string, count: string) => ({
    name,
    address,
    count,
    area: "",
    noi: "",
    occupancy: "",
    yearBuilt: "",
    allocatedPrice: "",
    page: "",
  });
  const PORTFOLIO: ExtractionResult = {
    dealName: "Two-City Apartment Portfolio",
    assetClass: "multifamily",
    strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
    properties: [
      property("Liberty Lofts", "1200 Liberty Ave, Pittsburgh, PA 15222", "128"),
      property("Ohio City Commons", "1850 W 25th St, Cleveland, OH 44113", "210"),
    ],
    metrics: [m("Asking price", "$66,000,000"), m("Units", "338")],
  };

  it("adds the portfolio's line after the strategy's, and says it even when the strategy is unknown", () => {
    const ctx = dealContextFor(PORTFOLIO)!;
    expect(ctx.startsWith("Deal type: Stabilized")).toBe(true);
    expect(ctx).toContain("Portfolio: 2 properties across 2 markets — Pittsburgh PA (1) and Cleveland OH (1); the largest by count is Ohio City Commons at 62% of the whole.");
    const unknown = dealContextFor({ ...PORTFOLIO, strategy: undefined, metrics: [] })!;
    expect(unknown.startsWith("Portfolio: 2 properties")).toBe(true);
    // One property is not a portfolio, and an unknown single asset says nothing.
    expect(dealContextFor({ ...PORTFOLIO, strategy: undefined, metrics: [], properties: [PORTFOLIO.properties![0]] })).toBeNull();
  });
});

describe("dealContextFor — a single tenant's lease is said before any figure (#454)", () => {
  it("names the tenant, its guarantor, the term and the increases, and says nothing on a multi-tenant deal", () => {
    const nnn: ExtractionResult = {
      dealName: "Walgreens | Tulsa, OK",
      assetClass: "net_lease",
      strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
      singleTenant: { tenant: "Walgreens Co.", guarantor: "Walgreens Boots Alliance, Inc.", leaseType: "Absolute NNN", landlordObligations: "", tenantRights: "", page: "" },
      // A lease a century out, so the years left read the same whatever day the test runs.
      metrics: [m("Asking price", "$6,500,000"), m("Lease expiration", "December 31, 2126"), m("Rent increases", "Flat")],
    };
    const ctx = dealContextFor(nnn)!;
    expect(ctx).toContain("Single tenant: Walgreens Co. leases the whole property, the rent guaranteed by Walgreens Boots Alliance, Inc. as stated.");
    expect(ctx).toContain("The lease ends Dec 2126");
    expect(ctx).toContain("The rent is flat until Dec 2126, as stated");
    expect(ctx).toContain("Lease type as stated: Absolute NNN.");
    // Said even where the strategy is unknown.
    expect(dealContextFor({ ...nnn, strategy: undefined })!.startsWith("Single tenant: Walgreens Co.")).toBe(true);
    expect(dealContextFor({ ...nnn, singleTenant: { ...nnn.singleTenant!, tenant: "" } })).toBe("Deal type: Stabilized.");
  });
});

describe("dealContextFor — what a hotel is sold with (#455)", () => {
  it("names the flag, the encumbrance and the PIP, and says nothing on anything but a hotel", () => {
    const hotel: ExtractionResult = {
      dealName: "Courtyard Nashville Downtown",
      assetClass: "hospitality_str",
      strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
      hotel: { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "unencumbered", pip: "", page: "" },
      metrics: [m("Asking price", "$26,000,000"), m("Keys", "120"), m("PIP cost", "$4,200,000")],
    };
    const ctx = dealContextFor(hotel)!;
    expect(ctx).toContain("Hotel: The hotel is flagged Courtyard by Marriott, as stated. It is sold unencumbered");
    expect(ctx).toContain("The brand's property improvement plan is $4.2M, $35k a key across its 120 keys");
    expect(dealContextFor({ ...hotel, hotel: undefined })).toBe("Deal type: Stabilized.");
  });
});

describe("dealContextFor — how the property is sold (#456)", () => {
  it("says an auction's starting bid is not a price, before anything else but what is being sold", () => {
    const auction: ExtractionResult = {
      dealName: "Midtown Office Tower",
      assetClass: "office",
      strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
      sale: { method: "auction", terms: "", condition: "", page: "" },
      metrics: [m("NOI (in-place)", "$480,000"), m("Starting bid", "$2,500,000"), m("Buyer's premium", "5%")],
    };
    const ctx = dealContextFor(auction)!;
    expect(ctx.startsWith("How it is sold: The property is sold at auction: bidding opens at $2.5M")).toBe(true);
    expect(ctx).toContain("$2.5M at the hammer is $2.63M all-in");
    expect(dealContextFor({ ...auction, sale: { ...auction.sale!, method: "negotiated" }, metrics: [m("Asking price", "$3,000,000")] })).toBe(
      "Deal type: Stabilized.",
    );
  });
});

describe("dealContextFor — a multi-tenant property's listed tenants (#457)", () => {
  it("says what the list covers and the anchor outside the sale; nothing on housing", () => {
    const t = (name: string, over: Record<string, string> = {}) => ({
      name, role: "inline" as const, inSale: "yes" as const, sf: "", rent: "", leaseExpiration: "", options: "", earlyTermination: "", rights: "", page: "", ...over,
    });
    const center: ExtractionResult = {
      dealName: "Maple Grove Crossing",
      assetClass: "retail",
      strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
      tenants: [
        t("Kroger", { sf: "58,000 SF", rent: "$725,000", leaseExpiration: "January 31, 2124" }),
        t("Staples", { sf: "20,000 SF", rent: "$360,000", leaseExpiration: "June 30, 2124" }),
        { ...t("Target", { sf: "125,000 SF" }), role: "anchor" as const, inSale: "no" as const },
      ],
      metrics: [m("Total SF", "90,000 SF"), m("NOI (in-place)", "$1,000,000")],
    };
    const ctx = dealContextFor(center)!;
    expect(ctx).toContain("The tenants: The memorandum lists two tenants on 78,000 SF, 87% of the building's 90,000 SF");
    expect(ctx).toContain("Target anchors the property but is not part of the offering, as stated");
    expect(ctx).toContain("As listed: Kroger (58,000 SF, $725,000 a year, ends Jan 2124)");
    expect(dealContextFor({ ...center, assetClass: "multifamily" })).toBe("Deal type: Stabilized.");
  });
});

describe("dealContextFor — a value-add renovation program (#460)", () => {
  it("says the program's return on cost and whether its premium is proven", () => {
    const program: ExtractionResult = {
      dealName: "The Parkline",
      assetClass: "multifamily",
      strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" },
      metrics: [m("Units to renovate", "192"), m("Renovation cost per unit", "$15,000"), m("Renovation premium", "$250")],
    };
    const ctx = dealContextFor(program)!;
    expect(ctx).toContain("The renovation program: The program renovates 192 doors at $15,000 each for $250 a month more rent: 20% a year");
    expect(ctx).toContain("No premium achieved on renovated units is stated");
  });
});

describe("dealContextFor — a property-tax abatement (#461)", () => {
  it("says the abatement, when it ends and the step-up against the NOI", () => {
    const abated: ExtractionResult = {
      dealName: "The Fairmount",
      assetClass: "multifamily",
      metrics: [
        m("NOI (in-place)", "$3,000,000"),
        m("Tax abatement", "10-year Philadelphia tax abatement"),
        m("Tax abatement expiration", "2099"),
        m("Abated real estate taxes", "$70,000"),
        m("Unabated real estate taxes", "$520,000"),
      ],
    };
    const ctx = dealContextFor(abated)!;
    expect(ctx).toContain("The tax abatement: The property's taxes are abated under its 10-year Philadelphia tax abatement until 2099");
    expect(ctx).toContain("$450,000 a year more once it ends, 15% of the in-place NOI");
  });
});

describe("dealContextFor — a note the seller offers to carry (#462)", () => {
  it("says the note as stated, struck on the ask, and that its rate is paid for in the price", () => {
    const note: ExtractionResult = {
      dealName: "Maple Court",
      assetClass: "multifamily",
      metrics: [
        m("Asking price", "$20,000,000"),
        m("Seller financing amount", "70% of the purchase price"),
        m("Seller financing rate", "5.00%"),
        m("Seller financing term", "5 years"),
      ],
    };
    const ctx = dealContextFor(note)!;
    expect(ctx).toContain("The memorandum says the seller will carry financing: $14.0M (70% of the price) at 5.00% for 5 years.");
    expect(ctx).toContain("has usually priced the difference into the ask");
  });
});

describe("dealContextFor — a student building (#468)", () => {
  it("says the pre-leasing against last year's, the beds and the walk, each as stated", () => {
    const student: ExtractionResult = {
      dealName: "The Standard",
      assetClass: "student_housing",
      metrics: [
        m("Asking price", "$61,200,000"),
        m("Beds", "612"),
        m("Pre-leased", "87% for Fall 2026"),
        m("Pre-leased last year", "82%"),
        m("Distance to campus", "0.3 miles"),
      ],
    };
    const ctx = dealContextFor(student)!;
    expect(ctx).toContain("Student housing: The building is 87% pre-leased for Fall 2026, 5 points ahead of last year's 82% at the same point");
    expect(ctx).toContain("612 beds, $100,000 a bed at the price");
    expect(ctx).toContain("It is 0.3 miles from campus: pedestrian");
  });
});

describe("dealContextFor — a manufactured-housing park (#470)", () => {
  it("says whose homes stand on the pads, the lot rent against the market's and the water and sewer, each as stated", () => {
    const park: ExtractionResult = {
      dealName: "Shady Pines",
      assetClass: "manufactured_housing",
      metrics: [
        m("Asking price", "$9,300,000"),
        m("Pads", "150"),
        m("Occupied pads", "132"),
        m("Park-owned homes", "18"),
        m("Lot rent", "$430"),
        m("Market lot rent", "$525"),
        m("Water and sewer", "Private well and septic"),
      ],
    };
    const ctx = dealContextFor(park)!;
    expect(ctx).toContain("Manufactured housing: It has 150 pads at $62,000 a pad, 132 occupied (88%); 18 carry a home the park owns");
    expect(ctx).toContain("The average lot rent is $430 a month against the memorandum's market $525");
    expect(ctx).toContain("The water and sewer are the park's own (as stated: Private well and septic)");
  });
});

describe("dealContextFor — a self-storage facility (#471)", () => {
  it("says the two occupancies and the in-place rent against the street rate, each as stated", () => {
    const storage: ExtractionResult = {
      dealName: "Lakewood Self Storage",
      assetClass: "self_storage",
      metrics: [
        m("Asking price", "$9,800,000"),
        m("Physical occupancy", "91%"),
        m("Economic occupancy", "84%"),
        m("In-place rent", "$1.38/SF/month"),
        m("Street rate", "$1.14/SF/month"),
      ],
    };
    const ctx = dealContextFor(storage)!;
    expect(ctx).toContain("Self-storage: It is 91% occupied by units, 84% economically: the 7 points between the units let and the rent collected");
    expect(ctx).toContain("21.1% over it, the premium years of rate increases built");
  });
});

describe("dealContextFor — the third-party reports (#465)", () => {
  it("says what the reports found, report by report, each as stated", () => {
    const reported: ExtractionResult = {
      dealName: "Harbor Point",
      assetClass: "multifamily",
      metrics: [
        m("Asking price", "$42,000,000"),
        m("Phase I ESA findings", "No RECs"),
        m("PCA immediate repairs", "$630,000"),
        m("Zoning conformance", "Legal non-conforming (density)"),
      ],
    };
    const ctx = dealContextFor(reported)!;
    expect(ctx).toContain('The third-party reports: The seller\'s Phase I found no recognized environmental conditions ("No RECs").');
    expect(ctx).toContain("puts the immediate repairs at $630,000, 1.5% of the asking price");
    expect(ctx).toContain("law-and-ordinance cover");
  });
});
