// The sale-leaseback, from both sides of it — PURE.
//
// A company sells the building it operates out of and signs a lease back on
// the same day. The buyer gets a tenant with a twenty-year term; the seller
// gets cash. Both sides then price it wrong in the same direction, because
// the two halves of the deal are not independent and everybody treats them
// as if they were.
//
// Four rules.
//
// 1. THE RENT IS THE PRICE LEVER. The seller writes its own lease, and at a
//    given cap rate a higher rent buys a higher price — dollar for dollar,
//    divided by the cap. A seller who needs $30M sets the rent that produces
//    $30M. The BUILDING is not worth more for it. The LEASE is. So the price
//    premium over what an ordinary owner would pay is not value created; it
//    is cash borrowed against a rent obligation, and `pricePremium` says how
//    much.
//
// 2. AN ABOVE-MARKET LEASE REVERTS TO MARKET. At the end of the term the
//    building is worth what its MARKET rent supports, not what the contract
//    said. So the buyer is really buying two things: the contract rent for
//    the term, and a market-rent building afterwards. Capitalising the
//    contract rent as though it ran forever is the same error as valuing a
//    leasehold at a fee-simple cap — on the seeded deal it overpays by
//    $5,073,880, a fifth of the price. `honestValue` runs the two pieces.
//
// 3. THE CREDIT IS THE CAP RATE, AND THE CREDIT IS WHY THE DEAL EXISTS. A
//    sale-leaseback's cap rate is a function of the tenant's balance sheet
//    rather than of the real estate — the same building at the same rent
//    trades 250bp apart on the covenant behind it. And a company sells the
//    building it operates from because it needs the money, which is exactly
//    when its credit is worst. The cap is an input, and the card says what
//    it is really pricing.
//
// 4. FOR THE SELLER IT IS BORROWING, AND IT LOOKS CHEAPER THAN A MORTGAGE
//    IN YEAR ONE WITHOUT BEING CHEAPER. Compare the rent to the mortgage
//    RATE and never to its constant — amortisation is a transfer rather
//    than a cost, which is `capital-stack`'s rule and the reason the
//    constant is reported separately here. On the seeded deal the rent is
//    6.09 cents per dollar raised against a 6.50% coupon, and the leaseback
//    raises $26,595,000 where the loan sizes to $12,816,579. Two things
//    undo it, and neither is in the year-one comparison: the rent
//    ESCALATES, so it passes the coupon in YEAR FIVE and reaches 8.87 cents
//    by the end of the term while the coupon never moves; and when the
//    mortgage is repaid the building is still yours, where at the end of a
//    leaseback it is not. The mortgage side runs through `sizeLoan`, so it
//    is sized by exactly the same three tests as every other loan here.
//
// Pure, no I/O.

import { loanConstant, sizeLoan } from "@/lib/tools/deal-math";

const real = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
const positive = (n: number | null | undefined): n is number => real(n) && n > 0;
const atLeastZero = (n: number | null | undefined): number => (real(n) && n > 0 ? n : 0);
const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A term past fifty years is a ground lease, not a leaseback. */
export const MAX_TERM = 50;

export interface SaleLeasebackResult {
  /** year-one rent on the lease the seller writes */
  contractNoi: number | null;
  /** …and what the same space would let for to anyone else */
  marketNoi: number | null;
  /** how far above market the contract sits, 0–100 and signed */
  rentPremiumPct: number | null;
  /** the price the contract rent supports at the credit cap — rule 1 */
  price: number | null;
  /** what an ordinary owner would pay for a market-rent building */
  marketValue: number | null;
  /** the part of the price that is the LEASE rather than the building */
  pricePremium: number | null;
  /** rule 2 — the term's rent, then a market-rent building */
  honestValue: number | null;
  /** present value of the contract rent over the term */
  termValue: number | null;
  /** …and of the building coming back at market rent */
  reversionValue: number | null;
  /** what the buyer pays over what the two pieces are worth */
  overpayment: number | null;
  /** …as a share of the price */
  overpaymentPct: number | null;
  /** rule 4 — cash the seller raises, after the cost of selling */
  cashRaised: number | null;
  /** …at a cost of, a year */
  annualRent: number | null;
  /** cents of year-one rent per dollar raised — the figure to set against a coupon */
  rentPerDollarRaised: number | null;
  /** …and the same figure in the term's last year, after the escalations */
  rentPerDollarAtTermEnd: number | null;
  /** the year the escalating rent passes the mortgage coupon — rule 4 */
  yearRentPassesCoupon: number | null;
  /** the loan the same building would carry, through sizeLoan */
  mortgageProceeds: number | null;
  /** which of the three lender tests governed that loan */
  mortgageBindingTest: string | null;
  mortgageAnnualCost: number | null;
  /**
   * The loan's cash cost per dollar, INCLUDING the principal it repays.
   * Reported beside the coupon rather than instead of it: amortisation is a
   * transfer, not a cost, and setting a pure-cost rent against it makes
   * every leaseback look cheap.
   */
  mortgageConstantPct: number | null;
  /** how much more the leaseback raises than the mortgage would */
  extraRaised: number | null;
  note: string;
}

const EMPTY: SaleLeasebackResult = {
  contractNoi: null,
  marketNoi: null,
  rentPremiumPct: null,
  price: null,
  marketValue: null,
  pricePremium: null,
  honestValue: null,
  termValue: null,
  reversionValue: null,
  overpayment: null,
  overpaymentPct: null,
  cashRaised: null,
  annualRent: null,
  rentPerDollarRaised: null,
  rentPerDollarAtTermEnd: null,
  yearRentPassesCoupon: null,
  mortgageProceeds: null,
  mortgageBindingTest: null,
  mortgageAnnualCost: null,
  mortgageConstantPct: null,
  extraRaised: null,
  note: "Enter the building's size, the rent it would let for, and the rent the seller proposes to pay.",
};

export interface SaleLeasebackInput {
  buildingSf: number;
  /** what the space would let for to anyone — rule 1's reference */
  marketRentPerSf: number;
  /** the rent the seller writes into its own lease */
  contractRentPerSf: number;
  termYears: number;
  /** annual escalation on the contract rent, as a percent */
  escalationPct?: number | null;
  /** the cap the market applies to THIS tenant's covenant — rule 3 */
  creditCapPct: number;
  /** …and the cap a market-rent building of this kind trades at */
  marketCapPct: number;
  /** the rate the term's cash flows are discounted at — rule 2 */
  discountRatePct?: number | null;
  sellingCostPct?: number | null;
  /** rule 4: what a mortgage on the same building would have been */
  mortgageRatePct?: number | null;
  mortgageAmortYears?: number | null;
  maxLtvPct?: number | null;
  minDscr?: number | null;
  minDebtYieldPct?: number | null;
}

export function readLeaseback(t: SaleLeasebackInput): SaleLeasebackResult {
  if (
    !positive(t.buildingSf) ||
    !positive(t.marketRentPerSf) ||
    !positive(t.contractRentPerSf)
  ) {
    return EMPTY;
  }
  if (!positive(t.creditCapPct) || !positive(t.marketCapPct)) {
    return { ...EMPTY, note: "Enter both cap rates — the tenant's credit prices one and the real estate prices the other." };
  }
  const term = positive(t.termYears) ? Math.min(Math.round(t.termYears), MAX_TERM) : 0;
  if (term <= 0) {
    return { ...EMPTY, note: `Enter the lease term, between one and ${MAX_TERM} years.` };
  }

  const contractNoi = round(t.buildingSf * t.contractRentPerSf);
  const marketNoi = round(t.buildingSf * t.marketRentPerSf);
  const rentPremiumPct = round1((t.contractRentPerSf / t.marketRentPerSf - 1) * 100);

  // Rule 1. The price follows the rent the seller wrote, at the cap the
  // seller's covenant earns. Neither half is about the building.
  const price = round(contractNoi / (t.creditCapPct / 100));
  const marketValue = round(marketNoi / (t.marketCapPct / 100));
  const pricePremium = price - marketValue;

  // Rule 2. The term, then the reversion — because the rent reverts and the
  // building does not care what the old lease said.
  const disc = positive(t.discountRatePct) ? t.discountRatePct / 100 : t.marketCapPct / 100;
  const esc = atLeastZero(t.escalationPct) / 100;
  let termValue = 0;
  for (let y = 1; y <= term; y++) {
    termValue += (contractNoi * Math.pow(1 + esc, y - 1)) / Math.pow(1 + disc, y);
  }
  // The reversion is a MARKET-rent building, capitalised at the market cap,
  // discounted back over the term. Growing the market rent would be a second
  // assumption about the market; the card holds it flat and says so.
  const reversionValue = marketValue / Math.pow(1 + disc, term);
  const honestValue = round(termValue + reversionValue);
  const overpayment = price - honestValue;

  // Rule 4. The seller's side, against the loan the same building carries —
  // through sizeLoan, so it is the same three tests as everywhere else.
  const sellingCost = Math.max(0, Math.min(100, atLeastZero(t.sellingCostPct))) / 100;
  const cashRaised = round(price * (1 - sellingCost));
  const annualRent = contractNoi;
  const sizing = sizeLoan({
    price: marketValue,
    noi: marketNoi,
    ratePct: real(t.mortgageRatePct) ? t.mortgageRatePct : null,
    amortYears: real(t.mortgageAmortYears) ? t.mortgageAmortYears : null,
    io: false,
    maxLtvPct: real(t.maxLtvPct) ? t.maxLtvPct : null,
    minDscr: real(t.minDscr) ? t.minDscr : null,
    minDebtYieldPct: real(t.minDebtYieldPct) ? t.minDebtYieldPct : null,
  });
  const k = loanConstant(
    real(t.mortgageRatePct) ? t.mortgageRatePct : null,
    real(t.mortgageAmortYears) ? t.mortgageAmortYears : null,
    false,
  );
  const mortgageProceeds = sizing.loan === null ? null : round(sizing.loan);
  const mortgageAnnualCost =
    mortgageProceeds === null || k === null ? null : round(mortgageProceeds * k);
  const rentPerDollar = cashRaised > 0 ? (annualRent / cashRaised) * 100 : null;
  // Rule 4's crossing. Against the COUPON, never the constant: the constant
  // repays principal, and setting a pure-cost rent against it would flatter
  // every leaseback on this page.
  const coupon = real(t.mortgageRatePct) && t.mortgageRatePct > 0 ? t.mortgageRatePct : null;
  let yearRentPassesCoupon: number | null = null;
  if (rentPerDollar !== null && coupon !== null) {
    for (let y = 1; y <= term; y++) {
      if (rentPerDollar * Math.pow(1 + esc, y - 1) > coupon) {
        yearRentPassesCoupon = y;
        break;
      }
    }
  }

  return {
    contractNoi,
    marketNoi,
    rentPremiumPct,
    price,
    marketValue,
    pricePremium,
    honestValue,
    termValue: round(termValue),
    reversionValue: round(reversionValue),
    overpayment,
    overpaymentPct: price > 0 ? round1((overpayment / price) * 100) : null,
    cashRaised,
    annualRent,
    rentPerDollarRaised: rentPerDollar === null ? null : round2(rentPerDollar),
    rentPerDollarAtTermEnd:
      rentPerDollar === null ? null : round2(rentPerDollar * Math.pow(1 + esc, term - 1)),
    yearRentPassesCoupon,
    mortgageProceeds,
    mortgageBindingTest: sizing.tests.find((x) => x.binding)?.label ?? null,
    mortgageAnnualCost,
    mortgageConstantPct: k === null ? null : round2(k * 100),
    extraRaised: mortgageProceeds === null ? null : cashRaised - mortgageProceeds,
    note: noteFor({
      rentPremiumPct,
      pricePremium,
      overpayment,
      overpaymentPct: price > 0 ? round1((overpayment / price) * 100) : null,
      term,
    }),
  };
}

/**
 * The one sentence, leading with rule 2 — the reversion is the part a buyer
 * capitalising the contract rent has not priced at all.
 *
 * The reversion branch is gated on there BEING a rent premium, which the
 * first draft was not. With the contract rent at market and a discount rate
 * above the market cap, `overpayment` is still positive — the two inputs
 * simply disagree about what the building yields — and the card was calling
 * that a reversion cost on a lease with nothing to revert from. An artifact
 * of two assumptions is not a finding about the deal.
 */
function noteFor(x: {
  rentPremiumPct: number;
  pricePremium: number;
  overpayment: number;
  overpaymentPct: number | null;
  term: number;
}): string {
  const usd = (n: number) => `$${round(Math.abs(n)).toLocaleString("en-US")}`;
  if (x.rentPremiumPct > 0 && x.overpayment > 0 && x.overpaymentPct !== null) {
    return `The rent reverts at year ${x.term}, and the building does not — which is ${usd(x.overpayment)} of the price, ${x.overpaymentPct}% of it.`;
  }
  if (x.rentPremiumPct > 0) {
    return `The contract rent is ${x.rentPremiumPct}% above market, so ${usd(x.pricePremium)} of the price is the lease rather than the building.`;
  }
  if (x.rentPremiumPct < 0) {
    return "The contract rent is under market, so the buyer is getting a building worth more than the lease it carries.";
  }
  return "The contract rent is at market, which makes this an ordinary sale with an ordinary tenant in it.";
}
