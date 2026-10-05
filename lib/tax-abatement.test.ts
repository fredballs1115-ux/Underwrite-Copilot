import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import {
  readTaxAbatement,
  taxAbatementContextLine,
  taxAbatementModelLine,
  taxAbatementNote,
  taxAbatementShortLine,
  taxAbatementTag,
  taxAbatementTermRows,
  taxBillOf,
} from "./tax-abatement";
import { gluedWords } from "./render-lint";

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = "p. 9"): Row => ({ label, value, flagged: false, page, basis: "na" });
const AS_OF = new Date(Date.UTC(2026, 8, 30));

/** A Philadelphia new-build on its ten-year abatement: $70,000 paid today
 *  against a $520,000 full bill, the abatement ending as 2031 opens. */
const ABATED = (extra: Row[] = [], assetClass = "multifamily", base?: Row[]): ExtractionResult =>
  ({
    dealName: "The Fairmount",
    assetClass,
    totalPages: 40,
    metrics: [
      ...(base ?? [
        row("Asking price", "$55,000,000", "p. 3"),
        row("NOI (in-place)", "$3,000,000", "p. 12"),
        row("Going-in cap rate", "5.50%", "p. 3"),
        row("Tax abatement", "10-year Philadelphia tax abatement"),
        row("Tax abatement expiration", "2031"),
        row("Abated real estate taxes", "$70,000"),
        row("Unabated real estate taxes", "$520,000"),
      ]),
      ...extra,
    ],
  }) as unknown as ExtractionResult;

describe("taxBillOf — a year's bill as stated", () => {
  it("reads a bill and refuses a range or a figure per unit", () => {
    expect(taxBillOf("$520,000")).toBe(520_000);
    expect(taxBillOf("$520k")).toBe(520_000);
    expect(taxBillOf("$2,100/unit")).toBeNull();
    expect(taxBillOf("$4.10 psf")).toBeNull();
    expect(taxBillOf("$450,000–$520,000")).toBeNull();
    expect(taxBillOf("TBD")).toBeNull();
  });

  it("reads a bill with a hyphenated span of years or phases after it (audit C5, MED-4)", () => {
    expect(taxBillOf("$450,000 (years 1-10 of the PILOT)")).toBe(450_000);
    expect(taxBillOf("$1,250,000 (Phase 1-2)")).toBe(1_250_000);
  });

  it("reads a bill with a hyphenated word beside the figure (research pass 37)", () => {
    // "$410,000 (2025-26)" had read as no bill, and the panel said the
    // memorandum states no full tax bill.
    expect(taxBillOf("$410,000 (2025-26)")).toBe(410_000);
    expect(taxBillOf("$42,000 (post-abatement)")).toBe(42_000);
    expect(taxBillOf("$450,000-$520,000")).toBeNull();
    // A year after a dash is words after the bill, never a range's other end
    // (audit C3a), and so is a span of years written with an en dash.
    expect(taxBillOf("$520,500 – 2026 estimate")).toBe(520_500);
    expect(taxBillOf("$520,500 — 2025 actual")).toBe(520_500);
    expect(taxBillOf("$520,500 (2025–26 levy)")).toBe(520_500);
    expect(taxBillOf("$450,000 – $520,000")).toBeNull();
    const r = readTaxAbatement(
      ABATED([], "multifamily", [
        row("NOI (in-place)", "$1,650,000"),
        row("Tax abatement", "10-year Philadelphia tax abatement"),
        row("Tax abatement expiration", "December 31, 2029"),
        row("Abated real estate taxes", "$42,000 (2025-26)"),
        row("Unabated real estate taxes", "$410,000 (2025-26)"),
      ]),
      AS_OF,
    )!;
    expect(r.abatedTaxes).toBe(42_000);
    expect(r.unabatedTaxes).toBe(410_000);
    expect(r.stepUp).toBe(368_000);
    expect(r.headline).not.toContain("states no full tax bill");
  });
});

describe("readTaxAbatement — the abatement as the memorandum states it", () => {
  it("reads the program, the end as the year opens, the two bills, and the step-up against the NOI and the price", () => {
    const r = readTaxAbatement(ABATED(), AS_OF)!;
    expect(r.program).toBe("10-year Philadelphia tax abatement");
    expect(r.end).toMatchObject({ ends: "2031-01-01", from: "year" });
    expect(r.end!.yearsLeft).toBeCloseTo(51 / 12, 6);
    expect(r.abatedTaxes).toBe(70_000);
    expect(r.unabatedTaxes).toBe(520_000);
    expect(r.stepUp).toBe(450_000);
    expect(r.stepUpFrom).toBe("bills");
    expect(r.stepUpPctOfNoi).toBeCloseTo(15, 6);
    expect(r.priceAtCap).toBeCloseTo(450_000 / 0.055, 3);
    expect(r.ownerPays).toBe(true);
    expect(r.page).toBe("p. 9");
    expect(r.headline).toBe(
      "The property's taxes are abated under its 10-year Philadelphia tax abatement until 2031, 4.3 years from today. " +
        "The full bill is $520,000 a year against the $70,000 paid today, as stated: $450,000 a year more once it ends, 15% of the in-place NOI. " +
        "At the 5.50% going-in cap it is $8.18M of the price.",
    );
    expect(gluedWords(r.headline)).toEqual([]);
  });

  it("counts a term from its stated start, takes stated savings where no bills are, and says an unknown step-up", () => {
    const base = [row("NOI (in-place)", "$3,000,000"), row("Tax abatement", "PILOT"), row("Tax abatement expiration", "15 years from 2019")];
    const counted = readTaxAbatement(ABATED([row("Annual tax abatement savings", "$450,000")], "multifamily", base), AS_OF)!;
    expect(counted.end).toMatchObject({ ends: "2034-01-01", from: "term" });
    expect(counted.headline).toContain("abated under its PILOT until 2034 (15 years from 2019, counted from its stated start)");
    expect(counted.stepUpFrom).toBe("savings");
    expect(counted.headline).toContain("The memorandum states the abatement saves $450,000 a year: that much more once it ends, 15% of the in-place NOI.");
    const unknown = readTaxAbatement(ABATED([], "multifamily", base), AS_OF)!;
    expect(unknown.stepUp).toBeNull();
    expect(unknown.headline).toContain("The memorandum states no full tax bill, so the step-up when the abatement ends is not known");
  });

  it("an abatement already over by its own date, and a phase-out as stated", () => {
    const r = readTaxAbatement(
      ABATED([], "multifamily", [row("Tax abatement", "421-a"), row("Tax abatement expiration", "June 30, 2024"), row("Tax abatement phase-out", "20% a year from 2022")]),
      AS_OF,
    )!;
    expect(r.end!.yearsLeft).toBeLessThan(0);
    expect(r.headline).toContain("The abatement under its 421-a ended Jun 2024 by the memorandum's own date: the trailing figures may still carry abated months.");
    expect(r.headline).toContain("It steps down as stated: 20% a year from 2022.");
    expect(taxAbatementTag(ABATED([], "multifamily", [row("Tax abatement expiration", "2024")]), AS_OF)).toBe("Abatement ended");
  });

  it("says who pays the step-up where the leases may pass taxes through", () => {
    const r = readTaxAbatement(ABATED([], "office"), AS_OF)!;
    expect(r.ownerPays).toBe(false);
    expect(r.headline).toContain("On leases that pass taxes through, the tenants pay the step-up");
  });

  it("nothing where the memorandum states none, or says there is none", () => {
    expect(readTaxAbatement(ABATED([], "multifamily", [row("NOI (in-place)", "$3,000,000")]), AS_OF)).toBeNull();
    expect(readTaxAbatement(ABATED([], "multifamily", [row("Tax abatement", "None"), row("Tax abatement expiration", "N/A")]), AS_OF)).toBeNull();
    expect(readTaxAbatement(null, AS_OF)).toBeNull();
    // A bare "Yes" says there is one, and names nothing.
    expect(readTaxAbatement(ABATED([], "multifamily", [row("Tax abatement", "Yes"), row("Tax abatement expiration", "2031")]), AS_OF)?.program).toBe("");
  });
});

describe("the abatement on every summary", () => {
  it("the model line: where the abatement ends against the model's sale, and the step-up at its exit cap", () => {
    const inHold = readTaxAbatement(ABATED(), AS_OF)!;
    const line = taxAbatementModelLine(inHold, { holdMonths: 60, exitCapPct: 0.055, expenseGrowthPct: 0.03 });
    expect(line).toBe(
      "The model grows today's abated taxes at 3.0% a year with the rest of its expenses: the abatement ends 2031, 4.3 years into its 5-year hold, so its exit is struck on a NOI the building no longer earns — the step-up is $8.18M of value at its 5.50% exit cap.",
    );
    expect(gluedWords(line)).toEqual([]);
    const after = readTaxAbatement(ABATED([row("Tax abatement expiration", "2035")], "multifamily", [row("Unabated real estate taxes", "$520,000"), row("Abated real estate taxes", "$70,000")]), AS_OF)!;
    expect(taxAbatementModelLine(after, { holdMonths: 60, exitCapPct: 0.055, expenseGrowthPct: 0.03 })).toContain(
      "the abatement ends 2035, 3.3 years after its sale, so the next buyer takes the step-up and prices it while the model's exit is struck on abated taxes",
    );
  });

  it("the tag, the short line, the context, the traps and the key terms", () => {
    expect(taxAbatementTag(ABATED(), AS_OF)).toBe("Tax abated, 4 yrs left, +$450k/yr");
    const r = readTaxAbatement(ABATED(), AS_OF)!;
    expect(taxAbatementShortLine(r)).toBe(
      "Tax abatement: 10-year Philadelphia tax abatement; ends 2031, 4.3 years from today; $450,000 a year more once it ends (15% of the in-place NOI)",
    );
    expect(taxAbatementContextLine(r).startsWith("The tax abatement: The property's taxes are abated")).toBe(true);
    expect(taxAbatementContextLine(r).endsWith("(p. 9)")).toBe(true);
    const note = taxAbatementNote(r);
    expect(note).toContain("TAX-ABATEMENT TRAPS, checked by name");
    expect(note).toContain("(a) THE NOI IS ON ABATED TAXES — $450,000 a year, 15% of the in-place NOI");
    expect(note).toContain("(c) THE TRANSFER");
    expect(taxAbatementTermRows(ABATED().metrics).map((m) => m.label)).toEqual([
      "Tax abatement",
      "Tax abatement expiration",
      "Unabated real estate taxes",
    ]);
  });

  it("the prompt asks for the rows the reader reads, by their labels", () => {
    const prompt = extractionInstruction("multifamily" as never);
    for (const label of [
      '"Tax abatement"',
      '"Tax abatement expiration"',
      '"Abated real estate taxes"',
      '"Unabated real estate taxes"',
      '"Annual tax abatement savings"',
      '"Tax abatement phase-out"',
    ]) {
      expect(prompt).toContain(label);
    }
  });
});
