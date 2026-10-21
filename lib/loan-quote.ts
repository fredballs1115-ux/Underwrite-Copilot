// The lender's quote on file (2026-10-21, the owner's decision): a term
// sheet the deal holds — a `loan_terms` document — whose rate the deal's
// first-draft model carries as a loan's own paper states it
// (lib/model/stated-rate, the debt sizer's own rule), handed to the stress
// test's debt row as `document` evidence that decides it in place of the
// screening default. Pure.
//
// Its rules:
//   - a quote is read only off a model built FROM a loan_terms document on
//     the deal (its `generatedFromIds`, else its document labels): a model
//     built before the term sheet arrived carries no quote of it;
//   - the rate is the loan's own metric, won by a loan's own paper and naming
//     the term sheet among its sources (`loanRateMetric`), never a feed, a
//     norm or an assumption;
//   - a fixed quote carries its rate (`statedModelRate`: the model runs on
//     it); a floating one (an index and a spread, a coupon that resets) is
//     carried as stated with no rate, priced on nothing, as the debt row
//     prices an OM's floating rate (lib/assumable-debt `floatingRateOf`);
//   - it is dated by the term sheet's own upload day, the day it was on file,
//     never the model's build.
// The shared screen never reads the sender's documents, so it is handed none.

import { floatingRateOf } from "@/lib/assumable-debt";
import { documentLabel } from "@/lib/model/provenance";
import { loanRateMetric, statedModelRate } from "@/lib/model/stated-rate";
import type { UnderwritingModel } from "@/lib/model/types";

export interface LoanQuote {
  /** the quoted rate in percent; null where the quote floats */
  ratePct: number | null;
  /** the rate exactly as the term sheet states it */
  stated: string;
  /** the quote is an index and a spread, or a coupon that resets */
  floating: boolean;
  /** the term sheet's file name */
  filename: string;
  /** the day it was put on file, ISO; null where not known */
  asOf: string | null;
}

export interface LoanDocument {
  id: string;
  kind: string;
  filename: string;
  created_at?: string | null;
}

const dayOf = (iso: string | null | undefined): string | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

/** The lender's quote the deal holds, or null where none is on file. */
export function loanQuoteOf(
  model: Pick<UnderwritingModel, "inputs" | "metrics" | "generatedFrom" | "generatedFromIds"> | null | undefined,
  documents: readonly LoanDocument[] | null | undefined,
): LoanQuote | null {
  if (!model) return null;
  const sheets = (documents ?? []).filter((d) => d.kind === "loan_terms");
  if (sheets.length === 0) return null;
  // The term sheets the model was built from.
  const ids = Array.isArray(model.generatedFromIds) ? model.generatedFromIds : null;
  const labels = model.generatedFrom ?? [];
  const built = sheets.filter((d) => (ids ? ids.includes(d.id) : labels.includes(documentLabel(d))));
  if (built.length === 0) return null;
  const metric = loanRateMetric(model);
  if (!metric) return null;
  // The rate is the term sheet's: one of the sheets named among its sources
  // or as the authority that won it, by file name or by kind.
  const names = (s: string) => /\bterm ?sheet\b|\bloan terms\b/i.test(s) || built.some((d) => d.filename && s.includes(d.filename));
  const sheet = built.find((d) => metric.sources.some((s) => d.filename && s.doc.includes(d.filename)) || metric.authority.includes(d.filename)) ?? built[built.length - 1];
  if (!names(metric.authority) && !metric.sources.some((s) => names(s.doc) || /\bterm ?sheet\b/i.test(s.basis))) return null;
  const stated = metric.chosenValue.trim();
  const floating = floatingRateOf(stated) != null;
  const rate = floating ? null : statedModelRate(model);
  if (!floating && rate == null) return null;
  return { ratePct: rate, stated, floating, filename: sheet.filename, asOf: dayOf(sheet.created_at) };
}
