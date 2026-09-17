// What the building actually collects, against what the cover page says — PURE.
//
// "95% occupied" is a count of doors. It is on the front of almost every
// multifamily memorandum, and it is the higher of the two numbers that
// could go there. The other one — what share of market rent the building
// actually banks — is routinely six or eight points lower, and every
// figure downstream of the NOI moves with it.
//
// This walks the bridge a rent roll has to cross to become an operating
// statement: gross potential rent at market, then each thing that stands
// between it and the bank. Five rules.
//
// 1. PHYSICAL OCCUPANCY COUNTS DOORS, ECONOMIC OCCUPANCY COUNTS DOLLARS.
//    They are different questions and they have different answers, and the
//    gap between them (`gapPoints`) is the finding — a building can be
//    95% leased and collecting 88% of what it could.
//
// 2. THE DENOMINATOR IS MARKET RENT, NEVER THE IN-PLACE RENT ROLL. This
//    is the error that hides the whole problem: divide collections by the
//    rents currently being charged and loss to lease vanishes, because it
//    is sitting in the denominator. A 97% economic occupancy computed that
//    way and an 88% computed against market describe the same building.
//
// 3. LOSS TO LEASE IS NOT A COLLECTIONS PROBLEM. It is the gap between
//    what a unit could rent for and what the sitting tenant pays, and it
//    closes as leases roll rather than by managing anything. It belongs in
//    the bridge and NOT in the same bucket as bad debt, which is why the
//    lines carry a `kind` — filing an under-rented building's loss to
//    lease as leakage makes a value-add opportunity look like mismanagement.
//
// 4. A CONCESSION IS RENT YOU AGREED NOT TO COLLECT; BAD DEBT IS RENT YOU
//    FAILED TO. Both reduce EGI. Only one is a decision, and only one
//    reverses when the market does.
//
// 5. OTHER INCOME IS NOT RENT AND STAYS OUT OF THE RATIO. Parking, RUBS
//    and fees belong in EGI and not in the numerator of an occupancy
//    figure — put them in and a full building prints above 100%, which is
//    nonsense that nonetheless appears in circulated memoranda.
//
// Non-revenue units get their own line because an OM's occupancy figure
// almost always counts them as occupied: a model unit IS physically full,
// and pays nothing.

/** What a deduction is, which decides how to read it. */
export type LeakKind =
  /** nobody is in it */
  | "vacancy"
  /** somebody is in it, below what the market would pay */
  | "below-market"
  /** rent given away on purpose */
  | "concession"
  /** rent billed and not paid */
  | "leakage";

export interface EgiLine {
  label: string;
  kind: LeakKind;
  /** annual dollars, always positive — the card draws them as deductions */
  amount: number;
  /** share of gross potential rent */
  pctOfGpr: number;
}

export interface EgiResult {
  /** annual rent if every unit paid market rent every month */
  gpr: number | null;
  lines: EgiLine[];
  /** GPR less every line above — rent only */
  netRentalIncome: number | null;
  otherIncome: number;
  /** net rental income plus other income */
  egi: number | null;
  /** the cover page's figure, echoed */
  physicalOccupancyPct: number | null;
  /** net rental income over GPR — rule 5 keeps other income out of it */
  economicOccupancyPct: number | null;
  /** the spread, in points of occupancy */
  gapPoints: number | null;
  /** what one occupied unit actually banks a month, against market */
  collectedRentPerUnit: number | null;
  marketRentPerUnit: number | null;
  /** EGI less operating expenses */
  noi: number | null;
  /** NOI over the price */
  capPct: number | null;
  /**
   * The cap you would print having deducted physical vacancy and nothing
   * else — the naive underwrite, and always the higher number.
   */
  capIfVacancyOnlyPct: number | null;
  /** how many basis points that overstates the going-in cap by */
  capOverstatementBps: number | null;
  /** what the gap is worth at the deal's own cap */
  valueOfGap: number | null;
  note: string;
}

const EMPTY: EgiResult = {
  gpr: null,
  lines: [],
  netRentalIncome: null,
  otherIncome: 0,
  egi: null,
  physicalOccupancyPct: null,
  economicOccupancyPct: null,
  gapPoints: null,
  collectedRentPerUnit: null,
  marketRentPerUnit: null,
  noi: null,
  capPct: null,
  capIfVacancyOnlyPct: null,
  capOverstatementBps: null,
  valueOfGap: null,
  note: "Enter the unit count and the market rent to build the bridge.",
};

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const real = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);
/** A blank is null, never zero — an unstated deduction is absent, not nil. */
const share = (n: number | null | undefined): number => (real(n) && n > 0 ? n : 0);

export interface EgiInput {
  units: number;
  /** monthly, at MARKET — rule 2 */
  marketRentPerUnit: number;
  /** the cover page's figure, 0–100 */
  physicalOccupancyPct: number;
  /** share of GPR the sitting tenants are under market by */
  lossToLeasePct?: number | null;
  /** share of GPR given away as free rent or discounts */
  concessionsPct?: number | null;
  /** model, employee and down units — physically full, paying nothing */
  nonRevenueUnits?: number | null;
  /** share of GPR billed and never collected */
  badDebtPct?: number | null;
  /** parking, RUBS, fees — annual. In EGI, never in the ratio */
  otherIncomeAnnual?: number | null;
  /** annual operating expenses, for the NOI and the cap */
  opexAnnual?: number | null;
  priceUsd?: number | null;
}

export function readEgi(t: EgiInput): EgiResult {
  if (!real(t.units) || t.units <= 0) return EMPTY;
  if (!real(t.marketRentPerUnit) || t.marketRentPerUnit <= 0) return EMPTY;
  if (!real(t.physicalOccupancyPct) || t.physicalOccupancyPct < 0 || t.physicalOccupancyPct > 100) {
    return { ...EMPTY, note: "Physical occupancy is a percentage of the doors — 0 to 100." };
  }

  const gpr = round(t.units * t.marketRentPerUnit * 12);
  const perUnitYear = t.marketRentPerUnit * 12;

  const lines: EgiLine[] = [];
  const add = (label: string, kind: LeakKind, amount: number) => {
    if (amount <= 0) return;
    const a = round(amount);
    lines.push({ label, kind, amount: a, pctOfGpr: gpr > 0 ? round1((a / gpr) * 100) : 0 });
  };

  // Vacancy first, because it is the only one the cover page admits to.
  add("Vacancy", "vacancy", gpr * ((100 - t.physicalOccupancyPct) / 100));
  // Rule 4's other half: a model unit is occupied and pays nothing, so it
  // is its own line rather than part of the vacancy the OM quotes.
  add("Non-revenue units", "vacancy", share(t.nonRevenueUnits) * perUnitYear);
  // Rule 3: below market, not leaking.
  add("Loss to lease", "below-market", gpr * (share(t.lossToLeasePct) / 100));
  add("Concessions", "concession", gpr * (share(t.concessionsPct) / 100));
  add("Bad debt", "leakage", gpr * (share(t.badDebtPct) / 100));

  const deducted = lines.reduce((a, l) => a + l.amount, 0);
  const netRentalIncome = round(gpr - deducted);
  const otherIncome = round(share(t.otherIncomeAnnual));
  const egi = netRentalIncome + otherIncome;

  // Rule 5. Rent over rent — other income is in EGI and out of this.
  const economicOccupancyPct = gpr > 0 ? round1((netRentalIncome / gpr) * 100) : null;
  const gapPoints =
    economicOccupancyPct !== null ? round1(t.physicalOccupancyPct - economicOccupancyPct) : null;

  // What one FULL unit banks a month, which is the figure to set against a
  // comp's quoted rent. The denominator is the occupied doors, because an
  // empty unit is already in the vacancy line and charging it twice would
  // understate what a tenant actually pays.
  const occupiedUnits = t.units * (t.physicalOccupancyPct / 100);
  const collectedRentPerUnit =
    occupiedUnits > 0 ? round2(netRentalIncome / occupiedUnits / 12) : null;

  const opex = real(t.opexAnnual) && t.opexAnnual > 0 ? t.opexAnnual : null;
  const noi = opex === null ? null : round(egi - opex);
  const price = real(t.priceUsd) && t.priceUsd > 0 ? t.priceUsd : null;
  const capPct = noi !== null && price !== null ? round2((noi / price) * 100) : null;

  // The naive underwrite: vacancy off the top and nothing else. It is what
  // a summary page's "95% occupied" invites, and it is always the higher
  // cap — which is why nobody questions it.
  const vacancyOnlyRental = round(gpr * (t.physicalOccupancyPct / 100));
  const naiveNoi = opex === null ? null : round(vacancyOnlyRental + otherIncome - opex);
  const capIfVacancyOnlyPct =
    naiveNoi !== null && price !== null ? round2((naiveNoi / price) * 100) : null;
  const capOverstatementBps =
    capPct !== null && capIfVacancyOnlyPct !== null
      ? round((capIfVacancyOnlyPct - capPct) * 100)
      : null;

  // What the gap costs, capitalised at the deal's OWN cap — the honest
  // rate, not the advertised one, since that is the cap this NOI supports.
  const noiGap = naiveNoi !== null && noi !== null ? naiveNoi - noi : null;
  const valueOfGap =
    noiGap !== null && capPct !== null && capPct > 0 ? round(noiGap / (capPct / 100)) : null;

  // The note names the LARGEST line in the gap and its share, rather than
  // saying "most of" about a 45% plurality. The vacancy line is excluded
  // because the gap is by construction everything except it — physical
  // occupancy already took the empty units off.
  const inGap = lines.filter((l) => l.label !== "Vacancy");
  const biggest = inGap.length
    ? inGap.reduce((best, l) => (l.amount > best.amount ? l : best))
    : null;
  const gapDollars = inGap.reduce((a, l) => a + l.amount, 0);
  const biggestShare =
    biggest && gapDollars > 0 ? Math.round((biggest.amount / gapDollars) * 100) : null;

  let note: string;
  if (gapPoints === null || gapPoints <= 0.05 || biggest === null || biggestShare === null) {
    note = "Nothing stands between the rent roll and the bank beyond the empty units.";
  } else {
    // Rule 3: which bucket the largest line is in decides what to do about
    // it, and they are opposite instructions.
    const clause =
      biggest.kind === "below-market"
        ? "rent the sitting tenants are not paying yet, which closes as leases roll rather than by managing anything"
        : biggest.kind === "concession"
          ? "rent given away on purpose, which reverses when the market does"
          : biggest.kind === "leakage"
            ? "rent billed and never collected, which does not close by itself"
            : "units that are full and pay nothing";
    note = `${biggest.label} is the largest part of the ${gapPoints}-point gap at ${biggestShare}% of it — ${clause}.`;
  }

  return {
    gpr,
    lines,
    netRentalIncome,
    otherIncome,
    egi,
    physicalOccupancyPct: t.physicalOccupancyPct,
    economicOccupancyPct,
    gapPoints,
    collectedRentPerUnit,
    marketRentPerUnit: t.marketRentPerUnit,
    noi,
    capPct,
    capIfVacancyOnlyPct,
    capOverstatementBps,
    valueOfGap,
    note,
  };
}
