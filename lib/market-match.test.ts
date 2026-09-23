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
