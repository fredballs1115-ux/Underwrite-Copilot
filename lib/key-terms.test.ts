// The eighth review's first finding: the memo's "Key terms" block sorted the
// flagged rows first and cut at four, so the sample memo opened on four
// speculative pro-forma figures and never stated the asking price, the
// going-in cap or the unit count. One reader now orders the block for the
// memo and the shared screen alike.
import { describe, expect, it } from "vitest";
import { keyTermRows } from "./key-terms";
import { SAMPLE_DEAL } from "./sample-deal";
import { inferStrategy } from "./deal-strategy";

const conversion = [
  { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: true },
  { label: "Pro forma rent", value: "$3,400/mo", flagged: true },
  { label: "Rentable square feet", value: "300,000", flagged: false },
  { label: "Total project cost", value: "$180,000,000", flagged: false },
  { label: "Purchase price", value: "$20,000,000", flagged: false },
  { label: "Proposed units", value: "612", flagged: false },
];

describe("keyTermRows — the deal-defining rows lead the key terms", () => {
  it("on the sample deal: asking price, going-in cap and units first, then the flagged rows", () => {
    const rows = keyTermRows(SAMPLE_DEAL.extraction.metrics, inferStrategy(SAMPLE_DEAL.extraction).kind, 8);
    expect(rows.slice(0, 3).map((m) => m.label)).toEqual(["Asking price", "Going-in cap", "Units"]);
    // The flagged pro-forma rows still come before the unflagged rest.
    expect(rows[3].flagged).toBe(true);
    // Cut at four — the memo's width when the screen block is present — the
    // price is still on the page.
    expect(keyTermRows(SAMPLE_DEAL.extraction.metrics, "stabilized", 4).map((m) => m.value)).toContain("$68,000,000");
  });

  it("on a plan deal: the price, the stabilized NOI and the total cost the plan is judged on, then the planned units", () => {
    const rows = keyTermRows(conversion, "conversion", 4);
    expect(rows.map((m) => m.label)).toEqual([
      "Purchase price",
      "NOI (stabilized, pro forma)",
      "Total project cost",
      "Proposed units",
    ]);
  });

  it("a development with only a land cost leads with it; a stabilized asset never leads with a stabilized NOI", () => {
    const land = [
      { label: "Pro forma NOI (stabilized)", value: "$9,000,000", flagged: true },
      { label: "Land cost", value: "$8,000,000", flagged: false },
      { label: "Proposed units", value: "240", flagged: false },
    ];
    expect(keyTermRows(land, "development", 8)[0].label).toBe("Land cost");
    const stabilized = [
      { label: "NOI (stabilized, pro forma)", value: "$4,000,000", flagged: true },
      { label: "Going-in cap rate", value: "5.4%", flagged: false },
      { label: "Asking price", value: "$60,000,000", flagged: false },
    ];
    expect(keyTermRows(stabilized, "stabilized", 8).map((m) => m.label)).toEqual([
      "Asking price",
      "Going-in cap rate",
      "NOI (stabilized, pro forma)",
    ]);
  });

  it("on a note: the price, then the loan's own terms — never the collateral's cap first (#416)", () => {
    const note = [
      { label: "Going-in cap rate", value: "5.4%", flagged: true },
      { label: "Asking price", value: "$20,000,000", flagged: false },
      { label: "Units", value: "240", flagged: false },
      { label: "Payment status", value: "Performing", flagged: false },
      { label: "Maturity date", value: "March 31, 2028", flagged: false },
      { label: "Yield to maturity (at ask)", value: "12.0%", flagged: false },
      { label: "Note rate", value: "5.25%", flagged: false },
      { label: "Unpaid principal balance", value: "$24,400,000", flagged: false },
    ];
    // The collateral's size still says what secures the loan; its cap
    // comes after, among the flagged rows.
    expect(keyTermRows(note, "stabilized", 7, "note").map((m) => m.label)).toEqual([
      "Asking price",
      "Unpaid principal balance",
      "Note rate",
      "Maturity date",
      "Payment status",
      "Units",
      "Going-in cap rate",
    ]);
    // The same rows read as a building lead with its cap and count.
    expect(keyTermRows(note, "stabilized", 3).map((m) => m.label)).toEqual(["Asking price", "Going-in cap rate", "Units"]);
  });

  it("a single tenant's lease leads after the cap (#454): when it ends, how its rent grows, the tenant's options", () => {
    const nnn = [
      { label: "Tenant credit rating", value: "BBB- (S&P)", flagged: false },
      { label: "Renewal options", value: "Eight 5-year options", flagged: false },
      { label: "NOI (in-place)", value: "$390,000", flagged: false },
      { label: "Rent increases", value: "10% every 5 years", flagged: false },
      { label: "Going-in cap rate", value: "6.00%", flagged: false },
      { label: "Lease expiration", value: "March 31, 2036", flagged: false },
      { label: "Asking price", value: "$6,500,000", flagged: false },
    ];
    expect(keyTermRows(nnn, "stabilized", 5).map((m) => m.label)).toEqual([
      "Asking price",
      "Going-in cap rate",
      "Lease expiration",
      "Rent increases",
      "Renewal options",
    ]);
  });

  it("a hotel's PIP, its franchise's end and its RevPAR lead after the count (#455)", () => {
    const hotel = [
      { label: "RevPAR", value: "$140.23", flagged: false },
      { label: "Franchise expiration", value: "June 30, 2034", flagged: false },
      { label: "Keys", value: "120", flagged: false },
      { label: "PIP cost", value: "$4,200,000", flagged: false },
      { label: "Going-in cap rate", value: "8.00%", flagged: false },
      { label: "Asking price", value: "$26,000,000", flagged: false },
    ];
    expect(keyTermRows(hotel, "stabilized", 6).map((m) => m.label)).toEqual([
      "Asking price",
      "Going-in cap rate",
      "Keys",
      "PIP cost",
      "Franchise expiration",
      "RevPAR",
    ]);
  });

  it("an auction's starting bid, premium, reserve and deadline stand where the price would (#456)", () => {
    const auction = [
      { label: "Total SF", value: "62,000 SF", flagged: false },
      { label: "Bid deadline", value: "October 15, 2026", flagged: false },
      { label: "Replacement reserve", value: "$0.25/SF", flagged: false },
      { label: "Reserve price", value: "Undisclosed", flagged: false },
      { label: "Buyer's premium", value: "5%", flagged: false },
      { label: "Starting bid", value: "$2,500,000", flagged: false },
    ];
    expect(keyTermRows(auction, "stabilized", 4).map((m) => m.label)).toEqual(["Starting bid", "Buyer's premium", "Reserve price", "Bid deadline"]);
  });

  it("a multi-tenant property's quoted WALT leads after the price (#457)", () => {
    const center = [
      { label: "Total SF", value: "112,000 SF", flagged: false },
      { label: "Occupancy", value: "94%", flagged: false },
      { label: "WALT", value: "6.8 years", flagged: false },
      { label: "Asking price", value: "$21,500,000", flagged: false },
    ];
    expect(keyTermRows(center, "stabilized", 2).map((m) => m.label)).toEqual(["Asking price", "WALT"]);
  });

  it("a value-add program's doors, cost, premium and achieved premium lead after the price (#460)", () => {
    const program = [
      { label: "Occupancy", value: "94%", flagged: false },
      { label: "Achieved renovation premium", value: "$235", flagged: false },
      { label: "Renovation premium", value: "$250", flagged: false },
      { label: "Renovation cost per unit", value: "$15,000", flagged: false },
      { label: "Units to renovate", value: "192", flagged: false },
      { label: "Asking price", value: "$48,000,000", flagged: false },
    ];
    expect(keyTermRows(program, "stabilized", 5).map((m) => m.label)).toEqual([
      "Asking price",
      "Units to renovate",
      "Renovation cost per unit",
      "Renovation premium",
      "Achieved renovation premium",
    ]);
  });

  it("a tax abatement's program, its end and the full bill lead after the price (#461)", () => {
    const abated = [
      { label: "Occupancy", value: "94%", flagged: false },
      { label: "Unabated real estate taxes", value: "$520,000", flagged: false },
      { label: "Abated real estate taxes", value: "$70,000", flagged: false },
      { label: "Tax abatement expiration", value: "2031", flagged: false },
      { label: "Tax abatement", value: "10-year Philadelphia tax abatement", flagged: false },
      { label: "Asking price", value: "$55,000,000", flagged: false },
    ];
    expect(keyTermRows(abated, "stabilized", 4).map((m) => m.label)).toEqual([
      "Asking price",
      "Tax abatement",
      "Tax abatement expiration",
      "Unabated real estate taxes",
    ]);
  });

  it("a seller's note leads with its size, rate and term after the price (#462)", () => {
    const note = [
      { label: "Occupancy", value: "94%", flagged: false },
      { label: "Seller financing term", value: "5 years", flagged: false },
      { label: "Seller financing rate", value: "5.00%", flagged: false },
      { label: "Seller financing amount", value: "$14,000,000", flagged: false },
      { label: "Asking price", value: "$20,000,000", flagged: false },
    ];
    expect(keyTermRows(note, "stabilized", 4).map((m) => m.label)).toEqual([
      "Asking price",
      "Seller financing amount",
      "Seller financing rate",
      "Seller financing term",
    ]);
  });

  it("a student building's pre-leasing and walk lead after the price (#468)", () => {
    const student = [
      { label: "Occupancy", value: "96%", flagged: false },
      { label: "Distance to campus", value: "0.3 miles", flagged: false },
      { label: "Pre-leased", value: "87% for Fall 2026", flagged: false },
      { label: "Asking price", value: "$61,200,000", flagged: false },
    ];
    expect(keyTermRows(student, "stabilized", 3).map((m) => m.label)).toEqual(["Asking price", "Pre-leased", "Distance to campus"]);
  });

  it("what the third-party reports found leads after the price (#465)", () => {
    const reported = [
      { label: "Occupancy", value: "94%", flagged: false },
      { label: "Seismic PML", value: "24%", flagged: false },
      { label: "PCA immediate repairs", value: "$630,000", flagged: false },
      { label: "Phase I ESA findings", value: "One REC", flagged: false },
      { label: "Asking price", value: "$42,000,000", flagged: false },
    ];
    expect(keyTermRows(reported, "stabilized", 4).map((m) => m.label)).toEqual([
      "Asking price",
      "Phase I ESA findings",
      "PCA immediate repairs",
      "Seismic PML",
    ]);
  });

  it("drops rows that are not objects, never repeats a row, and honours the limit", () => {
    const rows = keyTermRows([null, ...conversion, undefined, conversion[4]], "conversion", 3);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((m) => m.label)).size).toBe(3);
    expect(keyTermRows([], "conversion", 4)).toEqual([]);
  });
});
