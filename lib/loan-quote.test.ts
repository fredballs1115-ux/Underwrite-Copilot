// The lender's quote on file (lib/loan-quote): a term sheet the deal holds,
// read off the first-draft model built from it, never a rate a feed, a norm
// or the OM's own pro forma won.
import { describe, expect, it } from "vitest";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { loanQuoteOf } from "./loan-quote";
import type { ReconciledMetric } from "./model/types";

const metric = (over: Partial<ReconciledMetric> = {}): ReconciledMetric => ({
  key: "rate",
  label: "Interest rate",
  chosenValue: "6.25%",
  unit: "%",
  sources: [{ doc: "Brixton term sheet.pdf", value: "6.25%", locator: "p. 1", basis: "term sheet" }],
  authority: "Loan terms",
  rationale: "",
  confidence: "high",
  isConflict: false,
  ...over,
});
const sheet = { id: "doc-1", kind: "loan_terms", filename: "Brixton term sheet.pdf", created_at: "2026-10-03T14:05:00Z" };
const om = { id: "doc-0", kind: "om", filename: "Maddox OM.pdf", created_at: "2026-10-01T09:00:00Z" };
const model = (metrics: ReconciledMetric[], ratePct = 6.25, ids: string[] | undefined = ["doc-0", "doc-1"]) => ({
  inputs: { ...SAMPLE_DEAL.model.inputs, loan: { ...SAMPLE_DEAL.model.inputs.loan, ratePct } },
  metrics,
  generatedFrom: ["Offering memorandum: Maddox OM.pdf", "Loan terms: Brixton term sheet.pdf"],
  ...(ids ? { generatedFromIds: ids } : {}),
});

describe("loanQuoteOf", () => {
  it("reads a fixed rate the term sheet states, dated by the sheet's upload", () => {
    expect(loanQuoteOf(model([metric()]), [om, sheet])).toEqual({ ratePct: 6.25, stated: "6.25%", floating: false, filename: "Brixton term sheet.pdf", asOf: "2026-10-03" });
    // A model stored before it kept ids is matched by its documents' labels.
    expect(loanQuoteOf(model([metric()], 6.25, undefined), [om, sheet])?.ratePct).toBe(6.25);
  });

  it("carries a floating quote as stated, priced on nothing", () => {
    const q = loanQuoteOf(model([metric({ chosenValue: "SOFR + 2.75%" })], 7.05), [om, sheet]);
    expect(q).toMatchObject({ ratePct: null, stated: "SOFR + 2.75%", floating: true });
  });

  it("reads none with no term sheet on file, from a model built before it, or off a rate no loan's paper won", () => {
    expect(loanQuoteOf(model([metric()]), [om])).toBeNull();
    expect(loanQuoteOf(model([metric()], 6.25, ["doc-0"]), [om, sheet])).toBeNull();
    expect(loanQuoteOf(null, [om, sheet])).toBeNull();
    // A feed's rate is no quote, nor the OM's assumable loan.
    expect(loanQuoteOf(model([metric({ authority: "FRED", sources: [{ doc: "FRED", value: "6.25%", locator: "", basis: "5-yr Treasury + 200 bps" }] })]), [om, sheet])).toBeNull();
    expect(loanQuoteOf(model([metric({ authority: "OM (assumable loan)", sources: [{ doc: "OM", value: "6.25%", locator: "", basis: "assumable loan, as stated" }] })]), [om, sheet])).toBeNull();
    // The sample's model is a fixture no term sheet built.
    expect(loanQuoteOf(SAMPLE_DEAL.model, [om])).toBeNull();
  });
});
