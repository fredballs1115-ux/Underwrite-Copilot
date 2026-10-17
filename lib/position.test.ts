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

  it("reads its amounts with a hyphenated word beside the figure (research pass 37)", () => {
    // Any hyphen in the value had read as no amount.
    const t = readPositionTerms(
      ex([
        metric("Preferred equity amount", "$15,000,000 (fully-funded at closing)"),
        metric("Senior loan balance", "$52,000,000 (non-recourse CMBS)"),
        metric("Whole-asset value", "$80,000,000 (as-is)"),
      ]),
    );
    expect(t).toMatchObject({ amount: 15_000_000, seniorBalance: 52_000_000, value: 80_000_000 });
    expect(readPositionTerms(ex([metric("Preferred equity amount", "$15M - $17M")])).amount).toBeNull();
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

// The batch audit: a current pay the memorandum does not state was run as
// zero — "nothing is paid in cash", a 3.8% yield to redemption and the tag
// "Pref equity, 4% to Jun 2029" — though the total and the accrual beside it
// gave an 8% current pay.
describe("a current pay the memorandum does not state", () => {
  const position = (...rows: ExtractionResult["metrics"]) =>
    ex([metric("Preferred equity amount", "$10,000,000"), ...rows, metric("Mandatory redemption date", "June 2029")], "preferred_equity");

  it("is the preferred return less the accrual, said as derived, where both are stated", () => {
    for (const rows of [[metric("Preferred return", "12%"), metric("Accrual rate", "4%")], [metric("Preferred return", "12%, of which 4% accrues")]]) {
      const r = readPosition(position(...rows), 10_000_000, ON)!;
      expect(r.terms).toMatchObject({ totalPct: 12, currentPayPct: 8, currentPayDerived: true, accrualPct: 4, accrualDerived: false });
      expect(r.currentPayYear).toBe(800_000);
      expect(r.headline).toContain("at 8.00% current pay (the preferred return less the accrual) and 4.00% accruing");
      expect(r.yieldPct!).toBeGreaterThan(11);
      expect(r.yieldPct!).toBeLessThan(12);
      expect(r.sentences.join(" ")).toContain("Current pay is cash and accrual a promise: $800k a year is paid in cash");
      expect(positionTag(r)).toBe("Pref equity, 12% to Jun 2029");
    }
  });

  it("reads \"N% current\" as the current pay, with or without \"pay\"", () => {
    const r = readPosition(position(metric("Preferred return", "12% (8% current, 4% accrued)")), 10_000_000, ON)!;
    expect(r.terms).toMatchObject({ totalPct: 12, currentPayPct: 8, currentPayDerived: false, accrualPct: 4, accrualDerived: false });
    expect(r.headline).toMatch(/^A preferred equity position of \$10\.0M at 8\.00% current pay and 4\.00% accruing, to be redeemed by Jun 2029: 11\.\d% to redemption/);
    expect(positionTag(r)).toBe("Pref equity, 12% to Jun 2029");
  });

  it("says the memorandum states none where it does not, and withholds the yield and the tag's rate rather than run them at zero", () => {
    const r = readPosition(position(metric("Accrual rate", "4%")), 10_000_000, ON)!;
    expect(r.terms.currentPayPct).toBeNull();
    expect(r.yieldPct).toBeNull();
    expect(r.currentPayYear).toBeNull();
    expect(r.currentYieldPct).toBeNull();
    expect(r.headline).toBe(
      "A preferred equity position of $10.0M at 4.00% accruing, to be redeemed by Jun 2029: the memorandum states no current pay, so no yield to redemption is read.",
    );
    const said = r.sentences.join(" ");
    expect(said).toContain("Current pay is cash and accrual a promise: the memorandum states no current pay; $1.07M accrues to be paid at redemption, not counting any compounding.");
    expect(said).not.toContain("nothing is paid in cash");
    expect(positionTag(r)).toBe("Pref equity to Jun 2029");
    expect(positionCaption(r)).toBe("32 months to its Jun 2029 redemption; the memorandum states no current pay, so no yield to redemption is read.");
    // A preferred return stated in all, its parts not: said, and the tag's
    // rate is the return stated.
    const whole = readPosition(position(metric("Preferred return", "12%")), 10_000_000, ON)!;
    expect(whole.yieldPct).toBeNull();
    expect(whole.headline).toBe(
      "A preferred equity position of $10.0M at a 12.00% preferred return, to be redeemed by Jun 2029: the memorandum does not split its preferred return into current pay and accrual, so no yield to redemption is read.",
    );
    expect(positionCaption(whole)).toBe(
      "32 months to its Jun 2029 redemption; the memorandum does not split its preferred return into current pay and accrual, so no yield to redemption is read.",
    );
    expect(positionTag(whole)).toBe("Pref equity, 12% to Jun 2029");
    // A current pay the words state as none is a zero, and the yield is read.
    for (const zero of [[metric("Current pay rate", "0%"), metric("Accrual rate", "12%")], [metric("Preferred return", "12%, fully accruing")]]) {
      const z = readPosition(position(...zero), 10_000_000, ON)!;
      expect(z.terms.currentPayPct).toBe(0);
      expect(z.yieldPct).not.toBeNull();
      expect(z.sentences.join(" ")).toContain("nothing is paid in cash");
    }
  });

  it("reads a return said to be paid on a schedule as current pay, and a shortfall's accrual as a shortfall's (audit C3a)", () => {
    // Each had read "the memorandum states no current pay".
    for (const words of ["12%, paid monthly", "12% preferred return, paid currently", "12% per annum, payable quarterly in arrears"]) {
      const r = readPosition(position(metric("Preferred return", words)), 10_000_000, ON)!;
      expect(r.terms, words).toMatchObject({ totalPct: 12, currentPayPct: 12, currentPayDerived: false, accrualPct: null });
      expect(r.currentPayYear, words).toBe(1_200_000);
      expect(r.yieldPct!.toFixed(1), words).toBe("12.0");
      expect(r.headline, words).not.toContain("states no current pay");
      expect(positionCaption(r), words).toBe("32 months to its Jun 2029 redemption, on its current pay alone — the memorandum states no accrual.");
    }
    // "Any shortfall accrues in full" is said of a shortfall: 12% current,
    // never 0% current and 12% accruing.
    const shortfall = readPosition(position(metric("Preferred return", "12%, paid current; any shortfall accrues in full")), 10_000_000, ON)!;
    expect(shortfall.terms).toMatchObject({ currentPayPct: 12, accrualPct: null, shortfallAccrues: true });
    expect(shortfall.yieldPct!.toFixed(1)).toBe("12.0");
    expect(shortfall.headline).toMatch(/^A preferred equity position of \$10\.0M at 12\.00% current pay, to be redeemed by Jun 2029: 12\.0% to redemption/);
    expect(shortfall.sentences.join(" ")).toContain("$1.20M a year is paid in cash; any shortfall in it accrues, as stated");
    // A part paid on a schedule is the current part beside an accrual.
    const parts = readPosition(position(metric("Preferred return", "12%: 8% paid monthly, 4% accrues")), 10_000_000, ON)!;
    expect(parts.terms).toMatchObject({ currentPayPct: 8, accrualPct: 4 });
  });

  it("reads a shortfall's clause after a comma as the clause alone, and accrued-and-unpaid amounts as the accrual's (audit C5, MED-5)", () => {
    // Each had read no split at all: "does not split its preferred return".
    for (const [words, current] of [
      ["12% preferred return, paid monthly, with any shortfall accruing", 12],
      ["12.5% paid monthly, any unpaid amount accrues and compounds", 12.5],
    ] as const) {
      const r = readPosition(position(metric("Preferred return", words)), 10_000_000, ON)!;
      expect(r.terms, words).toMatchObject({ currentPayPct: current, accrualPct: null, shortfallAccrues: true });
      expect(r.sentences.join(" "), words).not.toContain("does not split");
      expect(r.sentences.join(" "), words).toContain("a year is paid in cash; any shortfall in it accrues, as stated");
    }
    // Accrued and unpaid amounts compounding are the accrual's terms, never a
    // shortfall the memorandum states.
    const parts = readPosition(
      position(metric("Preferred return", "12% (8% current, 4% accrued; accrued and unpaid amounts compound monthly)")),
      10_000_000,
      ON,
    )!;
    expect(parts.terms).toMatchObject({ totalPct: 12, currentPayPct: 8, accrualPct: 4, shortfallAccrues: false, compounds: true });
    expect(parts.sentences.join(" ")).not.toContain("any shortfall");
  });

  it("reads a part paid currently beside a shortfall as that part, the rest accruing (audit C6, MED-2)", () => {
    // The first had read 12% current pay ("$1.80M a year is paid in cash"),
    // the second "does not split its preferred return".
    for (const words of [
      "12% preferred return, of which 8% is paid currently, any shortfall accruing",
      "12% preferred return, with 8% paid currently and any shortfall accruing",
    ]) {
      const r = readPosition(position(metric("Preferred return", words)), 10_000_000, ON)!;
      expect(r.terms, words).toMatchObject({ totalPct: 12, currentPayPct: 8, currentPayDerived: false, accrualPct: 4, accrualDerived: true });
      expect(r.currentPayYear, words).toBe(800_000);
      const said = [r.headline, ...r.sentences].join(" ");
      expect(said, words).toContain("8.00% current pay and 4.00% accruing (the preferred return less the current pay)");
      expect(said, words).toContain("$800k a year is paid in cash");
      expect(said, words).not.toContain("does not split");
      expect(said, words).not.toContain("$1.20M a year is paid in cash");
    }
  });
});

// The second pre-merge audit's items on a position (MED-1, LOW-1 to LOW-5,
// and the first audit's L1).
describe("a position's parts, dates and stack, each said as it is", () => {
  const swap = (rows: ExtractionResult["metrics"], ...labels: string[]) =>
    ex([...PREF.metrics.filter((m) => !labels.includes(m.label)), ...rows], "preferred_equity");

  it("reads its parts after a slash or a colon as 8% current of 12%, and solves 11.4% at par (MED-1)", () => {
    for (const words of ["12% (8% current / 4% accrual)", "12% preferred return: 8% current, 4% accrued"]) {
      const r = readPosition(
        ex([metric("Preferred equity amount", "$15,000,000"), metric("Preferred return", words), metric("Mandatory redemption date", "June 2029")], "preferred_equity"),
        15_000_000,
        ON,
      )!;
      expect(r.terms, words).toMatchObject({ totalPct: 12, currentPayPct: 8, currentPayDerived: false, accrualPct: 4 });
      expect(r.yieldPct!.toFixed(1), words).toBe("11.4");
      expect(r.currentPayYear, words).toBe(1_200_000);
      expect(positionTag(r), words).toBe("Pref equity, 12% to Jun 2029");
      expect(r.sentences.join(" "), words).not.toContain("nothing is paid in cash");
    }
  });

  it("says a redemption in the senior loan's own month as the same month, its side by the day, and one month as one (LOW-1)", () => {
    const said = (redemption: string, maturity: string) =>
      readPosition(swap([metric("Mandatory redemption date", redemption), metric("Senior loan maturity", maturity)], "Mandatory redemption date", "Senior loan maturity"), 15_000_000, ON)!.sentences.join(" ");
    // Both a month alone: one month, its order not read.
    const months = said("June 2029", "June 2029");
    expect(months).toContain("It redeems in the same month as the senior loan matures (Jun 2029): the sponsor must refinance or sell to its last dollar by then.");
    // Both to the day, the redemption after: said after, never "0 months before".
    const after = said("June 30, 2029", "June 1, 2029");
    expect(after).toContain("It redeems after the senior loan matures (Jun 2029), in the same month: the senior loan must be refinanced first, ahead of it.");
    expect(said("June 1, 2029", "June 30, 2029")).toContain("It redeems in the same month as the senior loan matures (Jun 2029):");
    // A month apart is one month.
    const one = said("May 15, 2029", "June 15, 2029");
    expect(one).toContain("It redeems 1 month before the senior loan matures (Jun 2029)");
    for (const s of [months, after, one]) expect(s).not.toMatch(/\b0 months\b|\b1 months\b/);
  });

  it("names no accrual to a redemption due this month (LOW-2)", () => {
    const due = readPosition(PREF, 15_000_000, new Date("2029-06-15T12:00:00Z"))!;
    expect(due.monthsLeft).toBe(0);
    const said = due.sentences.join(" ");
    expect(said).toContain("Current pay is cash and accrual a promise: $1.20M a year is paid in cash.");
    expect(said).not.toMatch(/\$0 accrues|\$0 if it compounds/);
  });

  it("says the last dollar is the least it can be where no accrual to a redemption is counted (LOW-3)", () => {
    const past = readPosition(PREF, 15_000_000, new Date("2029-08-01T12:00:00Z"))!;
    expect(past.detachmentBeforeAccrual).toBe(true);
    expect(past.sentences.join(" ")).toContain("the position's first dollar sits at 65.0% and its last at 83.8% at least, before any accrued return.");
    expect(past.sentences.join(" ")).not.toContain("at redemption");
    expect(positionModelLine(past)).toContain("its last dollar sits at 83.8% of the stated value at least, before any accrued return");
    const undated = readPosition(swap([], "Mandatory redemption date"), 15_000_000, ON)!;
    expect(undated.sentences.join(" ")).toContain("its last at 83.8% at least, before any accrued return.");
    // A position paying its current pay alone owes no accrual: its last
    // dollar is the figure, at redemption.
    const cashOnly = readPosition(swap([], "Preferred return"), 15_000_000, ON)!;
    expect(cashOnly.detachmentBeforeAccrual).toBe(false);
    expect(cashOnly.sentences.join(" ")).toContain("its last at 83.8% at redemption.");
  });

  it("names the yield's basis only beside a yield (LOW-5)", () => {
    // No price read, so no yield is drawn: the months alone.
    expect(positionCaption(readPosition(PREF, null, ON))).toBe("32 months to its Jun 2029 redemption.");
    expect(positionCaption(readPosition(PREF, 14_000_000, ON))).toContain("the accrual read as simple, the lower yield");
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
