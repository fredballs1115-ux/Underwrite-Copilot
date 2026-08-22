import { describe, expect, it } from "vitest";
import { coveredState, metroForAddress } from "@/lib/market-match";

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
