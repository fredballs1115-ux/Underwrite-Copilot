import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import {
  assumableContextLine,
  assumableLine,
  assumableTag,
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
import { assumableLevyRows, assumableRows, assumableStatedRows } from "./loan-rows";
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

  it("reads a balance with a hyphenated word beside it (research pass 37)", () => {
    // Any hyphen had read as no balance: no tag, no card and no context line
    // for a loan written "$24,500,000 (Freddie Mac, non-recourse)".
    expect(readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000 (Freddie Mac, non-recourse)")]))!.balance).toBe(24_500_000);
    expect(
      readAssumableTerms(sample([row("Assumable loan balance", "22,000,000 (tax-exempt multifamily housing revenue bonds, Freddie Mac TEL)")]))!.balance,
    ).toBe(22_000_000);
    expect(assumableTag(sample([row("Assumable loan balance", "$24,500,000 (non-recourse)"), row("Assumable loan rate", "3.45%")]))).toBe(
      "Assumable 3.45%",
    );
    // A minus or a range is still no balance.
    expect(readAssumableTerms(sample([row("Assumable loan balance", "$24.5M - $25M")]))).toBeNull();
  });

  it("reads a balance with its coupon after a dash (audit C3a)", () => {
    // Any dash and digit had read as a range, so the loan the memorandum
    // offers read as none.
    expect(readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000 — 3.45% fixed, matures 2031")]))!.balance).toBe(24_500_000);
    expect(readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000 – 10 years remaining")]))!.balance).toBe(24_500_000);
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

  it("the extraction asks for the rows this reads, and each label is read by its own finder alone", async () => {
    const { extractionInstruction } = await import("./anthropic/prompts");
    const prompt = extractionInstruction("multifamily");
    for (const label of LOAN.map((m) => m.label).concat("Assumable loan debt service")) {
      expect(prompt, label).toContain(`"${label}"`);
    }
    // Every label the prompt names, held to the finder that reads it and to
    // no other (research pass 37's rows among them).
    const finders: [string, keyof ReturnType<typeof assumableRows>][] = [
      ["Assumable loan balance", "balanceRow"],
      ["Assumable loan rate", "rateRow"],
      ["Assumable loan maturity", "maturityRow"],
      ["Assumable loan amortization", "amortRow"],
      ["Assumable loan debt service", "dsRow"],
      ["Assumption fee", "feeRow"],
      ["Assumable loan rate cap", "capRow"],
      ["Mortgage insurance premium", "mipRow"],
      ["Prepayment", "prepaymentRow"],
      ["Assumable supplemental loan balance", "secondBalanceRow"],
      ["Assumable supplemental loan rate", "secondRateRow"],
      ["Assumable supplemental loan maturity", "secondMaturityRow"],
    ];
    for (const [label, key] of finders) {
      expect(prompt, label).toContain(`"${label}"`);
      const found = assumableRows([row(label, "x")]);
      for (const [other, value] of Object.entries(found)) expect(value != null, `${label} → ${other}`).toBe(other === key);
    }
  });
});

describe("debt that is not one fixed loan, said and never priced as one (research pass 37)", () => {
  const FLOATING = [
    row("Assumable loan balance", "$28,000,000"),
    row("Assumable loan rate", "SOFR + 3.25% (floating), rate cap at 3.50% SOFR through June 2027"),
    row("Assumable loan maturity", "June 1, 2028"),
    row("Assumable loan amortization", "Interest-only"),
  ];

  it("reads a floating rate as its index and its spread, never as a coupon", () => {
    const t = readAssumableTerms(sample(FLOATING))!;
    expect(t.ratePct).toBeNull();
    expect(t.floating).toEqual({ index: "SOFR", spreadPct: 3.25 });
    expect(t.rateCap).toBe("3.50% SOFR through June 2027");
    const rate = (value: string) => readAssumableTerms(sample([row("Assumable loan balance", "$28,000,000"), row("Assumable loan rate", value)]))!;
    expect(rate("Term SOFR plus 325 bps").floating).toEqual({ index: "Term SOFR", spreadPct: 3.25 });
    expect(rate("325 basis points over 30-day average SOFR").floating).toEqual({ index: "30-day average SOFR", spreadPct: 3.25 });
    expect(rate("Prime + 1.00%").floating).toEqual({ index: "Prime", spreadPct: 1 });
    expect(rate("Variable").floating).toEqual({ index: null, spreadPct: null });
    // A fixed coupon priced off an index when the loan was made is fixed.
    const fixed = rate("3.45% fixed (set at the 10-year Treasury plus 180 bps at origination)");
    expect(fixed.floating).toBeUndefined();
    expect(fixed.ratePct).toBe(3.45);
    for (const words of ["3.45% (Treasury-based, fixed)", "10-year Treasury + 1.80% at origination: 3.45%, fixed"]) {
      expect([rate(words).floating, rate(words).ratePct], words).toEqual([undefined, 3.45]);
    }
    // A rate cap filed under its own label is the cap, never the rate.
    const capFirst = readAssumableTerms(
      sample([row("Assumable loan balance", "$28,000,000"), row("Assumable loan rate cap", "3.50% strike through June 2027"), row("Assumable loan rate", "SOFR + 3.25%")]),
    )!;
    expect(capFirst.rateCap).toBe("3.50% strike through June 2027");
    expect(capFirst.floating).toEqual({ index: "SOFR", spreadPct: 3.25 });
  });

  it("prices nothing on a floating loan and says why, and never calls its value the rate saved", () => {
    const e = sample(FLOATING);
    const a = readAssumable(e, inputs, AS_OF)!;
    expect(a.read).toBeNull();
    expect(a.pricedRatePct).toBeNull();
    expect(a.underMarketBps).toBeNull();
    expect(a.missing).toEqual([]);
    expect(assumableSentence(a)).toBe("The loan floats at SOFR + 3.25%: its coupon moves with the index, so no fixed comparison is drawn.");
    expect(assumableTermsLine(a)).toBe("$28.0M floating at SOFR + 3.25% to Jun 2028, interest-only as stated, with a rate cap as stated: 3.50% SOFR through June 2027");
    expect(assumableTag(e)).toBe("Assumable SOFR + 3.25%");
    const context = dealContextFor(e)!;
    expect(context).toContain("its coupon moves with the index, so there is no fixed coupon to set against a new loan");
    expect(context).not.toContain("rate saved");
    const note = assumableNote(readAssumable(e, null, AS_OF)!);
    expect(note).not.toContain("rate saved");
    expect(note).toContain("(f) A FLOATING LOAN");
    const view = assumableView(a, null, false);
    expect(view).toMatchObject({ couponPct: null, underMarketBps: null, rateLine: null, pricePremium: null, dscrAssume: null });
    expect(gluedWords(`${view.termsLine} ${view.sentence}`)).toEqual([]);
    expect(assumableTag(sample([row("Assumable loan balance", "$28,000,000"), row("Assumable loan rate", "Floats over SOFR")]))).toBe("Assumable SOFR, floating");
    expect(assumableTag(sample([row("Assumable loan balance", "$28,000,000"), row("Assumable loan rate", "Variable")]))).toBe("Assumable floating rate");
  });

  it("never takes a supplemental loan's rows for the first loan's, and prices neither alone", () => {
    expect(assumableRows([row("Assumable supplemental loan balance", "$4,500,000")]).balanceRow).toBeNull();
    expect(assumableRows([row("Assumable loan balance (supplemental)", "$4,500,000")]).balanceRow).toBeNull();
    const e = sample([
      row("Assumable loan balance", "$32,000,000"),
      row("Assumable loan rate", "3.85%"),
      row("Assumable loan maturity", "August 1, 2029"),
      row("Assumable loan amortization", "30 years"),
      row("Assumable supplemental loan balance", "4,500,000"),
      row("Assumable supplemental loan rate", "5.95%"),
      row("Assumable supplemental loan maturity", "August 1, 2029"),
    ]);
    const a = readAssumable(e, inputs, AS_OF)!;
    expect(a.terms.balance).toBe(32_000_000);
    expect(a.terms.supplemental).toEqual({ balance: 4_500_000, ratePct: 5.95, maturity: "2029-08-01" });
    expect(a.read).toBeNull();
    expect(a.pricedRatePct).toBeNull();
    expect(assumableSentence(a)).toBe("A second loan is offered with it: the two are assumed together, so the first is not priced against a new loan alone.");
    expect(assumableTermsLine(a)).toContain("; with it, a $4.5M supplemental loan at 5.95% to Aug 2029");
    expect(assumableTag(e)).toBe("Assumable 3.85% + supplemental");
    expect(assumableLine(a)).toMatch(/^The seller's loans are offered for assumption together: \$32\.0M at 3\.85% to Aug 2029/);
    expect(dealContextFor(e)).toContain("The two are assumed together");
    expect(assumableView(a, null, false)).toMatchObject({ couponPct: null, rateLine: null, extraEquity: null });
  });

  it("reads a first loan's row that states the second beside it as two loans, quoted, with no balance or rate read off it as the first's", () => {
    const e = sample([
      row("Assumable loan balance", "32,000,000 first mortgage plus a 4,500,000 supplemental loan"),
      row("Assumable loan rate", "3.85% (first); 5.95% (supplemental)"),
      row("Assumable loan maturity", "August 1, 2029"),
      row("Assumable loan amortization", "30 years"),
    ]);
    const a = readAssumable(e, inputs, AS_OF)!;
    expect(a.terms.ratePct).toBeNull();
    expect(a.terms.supplemental).toMatchObject({
      balance: null,
      balanceStated: "32,000,000 first mortgage plus a 4,500,000 supplemental loan",
      ratesStated: "3.85% (first); 5.95% (supplemental)",
    });
    expect(a.read).toBeNull();
    expect(assumableTermsLine(a)).toBe(
      '"32,000,000 first mortgage plus a 4,500,000 supplemental loan" at "3.85% (first); 5.95% (supplemental)", as stated, to Aug 2029',
    );
    expect(assumableTag(e)).toBe("Assumable loan + supplemental");
    // A supplemental loan said to be available, with no figure of its own,
    // is no second loan offered.
    const available = readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000 (supplemental financing available)")]))!;
    expect(available.supplemental).toBeUndefined();
  });

  it("prices a HUD-insured loan's coupon as its note rate plus the stated mortgage insurance premium, and says so", () => {
    const e = sample([...LOAN, row("Mortgage insurance premium", "0.25% annually")]);
    const a = readAssumable(e, inputs, AS_OF)!;
    expect(a.terms.mipPct).toBe(0.25);
    expect(a.pricedRatePct).toBeCloseTo(3.7, 10);
    expect(a.underMarketBps).toBe(230);
    expect(a.read!.assume!.debtService).toBe(1_110_000);
    expect(assumableSentence(a)).toMatch(/ The coupon priced is its 3\.45% note rate plus the 0\.25% MIP, 3\.70% a year\.$/);
    expect(assumableTermsLine(a)).toBe("$30.0M at 3.45% plus the 0.25% MIP to Mar 2031, interest-only as stated");
    expect(assumableTag(e)).toBe("Assumable 3.45% + MIP");
    expect(assumableView(a, null, false)).toMatchObject({ couponPct: 3.7, mipPct: 0.25 });
    // Stated beside the note rate in the rate's own row, the same.
    const inline = readAssumableTerms(sample([row("Assumable loan balance", "$27,800,000"), row("Assumable loan rate", "2.65% plus 0.25% annual MIP")]))!;
    expect([inline.ratePct, inline.mipPct]).toEqual([2.65, 0.25]);
    // The annual premium where an upfront one is stated beside it; an upfront
    // premium alone is no rate a year.
    const mip = (value: string) => readAssumableTerms(sample([...LOAN, row("Mortgage insurance premium", value)]))!.mipPct;
    expect(mip("1.00% upfront; 0.25% annual")).toBe(0.25);
    expect(mip("1% upfront")).toBeUndefined();
    // No premium stated, no premium priced.
    expect(readAssumable(sample(), inputs, AS_OF)!.pricedRatePct).toBe(3.45);
  });

  it("says a lockout, or a sale subject to the loan, means the model's new loan may not be this buyer's to take", () => {
    const locked = sample([...LOAN, row("Prepayment", "Locked out until August 2029; the sale is subject to assumption of the existing CMBS loan")]);
    const a = readAssumable(locked, inputs, AS_OF)!;
    expect(a.terms.prepayment).toEqual({
      stated: "Locked out until August 2029; the sale is subject to assumption of the existing CMBS loan",
      locksIn: true,
    });
    const said =
      'The memorandum states its prepayment terms as "Locked out until August 2029; the sale is subject to assumption of the existing CMBS loan": the model\'s new loan may not be this buyer\'s to take.';
    expect(assumableSentence(a).endsWith(` ${said}`)).toBe(true);
    expect(dealContextFor(locked)).toContain(said);
    // Terms that do not lock the loan in are said as stated, and the card's
    // sentence is as before.
    const open = readAssumable(sample([...LOAN, row("Prepayment", "Yield maintenance through 2028, open at par thereafter")]), inputs, AS_OF)!;
    expect(open.terms.prepayment?.locksIn).toBe(false);
    expect(readAssumableTerms(sample([...LOAN, row("Prepayment", "Open at par; no prepayment premium")]))!.prepayment?.locksIn).toBe(false);
    expect(readAssumableTerms(sample([...LOAN, row("Prepayment", "No prepayment permitted before maturity")]))!.prepayment?.locksIn).toBe(true);
    expect(assumableSentence(open)).toBe(assumableSentence(readAssumable(sample(), inputs, AS_OF)!));
    expect(assumableContextLine(open)).toContain('Its prepayment terms as stated: "Yield maintenance through 2028, open at par thereafter".');
  });

  it("refuses a PACE assessment or a special district's levy filed as the seller's loan, and every term filed beside it", () => {
    // Research pass 37's C-PACE fixture: priced as the buyer's alternative
    // to a mortgage ("Assumable 6.85%", DSCR 4.21x), which it never is.
    const cpace = sample([
      row("Assumable loan balance (C-PACE assessment)", "9,500,000"),
      row("Assumable loan rate", "6.85%"),
      row("Assumable loan maturity", "December 1, 2049"),
      row("Assumable loan amortization", "25 years"),
      row("Assumption fee", "None stated by the provider"),
    ]);
    expect(readAssumableTerms(cpace)).toBeNull();
    expect(readAssumable(cpace, inputs, AS_OF)).toBeNull();
    expect(assumableTag(cpace)).toBeNull();
    expect(dealContextFor(cpace) ?? "").not.toContain("seller's loan");
    expect(assumableStatedRows(cpace.metrics)).toEqual([]);
    expect(assumableLevyRows(cpace.metrics).map((m) => m.label)).toEqual([
      "Assumable loan balance (C-PACE assessment)",
      "Assumable loan rate",
      "Assumable loan maturity",
      "Assumable loan amortization",
      "Assumption fee",
    ]);
    // Named in the value, or by any of the levies' names, the same.
    for (const value of [
      "$9,500,000 (C-PACE)",
      "$9,500,000 PACE assessment",
      "$9,500,000 (Property Assessed Clean Energy)",
      "$2,150,000 CDD bonds",
      "$4,000,000 MUD bonds",
      "$1,800,000 (PID assessment)",
      "$3,100,000 (CFD No. 2018-1)",
      "$3,100,000 Mello-Roos special tax",
      "$1,200,000 special assessment",
    ]) {
      const e = sample([row("Assumable loan balance", value), row("Assumable loan rate", "6.85%")]);
      expect(assumableTag(e), value).toBeNull();
      expect(assumableStatedRows(e.metrics), value).toEqual([]);
    }
    // A balance free of the levy's words beside the levy's own is the
    // seller's loan, and only the levy's rows are refused.
    const beside = sample([
      row("Assumable loan balance", "$24,500,000"),
      row("Assumable loan balance (C-PACE)", "$9,500,000"),
      row("Assumable loan rate", "3.45%"),
      row("Assumable loan maturity", "March 31, 2031"),
      row("Assumable loan amortization", "Interest-only"),
    ]);
    expect(readAssumableTerms(beside)).toMatchObject({ balance: 24_500_000, ratePct: 3.45 });
    expect(assumableLevyRows(beside.metrics).map((m) => m.label)).toEqual(["Assumable loan balance (C-PACE)"]);
    // "pace" and "mud" as words are no levy.
    expect(assumableTag(sample([row("Assumable loan balance", "$24,500,000 (amortizing at a steady pace)"), row("Assumable loan rate", "3.45%")]))).toBe(
      "Assumable 3.45%",
    );
  });

  it("the extraction never files a levy as the seller's loan", async () => {
    const { extractionInstruction } = await import("./anthropic/prompts");
    expect(extractionInstruction("multifamily")).toContain(
      "never a quote for new financing or the OM's own proposed loan, and never a PACE assessment or a special district's levy on the tax bill",
    );
  });

  it("the challenger's traps ask (f) to (i) as questions", () => {
    const note = assumableNote(readAssumable(sample(), null, AS_OF)!);
    for (const trap of ["(f) A FLOATING LOAN", "(g) A SECOND LOAN", "(h) A HUD-INSURED LOAN", "(i) PREPAYMENT"]) expect(note, trap).toContain(trap);
    expect(note.slice(note.indexOf("(f)"))).toMatch(/\?; \(g\)[^?]*\?; \(h\)[^?]*\?; \(i\)[^?]*\?$/);
  });
});

describe("wherever the deal is summarized (#419)", () => {
  it("the pipeline's tag and the documents' line say the loan as stated, and nothing more", () => {
    expect(assumableTag(sample())).toBe("Assumable 3.45%");
    expect(assumableTag(sample(LOAN.filter((m) => m.label !== "Assumable loan rate")))).toBe("Assumable loan");
    expect(assumableTag(SAMPLE_DEAL.extraction as ExtractionResult)).toBeNull();
    const a = readAssumable(sample(), null, AS_OF)!;
    expect(assumableLine(a)).toBe("The seller's loan is offered for assumption: $30.0M at 3.45% to Mar 2031, interest-only as stated");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("the workbook's cover carries the line and the read against the model's own new loan", () => {
    // The read is the deal page's, on the day the workbook is built.
    vi.useFakeTimers({ now: AS_OF, toFake: ["Date"] });
    const meta = deriveUnderwriteInputs(sample(), SAMPLE_DEAL.name).meta;
    expect(meta.assumable?.line).toBe("The seller's loan is offered for assumption: $30.0M at 3.45% to Mar 2031, interest-only as stated");
    expect(meta.assumable?.read).toBe(
      "Assuming it returns 0.1 points less than the model's new loan: the $1.9M a year it saves in debt service does not pay for the $11.1M larger cheque. It comes due in Mar 2031, inside the 5-year hold, so it runs at its coupon for the 4 full years before that and is refinanced at today's rate after.",
    );
    expect(deriveUnderwriteInputs(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name).meta.assumable).toBeNull();
  });
});

describe("a coupon priced off a Treasury, a supplemental on offer, a bare prime and a financing contingency (audit C3a MED-3)", () => {
  const rate = (value: string) => readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000"), row("Assumable loan rate", value)]))!;

  it("reads a stated coupon beside a Treasury index and its spread as a fixed coupon, never a floating rate", () => {
    for (const [words, coupon] of [
      ["3.45% (10-yr UST + 180 bps)", 3.45],
      ["4.12% (Treasury + 1.80%)", 4.12],
      ["3.45%, priced at the 10-year Treasury plus 1.80%", 3.45],
    ] as const) {
      const t = rate(words);
      expect(t.floating, words).toBeUndefined();
      expect(t.ratePct, words).toBe(coupon);
    }
    // A loan quoted over SOFR or prime still floats, whatever coupon it shows today.
    expect(rate("6.10% today (SOFR + 2.75%)").floating).toEqual({ index: "SOFR", spreadPct: 2.75 });
    expect(rate("8.50% (Prime + 1.00%)").floating).toEqual({ index: "Prime", spreadPct: 1 });
    // A Treasury with a spread and no coupon is still said as an index.
    expect(rate("10-yr UST + 180 bps").floating?.index).toBe("10-yr UST");
  });

  it("reads no prime index off a bare word", () => {
    const t = rate("4.25% (Fannie Mae DUS, prime location)");
    expect(t.floating).toBeUndefined();
    expect(t.ratePct).toBe(4.25);
    expect(rate("WSJ prime + 0.50%").floating).toEqual({ index: "WSJ prime", spreadPct: 0.5 });
    expect(rate("Prime rate, floating").floating?.index).toBe("Prime rate");
    expect(rate("100 bps over prime").floating).toEqual({ index: "prime", spreadPct: 1 });
  });

  it("reads no second loan off financing on offer, and never a fee's percentage as a second rate", () => {
    const offered = readAssumableTerms(
      sample([row("Assumable loan balance", "$24,500,000; supplemental loan of up to $3,000,000 available to a qualified buyer"), row("Assumable loan rate", "3.85% fixed")]),
    )!;
    expect(offered.supplemental).toBeUndefined();
    expect(offered.balance).toBe(24_500_000);
    const fee = rate("3.85% fixed; supplemental financing available, 1% fee");
    expect(fee.supplemental).toBeUndefined();
    expect(fee.ratePct).toBe(3.85);
    expect(assumableTag(sample([row("Assumable loan balance", "$24,500,000"), row("Assumable loan rate", "3.85% fixed; supplemental financing available, 1% fee")]))).toBe(
      "Assumable 3.85%",
    );
    // A supplemental stated as a loan in place is still one.
    expect(rate("3.85% (first); 5.95% (supplemental)").supplemental).toBeDefined();
  });

  it("reads no lock-in off a financing contingency", () => {
    const prepay = (value: string) => readAssumableTerms(sample([...LOAN, row("Prepayment", value)]))!.prepayment?.locksIn;
    expect(prepay("Yield maintenance; sale subject to financing contingency")).toBe(false);
    expect(prepay("Sale subject to the buyer's new financing")).toBe(false);
    expect(prepay("Sale subject to the existing loan")).toBe(true);
    expect(prepay("Sale subject to the existing Freddie Mac loan")).toBe(true);
    expect(prepay("Subject to this loan; defeasance only")).toBe(true);
  });
});

// The lead's item 17, and audit C5's MED-2 and LOW-2.
describe("a second loan on offer or in place, by its own words, and a coupon that resets", () => {
  const terms = (rows: ReturnType<typeof row>[]) => readAssumableTerms(sample([row("Assumable loan balance", "$32,000,000"), row("Assumable loan rate", "3.85%"), ...rows]))!;

  it("counts a supplemental's own rows as a second loan, never on offer, its balance said where it is not stated (audit C6, MED-7)", () => {
    // Its rate and maturity rows with no balance row state a supplemental
    // whose balance is not stated: nothing is priced on the first alone.
    for (const rows of [
      [row("Assumable supplemental loan rate", "5.95%"), row("Assumable supplemental loan maturity", "August 1, 2029")],
      [row("Assumable supplemental loan balance", "Not stated"), row("Assumable supplemental loan rate", "5.95%")],
    ]) {
      expect(terms(rows).supplemental).toMatchObject({ balance: null, ratePct: 5.95, balanceNotStated: true });
    }
    // A balance row that puts the loan on offer is an offer, as in the
    // first loan's own row.
    for (const words of ["Up to $3,000,000 available", "$3,000,000 available to a qualified buyer", "May be offered to a qualified buyer"]) {
      expect(terms([row("Assumable supplemental loan balance", words), row("Assumable supplemental loan rate", "5.95%")]).supplemental, words).toBeUndefined();
    }
    // A stated balance is a loan in place.
    expect(terms([row("Assumable supplemental loan balance", "$4,500,000"), row("Assumable supplemental loan rate", "5.95%")]).supplemental).toMatchObject({
      balance: 4_500_000,
      ratePct: 5.95,
    });
    expect(terms([row("Assumable supplemental loan balance", "$4,500,000 (originated May 2019)")]).supplemental?.balance).toBe(4_500_000);
  });

  it("prices nothing on the first loan where a supplemental is stated by its rate and maturity alone (audit C6, MED-7)", () => {
    const e = sample([
      ...LOAN,
      row("Assumable supplemental loan rate", "5.95%"),
      row("Assumable supplemental loan maturity", "March 31, 2031"),
    ]);
    const a = readAssumable(e, inputs, AS_OF)!;
    // It had been priced: "Assuming it is worth $93k of price ...".
    expect(a.read).toBeNull();
    expect(assumableSentence(a)).toBe(
      "A supplemental loan is stated with it, its balance not: the two are assumed together, so the first is not priced against a new loan alone.",
    );
    expect(assumableTag(e)).toBe("Assumable 3.45% + supplemental");
    expect(assumableTermsLine(a)).toContain("; with it, a supplemental loan at 5.95% to Mar 2031, its balance not stated");
    // "Available with the first" is the loan in place, not an offer.
    const withFirst = terms([row("Assumable supplemental loan balance", "$4,500,000, assumable with lender approval, available with the first")]);
    expect(withFirst.supplemental?.balance).toBe(4_500_000);
  });

  it("never reads a month as an offer, nor a clause that states its own loan and what may be done with it", () => {
    const balance = readAssumableTerms(
      sample([row("Assumable loan balance", "$32,000,000 first mortgage plus a $4,500,000 supplemental loan originated May 2019"), row("Assumable loan rate", "3.85%")]),
    )!;
    expect(balance.supplemental?.balanceStated).toBe("$32,000,000 first mortgage plus a $4,500,000 supplemental loan originated May 2019");
    const rate = readAssumableTerms(
      sample([row("Assumable loan balance", "$32,000,000"), row("Assumable loan rate", "3.85% (first); 5.95% (supplemental, which may be prepaid at par)")]),
    )!;
    expect(rate.supplemental?.ratesStated).toBeDefined();
    expect(rate.ratePct).toBeNull();
    // Still an offer where the words offer it.
    expect(
      readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000; a supplemental loan may be available to a qualified buyer"), row("Assumable loan rate", "3.85%")]))!
        .supplemental,
    ).toBeUndefined();
  });

  it("reads a coupon that resets or adjusts over a Treasury as no fixed coupon, said so and priced nothing", () => {
    for (const words of ["7.25% (5-yr Treasury + 300 bps, resets in year 6)", "7.25%, adjusts to 5-year UST + 300 bps at year 5", "4.10% fixed through 2028, then reprices at 10-yr Treasury + 2.25%"]) {
      const t = readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000"), row("Assumable loan rate", words)]))!;
      expect(t.ratePct, words).toBeNull();
      expect(t.floating?.resets, words).toBe(true);
    }
    const e = sample([...LOAN.filter((r) => !/rate/i.test(r.label)), row("Assumable loan rate", "7.25% (5-yr Treasury + 300 bps, resets in year 6)")]);
    const a = readAssumable(e, inputs, AS_OF)!;
    expect(a.read).toBeNull();
    expect(assumableSentence(a)).toBe(
      "The loan's coupon resets over 5-yr Treasury + 3.00%, as stated: a coupon fixed only until its reset is no fixed comparison, so none is drawn.",
    );
    expect(assumableTag(e)).toBe("Assumable 5-yr Treasury + 3.00%, resets");
    expect(assumableTermsLine(a)).toContain(" at a coupon that resets over 5-yr Treasury + 3.00%");
    // A fixed agency coupon priced off a Treasury, which never resets, stays fixed.
    expect(readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000"), row("Assumable loan rate", "3.45% (10-yr UST + 180 bps)")]))!.ratePct).toBe(3.45);
  });

  it("reads a coupon said not to reset, or adjusted in passing, as the fixed coupon it is (audit C6, MED-3)", () => {
    // Each had read "The loan's coupon resets, as stated", the tag
    // "Assumable loan, resets", and priced nothing.
    for (const words of [
      "3.45% fixed, non-resetting",
      "3.45% fixed (no rate reset)",
      "3.45% fixed, non-adjusting",
      "3.45%, fixed to maturity (not repriced on assumption)",
      "3.45% (rate adjusted for the 0.25% MIP)",
      "3.45% fixed; adjusted from 3.60% at the 2021 modification",
      "3.45% fixed; the rate does not reset",
    ]) {
      const t = readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000"), row("Assumable loan rate", words)]))!;
      expect(t.floating, words).toBeUndefined();
      expect(t.ratePct, words).toBe(3.45);
      const e = sample([...LOAN.filter((r) => !/rate/i.test(r.label)), row("Assumable loan rate", words)]);
      // The premium a "rate adjusted for MIP" names is the one the card
      // already adds ("+ MIP"), never a reset.
      expect(assumableTag(e), words).toMatch(/^Assumable 3\.45%(?: \+ MIP)?$/);
    }
    // A reset still to come is still one.
    for (const words of ["3.45% fixed; rate resets annually after year 5", "3.45%, reprices on 2028-06-01", "3.45%; rate will be adjusted in 2028"]) {
      expect(readAssumableTerms(sample([row("Assumable loan balance", "$24,500,000"), row("Assumable loan rate", words)]))!.floating?.resets, words).toBe(true);
    }
  });
});
