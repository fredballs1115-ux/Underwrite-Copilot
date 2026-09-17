/**
 * What `/tools` answers — one list, read by everything that names it.
 *
 * It exists because the homepage kept going stale. `/tools` grew from four
 * calculators to fifteen over two rounds, and the homepage went on
 * describing it as "size a loan, or run the cap rate math" the whole time.
 * A list in one place, imported by the page that renders the cards AND by
 * the page that advertises them, makes that particular drift impossible
 * rather than merely unlikely.
 *
 * `id` is the card's anchor on `/tools`. The page's jump index renders from
 * this list and each card takes its `id` from it, and a render test holds
 * the two together in both directions — every link must name a card that
 * exists, and every card must be reachable from the index. `label` is what
 * a reader sees in both places, so it is short enough to sit in a chip.
 *
 * Order is the order the cards appear on the page.
 *
 * Pure data, no I/O — which is why a server-rendered homepage can import it
 * without pulling the client bundle in behind it.
 */
export interface ToolEntry {
  /** the card's anchor id on /tools */
  id: string;
  /** what a reader sees, in the index and in the homepage's shelf */
  label: string;
}

export const TOOL_INDEX: readonly ToolEntry[] = [
  { id: "size-the-loan", label: "Size the loan" },
  { id: "the-loan-over-the-hold", label: "Over the hold" },
  { id: "cash-flow-strip", label: "Cash flow" },
  { id: "sources-and-uses", label: "Sources & uses" },
  { id: "unit-mix", label: "Unit mix" },
  { id: "the-site", label: "The site" },
  { id: "residual-land", label: "Land residual" },
  { id: "the-waterfall", label: "LP / GP split" },
  { id: "net-effective-rent", label: "Net effective rent" },
  { id: "rentable-vs-usable", label: "Rentable vs usable" },
  { id: "after-tax", label: "After tax" },
  { id: "exchange-1031", label: "1031 exchange" },
  { id: "expense-recovery", label: "Expense recovery" },
  { id: "percentage-rent", label: "Percentage rent" },
  { id: "tax-reassessment", label: "Tax reassessment" },
  { id: "ground-lease", label: "Ground lease" },
  { id: "closing-proration", label: "Closing" },
  { id: "cap-rate-triangle", label: "Cap rate" },
  { id: "rent-converter", label: "Rent, four ways" },
  { id: "operating-expense", label: "One expense" },
  { id: "build-or-buy", label: "Build or buy" },
] as const;

/**
 * How many calculations `/tools` runs.
 *
 * Not the same as the number of cards: "Over the hold" answers the schedule
 * AND the refinance test, which are two different questions sharing one set
 * of inputs. Every surface that prints a count reads this, so the page's own
 * description, the homepage and the docs cannot disagree about it.
 */
export const TOOL_COUNT = TOOL_INDEX.length + 1;
