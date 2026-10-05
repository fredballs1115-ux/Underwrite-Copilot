// The most a buyer can bid on a property sold at auction or out of a
// distressed sale (#456): the model's all-in ceiling at the buyer's hurdle
// — the max-bid solver behind the playground and the report — backed out
// of the buyer's premium by lib/sale-terms. One function, so the deal page,
// the workbook cover and the report say the same sentence at the same
// hurdle.
//
// Pure: the solver runs the engine, nothing is read.

import type { ExtractionResult } from "@/lib/anthropic/types";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import { solveMaxBid } from "@/lib/underwrite/solver";
import { DEFAULT_HURDLE_PCT } from "@/lib/underwrite/report-grid";
import { ceilingBidLine, hammerFor, readSale } from "@/lib/sale-terms";

/** The screening hurdle where the buyer has set none — the report grid's
 *  own default, so the report and this read agree. */
export const SALE_HURDLE_PCT = DEFAULT_HURDLE_PCT;

export interface SaleCeiling {
  /** "At a 15% levered IRR the model pays at most $3.15M all-in — a hammer
   *  price of $3M with the 5% premium on top, $500,000 over the starting
   *  bid." — "" where no ceiling is found */
  line: string;
  /** the most the model pays all-in, and the hammer that allows it */
  maxAllIn: number | null;
  hammer: number | null;
  /** the model still clears the hurdle at the top of the range the solver
   *  searched (`MAX_BID_SEARCH_X` times the modelled price): `maxAllIn` is
   *  then a floor of what it pays, its own ceiling above the range */
  unbounded: boolean;
  hurdlePct: number;
}

/** The ceiling bid at a hurdle; null where the deal is not sold at auction
 *  or out of a distressed sale. */
export function saleCeiling(
  extraction: ExtractionResult | null | undefined,
  inputs: UnderwriteInputs,
  hurdlePct: number = SALE_HURDLE_PCT,
): SaleCeiling | null {
  const sale = readSale(extraction);
  if (!sale) return null;
  const solved = solveMaxBid(inputs, { minIrr: hurdlePct / 100 });
  const maxAllIn = solved.price != null && solved.price > 0 ? solved.price : null;
  return {
    line: ceilingBidLine(sale, maxAllIn, hurdlePct, solved.unbounded, inputs.purchasePrice),
    maxAllIn,
    hammer: maxAllIn != null ? hammerFor(maxAllIn, sale.premium) : null,
    unbounded: solved.unbounded,
    hurdlePct,
  };
}

/** The ceiling's sentence alone, for the workbook's cover. */
export function saleCeilingRead(
  extraction: ExtractionResult | null | undefined,
  inputs: UnderwriteInputs,
  hurdlePct: number = SALE_HURDLE_PCT,
): string {
  return saleCeiling(extraction, inputs, hurdlePct)?.line ?? "";
}
