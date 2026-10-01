import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import {
  ageOf,
  manufacturedHousingTag,
  mhContextLine,
  mhModelLine,
  mhNote,
  mhShortLine,
  mhTermRows,
  monthlyRentOf,
  readManufacturedHousing,
  readUtilities,
  utilityLabel,
} from "./manufactured-housing";

const row = (label: string, value: string, page = "p. 4") => ({ label, value, page, flagged: false });
const park = (metrics: ReturnType<typeof row>[], assetClass = "manufactured_housing"): ExtractionResult =>
  ({ dealName: "Shady Pines", assetClass, totalPages: 40, metrics: [row("Asking price", "$9,300,000", "p. 2"), ...metrics] }) as unknown as ExtractionResult;

describe("a manufactured-housing park, read as stated (#470)", () => {
  const full = park([
    row("Pads", "150"),
    row("Occupied pads", "132"),
    row("Lot rent", "$430 per month"),
    row("Market lot rent", "$525 (comparable communities)"),
    row("Park-owned homes", "18"),
    row("Tenant-owned homes", "114"),
    row("Park-owned home rent", "$895 per month"),
    row("Water and sewer", "Private well and septic"),
    row("Utility billing", "Included in lot rent"),
    row("Age restriction", "55+"),
    row("RV sites", "24"),
  ]);

  it("reads the pads, whose homes stand on them and the lot rent against the market's", () => {
    const r = readManufacturedHousing(full)!;
    expect(r).toMatchObject({
      pads: 150,
      occupied: 132,
      occupancyPct: 88,
      parkOwned: 18,
      parkOwnedPct: 12,
      parkOwnedOfOccupiedMaxPct: 13.6,
      residentOwned: 114,
      residentOwnedPct: 76,
      lotRent: 430,
      marketLotRent: 525,
      gap: 95,
      gapPct: 22.1,
      gapAnnual: 150_480,
      homeRent: 895,
      homeAboveLot: 465,
      homeIncomeAnnualMax: 100_440,
      pricePerPad: 62_000,
      age: "55+",
      rvSites: 24,
      page: "p. 4",
    });
    expect(r.utilities).toMatchObject({ water: "private", sewer: "private", kind: "private", billing: "park" });
    expect(r.headline).toContain(
      "It has 150 pads at $62,000 a pad, 132 occupied (88%); 114 carry a home its resident owns (76%); 18 carry a home the park owns (12% of the pads, as much as 13.6% of the occupancy).",
    );
    expect(r.headline).toContain("The 18 vacant pads earn nothing until a home is moved onto each");
    expect(r.headline).toContain(
      "The average lot rent is $430 a month against the memorandum's market $525: $95 a month under, 22.1% of the rent in place, $150,480 a year across the 132 occupied pads were every lot at market.",
    );
    expect(r.headline).toContain(
      "A park-owned home rents for $895 a month, $465 above its lot's $430: across the 18 homes, up to $100,440 a year of the income is the homes' rather than the land's.",
    );
    expect(r.headline).toContain("The water and sewer are the park's own (as stated: Private well and septic): the park runs a utility");
    expect(r.headline).toContain("The park pays for the water and sewer (as stated: Included in lot rent)");
    expect(r.headline).toContain("at least 80% of the occupied homes have a resident 55 or older");
    expect(r.headline).toContain("It also has 24 RV sites, apart from the pads");
    expect(manufacturedHousingTag(full)).toBe("Lot rent $430 vs $525 mkt, Private water & sewer");
    expect(manufacturedHousingTag(full, Infinity)).toBe("Lot rent $430 vs $525 mkt, Private water & sewer, POH 12%, 55+");
  });

  it("reads the water and the sewer apart, only from words that name a source", () => {
    expect(readUtilities("City water and sewer")).toMatchObject({ water: "public", sewer: "public", kind: "public" });
    expect(readUtilities("Municipal water; septic system")).toMatchObject({ water: "public", sewer: "private", kind: "mixed" });
    expect(readUtilities("Public water, package treatment plant for sewer")).toMatchObject({ water: "public", sewer: "private" });
    expect(readUtilities("Community-owned water system and lagoon")).toMatchObject({ water: "private", sewer: "private" });
    // A negated source is dropped, and "well maintained" is no well.
    expect(readUtilities("City water and sewer; no septic")).toMatchObject({ water: "public", sewer: "public" });
    expect(readUtilities("City water and sewer, well maintained")).toMatchObject({ water: "public", sewer: "public" });
    expect(readUtilities("$48,000")).toMatchObject({ water: null, sewer: null, kind: null });
    expect(readUtilities("City water and sewer, billed back to residents").billing).toBe("residents");
    expect(readUtilities("City water and sewer", "Not billed back").billing).toBe("park");
    expect(utilityLabel(readUtilities("Municipal water; septic system"))).toBe("Public water, private sewer");
    expect(utilityLabel(readUtilities("Private well and septic"))).toBe("Private water & sewer");
  });

  it("reads a bare source word by what the row's label names (#471)", () => {
    const both = readManufacturedHousing(park([row("Pads", "80"), row("Water/Sewer", "Public")]))!;
    expect(both.utilities).toMatchObject({ water: "public", sewer: "public", kind: "public", stated: "Public" });
    // Rows of their own are read together.
    const apart = readManufacturedHousing(park([row("Pads", "80"), row("Water", "City"), row("Sewer", "Septic system")]))!;
    expect(apart.utilities).toMatchObject({ water: "public", sewer: "private", kind: "mixed", stated: "Water: City; Sewer: Septic system" });
    expect(readManufacturedHousing(park([row("Pads", "80"), row("Utilities", "Private")]))!.utilities).toMatchObject({ kind: "private" });
    // A bare word under a label that names neither is no source.
    expect(readManufacturedHousing(park([row("Pads", "80"), row("Utilities", "$48,000")]))).toBeNull();
  });

  it("reads a monthly rent to the cent, never a range as an average, and a market range at its low end", () => {
    expect(monthlyRentOf("$432.50/month")).toBe(432.5);
    expect(monthlyRentOf("$5,160 annually")).toBe(430);
    expect(monthlyRentOf("$395 - $475 per month")).toBeNull();
    expect(monthlyRentOf("2025 average: $430")).toBe(430);
    const r = readManufacturedHousing(park([row("Pads", "80"), row("Occupancy", "95%"), row("Lot rent", "$410"), row("Market lot rent", "$475 - $525 per month")]))!;
    expect(r).toMatchObject({ occupied: 76, marketLotRent: 475, gap: 65, gapAnnual: 59_280, marketRange: { low: 475, high: 525 } });
    expect(r.headline).toContain("the memorandum's market $475 (the low end of the $475–$525 it states)");
  });

  it("says a rent at or above market is no upside, and a stated none as none", () => {
    const at = readManufacturedHousing(park([row("Pads", "60"), row("Lot rent", "$540"), row("Market lot rent", "$525"), row("Park-owned homes", "None")]))!;
    expect(at.headline).toContain("at or above the memorandum's market $525: the upside is not in the lot rents.");
    expect(at.parkOwned).toBe(0);
    expect(at.headline).toContain("No home is the park's own, as stated");
    expect(manufacturedHousingTag(park([row("Pads", "60"), row("Park-owned homes", "0"), row("Water and sewer", "City water and sewer")]))).toBe("No POH");
  });

  it("reads a park-owned share as the count it describes, and never an RV site as a pad", () => {
    const r = readManufacturedHousing(
      park([row("RV sites", "30"), row("Pads", "200"), row("Occupied pads", "180"), row("Park-owned homes", "10% of occupied sites")]),
    )!;
    expect(r).toMatchObject({ pads: 200, rvSites: 30, parkOwned: 18, parkOwnedPct: 9 });
    expect(ageOf("Age-restricted (55 and older)")).toBe("55+");
    expect(ageOf("All-age")).toBe("all-age");
    expect(ageOf("62+ active adult")).toBe("62+");
    expect(ageOf("Family community")).toBe("all-age");
  });

  it("reads the rent rules the memorandum names", () => {
    const reg = readManufacturedHousing(
      park([row("Pads", "120"), row("Occupied pads", "114"), row("Lot rent", "$900"), row("Market lot rent", "$1,100"), row("Rent control", "Subject to the City of San Jose Mobilehome Rent Ordinance")]),
    )!;
    expect(reg.rentControl).toEqual({ stated: "Subject to the City of San Jose Mobilehome Rent Ordinance", regulated: true });
    expect(reg.headline).toContain("and the rent rules the memorandum names");
    expect(reg.headline).toContain("Its lot rents are regulated, as stated (Subject to the City of San Jose Mobilehome Rent Ordinance)");
    const none = readManufacturedHousing(park([row("Pads", "120"), row("Lot rent", "$500"), row("Rent control", "None")]))!;
    expect(none.rentControl?.regulated).toBe(false);
    expect(none.headline).toContain("It is not subject to rent control, as the memorandum states — a claim to check");
  });

  it("says what the model does with the park", () => {
    const r = readManufacturedHousing(full)!;
    expect(mhModelLine(r, { rentGrowthPct: 0.03, exitCapPct: 0.06 })).toBe(
      "Closed by the sale, the gap to the memorandum's market lot rent is $150k a year of income, $2.5M at the model's 6.00% exit cap; the model grows today's lot rents at 3.0% a year and reads no market rent, so closing the gap is in none of its returns. It capitalises the whole income at one exit cap, the park-owned homes' rent with the lots': up to $100k a year of it is the homes', $1.7M of the exit's value at 6.00%. Its reserve is the class's screening default, not a figure for the park's own water and sewer.",
    );
    const city = readManufacturedHousing(park([row("Pads", "100"), row("Water and sewer", "City water and sewer")]))!;
    expect(mhModelLine(city, { rentGrowthPct: 0.03, exitCapPct: 0.06 })).toBe("");
  });

  it("is null on anything but a park, and where the memorandum states nothing a park is read by", () => {
    expect(readManufacturedHousing(park([row("Units", "240"), row("Occupancy", "95%")], "multifamily"))).toBeNull();
    expect(readManufacturedHousing(park([row("Pads", "150"), row("Occupancy", "90%")]))).toBeNull();
    expect(readManufacturedHousing(park([row("Lot rent", "N/A"), row("Water and sewer", "—")]))).toBeNull();
    expect(readManufacturedHousing(park([row("Utilities", "$48,000")]))).toBeNull();
    expect(readManufacturedHousing(null)).toBeNull();
    // A lot rent beside a count of pads reads even where the class was not.
    expect(readManufacturedHousing(park([row("Pads", "90"), row("Lot rent", "$350")], "multifamily"))?.lotRent).toBe(350);
  });

  it("says it in one line, hands the steps after the extraction the read, and leads the key terms", () => {
    const r = readManufacturedHousing(full)!;
    expect(mhShortLine(r)).toBe(
      "Manufactured housing: 150 pads at $62k a pad, 88% occupied; lot rent $430 (market $525); 18 park-owned homes (12%); private water & sewer; 55+; 24 RV sites",
    );
    expect(mhContextLine(r)).toMatch(/^Manufactured housing: It has 150 pads/);
    expect(mhNote(r)).toContain("MANUFACTURED HOUSING AS STATED:");
    expect(mhTermRows(full.metrics).map((m) => m.label)).toEqual(["Lot rent", "Market lot rent", "Park-owned homes", "Water and sewer", "Age restriction"]);
  });
});

describe("the prompt asks for what the reader reads (#470)", () => {
  it("names every park row by the label the reader takes", () => {
    const prompt = extractionInstruction("manufactured_housing" as never);
    for (const label of [
      "Occupied pads",
      "Lot rent",
      "Market lot rent",
      "Park-owned homes",
      "Tenant-owned homes",
      "Park-owned home rent",
      "Water and sewer",
      "Utility billing",
      "Age restriction",
      "RV sites",
      "Rent control",
    ]) {
      expect(prompt).toContain(`"${label}"`);
    }
  });
});
