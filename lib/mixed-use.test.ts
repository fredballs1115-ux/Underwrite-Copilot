import { describe, expect, it } from "vitest";
import type { ExtractionResult, ExtractedTenant } from "@/lib/anthropic/types";
import {
  annualIncomeOf,
  mixedUseContextLine,
  mixedUseModelLine,
  mixedUseNote,
  mixedUseShortLine,
  mixedUseTag,
  mixedUseTermRows,
  readMixedUse,
} from "./mixed-use";
import { gluedWords } from "./render-lint";

const TODAY = new Date("2026-10-05T12:00:00Z");
const row = (label: string, value: string, page = "p. 9") => ({ label, value, page, flagged: false });
const deal = (metrics: ReturnType<typeof row>[], assetClass = "Retail / Multifamily", over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ dealName: "Main Street Lofts", assetClass, totalPages: 40, metrics, ...over }) as unknown as ExtractionResult;

// Research pass 28's mixed-use example (rp28/deals.ts mixedUse).
const MIXED = deal([
  row("Asking price", "$25,000,000", "p. 2"),
  row("Units", "48"),
  row("Retail SF", "9,500 SF"),
  row("Total SF", "62,000 SF"),
  row("NOI (in-place)", "$1,400,000"),
  row("Going-in cap rate", "5.60%"),
  row("Residential income", "$1,520,000"),
  row("Commercial income", "$610,000"),
]);

describe("a mixed-use building's two incomes, read as stated (pass 28, round 7)", () => {
  it("says the commercial share of the income and of the area, each from two stated halves", () => {
    const r = readMixedUse(MIXED, TODAY)!;
    expect(r).toMatchObject({
      residentialIncome: 1_520_000,
      commercialIncome: 610_000,
      commercialIncomeSharePct: 28.6,
      commercialSf: 9_500,
      buildingSf: 62_000,
      commercialAreaSharePct: 15.3,
      commercialOccupancyPct: null,
      roll: null,
      page: "p. 9",
    });
    expect(r.headline).toBe(
      "The memorandum states $1.52M of residential income and $610k of commercial: 28.6% of the income is the commercial space's, which re-lets on commercial terms (longer vacancies, leasing capital, a credit per tenant) where the apartments turn over every year. " +
        "The commercial space is 9,500 SF of the building's 62,000 SF, 15.3% of its area against 28.6% of its income.",
    );
    expect(mixedUseTag(MIXED, TODAY)).toBe("Commercial 29% of income");
    expect(mixedUseShortLine(r)).toBe(
      "Mixed-use: $1.52M residential and $610k commercial income (28.6% commercial); commercial 9,500 SF of 62,000 SF",
    );
    expect(mixedUseContextLine(r)).toMatch(/^Mixed-use income: The memorandum states .* \(p\. 9\)$/);
  });

  it("says the model capitalises and grows both incomes at one rate, and changes nothing", () => {
    const r = readMixedUse(MIXED, TODAY)!;
    expect(mixedUseModelLine(r, { exitCapPct: 0.056, rentGrowthPct: 0.03 })).toBe(
      "The model capitalises the $610k of commercial income at the same 5.60% exit cap as the residential and grows it at the same 3.0% a year: one cap and one growth rate for two incomes that trade to different buyers at different caps, the commercial 28.6% of it.",
    );
    expect(mixedUseModelLine(r, null)).toContain("at the same exit cap as the residential:");
    expect(mixedUseModelLine(null, null)).toBeNull();
  });

  it("reads no share off one half", () => {
    const onlyCommercial = deal([row("Commercial income", "$610,000"), row("Commercial SF", "9,500 SF")], "Mixed-Use");
    const r = readMixedUse(onlyCommercial, TODAY)!;
    expect(r).toMatchObject({ commercialIncomeSharePct: null, commercialAreaSharePct: null });
    expect(r.headline).toContain("states $610k of commercial income and no residential figure beside it, so no share of the income is read");
    expect(r.headline).toContain("The commercial space is 9,500 SF, as stated.");
    expect(mixedUseTag(onlyCommercial, TODAY)).toBeNull();
    // Two areas that cannot both be one building's: no share.
    const over = deal([row("Commercial income", "$610,000"), row("Commercial SF", "70,000 SF"), row("Total SF", "62,000 SF")], "Mixed-Use");
    expect(readMixedUse(over, TODAY)!.commercialAreaSharePct).toBeNull();
  });

  it("reads a year's income: a monthly figure twelve times, never a rate, a range, a share or a projection", () => {
    expect(annualIncomeOf("$50,000/mo")).toBe(600_000);
    expect(annualIncomeOf("$50,000 per month")).toBe(600_000);
    expect(annualIncomeOf("$610K")).toBe(610_000);
    expect(annualIncomeOf("$32.50/SF")).toBeNull();
    // A range is no one figure, its ends written with a scale or without.
    expect(annualIncomeOf("$600,000 - $700,000")).toBeNull();
    expect(annualIncomeOf("$1.0M - $1.2M")).toBeNull();
    expect(annualIncomeOf("$600k to $700k")).toBeNull();
    expect(annualIncomeOf("$2,100 per unit")).toBeNull();
    expect(annualIncomeOf("$600,000 - $650,000")).toBeNull();
    expect(annualIncomeOf("28.6% of EGI")).toBeNull();
    expect(annualIncomeOf("N/A")).toBeNull();
    const projected = deal([row("Residential income", "$1,520,000"), row("Commercial income (pro forma)", "$720,000")], "Mixed-Use");
    expect(readMixedUse(projected, TODAY)).toBeNull();
  });

  it("is no mixed-use read on another building, or with nothing commercial stated", () => {
    expect(readMixedUse(deal([row("Commercial income", "$90,000")], "Multifamily"), TODAY)).toBeNull();
    expect(readMixedUse(deal([row("Residential income", "$1,520,000")], "Mixed-Use"), TODAY)).toBeNull();
    // Both halves stated make a mixed-use read whatever the class was filed as.
    const both = deal([row("Residential income", "$1,520,000"), row("Commercial income", "$610,000")], "Multifamily");
    expect(readMixedUse(both, TODAY)?.commercialIncomeSharePct).toBe(28.6);
    expect(readMixedUse(null, TODAY)).toBeNull();
  });

  it("names the commercial leases' roll where the tenant list is read", () => {
    const tenant = (over: Partial<ExtractedTenant> & Pick<ExtractedTenant, "name">): ExtractedTenant => ({
      role: "inline",
      inSale: "yes",
      sf: "",
      rent: "",
      leaseExpiration: "",
      options: "",
      earlyTermination: "",
      rights: "",
      page: "p. 14",
      ...over,
    });
    const withShops = deal(MIXED.metrics as ReturnType<typeof row>[], "Retail / Multifamily", {
      tenants: [
        tenant({ name: "Corner Cafe", sf: "3,000", rent: "$120,000", leaseExpiration: "June 30, 2028" }),
        tenant({ name: "Pharmacy", sf: "6,500", rent: "$300,000", leaseExpiration: "December 31, 2027" }),
      ],
    });
    const r = readMixedUse(withShops, TODAY)!;
    expect(r.roll).not.toBeNull();
    expect(r.headline).toContain(`The commercial leases, as the tenant list reads them: ${r.roll}.`);
  });

  it("states the commercial occupancy as stated, and orders the key terms", () => {
    const occ = deal([row("Residential income", "$1,520,000"), row("Commercial income", "$610,000"), row("Commercial occupancy", "80%")], "Mixed-Use");
    const r = readMixedUse(occ, TODAY)!;
    expect(r.commercialOccupancyPct).toBe(80);
    expect(r.headline).toContain("It is 80% occupied, as stated.");
    expect(mixedUseShortLine(r)).toContain("commercial 80% occupied");
    expect(
      mixedUseTermRows([
        row("Commercial occupancy", "80%"),
        row("Retail SF", "9,500 SF"),
        row("Commercial income", "$610,000"),
        row("Residential income", "$1,520,000"),
        row("Commercial income (pro forma)", "$700,000"),
      ]).map((m) => m.label),
    ).toEqual(["Residential income", "Commercial income", "Retail SF", "Commercial occupancy"]);
  });

  it("hands the challenger the facts, then the traps the two incomes add", () => {
    const note = mixedUseNote(readMixedUse(MIXED, TODAY)!);
    expect(note).toMatch(/^MIXED-USE INCOME AS STATED: The memorandum states/);
    for (const trap of ["(d) THE AGENCY LIMIT", "(e) METERS AND CAM", "(f) THE ZONING"]) expect(note).toContain(trap);
  });

  it("writes every sentence without a glued word", () => {
    const r = readMixedUse(MIXED, TODAY)!;
    for (const text of [r.headline, mixedUseShortLine(r), mixedUseContextLine(r), mixedUseModelLine(r, { exitCapPct: 0.056, rentGrowthPct: 0.03 }) ?? ""])
      expect(gluedWords(text)).toEqual([]);
  });
});
