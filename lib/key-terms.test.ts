// The eighth review's first finding: the memo's "Key terms" block sorted the
// flagged rows first and cut at four, so the sample memo opened on four
// speculative pro-forma figures and never stated the asking price, the
// going-in cap or the unit count. One reader now orders the block for the
// memo and the shared screen alike.
import { describe, expect, it } from "vitest";
import { keyTermRows } from "./key-terms";
import { SAMPLE_DEAL } from "./sample-deal";
import { inferStrategy } from "./deal-strategy";
import { screenYearOf } from "./criteria";

/** The year these rows were screened in, as the memo and the shared screen
 *  read it; no price label below carries a year of its own. */
const SCREEN_YEAR = screenYearOf(SAMPLE_DEAL.extraction);

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
    const rows = keyTermRows(SAMPLE_DEAL.extraction.metrics, inferStrategy(SAMPLE_DEAL.extraction).kind, SCREEN_YEAR, 8);
    expect(rows.slice(0, 3).map((m) => m.label)).toEqual(["Asking price", "Going-in cap", "Units"]);
    // The flagged pro-forma rows still come before the unflagged rest.
    expect(rows[3].flagged).toBe(true);
    // Cut at four — the memo's width when the screen block is present — the
    // price is still on the page.
    expect(keyTermRows(SAMPLE_DEAL.extraction.metrics, "stabilized", SCREEN_YEAR, 4).map((m) => m.value)).toContain("$68,000,000");
  });

  it("on a plan deal: the price, the stabilized NOI and the total cost the plan is judged on, then the planned units", () => {
    const rows = keyTermRows(conversion, "conversion", SCREEN_YEAR, 4);
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
    expect(keyTermRows(land, "development", SCREEN_YEAR, 8)[0].label).toBe("Land cost");
    const stabilized = [
      { label: "NOI (stabilized, pro forma)", value: "$4,000,000", flagged: true },
      { label: "Going-in cap rate", value: "5.4%", flagged: false },
      { label: "Asking price", value: "$60,000,000", flagged: false },
    ];
    expect(keyTermRows(stabilized, "stabilized", SCREEN_YEAR, 8).map((m) => m.label)).toEqual([
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
    // The collateral's size still says what secures the loan; its cap is
    // not printed at all, flagged or not — among the rows it would read as
    // a cap on the note's price (the audit of 2026-09-30).
    expect(keyTermRows(note, "stabilized", SCREEN_YEAR, 7, "note").map((m) => m.label)).toEqual([
      "Asking price",
      "Unpaid principal balance",
      "Note rate",
      "Maturity date",
      "Payment status",
      "Units",
      "Yield to maturity (at ask)",
    ]);
    expect(keyTermRows(note, "stabilized", SCREEN_YEAR, 20, "note").map((m) => m.label)).not.toContain("Going-in cap rate");
    // Nor any other cap on the collateral's income, flagged or not — only
    // the one going-in row had been dropped, and a memo printed "Cap rate
    // (pro forma) 6.1%" under a note (the audit of 2026-10-01). An interest
    // rate cap is a term of the loan and stays.
    const caps = [
      ...note,
      { label: "Cap rate (pro forma)", value: "6.1%", flagged: true },
      { label: "Stabilized cap rate", value: "6.5%", flagged: false },
      { label: "Exit cap", value: "6.0%", flagged: false },
      { label: "In-place cap", value: "5.2%", flagged: false },
      { label: "Capitalization rate (T-12)", value: "5.4%", flagged: false },
      { label: "Interest rate cap", value: "SOFR 4.00% strike, through 2027", flagged: false },
      { label: "Capital improvements", value: "$1,200,000", flagged: false },
    ];
    const shown = keyTermRows(caps, "stabilized", SCREEN_YEAR, 30, "note").map((m) => m.label);
    expect(shown.filter((l) => /cap\b|capitalization/i.test(l) && !/interest rate cap/i.test(l))).toEqual([]);
    expect(shown).toContain("Interest rate cap");
    expect(shown).toContain("Capital improvements");
    // Read as a building, every one of them prints.
    expect(keyTermRows(caps, "stabilized", SCREEN_YEAR, 30).map((m) => m.label)).toEqual(expect.arrayContaining(["Cap rate (pro forma)", "Exit cap", "In-place cap"]));
    // The same rows read as a building lead with its cap and count.
    expect(keyTermRows(note, "stabilized", SCREEN_YEAR, 3).map((m) => m.label)).toEqual(["Asking price", "Going-in cap rate", "Units"]);
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
    expect(keyTermRows(nnn, "stabilized", SCREEN_YEAR, 5).map((m) => m.label)).toEqual([
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
    expect(keyTermRows(hotel, "stabilized", SCREEN_YEAR, 6).map((m) => m.label)).toEqual([
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
    expect(keyTermRows(auction, "stabilized", SCREEN_YEAR, 4).map((m) => m.label)).toEqual(["Starting bid", "Buyer's premium", "Reserve price", "Bid deadline"]);
  });

  it("a multi-tenant property's quoted WALT leads after the price (#457)", () => {
    const center = [
      { label: "Total SF", value: "112,000 SF", flagged: false },
      { label: "Occupancy", value: "94%", flagged: false },
      { label: "WALT", value: "6.8 years", flagged: false },
      { label: "Asking price", value: "$21,500,000", flagged: false },
    ];
    expect(keyTermRows(center, "stabilized", SCREEN_YEAR, 2).map((m) => m.label)).toEqual(["Asking price", "WALT"]);
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
    expect(keyTermRows(program, "stabilized", SCREEN_YEAR, 5).map((m) => m.label)).toEqual([
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
    expect(keyTermRows(abated, "stabilized", SCREEN_YEAR, 4).map((m) => m.label)).toEqual([
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
    expect(keyTermRows(note, "stabilized", SCREEN_YEAR, 4).map((m) => m.label)).toEqual([
      "Asking price",
      "Seller financing amount",
      "Seller financing rate",
      "Seller financing term",
    ]);
  });

  it("the rent rules lead after the count they are a share of, each row only where stated (lib/rent-regulation)", () => {
    const walkUp = [
      { label: "Occupancy", value: "97%", flagged: true },
      { label: "Preferential rent", value: "$1,480", flagged: false },
      { label: "Rent-regulated units", value: "41", flagged: false },
      { label: "Units", value: "48", flagged: false },
      { label: "Going-in cap rate", value: "5.10%", flagged: false },
      { label: "Rent regulation", value: "Rent stabilization", flagged: false },
      { label: "Asking price", value: "$14,000,000", flagged: false },
    ];
    expect(keyTermRows(walkUp, "stabilized", SCREEN_YEAR, 6).map((m) => m.label)).toEqual([
      "Asking price",
      "Going-in cap rate",
      "Units",
      "Rent regulation",
      "Rent-regulated units",
      "Preferential rent",
    ]);
    // No legal rent is stated, so none leads; a market-rate building's terms
    // read as before.
    expect(keyTermRows(walkUp.filter((m) => !/^Rent|Preferential/.test(m.label)), "stabilized", SCREEN_YEAR, 4).map((m) => m.label)).toEqual([
      "Asking price",
      "Going-in cap rate",
      "Units",
      "Occupancy",
    ]);
  });

  it("a forward purchase's delivery, outside date, deposit and cap at delivery lead right after the price (lib/forward-purchase)", () => {
    const forward = [
      { label: "NOI (stabilized, pro forma)", value: "$3,960,000", flagged: true },
      { label: "Deposit", value: "10% at signing", flagged: false },
      { label: "Homes (proposed)", value: "180", flagged: false },
      { label: "Outside date", value: "December 31, 2028", flagged: false },
      { label: "Delivery date", value: "June 2028", flagged: false },
      { label: "Purchase price", value: "$72,000,000", flagged: false },
    ];
    expect(keyTermRows(forward, "development", SCREEN_YEAR, 5).map((m) => m.label)).toEqual([
      "Purchase price",
      "Delivery date",
      "Outside date",
      "Deposit",
      "NOI (stabilized, pro forma)",
    ]);
    // A standing building's earnest-money deposit is no forward purchase's.
    const stabilized = [
      { label: "Deposit", value: "$500,000 earnest money", flagged: false },
      { label: "Going-in cap rate", value: "5.50%", flagged: false },
      { label: "Asking price", value: "$42,000,000", flagged: false },
    ];
    expect(keyTermRows(stabilized, "stabilized", SCREEN_YEAR, 2).map((m) => m.label)).toEqual(["Asking price", "Going-in cap rate"]);
  });

  it("a mixed-use building's two incomes and its commercial space lead after the count, and a center's retail area never leads as one (lib/mixed-use)", () => {
    const mixed = [
      { label: "Occupancy", value: "95%", flagged: true },
      { label: "Commercial occupancy", value: "80%", flagged: false },
      { label: "Retail SF", value: "9,500 SF", flagged: false },
      { label: "Commercial income", value: "$610,000", flagged: false },
      { label: "Residential income", value: "$1,520,000", flagged: false },
      { label: "Units", value: "48", flagged: false },
      { label: "Going-in cap rate", value: "5.60%", flagged: false },
      { label: "Asking price", value: "$25,000,000", flagged: false },
    ];
    expect(keyTermRows(mixed, "stabilized", SCREEN_YEAR, 7).map((m) => m.label)).toEqual([
      "Asking price",
      "Going-in cap rate",
      "Units",
      "Residential income",
      "Commercial income",
      "Retail SF",
      "Commercial occupancy",
    ]);
    // No income half stated: the center's own retail area is not led.
    const center = [
      { label: "Occupancy", value: "92%", flagged: true },
      { label: "Retail SF", value: "120,000 SF", flagged: false },
      { label: "Going-in cap rate", value: "6.75%", flagged: false },
      { label: "Asking price", value: "$30,000,000", flagged: false },
    ];
    expect(keyTermRows(center, "stabilized", SCREEN_YEAR, 3).map((m) => m.label)).toEqual(["Asking price", "Going-in cap rate", "Occupancy"]);
  });

  it("an operating business's earnings, coverage and contracts lead after the count, and a shared row alone never leads as one (lib/going-concern)", () => {
    const station = [
      { label: "Occupancy", value: "100%", flagged: true },
      { label: "Tank system", value: "Three double-walled fiberglass USTs", flagged: false },
      { label: "Fuel supply agreement", value: "Shell through 2029", flagged: false },
      { label: "EBITDA (T-12)", value: "$410,000", flagged: false },
      { label: "Going-in cap rate", value: "8.00%", flagged: false },
      { label: "Asking price", value: "$3,200,000", flagged: false },
    ];
    expect(keyTermRows(station, "stabilized", SCREEN_YEAR, 5).map((m) => m.label)).toEqual([
      "Asking price",
      "Going-in cap rate",
      "EBITDA (T-12)",
      "Fuel supply agreement",
      "Tank system",
    ]);
    // An apartment building's management fee is no operating business's.
    const apartments = [
      { label: "Occupancy", value: "95%", flagged: true },
      { label: "Management fee", value: "3% of EGI", flagged: false },
      { label: "Going-in cap rate", value: "5.50%", flagged: false },
      { label: "Asking price", value: "$42,000,000", flagged: false },
    ];
    expect(keyTermRows(apartments, "stabilized", SCREEN_YEAR, 3).map((m) => m.label)).toEqual(["Asking price", "Going-in cap rate", "Occupancy"]);
    // A care operation's beds lead it.
    const snf = [
      { label: "Licensed beds", value: "120", flagged: false },
      { label: "Management fee", value: "5% of revenue", flagged: false },
      { label: "Asking price", value: "$18,000,000", flagged: false },
    ];
    expect(keyTermRows(snf, "stabilized", SCREEN_YEAR, 3).map((m) => m.label)).toEqual(["Asking price", "Licensed beds", "Management fee"]);
  });

  it("a student building's pre-leasing and walk lead after the price (#468)", () => {
    const student = [
      { label: "Occupancy", value: "96%", flagged: false },
      { label: "Distance to campus", value: "0.3 miles", flagged: false },
      { label: "Pre-leased", value: "87% for Fall 2026", flagged: false },
      { label: "Asking price", value: "$61,200,000", flagged: false },
    ];
    expect(keyTermRows(student, "stabilized", SCREEN_YEAR, 3).map((m) => m.label)).toEqual(["Asking price", "Pre-leased", "Distance to campus"]);
  });

  it("a park's lot rent, the market's and its water and sewer lead after the price (#470)", () => {
    const park = [
      { label: "Occupancy", value: "88%", flagged: false },
      { label: "Water and sewer", value: "Private well and septic", flagged: false },
      { label: "Market lot rent", value: "$525", flagged: false },
      { label: "Lot rent", value: "$430", flagged: false },
      { label: "Asking price", value: "$9,300,000", flagged: false },
    ];
    expect(keyTermRows(park, "stabilized", SCREEN_YEAR, 4).map((m) => m.label)).toEqual(["Asking price", "Lot rent", "Market lot rent", "Water and sewer"]);
  });

  it("a storage facility's economic occupancy and rates lead after the price (#471)", () => {
    const storage = [
      { label: "Occupancy", value: "91%", flagged: false },
      { label: "In-place rent", value: "$1.38/SF/month", flagged: false },
      { label: "Street rate", value: "$1.14/SF/month", flagged: false },
      { label: "Economic occupancy", value: "84%", flagged: false },
      { label: "Asking price", value: "$9,800,000", flagged: false },
    ];
    expect(keyTermRows(storage, "stabilized", SCREEN_YEAR, 4).map((m) => m.label)).toEqual(["Asking price", "Economic occupancy", "Street rate", "In-place rent"]);
  });

  it("what the third-party reports found leads after the price (#465)", () => {
    const reported = [
      { label: "Occupancy", value: "94%", flagged: false },
      { label: "Seismic PML", value: "24%", flagged: false },
      { label: "PCA immediate repairs", value: "$630,000", flagged: false },
      { label: "Phase I ESA findings", value: "One REC", flagged: false },
      { label: "Asking price", value: "$42,000,000", flagged: false },
    ];
    expect(keyTermRows(reported, "stabilized", SCREEN_YEAR, 4).map((m) => m.label)).toEqual([
      "Asking price",
      "Phase I ESA findings",
      "PCA immediate repairs",
      "Seismic PML",
    ]);
  });

  it("drops rows that are not objects, never repeats a row, and honours the limit", () => {
    const rows = keyTermRows([null, ...conversion, undefined, conversion[4]], "conversion", SCREEN_YEAR, 3);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((m) => m.label)).size).toBe(3);
    expect(keyTermRows([], "conversion", SCREEN_YEAR, 4)).toEqual([]);
  });
});
