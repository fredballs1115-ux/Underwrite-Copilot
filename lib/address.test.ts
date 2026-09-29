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

import { addressFromLine, addressUpgrade, memorandumAddress, typedAddress } from "@/lib/address";

describe("addressFromLine — a one-line address read into its fields (#441)", () => {
  it("reads the street, city, state and ZIP a line states", () => {
    expect(addressFromLine("4200 Maple Ave, Dallas, TX 75219")).toEqual({
      label: "4200 Maple Ave, Dallas, TX 75219",
      street: "4200 Maple Ave",
      city: "Dallas",
      state: "TX",
      zip: "75219",
      county: "",
      submarket: "",
    });
    // A building's name ahead of the street, a spelled number, no commas.
    expect(addressFromLine("The Maddox, 1400 Market St, Philadelphia, PA 19102")).toMatchObject({
      street: "1400 Market St",
      city: "Philadelphia",
      state: "PA",
    });
    expect(addressFromLine("One Liberty Plaza, New York, NY 10006")).toMatchObject({ street: "One Liberty Plaza", city: "New York" });
    expect(addressFromLine("88 Main Street Cleveland OH 44114")).toMatchObject({
      street: "88 Main Street",
      city: "Cleveland",
      state: "OH",
      zip: "44114",
    });
  });

  it("never takes a five-digit street number for the ZIP, and leaves out what the line does not say", () => {
    expect(addressFromLine("12345 Research Blvd, Austin, TX 78759")).toMatchObject({ street: "12345 Research Blvd", zip: "78759" });
    expect(addressFromLine("12345 Research Blvd, Austin, TX")).toMatchObject({ street: "12345 Research Blvd", zip: "" });
    // A place with no street is a market, not a building.
    expect(addressFromLine("Downtown Dallas, TX")).toMatchObject({ street: "", state: "TX" });
    // No state, no address: a line is placed by what it says, never a guess.
    expect(addressFromLine("Confidential — call the broker")).toBeNull();
    expect(addressFromLine("   ")).toBeNull();
  });
});

describe("the memorandum's address, and when a deal takes it (#441)", () => {
  const ex = { address: "4200 Maple Ave, Dallas, TX 75219" };

  it("takes a memorandum's stated street address, never a portfolio's or a market's", () => {
    expect(memorandumAddress(ex)).toMatchObject({ street: "4200 Maple Ave", state: "TX", from: "memorandum" });
    expect(memorandumAddress({ ...ex, properties: [{}, {}] })).toBeNull();
    expect(memorandumAddress({ address: "Dallas-Fort Worth, TX" })).toBeNull();
    expect(memorandumAddress({ address: "" })).toBeNull();
    expect(memorandumAddress(null)).toBeNull();
  });

  it("places a deal with no address by its memorandum, and fills a typed line from itself", () => {
    expect(addressUpgrade(null, ex)).toMatchObject({ label: ex.address, from: "memorandum" });
    expect(addressUpgrade({ label: "", street: "", city: "", state: "" }, ex)).toMatchObject({ from: "memorandum" });
    // A typed line: its own fields, never the memorandum's, and never "from" it.
    const typed = { label: "1200 Liberty Ave, Pittsburgh, PA 15222", street: "", city: "", state: "", zip: "", county: "", submarket: "" };
    const filled = addressUpgrade(typed, ex);
    expect(filled).toMatchObject({ label: typed.label, street: "1200 Liberty Ave", city: "Pittsburgh", state: "PA", zip: "15222" });
    expect(filled && "from" in filled).toBe(false);
    // The form's old JSON string reads the same way.
    expect(addressUpgrade(JSON.stringify(typed), ex)).toMatchObject({ city: "Pittsburgh" });
  });

  it("never rewrites a picked suggestion, a line that names no state, or an address with fields and no line", () => {
    expect(addressUpgrade({ label: "1400 Market St, Philadelphia, PA", street: "1400 Market St", city: "Philadelphia", state: "PA" }, ex)).toBeNull();
    expect(addressUpgrade({ label: "the old mill on Route 9", street: "", city: "", state: "" }, ex)).toBeNull();
    expect(addressUpgrade({ city: "Harrisburg", state: "PA" }, ex)).toBeNull();
    expect(addressUpgrade(null, { address: "" })).toBeNull();
    // An address the memorandum gave is filled already, so nothing is written twice.
    expect(addressUpgrade(memorandumAddress(ex), ex)).toBeNull();
  });

  it("stores a typed line read, or bare where it names no state", () => {
    expect(typedAddress("  4200 Maple Ave,  Dallas, TX 75219 ")).toMatchObject({ label: "4200 Maple Ave, Dallas, TX 75219", city: "Dallas", state: "TX" });
    expect(typedAddress("Somewhere downtown")).toEqual({ label: "Somewhere downtown", street: "", city: "", state: "", zip: "", county: "", submarket: "" });
  });
});
