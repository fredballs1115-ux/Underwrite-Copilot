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
    expect(ctx).toContain("over $180.0M of total cost it is an 11.7% yield on cost");
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
    expect(ctx).toContain("11.7% yield on cost");
    expect(ctx).not.toContain("per planned unit");
    expect(ctx).not.toContain("Timeline as stated");
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
