// What the model's returns carry for the costs of buying and selling, said
// beside them. The page's IRR runs on the model's defaults — no transfer or
// recordation tax, a closing hold, a cost of sale — and only the Excel model
// named them (lib/underwrite/workbook), so a return on a deal in a
// jurisdiction that taxes a deed read as if the deed were free (the
// site-researcher's pass of 2026-09-30). Pure, so the page and its test
// read one sentence; it states the inputs, never changes them.

import { withArticle } from "@/lib/article";

export interface CostInputs {
  transferTaxPct: number;
  recordationTaxPct: number;
  generalHoldPct: number;
  saleCostPct: number;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** One sentence: the transfer and recordation tax the returns carry, the
 *  closing hold and the cost of sale, each as the model holds it. The
 *  model charges a transfer tax on the purchase alone (the closing costs),
 *  so where it carries none the line says none is modelled there and that
 *  the cost of sale holds none a seller may owe at the exit — and never
 *  that a jurisdiction has a rate: some levy none (research pass 27: "not
 *  this jurisdiction's rate" read, on a Texas deal, as if Texas had one). */
export function costAssumptionsLine(i: CostInputs): string {
  const tax = (i.transferTaxPct || 0) + (i.recordationTaxPct || 0);
  const hold = withArticle(`${pct(i.generalHoldPct)} closing hold`);
  const sale = withArticle(`${pct(i.saleCostPct)} cost of sale`);
  return tax > 0
    ? `These returns carry ${hold}, ${sale} and ${pct(tax)} of the price in transfer and recordation tax on the purchase. Set each in the Excel model.`
    : `These returns carry ${hold} and ${sale}, and no transfer or recordation tax: none is modelled on the purchase, and the cost of sale carries none a seller may owe at the exit. Set each in the Excel model, entering the jurisdiction's tax where it levies one.`;
}

/**
 * Where the memorandum states no going-in cap, the exit is the model's
 * default: the gap between it and the model's own entry — its year-1 NOI over
 * its price — said, so the compression or expansion the default carries is
 * seen (research pass 38: a $10M office at an 8.00% entry read a 25.1% IRR on
 * the 6.00% default exit, 200 bps of compression nobody chose). "Default
 * 6.00%; the model's own year-1 NOI over its price is 8.00%: 200 bps of
 * compression ride in these returns". Null under 5 bps, or without an entry.
 * The exit's SOURCE note and the line under the playground's tiles read this
 * one sentence; which default the exit takes is the owner's.
 */
export function defaultExitGap(exitDec: number, entryDec: number | null | undefined): string | null {
  if (entryDec == null || !Number.isFinite(entryDec) || !(entryDec > 0) || !Number.isFinite(exitDec)) return null;
  const bps = Math.round((entryDec - exitDec) * 10_000);
  if (Math.abs(bps) < 5) return null;
  const two = (d: number) => `${(d * 100).toFixed(2)}%`;
  return `Default ${two(exitDec)}; the model's own year-1 NOI over its price is ${two(entryDec)}: ${Math.abs(bps).toLocaleString("en-US")} bps of ${
    bps > 0 ? "compression" : "expansion"
  } ride in these returns`;
}
