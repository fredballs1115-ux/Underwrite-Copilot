import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import {
  HOA_DUES_ROW,
  SPECIAL_ASSESSMENT_ROW,
  STATED_ROWS,
  UNITS_IN_CONDO_ROW,
  UNITS_OFFERED_ROW,
  condoContextLine,
  condoModelLine,
  condoNote,
  condoShortLine,
  condoTag,
  condoTermRows,
  monthlyDuesOf,
  readCondo,
} from "./condo";
import { gluedWords } from "./render-lint";
import { extractionInstruction } from "./anthropic/prompts";
import { unitCountRow } from "./criteria";

const TODAY = new Date("2026-10-05T12:00:00Z");
const row = (label: string, value: string, page = "p. 6") => ({ label, value, page, flagged: false });
const deal = (assetClass: string, metrics: ReturnType<typeof row>[], over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ dealName: "Harbor View", assetClass, totalPages: 40, metrics, ...over }) as unknown as ExtractionResult;

// Research pass 28's bulk example (rp28/deals.ts condoBulk).
const BULK = deal("Condominium Units (bulk sale)", [
  row("Asking price", "$16,800,000", "p. 2"),
  row("Units", "42"),
  row("NOI (in-place)", "$840,000"),
  row("HOA dues", "$650 per unit per month"),
  row("Occupancy", "93%"),
  row("Units in building", "120"),
]);

describe("condominium units bought in bulk (pass 28, round 8)", () => {
  it("reads the buyer's share of the association, a year of its dues and the agency's single-entity limit", () => {
    const r = readCondo(BULK, TODAY)!;
    expect(r).toMatchObject({ unitsOffered: 42, unitsInCondominium: 120, sharePct: 35, monthlyDues: 650, annualDues: 327_600 });
    expect(r.agencyLimit).toMatchObject({ lender: "Fannie Mae", pct: 20, exceptionPct: 49, minUnits: 21, version: "2026-08-05", readOn: "2026-10-05", stale: null });
    expect(r.headline).toBe(
      "The memorandum offers 42 of the condominium's 120 units, 35%: the buyer becomes one owner in an association whose declaration governs the building, with that share of its votes and its common costs where each unit counts alike. " +
        "At $650 a unit a month, the dues on 42 units are $328k a year, owed to the association whoever lives there; whether the stated NOI is after them is the memorandum's to say. " +
        "Owning 35% of a project of 120 units, the buyer would be a single entity over the 20% that Fannie Mae's Selling Guide allows in a project of 21 or more units (B4-2.1-03, Ineligible Projects, its Aug 5, 2026 version, read Oct 5, 2026): such a project is ineligible for Fannie Mae's loans on its units unless the section's exceptions hold, and the one it lists for a larger owner reaches 49% of the units, on conditions that include the owner marketing units for sale to bring its share to 20% or less and being current on its assessments.",
    );
    expect(condoTag(BULK, TODAY)).toBe("Bulk 42 of 120 (35%)");
    expect(condoShortLine(r)).toBe("Condominium units: 42 of 120 units; dues $328k a year");
  });

  it("marks the agency rule stale once its research is, and never hides it", () => {
    const r = readCondo(BULK, new Date("2027-05-01T12:00:00Z"))!;
    expect(r.agencyLimit?.stale).toBe("208 days old, stale");
    expect(r.headline).toContain("its Aug 5, 2026 version, read Oct 5, 2026; 208 days old, stale)");
  });

  it("says the exception the section lists falls short of a larger block", () => {
    const most = deal("Condominium units", [row("Units offered", "86"), row("Units in condominium", "120")]);
    const r = readCondo(most, TODAY)!;
    expect(r.sharePct).toBe(71.7);
    expect(r.headline).toContain("the one it lists for a larger owner reaches 49% of the units, short of this purchase's 71.7%, on conditions");
  });

  it("says no agency limit at or under it, on a small project, or on the whole condominium", () => {
    const small = deal("Condominium units", [row("Units offered", "6"), row("Units in condominium", "18")]);
    expect(readCondo(small, TODAY)!.agencyLimit).toBeNull();
    const under = deal("Condominium units", [row("Units offered", "20"), row("Units in condominium", "120")]);
    expect(readCondo(under, TODAY)!.agencyLimit).toBeNull();
    const all = deal("Condominium (entire building)", [row("Units offered", "120"), row("Units in condominium", "120")]);
    const r = readCondo(all, TODAY)!;
    expect(r.agencyLimit).toBeNull();
    expect(r.headline).toContain("The memorandum offers all 120 units of the condominium: the buyer holds every vote in its association");
    expect(condoTag(all, TODAY)).toBe("Condo units");
  });

  it("reads a unit's monthly dues, a year's as a twelfth, and never a bare figure, a total or a rate", () => {
    expect(monthlyDuesOf("$650/mo")).toBe(650);
    expect(monthlyDuesOf("$1,250 per unit per month")).toBe(1250);
    expect(monthlyDuesOf("$7,800 per year")).toBe(650);
    // No period stated: a month's or a year's, so neither.
    expect(monthlyDuesOf("$650")).toBeNull();
    // A year of the block's dues, or a month of them, is no unit's.
    expect(monthlyDuesOf("$327,600 per year")).toBeNull();
    expect(monthlyDuesOf("$27,300/mo")).toBeNull();
    expect(monthlyDuesOf("$0.45/SF")).toBeNull();
    expect(monthlyDuesOf("$600 - $700")).toBeNull();
  });

  // The audit of 2026-10-05: a row stating both periods was read as a
  // twelfth of its monthly figure — $54.17, a year of 42 units' dues $27,300
  // against the true $327,600.
  it("reads a row stating both periods at its month's figure where the two agree, and as stated where they do not", () => {
    expect(monthlyDuesOf("$650/mo ($7,800/yr)")).toBe(650);
    expect(monthlyDuesOf("$7,800 per year ($650 per month)")).toBe(650);
    expect(monthlyDuesOf("$650/mo ($7,900/yr)")).toBeNull();
    const both = readCondo(deal("Condominium units", [row("Units offered", "42"), row("HOA dues", "$650/mo ($7,800/yr)")]), TODAY)!;
    expect(both).toMatchObject({ monthlyDues: 650, annualDues: 327_600 });
    expect(both.headline).toContain("the dues on 42 units are $328k a year");
    const disagree = readCondo(deal("Condominium units", [row("Units offered", "42"), row("HOA dues", "$650/mo ($7,900/yr)")]), TODAY)!;
    expect(disagree).toMatchObject({ monthlyDues: null, annualDues: null, duesStated: "$650/mo ($7,900/yr)" });
    expect(disagree.headline).toContain("Dues, as stated: $650/mo ($7,900/yr); a unit's month could not be read from it");
  });

  // The pre-merge audit (C1, M2): a row stating a unit's month beside the
  // block's year was said to name neither, a row written without "$" was
  // not read, and the block's month was read as one unit's.
  it("reads a unit's month beside the block's year, a figure without '$', and never the block's figure as a unit's", () => {
    const of42 = (dues: string) => readCondo(deal("Condominium units (bulk)", [row("Units offered", "42"), row("Units in condominium", "120"), row("HOA dues", dues)]), TODAY)!;
    for (const dues of ["$650 per unit per month; $327,600 a year for the 42 units", "$650/unit/month ($327,600 annually for the 42 offered units)", "650/mo (7,800/yr)"]) {
      const r = of42(dues);
      expect(r, dues).toMatchObject({ monthlyDues: 650, annualDues: 327_600, duesStated: null });
      expect(r.headline, dues).toContain("At $650 a unit a month, the dues on 42 units are $328k a year");
      expect(r.headline, dues).not.toContain("could not be read");
    }
    // The block's year over the units the row names, without the units
    // offered beside it.
    expect(monthlyDuesOf("$650 per unit per month; $327,600 a year for the 42 units")).toBe(650);
    // A year that agrees with neither is no read.
    expect(monthlyDuesOf("$650 per unit per month; $300,000 a year for the 42 units")).toBeNull();
    // The block's month is no unit's.
    const block = readCondo(deal("Condominium units", [row("Units offered", "5"), row("HOA dues", "$3,250 per month for all 5 units")]), TODAY)!;
    expect(block).toMatchObject({ monthlyDues: null, annualDues: null, duesStated: "$3,250 per month for all 5 units" });
    expect(block.headline).toContain("Dues, as stated: $3,250 per month for all 5 units; a unit's month could not be read from it, so no year of the block's dues is read.");
    expect(block.headline).not.toContain("$195k");
    // "Per unit" beside the units it covers stays the unit's.
    expect(monthlyDuesOf("$650 per unit per month for all 42 units")).toBe(650);
  });

  // The audit of 2026-10-05: a read of the declaration's terms alone wrote
  // "Condominium units: " on the memo and the workbook's cover.
  it("writes a short line of the declaration's first term where nothing else is stated, never an empty one", () => {
    const r = readCondo(deal("Condominium", [row("Rental restrictions", "No more than 25% of units may be leased.")]), TODAY)!;
    expect(r.headline).toBe("Rental restrictions, as stated: No more than 25% of units may be leased.");
    expect(condoShortLine(r)).toBe("Condominium units: rental restrictions as stated (No more than 25% of units may be leased)");
  });

  it("says a dues row it cannot read as stated, and a unit's dues to the dollar", () => {
    const bare = readCondo(deal("Condominium units", [row("Units offered", "42"), row("HOA dues", "$650")]), TODAY)!;
    expect(bare).toMatchObject({ monthlyDues: null, duesStated: "$650", annualDues: null });
    expect(bare.headline).toContain("Dues, as stated: $650; a unit's month could not be read from it, so no year of the block's dues is read.");
    expect(condoShortLine(bare)).toBe("Condominium units: 42 units; dues $650 as stated");
    const dear = readCondo(deal("Condominium units", [row("HOA dues", "$1,250/mo")]), TODAY)!;
    expect(dear.headline).toBe("The dues are $1,250 a unit a month, as stated.");
  });

  it("is no read off a building that is no condominium, or with nothing stated", () => {
    expect(readCondo(deal("Multifamily", [row("Units", "48")]), TODAY)).toBeNull();
    expect(readCondo(deal("Condo-quality apartments", [row("Units", "48")]), TODAY)).toBeNull();
    expect(readCondo(deal("Condominium Units", []), TODAY)).toBeNull();
    // More units offered than the condominium holds: no share.
    expect(readCondo(deal("Condominium units", [row("Units offered", "130"), row("Units in condominium", "120")]), TODAY)!.sharePct).toBeNull();
    expect(readCondo(null, TODAY)).toBeNull();
  });

  // The audit of 2026-10-05: an apartment building whose words mentioned a
  // condominium was read as 240 condominium units, its whole count taken
  // for the units offered.
  it("reads no condominium off an apartment building's words, and never its whole count on the words alone", () => {
    const plan = (summary: string): Partial<ExtractionResult> => ({ strategy: { kind: "stabilized", summary, capitalBudget: "", timeline: "" } });
    const apartments = [row("Asking price", "$60,000,000"), row("Units", "240"), row("NOI (in-place)", "$3,300,000")];
    for (const summary of ["Class A apartments built to condominium specifications.", "Renovate and sell as a condominium conversion.", "Condominium-grade finishes throughout."]) {
      const d = deal("Multifamily", apartments, plan(summary));
      expect(readCondo(d, TODAY), summary).toBeNull();
      expect(condoTag(d, TODAY), summary).toBeNull();
    }
    // A condominium named beside no condominium row is no read either.
    expect(readCondo(deal("Multifamily", apartments, { dealName: "The Aldridge Condominiums" }), TODAY)).toBeNull();
    // Named beside a condominium's own row it is, and only that row is read:
    // the building's 240 units are never taken for the units offered.
    const fractured = deal("Multifamily", [...apartments, row("HOA dues", "$650/mo")], plan("A block of rental units in a 240-unit condominium."));
    const r = readCondo(fractured, TODAY)!;
    expect(r.unitsOffered).toBeNull();
    expect(r.headline).toBe("The dues are $650 a unit a month, as stated.");
    const block = deal("Multifamily", [...apartments, row("Units offered", "42"), row("Units in condominium", "240")], plan("42 condominium units offered in bulk."));
    expect(readCondo(block, TODAY)).toMatchObject({ unitsOffered: 42, unitsInCondominium: 240, sharePct: 17.5 });
    // A class that is a condominium still reads its own count as the units offered.
    expect(readCondo(BULK, TODAY)!.unitsOffered).toBe(42);
  });

  it("says the model sells the units as one building, and hands the challenger the traps", () => {
    const r = readCondo(BULK, TODAY)!;
    expect(condoModelLine(r, { exitCapPct: 0.06 })).toBe(
      "The model sells the 42 units as one building at its 6.00% exit cap; a bulk buyer's other exit, the units sold one by one, is priced a unit at a time, which the model does not run.",
    );
    expect(condoModelLine(null, null)).toBeNull();
    const note = condoNote(r);
    for (const trap of ["(a) CONTROL AND THE VOTES", "(b) DUES, ASSESSMENTS AND RESERVES", "(c) RENTAL RESTRICTIONS", "(d) THE RETAIL EXIT", "(e) THE DEVELOPER'S LIABILITIES", "(f) TERMINATION"])
      expect(note).toContain(trap);
    expect(condoContextLine(r)).toMatch(/^Condominium units: The memorandum offers 42/);
    expect(condoTermRows([row("Special assessment", "$4,000 a unit, roof"), row("HOA dues", "$650/mo"), row("Units offered", "42")]).map((m) => m.label)).toEqual([
      "Units offered",
      "HOA dues",
      "Special assessment",
    ]);
  });

  it("writes every sentence without a glued word", () => {
    const r = readCondo(BULK, TODAY)!;
    for (const text of [r.headline, condoShortLine(r), condoContextLine(r)]) expect(gluedWords(text)).toEqual([]);
  });
});

describe("the prompt asks for what the reader reads", () => {
  it("names each condominium row by a label the reader's own pattern takes", () => {
    const prompt = extractionInstruction("auto");
    const labels: [string, RegExp][] = [
      ["Units offered", UNITS_OFFERED_ROW],
      ["Units in condominium", UNITS_IN_CONDO_ROW],
      ["HOA dues", HOA_DUES_ROW],
      ["Special assessment", SPECIAL_ASSESSMENT_ROW],
      ...STATED_ROWS.map(([label, re]) => [label, re] as [string, RegExp]),
    ];
    expect(labels).toHaveLength(9);
    for (const [label, re] of labels) {
      expect(prompt).toContain(`"${label}"`);
      expect(re.test(label), label).toBe(true);
    }
    // One unit's dues with their period, never the block's total.
    expect(prompt).toContain("one unit's dues exactly as written WITH its period");
    // Each label, as the extraction writes it, is read.
    const r = readCondo(
      deal("Condominium units (bulk sale)", [
        row("Units offered", "42"),
        row("Units in condominium", "120"),
        row("HOA dues", "$650 per unit per month"),
        row("Special assessment", "$4,000 a unit, roof replacement"),
        ...STATED_ROWS.map(([label]) => row(label, `${label} as stated`)),
      ]),
      TODAY,
    )!;
    expect(r).toMatchObject({ unitsOffered: 42, unitsInCondominium: 120, monthlyDues: 650, specialAssessment: "$4,000 a unit, roof replacement" });
    expect(r.stated.map((s) => s.label)).toEqual(STATED_ROWS.map(([label]) => label));
    // Neither count row is taken for the deal's own count.
    expect(unitCountRow([row("Units offered", "42"), row("Units in condominium", "120")])).toBeNull();
  });
});
