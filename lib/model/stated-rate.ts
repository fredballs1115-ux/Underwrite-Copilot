// Whether the first-draft model's loan rate is a quote — PURE.
//
// The first-draft model (lib/anthropic/model-reconcile) always carries a
// loan rate: its schema requires one, and where no document states a rate
// the reconciliation picks one from today's indices. The debt sizer treated
// every such rate as a term sheet's and dropped today's dated index for it,
// so a rate the model had assumed was shown as the deal's quote (the
// documents-against-the-page audit of 2026-09-30).
//
// The rule is positive, because a list of words for "assumed" misses the
// filing it is most likely to see (an authority of "FRED" over "5-yr
// Treasury 4.78% + 200 bps") and refuses real quotes that happen to use one
// of its words ("Treasury + 185 bps", an "indicative market quote", an
// assumable loan). A rate is the documents' only where:
//   - a metric is the LOAN's rate: it names a rate or a coupon and nothing
//     else a model quotes as a rate (a tax rate, a fee, turnover, a rate's
//     type, a cap, growth, vacancy, a constant, a yield);
//   - that metric's chosen value is the rate the model runs on;
//   - it was won by a loan's own paper — a term sheet, a lender's quote, a
//     commitment, the loan's documents ("Loan terms" is the model's document
//     kind for them) or an assumable loan as stated — never by a feed, a
//     market norm or an assumption.
// A broker's pro forma financing line is an assumption, not a quote.

import type { ReconciledMetric, UnderwritingModel } from "@/lib/model/types";

/** A metric's words that make it a rate. */
const RATE = /(^|[\s_])rate\b|interest ?rate|loan ?rate|note ?rate|coupon|all[- ]?in/i;

/** The rates a model carries that are not the loan's. */
const NOT_THE_LOAN =
  /tax|fee|turnover|type|cap\b|cap ?rate|capitali[sz]|growth|vacanc|exit|occupan|absorption|constant|yield|discount|inflation|escalat|bump|reversion|going[- ]?in/i;

/** Where a rate is quoted: a loan's own paper. */
const LOAN_PAPER = /term ?sheet|quote|lender|commitment|loan|note\b|mortgage|financing terms|rate lock|bank/i;

/** An authority that is a feed, a norm or an assumption — never a quote.
 *  "market" is one only where it is not a market QUOTE, and "assum-" only
 *  where it is not an assumABLE loan. */
const NOT_A_QUOTE =
  /fred|treasury|sofr|today|index\b|survey|pmms|screening|market(?! quote)|norm\b|norms|assum(?!able)|default|estimat|typical|benchmark|rule of thumb|pro ?forma/i;

/** The figures a chosen value states, as percents. */
function percentsIn(value: string): number[] {
  const withPct = [...value.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  if (withPct.length) return withPct;
  return [...value.matchAll(/-?\d+(?:\.\d+)?/g)]
    .map((m) => Number(m[0]))
    .map((n) => (n > 0 && n < 1 ? n * 100 : n));
}

const isLoanRate = (m: ReconciledMetric) => {
  const words = `${m.key} ${m.label}`;
  return RATE.test(words) && !NOT_THE_LOAN.test(words);
};

const carries = (m: ReconciledMetric, ratePct: number) =>
  percentsIn(m.chosenValue).some((n) => Number.isFinite(n) && Math.abs(n - ratePct) <= 0.01);

const quoted = (m: ReconciledMetric) => {
  if (NOT_A_QUOTE.test(m.authority)) return false;
  if (LOAN_PAPER.test(m.authority)) return true;
  return m.sources.some((s) => LOAN_PAPER.test(s.doc) && !NOT_A_QUOTE.test(s.doc));
};

/** The model's loan rate where a loan's own paper states it, else null. */
export function statedModelRate(model: Pick<UnderwritingModel, "inputs" | "metrics"> | null | undefined): number | null {
  const rate = model?.inputs?.loan?.ratePct;
  if (rate == null || !Number.isFinite(rate)) return null;
  const metric = (model?.metrics ?? []).find((m) => isLoanRate(m) && carries(m, rate));
  if (!metric) return null;
  return quoted(metric) ? rate : null;
}
