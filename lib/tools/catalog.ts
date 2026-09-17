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
/**
 * What a card is about, for the index's clusters.
 *
 * Added when the page passed twenty-five cards and the index became a
 * wall of chips — measured at 187KB of HTML, 4,165 words and 189 input
 * fields, which is a long way past the "thirteen cards is more than a
 * reader should scroll past" the index's own comment was written for.
 * Six named clusters of three to six scan; twenty-six in a row do not,
 * and the problem gets worse with every card rather than better.
 */
export type ToolGroup =
  | "Debt"
  | "Equity & returns"
  | "Leases"
  | "The property"
  | "Value & land"
  | "Tax & closing";

/** The clusters, in the order the index shows them. */
export const TOOL_GROUPS: readonly ToolGroup[] = [
  "Debt",
  "Equity & returns",
  "Leases",
  "The property",
  "Value & land",
  "Tax & closing",
] as const;

export interface ToolEntry {
  /** the card's anchor id on /tools */
  id: string;
  /** what a reader sees, in the index and in the homepage's shelf */
  label: string;
  /** which cluster the index files it under */
  group: ToolGroup;
}

export const TOOL_INDEX: readonly ToolEntry[] = [
  { id: "size-the-loan", label: "Size the loan", group: "Debt" },
  { id: "the-loan-over-the-hold", label: "Over the hold", group: "Debt" },
  { id: "cash-flow-strip", label: "Cash flow", group: "Equity & returns" },
  { id: "what-you-believe", label: "What you believe", group: "Equity & returns" },
  { id: "sources-and-uses", label: "Sources & uses", group: "Equity & returns" },
  { id: "capital-stack", label: "Capital stack", group: "Debt" },
  { id: "lease-buyout", label: "Lease buyout", group: "Leases" },
  { id: "floating-rate", label: "Floating rate", group: "Debt" },
  { id: "construction-draw", label: "Construction draw", group: "Debt" },
  { id: "prepayment", label: "Getting out early", group: "Debt" },
  { id: "trailing-window", label: "Trailing window", group: "The property" },
  { id: "economic-occupancy", label: "Doors vs dollars", group: "The property" },
  { id: "unit-mix", label: "Unit mix", group: "The property" },
  { id: "the-site", label: "The site", group: "The property" },
  { id: "residual-land", label: "Land residual", group: "Value & land" },
  { id: "the-waterfall", label: "LP / GP split", group: "Equity & returns" },
  { id: "net-effective-rent", label: "Net effective rent", group: "Leases" },
  { id: "rentable-vs-usable", label: "Rentable vs usable", group: "Leases" },
  { id: "after-tax", label: "After tax", group: "Tax & closing" },
  { id: "exchange-1031", label: "1031 exchange", group: "Tax & closing" },
  { id: "expense-recovery", label: "Expense recovery", group: "Leases" },
  { id: "percentage-rent", label: "Percentage rent", group: "Leases" },
  { id: "tax-reassessment", label: "Tax reassessment", group: "Tax & closing" },
  { id: "ground-lease", label: "Ground lease", group: "Value & land" },
  { id: "closing-proration", label: "Closing", group: "Tax & closing" },
  { id: "cap-rate-triangle", label: "Cap rate", group: "Value & land" },
  { id: "rent-converter", label: "Rent, four ways", group: "The property" },
  { id: "operating-expense", label: "One expense", group: "Leases" },
  { id: "build-or-buy", label: "Build or buy", group: "Value & land" },
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

/**
 * The cards clustered for the index, groups in `TOOL_GROUPS` order and
 * each group's cards in page order.
 *
 * Pure, so the index, the tests and anything else that wants the shape
 * read one function rather than three copies of this grouping.
 */
export function groupedTools(): { group: ToolGroup; tools: ToolEntry[] }[] {
  return TOOL_GROUPS.map((group) => ({
    group,
    tools: TOOL_INDEX.filter((t) => t.group === group),
  }));
}
