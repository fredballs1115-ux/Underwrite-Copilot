/**
 * What the property taxes become once YOU own it.
 *
 * The offering memorandum's expense line carries the SELLER's tax bill,
 * struck on the SELLER's assessed value — which in much of the country
 * was set when the seller bought, and has drifted since under a cap, a
 * phase-in, or simple assessor inertia. In a jurisdiction that reassesses
 * on transfer, the purchase itself resets that assessment to the price
 * you paid. The T-12 is then describing a tax bill that will not exist
 * the day after closing.
 *
 * This is one of the most common screening errors there is, and it is
 * invisible: every figure in the memorandum is true, the arithmetic ties,
 * and the NOI is still wrong for the buyer. It matters most on exactly
 * the deals that look best — a long-held building with a low basis is
 * both the attractive one and the one with the furthest to fall.
 *
 * Four rules.
 *
 *   1. **The memorandum's tax line is the seller's, not yours.** Nothing
 *      here trusts it as a forward figure. It is used for two things
 *      only: to derive what rate the jurisdiction is actually charging
 *      (below), and as the number the increase is measured FROM.
 *
 *   2. **A tax bill is assessed value × rate, and assessed value is not
 *      the price.** Most jurisdictions assess at a ratio of market value,
 *      and "the effective rate" quoted against a price silently folds the
 *      two together. They are kept apart here, and where the current bill
 *      and the current assessment are both stated the module derives the
 *      rate they IMPLY and says so when it disagrees with the rate that
 *      was typed — a disagreement usually means the stated rate omits a
 *      special district, or the assessment is stale.
 *
 *   3. **A phase-in is a deferral, not a discount.** Where a jurisdiction
 *      steps the increase in over several years, the year-one bill is
 *      lower and the STABILIZED bill is the full one. Underwriting the
 *      year-one figure flatters the hold and prices the exit on a NOI the
 *      building will never earn again, so both are reported and the
 *      stabilized one is the headline.
 *
 *   4. **The honest way to say what it costs is a PRICE.** A cap rate
 *      lost to reassessment is abstract; the price at which the advertised
 *      cap would actually be true is a number to negotiate with. That
 *      price has to be SOLVED rather than scaled, because paying less
 *      lowers the assessment, which lowers the tax, which raises the NOI:
 *
 *          NOI(P) = omNoi + currentTax − P·k        (k = ratio × rate)
 *          NOI(P) / P = c    =>    P = (omNoi + currentTax) / (c + k)
 *
 *      Scaling the price down by the cap shortfall instead overstates
 *      the discount required, which is a bad way to open a negotiation.
 *
 * Federal / state specifics are deliberately absent: which jurisdictions
 * reassess on transfer, what their ratios are and how long a phase-in
 * runs are facts about a place, not arithmetic, so they are inputs. The
 * card says so.
 *
 * Pure, no I/O.
 */

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

export interface ReassessmentInputs {
  /** what you are paying */
  price: number | null;
  /** the assessed value the CURRENT bill is struck on */
  currentAssessed: number | null;
  /** the tax bill in the memorandum's T-12 — the seller's */
  currentTax: number | null;
  /** assessed value as a share of market value, in % (100 = full value) */
  assessmentRatioPct: number | null;
  /** the total rate applied to assessed value, in % */
  taxRatePct: number | null;
  /** does this jurisdiction reassess to the sale price on transfer? */
  reassessesOnSale: boolean;
  /** years the increase is stepped in over; 1 or null means all at once */
  phaseInYears: number | null;
  /** the NOI the memorandum quotes — which carries the seller's tax bill */
  omNoi: number | null;
}

export interface ReassessmentRead {
  /** price × ratio: what the assessor is expected to strike after closing */
  newAssessed: number | null;
  /** the bill on that assessment at the stated rate */
  newTax: number | null;
  /** the bill in year one, which a phase-in makes smaller */
  year1Tax: number | null;
  /** stabilized bill less the seller's — the number that hits NOI */
  increase: number | null;
  /** the rate the CURRENT bill and assessment imply, in % */
  impliedRatePct: number | null;
  /** true when the implied rate and the stated rate disagree materially */
  rateDisagrees: boolean;
  /** the memorandum's NOI less the stabilized increase */
  stabilizedNoi: number | null;
  /** the memorandum's NOI less the year-one increase */
  year1Noi: number | null;
  /** the cap the memorandum advertises, in % */
  omCapPct: number | null;
  /** the cap on the stabilized NOI at this price, in % */
  realCapPct: number | null;
  /** the difference, in basis points */
  capLostBps: number | null;
  /** the price at which the advertised cap would be true — solved */
  priceForOmCap: number | null;
  /** price less that price: what the reassessment is worth in negotiation */
  overpayment: number | null;
  /** one sentence the analyst can act on */
  note: string;
}

const EMPTY: ReassessmentRead = {
  newAssessed: null,
  newTax: null,
  year1Tax: null,
  increase: null,
  impliedRatePct: null,
  rateDisagrees: false,
  stabilizedNoi: null,
  year1Noi: null,
  omCapPct: null,
  realCapPct: null,
  capLostBps: null,
  priceForOmCap: null,
  overpayment: null,
  note: "",
};

/** The rate the current bill implies against the assessment it is struck on. */
export function impliedRate(
  currentTax: number | null,
  currentAssessed: number | null,
): number | null {
  if (!positive(currentAssessed) || !real(currentTax)) return null;
  return round((currentTax / currentAssessed) * 100, 3);
}

export function readReassessment(input: ReassessmentInputs): ReassessmentRead {
  const {
    price,
    currentAssessed,
    currentTax,
    assessmentRatioPct,
    taxRatePct,
    reassessesOnSale,
    phaseInYears,
    omNoi,
  } = input;

  const implied = impliedRate(currentTax, currentAssessed);

  if (!positive(price)) {
    return { ...EMPTY, impliedRatePct: implied, note: "Enter the price you are paying." };
  }
  if (!positive(taxRatePct)) {
    return {
      ...EMPTY,
      impliedRatePct: implied,
      note: implied
        ? `Enter the tax rate. The current bill implies ${implied}% of assessed value.`
        : "Enter the tax rate applied to assessed value.",
    };
  }

  // A ratio left blank means full-value assessment, which is the common
  // case and a safe default; a ratio of zero is not, and is refused above
  // by `positive`.
  const ratio = positive(assessmentRatioPct) ? assessmentRatioPct : 100;
  // The effective rate against the PRICE — the two figures folded together
  // on purpose, once, where the arithmetic needs them folded.
  const k = (ratio / 100) * (taxRatePct / 100);

  const newAssessed = round(price * (ratio / 100));
  const newTax = round(price * k);
  const seller = real(currentTax) ? round(currentTax) : null;

  // A jurisdiction that does not reassess on transfer is not a missing
  // answer — it IS the answer, and it is the thing worth knowing.
  if (!reassessesOnSale) {
    const noi = positive(omNoi) ? round(omNoi) : null;
    const cap = noi !== null ? round((noi / price) * 100, 2) : null;
    return {
      ...EMPTY,
      newAssessed: positive(currentAssessed) ? round(currentAssessed) : null,
      newTax: seller,
      year1Tax: seller,
      increase: 0,
      impliedRatePct: implied,
      rateDisagrees: false,
      stabilizedNoi: noi,
      year1Noi: noi,
      omCapPct: cap,
      realCapPct: cap,
      capLostBps: 0,
      priceForOmCap: price,
      overpayment: 0,
      note:
        "This jurisdiction does not reassess on transfer, so the seller's bill carries over. " +
        "Check that separately — it is a fact about the place, not about the deal.",
    };
  }

  if (seller === null) {
    return {
      ...EMPTY,
      newAssessed,
      newTax,
      year1Tax: newTax,
      impliedRatePct: implied,
      note:
        `The bill after closing is $${newTax.toLocaleString("en-US")}. ` +
        "Enter the memorandum's current tax line to see what it adds.",
    };
  }

  // Every displayed figure is rounded once and the differences are taken
  // from the rounded pair, so the card's numbers add up on the page.
  const increase = newTax - seller;

  const steps = positive(phaseInYears) ? Math.max(1, Math.round(phaseInYears)) : 1;
  const year1Tax = steps > 1 ? round(seller + increase / steps) : newTax;
  const year1Increase = year1Tax - seller;

  const rateDisagrees =
    implied !== null && Math.abs(implied - taxRatePct) > Math.max(0.05, taxRatePct * 0.05);

  if (!positive(omNoi)) {
    return {
      ...EMPTY,
      newAssessed,
      newTax,
      year1Tax,
      increase,
      impliedRatePct: implied,
      rateDisagrees,
      note:
        `Reassessment adds $${increase.toLocaleString("en-US")} a year. ` +
        "Enter the memorandum's NOI to see what it does to the cap rate.",
    };
  }

  const noi = round(omNoi);
  const stabilizedNoi = noi - increase;
  const year1Noi = noi - year1Increase;

  const omCapPct = round((noi / price) * 100, 2);
  const realCapPct = round((stabilizedNoi / price) * 100, 2);
  const capLostBps = round((omCapPct - realCapPct) * 100);

  // Solved, not scaled: the price feeds back into the tax that feeds back
  // into the NOI. See rule 4 above.
  const c = omCapPct / 100;
  const priceForOmCap = c + k > 0 ? round((noi + seller) / (c + k)) : null;
  const overpayment = priceForOmCap === null ? null : price - priceForOmCap;

  const notes: string[] = [];
  if (increase > 0) {
    notes.push(
      `The memorandum's ${omCapPct}% cap is ${realCapPct}% once the assessor catches up — ` +
        `${capLostBps} basis points.`,
    );
  } else if (increase < 0) {
    notes.push(
      "The reassessment LOWERS the bill: the seller is over-assessed relative to what you are paying.",
    );
  } else {
    notes.push("The reassessment leaves the bill where it is.");
  }
  if (steps > 1) {
    notes.push(
      `Phased over ${steps} years, so year one is $${year1Tax.toLocaleString("en-US")} ` +
        "and the stabilized bill is the one that prices the exit.",
    );
  }
  if (rateDisagrees && implied !== null) {
    notes.push(
      `The current bill implies ${implied}% against its assessment, not ${taxRatePct}% — ` +
        "check for a special district or a stale assessment.",
    );
  }

  return {
    newAssessed,
    newTax,
    year1Tax,
    increase,
    impliedRatePct: implied,
    rateDisagrees,
    stabilizedNoi,
    year1Noi,
    omCapPct,
    realCapPct,
    capLostBps,
    priceForOmCap,
    overpayment,
    note: notes.join(" "),
  };
}
