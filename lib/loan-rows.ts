// The rows a memorandum labels for a loan that is not the buyer's new
// financing: the seller's loan offered for assumption (#417) and the note
// the seller offers to carry (#462). One finder each, read by the readers
// that price them (lib/assumable-debt, lib/seller-financing), by the key
// terms, and by the deal page's debt sizer, which lists them under whose
// loan they are rather than as the buyer's terms. No imports, so the
// client's debt sizer can read the rows without the engine that prices
// them.

type Row = { label: string; value: string };

const pickFrom =
  <M extends Row>(metrics: ReadonlyArray<M>) =>
  (re: RegExp, not?: RegExp): M | null =>
    metrics.find((m) => m && typeof m.label === "string" && re.test(m.label) && !(not && not.test(m.label))) ?? null;

/** A term and the row that states it, in the order a list of them reads. */
const stated = <M extends Row>(rows: [string, M | null][]): { term: string; row: M }[] =>
  rows.filter((e): e is [string, M] => e[1] != null).map(([term, row]) => ({ term, row }));

// ── The loan offered for assumption ─────────────────────────────────────

const LOAN = "assumable (?:loan|debt|mortgage|financing)";
/** A second loan offered with the first — a supplemental, a mezzanine loan
 *  or a second lien — which the extraction files under "Assumable
 *  supplemental loan …" (research pass 37). Its rows are never the first
 *  loan's: "Assumable supplemental loan balance" names no "assumable loan",
 *  and a first loan's label that names a second loan is refused. */
const SECOND = String.raw`assumable\s+(?:supplemental(?:\s+(?:loan|debt|mortgage|financing))?|(?:second|2nd|mezzanine|subordinate|junior)\s+(?:loan|debt|mortgage|financing|lien))`;
const NAMES_SECOND = /\bsupplemental\b|\b(?:second|2nd|mezzanine|subordinate|junior)\b/i;
/** A balance's label names none of the loan's other terms. */
const NOT_BALANCE = /rate|coupon|maturity|matures|amorti[sz]|\bterm\b|fee|debt service|payment|interest[- ]only|\bi\/?o\b|ltv|loan[- ]to[- ]value|dscr/i;

const or = (...res: RegExp[]) => new RegExp(res.map((re) => re.source).join("|"), "i");

/** The rows the extraction is asked to label "Assumable loan …",
 *  "Assumption fee", "Mortgage insurance premium", "Prepayment" and
 *  "Assumable supplemental loan …". */
export function assumableRows<M extends Row>(metrics: ReadonlyArray<M>) {
  const pick = pickFrom(metrics);
  return {
    balanceRow: pick(new RegExp(LOAN, "i"), or(NOT_BALANCE, NAMES_SECOND)),
    // An interest rate cap is its own row, never the loan's rate.
    rateRow: pick(new RegExp(`${LOAN} (?:interest )?(?:rate|coupon)`, "i"), or(/\bcap\b/, NAMES_SECOND)),
    maturityRow: pick(new RegExp(`${LOAN} (?:maturity|matures)`, "i"), or(/extension|extended/, NAMES_SECOND)),
    amortRow: pick(new RegExp(`${LOAN} (?:amorti[sz]ation|interest[- ]only)`, "i"), NAMES_SECOND),
    dsRow: pick(new RegExp(`${LOAN} (?:annual )?(?:debt service|payment)`, "i"), NAMES_SECOND),
    feeRow: pick(/assumption fee/i),
    /** an interest rate cap on a floating loan: its strike and expiry, as
     *  stated */
    capRow: pick(new RegExp(`${LOAN} (?:interest )?rate cap`, "i"), NAMES_SECOND),
    /** a HUD-insured loan's annual mortgage insurance premium, as stated */
    mipRow: pick(/^\s*(?:annual\s+)?(?:mortgage\s+insurance\s+premium|mip)\b/i),
    /** the loan's prepayment terms, as stated: a lockout, yield
     *  maintenance or defeasance, and whether the sale is subject to it */
    prepaymentRow: pick(new RegExp(`^\\s*(?:${LOAN}\\s+)?prepayment\\b`, "i")),
    secondBalanceRow: pick(new RegExp(SECOND, "i"), NOT_BALANCE),
    secondRateRow: pick(new RegExp(String.raw`${SECOND}\s+(?:interest\s+)?(?:rate|coupon)`, "i"), /\bcap\b/i),
    secondMaturityRow: pick(new RegExp(String.raw`${SECOND}\s+(?:maturity|matures)`, "i"), /extension|extended/i),
  };
}

/** Every row of the loan offered for assumption the memorandum states, each
 *  with the term it states — a balance or not. A row named for the seller's
 *  loan is that loan's: listed with no balance beside it, "Assumable loan
 *  rate 3.45%" had fallen through to the buyer's own financing as a plain
 *  rate. (What prices the loan, lib/assumable-debt, still prices none
 *  without a balance.) A mortgage insurance premium and a prepayment row
 *  name no loan, so they are the seller's loan's only beside a row that
 *  does. */
export function assumableStatedRows<M extends Row>(metrics: ReadonlyArray<M>): { term: string; row: M }[] {
  const r = assumableRows(metrics);
  const aLoan = [r.balanceRow, r.rateRow, r.maturityRow, r.amortRow, r.dsRow, r.capRow, r.secondBalanceRow, r.secondRateRow, r.secondMaturityRow].some(
    (m) => m != null,
  );
  return stated([
    ["Balance", r.balanceRow],
    ["Rate", r.rateRow],
    ["Rate cap", r.capRow],
    ["Maturity", r.maturityRow],
    ["Amortization", r.amortRow],
    ["Debt service", r.dsRow],
    ["Assumption fee", r.feeRow],
    ["Mortgage insurance premium", aLoan ? r.mipRow : null],
    ["Prepayment", aLoan ? r.prepaymentRow : null],
    ["Supplemental balance", r.secondBalanceRow],
    ["Supplemental rate", r.secondRateRow],
    ["Supplemental maturity", r.secondMaturityRow],
  ]);
}

// ── The note the seller offers to carry ─────────────────────────────────

const NOTE = String.raw`(?:seller(?:[- ]carry|[- ]carried|[- ]financed)?\s+(?:financing|carry(?:back)?|note|loan|mortgage|paper)|purchase[- ]money\s+(?:mortgage|note|loan))`;
const AMOUNT = new RegExp(String.raw`^${NOTE}(?:\s+(?:amount|loan amount|principal|size))?$`, "i");
const RATE = new RegExp(String.raw`${NOTE}.*\b(?:rate|coupon|interest)\b`, "i");
const TERM = new RegExp(String.raw`${NOTE}.*\b(?:term|maturity|balloon|due)\b`, "i");
const AMORT = new RegExp(String.raw`${NOTE}.*\b(?:amorti[sz]\w*|interest[- ]only)\b`, "i");
const POSITION = new RegExp(String.raw`${NOTE}.*\b(?:position|lien|priority)\b`, "i");

/** The rows the extraction is asked to label "Seller financing …". */
export function sellerNoteRows<M extends Row>(metrics: ReadonlyArray<M>) {
  const pick = pickFrom(metrics);
  return {
    amountRow: pick(AMOUNT),
    rateRow: pick(RATE, /\bterm\b|amorti|position/i),
    termRow: pick(TERM, /amorti|rate|position/i),
    amortRow: pick(AMORT, /rate|position/i),
    positionRow: pick(POSITION),
  };
}

/** Every row of the seller's note the memorandum states, each with the
 *  term it states, whichever they are: a note's amortization stated alone
 *  is the note's, never the buyer's financing. */
export function sellerNoteStatedRows<M extends Row>(metrics: ReadonlyArray<M>): { term: string; row: M }[] {
  const r = sellerNoteRows(metrics);
  return stated([
    ["Amount", r.amountRow],
    ["Rate", r.rateRow],
    ["Term", r.termRow],
    ["Amortization", r.amortRow],
    ["Position", r.positionRow],
  ]);
}
