/**
 * The rent a new building needs, and what that says about the one you own.
 *
 * "We are buying at sixty percent of replacement cost" is the most quoted
 * comfort in the business, and on its own it protects nothing. Replacement
 * cost is a statement about what it would cost to build — it says nothing
 * about whether anyone WILL. The number that decides that is the
 * FEASIBILITY RENT: the rent a developer must underwrite to earn their
 * required yield on cost. Below it nothing gets built, whatever the
 * existing stock trades for; above it, competing supply arrives next door
 * and the discount to replacement cost does not stop a single shovel.
 *
 * Four rules.
 *
 * Rule 1. FEASIBILITY RENT IS DERIVED FROM THE DEVELOPER'S REQUIRED
 * RETURN, NOT FROM THE MARKET. It falls out of the budget and the yield
 * on cost, and it is a COST-side number:
 *
 *     rent = (totalCost × yieldOnCost + opex × sf) / (sf × (1 − vacancy))
 *
 * Which is why it can sit far above the rents actually being signed, for
 * years, without anything resolving it.
 *
 * Rule 2. BUYING BELOW REPLACEMENT COST IS NOT A MOAT; THE RENT GAP IS.
 * These are two independent facts and they can point opposite ways. A
 * building bought at 60% of replacement cost in a market whose rents are
 * ABOVE feasibility gets a competitor next door; one bought at par in a
 * market 20% below feasibility has years before anything new opens.
 * `supplyProtected` reads the rent gap and nothing else, because that is
 * the fact that governs.
 *
 * Rule 3. REPLACEMENT COST INCLUDES LAND AT TODAY'S PRICE. So "sixty
 * percent of replacement" is partly a claim about today's land market
 * rather than about the building, and land is the volatile piece — the
 * same building is a different percentage of replacement cost in two
 * different years with no brick having moved. `costPerSf` is drawn beside
 * `landShareOfCostPct` for exactly that reason.
 *
 * Rule 4. THE GAP CLOSES FROM EITHER SIDE. Rents can rise to feasibility,
 * or costs can fall to today's rents, and almost nobody models the second.
 * `yearsOfGrowthToFeasibility` prices the first at a stated growth rate;
 * `breakEvenHardCostPerSf` solves the second — the hard cost at which
 * today's market rent already pencils. A negative answer there is its own
 * finding: the land alone is dear enough that free construction would not
 * make the site work.
 *
 * Pure, no I/O. Rents and costs are per rentable square foot throughout.
 */

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

export interface FeasibilityInput {
  /** the rentable area a new building on the site would hold */
  buildableSf: number | null;
  /** the land, all in — rule 3 */
  landCost: number | null;
  /** hard construction, per rentable foot */
  hardCostPerSf: number | null;
  /** soft costs, as a % of hard */
  softCostPct: number | null;
  /** the developer's fee, as a % of hard plus soft (never of the land) */
  developerFeePct: number | null;
  /** the yield on cost a developer would require, in % — rule 1 */
  requiredYieldOnCostPct: number | null;
  /** stabilized operating expense, per rentable foot */
  opexPerSf: number | null;
  /** stabilized vacancy, in % */
  stabilizedVacancyPct: number | null;
  /** what the market signs today, per rentable foot — rule 2 */
  marketRentPerSf: number | null;
  /** the rent growth to measure the gap's closing against — rule 4 */
  rentGrowthPct?: number | null;
  /** your own basis per rentable foot, if you are holding one */
  yourBasisPerSf?: number | null;
}

export interface FeasibilityRead {
  /** the budget */
  hardCost: number | null;
  softCost: number | null;
  developerFee: number | null;
  totalCost: number | null;
  /** replacement cost per rentable foot — rule 3 */
  costPerSf: number | null;
  landShareOfCostPct: number | null;
  /** rule 1 */
  feasibilityRentPerSf: number | null;
  /** rule 2 — signed: positive means the market is BELOW feasibility */
  rentGapPerSf: number | null;
  rentGapPct: number | null;
  supplyProtected: boolean | null;
  /** your basis against replacement cost, in % */
  basisVsReplacementPct: number | null;
  /** rule 4 — the two ways the gap closes */
  yearsOfGrowthToFeasibility: number | null;
  breakEvenHardCostPerSf: number | null;
  /** the NOI a new building must earn to clear the required yield */
  requiredNoi: number | null;
  note: string | null;
}

const EMPTY: FeasibilityRead = {
  hardCost: null,
  softCost: null,
  developerFee: null,
  totalCost: null,
  costPerSf: null,
  landShareOfCostPct: null,
  feasibilityRentPerSf: null,
  rentGapPerSf: null,
  rentGapPct: null,
  supplyProtected: null,
  basisVsReplacementPct: null,
  yearsOfGrowthToFeasibility: null,
  breakEvenHardCostPerSf: null,
  requiredNoi: null,
  note: null,
};

export function readFeasibility(t: FeasibilityInput): FeasibilityRead {
  if (!positive(t.buildableSf)) {
    return { ...EMPTY, note: "Enter the rentable area a new building would hold." };
  }
  if (!positive(t.hardCostPerSf)) {
    return { ...EMPTY, note: "Enter the hard construction cost per foot." };
  }
  if (!positive(t.requiredYieldOnCostPct)) {
    return { ...EMPTY, note: "Enter the yield on cost a developer would require — it is what sets the rent." };
  }

  const sf = t.buildableSf;
  const land = positive(t.landCost) ? t.landCost : 0;
  const softPct = real(t.softCostPct) && t.softCostPct >= 0 ? t.softCostPct / 100 : 0;
  const feePct = real(t.developerFeePct) && t.developerFeePct >= 0 ? t.developerFeePct / 100 : 0;

  const hardCost = sf * t.hardCostPerSf;
  const softCost = hardCost * softPct;
  // The fee is struck on the construction, never on the land — a developer
  // is paid for building, not for having bought.
  const developerFee = (hardCost + softCost) * feePct;
  const totalCost = land + hardCost + softCost + developerFee;

  const yoc = t.requiredYieldOnCostPct / 100;
  const opex = real(t.opexPerSf) && t.opexPerSf >= 0 ? t.opexPerSf : 0;
  const vac =
    real(t.stabilizedVacancyPct) && t.stabilizedVacancyPct >= 0 && t.stabilizedVacancyPct < 100
      ? t.stabilizedVacancyPct / 100
      : 0;

  const requiredNoi = totalCost * yoc;
  // Rule 1, rearranged for the rent.
  const feasibilityRent = (requiredNoi + opex * sf) / (sf * (1 - vac));

  const market = positive(t.marketRentPerSf) ? t.marketRentPerSf : null;
  const gap = market === null ? null : feasibilityRent - market;
  const gapPct = market === null || market <= 0 ? null : ((feasibilityRent - market) / market) * 100;

  // Rule 4a. How long today's rent needs to grow to reach feasibility.
  const growth = real(t.rentGrowthPct) ? t.rentGrowthPct / 100 : null;
  const years =
    market === null || growth === null || growth <= 0 || feasibilityRent <= market
      ? null
      : Math.log(feasibilityRent / market) / Math.log(1 + growth);

  // Rule 4b. The hard cost at which today's rent already pencils. Solved
  // rather than scaled, because the fee compounds on the soft costs which
  // compound on the hard.
  let breakEvenHard: number | null = null;
  if (market !== null) {
    const noiAtMarket = market * sf * (1 - vac) - opex * sf;
    const budgetAtMarket = noiAtMarket / yoc;
    const multiplier = (1 + softPct) * (1 + feePct);
    breakEvenHard = multiplier > 0 ? (budgetAtMarket - land) / multiplier / sf : null;
  }

  const costPerSf = totalCost / sf;
  const basis = positive(t.yourBasisPerSf) ? t.yourBasisPerSf : null;

  const x: FeasibilityRead = {
    hardCost: round(hardCost),
    softCost: round(softCost),
    developerFee: round(developerFee),
    totalCost: round(totalCost),
    costPerSf: round2(costPerSf),
    landShareOfCostPct: totalCost > 0 ? round1((land / totalCost) * 100) : null,
    feasibilityRentPerSf: round2(feasibilityRent),
    rentGapPerSf: gap === null ? null : round2(gap),
    rentGapPct: gapPct === null ? null : round1(gapPct),
    // Rule 2: this reads the rent gap and NOTHING else.
    supplyProtected: gap === null ? null : gap > 0,
    basisVsReplacementPct: basis === null || costPerSf <= 0 ? null : round1((basis / costPerSf) * 100),
    yearsOfGrowthToFeasibility: years === null ? null : round1(years),
    breakEvenHardCostPerSf: breakEvenHard === null ? null : round2(breakEvenHard),
    requiredNoi: round(requiredNoi),
    note: null,
  };
  return { ...x, note: noteFor(x) };
}

/**
 * The one sentence, leading with rule 2 — because the discount to
 * replacement cost is what gets quoted and the rent gap is what governs,
 * and the two are most worth saying together when they disagree.
 */
function noteFor(x: FeasibilityRead): string {
  const cheap = x.basisVsReplacementPct !== null && x.basisVsReplacementPct < 100;
  if (x.supplyProtected === false && cheap) {
    return `Bought at ${x.basisVsReplacementPct}% of replacement cost, and still exposed: the market already pays ${usd(Math.abs(x.rentGapPerSf ?? 0))} a foot MORE than a new building needs, so the discount buys no protection from the one being built next door.`;
  }
  if (x.supplyProtected === false) {
    return `The market pays ${usd(Math.abs(x.rentGapPerSf ?? 0))} a foot more than a new building needs to earn its yield, so new supply pencils today.`;
  }
  if (x.supplyProtected === true && x.yearsOfGrowthToFeasibility !== null) {
    return `Rents are ${Math.abs(x.rentGapPct ?? 0)}% below what a new building needs, which is ${x.yearsOfGrowthToFeasibility} years of growth away — that gap, not the discount to replacement cost, is what keeps a competitor off the block.`;
  }
  if (x.supplyProtected === true) {
    return `Rents are ${Math.abs(x.rentGapPct ?? 0)}% below what a new building needs, so nothing pencils here yet. Enter a growth rate to see how long that lasts.`;
  }
  return "Enter today's market rent to see whether a new building pencils against it.";
}

function usd(n: number): string {
  return `$${Math.abs(n).toFixed(2)}`;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

const round1 = (n: number) => round(n, 1);
const round2 = (n: number) => round(n, 2);
