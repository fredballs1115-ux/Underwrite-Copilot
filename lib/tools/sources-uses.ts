/**
 * How the deal is capitalised — what it costs, and where the money comes
 * from.
 *
 * Sources and uses is the page an analyst builds before anything else and
 * the one nobody publishes, because it is arithmetic. What makes it worth a
 * tool rather than a napkin is that the two sides must BALANCE, and the
 * equity is what makes them balance — so the interesting question is never
 * "what are the sources" but "what is the cheque, once everything below the
 * purchase price is counted".
 *
 * Three rules this encodes.
 *
 * EQUITY IS THE PLUG, not an input. An analyst who types an equity figure
 * and a debt figure has stated a capital structure, not derived one; the
 * uses side decides the equity, and a tool that lets both be typed will
 * happily show a stack that does not add up.
 *
 * CLOSING COSTS AND RESERVES ARE USES, and they are the part people leave
 * out. A $20M purchase at 65% LTV is not $7M of equity — add 2% of closing
 * costs, a capital budget and an operating reserve and the cheque is nearer
 * $9M. That gap is the single most common miss in a screening model.
 *
 * A PERCENTAGE IS OF WHAT IT SAYS IT IS OF. Closing costs quote against the
 * PURCHASE PRICE, not against total uses — quoting them against a total
 * that includes themselves is circular, and the difference on a deal with a
 * large capital budget is real money.
 *
 * Pure, no I/O.
 */

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

export interface StackInputs {
  /** the purchase price, or a development's land cost */
  price: number | null;
  /** capital budget — renovation, construction, tenant improvements */
  capital: number | null;
  /** closing costs as a percent OF THE PRICE; ignored when a dollar figure
   *  is given instead */
  closingPct: number | null;
  /** closing costs as a dollar figure, which wins over the percent */
  closingAmount: number | null;
  /** an operating or interest reserve funded at closing */
  reserve: number | null;
  /** any other use — a fee, a deposit, a holdback */
  other: number | null;
  /** the loan; when null the deal is all cash */
  loan: number | null;
  /** loan fee (origination) as a percent of the loan — a USE, funded at
   *  closing out of the equity */
  loanFeePct: number | null;
}

export interface StackLine {
  label: string;
  amount: number;
  /** share of the side it sits on, 0–100 */
  sharePct: number;
}

export interface Stack {
  uses: StackLine[];
  sources: StackLine[];
  totalUses: number;
  totalSources: number;
  /** the cheque — total uses less the loan */
  equity: number | null;
  /** loan over total uses, 0–100 — the leverage that actually applies */
  loanToCostPct: number | null;
  /** loan over the price alone, 0–100 — the number a lender quotes */
  loanToPricePct: number | null;
  /** everything above the price, as a share of it, 0–100 */
  overPricePct: number | null;
  note: string | null;
}

const EMPTY: Stack = {
  uses: [],
  sources: [],
  totalUses: 0,
  totalSources: 0,
  equity: null,
  loanToCostPct: null,
  loanToPricePct: null,
  overPricePct: null,
  note: null,
};

/**
 * Builds the two sides.
 *
 * The sources side is the loan and then the equity that closes the gap, in
 * that order, and it balances by construction — there is no case where the
 * two sides differ, because the equity IS the difference. A loan larger
 * than total uses produces a negative equity line, which is reported rather
 * than clamped: it means the loan is oversized for the basis, and hiding
 * that behind a zero would be the one thing this must not do.
 */
export function buildStack(inp: StackInputs): Stack {
  if (!positive(inp.price)) {
    return { ...EMPTY, note: "Enter the purchase price, or a development's land cost." };
  }

  const price = inp.price;
  const capital = positive(inp.capital) ? inp.capital : 0;
  const reserve = positive(inp.reserve) ? inp.reserve : 0;
  const other = positive(inp.other) ? inp.other : 0;
  const loan = positive(inp.loan) ? inp.loan : 0;

  // A stated dollar figure wins over the percent — someone who typed the
  // actual number knows something the rule of thumb does not.
  const closing = positive(inp.closingAmount)
    ? inp.closingAmount
    : positive(inp.closingPct)
      ? price * (inp.closingPct / 100)
      : 0;

  // The loan fee is a USE funded at closing, not a reduction of the loan.
  // Netting it out of the proceeds understates both the loan and the
  // equity, and it is how the fee goes missing from a screening model.
  const loanFee = loan > 0 && positive(inp.loanFeePct) ? loan * (inp.loanFeePct / 100) : 0;

  const useLines: [string, number][] = [
    ["Purchase price", price],
    ["Capital budget", capital],
    ["Closing costs", closing],
    ["Loan fee", loanFee],
    ["Reserves", reserve],
    ["Other", other],
  ];
  const totalUses = useLines.reduce((s, [, v]) => s + v, 0);
  const equity = totalUses - loan;

  const sourceLines: [string, number][] = [
    ["Debt", loan],
    ["Equity", equity],
  ];
  const totalSources = sourceLines.reduce((s, [, v]) => s + v, 0);

  return {
    uses: linesOf(useLines, totalUses),
    sources: linesOf(sourceLines, totalSources),
    totalUses: round(totalUses),
    totalSources: round(totalSources),
    equity: round(equity),
    loanToCostPct: totalUses > 0 ? round((loan / totalUses) * 100, 1) : null,
    loanToPricePct: round((loan / price) * 100, 1),
    overPricePct: round(((totalUses - price) / price) * 100, 1),
    note:
      equity < 0
        ? "The loan is larger than everything the deal uses — check the loan amount against the basis."
        : null,
  };
}

/** Drops the zero lines and gives each survivor its share of the side. */
function linesOf(pairs: [string, number][], total: number): StackLine[] {
  return pairs
    .filter(([, v]) => Math.abs(v) >= 0.5)
    .map(([label, amount]) => ({
      label,
      amount: round(amount),
      // Share of the side, signed the way the amount is — a negative equity
      // line must not read as a positive share of the stack.
      sharePct: total !== 0 ? round((amount / total) * 100, 1) : 0,
    }));
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}
