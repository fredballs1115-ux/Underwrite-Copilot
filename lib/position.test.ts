import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import {
  ACCRUAL_ROW,
  CURRENT_PAY_ROW,
  EXTENSION_ROW,
  PREF_AMOUNT_ROW,
  PREF_RETURN_ROW,
  REDEMPTION_ROW,
  REMEDIES_ROW,
  SENIOR_BALANCE_ROW,
  SENIOR_MATURITY_ROW,
  VALUE_ROW,
  isPreferredEquity,
  positionCaption,
  positionModelLine,
  positionNote,
  positionTag,
  positionTermRows,
  readPosition,
  readPositionTerms,
} from "./position";

const metric = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 4", basis: "na" as const });
const ex = (metrics: ExtractionResult["metrics"], kind?: string): ExtractionResult =>
  ({ metrics, interest: kind ? { kind, summary: "" } : undefined }) as unknown as ExtractionResult;

const ON = new Date("2026-10-05T12:00:00Z");
// Research pass 28's example: a $15M position at a 12% preferred return, 8%
// of it paid in cash, behind a $52M senior loan on an $80M stated value.
const PREF = ex(
  [
    metric("Preferred equity amount", "$15,000,000"),
    metric("Preferred return", "12% preferred return, 8% current pay"),
    metric("Current pay rate", "8.0%"),
    metric("Mandatory redemption date", "June 2029"),
    metric("Senior loan balance", "$52,000,000"),
    metric("Senior loan maturity", "December 2029"),
    metric("Whole-asset value", "$80,000,000"),
    metric("Remedies", "Pledge of the sponsor's membership interests; removal of the managing member on a default."),
  ],
  "preferred_equity",
);

describe("a preferred equity position, read as a position (research pass 28, round 5)", () => {
  it("reads its terms only as stated, the accrual as the preferred return less the current pay", () => {
    const t = readPositionTerms(PREF);
    expect(t).toMatchObject({
      amount: 15_000_000,
      currentPayPct: 8,
      accrualPct: 4,
      accrualDerived: true,
      compounds: null,
      redemption: "2029-06-30",
      redemptionIsMonth: true,
      seniorBalance: 52_000_000,
      seniorMaturity: "2029-12-01",
      value: 80_000_000,
    });
    // Two different percentages in one row are no one rate.
    expect(readPositionTerms(ex([metric("Current pay rate", "8% rising to 9%")])).currentPayPct).toBeNull();
  });

  it("solves its yield on its own payments, the accrual read as simple where its compounding is not stated", () => {
    const r = readPosition(PREF, 15_000_000, ON)!;
    expect(r.monthsLeft).toBe(32);
    expect(r.currentPayYear).toBe(1_200_000);
    expect(r.accruedSimple).toBeCloseTo(1_600_000, 0);
    expect(r.accruedCompound!).toBeGreaterThan(r.accruedSimple!);
    // Simple accrual over a par price: under the 12% stated, since the
    // accrued return earns nothing while it waits.
    expect(r.yieldPct!).toBeGreaterThan(11);
    expect(r.yieldPct!).toBeLessThan(12);
    // The last dollar on the side that does not flatter: compounding.
    expect(r.attachmentPct).toBeCloseTo(65, 6);
    expect(r.detachmentTodayPct).toBeCloseTo(83.75, 6);
    expect(r.detachmentPct!).toBeCloseTo(((52_000_000 + 15_000_000 + r.accruedCompound!) / 80_000_000) * 100, 6);
    expect(r.headline).toMatch(/^A preferred equity position of \$15\.0M at 8\.00% current pay and 4\.00% accruing \(the preferred return less the current pay\), to be redeemed by Jun 2029: 1[01]\.\d% to redemption at its \$15\.0M price\.$/);
    const said = r.sentences.join(" ");
    expect(said).toContain("Current pay is cash and accrual a promise: $1.20M a year is paid in cash");
    expect(said).toContain("the memorandum does not say, so the yield is read as simple, the lower, and the last dollar as compounding, the higher");
    expect(said).toContain("first dollar sits at 65.0%");
    expect(said).toContain("(83.8% today)");
    expect(said).toContain("It redeems 5 months before the senior loan matures (Dec 2029)");
    expect(said).toContain("Remedies, as stated: Pledge of the sponsor's membership interests; removal of the managing member on a default.");
  });

  it("compounding at its preferred return, a position bought at par earns exactly that return", () => {
    const compounding = ex(
      [...PREF.metrics.filter((m) => m.label !== "Preferred return"), metric("Accrual rate", "4.0%, compounding")],
      "preferred_equity",
    );
    const r = readPosition(compounding, 15_000_000, ON)!;
    expect(r.yieldPct!).toBeCloseTo(12, 6);
    // Bought at a discount, it earns more; at a premium, less.
    expect(readPosition(compounding, 14_000_000, ON)!.yieldPct!).toBeGreaterThan(12);
    expect(readPosition(compounding, 15_500_000, ON)!.yieldPct!).toBeLessThan(12);
  });

  it("compounds where the words say so, and the yield rises with it", () => {
    const compounding = ex(
      [...PREF.metrics.filter((m) => m.label !== "Preferred return"), metric("Accrual rate", "4.0%, compounding monthly")],
      "preferred_equity",
    );
    const simple = readPosition(PREF, 15_000_000, ON)!;
    const r = readPosition(compounding, 15_000_000, ON)!;
    expect(r.terms.compounds).toBe(true);
    expect(r.terms.accrualDerived).toBe(false);
    expect(r.yieldPct!).toBeGreaterThan(simple.yieldPct!);
    expect(r.sentences.join(" ")).toContain("accrues, compounding, to be paid at redemption");
  });

  it("calls a redemption date gone by a default, never a yield", () => {
    const r = readPosition(PREF, 15_000_000, new Date("2029-08-01T12:00:00Z"))!;
    expect(r.redeemedPast).toBe(true);
    expect(r.yieldPct).toBeNull();
    expect(r.headline).toContain("its mandatory redemption date has gone by");
    expect(positionTag(r)).toBe("Pref equity, past redemption");
    // Inside the stated month it is due, not past.
    expect(readPosition(PREF, 15_000_000, new Date("2029-06-15T12:00:00Z"))!.redeemedPast).toBe(false);
  });

  it("says under its figures how long it runs and on what accrual its yield was read, or that its date has gone by", () => {
    // Not stated whether it compounds: the yield read as simple, said so.
    expect(positionCaption(readPosition(PREF, 14_000_000, ON))).toBe(
      "32 months to its Jun 2029 redemption, the accrual read as simple, the lower yield — the memorandum does not say whether it compounds.",
    );
    const compounding = ex(
      [...PREF.metrics.filter((m) => m.label !== "Preferred return"), metric("Accrual rate", "4.0%, compounding monthly")],
      "preferred_equity",
    );
    expect(positionCaption(readPosition(compounding, 14_000_000, ON))).toBe("32 months to its Jun 2029 redemption, the accrual compounding, as stated.");
    // A position paying its current pay alone: no accrual to read.
    const cashOnly = ex(PREF.metrics.filter((m) => m.label !== "Preferred return"), "preferred_equity");
    expect(positionCaption(readPosition(cashOnly, 14_000_000, ON))).toBe(
      "32 months to its Jun 2029 redemption, on its current pay alone — the memorandum states no accrual.",
    );
    // Past its date: a default, not a yield; inside its stated month, due.
    expect(positionCaption(readPosition(PREF, 14_000_000, new Date("2029-08-01T12:00:00Z")))).toBe(
      "Its Jun 2029 redemption date has gone by: unredeemed, that is a default to be cured under the remedies, not a yield.",
    );
    expect(positionCaption(readPosition(PREF, 14_000_000, new Date("2029-06-15T12:00:00Z")))).toBe("Due this month, at its Jun 2029 redemption.");
    // No date stated: no yield to give, said; nothing at all with nothing read.
    const undated = ex(PREF.metrics.filter((m) => m.label !== "Mandatory redemption date"), "preferred_equity");
    expect(positionCaption(readPosition(undated, 14_000_000, ON))).toBe("The memorandum states no redemption date, so there is no yield to redemption to give.");
    expect(positionCaption(null)).toBe("");
  });

  it("reads no stack without the senior balance, and says why", () => {
    const bare = ex(PREF.metrics.filter((m) => !/^Senior loan balance$/.test(m.label)), "preferred_equity");
    const r = readPosition(bare, 15_000_000, ON)!;
    expect(r.attachmentPct).toBeNull();
    expect(r.detachmentPct).toBeNull();
    expect(r.sentences.join(" ")).toContain("The memorandum states no senior loan balance");
  });

  it("is a position only where the memorandum sells one", () => {
    expect(isPreferredEquity(PREF)).toBe(true);
    // Its rows beside a rate are enough before the interest is read.
    // A share filed before the kind was asked, whose rows say a position.
    expect(isPreferredEquity(ex(PREF.metrics, "partial_interest"))).toBe(true);
    // Never a fee simple's rows, nor an extraction that read no interest: a
    // memorandum can describe a capital stack it does not sell.
    expect(isPreferredEquity(ex(PREF.metrics, "fee_simple"))).toBe(false);
    expect(isPreferredEquity(ex(PREF.metrics))).toBe(false);
    expect(isPreferredEquity(ex([metric("Asking price", "$40,000,000")], "partial_interest"))).toBe(false);
    expect(readPosition(ex([metric("Asking price", "$40,000,000")]), 40_000_000, ON)).toBeNull();
  });

  it("says its tag, its model line, its traps and its rows", () => {
    const r = readPosition(PREF, 15_000_000, ON)!;
    expect(positionTag(r)).toBe("Pref equity, 12% to Jun 2029");
    expect(positionModelLine(r)).toMatch(/^The property model runs the whole building at the position's price; that is not this position's return — its yield to redemption is 1[01]\.\d% and its last dollar sits at 86\.\d% of the stated value\.$/);
    const note = positionNote(r);
    expect(note).toContain("What is being sold: a preferred equity position in the owning entity");
    for (const trap of ["(a) THE STACK", "(b) THE REDEMPTION", "(c) CURRENT VS ACCRUED", "(d) REMEDIES AND THE SENIOR LENDER", "(e) THE SPONSOR", "(f) THE EXIT ORDER"]) {
      expect(note).toContain(trap);
    }
    expect(positionTermRows(PREF.metrics).map((m) => m.label)).toEqual([
      "Preferred equity amount",
      "Preferred return",
      "Current pay rate",
      "Mandatory redemption date",
      "Senior loan balance",
      "Remedies",
    ]);
  });
});

// The extraction asks for each row this reads, by the reader's own labels,
// and files the position as its own kind (lib/interest reads it from there).
describe("the extraction asks for the rows a position is read from", () => {
  it("names every row by a label the reader takes, and the kind", async () => {
    const { extractionInstruction } = await import("./anthropic/prompts");
    const prompt = extractionInstruction("multifamily");
    expect(prompt).toContain('"preferred_equity" (a PREFERRED EQUITY position in the owning entity');
    const rows: [string, RegExp][] = [
      ["Preferred equity amount", PREF_AMOUNT_ROW],
      ["Preferred return", PREF_RETURN_ROW],
      ["Current pay rate", CURRENT_PAY_ROW],
      ["Accrual rate", ACCRUAL_ROW],
      ["Mandatory redemption date", REDEMPTION_ROW],
      ["Senior loan balance", SENIOR_BALANCE_ROW],
      ["Senior loan maturity", SENIOR_MATURITY_ROW],
      ["Whole-asset value", VALUE_ROW],
      ["Extension options", EXTENSION_ROW],
      ["Remedies", REMEDIES_ROW],
    ];
    for (const [label, re] of rows) {
      expect(prompt, label).toContain(`"${label}"`);
      expect(re.test(label), label).toBe(true);
    }
    // Each label is read by its own row and by no other's.
    for (const [label, own] of rows) for (const [, re] of rows) if (re !== own) expect(re.test(label), `${label} vs ${re}`).toBe(false);
  });
});
