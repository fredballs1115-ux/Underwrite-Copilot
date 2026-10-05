import { describe, expect, it } from "vitest";
import { isSubordinateNote, monthsBetween, notePosition, parseMaturity, readNote, readNoteTerms, type NoteTerms } from "./note-yield";

const row = (label: string, value: string) => ({ label, value });

// The worked example: $20.0M for a $24.4M balance at 5.25%, interest-only,
// maturing at the end of March 2028, read on Sep 30, 2025 — thirty months.
const TERMS: NoteTerms = {
  balance: 24_400_000,
  ratePct: 5.25,
  maturity: "2028-03-31",
  interestOnly: true,
  amortYears: null,
  status: "performing",
  collateralValue: 34_000_000,
  subordinate: false,
  position: "first",
};
const AS_OF = new Date(Date.UTC(2025, 8, 30));

/** The price the stream is worth at a monthly rate — the round trip that
 *  proves the solved yield is the note's own. */
function priceAt(terms: NoteTerms, months: number, monthlyRate: number): number {
  const i = terms.ratePct! / 100 / 12;
  let pv = 0;
  for (let t = 1; t <= months; t++) {
    const cash = terms.balance! * i + (t === months ? terms.balance! : 0);
    pv += cash / Math.pow(1 + monthlyRate, t);
  }
  return pv;
}

describe("parseMaturity — a maturity only as the OM states it", () => {
  it("reads the forms a memorandum writes, a month with no day as the month's end", () => {
    expect(parseMaturity("March 1, 2028")).toBe("2028-03-01");
    expect(parseMaturity("Mar. 15th, 2028")).toBe("2028-03-15");
    expect(parseMaturity("Mar 2028")).toBe("2028-03-31");
    expect(parseMaturity("February 2028")).toBe("2028-02-29");
    expect(parseMaturity("3/1/2028")).toBe("2028-03-01");
    expect(parseMaturity("3/1/28")).toBe("2028-03-01");
    expect(parseMaturity("03/2028")).toBe("2028-03-31");
    expect(parseMaturity("2028-03-01")).toBe("2028-03-01");
    expect(parseMaturity("Matures June 30, 2027 (one 12-month extension option)")).toBe("2027-06-30");
  });

  it("gives no date where the OM gives none it can be read as", () => {
    // A bare year is a maturity a year wide.
    expect(parseMaturity("2028")).toBeNull();
    expect(parseMaturity("February 30, 2028")).toBeNull();
    expect(parseMaturity("13/1/2028")).toBeNull();
    expect(parseMaturity("upon sale")).toBeNull();
    expect(parseMaturity("")).toBeNull();
    expect(parseMaturity(undefined)).toBeNull();
  });

  it("counts a month only once its day is reached", () => {
    expect(monthsBetween("2025-09-30", "2028-03-31")).toBe(30);
    expect(monthsBetween("2025-09-15", "2025-10-01")).toBe(0);
    expect(monthsBetween("2025-09-15", "2025-10-15")).toBe(1);
  });
});

describe("readNoteTerms — each term from its own row, and only as stated", () => {
  it("reads the rows the extraction is asked to label", () => {
    const t = readNoteTerms({
      metrics: [
        row("Unpaid principal balance", "$24,400,000"),
        row("Note rate", "5.25%"),
        // A stated yield to maturity is a return, not the maturity date.
        row("Yield to maturity (at ask)", "12.0%"),
        row("Maturity date", "March 31, 2028"),
        row("Amortization", "Interest-only"),
        row("Payment status", "Performing — current through August"),
        row("Collateral value", "$34,000,000"),
      ],
    });
    expect(t).toEqual(TERMS);
  });

  it("an amortization in years, a non-performing loan, and a blank left blank", () => {
    const t = readNoteTerms({
      metrics: [
        row("Unpaid principal balance", "$24.4M"),
        row("Interest rate", "5.25%"),
        row("Amortization", "30 years"),
        row("Payment status", "90+ days delinquent; foreclosure filed"),
      ],
    });
    expect(t.balance).toBe(24_400_000);
    expect(t.interestOnly).toBe(false);
    expect(t.amortYears).toBe(30);
    expect(t.status).toBe("non_performing");
    expect(t.maturity).toBeNull();
    expect(t.collateralValue).toBeNull();
    expect(readNoteTerms({ metrics: [] })).toEqual({
      balance: null,
      ratePct: null,
      maturity: null,
      interestOnly: null,
      amortYears: null,
      status: null,
      collateralValue: null,
      subordinate: false,
      position: "first",
    });
  });

  it("reads a balance and a value with a hyphenated word beside the figure (research pass 37)", () => {
    // Any hyphen in the value had read as no balance.
    const t = readNoteTerms({
      metrics: [
        row("Unpaid principal balance", "$24,400,000 (as of the 2025-09-30 cut-off)"),
        row("Collateral value", "$34,000,000 (as-is)"),
      ],
    });
    expect(t.balance).toBe(24_400_000);
    expect(t.collateralValue).toBe(34_000_000);
    expect(readNoteTerms({ metrics: [row("Unpaid principal balance", "-$24,400,000")] }).balance).toBeNull();
  });
});

describe("a note behind other debt — its loan-to-value needs a senior balance the OM does not state", () => {
  it("reads the words that put a note behind other debt", () => {
    for (const words of [
      "$15M mezzanine loan behind a $60M senior loan",
      "Sale of a mezz loan secured by a pledge of the membership interests",
      "Second lien position",
      "2nd mortgage, 9% coupon",
      "Junior participation in a $50M first mortgage loan",
      "$10M B-note, subordinate to a $40M A-note",
      "Subordinate debt, 11% coupon",
      "Performing note in a position behind the senior lender",
    ]) {
      expect(isSubordinateNote(words), words).toBe(true);
    }
  });

  it("a first lien is not, even where its terms name a loan behind it", () => {
    for (const words of [
      "",
      "Sale of the first mortgage note",
      "$24.4M UPB, 5.25% coupon, matures 2027, 90 days delinquent",
      "A $40M A-note senior to a $10M B-note",
      "$24.4M first mortgage; a $5M mezzanine loan sits behind it",
      "First mortgage, ahead of the $5M mezzanine loan",
      "Borrower has a subordination agreement with the ground lessor",
    ]) {
      expect(isSubordinateNote(words), words).toBe(false);
    }
  });

  it("never reads a first lien as behind from a payment status or a negated mention (the audit of 2026-10-01)", () => {
    for (const words of [
      // A payment status is no position.
      "First-lien mortgage note. Non-performing; borrower 4 months behind on payments",
      "Borrower is 90 days behind",
      // A negated mention is no mention.
      "First mortgage note; there is no mezzanine or junior debt",
      "Senior first-lien loan, not subordinated to any other debt",
      "No mezzanine, junior or subordinate financing encumbers the property",
      "Performing loan without any subordinate financing",
      "A non-subordinated first mortgage",
      "Free and clear of any other liens; first mortgage note",
      // A first-lien note beside other debt it names stays first.
      "First mortgage note. The borrower also has a $5M mezzanine loan.",
    ]) {
      expect(notePosition(words), words).toBe("first");
      expect(isSubordinateNote(words), words).toBe(false);
    }
    // A negation in one clause leaves the next clause's words read.
    expect(notePosition("There is no mezzanine debt, but the note is subordinate to a $60M A-note")).toBe("behind");
    // A junior piece of a first loan is junior.
    expect(notePosition("Junior participation in a $50M first mortgage loan")).toBe("behind");
  });

  it("other debt named with nothing to place the note is unclear: the loan-to-value is withheld, and no senior loan is asserted", () => {
    const words = "Performing note; the property also carries $5M of mezzanine financing";
    expect(notePosition(words)).toBe("unclear");
    expect(isSubordinateNote(words)).toBe(true);
    const unclear = readNoteTerms({
      metrics: [row("Unpaid principal balance", "$15,000,000"), row("Whole-asset value", "$70,000,000")],
      interest: { summary: "Performing note", loan: "The property also carries $5M of mezzanine financing" },
    });
    expect(unclear.position).toBe("unclear");
    expect(unclear.subordinate).toBe(true);
    expect(readNote(unclear, 15_000_000, AS_OF)!.ltvAtBalancePct).toBeNull();
    // The payment status row is never read for a position.
    const status = readNoteTerms({
      metrics: [row("Unpaid principal balance", "$15,000,000"), row("Payment status", "Non-performing; 4 months behind on payments")],
      interest: { summary: "First-lien mortgage note", loan: "" },
    });
    expect(status.position).toBe("first");
  });

  it("reads the position from the interest's words and the note's rows, and withholds the loan-to-value", () => {
    const rows = [
      row("Unpaid principal balance", "$15,000,000"),
      row("Note rate", "11.0%"),
      row("Maturity date", "March 31, 2028"),
      row("Amortization", "Interest-only"),
      row("Whole-asset value", "$70,000,000"),
    ];
    const mezz = readNoteTerms({ metrics: rows, interest: { summary: "Sale of a $15M mezzanine loan", loan: "Behind a $60M senior mortgage" } });
    expect(mezz.subordinate).toBe(true);
    expect(mezz.collateralValue).toBe(70_000_000);
    // A row of the note's own saying so is read too.
    expect(readNoteTerms({ metrics: [row("Unpaid principal balance", "$15,000,000 (mezzanine)"), ...rows.slice(1)] }).subordinate).toBe(true);
    // $15M over $70M alone read 21%; with the $60M ahead of it the stack is
    // 107% — a figure the memorandum's rows cannot give, so none is given.
    const r = readNote(mezz, 15_000_000, AS_OF)!;
    expect(r.ltvAtBalancePct).toBeNull();
    expect(r.ltvAtPricePct).toBeNull();
    // Everything that is the note's own is still read.
    expect(r.cents).toBeCloseTo(100, 6);
    expect(r.currentYieldPct).toBeCloseTo(11, 6);
    expect(r.ytmPct).toBeCloseTo(11, 1);
    // A first-lien note with the same rows is exactly as before.
    const first = readNoteTerms({ metrics: rows, interest: { summary: "Sale of the first mortgage note", loan: "" } });
    expect(first.subordinate).toBe(false);
    expect(readNote(first, 15_000_000, AS_OF)!.ltvAtBalancePct).toBeCloseTo((15 / 70) * 100, 6);
  });

  // Research pass 28: the memorandum's own words stated the senior balance
  // ("behind a $52M senior mortgage") and the screen had no row to read it
  // from. The extraction labels it "Senior loan balance" now, and the stack
  // is read off it: the senior alone, with the note's balance, with the price.
  it("reads the stack on a senior balance the memorandum states, and only behind it", () => {
    const rows = [
      // Listed first, the senior loan's rows are never the note's own terms.
      row("Senior loan balance", "$52,000,000"),
      row("Senior loan maturity", "June 30, 2031"),
      row("Unpaid principal balance", "$15,000,000"),
      row("Note rate", "11.0%"),
      row("Maturity date", "March 31, 2028"),
      row("Whole-asset value", "$70,000,000"),
    ];
    const words = { summary: "Sale of a $15M mezzanine loan", loan: "$15M mezzanine loan behind a $52M senior mortgage" };
    const mezz = readNoteTerms({ metrics: rows, interest: words });
    expect(mezz.balance).toBe(15_000_000);
    expect(mezz.maturity).toBe("2028-03-31");
    expect(mezz.position).toBe("behind");
    expect(mezz.seniorBalance).toBe(52_000_000);
    const r = readNote(mezz, 12_000_000, AS_OF)!;
    // The note's own loan-to-value stays withheld; the stack is read instead.
    expect(r.ltvAtBalancePct).toBeNull();
    expect(r.seniorLtvPct).toBeCloseTo((52 / 70) * 100, 6);
    expect(r.stackAtBalancePct).toBeCloseTo((67 / 70) * 100, 6);
    expect(r.stackAtPricePct).toBeCloseTo((64 / 70) * 100, 6);
    // No senior row: the stack is withheld, as before.
    const bare = readNote(readNoteTerms({ metrics: rows.slice(2), interest: words }), 12_000_000, AS_OF)!;
    expect(bare.terms.seniorBalance).toBeUndefined();
    expect([bare.seniorLtvPct, bare.stackAtBalancePct, bare.stackAtPricePct]).toEqual([null, null, null]);
    // Read only beside words that place the note behind it: a first-lien
    // note, and one whose words leave its place unclear, read no stack.
    const first = readNoteTerms({ metrics: rows, interest: { summary: "Sale of the first mortgage note", loan: "" } });
    expect(first.seniorBalance).toBeUndefined();
    expect(readNote(first, 12_000_000, AS_OF)!.stackAtBalancePct).toBeNull();
    const unclear = readNoteTerms({ metrics: rows, interest: { summary: "Performing note", loan: "The property also carries $5M of mezzanine financing" } });
    expect(unclear.position).toBe("unclear");
    expect(unclear.seniorBalance).toBeUndefined();
    // A share of value is no balance, and a senior loan's other terms are not one.
    expect(readNoteTerms({ metrics: [row("Senior loan balance", "65% LTV"), ...rows.slice(2)], interest: words }).seniorBalance).toBeUndefined();
    expect(readNoteTerms({ metrics: [row("Senior loan rate", "$52,000,000"), ...rows.slice(2)], interest: words }).seniorBalance).toBeUndefined();
  });
});

describe("readNoteTerms — an amortization, an interest-only period and a maturity, each only as stated", () => {
  const terms = (...rows: Array<[string, string]>) => readNoteTerms({ metrics: rows.map(([l, v]) => row(l, v)) });

  it("an amortization in months is read in years; a count of months under five years is not an amortization", () => {
    expect(terms(["Amortization", "360 months"])).toMatchObject({ interestOnly: false, amortYears: 30 });
    expect(terms(["Amortization", "300-month schedule"])).toMatchObject({ interestOnly: false, amortYears: 25 });
    expect(terms(["Amortization", "30-year"])).toMatchObject({ interestOnly: false, amortYears: 30 });
    expect(terms(["Amortization", "Fully amortizing"])).toMatchObject({ interestOnly: null, amortYears: null });
  });

  it("an interest-only row's figure is the interest-only period, never an amortization", () => {
    expect(terms(["Interest-only period", "24 months"])).toMatchObject({ interestOnly: true, amortYears: null });
    expect(terms(["IO period", "Full term"])).toMatchObject({ interestOnly: true, amortYears: null });
    expect(terms(["Interest-only period", "None"])).toMatchObject({ interestOnly: null, amortYears: null });
    expect(terms(["Amortization", "Interest-only through maturity"])).toMatchObject({ interestOnly: true, amortYears: null });
  });

  it("an interest-only period beside an amortization is neither — the OM does not say which applies from today", () => {
    const both = terms(["Amortization", "IO for 24 months, then 30-year amortization"]);
    expect(both).toMatchObject({ interestOnly: null, amortYears: 30 });
    expect(terms(["Interest-only period", "36 months"], ["Amortization", "30 years"])).toMatchObject({ interestOnly: null, amortYears: 30 });
    const r = readNote({ ...TERMS, interestOnly: both.interestOnly, amortYears: both.amortYears }, 20_000_000, AS_OF)!;
    // Run interest-only, and said: the lower yield at a discount.
    expect(r.paymentBasis).toBe(
      "run interest-only — the memorandum states an interest-only period and a 30-year amortization, not which applies from today",
    );
    expect(r.ytmPct).toBeCloseTo(13.822, 2);
  });

  it("the initial maturity, never the extended one or the yield to it", () => {
    expect(terms(["Fully extended maturity", "March 31, 2030"], ["Initial maturity", "March 31, 2028"]).maturity).toBe("2028-03-31");
    expect(terms(["Maturity extension", "Two 12-month options"], ["Maturity date", "03/2028"]).maturity).toBe("2028-03-31");
  });
});

describe("the extraction asks for the rows this reads (#416)", () => {
  it("every note label the prompt names is one the reader takes", async () => {
    const { extractionInstruction } = await import("./anthropic/prompts");
    const prompt = extractionInstruction("multifamily");
    const labels = ["Unpaid principal balance", "Note rate", "Maturity date", "Amortization", "Payment status", "Whole-asset value", "Senior loan balance"];
    for (const label of labels) expect(prompt).toContain(`"${label}"`);
    expect(
      readNoteTerms({
        metrics: [row("Unpaid principal balance", "$15,000,000"), row("Senior loan balance", "$52,000,000")],
        interest: { summary: "Sale of a mezzanine loan", loan: "behind a $52M senior mortgage" },
      }).seniorBalance,
    ).toBe(52_000_000);
    const t = readNoteTerms({
      metrics: [
        row("Unpaid principal balance", "$24,400,000"),
        row("Note rate", "5.25%"),
        row("Maturity date", "March 31, 2028"),
        row("Amortization", "Interest-only"),
        row("Payment status", "Performing"),
        row("Whole-asset value", "$34,000,000"),
      ],
    });
    expect(t).toEqual(TERMS);
  });
});

describe("readNote — the discount is the return", () => {
  it("the worked example: 82 cents, a 6.4% current yield and 13.8% to maturity", () => {
    const r = readNote(TERMS, 20_000_000, AS_OF)!;
    expect(r.cents).toBeCloseTo(81.967, 3);
    expect(r.currentYieldPct).toBeCloseTo(6.405, 3);
    expect(r.monthsLeft).toBe(30);
    expect(r.ytmPct).toBeCloseTo(13.822, 2);
    expect(r.paymentBasis).toBe("interest-only as stated");
    expect(r.ltvAtBalancePct).toBeCloseTo(71.765, 3);
    expect(r.ltvAtPricePct).toBeCloseTo(58.824, 3);
    expect(r.matured).toBe(false);
    // The round trip: the stream discounted at the solved monthly rate is
    // the price, to the dollar.
    expect(priceAt(TERMS, 30, r.ytmPct! / 100 / 12)).toBeCloseTo(20_000_000, -1);
  });

  it("at par the yield is the coupon; at a premium it is under it", () => {
    expect(readNote(TERMS, 24_400_000, AS_OF)!.ytmPct).toBeCloseTo(5.25, 2);
    expect(readNote(TERMS, 25_000_000, AS_OF)!.ytmPct!).toBeLessThan(5.25);
  });

  it("an amortizing note returns principal sooner, which yields more at a discount", () => {
    const io = readNote(TERMS, 20_000_000, AS_OF)!;
    const amort = readNote({ ...TERMS, interestOnly: false, amortYears: 30 }, 20_000_000, AS_OF)!;
    expect(amort.paymentBasis).toBe("amortizing over 30 years from today's balance");
    expect(amort.ytmPct!).toBeGreaterThan(io.ytmPct!);
  });

  it("an amortization the OM does not state is read as interest-only, and said so", () => {
    const r = readNote({ ...TERMS, interestOnly: null }, 20_000_000, AS_OF)!;
    expect(r.paymentBasis).toBe("interest-only — the memorandum states no amortization period");
    expect(r.ytmPct).toBeCloseTo(13.822, 2);
  });

  it("no rate or no maturity: no yield to maturity, and every other figure still read", () => {
    const noMaturity = readNote({ ...TERMS, maturity: null }, 20_000_000, AS_OF)!;
    expect(noMaturity.ytmPct).toBeNull();
    expect(noMaturity.paymentBasis).toBeNull();
    expect(noMaturity.currentYieldPct).toBeCloseTo(6.405, 3);
    const noRate = readNote({ ...TERMS, ratePct: null }, 20_000_000, AS_OF)!;
    expect(noRate.ytmPct).toBeNull();
    expect(noRate.currentYieldPct).toBeNull();
    expect(noRate.cents).toBeCloseTo(81.967, 3);
    const noValue = readNote({ ...TERMS, collateralValue: null }, 20_000_000, AS_OF)!;
    expect(noValue.ltvAtBalancePct).toBeNull();
    expect(noValue.ltvAtPricePct).toBeNull();
  });

  it("past its maturity a note has no contract yield to state", () => {
    const r = readNote({ ...TERMS, maturity: "2025-06-30" }, 20_000_000, AS_OF)!;
    expect(r.matured).toBe(true);
    expect(r.ytmPct).toBeNull();
    expect(r.monthsLeft).toBeNull();
  });

  it("no balance or no price: no note to read", () => {
    expect(readNote({ ...TERMS, balance: null }, 20_000_000, AS_OF)).toBeNull();
    expect(readNote(TERMS, null, AS_OF)).toBeNull();
    expect(readNote(TERMS, 0, AS_OF)).toBeNull();
  });
});
