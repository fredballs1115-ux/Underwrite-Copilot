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
