/**
 * The settlement statement: who owes whom on the day of closing.
 *
 * Every other calculator here answers a question about whether to buy. This
 * one answers the question that comes after yes, and it is the one people
 * most often get BACKWARDS rather than merely wrong — because two of its
 * rules reverse the direction of a payment depending on a fact about the
 * jurisdiction, not about the deal.
 *
 *   1. **Property taxes paid in ARREARS** (most US states) mean the seller
 *      owes the buyer for the part of the year the seller owned but has not
 *      yet paid for. Paid in ADVANCE, it is the other way round: the seller
 *      has already paid through a date past closing, and the buyer credits
 *      them back. Read the wrong way, the money moves the wrong direction
 *      and the error is twice the amount.
 *
 *   2. **Security deposits are the TENANTS' money.** They transfer to the
 *      buyer as a credit, because the buyer inherits the obligation to
 *      return them. They are not income, and they are not the seller's to
 *      keep; a statement that omits them hands the seller a windfall and
 *      leaves the buyer holding a liability it was never paid for.
 *
 * Two smaller rules that still move real money. Rent collected for the
 * month of closing belongs to whoever owns the building on each day, so the
 * seller credits the buyer the unexpired part. And the day of closing
 * itself is charged to ONE side — the seller by the common convention, the
 * buyer by some contracts — which the caller states rather than the module
 * assuming, because a day of a $20M building's taxes is real money and the
 * contract, not a default, decides it.
 *
 * Every figure is reported as a CREDIT to one side, signed and named, so
 * the statement reads the way a settlement statement reads rather than as a
 * pile of absolute values a reader has to assign directions to.
 *
 * Pure, no I/O.
 */

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function round(n: number, places = 2): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

/** Who is charged for the day the deal closes. */
export type ClosingDayTo = "seller" | "buyer";

/** When the tax bill covering the closing date is actually paid. */
export type TaxTiming = "arrears" | "advance";

export interface ProrationTerms {
  /** the closing date, as an ISO yyyy-mm-dd */
  closing: string | null;
  /** the first day of the tax period the bill covers, ISO */
  taxPeriodStart: string | null;
  /** the last day of that period, ISO — inclusive */
  taxPeriodEnd: string | null;
  /** the bill for that whole period */
  taxAmount: number | null;
  /** arrears: the bill is paid AFTER the period. advance: before it. */
  taxTiming: TaxTiming;
  /** the day of closing is charged to this side */
  closingDayTo: ClosingDayTo;
  /** rent the seller collected for the month closing falls in */
  rentCollected: number | null;
  /** security deposits the seller holds, with any interest owed on them */
  securityDeposits: number | null;
  /** the agreed price, only used to state the net wire */
  price: number | null;
  /** earnest money already in escrow, credited to the buyer at closing */
  deposit: number | null;
}

/** One line of the statement, signed by who it credits. */
export interface StatementLine {
  label: string;
  /** who the money moves to */
  to: ClosingDayTo;
  amount: number;
  note: string;
}

export interface ProrationRead {
  /** days in the tax period, inclusive of both ends */
  taxPeriodDays: number | null;
  /** days of that period the SELLER owned, by the stated closing-day rule */
  sellerDays: number | null;
  buyerDays: number | null;
  /** the tax proration, always signed to whoever it credits */
  taxLine: StatementLine | null;
  /** every line, in the order a statement reads */
  lines: StatementLine[];
  /** credits to the buyer less credits to the seller */
  netToBuyer: number | null;
  /** price less the buyer's net credits less the escrow deposit */
  cashToClose: number | null;
  note: string | null;
}

const EMPTY: ProrationRead = {
  taxPeriodDays: null,
  sellerDays: null,
  buyerDays: null,
  taxLine: null,
  lines: [],
  netToBuyer: null,
  cashToClose: null,
  note: null,
};

/** An ISO date as a UTC day number, or null. Dates only — no clocks here. */
function day(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  // Guard a real calendar date: Date.parse takes 2026-02-31 and rolls it.
  const d = new Date(t);
  if (d.toISOString().slice(0, 10) !== iso) return null;
  return Math.round(t / 86_400_000);
}

/** The last day of the month `iso` falls in, as a day number. */
function monthEnd(iso: string): number | null {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const t = Date.UTC(y, m, 0); // day 0 of the next month is this month's last
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null;
}

/** The first day of that month. */
function monthStart(iso: string): number | null {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1);
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null;
}

export function readProration(t: ProrationTerms): ProrationRead {
  const close = day(t.closing);
  if (close === null) {
    return { ...EMPTY, note: "Set the closing date as yyyy-mm-dd." };
  }

  const lines: StatementLine[] = [];
  let taxPeriodDays: number | null = null;
  let sellerDays: number | null = null;
  let buyerDays: number | null = null;
  let taxLine: StatementLine | null = null;

  const start = day(t.taxPeriodStart);
  const end = day(t.taxPeriodEnd);

  if (start !== null && end !== null && positive(t.taxAmount)) {
    if (end < start) {
      return { ...EMPTY, note: "The tax period ends before it starts." };
    }
    if (close < start || close > end) {
      return {
        ...EMPTY,
        note: "The closing date is outside the tax period, so there is nothing of that bill to prorate.",
      };
    }
    // Inclusive of both ends: a 2026 calendar year is 365 days, not 364.
    taxPeriodDays = end - start + 1;
    // The day of closing goes to ONE side, stated by the contract. Charging
    // it to the seller is the common convention and the module's default,
    // but it is an input because a day of a large bill is real money.
    sellerDays = close - start + (t.closingDayTo === "seller" ? 1 : 0);
    buyerDays = taxPeriodDays - sellerDays;

    const sellerShare = (t.taxAmount * sellerDays) / taxPeriodDays;
    // RULE ONE, and the one that reverses. In arrears the bill is not paid
    // yet, so the seller's share is money the buyer will hand over later on
    // the seller's behalf: the seller credits the buyer. In advance the
    // seller has already paid the whole period, so the buyer credits the
    // seller for the part after closing.
    taxLine =
      t.taxTiming === "arrears"
        ? {
            label: "Property taxes, unpaid",
            to: "buyer",
            amount: round(sellerShare),
            note: `${sellerDays} of ${taxPeriodDays} days the seller owned, on a bill the buyer will pay`,
          }
        : {
            label: "Property taxes, prepaid",
            to: "seller",
            amount: round(t.taxAmount - sellerShare),
            note: `${buyerDays} of ${taxPeriodDays} days after closing, already paid by the seller`,
          };
    lines.push(taxLine);
  }

  // Rent the seller collected for the closing month: the buyer owns the
  // days from closing to month end, so that part comes back to the buyer.
  if (positive(t.rentCollected) && t.closing) {
    const ms = monthStart(t.closing);
    const me = monthEnd(t.closing);
    if (ms !== null && me !== null) {
      const monthDays = me - ms + 1;
      const buyerRentDays = me - close + (t.closingDayTo === "seller" ? 0 : 1);
      if (buyerRentDays > 0) {
        lines.push({
          label: "Rent collected for the closing month",
          to: "buyer",
          amount: round((t.rentCollected * buyerRentDays) / monthDays),
          note: `${buyerRentDays} of ${monthDays} days the buyer owns the building`,
        });
      }
    }
  }

  // RULE TWO. The tenants' money, and the buyer inherits the obligation to
  // give it back. Never income, never the seller's to keep.
  if (positive(t.securityDeposits)) {
    lines.push({
      label: "Security deposits",
      to: "buyer",
      amount: round(t.securityDeposits),
      note: "the tenants' money — the buyer inherits the obligation to return it",
    });
  }

  if (positive(t.deposit)) {
    lines.push({
      label: "Earnest money in escrow",
      to: "buyer",
      amount: round(t.deposit),
      note: "already paid, so it comes off the wire rather than being paid twice",
    });
  }

  if (lines.length === 0) {
    return {
      ...EMPTY,
      taxPeriodDays,
      sellerDays,
      buyerDays,
      note: "Nothing to prorate yet — set the tax bill and its period, the rent collected, or the deposits held.",
    };
  }

  const netToBuyer = lines.reduce(
    (s, l) => s + (l.to === "buyer" ? l.amount : -l.amount),
    0,
  );

  return {
    taxPeriodDays,
    sellerDays,
    buyerDays,
    taxLine,
    lines,
    netToBuyer: round(netToBuyer),
    cashToClose: positive(t.price) ? round(t.price - netToBuyer) : null,
    note: null,
  };
}
