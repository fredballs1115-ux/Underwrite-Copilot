import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import {
  readSellerFinancing,
  readSellerFinancingTerms,
  sellerFinancingContextLine,
  sellerFinancingLine,
  sellerFinancingNote,
  sellerFinancingSentence,
  sellerFinancingTag,
  sellerFinancingTermsLine,
  sellerFinancingView,
} from "./seller-financing";
import { gluedWords } from "./render-lint";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import { SAMPLE_DEAL } from "./sample-deal";
import { deriveUnderwriteInputs } from "./underwrite/inputs";

const row = (label: string, value: string, page = "p. 12") => ({ label, value, flagged: false, page, basis: "na" as const });
// The sample's $68M apartment building, the seller offering to carry 70%
// of the price at 5.00% for five years on a 25-year amortization — against
// the model's own 60% loan at its 6.00% rate.
const NOTE = [
  row("Seller financing amount", "70% of the purchase price"),
  row("Seller financing rate", "5.00%"),
  row("Seller financing term", "5 years"),
  row("Seller financing amortization", "25 years"),
];
const sample = (rows = NOTE, over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ ...SAMPLE_DEAL.extraction, totalPages: 40, metrics: [...SAMPLE_DEAL.extraction.metrics, ...rows], ...over }) as ExtractionResult;
const inputs = deriveUnderwriteInputs(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name).inputs;

describe("readSellerFinancingTerms — the note, only as the memorandum states it", () => {
  it("reads the rows, strikes a share of the price on the price given, and nothing where no note is offered", () => {
    expect(readSellerFinancingTerms(sample(), 68_000_000)).toEqual({
      amount: 47_600_000,
      sharePct: 70,
      ratePct: 5,
      termYears: 5,
      amortYears: 25,
      interestOnly: false,
      second: false,
      page: "p. 12",
    });
    // Without a price a share stays a share.
    expect(readSellerFinancingTerms(sample(), null)?.amount).toBeNull();
    expect(readSellerFinancingTerms(SAMPLE_DEAL.extraction, 68_000_000)).toBeNull();
    expect(readSellerFinancingTerms(null, null)).toBeNull();
  });

  it("a stated amount, an interest-only note, a term in months, and a second behind new senior debt", () => {
    const t = readSellerFinancingTerms(
      sample([
        row("Seller financing amount", "$10,000,000"),
        row("Seller financing rate", "6.5%"),
        row("Seller financing term", "36 months"),
        row("Seller financing amortization", "Interest-only"),
        row("Seller financing position", "Second, behind a new first mortgage"),
      ]),
      68_000_000,
    )!;
    expect(t).toMatchObject({ amount: 10_000_000, sharePct: null, ratePct: 6.5, termYears: 3, interestOnly: true, amortYears: null, second: true });
    expect(readSellerFinancingTerms(sample([row("Seller financing term", "3-5 years")]), null)?.termYears).toBeNull();
  });
});

describe("readSellerFinancing — the note against the model's new loan", () => {
  it("runs the two positions whole on the model's own figures, and says what the note is worth and what it takes", () => {
    const s = readSellerFinancing(sample(), inputs)!;
    expect(s.terms.amount).toBe(47_600_000);
    expect(s.underMarketBps).toBe(Math.round((inputs.allInRatePct * 100 - 5) * 100));
    expect(s.missing).toEqual([]);
    expect(s.read).not.toBeNull();
    // The note is larger than the model's loan, so it takes less equity.
    expect(s.read!.extraEquity!).toBeLessThan(0);
    const sentence = sellerFinancingSentence(s);
    expect(sentence).toMatch(/^The seller's note (is worth \$[\d.]+M of price|returns [\d.]+ points (more|less|no more) than the model's new loan)/);
    expect(sentence).toContain("less equity than the model's new loan");
    // The larger note is the lender's question too: its coverage is said.
    expect(sentence).toMatch(/Its year-one coverage is [\d.]+× against the model's loan's [\d.]+×\./);
    expect(gluedWords(sentence)).toEqual([]);
    const view = sellerFinancingView(s, null, false);
    expect(view.kind).toBe("seller");
    expect(view.couponPct).toBe(5);
    expect(view.feeLine).toBe("The note's 70% of the price is struck on the model's $68.0M price.");
    expect(view.rateLine).toContain("placeholder");
  });

  it("names what is missing, reads a second without running it, and a balloon inside the hold", () => {
    const bare = readSellerFinancing(sample([row("Seller financing amount", "$40,000,000")]), inputs)!;
    expect(bare.read).toBeNull();
    expect(sellerFinancingSentence(bare)).toBe(
      "It cannot be priced against a new loan: the memorandum does not state its rate, its term or its payment schedule.",
    );
    const second = readSellerFinancing(sample([...NOTE, row("Seller financing position", "Second lien")]), inputs)!;
    expect(second.read).toBeNull();
    expect(sellerFinancingSentence(second)).toContain("It sits behind new senior debt");
    const short = readSellerFinancing(sample([...NOTE.filter((r) => !/term/.test(r.label)), row("Seller financing term", "3 years")]), inputs)!;
    expect(short.read?.assume?.refinanced).toBe(true);
    expect(sellerFinancingSentence(short)).toContain("It balloons after 3 years, inside the 5-year hold, and is refinanced at today's rate after.");
  });

  it("nothing where the price does not buy the building", () => {
    expect(readSellerFinancing(sample(NOTE, { interest: { kind: "note", statement: "", share: "", groundLease: "", loan: "", page: "" } } as never), inputs)).toBeNull();
  });
});

describe("the note on every summary", () => {
  it("the tag, the terms, the line, the context and the traps", () => {
    expect(sellerFinancingTag(sample())).toBe("Seller financing 5.00%");
    expect(sellerFinancingTag(sample([row("Seller financing amount", "$40,000,000")]))).toBe("Seller financing");
    expect(sellerFinancingTag(SAMPLE_DEAL.extraction)).toBeNull();
    const t = readSellerFinancingTerms(sample(), 68_000_000)!;
    expect(sellerFinancingTermsLine(t)).toBe("$47.6M (70% of the price) at 5.00% for 5 years, amortizing over 25 years");
    expect(sellerFinancingLine(t)).toBe("The seller offers to carry financing: $47.6M (70% of the price) at 5.00% for 5 years, amortizing over 25 years");
    const s = readSellerFinancing(sample(), inputs)!;
    expect(sellerFinancingContextLine(s)).toContain("a seller who carries paper below the market has usually priced the difference into the ask");
    const note = sellerFinancingNote(s);
    expect(note).toContain("SELLER-FINANCING TRAPS, checked by name");
    expect(note).toContain("(d) THE SECOND");
  });

  // Research pass 23: on a note the seller's financing was dropped silently —
  // it finances the purchase of the loan, which no surface said.
  it("on a note: the financing of the note purchase, as stated, said as that and never run", async () => {
    const { notePurchaseFinancing, notePurchaseFinancingLine, sellerFinancingDocLine } = await import("./seller-financing");
    const { keyTermRows } = await import("./key-terms");
    const { dealContextFor } = await import("./deal-context");
    const onNote = sample(
      [
        row("Seller financing amount", "60% of the purchase price"),
        row("Seller financing rate", "6.00%"),
        row("Seller financing term", "3 years"),
        row("Seller financing amortization", "Interest-only"),
      ],
      { interest: { kind: "note", summary: "Sale of the first mortgage note", share: "", groundLease: "", loan: "", page: "" } },
    );
    // Never run against the model.
    expect(readSellerFinancing(onNote, inputs)).toBeNull();
    expect(sellerFinancingTag(onNote)).toBeNull();
    // Read as stated, a share struck on the note's own price.
    const t = notePurchaseFinancing(onNote)!;
    expect(t).toMatchObject({ amount: 40_800_000, sharePct: 60, ratePct: 6, termYears: 3, interestOnly: true });
    const line =
      "The seller offers to finance the note purchase: $40.8M (60% of the price) at 6.00% for 3 years, interest-only as stated — financing of the buyer's purchase of the loan, not of the property, and not run against the model";
    expect(notePurchaseFinancingLine(t)).toBe(line);
    // The memo's and the shared screen's one line, either way.
    expect(sellerFinancingDocLine(onNote)).toBe(line);
    expect(sellerFinancingDocLine(sample())).toBe("The seller offers to carry financing: $47.6M (70% of the price) at 5.00% for 5 years, amortizing over 25 years");
    expect(sellerFinancingDocLine(SAMPLE_DEAL.extraction as ExtractionResult)).toBe("");
    // The deal context says it.
    expect(dealContextFor(onNote)).toContain(
      "The memorandum says the seller will finance the note purchase: $40.8M (60% of the price) at 6.00% for 3 years, interest-only as stated. It finances the buyer's purchase of the loan, not the property, so it is read as stated and not run against the model",
    );
    // The key terms lead it beside the note's own terms, each labelled as the purchase's.
    const labels = keyTermRows(onNote.metrics, "stabilized", 8, "note").map((m) => m.label);
    expect(labels).toContain("Seller financing amount (for the note purchase; not run against the model)");
    expect(labels).toContain("Seller financing rate (for the note purchase; not run against the model)");
    expect(labels).not.toContain("Seller financing amount");
    // On the property it reads as before.
    expect(keyTermRows(sample().metrics, "stabilized", 12).map((m) => m.label)).toContain("Seller financing amount");
    // The workbook's cover lists it, and says the model does not run it.
    const meta = deriveUnderwriteInputs(onNote, "note").meta.sellerNote;
    expect(meta?.line).toBe(line);
    expect(meta?.read).toContain("does not run it");
    // Nothing on anything but a note.
    expect(notePurchaseFinancing(sample())).toBeNull();
    expect(notePurchaseFinancing(sample([], { interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" } }))).toBeNull();
    expect(gluedWords(`${line} ${dealContextFor(onNote)}`)).toEqual([]);
  });

  it("the prompt asks for the rows the reader reads, by their labels", () => {
    const prompt = extractionInstruction("multifamily" as never);
    for (const label of ['"Seller financing amount"', '"Seller financing rate"', '"Seller financing term"', '"Seller financing amortization"', '"Seller financing position"']) {
      expect(prompt).toContain(label);
    }
  });
});
