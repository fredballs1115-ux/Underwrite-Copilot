import { describe, expect, it } from "vitest";
import type { ExtractionResult, PortfolioProperty } from "@/lib/anthropic/types";
import {
  MAX_OTHER_MARKETS,
  marketsPhrase,
  otherPortfolioMarkets,
  portfolioContextLine,
  portfolioFacts,
  portfolioFor,
  portfolioMoney,
  portfolioNote,
  propertyFigures,
  readPortfolio,
  shareBasisWord,
} from "./portfolio";

const prop = (over: Partial<PortfolioProperty>): PortfolioProperty => ({
  name: "",
  address: "",
  count: "",
  area: "",
  noi: "",
  occupancy: "",
  yearBuilt: "",
  allocatedPrice: "",
  page: "",
  ...over,
});

/** A five-property apartment portfolio across Pittsburgh, Cleveland and
 *  rural Ohio, as an OM's portfolio summary table would state it. */
const FIVE: PortfolioProperty[] = [
  prop({ name: "Liberty Lofts", address: "1200 Liberty Ave, Pittsburgh, PA 15222", count: "128", noi: "$1,420,000", occupancy: "95%", yearBuilt: "2016", allocatedPrice: "$28,000,000", page: "p. 14" }),
  prop({ name: "Strip District Flats", address: "2600 Smallman St, Pittsburgh, PA 15222", count: "96", noi: "$1,010,000", occupancy: "93%", yearBuilt: "2012", allocatedPrice: "$20,500,000", page: "p. 18" }),
  prop({ name: "Ohio City Commons", address: "1850 W 25th St, Cleveland, OH 44113", count: "210", noi: "$2,050,000", occupancy: "94%", yearBuilt: "1998", allocatedPrice: "$38,000,000", page: "p. 22" }),
  prop({ name: "Lakewood Terrace", address: "14701 Detroit Ave, Lakewood, OH 44107", count: "84", noi: "$690,000", occupancy: "91%", yearBuilt: "1972", allocatedPrice: "$11,500,000", page: "p. 26" }),
  prop({ name: "Marion Gardens", address: "400 Barks Rd, Marion, OH 43302", count: "60", noi: "$310,000", occupancy: "82%", yearBuilt: "1979", allocatedPrice: "$4,000,000", page: "p. 30" }),
];

const ex = (properties: PortfolioProperty[], price = "$102,000,000"): ExtractionResult => ({
  dealName: "Rust Belt Residential Portfolio",
  assetClass: "multifamily",
  properties,
  metrics: [
    { label: "Asking price", value: price, flagged: false, page: "p. 3" },
    { label: "Units", value: "578", flagged: false, page: "p. 3" },
  ],
  totalPages: 64,
});

describe("readPortfolio — a portfolio OM's properties, read into shares, concentration, markets and the allocation", () => {
  it("is null for a single-property OM and for an extraction saved before portfolios were read", () => {
    expect(readPortfolio(ex([]))).toBeNull();
    expect(readPortfolio(ex([FIVE[0]]))).toBeNull();
    expect(readPortfolio({ dealName: null, assetClass: "multifamily", metrics: [] })).toBeNull();
    expect(readPortfolio(null)).toBeNull();
  });

  it("reads each property's figures, the markets from its own address, and the shares by count and by NOI", () => {
    const p = readPortfolio(ex(FIVE))!;
    expect(p.assets).toHaveLength(5);
    expect(p.assets[0]).toMatchObject({ name: "Liberty Lofts", place: "Pittsburgh, PA", count: 128, noi: 1_420_000, occupancy: 95, yearBuilt: 2016, allocated: 28_000_000, page: "p. 14" });
    expect(p.assets[0].market).toEqual({ id: "pittsburgh", name: "Pittsburgh PA" });
    expect(p.assets[3].market).toEqual({ id: "cleveland", name: "Cleveland OH" });
    // Marion, Ohio is in no metro the site reads: the state's figures.
    expect(p.assets[4].market?.id).toBe("state:OH");
    expect(p.markets).toEqual([
      { id: "pittsburgh", name: "Pittsburgh PA", properties: 2 },
      { id: "cleveland", name: "Cleveland OH", properties: 2 },
      { id: "state:OH", name: "Ohio", properties: 1 },
    ]);
    expect(p.shareBasis).toBe("count");
    expect(p.shares!.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 6);
    expect(p.shares![2]).toBeCloseTo((210 / 578) * 100, 6);
    // Every property states an NOI, so the income's shares exist and the
    // largest is read by income.
    expect(p.noiStated).toBe(5);
    expect(p.largest).toMatchObject({ index: 2, name: "Ohio City Commons", of: "noi" });
    expect(p.largest!.sharePct).toBeCloseTo((2_050_000 / 5_480_000) * 100, 6);
    expect(p.weakestOccupancy).toEqual({ index: 4, name: "Marion Gardens", pct: 82 });
    // The allocation's own cap on each property, said as the allocation's.
    expect(p.assets[4].allocationCapPct).toBeCloseTo(7.75, 6);
    expect(p.assets[0].allocatedPerCount).toBeCloseTo(218_750, 6);
  });

  it("checks the allocation against the ask: within a percent is rounding, beyond it the OM does not add up", () => {
    const fits = readPortfolio(ex(FIVE))!;
    expect(fits.allocationTotal).toBe(102_000_000);
    expect(fits.askingPrice).toBe(102_000_000);
    expect(fits.allocationGapPct).toBe(0);
    expect(portfolioNote(fits)).not.toContain("does not add up");
    const off = readPortfolio(ex(FIVE, "$95,000,000"))!;
    expect(off.allocationGapPct).toBeCloseTo(((102 - 95) / 95) * 100, 6);
    expect(portfolioNote(off)).toContain("The allocated prices sum to $102M against the $95.0M ask (+7.4%) — the OM does not add up");
  });

  it("draws no income share from a partial set, and no share at all from a mix of counts and areas", () => {
    const partial = FIVE.map((x, i) => (i === 1 ? { ...x, noi: "" } : x));
    const p = readPortfolio(ex(partial))!;
    expect(p.noiShares).toBeNull();
    expect(p.noiStated).toBe(4);
    // The largest falls back to the count, and says so.
    expect(p.largest).toMatchObject({ name: "Ohio City Commons", of: "count" });
    expect(portfolioNote(p)).toContain("Only 4 of the 5 properties state an NOI of their own");
    const mixed = FIVE.map((x, i) => (i === 0 ? { ...x, count: "", area: "104,000 SF" } : x));
    const m = readPortfolio(ex(mixed))!;
    expect(m.shareBasis).toBeNull();
    expect(m.shares).toBeNull();
    // Areas for every property give area shares.
    const offices = FIVE.map((x, i) => ({ ...x, count: "", area: `${(i + 1) * 50_000} SF` }));
    const a = readPortfolio(ex(offices))!;
    expect(a.shareBasis).toBe("area");
    expect(a.shares![4]).toBeCloseTo((250 / 750) * 100, 6);
  });

  it("never reads a figure the OM did not state: a blank is null, and an allocation missing for one property totals nothing", () => {
    const blanks = FIVE.map((x, i) => (i === 3 ? { ...x, allocatedPrice: "", occupancy: "", yearBuilt: "" } : x));
    const p = readPortfolio(ex(blanks))!;
    expect(p.assets[3]).toMatchObject({ allocated: null, occupancy: null, yearBuilt: null, allocationCapPct: null, allocatedPerCount: null });
    expect(p.allocationTotal).toBeNull();
    expect(p.allocationGapPct).toBeNull();
  });
});

describe("what the portfolio says to the rest of the screen", () => {
  it("the deal context names the properties, the markets and the largest, and says a whole-portfolio figure is the portfolio's", () => {
    const p = readPortfolio(ex(FIVE))!;
    expect(marketsPhrase(p)).toBe("3 markets — Pittsburgh PA (2), Cleveland OH (2) and Ohio (1)");
    expect(portfolioContextLine(p)).toBe(
      "Portfolio: 5 properties across 3 markets — Pittsburgh PA (2), Cleveland OH (2) and Ohio (1); the largest by NOI is Ohio City Commons at 37% of the whole. A figure stated for the whole is the portfolio's, not any one property's; hold a comp or a per-unit norm against the property it describes.",
    );
  });

  it("the challenger's note states what the extraction established, then the portfolio traps by name", () => {
    const note = portfolioNote(readPortfolio(ex(FIVE))!);
    expect(note.startsWith("This OM offers a portfolio of 5 properties across 3 markets")).toBe(true);
    expect(note).toContain("The weakest stated occupancy is Marion Gardens at 82%.");
    for (const trap of ["THE ALLOCATION IS THE SELLER'S", "CONCENTRATION", "THE BUNDLED WEAK ASSET", "ONE LOAN OR MANY", "MARKETS DIFFER"]) {
      expect(note, trap).toContain(trap);
    }
    // 37% is under the concentration line, so no concentration sentence.
    expect(note).not.toContain("carries 37%");
    const heavy = FIVE.map((x, i) => (i === 2 ? { ...x, noi: "$6,000,000" } : x));
    expect(portfolioNote(readPortfolio(ex(heavy))!)).toContain("Ohio City Commons carries 64% of the portfolio's stated NOI.");
  });
});

describe("portfolioFor — what the market check's header needs", () => {
  it("names the markets and how many properties sit in the one read, and is null for a portfolio in one market", () => {
    expect(portfolioFor(ex(FIVE), "cleveland")).toEqual({
      properties: 5,
      here: 2,
      markets: "3 markets — Pittsburgh PA (2), Cleveland OH (2) and Ohio (1)",
    });
    expect(portfolioFor(ex(FIVE), "state:PA")?.here).toBe(0);
    const oneCity = FIVE.slice(0, 2);
    expect(portfolioFor(ex(oneCity), "pittsburgh")).toBeNull();
    expect(portfolioFor(ex([]), "pittsburgh")).toBeNull();
  });
});

describe("a property's page is cited only where it falls inside the memorandum", () => {
  it("keeps a page inside the count, and cites none past it or with the count unknown", () => {
    const p = readPortfolio(ex(FIVE))!;
    expect(p.assets.map((a) => a.page)).toEqual(["p. 14", "p. 18", "p. 22", "p. 26", "p. 30"]);
    const short = readPortfolio({ ...ex(FIVE), totalPages: 24 })!;
    expect(short.assets.map((a) => a.page)).toEqual(["p. 14", "p. 18", "p. 22", "", ""]);
    const unknown = readPortfolio({ ...ex(FIVE), totalPages: undefined })!;
    expect(unknown.assets.every((a) => a.page === "")).toBe(true);
    const garbled = readPortfolio(ex(FIVE.map((x, i) => (i === 0 ? { ...x, page: "see appendix" } : x))))!;
    expect(garbled.assets[0].page).toBe("");
  });
});

describe("the sentences every surface prints — the card, the report and the shared screen", () => {
  const noun = { one: "unit", many: "units" };

  it("portfolioFacts: the allocation that adds up says so, and one that does not says by how much", () => {
    expect(portfolioFacts(readPortfolio(ex(FIVE))!)).toEqual([
      "The allocated prices sum to the $102M ask. An allocation is the seller's split, not a value.",
    ]);
    const heavy = FIVE.map((x, i) => (i === 2 ? { ...x, noi: "$6,000,000" } : x));
    expect(portfolioFacts(readPortfolio(ex(heavy, "$95,000,000"))!)).toEqual([
      "Ohio City Commons carries 64% of the stated NOI — the portfolio's income rides on one property.",
      "The allocated prices sum to $102M against the $95.0M ask (+7.4%) — the memorandum does not add up.",
    ]);
  });

  it("portfolioFacts: a partial income set, no income at all, and an address with no state", () => {
    const partial = FIVE.map((x, i) => (i === 1 ? { ...x, noi: "", allocatedPrice: "" } : x));
    expect(portfolioFacts(readPortfolio(ex(partial))!)).toEqual([
      "4 of the 5 properties state an NOI of their own, so the income's split is not drawn.",
    ]);
    const none = FIVE.map((x) => ({ ...x, noi: "", allocatedPrice: "" }));
    expect(portfolioFacts(readPortfolio(ex(none))!)).toEqual([
      "No property states an NOI of its own — the memorandum prices the portfolio on its total alone.",
    ]);
    const lost = FIVE.map((x, i) => (i === 4 ? { ...x, address: "400 Barks Rd" } : x));
    expect(portfolioFacts(readPortfolio(ex(lost))!)).toContain("One property's address names no state, so no market is read for it.");
  });

  it("propertyFigures: the shares first, then only what the memorandum states, in the class's noun", () => {
    const p = readPortfolio(ex(FIVE))!;
    expect(shareBasisWord(p, noun)).toBe("units");
    expect(propertyFigures(p, 4, noun)).toEqual([
      "10% of the units",
      "6% of the NOI",
      "60 units",
      "82% occupied",
      "built 1979",
      "NOI $310k",
      "allocated $4.0M ($67k per unit), a 7.8% cap on the allocation",
    ]);
    // A hotel's keys, and a blank left out rather than printed as nothing.
    const keys = { one: "key", many: "keys" };
    const bare = readPortfolio(ex(FIVE.map((x, i) => (i === 0 ? { ...x, occupancy: "", yearBuilt: "", allocatedPrice: "" } : x))))!;
    expect(propertyFigures(bare, 0, keys)).toEqual(["22% of the keys", "26% of the NOI", "128 keys", "NOI $1.4M"]);
    expect(propertyFigures(bare, 9, keys)).toEqual([]);
    // Areas for every property: the shares are of the SF.
    const offices = readPortfolio(ex(FIVE.map((x, i) => ({ ...x, count: "", area: `${(i + 1) * 50_000} SF` }))))!;
    expect(shareBasisWord(offices, noun)).toBe("SF");
    expect(propertyFigures(offices, 0, noun)[0]).toBe("7% of the SF");
  });

  it("portfolioMoney rounds on the tenths, never on a float's toFixed", () => {
    expect(portfolioMoney(2_050_000)).toBe("$2.1M");
    expect(portfolioMoney(102_000_000)).toBe("$102M");
    expect(portfolioMoney(218_750)).toBe("$219k");
    expect(portfolioMoney(950)).toBe("$950");
  });
});

describe("otherPortfolioMarkets — the markets the check reads beyond the address's (#413)", () => {
  it("lists the others, most properties first, and none for a portfolio in one market", () => {
    expect(otherPortfolioMarkets(ex(FIVE), "pittsburgh")).toEqual({
      read: [
        { id: "cleveland", name: "Cleveland OH", properties: 2 },
        { id: "state:OH", name: "Ohio", properties: 1 },
      ],
      notRead: 0,
    });
    // The address sits in none of the portfolio's markets: all of them.
    expect(otherPortfolioMarkets(ex(FIVE), "dc")?.read.map((m) => m.id)).toEqual(["pittsburgh", "cleveland", "state:OH"]);
    expect(otherPortfolioMarkets(ex(FIVE), null)?.read).toHaveLength(3);
    expect(otherPortfolioMarkets(ex(FIVE.slice(0, 2)), "pittsburgh")).toBeNull();
    expect(otherPortfolioMarkets(ex([]), "pittsburgh")).toBeNull();
  });

  it("stops at the cap and counts the markets past it", () => {
    expect(MAX_OTHER_MARKETS).toBe(3);
    const spread = [
      prop({ name: "A", address: "1 Main St, Pittsburgh, PA 15222", count: "10" }),
      prop({ name: "B", address: "1 Main St, Cleveland, OH 44113", count: "10" }),
      prop({ name: "C", address: "1 Main St, Phoenix, AZ 85004", count: "10" }),
      prop({ name: "D", address: "1 Main St, Denver, CO 80202", count: "10" }),
      prop({ name: "E", address: "1 Main St, Boise, ID 83702", count: "10" }),
    ];
    const o = otherPortfolioMarkets(ex(spread), "pittsburgh")!;
    expect(o.read.map((m) => m.id)).toEqual(["cleveland", "phoenix", "denver"]);
    expect(o.notRead).toBe(1);
    expect(otherPortfolioMarkets(ex(spread), "pittsburgh", 1)!.notRead).toBe(3);
  });
});
