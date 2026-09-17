// What you can pay and still earn what you need — PURE.
//
// Every other card here judges a price somebody else set. This one solves
// for it, which is the last thing an analyst does before picking up the
// phone — and it is the calculation people fudge hardest, because doing it
// properly is circular.
//
// THE PRICE IS CIRCULAR THROUGH THE DEBT. A lower price means a smaller
// loan at the same loan-to-value, which changes both the cheque and the
// debt service, which changes the return — so the price cannot be scaled
// off a return at some other price. It has to be SOLVED. The levered IRR
// is monotone decreasing in price (pay more for the same building and the
// same exit, earn less), so a bisection is exact and terminates, and a
// test rebuilds the whole stream at the solved price and runs it through
// `irr` from `lib/underwrite/engine` — the one behind the Excel export —
// to check the answer comes back as the target.
//
// Three more rules.
//
// 1. WHICH LENDER TEST BINDS MOVES WITH THE PRICE. Loan-to-value scales
//    with the price and the coverage tests do not, so at a low price the
//    coverage tests bind and at a high one LTV does. `bindingFlipPrice`
//    solves for where the answer changes hands, because a bid sitting near
//    it is a bid whose financing assumption is about to stop being true.
//
// 2. A LEVERED TARGET BELONGS HERE, and only here. `what-you-believe`
//    says out loud that its return is unlevered, because a levered number
//    typed into an unlevered solve makes every deal look heroic. This card
//    is the complement: the debt is modelled, so the target is the equity
//    return the money actually wants.
//
// 3. THE CHEQUE IS NOT THE PRICE LESS THE LOAN. Closing costs and the loan
//    fee are funded at closing — `sources-uses`' rule — so they are part of
//    the equity at risk and therefore part of the return. Leaving them out
//    overstates the bid, which is the direction that loses money.

import { irr } from "@/lib/underwrite/engine";
import { sizeLoan, type LoanTest } from "@/lib/tools/deal-math";
import { readDebt } from "@/lib/tools/debt-math";

export interface BidYear {
  year: number;
  noi: number;
  debtService: number;
  cashFlow: number;
  loanBalance: number;
}

export interface BidResult {
  /** the most you can pay and still clear the target */
  maxPrice: number | null;
  /** the going-in cap that price implies on year one's NOI */
  capAtMaxPricePct: number | null;
  loan: number | null;
  /** price less the loan, plus the costs funded at closing — rule 3 */
  equity: number | null;
  closingCosts: number | null;
  loanFee: number | null;
  /** which lender test governs at that price */
  bindingTest: string | null;
  tests: LoanTest[];
  ltvPct: number | null;
  dscr: number | null;
  debtYieldPct: number | null;
  years: BidYear[];
  /** the exit, capitalising the FORWARD NOI */
  exitValue: number | null;
  /** …less the cost of selling and the balance owed */
  netSaleProceeds: number | null;
  /** the equity stream, year 0 first — what the IRR is taken on */
  flows: number[];
  /** that stream run back through `irr`; it should return the target */
  checkIrrPct: number | null;
  /**
   * The price where the binding lender test changes hands — rule 1. Null
   * when only one test is set, or when no crossing exists in range.
   */
  bindingFlipPrice: number | null;
  note: string;
}

const EMPTY: BidResult = {
  maxPrice: null,
  capAtMaxPricePct: null,
  loan: null,
  equity: null,
  closingCosts: null,
  loanFee: null,
  bindingTest: null,
  tests: [],
  ltvPct: null,
  dscr: null,
  debtYieldPct: null,
  years: [],
  exitValue: null,
  netSaleProceeds: null,
  flows: [],
  checkIrrPct: null,
  bindingFlipPrice: null,
  note: "Enter next year's NOI and the return the equity needs.",
};

const round = (n: number) => Math.round(n);
const round2 = (n: number) => Math.round(n * 100) / 100;
const real = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
const positive = (n: number | null | undefined): n is number => real(n) && n > 0;
const pctOf = (n: number | null | undefined): number => (real(n) && n > 0 ? n / 100 : 0);

export interface BidInput {
  /** the NOI over the first year of ownership */
  year1Noi: number;
  noiGrowthPct: number;
  holdYears: number;
  exitCapPct: number;
  sellingCostPct: number;
  /** the equity's required return — levered, and rule 2 says why */
  targetLeveredIrrPct: number;
  /** the lender's tests; a blank one is not a test (`sizeLoan`'s rule) */
  maxLtvPct?: number | null;
  minDscr?: number | null;
  minDebtYieldPct?: number | null;
  ratePct: number;
  amortYears: number;
  ioYears?: number | null;
  /** funded at closing, as a percent of the loan */
  loanFeePct?: number | null;
  /** funded at closing, as a percent of the PRICE (`sources-uses`' rule) */
  closingCostPct?: number | null;
}

/** Everything that follows from one candidate price. */
function atPrice(t: BidInput, price: number) {
  const hold = Math.max(1, Math.round(t.holdYears));
  const growth = pctOf(t.noiGrowthPct);
  const sizing = sizeLoan({
    price,
    noi: t.year1Noi,
    ratePct: t.ratePct,
    amortYears: t.amortYears,
    io: positive(t.ioYears) ? t.ioYears >= hold : false,
    maxLtvPct: real(t.maxLtvPct) ? t.maxLtvPct : null,
    minDscr: real(t.minDscr) ? t.minDscr : null,
    minDebtYieldPct: real(t.minDebtYieldPct) ? t.minDebtYieldPct : null,
  });
  const loan = sizing.loan ?? 0;

  // ONE amortisation schedule in this codebase.
  const debt =
    loan > 0
      ? readDebt({
          loan,
          ratePct: t.ratePct,
          amortYears: t.amortYears,
          ioYears: real(t.ioYears) ? t.ioYears : null,
          termYears: hold,
        })
      : null;

  const years: BidYear[] = [];
  for (let y = 1; y <= hold; y++) {
    const noi = t.year1Noi * Math.pow(1 + growth, y - 1);
    const row = debt?.years.find((d) => d.year === y);
    const debtService = row ? row.debtService : 0;
    years.push({
      year: y,
      noi: round(noi),
      debtService: round(debtService),
      cashFlow: round(noi - debtService),
      loanBalance: round(row ? row.closing : loan),
    });
  }

  // The exit capitalises the FORWARD NOI — what the next buyer is buying.
  const forwardNoi = t.year1Noi * Math.pow(1 + growth, hold);
  const exitValue = positive(t.exitCapPct) ? forwardNoi / (t.exitCapPct / 100) : 0;
  const balanceOwed = years.length ? years[years.length - 1].loanBalance : loan;
  const netSaleProceeds = exitValue - exitValue * pctOf(t.sellingCostPct) - balanceOwed;

  // Rule 3: the cheque includes what is funded at closing.
  const closingCosts = price * pctOf(t.closingCostPct);
  const loanFee = loan * pctOf(t.loanFeePct);
  const equity = price - loan + closingCosts + loanFee;

  const flows: number[] = [-equity];
  for (const y of years) flows.push(y.cashFlow);
  flows[flows.length - 1] += netSaleProceeds;

  return { sizing, loan, years, exitValue, netSaleProceeds, closingCosts, loanFee, equity, flows };
}

function leveredIrrAt(t: BidInput, price: number): number | null {
  const built = atPrice(t, price);
  if (built.equity <= 0) return null;
  const r = irr(built.flows);
  return r === null ? null : r * 100;
}

export function readBid(t: BidInput): BidResult {
  if (!positive(t.year1Noi)) return EMPTY;
  if (!real(t.targetLeveredIrrPct)) return EMPTY;
  if (!positive(t.exitCapPct)) {
    return { ...EMPTY, note: "Enter the cap the next buyer would pay." };
  }
  const hold = Math.max(1, Math.round(t.holdYears));
  if (!positive(t.holdYears) || hold > 30) {
    return { ...EMPTY, note: "Enter a hold between one and thirty years." };
  }

  // The levered IRR falls as the price rises, so bisect between a price that
  // clears the target easily and one that cannot.
  let lo = t.year1Noi; // absurdly cheap: a 100% cap
  const clears = (p: number) => {
    const r = leveredIrrAt(t, p);
    return r !== null && r >= t.targetLeveredIrrPct;
  };
  if (!clears(lo)) {
    // Two different failures land here and they want different answers.
    // The coverage tests are fixed by the NOI and do not scale with the
    // price, so with no loan-to-value cap the low end of the search sizes a
    // loan LARGER than the building — equity goes negative, the return is
    // undefined, and the bracket never opens. That is a missing input, not
    // an unreachable target, and saying "out of reach" would send someone
    // to renegotiate a return when what they need is an LTV.
    const floorLoan = sizeLoan({
      price: lo,
      noi: t.year1Noi,
      ratePct: t.ratePct,
      amortYears: t.amortYears,
      io: false,
      maxLtvPct: real(t.maxLtvPct) ? t.maxLtvPct : null,
      minDscr: real(t.minDscr) ? t.minDscr : null,
      minDebtYieldPct: real(t.minDebtYieldPct) ? t.minDebtYieldPct : null,
    }).loan;
    if (floorLoan !== null && floorLoan >= lo) {
      return {
        ...EMPTY,
        note: "The coverage tests do not scale with the price, so with no loan-to-value cap they size a loan larger than the building. Set one.",
      };
    }
    return {
      ...EMPTY,
      note: `Even at a price of one year's NOI the equity does not reach ${t.targetLeveredIrrPct}% — the target is out of reach on these terms.`,
    };
  }

  // The upper bound MUST NOT clear, or the bisection converges on the bound
  // itself and reports it as the answer — a ceiling presented as a solve.
  // A fixed 100× NOI looked safe and is not: at a 0.5% exit cap the exit is
  // worth over 200× the NOI, so a modest target clears at 100× and the
  // module returned exactly $100,000,000 while `checkIrrPct` quietly said
  // 31.8% against a 6% target. So the bound is EXPANDED until it fails, and
  // if it never does the inputs are refused rather than rounded to a wall.
  let hi = t.year1Noi * 100;
  let widened = 0;
  while (clears(hi) && widened < 12) {
    hi *= 4;
    widened++;
  }
  if (clears(hi)) {
    return {
      ...EMPTY,
      note: "No price is high enough to fall short of that return — check the exit cap, which is doing all the work.",
    };
  }

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (clears(mid)) lo = mid;
    else hi = mid;
  }
  const maxPrice = round(lo);

  const built = atPrice(t, maxPrice);
  const capAtMaxPricePct = round2((t.year1Noi / maxPrice) * 100);
  const binding = built.sizing.tests.find((x) => x.binding) ?? null;

  // Rule 1. LTV scales with the price and the coverage tests do not, so the
  // two cross at exactly one price — solve for it rather than saying "it
  // depends". Only meaningful with LTV and at least one coverage test set.
  const coverageCap = built.sizing.tests
    .filter((x) => x.key !== "ltv")
    .reduce((min: number | null, x) => (min === null ? x.maxLoan : Math.min(min, x.maxLoan)), null);
  const ltvShare = real(t.maxLtvPct) && t.maxLtvPct > 0 ? t.maxLtvPct / 100 : null;
  const bindingFlipPrice =
    coverageCap !== null && ltvShare !== null ? round(coverageCap / ltvShare) : null;

  const checkIrr = irr(built.flows);
  const checkIrrPct = checkIrr === null ? null : round2(checkIrr * 100);

  let note: string;
  if (binding === null) {
    note = "No lender test is set, so this is an all-cash bid.";
  } else if (bindingFlipPrice !== null) {
    // The direction is the easy thing to get backwards, so state it from
    // the arithmetic rather than from intuition: LTV allows `ltvShare × P`,
    // which GROWS with the price, while the coverage tests are fixed by the
    // NOI. So LTV is the smaller — and therefore binding — BELOW the
    // crossing, and the coverage tests bind above it.
    const coverageBinds = maxPrice > bindingFlipPrice;
    note = coverageBinds
      ? `${binding.label} governs at this price. Below ${money(bindingFlipPrice)} loan-to-value takes over instead.`
      : `${binding.label} governs at this price. Above ${money(bindingFlipPrice)} the coverage tests take over instead.`;
  } else {
    note = `${binding.label} governs the loan at this price.`;
  }

  return {
    maxPrice,
    capAtMaxPricePct,
    loan: round(built.loan),
    equity: round(built.equity),
    closingCosts: round(built.closingCosts),
    loanFee: round(built.loanFee),
    bindingTest: binding ? binding.label : null,
    tests: built.sizing.tests,
    ltvPct: built.sizing.ltvPct,
    dscr: built.sizing.dscr,
    debtYieldPct: built.sizing.debtYieldPct,
    years: built.years,
    exitValue: round(built.exitValue),
    netSaleProceeds: round(built.netSaleProceeds),
    flows: built.flows.map(round),
    checkIrrPct,
    bindingFlipPrice,
    note,
  };
}

/** $22.4M — only for the note, where a full figure would swamp the sentence. */
function money(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
