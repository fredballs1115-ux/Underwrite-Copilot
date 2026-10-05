import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import {
  monthlyOf,
  readValueAdd,
  valueAddContextLine,
  valueAddModelLine,
  valueAddNote,
  valueAddShortLine,
  valueAddTag,
  valueAddTermRows,
} from "./value-add";
import { gluedWords } from "./render-lint";

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = "p. 14"): Row => ({ label, value, flagged: false, page, basis: "na" });

/** A classic value-add: 192 of 248 doors left, $15,000 a door for $250,
 *  $235 proven on the 56 already done, a 24-month program in a building
 *  turning 45% a year. */
const PROGRAM = (metrics?: Row[], kind: "value_add" | "stabilized" = "value_add"): ExtractionResult =>
  ({
    dealName: "The Parkline",
    assetClass: "multifamily",
    totalPages: 40,
    strategy: { kind, summary: "", capitalBudget: "", timeline: "" },
    metrics: metrics ?? [
      row("Units", "248", "p. 2"),
      row("Units to renovate", "192"),
      row("Units renovated", "56"),
      row("Renovation cost per unit", "$15,000"),
      row("Renovation premium", "$250/month"),
      row("Achieved renovation premium", "$235"),
      row("Annual turnover", "45%"),
      row("Renovation period", "24 months"),
    ],
  }) as unknown as ExtractionResult;

describe("monthlyOf — a rent or premium a month, to the cent", () => {
  it("reads a month's figure, a year's divided, and no range", () => {
    expect(monthlyOf("$250")).toBe(250);
    expect(monthlyOf("$250/month")).toBe(250);
    expect(monthlyOf("$1,412.50")).toBe(1412.5);
    expect(monthlyOf("$3,000/yr")).toBe(250);
    expect(monthlyOf("$200-$275")).toBeNull();
    expect(monthlyOf("TBD")).toBeNull();
  });
});

describe("readValueAdd — the program as the memorandum states it", () => {
  it("reads the doors, the cost, the premium and its proof, the pace and the period", () => {
    const r = readValueAdd(PROGRAM())!;
    expect(r.doors).toBe(192);
    expect(r.renovated).toBe(56);
    expect(r.costPerDoor).toBe(15_000);
    expect(r.premium).toBe(250);
    expect(r.premiumFrom).toBe("stated");
    expect(r.achievedPremium).toBe(235);
    expect(r.turnoverPct).toBe(45);
    expect(r.programMonths).toBe(24);
    expect(r.returnOnCostPct).toBe(20);
    expect(r.turnoverNeededPct).toBe(50);
    expect(r.yearsAtTurnover).toBeCloseTo(2.222, 3);
    expect(r.totalCost).toBe(2_880_000);
    expect(r.premiumNoi).toBe(576_000);
    expect(r.page).toBe("p. 14");
  });

  it("says the return on cost, the proof against the pro forma, and what the period asks of turnover", () => {
    const r = readValueAdd(PROGRAM())!;
    // The doors left, said as the doors still to do beside the 56 done, so
    // the read and the panel's bar of 248 name one program (research pass
    // 36); the cost is still the 192 doors' at $15,000.
    expect(r.headline).toBe(
      "The program renovates the 192 doors still to do at $15,000 each for $250 a month more rent: 20% a year on the cost of every door once it is done, $2.88M in all. " +
        "On the 56 doors already renovated, the premium achieved is $235 a month, as stated — under the $250 the program is priced on. " +
        "A 24-month program needs 50% of the classic units to turn each year, since a unit is renovated when its tenant leaves. " +
        "The building turns 45% a year, as stated: at that pace the program takes 2.2 years.",
    );
    expect(gluedWords(r.headline)).toEqual([]);
  });

  it("takes the premium from the two rents where none is stated, and names an unproven one", () => {
    const r = readValueAdd(
      PROGRAM([row("Units to renovate", "120"), row("Renovation cost per unit", "$12,000"), row("Classic rent", "$1,400"), row("Renovated rent", "$1,600")]),
    )!;
    expect(r.premium).toBe(200);
    expect(r.premiumFrom).toBe("rents");
    // No door is stated done: the doors left are the whole program.
    expect(r.headline).toContain("The program renovates 120 doors at $12,000 each");
    expect(r.headline).toContain("The premium is the renovated rent of $1,600 less the classic rent of $1,400, as stated.");
    expect(r.headline).toContain("No premium achieved on renovated units is stated: the premium is a projection until a door proves it.");
    expect(r.turnoverNeededPct).toBeNull();
  });

  it("nothing on a deal with no program, or a stabilized deal that states none", () => {
    expect(readValueAdd(PROGRAM([row("Units", "248")]))).toBeNull();
    expect(readValueAdd(PROGRAM([row("Units", "248")], "stabilized"))).toBeNull();
    expect(readValueAdd(null)).toBeNull();
    // A stabilized deal whose memorandum does state a program is read.
    expect(readValueAdd(PROGRAM(undefined, "stabilized"))?.doors).toBe(192);
  });
});

describe("the program on every summary", () => {
  it("the model line: what a door is worth at the exit cap, the break-even, and the premium the model does not carry", () => {
    const r = readValueAdd(PROGRAM())!;
    const line = valueAddModelLine(r, { holdMonths: 60, exitCapPct: 0.055, capitalYr1: 2_880_000, rentGrowthPct: 0.03 });
    expect(line).toBe(
      "At the model's 5.50% exit cap a door's premium is worth $54,545 against its $15,000 cost — $39,545 a door, $7.59M across the 192 doors still to do, and the premium breaks even at $68.75 a month. " +
        "The screening model spends $2.88M of capital in its first year and grows today's rent at 3.0%: the premium is in none of its returns, so its IRR is not the program's.",
    );
    expect(gluedWords(line)).toEqual([]);
    // With no door stated done, the doors left are the program.
    const whole = readValueAdd(PROGRAM([row("Units to renovate", "192"), row("Renovation cost per unit", "$15,000"), row("Renovation premium", "$250")]))!;
    expect(valueAddModelLine(whole, { holdMonths: 60, exitCapPct: 0.055, capitalYr1: 2_880_000, rentGrowthPct: 0.03 })).toContain(
      "$39,545 a door, $7.59M across the program,",
    );
  });

  it("the tag, the short line, the context, the traps and the key terms", () => {
    expect(valueAddTag(PROGRAM())).toBe("Reno $250/mo, 20% on cost");
    const r = readValueAdd(PROGRAM())!;
    expect(valueAddShortLine(r)).toBe(
      "Value-add program: 192 doors to renovate; $15,000 a door; $250 a month premium (20% on cost); $235 achieved on renovated units; 24-month program",
    );
    expect(valueAddContextLine(r).startsWith("The renovation program: The program renovates the 192 doors still to do")).toBe(true);
    const note = valueAddNote(r);
    expect(note).toContain("VALUE-ADD TRAPS, checked by name");
    expect(note).toContain("(a) THE PREMIUM'S PROOF — the $235 achieved on renovated units");
    expect(note).toContain("(c) THE PACE");
    expect(valueAddTermRows(PROGRAM().metrics).map((m) => m.label)).toEqual([
      "Units to renovate",
      "Renovation cost per unit",
      "Renovation premium",
      "Achieved renovation premium",
    ]);
  });

  it("the prompt asks for the rows the reader reads, by their labels", () => {
    const prompt = extractionInstruction("multifamily" as never);
    for (const label of [
      '"Units to renovate"',
      '"Units renovated"',
      '"Renovation cost per unit"',
      '"Renovation premium"',
      '"Achieved renovation premium"',
      '"Classic rent"',
      '"Renovated rent"',
      '"Annual turnover"',
      '"Renovation period"',
    ]) {
      expect(prompt).toContain(label);
    }
  });
});
