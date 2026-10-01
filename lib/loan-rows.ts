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

/** The rows the extraction is asked to label "Assumable loan …" and
 *  "Assumption fee". */
export function assumableRows<M extends Row>(metrics: ReadonlyArray<M>) {
  const pick = pickFrom(metrics);
  return {
    balanceRow: pick(
      new RegExp(LOAN, "i"),
      /rate|coupon|maturity|matures|amorti[sz]|\bterm\b|fee|debt service|payment|interest[- ]only|\bi\/?o\b|ltv|loan[- ]to[- ]value|dscr/i,
    ),
    rateRow: pick(new RegExp(`${LOAN} (?:interest )?(?:rate|coupon)`, "i")),
    maturityRow: pick(new RegExp(`${LOAN} (?:maturity|matures)`, "i"), /extension|extended/i),
    amortRow: pick(new RegExp(`${LOAN} (?:amorti[sz]ation|interest[- ]only)`, "i")),
    dsRow: pick(new RegExp(`${LOAN} (?:annual )?(?:debt service|payment)`, "i")),
    feeRow: pick(/assumption fee/i),
  };
}

/** Every row of the loan offered for assumption the memorandum states, each
 *  with the term it states. None without a balance row: no balance, no
 *  loan offered. */
export function assumableStatedRows<M extends Row>(metrics: ReadonlyArray<M>): { term: string; row: M }[] {
  const r = assumableRows(metrics);
  if (!r.balanceRow) return [];
  return stated([
    ["Balance", r.balanceRow],
    ["Rate", r.rateRow],
    ["Maturity", r.maturityRow],
    ["Amortization", r.amortRow],
    ["Debt service", r.dsRow],
    ["Assumption fee", r.feeRow],
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
 *  term it states. None where it states no amount, rate or term. */
export function sellerNoteStatedRows<M extends Row>(metrics: ReadonlyArray<M>): { term: string; row: M }[] {
  const r = sellerNoteRows(metrics);
  if (!r.amountRow && !r.rateRow && !r.termRow) return [];
  return stated([
    ["Amount", r.amountRow],
    ["Rate", r.rateRow],
    ["Term", r.termRow],
    ["Amortization", r.amortRow],
    ["Position", r.positionRow],
  ]);
}
