import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import {
  assumableContextLine,
  assumableNote,
  assumableSentence,
  assumableTermsLine,
  assumableView,
  modelForAssumption,
  readAssumable,
  readAssumableTerms,
  scheduleOf,
  type AssumableTerms,
} from "./assumable-debt";
import { dealContextFor } from "./deal-context";
import { gluedWords } from "./render-lint";
import { SAMPLE_DEAL } from "./sample-deal";
import { deriveUnderwriteInputs } from "./underwrite/inputs";

const row = (label: string, value: string, page = "p. 12") => ({ label, value, flagged: false, page, basis: "na" as const });
// The sample's $68M apartment building, carrying a $30M loan at 3.45%,
// interest-only to the end of March 2031, read on Sep 25, 2026: 54 months
// left, so four full years at the coupon inside the five-year hold.
const AS_OF = new Date(Date.UTC(2026, 8, 25));
const LOAN = [
  row("Assumable loan balance", "$30,000,000"),
  row("Assumable loan rate", "3.45%"),
  row("Assumable loan maturity", "March 31, 2031"),
  row("Assumable loan amortization", "Interest-only"),
  row("Assumption fee", "1% of the balance"),
];
const sample = (rows = LOAN, over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ ...SAMPLE_DEAL.extraction, totalPages: 40, metrics: [...SAMPLE_DEAL.extraction.metrics, ...rows], ...over }) as ExtractionResult;
const inputs = deriveUnderwriteInputs(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name).inputs;

describe("readAssumableTerms — the loan in place, only as the memorandum states it", () => {
  it("reads the rows the extraction is asked to label, and nothing without a balance", () => {
    expect(readAssumableTerms(sample())).toEqual({
      balance: 30_000_000,
      ratePct: 3.45,
      maturity: "2031-03-31",
      interestOnly: true,
      amortYears: null,
      debtService: null,
      feePct: 1,
      page: "p. 12",
    });
    // A deal financed fresh — the OM's own loan-to-value and rate — offers
    // nothing to assume.
    expect(readAssumableTerms(SAMPLE_DEAL.extraction)).toBeNull();
    expect(readAssumableTerms(sample(LOAN.slice(1)))).toBeNull();
    expect(readAssumableTerms(null)).toBeNull();
  });

  it("an amortization in years or months, a monthly payment made annual, a dollar fee over the balance", () => {
    const t = readAssumableTerms(
      sample([
        row("Assumable loan balance", "$24,000,000"),
        row("Assumable loan amortization", "360 months"),
        row("Assumable loan debt service", "$120,000 / month"),
        row("Assumption fee", "$240,000"),
      ]),
    )!;
    expect(t.amortYears).toBe(30);
    expect(t.interestOnly).toBe(false);
    expect(t.debtService).toBe(1_440_000);
    expect(t.feePct).toBeCloseTo(1, 10);
    // An interest-only period beside an amortization is neither.
    expect(
      readAssumableTerms(sample([row("Assumable loan balance", "$24,000,000"), row("Assumable loan amortization", "IO for 24 months, then 30-year")])),
    ).toMatchObject({ interestOnly: null, amortYears: 30 });
  });

  it("cites the balance row's page only inside the memorandum", () => {
    expect(readAssumableTerms(sample([row("Assumable loan balance", "$30,000,000", "p. 400")]))!.page).toBe("");
  });
});

describe("scheduleOf — how the payments run from today", () => {
  const base: AssumableTerms = {
    balance: 30_000_000,
    ratePct: 4,
    maturity: "2031-03-31",
    interestOnly: null,
    amortYears: null,
    debtService: null,
    feePct: null,
    page: "",
  };
  it("a stated debt service decides it: interest alone is interest-only, more solves for the years left", () => {
    expect(scheduleOf({ ...base, debtService: 1_200_000 }, 30)).toMatchObject({ interestOnly: true });
    // The level payment on $30M at 4% over 25 years, stated as the debt
    // service, gives back 25 years.
    const i = 0.04 / 12;
    const pmt = (30_000_000 * i) / (1 - Math.pow(1 + i, -300));
    const s = scheduleOf({ ...base, debtService: pmt * 12, amortYears: 30, interestOnly: false }, 30)!;
    expect(s.interestOnly).toBe(false);
    expect(s.amortYears).toBeCloseTo(25, 6);
    expect(s.basis).toBe("amortizing, with the 25 years its stated debt service implies");
  });

  it("the OM's own statement next, an undated interest-only period run amortizing, and nothing from nothing", () => {
    expect(scheduleOf({ ...base, interestOnly: true }, 30)!.basis).toBe("interest-only as stated");
    expect(scheduleOf({ ...base, interestOnly: false, amortYears: 30 }, 30)!.basis).toBe(
      "amortizing over 30 years from today's balance — the stated schedule, as if it began today",
    );
    expect(scheduleOf({ ...base, interestOnly: null, amortYears: 30 }, 30)).toMatchObject({ interestOnly: false, amortYears: 30 });
    expect(scheduleOf(base, 30)).toBeNull();
  });
});

describe("readAssumable — the loan in place against the model's own new loan", () => {
  it("the model hands over its price, NOI, growth, exit, costs and new loan", () => {
    const m = modelForAssumption(inputs)!;
    expect(m.price).toBe(68_000_000);
    expect(m.holdYears).toBe(5);
    expect(m.noi).toBe(3_880_000);
    expect(m.noiGrowthPct).toBeCloseTo(3, 6);
    expect(m.exitCapPct).toBeCloseTo(5.45, 10);
    expect(m.marketRatePct).toBeCloseTo(6, 10);
    expect(m.newLoan).toBe(41_208_000);
    expect(m.newLoanIoYears).toBe(0);
  });

  it("a cheap coupon on a small balance: 255 bps under, and still no better than a new loan", () => {
    const a = readAssumable(sample(), inputs, AS_OF)!;
    expect(a.underMarketBps).toBe(255);
    expect(a.monthsLeft).toBe(54);
    // Four full years at the coupon; the part-year is refinanced with the
    // rest, the reading that does not flatter the loan.
    expect(a.couponYears).toBe(4);
    expect(a.missing).toEqual([]);
    const r = a.read!;
    expect(r.assume!.debtService).toBe(1_035_000);
    expect(r.newLoan!.debtService).toBe(2_964_753);
    expect(r.extraEquity).toBe(11_095_920);
    expect(r.assume!.refinanced).toBe(true);
    expect(r.irrGapPts).toBe(-0.1);
    expect(r.pricePremium).toBeNull();
    expect(assumableTermsLine(a)).toBe("$30.0M at 3.45% to Mar 2031, interest-only as stated");
    expect(assumableSentence(a)).toBe(
      "Assuming it returns 0.1 points less than the model's new loan: the $1.9M a year it saves in debt service does not pay for the $11.1M larger cheque. It comes due in Mar 2031, inside the 5-year hold, so it runs at its coupon for the 4 full years before that and is refinanced at today's rate after.",
    );
    expect(gluedWords(assumableSentence(a))).toEqual([]);
  });

  it("a larger balance that outlasts the hold is worth price, and only the years the hold uses count", () => {
    const a = readAssumable(
      sample([
        row("Assumable loan balance", "$40,000,000"),
        row("Assumable loan rate", "3.45%"),
        row("Assumable loan maturity", "June 30, 2033"),
        row("Assumable loan amortization", "Interest-only"),
      ]),
      inputs,
      AS_OF,
    )!;
    const r = a.read!;
    expect(r.termExceedsHold).toBe(true);
    expect(r.yearsThatCount).toBe(5);
    expect(r.pricePremium!).toBeGreaterThan(0);
    const sentence = assumableSentence(a);
    expect(sentence).toMatch(/^Assuming it is worth \$[\d.]+M of price \([\d.]+% of the ask\) on the model's own figures, although it takes \$[\d.]+[Mk] more equity than the model's new loan\./);
    expect(sentence).toContain("Only the 5 years of it the 5-year hold uses count; the rest of its term is sold with the building.");
    expect(gluedWords(sentence)).toEqual([]);
  });

  it("a term the memorandum does not state is named, never assumed", () => {
    const noRate = readAssumable(sample(LOAN.filter((m) => m.label !== "Assumable loan rate")), inputs, AS_OF)!;
    expect(noRate.read).toBeNull();
    expect(noRate.missing).toEqual(["its rate"]);
    expect(assumableSentence(noRate)).toBe("It cannot be priced against a new loan: the memorandum does not state its rate.");
    const bare = readAssumable(sample(LOAN.slice(0, 1)), inputs, AS_OF)!;
    expect(assumableSentence(bare)).toBe(
      "It cannot be priced against a new loan: the memorandum does not state its rate, its maturity or its payment schedule.",
    );
  });

  it("a loan inside a year of its maturity, or past it, is a refinance, not an assumption", () => {
    const soon = readAssumable(
      sample([...LOAN.filter((m) => m.label !== "Assumable loan maturity"), row("Assumable loan maturity", "May 31, 2027")]),
      inputs,
      AS_OF,
    )!;
    expect(soon.couponYears).toBe(0);
    expect(soon.read).toBeNull();
    expect(assumableSentence(soon)).toMatch(/^It comes due in May 2027, inside a year/);
    const past = readAssumable(
      sample([...LOAN.filter((m) => m.label !== "Assumable loan maturity"), row("Assumable loan maturity", "June 30, 2026")]),
      inputs,
      AS_OF,
    )!;
    expect(past.matured).toBe(true);
    expect(assumableSentence(past)).toMatch(/^It is at or past its Jun 2026 maturity/);
  });

  it("only where the price buys the building: nothing on a note, a share or a leased fee", () => {
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    for (const kind of ["note", "partial_interest", "leased_fee"] as const) {
      expect(readAssumable(sample(LOAN, { interest: { ...blank, kind, share: kind === "partial_interest" ? "49%" : "" } }), inputs, AS_OF), kind).toBeNull();
    }
    expect(readAssumable(sample(LOAN, { interest: { ...blank, kind: "leasehold" } }), inputs, AS_OF)).not.toBeNull();
  });
});

describe("what the page, the context and the challenger say", () => {
  it("the view: the rate said as the model's, seeded or a placeholder, and the fee as stated or none", () => {
    const a = readAssumable(sample(), inputs, AS_OF)!;
    const seeded = assumableView(a, "5-yr Treasury 3.75% (FRED, Sep 24, 2026) + 225 bps multifamily spread, a screening default — enter your quote", true);
    expect(seeded.rateLine).toBe(
      "A new loan today, as the model runs it: 5-yr Treasury 3.75% (FRED, Sep 24, 2026) + 225 bps multifamily spread, a screening default — enter your quote.",
    );
    const flat = assumableView(a, "Enter your all-in rate (index + spread)", false);
    expect(flat.rateLine).toBe("A new loan at the model's 6.00% placeholder — the rates table was not fresh enough to seed it; enter your quote.");
    expect(flat.feeLine).toBe("The 1% assumption fee ($300k) is funded at closing, in the cheque.");
    expect(flat.dscrAssume).toBe(3.75);
    expect(flat.dscrNew).toBe(1.31);
    expect(flat.pricePremium).toBeNull();
    expect(flat.basisLine).toBe(
      "Both positions run on the model's year-1 NOI of $3.9M, grown 3% a year and sold at its 5.45% exit cap in year 5, against the model's $41.2M new loan — before reserves, capital and sale costs, which fall on both alike.",
    );
    const noFee = readAssumable(sample(LOAN.filter((m) => m.label !== "Assumption fee")), inputs, AS_OF)!;
    expect(assumableView(noFee, null, false).feeLine).toBe(
      "The memorandum states no assumption fee, so none is charged here — lenders commonly charge one.",
    );
  });

  it("the deal context says the terms and what they are worth turns on; the challenger gets the traps by name", () => {
    const e = sample();
    const context = dealContextFor(e)!;
    expect(context).toContain(
      "The memorandum offers the seller's loan for assumption: $30.0M at 3.45% to Mar 2031, interest-only as stated. Its value to a buyer is the rate saved over the years of it the hold uses, against the larger equity cheque its smaller balance takes — never the rate alone.",
    );
    const a = readAssumable(e, null, AS_OF)!;
    expect(assumableContextLine(a)).toContain("never the rate alone");
    const note = assumableNote(a);
    for (const trap of ["THE OVERLAP", "THE CHEQUE", "CONSENT", "THE BALLOON", "THE EXIT"]) expect(note, trap).toContain(trap);
    // A deal with no loan to assume says nothing of one.
    expect(dealContextFor(SAMPLE_DEAL.extraction as ExtractionResult) ?? "").not.toContain("assumption");
  });

  it("the extraction asks for the rows this reads", async () => {
    const { extractionInstruction } = await import("./anthropic/prompts");
    const prompt = extractionInstruction("multifamily");
    for (const label of LOAN.map((m) => m.label).concat("Assumable loan debt service")) {
      expect(prompt, label).toContain(`"${label}"`);
    }
  });
});
