// What a lease is actually worth, after what it cost to sign — PURE.
//
// Every office and industrial rent in an offering memorandum is a STARTING
// rent, and the gap between that and the net effective rent is where the
// broker's number lives. "$36 a foot" on a ten-year deal with twelve
// months free and $90 of tenant improvements is not $36 a foot, and an
// analyst who cannot run that conversion here opens Excel during the call.
//
// TWO NUMBERS, BOTH CALLED "NER". A broker who says net effective may mean
// either, and the gap between them is itself worth seeing:
//
//   straight-line — everything collected over the term, less the
//     concessions and the capital, divided by the term. The simpler one
//     and the one most OMs quote.
//   discounted — the same cash flows brought back to today at a discount
//     rate, then re-spread as a level annuity. Always the smaller of the
//     two on a deal with free rent up front, because it charges the
//     landlord for waiting.
//
// So this computes both and names them, rather than picking one and
// calling it "the" answer.

/** A lease's terms, as an OM states them. A blank is null, never zero. */
export interface LeaseTerms {
  /** the term, in months */
  months: number | null;
  /** the face rent at signing, per SF per year */
  startingRentPsf: number | null;
  /** months of free rent, taken at the front */
  freeMonths: number | null;
  /** tenant improvement allowance, per SF, paid at the start */
  tiPsf: number | null;
  /** leasing commission, as a percent of the gross rent over the term */
  lcPct: number | null;
  /** annual escalation, as a percent */
  escalationPct: number | null;
  /** the rate the discounted NER is taken at, as a percent */
  discountPct: number | null;
}

export interface LeaseRead {
  /** the term in years, for the per-year figures */
  years: number | null;
  /** everything the face rent would collect over the term, per SF */
  grossRentPsf: number | null;
  /** what the free months give away, per SF — at the escalated rate they
   *  would have been paid at, not at the starting rent */
  freeRentPsf: number | null;
  /** what is actually collected, per SF over the term */
  collectedPsf: number | null;
  tiPsf: number;
  lcPsf: number | null;
  /** collected, less the capital */
  netPsf: number | null;
  /** the straight-line net effective rent, per SF per year */
  nerPsfYr: number | null;
  /** the discounted one, per SF per year */
  discountedNerPsfYr: number | null;
  /** how far the NER sits below the face rent, as a percent */
  discountToFacePct: number | null;
  /** what the concessions and capital cost, per SF — for the picture */
  costOfDeal: { free: number; ti: number; lc: number } | null;
  note: string;
}

const EMPTY: LeaseRead = {
  years: null,
  grossRentPsf: null,
  freeRentPsf: null,
  collectedPsf: null,
  tiPsf: 0,
  lcPsf: null,
  netPsf: null,
  nerPsfYr: null,
  discountedNerPsfYr: null,
  discountToFacePct: null,
  costOfDeal: null,
  note: "",
};

/**
 * The lease's monthly rent per SF, month by month.
 *
 * Escalations step ANNUALLY on the lease's own anniversary, which is how
 * an office lease is actually written — not continuously, and not on the
 * calendar year. Free months sit at the front and pay nothing, but they
 * still advance the clock: month 13 of a lease with twelve months free
 * pays the year-two rate, because the escalation ran while the tenant was
 * not paying. Treating free rent as "the term starts later" is the
 * common mistake and it understates the concession.
 */
function monthlyRents(months: number, startPsf: number, escPct: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < months; m++) {
    out.push((startPsf / 12) * Math.pow(1 + escPct / 100, Math.floor(m / 12)));
  }
  return out;
}

export function readLease(t: LeaseTerms): LeaseRead {
  const months = t.months;
  const start = t.startingRentPsf;
  if (months === null || months <= 0 || start === null) {
    return { ...EMPTY, note: "Set a term and a starting rent." };
  }
  if (months > 1200) {
    return { ...EMPTY, note: "That term is longer than a century — check whether it is in months." };
  }

  const esc = t.escalationPct ?? 0;
  const free = Math.max(0, Math.min(months, t.freeMonths ?? 0));
  const ti = t.tiPsf ?? 0;
  const rents = monthlyRents(months, start, esc);

  const grossRentPsf = rents.reduce((a, r) => a + r, 0);
  const freeRentPsf = rents.slice(0, free).reduce((a, r) => a + r, 0);
  const collectedPsf = grossRentPsf - freeRentPsf;
  // The commission is written against the GROSS rent over the term — the
  // face deal, not the discounted one — which is how a listing agreement
  // states it and why a free-rent-heavy deal still pays a full fee.
  const lcPsf = t.lcPct === null || t.lcPct === undefined ? null : grossRentPsf * (t.lcPct / 100);
  const netPsf = collectedPsf - ti - (lcPsf ?? 0);
  const years = months / 12;
  const nerPsfYr = netPsf / years;

  // The discounted one. The free months are already absent from the cash
  // flows, so they are charged twice over — once as rent never collected,
  // again as rent collected later — which is exactly what a discount rate
  // is for.
  let discountedNerPsfYr: number | null = null;
  const d = t.discountPct;
  if (d !== null && d !== undefined && Number.isFinite(d) && d > -100) {
    const r = d / 100 / 12;
    let pv = -ti - (lcPsf ?? 0);
    let annuity = 0; // PV of $1/month over the term, for the re-spread
    for (let m = 0; m < months; m++) {
      const f = Math.pow(1 + r, m + 1);
      pv += (m < free ? 0 : rents[m]) / f;
      annuity += 1 / f;
    }
    if (annuity > 0) discountedNerPsfYr = (pv / annuity) * 12;
  }

  const discountToFacePct = start > 0 ? ((start - nerPsfYr) / start) * 100 : null;

  let note = "";
  if (netPsf < 0) {
    note = "The concessions and capital exceed everything the lease collects — this deal costs the landlord money.";
  } else if (free >= months) {
    note = "Every month of the term is free, so nothing is collected.";
  }

  return {
    years,
    grossRentPsf,
    freeRentPsf,
    collectedPsf,
    tiPsf: ti,
    lcPsf,
    netPsf,
    nerPsfYr,
    discountedNerPsfYr,
    discountToFacePct,
    costOfDeal: { free: freeRentPsf, ti, lc: lcPsf ?? 0 },
    note,
  };
}

// ── one operating expense, said three ways ─────────────────────────────────
//
// The other half of "one rent, four ways". A broker quotes "$4,200 a unit"
// and the analyst needs it as a ratio before they can argue with it —
// because $4,200 a unit is unremarkable at one rent level and alarming at
// another, and only the ratio says which.

export interface OpexTerms {
  /** total annual operating expenses */
  opex: number | null;
  units: number | null;
  sf: number | null;
  /** effective gross income — what the ratio is taken against */
  egi: number | null;
}

export interface OpexRead {
  perUnit: number | null;
  perSf: number | null;
  /** opex as a percent of EGI — the ratio an underwriter actually argues */
  ratioPct: number | null;
  /** what is left, which is the NOI */
  noi: number | null;
  note: string;
}

export function readOpex(t: OpexTerms): OpexRead {
  const { opex, units, sf, egi } = t;
  const per = (n: number | null, by: number | null): number | null =>
    n === null || by === null || by <= 0 ? null : n / by;
  const ratioPct = opex === null || egi === null || egi <= 0 ? null : (opex / egi) * 100;
  const noi = opex === null || egi === null ? null : egi - opex;
  let note = "";
  if (ratioPct !== null && ratioPct >= 100) {
    note = "Expenses are the whole of the income or more — there is no NOI here.";
  } else if (ratioPct !== null && ratioPct < 20) {
    // Worth saying out loud: a ratio this low is usually a triple-net
    // lease, where the tenant pays the expenses directly, rather than a
    // remarkably cheap building.
    note = "Under 20% of income usually means a net lease, where the tenant pays the expenses — not an unusually cheap building.";
  }
  return { perUnit: per(opex, units), perSf: per(opex, sf), ratioPct, noi, note };
}
