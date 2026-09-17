// The insurance line, and the deductible behind it — PURE.
//
// The expense line that reprices hardest and gets read least. A memorandum
// quotes the SELLER's expiring premium — bound years ago, on limits the
// seller chose, in a market that may no longer exist — and a buyer's quote
// on the same building comes back at a multiple of it. Nothing in the
// memorandum is false. It is describing someone else's policy, which is what
// makes this invisible; it is the same shape as `tax-reassessment`, where
// the tax line describes someone else's ownership.
//
// Four rules.
//
// 1. THE PREMIUM IN THE MEMORANDUM IS NOT YOURS. It is a fact about the
//    seller's placement. The gap between it and a real quote is NOI dollar
//    for dollar, and insurance is a FIXED expense — it does not scale away
//    with occupancy or get negotiated down by better management.
//
// 2. SO THE CAP RATE CAPITALISES IT. An annual figure at a cap rate is a
//    price, and on the seeded Florida apartment the $360,000 of premium the
//    memorandum left out is $6,857,143 — the advertised 5.25% cap is 4.60%
//    to the buyer, 65 basis points.
//
// 3. A NAMED-STORM DEDUCTIBLE IS A PERCENTAGE, NOT A DOLLAR AMOUNT. It is
//    struck against the INSURED VALUE, so 5% of a $52,000,000 replacement
//    cost is $2,600,000 of retained risk PER EVENT — nine tenths of a year's
//    NOI, which no replacement reserve covers and which nobody writes down.
//    The premium is the number people argue about; this is the number that
//    takes the building.
//
// 4. AND RAISING THE DEDUCTIBLE IS A PRICEABLE TRADE. A higher deductible
//    buys a lower premium: the saving is annual and certain, the extra
//    retained risk is per-event and is not. `breakEvenYearsBetweenEvents`
//    is the frequency at which the two meet — 16.3 years on the seed, so
//    doubling the deductible pays only if a named-storm loss arrives less
//    often than that. It assumes every event is a full-deductible loss,
//    which is the CONSERVATIVE reading: a loss landing between the two
//    deductibles costs less than the difference, and one under the lower
//    deductible costs the same either way. So the real break-even is at or
//    below the figure, never above it.
//
// Screening arithmetic. What a building is actually quoted turns on its
// roof, its year built, its distance to the coast and the carrier's
// appetite, none of which is arithmetic — so both premiums are inputs and
// the card says so.
//
// Pure, no I/O.

const real = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
const positive = (n: number | null | undefined): n is number => real(n) && n > 0;
const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface InsuranceResult {
  /** the memorandum's premium, per square foot and per unit */
  sellerPerSf: number | null;
  sellerPerUnit: number | null;
  /** …and the buyer's quote, the same two ways */
  quotedPerSf: number | null;
  quotedPerUnit: number | null;
  /** what the quote costs over the memorandum's figure — rule 1 */
  premiumGap: number | null;
  /** the quote as a multiple of the expiring premium */
  premiumMultiple: number | null;
  /** the price the advertised cap implies on the memorandum's NOI */
  advertisedPrice: number | null;
  /** the NOI once the real premium is in it */
  adjustedNoi: number | null;
  /** …and the cap that NOI earns at the same price — rule 2 */
  adjustedCapPct: number | null;
  capGapBps: number | null;
  /** the gap said as a price */
  valueOfGap: number | null;
  /** rule 3 — the named-storm deductible in dollars */
  namedStormDeductible: number | null;
  /** …as a share of one year's NOI, which is the figure nobody writes down */
  deductibleYearsOfNoi: number | null;
  /** rule 4 — what the higher deductible saves a year */
  alternativeSaving: number | null;
  /** …and the extra retained risk it takes on, per event */
  alternativeExtraRisk: number | null;
  /** the years between events at which the two meet */
  breakEvenYearsBetweenEvents: number | null;
  note: string;
}

const EMPTY: InsuranceResult = {
  sellerPerSf: null,
  sellerPerUnit: null,
  quotedPerSf: null,
  quotedPerUnit: null,
  premiumGap: null,
  premiumMultiple: null,
  advertisedPrice: null,
  adjustedNoi: null,
  adjustedCapPct: null,
  capGapBps: null,
  valueOfGap: null,
  namedStormDeductible: null,
  deductibleYearsOfNoi: null,
  alternativeSaving: null,
  alternativeExtraRisk: null,
  breakEvenYearsBetweenEvents: null,
  note: "Enter the premium the memorandum states and the premium you have been quoted.",
};

export interface InsuranceInput {
  /** the premium the memorandum states — the seller's expiring policy */
  sellerPremium: number;
  /** what a broker has quoted the buyer on the same building */
  quotedPremium: number;
  /** the NOI as stated, which carries the seller's premium */
  statedNoi?: number | null;
  /** the cap the memorandum advertises */
  advertisedCapPct?: number | null;
  buildingSf?: number | null;
  units?: number | null;
  /** replacement cost — what the deductible is struck against, NOT the price */
  insuredValue?: number | null;
  /** the named-storm deductible, as a percent of insured value — rule 3 */
  namedStormDeductiblePct?: number | null;
  /** a higher deductible being considered, as a percent — rule 4 */
  alternativeDeductiblePct?: number | null;
  /** …and the premium it would buy */
  alternativePremium?: number | null;
}

export function readInsurance(t: InsuranceInput): InsuranceResult {
  if (!positive(t.sellerPremium) || !positive(t.quotedPremium)) return EMPTY;

  const sf = positive(t.buildingSf) ? t.buildingSf : null;
  const units = positive(t.units) ? t.units : null;
  const per = (premium: number, by: number | null, places: number) =>
    by === null ? null : Math.round((premium / by) * Math.pow(10, places)) / Math.pow(10, places);

  const premiumGap = round(t.quotedPremium - t.sellerPremium);
  const premiumMultiple = round2(t.quotedPremium / t.sellerPremium);

  // Rule 2. The advertised price comes from the memorandum's own arithmetic,
  // and the real premium is then charged against the same price — which is
  // what a buyer honouring the ask is actually being asked to accept.
  const noi = positive(t.statedNoi) ? t.statedNoi : null;
  const cap = positive(t.advertisedCapPct) ? t.advertisedCapPct : null;
  const advertisedPrice = noi !== null && cap !== null ? round(noi / (cap / 100)) : null;
  const adjustedNoi = noi === null ? null : round(noi - premiumGap);
  const adjustedCapPct =
    adjustedNoi === null || advertisedPrice === null || advertisedPrice <= 0
      ? null
      : round2((adjustedNoi / advertisedPrice) * 100);
  const capGapBps =
    cap === null || adjustedCapPct === null ? null : round((cap - adjustedCapPct) * 100);
  const valueOfGap = cap === null ? null : round(premiumGap / (cap / 100));

  // Rule 3. Against the INSURED VALUE — a deductible struck on the purchase
  // price would be a different and smaller number, and it is not what the
  // policy says.
  const insured = positive(t.insuredValue) ? t.insuredValue : null;
  const stormPct = positive(t.namedStormDeductiblePct) ? t.namedStormDeductiblePct : null;
  const namedStormDeductible =
    insured === null || stormPct === null ? null : round(insured * (stormPct / 100));
  const deductibleYearsOfNoi =
    namedStormDeductible === null || noi === null ? null : round2(namedStormDeductible / noi);

  // Rule 4. The saving is annual and certain; the extra risk is per event.
  const altPct = positive(t.alternativeDeductiblePct) ? t.alternativeDeductiblePct : null;
  const altPremium = positive(t.alternativePremium) ? t.alternativePremium : null;
  const alternativeSaving =
    altPremium === null ? null : round(t.quotedPremium - altPremium);
  const alternativeExtraRisk =
    insured === null || altPct === null || stormPct === null
      ? null
      : round(insured * ((altPct - stormPct) / 100));
  const breakEvenYearsBetweenEvents =
    alternativeSaving === null ||
    alternativeExtraRisk === null ||
    alternativeSaving <= 0 ||
    alternativeExtraRisk <= 0
      ? null
      : round1(alternativeExtraRisk / alternativeSaving);

  return {
    sellerPerSf: per(t.sellerPremium, sf, 2),
    sellerPerUnit: per(t.sellerPremium, units, 0),
    quotedPerSf: per(t.quotedPremium, sf, 2),
    quotedPerUnit: per(t.quotedPremium, units, 0),
    premiumGap,
    premiumMultiple,
    advertisedPrice,
    adjustedNoi,
    adjustedCapPct,
    capGapBps,
    valueOfGap,
    namedStormDeductible,
    deductibleYearsOfNoi,
    alternativeSaving,
    alternativeExtraRisk,
    breakEvenYearsBetweenEvents,
    note: noteFor({ premiumGap, premiumMultiple, capGapBps, deductibleYearsOfNoi }),
  };
}

/**
 * The one sentence, leading with rule 3 where there is a deductible to
 * report — the premium is the figure people argue about and the deductible
 * is the one that takes the building.
 */
function noteFor(x: {
  premiumGap: number;
  premiumMultiple: number;
  capGapBps: number | null;
  deductibleYearsOfNoi: number | null;
}): string {
  if (x.deductibleYearsOfNoi !== null && x.deductibleYearsOfNoi >= 0.25) {
    return `One named-storm event retains ${x.deductibleYearsOfNoi} years of NOI before the policy pays anything.`;
  }
  if (x.capGapBps !== null && x.capGapBps > 0) {
    return `The quote is ${x.premiumMultiple}x the expiring premium, which is ${x.capGapBps}bp of the advertised cap.`;
  }
  if (x.premiumGap > 0) {
    return `The quote is ${x.premiumMultiple}x the expiring premium. Enter the NOI and the cap to see what that is worth.`;
  }
  if (x.premiumGap < 0) {
    return "The quote comes in under the expiring premium, which is worth checking the limits against.";
  }
  return "The quote matches the expiring premium, so the memorandum's expense line stands.";
}
