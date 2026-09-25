import { describe, expect, it } from "vitest";
import { placeOf } from "@/lib/address";

describe("placeOf — the city and state a line of text states", () => {
  it("reads an OM's address line, and nothing where no state is written", () => {
    expect(placeOf("1200 Liberty Ave, Pittsburgh, PA 15222")).toEqual({ city: "Pittsburgh", state: "PA" });
    expect(placeOf("Pittsburgh, Pennsylvania")).toEqual({ city: "Pittsburgh", state: "PA" });
    expect(placeOf("123 Main St, Cleveland OH 44114")).toEqual({ city: "Cleveland", state: "OH" });
    expect(placeOf("88 Main Street Cleveland OH 44114")).toEqual({ city: "Cleveland", state: "OH" });
    expect(placeOf("1200 Liberty Ave, Pittsburgh, PA, 15222")).toEqual({ city: "Pittsburgh", state: "PA" });
    expect(placeOf("Dallas, TX")).toEqual({ city: "Dallas", state: "TX" });
    // A street suffix is not a state: "Ct" is Court, not Connecticut.
    expect(placeOf("123 Oak Ct, Springfield")).toBeNull();
    expect(placeOf("")).toBeNull();
    expect(placeOf("Downtown")).toBeNull();
  });

  it("reads a place the way a person types one", () => {
    expect(placeOf("Richmond, VA")).toEqual({ city: "Richmond", state: "VA" });
    expect(placeOf("Tampa Florida")).toEqual({ city: "Tampa", state: "FL" });
    // A code written with its stops is the code.
    expect(placeOf("Washington, D.C.")).toEqual({ city: "Washington", state: "DC" });
    expect(placeOf("Washington D.C. 20001")).toEqual({ city: "Washington", state: "DC" });
    expect(placeOf("Buffalo, N.Y.")).toEqual({ city: "Buffalo", state: "NY" });
    // A state alone names no city.
    expect(placeOf("Virginia")).toEqual({ city: null, state: "VA" });
  });

  it("tries the longer state name first: West Virginia is not Virginia", () => {
    // Tried in the table's order, this read as a city called "Charleston
    // West" in Virginia.
    expect(placeOf("Charleston West Virginia")).toEqual({ city: "Charleston", state: "WV" });
    expect(placeOf("Charleston, West Virginia")).toEqual({ city: "Charleston", state: "WV" });
    expect(placeOf("Wichita Kansas")).toEqual({ city: "Wichita", state: "KS" });
    expect(placeOf("Little Rock Arkansas")).toEqual({ city: "Little Rock", state: "AR" });
  });
});
