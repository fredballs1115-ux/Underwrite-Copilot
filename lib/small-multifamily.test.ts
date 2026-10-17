// Research pass 38, item 12 (C25, C26). A duplex, a triplex or a fourplex
// filed as no class, so a counted building that states no area ran on the
// generic 100,000 SF placeholder; they file as multifamily now. And a
// student building whose memorandum counts units ran on 350 SF a unit — a
// bed's typical size — marked as if it were the unit's; the note says so
// now and asks for the rentable SF (the area itself is the owner's). Every
// name is invented.
import { describe, expect, it } from "vitest";
import { assetClassKey } from "@/lib/asset-words";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { ex, m } from "@/lib/pass38.fixture";

describe("a small apartment building named by its count of homes (C25)", () => {
  it("files a duplex, a triplex, a fourplex and their spellings as multifamily", () => {
    for (const phrase of [
      "Duplex",
      "Duplexes",
      "Triplex",
      "Tri-plex",
      "Fourplex",
      "Four-plex",
      "Quadplex",
      "Quad-plex",
      "Quadruplex",
      "4-Plex",
      "4plex",
      "3-plex",
      "2-unit",
      "2-Unit Building",
      "Two-unit residence",
      "4 units",
    ]) {
      expect(assetClassKey(phrase), phrase).toBe("multifamily");
    }
  });

  it("leaves a commercial phrase its own class, and a count of units with more digits alone", () => {
    expect(assetClassKey("2-unit retail strip")).toBe("retail");
    expect(assetClassKey("Duplex office suites")).toBe("office");
    expect(assetClassKey("Flex industrial")).toBe("industrial");
    expect(assetClassKey("24 units")).toBeNull();
    expect(assetClassKey("124-unit")).toBeNull();
  });

  it("leaves the classes the pass named and no rule files as they are", () => {
    for (const phrase of ["Car Wash", "Gas Station", "Marina", "Condominium", "Bank Branch"]) {
      expect(assetClassKey(phrase), phrase).toBeNull();
    }
  });

  it("runs a fourplex that states no area on its count times an apartment's typical size", () => {
    const d = deriveUnderwriteInputs(
      ex({
        assetClass: "Fourplex",
        dealName: "Elm Street Fourplex",
        metrics: [m("Asking price", "350,000"), m("Units", "4"), m("NOI (in-place)", "24,500", "in_place"), m("Going-in cap rate", "7.00%")],
      }),
      "x",
    );
    expect(d.inputs.rsf).toBe(3_400);
    expect(d.sources.rsf?.note).toBe("4 units × 850 SF typical — enter the rentable SF");
  });
});

describe("a student building counted in units (C26)", () => {
  const student = (count: ReturnType<typeof m>[]) =>
    deriveUnderwriteInputs(
      ex({
        assetClass: "Student Housing",
        dealName: "Campus Commons",
        metrics: [m("Asking price", "48,000,000"), ...count, m("NOI (in-place)", "2,900,000", "in_place"), m("Rent per bed", "850")],
      }),
      "x",
    );

  it("says the typical size is a bed's, applied to a count of units, and asks for the rentable SF", () => {
    const d = student([m("Units", "180"), m("Beds", "600")]);
    expect(d.sources.rsf?.note).toBe(
      "180 units × 350 SF typical — 350 SF is a bed's typical size, applied here to a count of units, not beds; enter the rentable SF",
    );
    // The area is the owner's: the figure the model runs on is unchanged.
    expect(d.inputs.rsf).toBe(63_000);
  });

  it("says nothing new where the memorandum counts beds", () => {
    const d = student([m("Beds", "600")]);
    expect(d.sources.rsf?.note).toBe("600 beds × 350 SF typical — enter the rentable SF");
  });
});
