import { withArticle } from "@/lib/article";
import { loanConstant } from "./deal-math";

/**
 * The floating-rate loan, and the cap that is supposed to protect it.
 *
 * Every other debt card on `/tools` assumes a fixed rate. Most of what
 * actually gets screened in a transitional market is not fixed: bridge and
 * construction debt floats over SOFR at a spread, and the lender requires an
 * interest-rate cap as a condition of closing. The analyst's questions are
 * what the rate is today, where it stops working, whether the cap they were
 * quoted reaches that far, and what the cap is costing in a unit that can be
 * compared to a fixed quote.
 *
 * This is also the one card whose main input the site already knows: a
 * floating note references SOFR BY NAME, so today's SOFR is the index, with
 * no adjustment and no term to match. (The 10-year Treasury is not like
 * this — see the prepayment card, where the clause wants the Treasury
 * matched to the remaining term and the 10-year would flatter it.)
 *
 * Six rules, and the first is the one the whole card exists for.
 *
 * **1. A cap struck above the breach point protects nothing you care
 * about.** The lender requires a cap; the borrower buys the cheapest strike
 * that satisfies the requirement; nobody checks that strike against the
 * index level at which the loan breaches its OWN covenant. Where the strike
 * sits above it, the sequence is: rates rise, the loan breaches, the lender
 * takes control — and only later, at a level that no longer matters to the
 * borrower, does the cap begin to pay. The cap was protecting the lender's
 * loss severity the whole time. `capProtects` is that comparison and it is
 * the headline.
 *
 * **2. A cap and a floor are not a collar, and they do not even act on the
 * same thing.** The cap is bought and the floor is given away, so the rate
 * band is not centred on today; and since 2022 floors are routinely struck
 * at or above the prevailing index, which means the borrower is already
 * paying above the market rate and a fall in rates buys them nothing until
 * the index climbs back through the floor. `atFloor` names that state.
 *
 * The mechanical half matters too. A floor is a term of the NOTE — it lifts
 * what is owed. A cap is a separate instrument referencing the INDEX — it
 * reimburses whatever the index runs above the strike. So the rate paid is
 * `max(index, floor) + spread − max(0, index − strike)`, and the tempting
 * shorthand `min(max(index, floor), strike) + spread` is the same number
 * only while the floor sits below the strike. Where a legacy floor sits
 * above it, the shorthand quietly hands the borrower a cap payment that
 * nothing triggered.
 *
 * **3. The premium is a rate.** A $300,000 cap on a $20M loan running two
 * years is 75 bps a year. Quoted as a lump sum it reads like a closing cost
 * and gets compared to legal fees; quoted as a rate it goes straight beside
 * the fixed quote it is actually competing with, which is the decision being
 * made. `capCostBps`, and `allInWithCapPct` beside the bare rate.
 *
 * **4. The premium is a USE funded at closing** — the same rule
 * `sources-uses` states for the loan fee. Netting it out of proceeds
 * understates the loan and the equity together.
 *
 * **5. The premium is an input, never a model.** It is an option price and
 * pricing one needs a volatility surface, which is not screening arithmetic
 * and is not something this site should invent. It is a broker quote you
 * type, and the card says so.
 *
 * **6. The extension is where deals die.** A bridge loan's extension options
 * are conditional, and one of the conditions is a NEW cap — bought at
 * then-current prices, struck wherever the lender's test requires against
 * the then-current NOI. The premium cannot be known, but the STRIKE can:
 * it is the same solve as the breach point run on the extension's numbers,
 * and a strike far below today's index is a cap that will cost a fortune.
 */

const real = (n: number | null): n is number => n !== null && Number.isFinite(n);
const positive = (n: number | null): n is number => real(n) && n > 0;
const round = (n: number) => Math.round(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FloatingTerms {
  loanAmount: number | null;
  /** Today's index — SOFR, seeded live where the site has it. */
  indexPct: number | null;
  /** The credit spread over the index, in basis points. */
  spreadBps: number | null;
  /** An index floor, if the note has one. Null where it does not. */
  indexFloorPct: number | null;
  /** The cap's strike on the INDEX, not on the all-in rate. */
  capStrikePct: number | null;
  /** What the cap cost, as quoted. An option price, never derived here. */
  capPremium: number | null;
  /** How long the cap runs. */
  capTermMonths: number | null;
  /** Null for interest-only, which most bridge loans are. */
  amortYears: number | null;
  noi: number | null;
  /** The DSCR the loan documents test against. */
  covenantDscr: number | null;
  /** The NOI the business plan reaches by the extension, if it is being tested. */
  extensionNoi: number | null;
}

export interface FloatingRead {
  /** The index actually paid: today's, lifted by a floor, held by a strike. */
  indexUsedPct: number | null;
  atFloor: boolean;
  atCap: boolean;
  allInRatePct: number | null;
  debtServiceAnnual: number | null;
  paymentMonthly: number | null;
  dscr: number | null;

  /** The index at which DSCR reaches the covenant exactly. */
  breachIndexPct: number | null;
  /** How far today's index is from that, in basis points. Negative = already through. */
  breachHeadroomBps: number | null;
  /** Whether the cap engages before the covenant breaks. The headline. */
  capProtects: boolean | null;

  /** The all-in rate if the index sat at the strike all year. */
  worstCaseRatePct: number | null;
  worstCaseDscr: number | null;
  /** DSCR with no cap at all, at the breach point — always the covenant. */
  rateBandLowPct: number | null;
  rateBandHighPct: number | null;

  capCostBps: number | null;
  allInWithCapPct: number | null;
  /** What the cap pays out over a year at today's index. Zero below the strike. */
  capPayoffAnnual: number | null;

  /** The strike the lender's test will demand at the extension. */
  extensionStrikePct: number | null;

  /** One sentence naming the state that matters. */
  note: string | null;
}

/**
 * The rate whose annual loan constant is `target`.
 *
 * Interest-only inverts exactly; an amortising constant does not, so it is
 * bisected. The constant rises monotonically with the rate, which is what
 * makes a bisection the right tool rather than a scan — there is one root
 * and it is bracketed.
 */
export function rateForConstant(
  target: number,
  amortYears: number | null,
  io: boolean,
): number | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  if (io) return target * 100;
  if (!positive(amortYears)) return null;
  // A fully-amortising constant has a floor: even at a zero rate the loan
  // still repays itself over the term. A target under it is unreachable by
  // any rate, which is a real answer and not a failure.
  const floor = loanConstant(0, amortYears, false);
  if (floor === null || target <= floor) return null;

  let lo = 0;
  let hi = 40;
  const at = (r: number) => loanConstant(r, amortYears, false) ?? Number.POSITIVE_INFINITY;
  if (at(hi) < target) return null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function readFloating(t: FloatingTerms): FloatingRead {
  const empty: FloatingRead = {
    indexUsedPct: null,
    atFloor: false,
    atCap: false,
    allInRatePct: null,
    debtServiceAnnual: null,
    paymentMonthly: null,
    dscr: null,
    breachIndexPct: null,
    breachHeadroomBps: null,
    capProtects: null,
    worstCaseRatePct: null,
    worstCaseDscr: null,
    rateBandLowPct: null,
    rateBandHighPct: null,
    capCostBps: null,
    allInWithCapPct: null,
    capPayoffAnnual: null,
    extensionStrikePct: null,
    note: null,
  };

  const loan = positive(t.loanAmount) ? t.loanAmount : null;
  const spreadPct = real(t.spreadBps) ? t.spreadBps / 100 : null;
  if (loan === null || !real(t.indexPct) || spreadPct === null) return empty;

  const io = !positive(t.amortYears);

  // Rule 2, the mechanical half. The floor lifts what the NOTE charges; the
  // cap reimburses what the INDEX runs above the strike. Two instruments,
  // so the payment is the lift less the reimbursement — not the index
  // clamped into a band, which is the same number only while the floor sits
  // below the strike.
  const owedIndex = real(t.indexFloorPct)
    ? Math.max(t.indexPct, t.indexFloorPct)
    : t.indexPct;
  const capRelief = positive(t.capStrikePct)
    ? Math.max(0, t.indexPct - t.capStrikePct)
    : 0;
  const netIndex = owedIndex - capRelief;
  const atFloor = real(t.indexFloorPct) ? t.indexPct < t.indexFloorPct : false;
  const atCap = capRelief > 0;

  const allInRatePct = round2(netIndex + spreadPct);
  const k = loanConstant(allInRatePct, t.amortYears, io);
  const debtServiceAnnual = k === null ? null : round(loan * k);
  const paymentMonthly =
    debtServiceAnnual === null ? null : Math.round((debtServiceAnnual / 12) * 100) / 100;
  const dscr =
    positive(t.noi) && positive(debtServiceAnnual)
      ? Math.round((t.noi / debtServiceAnnual) * 100) / 100
      : null;

  // Rule 1: where the loan stops working, on the index's own scale.
  const breachAt = (noi: number | null, test: number | null): number | null => {
    if (!positive(noi) || !positive(test)) return null;
    const allowedDs = noi / test;
    const r = rateForConstant(allowedDs / loan, t.amortYears, io);
    if (r === null) return null;
    return round2(r - spreadPct);
  };

  const breachIndexPct = breachAt(t.noi, t.covenantDscr);
  // Measured from the INDEX, because that is the scale breachIndexPct is
  // stated on and a reader will subtract the two figures on the card. The
  // floor's effect on what is actually paid is carried by atFloor and
  // indexUsedPct, not smuggled into this subtraction.
  const breachHeadroomBps =
    breachIndexPct === null ? null : round((breachIndexPct - t.indexPct) * 100);

  // The comparison the card exists to draw. An uncapped loan protects
  // nothing by definition; a strike at or above the breach point is a cap
  // that engages only after the covenant has already gone.
  const capProtects =
    breachIndexPct === null
      ? null
      : positive(t.capStrikePct)
        ? t.capStrikePct < breachIndexPct
        : false;

  const worstCaseRatePct = positive(t.capStrikePct)
    ? round2(t.capStrikePct + spreadPct)
    : null;
  const worstK =
    worstCaseRatePct === null ? null : loanConstant(worstCaseRatePct, t.amortYears, io);
  const worstDs = worstK === null ? null : loan * worstK;
  const worstCaseDscr =
    positive(t.noi) && positive(worstDs)
      ? Math.round((t.noi / worstDs) * 100) / 100
      : null;

  const rateBandLowPct = real(t.indexFloorPct)
    ? round2(t.indexFloorPct + spreadPct)
    : round2(spreadPct);
  const rateBandHighPct = worstCaseRatePct;

  // Rule 3: the premium said as a rate, which is the only unit in which it
  // can be set beside a fixed quote.
  const years = positive(t.capTermMonths) ? t.capTermMonths / 12 : null;
  const capCostBps =
    positive(t.capPremium) && years !== null
      ? round((t.capPremium / loan / years) * 10_000)
      : null;
  const allInWithCapPct =
    capCostBps === null ? null : round2(allInRatePct + capCostBps / 100);

  // What the cap pays over a year at today's index — on the INDEX, never on
  // the floored rate, since the floor is the note's term and the cap has
  // never heard of it. Zero below the strike, and null with no cap at all.
  const capPayoffAnnual = positive(t.capStrikePct)
    ? round(loan * (capRelief / 100))
    : null;

  // Rule 6: the same solve, on the extension's numbers.
  const extensionStrikePct = positive(t.extensionNoi)
    ? breachAt(t.extensionNoi, t.covenantDscr)
    : null;

  return {
    indexUsedPct: round2(netIndex),
    atFloor,
    atCap,
    allInRatePct,
    debtServiceAnnual,
    paymentMonthly,
    dscr,
    breachIndexPct,
    breachHeadroomBps,
    capProtects,
    worstCaseRatePct,
    worstCaseDscr,
    rateBandLowPct,
    rateBandHighPct,
    capCostBps,
    allInWithCapPct,
    capPayoffAnnual,
    extensionStrikePct,
    note: noteFor({
      capProtects,
      breachIndexPct,
      capStrikePct: positive(t.capStrikePct) ? t.capStrikePct : null,
      breachHeadroomBps,
      atFloor,
      atCap,
      dscr,
      covenantDscr: positive(t.covenantDscr) ? t.covenantDscr : null,
    }),
  };
}

function noteFor(s: {
  capProtects: boolean | null;
  breachIndexPct: number | null;
  capStrikePct: number | null;
  breachHeadroomBps: number | null;
  atFloor: boolean;
  atCap: boolean;
  dscr: number | null;
  covenantDscr: number | null;
}): string | null {
  // Worst first: already through the covenant is not a warning about the
  // future, it is a description of now.
  if (s.dscr !== null && s.covenantDscr !== null && s.dscr < s.covenantDscr) {
    return `Already through the covenant: ${s.dscr.toFixed(2)}× against ${withArticle(s.covenantDscr.toFixed(2))}× test, at today's index.`;
  }
  if (s.capProtects === false && s.capStrikePct !== null && s.breachIndexPct !== null) {
    return `The cap is struck at ${s.capStrikePct.toFixed(2)}% and the covenant breaks at ${s.breachIndexPct.toFixed(2)}% — the loan fails before the cap pays anything.`;
  }
  if (s.capProtects === false && s.capStrikePct === null) {
    return "No cap: nothing stops the rate, and the covenant is the only limit.";
  }
  if (s.atCap) {
    return "The index is above the strike, so the cap is paying and the rate is fixed at the strike.";
  }
  if (s.atFloor) {
    return "The index is below the floor, so the floor is what is being paid — a further fall is worth nothing.";
  }
  if (s.capProtects === true && s.breachHeadroomBps !== null) {
    return `The cap engages before the covenant does, with ${s.breachHeadroomBps} bps between today's index and the breach.`;
  }
  return null;
}
