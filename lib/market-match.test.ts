import { describe, expect, it } from "vitest";
import {
  coveredMarketGeoTargets,
  coveredState,
  metroForAddress,
} from "@/lib/market-match";

describe("metroForAddress", () => {
  it("maps the buyer's home turf", () => {
    expect(metroForAddress({ city: "Washington", state: "DC" })?.id).toBe("dc");
    expect(metroForAddress({ city: "Hyattsville", county: "Prince George's County", state: "MD" })?.id).toBe("pg_county");
    expect(metroForAddress({ city: "Arlington", state: "VA" })?.id).toBe("nova");
    expect(metroForAddress({ city: "Philadelphia", state: "PA" })?.id).toBe("philadelphia");
  });
  it("maps the majors — boroughs included", () => {
    expect(metroForAddress({ city: "Brooklyn", state: "NY" })?.id).toBe("nyc");
    expect(metroForAddress({ city: "Jersey City", state: "NJ" })?.id).toBe("newark_jc");
    expect(metroForAddress({ city: "Chicago", county: "Cook County", state: "IL" })?.id).toBe("chicago");
    expect(metroForAddress({ city: "Fort Worth", state: "TX" })?.id).toBe("dallas");
  });
  it("state guards keep lookalike cities apart (Arlington VA vs Arlington TX)", () => {
    expect(metroForAddress({ city: "Arlington", state: "TX" })?.id).toBe("dallas");
    expect(metroForAddress({ city: "Arlington", state: "VA" })?.id).toBe("nova");
  });
  it("Wilmington DE folds into the Philadelphia market", () => {
    expect(metroForAddress({ city: "Wilmington", state: "DE" })?.id).toBe("philadelphia");
  });
  it("outside the covered set: null, and coveredState says why honestly", () => {
    expect(metroForAddress({ city: "Boise", state: "ID" })).toBeNull();
    expect(coveredState("ID")).toBe(false);
    // covered STATE but un-matched city: null metro, state still covered
    expect(metroForAddress({ city: "Pittsburgh", state: "PA" })).toBeNull();
    expect(coveredState("PA")).toBe(true);
  });
});

describe("coveredMarketGeoTargets", () => {
  it("every covered market becomes a one-tap territory carrying its match needles", () => {
    const targets = coveredMarketGeoTargets();
    expect(targets.every((t) => !!t.label && (t.aliases?.length ?? 0) > 0)).toBe(true);
    const dfw = targets.find((t) => t.label === "Dallas-Fort Worth");
    expect(dfw?.state).toBe("TX");
    expect(dfw?.aliases).toContain("fort worth");
    // Wilmington folds into the Philadelphia market — its needle rides along.
    const philly = targets.find((t) => t.label === "Philadelphia PA");
    expect(philly?.aliases).toContain("wilmington");
  });
});

// ── The state a deal falls in, as a market of its own grain ─────────────────
import { isStateMarket, stateForAddress, stateOfMarket } from "./market-match";

describe("stateForAddress — the fallback grain for a deal outside the covered metros", () => {
  it("files a state by its code with the address table's own name, however the state was written", () => {
    expect(stateForAddress({ state: "PA" })).toEqual({ id: "state:PA", name: "Pennsylvania" });
    expect(stateForAddress({ state: "pennsylvania" })).toEqual({ id: "state:PA", name: "Pennsylvania" });
    expect(stateForAddress({ state: " tx " })).toEqual({ id: "state:TX", name: "Texas" });
    expect(stateForAddress({ state: "District of Columbia" })).toEqual({ id: "state:DC", name: "District of Columbia" });
    expect(stateForAddress({ state: "NC" })?.name).toBe("North Carolina");
  });

  it("answers null for no state or one the table does not know, never a guess", () => {
    expect(stateForAddress({})).toBeNull();
    expect(stateForAddress({ state: null })).toBeNull();
    expect(stateForAddress({ state: "" })).toBeNull();
    expect(stateForAddress({ state: "Ontario" })).toBeNull();
    expect(stateForAddress({ state: "PR" })).toBeNull();
  });

  it("tells a state market from a covered metro by its id", () => {
    expect(isStateMarket("state:PA")).toBe(true);
    expect(isStateMarket("philadelphia")).toBe(false);
    expect(isStateMarket(null)).toBe(false);
    expect(stateOfMarket("state:PA")).toBe("PA");
    expect(stateOfMarket("dc")).toBeNull();
  });
});

// ── The market the live figures are read for ────────────────────────────────
import { marketForAddress } from "./market-match";

describe("marketForAddress — the briefed market where there is one, the metro read without a brief where there is one of those, the state otherwise: one function for every live read", () => {
  it("answers the briefed market first, then the data metro, then the state, and nothing with no state", () => {
    expect(marketForAddress({ city: "Philadelphia", state: "PA" })).toEqual({ id: "philadelphia", name: expect.any(String) });
    expect(marketForAddress({ city: "Pittsburgh", state: "PA" })).toEqual({ id: "pittsburgh", name: "Pittsburgh PA" });
    expect(marketForAddress({ city: "Phoenix", state: "Arizona" })).toEqual({ id: "phoenix", name: "Phoenix AZ" });
    expect(marketForAddress({ city: "Harrisburg", state: "PA" })).toEqual({ id: "state:PA", name: "Pennsylvania" });
    expect(marketForAddress({ city: "Toronto" })).toBeNull();
  });
});

// ── The metro areas read without a brief ────────────────────────────────────
import { DATA_METROS, dataMetroForAddress, isDataMetro } from "./market-match";

describe("dataMetroForAddress — the metro areas the site reads but does not brief", () => {
  it("holds the list's shape: an id no briefed market uses, a name, states, lowercase keywords, a region, a CBSA and the pulls' keys", () => {
    expect(DATA_METROS.length).toBe(26);
    const briefed = new Set(coveredMarketGeoTargets().map((t) => t.label));
    for (const m of DATA_METROS) {
      expect(m.id, m.id).toMatch(/^[a-z_]+$/);
      expect(briefed.has(m.name), m.id).toBe(false);
      expect(m.states.length, m.id).toBeGreaterThan(0);
      expect(m.keywords.every((k) => k === k.toLowerCase()), m.id).toBe(true);
      expect(["northeast", "midwest", "south", "west"], m.id).toContain(m.region);
      expect(m.cbsa, m.id).toMatch(/^\d{5}$/);
      expect(m.zillow, m.id).toMatch(/, [A-Z]{2}$/);
      expect(m.census.length, m.id).toBeGreaterThan(3);
    }
    expect(new Set(DATA_METROS.map((m) => m.id)).size).toBe(DATA_METROS.length);
    expect(new Set(DATA_METROS.map((m) => m.cbsa)).size).toBe(DATA_METROS.length);
  });

  it("matches by city, county or submarket inside the metro's own state, and never across a state line", () => {
    expect(dataMetroForAddress({ city: "Pittsburgh", state: "PA" })?.id).toBe("pittsburgh");
    expect(dataMetroForAddress({ city: "Scottsdale", state: "AZ" })?.id).toBe("phoenix");
    expect(dataMetroForAddress({ city: "Aurora", county: "Arapahoe County", state: "CO" })?.id).toBe("denver");
    expect(dataMetroForAddress({ city: "Sugar Land", state: "Texas" })?.id).toBe("houston");
    expect(dataMetroForAddress({ city: "Round Rock", state: "TX" })?.id).toBe("austin");
    expect(dataMetroForAddress({ city: "Overland Park", state: "KS" })?.id).toBe("kansas_city");
    expect(dataMetroForAddress({ city: "Belleville", state: "IL" })?.id).toBe("st_louis");
    expect(dataMetroForAddress({ city: "Covington", state: "KY" })?.id).toBe("cincinnati");
    expect(dataMetroForAddress({ city: "Vancouver", state: "WA" })?.id).toBe("portland");
    expect(dataMetroForAddress({ city: "Ontario", state: "CA" })?.id).toBe("riverside");
    expect(dataMetroForAddress({ submarket: "Inland Empire", state: "CA" })?.id).toBe("riverside");
    // Aurora IL is Chicago's suburb, not Denver's; Lakewood OH is Cleveland's, not Denver's.
    expect(dataMetroForAddress({ city: "Aurora", state: "IL" })).toBeNull();
    expect(dataMetroForAddress({ city: "Lakewood", state: "OH" })?.id).toBe("cleveland");
    expect(dataMetroForAddress({ city: "Lakewood", state: "CO" })?.id).toBe("denver");
    // Vancouver BC is no one's; Harrisburg is Pennsylvania's own.
    expect(dataMetroForAddress({ city: "Vancouver", state: "BC" })).toBeNull();
    expect(dataMetroForAddress({ city: "Harrisburg", state: "PA" })).toBeNull();
    expect(dataMetroForAddress({ state: "PA" })).toBeNull();
    expect(dataMetroForAddress({})).toBeNull();
  });

  it("never claims a briefed market: Philadelphia stays the research matcher's, and a briefed market's id is not a data metro", () => {
    expect(dataMetroForAddress({ city: "Philadelphia", state: "PA" })).toBeNull();
    expect(isDataMetro("pittsburgh")).toBe(true);
    expect(isDataMetro("philadelphia")).toBe(false);
    expect(isDataMetro("state:PA")).toBe(false);
    expect(isDataMetro(null)).toBe(false);
  });
});

// ── A place typed as a name: a submarket's metro ────────────────────────────
import { metroForName } from "./market-match";

describe("metroForName — the market a typed metro names, only where the text says which", () => {
  it("reads the site's own name for a market, whole, however it is cased or punctuated", () => {
    expect(metroForName("Northern Virginia")?.id).toBe("nova");
    expect(metroForName("Boston")?.id).toBe("boston");
    expect(metroForName("dallas-fort worth")?.id).toBe("dallas");
    expect(metroForName("Dallas Fort Worth")?.id).toBe("dallas");
    expect(metroForName("Prince George's County MD")?.id).toBe("pg_county");
    expect(metroForName("Minneapolis-St. Paul")?.id).toBe("minneapolis");
    expect(metroForName("Richmond VA")?.id).toBe("richmond");
    expect(metroForName("Pittsburgh PA")?.id).toBe("pittsburgh");
    expect(metroForName("Kansas City")?.id).toBe("kansas_city");
    expect(metroForName("St. Louis")?.id).toBe("st_louis");
  });

  it("reads a city with its state through the address matchers, the briefed markets first", () => {
    expect(metroForName("Richmond, VA")?.id).toBe("richmond");
    expect(metroForName("Arlington, VA")?.id).toBe("nova");
    expect(metroForName("Arlington, TX")?.id).toBe("dallas");
    expect(metroForName("Brooklyn NY")?.id).toBe("nyc");
    expect(metroForName("Tampa, Florida")?.id).toBe("tampa");
    expect(metroForName("Scottsdale, AZ")?.id).toBe("phoenix");
    expect(metroForName("Vancouver, WA")?.id).toBe("portland");
    expect(metroForName("Washington, D.C.")?.id).toBe("dc");
    // The District is its city.
    expect(metroForName("DC")?.id).toBe("dc");
  });

  it("drops what a person appends to a metro's name", () => {
    expect(metroForName("DC Metro")?.id).toBe("dc");
    expect(metroForName("Richmond, VA MSA")?.id).toBe("richmond");
    expect(metroForName("the Boston market")?.id).toBe("boston");
    expect(metroForName("Phoenix AZ metro area")?.id).toBe("phoenix");
  });

  it("reads nothing a bare city, a state or another place would have to be guessed from", () => {
    // Each of these is more than one place without its state.
    expect(metroForName("Portland")).toBeNull();
    expect(metroForName("Columbus")).toBeNull();
    expect(metroForName("Richmond")).toBeNull();
    // The state guard: Portland, Maine and Richmond, California are no market here.
    expect(metroForName("Portland, ME")).toBeNull();
    expect(metroForName("Richmond, CA")).toBeNull();
    // A state is no metro, and nothing falls back to the state's market.
    expect(metroForName("Pennsylvania")).toBeNull();
    expect(metroForName("Harrisburg, PA")).toBeNull();
    expect(metroForName("I-95 Corridor")).toBeNull();
    expect(metroForName("")).toBeNull();
    expect(metroForName(null)).toBeNull();
    expect(metroForName(undefined)).toBeNull();
  });
});
