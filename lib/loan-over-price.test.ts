// Research pass 38, item 10: a seller's loan offered for assumption, or a
// note the seller offers to carry, at or over the price said "Assuming it
// returns 0 points more than the model's new loan" beside a negative equity
// cheque — a gap that did not solve, printed as nought. A balance or an
// amount at or over the price is said now, and priced against nothing; a
// gap that does not solve is never "0 points". Every name is invented.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildSensitivityData } from "@/lib/underwrite/report-grid";
import {
  assumableContextLine,
  assumableLine,
  assumableSentence,
  assumableView,
  overPriceOf,
  overPriceWords,
  readAssumable,
} from "@/lib/assumable-debt";
import { readSellerFinancing, sellerFinancingContextLine, sellerFinancingDocLine, sellerFinancingView } from "@/lib/seller-financing";
import { AssumableLoanCard } from "@/app/(app)/deals/[id]/assumable-card";
import { buildReportData, ReportDocument } from "@/lib/memo/report-document";
import { pdfTextOf } from "@/lib/memo/pdf-text-of";
import { visibleText } from "@/lib/render-lint";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { ASOF, ex, m } from "@/lib/pass38.fixture";

const loanOverPrice = ex({
  assetClass: "Office",
  dealName: "Granite Tower",
  metrics: [
    m("Asking price", "25,000,000"),
    m("NOI (in-place)", "2,100,000", "in_place"),
    m("Going-in cap rate", "8.40%"),
    m("Total SF", "180,000 SF"),
    m("Assumable loan balance", "30,000,000"),
    m("Assumable loan rate", "3.50%"),
    m("Assumable loan maturity", "June 2029"),
    m("Assumable loan amortization", "30 years"),
  ],
});

const noteOverPrice = ex({
  assetClass: "Retail",
  dealName: "Juniper Corner",
  metrics: [
    m("Asking price", "5,000,000"),
    m("NOI (in-place)", "400,000", "in_place"),
    m("Going-in cap rate", "8.00%"),
    m("Total SF", "40,000 SF"),
    m("Seller financing amount", "6,000,000"),
    m("Seller financing rate", "5.00%"),
    m("Seller financing term", "5 years"),
    m("Seller financing amortization", "25 years"),
  ],
});

const LOAN_SAID = "$30.0M — more than the $25.0M price: check the balance";
const LOAN_SENTENCE = `${LOAN_SAID}. A loan at or over the price leaves no equity cheque, so nothing is priced against a new loan.`;
const NOTE_SAID = "$6.0M — more than the $5.0M price: check the note's amount";
const NOTE_SENTENCE = `${NOTE_SAID}. A note at or over the price leaves no equity cheque, so nothing is priced against a new loan.`;

const reportText = async (extraction: ExtractionResult, views: { assumable?: ReturnType<typeof assumableView>; sellerNote?: ReturnType<typeof sellerFinancingView> }) => {
  const deal = {
    name: extraction.dealName,
    asset_class: extraction.assetClass,
    extraction,
    challenges: null,
    comps: null,
    market: null,
    reconciliation: null,
    verdict: null,
    prior_screen: null,
  } as unknown as DealRow;
  const derived = deriveUnderwriteInputs(extraction, "x");
  const sensitivity = buildSensitivityData(derived.inputs, null, { sources: derived.sources });
  const input = buildReportData(
    deal,
    "October 5, 2026",
    [],
    sensitivity,
    undefined,
    undefined,
    undefined,
    undefined,
    null,
    views.assumable ?? null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    views.sellerNote ?? null,
  );
  const buf = await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]);
  return pdfTextOf(buf).replace(/\s+/g, " ");
};

describe("a loan or a note at or over the price (research pass 38, item 10)", () => {
  it("sets the figure against the memorandum's ask, else the model's price, and says which", () => {
    expect(overPriceOf(30e6, 25e6, 25e6)).toEqual({ amount: 30e6, price: 25e6, stated: true });
    expect(overPriceOf(30e6, null, 20e6)).toEqual({ amount: 30e6, price: 20e6, stated: false });
    expect(overPriceOf(24e6, 25e6, 25e6)).toBeNull();
    expect(overPriceOf(30e6, null, null)).toBeNull();
    expect(overPriceWords({ amount: 30e6, price: 25e6, stated: true }, "balance")).toBe(LOAN_SAID);
    expect(overPriceWords({ amount: 30e6, price: 20e6, stated: false }, "balance")).toBe(
      "$30.0M — more than the $20.0M price the model runs on: check the balance",
    );
    // Two figures that read alike are never "more than" each other.
    expect(overPriceWords({ amount: 25e6, price: 25e6, stated: true }, "balance")).toBe("$25.0M — as much as the $25.0M price: check the balance");
    expect(overPriceWords({ amount: 25_020_000, price: 25e6, stated: true }, "balance")).toBe("$25.0M — as much as the $25.0M price: check the balance");
  });

  it("says a seller's loan over the price on the card, the report and the cover, and prices nothing", async () => {
    const d = deriveUnderwriteInputs(loanOverPrice, "x");
    const a = readAssumable(loanOverPrice, d.inputs, ASOF)!;
    expect(a.overPrice).toEqual({ amount: 30e6, price: 25e6, stated: true });
    expect(a.read).toBeNull();
    const view = assumableView(a, d.sources.allInRatePct?.note ?? null, !!d.meta.rateSeed);
    expect(view.sentence).toBe(LOAN_SENTENCE);
    // No tile: no cheque, no debt service saved, no gap, no premium.
    expect([view.extraEquity, view.debtServiceSaved, view.irrGapPts, view.pricePremium, view.basisLine, view.feeLine]).toEqual([null, null, null, null, null, null]);

    const card = visibleText(renderToStaticMarkup(React.createElement(AssumableLoanCard, { view })));
    expect(card).toContain(LOAN_SENTENCE);
    expect(card).not.toMatch(/\bpoints? more\b|Less equity|More equity|Debt service saved|More debt service/);

    // The report prints the page's own sentence.
    const report = await reportText(loanOverPrice, { assumable: view });
    expect(report).toContain(LOAN_SENTENCE);
    expect(report).not.toContain("0 points");

    // The cover's two lines, and the documents' and the context's lines.
    expect(d.meta.assumable?.read).toBe(LOAN_SENTENCE);
    const bare = readAssumable(loanOverPrice, null, ASOF)!;
    expect(assumableLine(bare)).toMatch(
      /^The seller's loan is offered for assumption: \$30\.0M at 3\.50% to Jun 2029, amortizing over 30 years[^;]*; its \$30\.0M balance is more than the \$25\.0M price: check the balance$/,
    );
    expect(d.meta.assumable?.line).toBe(assumableLine(bare));
    expect(assumableContextLine(bare)).toContain(
      "; its $30.0M balance is more than the $25.0M price: check the balance. A balance at or over the price leaves no equity cheque",
    );
    expect(assumableContextLine(bare)).not.toContain("smaller balance");
  }, 45000);

  it("says a seller's note over the price on the card, the report and the cover, and prices nothing", async () => {
    const d = deriveUnderwriteInputs(noteOverPrice, "x");
    const s = readSellerFinancing(noteOverPrice, d.inputs)!;
    expect(s.overPrice).toEqual({ amount: 6e6, price: 5e6, stated: true });
    expect(s.read).toBeNull();
    const view = sellerFinancingView(s, d.sources.allInRatePct?.note ?? null, !!d.meta.rateSeed);
    expect(view.sentence).toBe(NOTE_SENTENCE);
    expect([view.extraEquity, view.debtServiceSaved, view.irrGapPts, view.pricePremium, view.dscrAssume]).toEqual([null, null, null, null, null]);
    const card = visibleText(renderToStaticMarkup(React.createElement(AssumableLoanCard, { view })));
    expect(card).toContain(NOTE_SENTENCE);
    expect(card).not.toMatch(/\bpoints? more\b/);
    const report = await reportText(noteOverPrice, { sellerNote: view });
    expect(report).toContain(NOTE_SENTENCE);
    expect(d.meta.sellerNote?.read).toBe(NOTE_SENTENCE);
    expect(d.meta.sellerNote?.line).toBe(
      "The seller offers to carry financing: $6.0M at 5.00% for 5 years, amortizing over 25 years; the note's $6.0M is more than the $5.0M price: check the note's amount",
    );
    expect(sellerFinancingDocLine(noteOverPrice)).toBe(d.meta.sellerNote?.line);
    expect(sellerFinancingContextLine(readSellerFinancing(noteOverPrice, null)!)).toContain(
      "; the note's $6.0M is more than the $5.0M price: check the note's amount. A note at or over the price leaves no equity cheque",
    );
  }, 45000);

  it("never prints a gap that did not solve as nought", () => {
    const d = deriveUnderwriteInputs(loanOverPrice, "x");
    // Under the price, a read whose returns did not both solve says so.
    const under = ex({ ...loanOverPrice, metrics: loanOverPrice.metrics.map((r) => (r.label === "Assumable loan balance" ? m(r.label, "20,000,000") : r)) });
    const a = readAssumable(under, d.inputs, ASOF)!;
    expect(a.overPrice).toBeNull();
    expect(a.read).not.toBeNull();
    const unsolved = { ...a, read: { ...a.read!, pricePremium: null, irrGapPts: null } };
    expect(assumableSentence(unsolved)).toMatch(
      /^No return gap is stated: the levered return of assuming it, or of the model's new loan, does not solve on the model's figures\. It comes due in Jun 2029/,
    );
    expect(assumableSentence(unsolved)).not.toContain("0 points");
  });

  it("says nothing new of a loan under the price, and never sets a placeholder's price in a document's line", () => {
    // A deal with no stated price: the documents' line sets nothing against
    // the model's placeholder.
    const unpriced = ex({ ...loanOverPrice, metrics: loanOverPrice.metrics.filter((r) => r.label !== "Asking price" && r.label !== "Going-in cap rate") });
    const d = deriveUnderwriteInputs(unpriced, "x");
    const a = readAssumable(unpriced, d.inputs, ASOF)!;
    expect(a.overPrice).toEqual({ amount: 30e6, price: d.inputs.purchasePrice, stated: false });
    expect(assumableLine(a)).toMatch(/^The seller's loan is offered for assumption: \$30\.0M at 3\.50% to Jun 2029, amortizing over 30 years[^;]*$/);
    expect(d.meta.assumable?.line).not.toContain("check the balance");
  });
});
