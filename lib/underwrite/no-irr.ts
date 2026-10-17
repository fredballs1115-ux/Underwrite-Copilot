// Why a levered IRR did not solve (research pass 38, item 15). The page's
// tiles, the report and the workbook printed a null IRR as "—" beside a
// negative equity multiple, with no reason; each now says why, in these
// words. A floor under a non-recourse loss — the equity walking away rather
// than funding the shortfall — would change the return itself, and is the
// owner's call; this only says why no rate solved.
//
// No imports: the playground (a client component), the first-draft model's
// tab and the documents all read it.

/** The reasons, each the words after "no IRR: ". */
export const NO_IRR_WHY = {
  /** the sale's proceeds, net of its costs, fall short of the loan's balance */
  sale: "the sale does not repay the loan",
  /** the hold's cash flows and the sale, together, return the equity nothing */
  nothingBack: "the equity gets none of its cash back",
  /** anything else: no rate the solver searches makes the flows' value nought */
  noRate: "no rate solves on these cash flows",
} as const;

export type NoIrrWhy = keyof typeof NO_IRR_WHY;

/**
 * Why no levered IRR solved, from three figures every model holds: the rate
 * (null where none solved), the sale's net proceeds to the equity after the
 * loan's payoff, and all the cash the equity gets back over the hold, the
 * sale included. Null where the rate solved.
 */
export function noIrrWhy(irr: number | null | undefined, netSaleProceeds: number, cashBack: number): NoIrrWhy | null {
  if (irr != null && Number.isFinite(irr)) return null;
  if (netSaleProceeds < 0) return "sale";
  if (cashBack <= 0) return "nothingBack";
  return "noRate";
}

/** The words where a "—" stood: "no IRR: the sale does not repay the loan". */
export const noIrrText = (why: NoIrrWhy): string => `no IRR: ${NO_IRR_WHY[why]}`;

/** The short form a narrow cell prints, its reason said beside it. */
export const NO_IRR_SHORT = "no IRR";
