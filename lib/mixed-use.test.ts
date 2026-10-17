import { describe, expect, it } from "vitest";
import type { ExtractionResult, ExtractedTenant } from "@/lib/anthropic/types";
import {
  COMMERCIAL_INCOME_ROW,
  COMMERCIAL_OCCUPANCY_ROW,
  COMMERCIAL_SF_ROW,
  RESIDENTIAL_INCOME_ROW,
  annualIncomeOf,
  mixedUseContextLine,
  mixedUseModelLine,
  mixedUseNote,
  mixedUseShortLine,
  mixedUseTag,
  mixedUseTermRows,
  readMixedUse,
  statedIncomeOf,
} from "./mixed-use";
import { gluedWords } from "./render-lint";
import { extractionInstruction } from "./anthropic/prompts";

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

  // The audit of 2026-10-05: the first commercial row alone was read, the
  // model's line said "as the residential" with no residential income, and
  // an average rent a unit was read as the building's residential income.
  it("adds every kind of commercial income, says the model's cap against the residential only where one is stated, and reads no average rent as income", () => {
    const three = readMixedUse(
      deal([row("Residential income", "$1,500,000"), row("Retail income", "$300,000"), row("Office income", "$400,000")], "Mixed-use"),
      TODAY,
    )!;
    expect(three).toMatchObject({ commercialIncome: 700_000, commercialIncomeSharePct: 31.8, commercialRows: ["Retail income", "Office income"] });
    expect(three.headline).toContain("The memorandum states $1.50M of residential income and $700k of commercial (retail income and office income, added): 31.8% of the income");
    expect(mixedUseTag(deal([row("Residential income", "$1,500,000"), row("Retail income", "$300,000"), row("Office income", "$400,000")], "Mixed-use"), TODAY)).toBe(
      "Commercial 32% of income",
    );
    // An office and retail building: no residential, and the model's line says so.
    const officeRetail = readMixedUse(deal([row("Office income", "$1,200,000"), row("Retail income", "$400,000"), row("Building SF", "60,000 SF")], "Mixed-use (office/retail)"), TODAY)!;
    expect(officeRetail.commercialIncome).toBe(1_600_000);
    const line = mixedUseModelLine(officeRetail, { exitCapPct: 0.065, rentGrowthPct: 0.03 })!;
    expect(line).toBe(
      "The model capitalises the $1.60M of commercial income at its 6.50% exit cap and grows it at 3.0% a year: one cap and one growth rate for all of the building's income, where commercial space trades to its own buyers at its own cap.",
    );
    expect(line).not.toContain("as the residential");
    // A commercial total beside a kind's own row is a sum the reader cannot know.
    const overlap = readMixedUse(deal([row("Residential income", "$1,500,000"), row("Commercial income", "$700,000"), row("Retail income", "$300,000")], "Mixed-use"), TODAY)!;
    expect(overlap).toMatchObject({ commercialIncome: null, commercialIncomeSharePct: null, commercialUnread: ["Commercial income", "Retail income"] });
    expect(overlap.headline).toContain("The memorandum states commercial income in more than one row (Commercial income, Retail income), and whether one includes another is its to say");
    // An average rent a unit is no building's residential income.
    const average = readMixedUse(deal([row("Units", "48"), row("Residential rent", "$1,850/mo average"), row("Commercial income", "$610,000")], "Mixed-use"), TODAY)!;
    expect(average.residentialIncome).toBeNull();
    expect(average.commercialIncomeSharePct).toBeNull();
    expect(annualIncomeOf("$1,850/mo average")).toBeNull();
    expect(annualIncomeOf("$1,850 avg")).toBeNull();
    expect(readMixedUse(deal([row("Residential rent (average)", "$1,850/mo"), row("Commercial income", "$610,000")], "Mixed-use"), TODAY)!.residentialIncome).toBeNull();
    for (const r of [three, officeRetail, overlap]) expect(gluedWords(r.headline)).toEqual([]);
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

  it("reads an income with its increases or its year after a dash: words after the figure, never a range or a share (audit C3a)", () => {
    // Any digit, dash and digit had read as a range, so the stated income
    // was none, and a percentage anywhere in the clause read as a share.
    expect(statedIncomeOf("$610,000 – 2% annual increases")).toEqual({ annual: 610_000, fromMonth: false });
    expect(statedIncomeOf("$610,000 - 2% annual increases")).toEqual({ annual: 610_000, fromMonth: false });
    expect(statedIncomeOf("$610,000 annually")).toEqual({ annual: 610_000, fromMonth: false });
    expect(statedIncomeOf("$610,000 – 2026 budget")).toEqual({ annual: 610_000, fromMonth: false });
    expect(statedIncomeOf("$610,000 (2025-26)")).toEqual({ annual: 610_000, fromMonth: false });
    // The increases' "annual" is not the figure's period: a month's figure
    // stays a month's.
    expect(statedIncomeOf("$91,667/month – 3% annual increases")).toEqual({ annual: 1_100_004, fromMonth: true });
    expect(statedIncomeOf("$91,667 – monthly")).toEqual({ annual: 1_100_004, fromMonth: true });
    // A range is still two figures, and a share still no income.
    expect(statedIncomeOf("$600,000 – $700,000")).toBeNull();
    expect(statedIncomeOf("$600,000 to 700,000")).toBeNull();
    expect(statedIncomeOf("28.6% – $610,000")).toBeNull();
    const r = readMixedUse(deal([row("Residential income", "$1,520,000"), row("Commercial income", "$610,000 – 2% annual increases")], "Mixed-use"), TODAY)!;
    expect(r).toMatchObject({ residentialIncome: 1_520_000, commercialIncome: 610_000, commercialIncomeSharePct: 28.6 });
  });

  // The batch audit: the month test ran over the whole row, so a year's
  // figure with its month in brackets was read as twelve times the year —
  // "$610,000 annually ($50,833/month)" as $7.32M of commercial income,
  // 82.8% of the building's.
  it("reads the period from the words attached to the figure it reads, never the whole row's", () => {
    expect(annualIncomeOf("$610,000 annually ($50,833/month)")).toBe(610_000);
    expect(annualIncomeOf("$1,100,000 per annum ($91,667/month)")).toBe(1_100_000);
    expect(statedIncomeOf("$1,100,000 a year, or $91,667 a month")).toEqual({ annual: 1_100_000, fromMonth: false });
    expect(statedIncomeOf("$1.1M/yr or $91.7k/mo")).toEqual({ annual: 1_100_000, fromMonth: false });
    // The year's figure where a month's leads and the two agree.
    expect(statedIncomeOf("$91,667/month ($1.1M a year)")).toEqual({ annual: 1_100_000, fromMonth: false });
    // A month's figure alone, its period in its own words or its own bracket.
    expect(statedIncomeOf("$91,667/month")).toEqual({ annual: 1_100_004, fromMonth: true });
    expect(statedIncomeOf("$91,667 (monthly)")).toEqual({ annual: 1_100_004, fromMonth: true });
    expect(statedIncomeOf("$91,667 a month, escalating 3% a year")).toEqual({ annual: 1_100_004, fromMonth: true });
    // A year's figure beside a month's that is not its twelfth: neither is
    // chosen.
    expect(annualIncomeOf("$1,100,000 per annum ($95,000/month)")).toBeNull();
    const r = readMixedUse(deal([row("Residential income", "$1,520,000"), row("Commercial income", "$610,000 annually ($50,833/month)")], "Mixed-use"), TODAY)!;
    expect(r).toMatchObject({ residentialIncome: 1_520_000, commercialIncome: 610_000, commercialIncomeSharePct: 28.6 });
    expect(r.headline).toContain("$610k of commercial: 28.6% of the income is the commercial space's");
    expect(mixedUseTag(deal([row("Residential income", "$1,520,000"), row("Commercial income", "$610,000 annually ($50,833/month)")], "Mixed-use"), TODAY)).toBe(
      "Commercial 29% of income",
    );
  });

  // Research pass 38's leftover: an income read off a month's figure was
  // said as a year the memorandum "states" ($1.1M where it states $91,667 a
  // month).
  it("says an income read off a month as the month it states and the year it makes, never a stated year", () => {
    const monthly = readMixedUse(deal([row("Residential income", "$91,667/month"), row("Commercial income", "$610,000")], "Mixed-use"), TODAY)!;
    expect(monthly).toMatchObject({ residentialIncome: 1_100_004, residentialFromMonth: true, commercialFromMonth: false });
    expect(monthly.headline).toContain("The memorandum states $92k a month of residential income ($1.10M a year) and $610k of commercial: ");
    expect(monthly.headline).not.toContain("states $1.10M");
    const shops = readMixedUse(deal([row("Residential income", "$1,520,000"), row("Commercial income", "$50,000 per month")], "Mixed-use"), TODAY)!;
    expect(shops).toMatchObject({ commercialIncome: 600_000, commercialFromMonth: true, residentialFromMonth: false });
    expect(shops.headline).toContain("The memorandum states $1.52M of residential income and $50k a month of commercial ($600k a year): ");
    const alone = readMixedUse(deal([row("Commercial income", "$50,000/mo")], "Mixed-use"), TODAY)!;
    expect(alone.headline).toContain("The memorandum states $50k a month of commercial income ($600k a year) and no residential figure beside it");
    // Summed rows, one of them a month's: the year is said, and the month
    // among them.
    const summed = readMixedUse(deal([row("Residential income", "$1,520,000"), row("Retail income", "$25,000/month"), row("Office income", "$400,000")], "Mixed-use"), TODAY)!;
    expect(summed).toMatchObject({ commercialIncome: 700_000, commercialFromMonth: true });
    expect(summed.headline).toContain("$700k a year of commercial (retail income and office income, added), a month's figure among them taken twelve times: ");
    // A year stated beside its month is a stated year.
    const both = readMixedUse(deal([row("Residential income", "$1,520,000"), row("Commercial income", "$610,000 annually ($50,833/month)")], "Mixed-use"), TODAY)!;
    expect(both.commercialFromMonth).toBe(false);
    for (const r of [monthly, shops, alone, summed]) expect(gluedWords(r.headline)).toEqual([]);
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

describe("the prompt asks for what the reader reads", () => {
  it("names each mixed-use row by a label the reader's own pattern takes, and never asks for a split", () => {
    const prompt = extractionInstruction("mixed_use");
    const labels: [string, RegExp][] = [
      ["Residential income", RESIDENTIAL_INCOME_ROW],
      ["Commercial income", COMMERCIAL_INCOME_ROW],
      ["Commercial SF", COMMERCIAL_SF_ROW],
      ["Commercial occupancy", COMMERCIAL_OCCUPANCY_ROW],
    ];
    for (const [label, re] of labels) {
      expect(prompt).toContain(`"${label}"`);
      expect(re.test(label), label).toBe(true);
    }
    expect(prompt).toContain("Never split a total into the two halves yourself and never compute a share");
    // Each label, as the extraction writes it, is read.
    const r = readMixedUse(
      deal([row("Residential income", "$1,520,000"), row("Commercial income", "$610,000"), row("Commercial SF", "9,500 SF"), row("Commercial occupancy", "80%")], "Mixed-Use"),
      TODAY,
    )!;
    expect([r.residentialIncome, r.commercialIncome, r.commercialSf, r.commercialOccupancyPct]).toEqual([1_520_000, 610_000, 9_500, 80]);
  });
});
