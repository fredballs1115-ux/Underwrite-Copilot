// What sits below the NOI line, and what leaving it there is worth — PURE.
//
// A broker's NOI and an owner's NOI are different numbers for the same
// building, and the difference is not a disagreement about operations. It
// is a disagreement about what counts as an operating expense.
//
// Three things get pushed below the line on a marketing package: the
// replacement reserve, the tenant improvement allowance and the leasing
// commission. All three are real, recurring, unavoidable cash. A lender
// underwrites after them; so does a buyer who intends to own the building.
// The cover page does not, and at a 5.5% cap every dollar left out is
// eighteen dollars of price.
//
// Four rules.
//
// 1. CAPITAL THAT RECURS IS AN EXPENSE. A roof is capital. Replacing 1/25th
//    of a roof every year, forever, is a cost of doing business, and the
//    fact that an accountant capitalises it does not make the money stay in
//    the bank. The test is recurrence, not accounting treatment.
//
// 2. LEASING CAPITAL IS NOT OPTIONAL, AND ITS ANNUAL COST IS NOT ITS
//    INVOICE. A building with five-year leases re-leases a fifth of itself
//    every year on average. Spending nothing this year does not mean the
//    cost is zero — it means it is due later, and the run-rate is the
//    invoice divided by the term. `leasingAnnual` is that: the per-foot
//    TI and commission over the lease term, on the share of space that
//    actually rolls.
//
// 3. A RENEWAL IS CHEAPER THAN A NEW LEASE, AND THE MIX IS AN ASSUMPTION.
//    Blending them at 50/50 is a choice, not a fact, so the renewal
//    probability is an input and the blended cost is reported beside both
//    ends. A memorandum quoting only the renewal cost is quoting the best
//    case as the expectation.
//
// 4. THE COST IS SAID AS A PRICE. Everything here is an annual figure, and
//    an annual figure at a cap rate is a dollar amount of value. That is
//    the number to argue about, and it is the one nobody prints: on the
//    seeded 200,000-foot building the three lines come to $310,000 a year,
//    which at a 5.5% cap is $5.6M of price.
//
// The seeded building is deliberately ordinary. Nothing here is padding.

export interface BelowLine {
  label: string;
  /** annual dollars */
  amount: number;
  /** per square foot */
  perSf: number;
  /** share of the total below-the-line cost */
  sharePct: number;
}

export interface BelowResult {
  /** the NOI as the cover page states it */
  brokerNoi: number | null;
  lines: BelowLine[];
  /** everything below the line, a year */
  totalAnnual: number | null;
  /** the NOI a lender or a long-term owner underwrites */
  ownerNoi: number | null;
  /** the cap the cover page's NOI implies at the asking price */
  brokerCapPct: number | null;
  /** …and the cap the owner's NOI implies at the same price */
  ownerCapPct: number | null;
  /** the distance between them */
  capGapBps: number | null;
  /** what the total is worth at the BROKER's cap — rule 4 */
  valueOfTheLine: number | null;
  /** the price at which the owner's NOI earns the advertised cap */
  priceForAdvertisedCap: number | null;
  /** the run-rate leasing cost if every rolling tenant renewed */
  leasingIfAllRenew: number | null;
  /** …and if none did. The seeded blend sits between them. */
  leasingIfNoneRenew: number | null;
  note: string;
}

const EMPTY: BelowResult = {
  brokerNoi: null,
  lines: [],
  totalAnnual: null,
  ownerNoi: null,
  brokerCapPct: null,
  ownerCapPct: null,
  capGapBps: null,
  valueOfTheLine: null,
  priceForAdvertisedCap: null,
  leasingIfAllRenew: null,
  leasingIfNoneRenew: null,
  note: "Enter the NOI the memorandum states and the building's size.",
};

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const real = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
const atLeastZero = (n: number | null | undefined): number =>
  real(n) && n > 0 ? n : 0;

export interface BelowInput {
  /** the NOI as stated, before any of this */
  brokerNoi: number;
  /** rentable square feet */
  buildingSf: number;
  priceUsd?: number | null;
  /** the reserve, per square foot per year */
  reservePerSf?: number | null;
  /** how much of the building rolls in an average year, as a percent */
  annualRolloverPct?: number | null;
  /** the average lease term, over which leasing capital is spread */
  leaseTermYears?: number | null;
  /** allowance on a NEW lease, per square foot of the space leased */
  newTiPerSf?: number | null;
  /** …and on a renewal, which is always the smaller */
  renewalTiPerSf?: number | null;
  /** commission on a new lease, per square foot */
  newLcPerSf?: number | null;
  renewalLcPerSf?: number | null;
  /** how often a rolling tenant stays, as a percent — rule 3, an assumption */
  renewalProbabilityPct?: number | null;
  /** anything else the cover page pushed below the line */
  otherAnnual?: number | null;
}

export function readBelow(t: BelowInput): BelowResult {
  if (!real(t.brokerNoi) || !real(t.buildingSf) || t.buildingSf <= 0) return EMPTY;

  const sf = t.buildingSf;
  // Rule 2. The space that rolls in a year, and what re-leasing it costs
  // spread over the term it buys. Spending nothing this year does not make
  // the cost zero; it makes it late.
  const rollingSf = sf * (atLeastZero(t.annualRolloverPct) / 100);
  const term = real(t.leaseTermYears) && t.leaseTermYears > 0 ? t.leaseTermYears : 1;
  const newCost = atLeastZero(t.newTiPerSf) + atLeastZero(t.newLcPerSf);
  const renewCost = atLeastZero(t.renewalTiPerSf) + atLeastZero(t.renewalLcPerSf);

  const leasingIfAllRenew = round((rollingSf * renewCost) / term);
  const leasingIfNoneRenew = round((rollingSf * newCost) / term);
  // Rule 3: the mix is an assumption, so it is an input and both ends are
  // reported. A memorandum quoting only the renewal number is quoting the
  // best case as the expectation.
  const p = real(t.renewalProbabilityPct)
    ? Math.max(0, Math.min(100, t.renewalProbabilityPct)) / 100
    : 0.5;
  const blendedPerSf = renewCost * p + newCost * (1 - p);
  const leasingAnnual = round((rollingSf * blendedPerSf) / term);

  const reserveAnnual = round(sf * atLeastZero(t.reservePerSf));
  const other = round(atLeastZero(t.otherAnnual));

  const lines: BelowLine[] = [];
  const add = (label: string, amount: number) => {
    if (amount <= 0) return;
    lines.push({ label, amount, perSf: round2(amount / sf), sharePct: 0 });
  };
  add("Replacement reserve", reserveAnnual);
  add("Tenant improvements & commissions", leasingAnnual);
  add("Other below-the-line", other);

  const totalAnnual = lines.reduce((a, l) => a + l.amount, 0);
  // Shares are taken from the ROUNDED amounts so the card's own percentages
  // agree with its own dollars — the debt schedule's rule.
  for (const l of lines) l.sharePct = totalAnnual > 0 ? round1((l.amount / totalAnnual) * 100) : 0;

  const ownerNoi = round(t.brokerNoi - totalAnnual);
  const price = real(t.priceUsd) && t.priceUsd > 0 ? t.priceUsd : null;
  const brokerCapPct = price === null ? null : round2((t.brokerNoi / price) * 100);
  const ownerCapPct = price === null ? null : round2((ownerNoi / price) * 100);
  const capGapBps =
    brokerCapPct === null || ownerCapPct === null
      ? null
      : round((brokerCapPct - ownerCapPct) * 100);

  // Rule 4. Capitalised at the ADVERTISED cap, because that is the rate the
  // price was set at — the seller's own arithmetic, turned on the figures
  // the seller left out.
  const valueOfTheLine =
    brokerCapPct !== null && brokerCapPct > 0 && totalAnnual > 0
      ? round(totalAnnual / (brokerCapPct / 100))
      : null;
  // …and the same thing said as a bid: the price at which the real NOI
  // earns the cap the cover page advertised.
  const priceForAdvertisedCap =
    brokerCapPct !== null && brokerCapPct > 0 ? round(ownerNoi / (brokerCapPct / 100)) : null;

  let note: string;
  if (totalAnnual <= 0) {
    note = "Nothing is below the line, so the stated NOI is the NOI you would own.";
  } else if (capGapBps !== null) {
    note = `The cover page's NOI is ${capGapBps}bp of cap rate above the one a lender would underwrite.`;
  } else {
    note = `${round(totalAnnual).toLocaleString("en-US")} a year sits below the line. Enter a price to see what it is worth.`;
  }

  return {
    brokerNoi: round(t.brokerNoi),
    lines,
    totalAnnual,
    ownerNoi,
    brokerCapPct,
    ownerCapPct,
    capGapBps,
    valueOfTheLine,
    priceForAdvertisedCap,
    leasingIfAllRenew,
    leasingIfNoneRenew,
    note,
  };
}
