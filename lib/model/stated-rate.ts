// Whether the first-draft model's loan rate is a quote — PURE.
//
// The first-draft model (lib/anthropic/model-reconcile) always carries a
// loan rate: its schema requires one, and where no document states a rate
// the reconciliation picks one from today's indices. The debt sizer treated
// every such rate as a term sheet's and dropped today's dated index for it,
// so a rate the model had assumed was shown as the deal's quote (the
// documents-against-the-page audit of 2026-09-30). A quote is a rate a
// document states: the model's rate metric won by a document, never by a
// market norm, a default or an assumption.

import type { UnderwritingModel } from "@/lib/model/types";

/** The words a reconciliation files an assumed figure's source under. */
const ASSUMED = /market|norm|assum|default|estimat|typical|benchmark|rule of thumb|index/i;

/** The model's loan rate where a document states it, else null. */
export function statedModelRate(model: Pick<UnderwritingModel, "inputs" | "metrics"> | null | undefined): number | null {
  const rate = model?.inputs?.loan?.ratePct;
  if (rate == null || !Number.isFinite(rate)) return null;
  const metric = (model?.metrics ?? []).find((m) => {
    const words = `${m.key} ${m.label}`;
    return /(^|[\s_])rate\b|interest ?rate|loan ?rate|note ?rate|coupon/i.test(words) && !/cap|growth|vacanc|exit|occupan|absorption/i.test(words);
  });
  if (!metric) return null;
  if (ASSUMED.test(metric.authority)) return null;
  return metric.sources.some((s) => !ASSUMED.test(`${s.doc} ${s.basis}`)) ? rate : null;
}
