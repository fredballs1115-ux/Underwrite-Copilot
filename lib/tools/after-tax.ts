/**
 * Depreciation, and what the taxman takes back at the sale.
 *
 * This is the calculation that most reliably sends an analyst out to a
 * separate model, and the one where the common errors are largest. Three of
 * them, in the order they cost money:
 *
 *   1. **Land is not depreciable.** Depreciating the whole purchase price
 *      overstates the shelter by whatever share of the deal is dirt, which
 *      in an infill market is a third of it.
 *
 *   2. **The gain at the sale does not have one tax rate.** It has three.
 *      What you took as depreciation on the BUILDING comes back as
 *      unrecaptured section 1250 gain at 25%; what you took on personal
 *      property carved out by a cost segregation study comes back under
 *      section 1245 at your ORDINARY rate; only the appreciation above the
 *      original price is taxed at the long-term capital gains rate. Running
 *      the whole gain at 20% understates the bill on a long hold, badly.
 *
 *   3. **Depreciation is a timing benefit, not a permanent one.** The
 *      shelter is real while you hold and most of it is handed back when
 *      you sell. What is left over is the difference between the rate you
 *      sheltered at and the rate you recapture at, plus the time value of
 *      having had the money in between — and this module reports that
 *      difference rather than letting the year-one number stand alone.
 *
 * A cost segregation study is therefore NOT a free lunch, which the numbers
 * here say plainly: it accelerates the deduction into the early years and
 * recaptures the accelerated part at the ordinary rate rather than at 25%.
 * Whether that is worth doing depends on the hold and on the spread between
 * those rates, which is exactly the comparison the card draws.
 *
 * Screening arithmetic, federal only. No state tax, no passive-activity
 * limits, no 1031 exchange, no net investment income tax, and the
 * mid-month convention is ignored. Pure, no I/O.
 */

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

function pctOf(n: number, pct: number): number {
  return n * (pct / 100);
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

/** The two schedules the tax code gives a building. */
export const RESIDENTIAL_LIFE = 27.5;
export const COMMERCIAL_LIFE = 39;

export interface AfterTaxTerms {
  /** what the property cost */
  price: number | null;
  /** the share of that price that is LAND, in % — never depreciable */
  landPct: number | null;
  /** 27.5 for residential, 39 for everything else */
  lifeYears: number | null;
  /** the share of the price a cost segregation study moves to short-life
   *  property, in % — recaptured at ordinary rates, not at 25% */
  costSegPct: number | null;
  /** the life of that carved-out property, in years (5 or 15, typically) */
  costSegLifeYears: number | null;
  /** bonus depreciation taken on the carve-out in year one, in % */
  bonusPct: number | null;
  /** NOI in a stabilized year */
  noi: number | null;
  /** mortgage interest in a stabilized year — deductible */
  interest: number | null;
  /** how long the property is held */
  holdYears: number | null;
  /** what it sells for */
  salePrice: number | null;
  /** the owner's ordinary income rate, in % */
  ordinaryRatePct: number | null;
  /** the long-term capital gains rate, in % */
  capGainsRatePct: number | null;
  /** the unrecaptured section 1250 rate, in % — 25% federal */
  recaptureRatePct: number | null;
}

export interface AfterTaxRead {
  /** price less land — everything that can be written off */
  depreciableBasis: number | null;
  /** the part on the building's own long schedule */
  buildingBasis: number | null;
  /** the part a cost segregation study moved to a short schedule */
  shortBasis: number | null;
  /** the write-off in year one, bonus included */
  yearOneDepreciation: number | null;
  /** the write-off in a later year, after any bonus is spent */
  steadyDepreciation: number | null;
  /** NOI less interest less depreciation — NEGATIVE is the point of it */
  yearOneTaxable: number | null;
  /** the tax on that, negative where the loss shelters other income */
  yearOneTax: number | null;
  /** every dollar written off over the hold */
  totalDepreciation: number | null;
  /** what the shelter was worth over the hold, at the ordinary rate */
  shelterValue: number | null;
  /** price less everything written off */
  adjustedBasis: number | null;
  /** sale price less adjusted basis */
  totalGain: number | null;
  /** the three pieces of that gain, each with its own rate */
  sale: {
    ordinaryRecapture: number;
    unrecaptured1250: number;
    capitalGain: number;
    tax: number;
  } | null;
  /** the shelter less what the sale took back — the REAL benefit */
  netOfRecapture: number | null;
  note: string | null;
}

const EMPTY: AfterTaxRead = {
  depreciableBasis: null,
  buildingBasis: null,
  shortBasis: null,
  yearOneDepreciation: null,
  steadyDepreciation: null,
  yearOneTaxable: null,
  yearOneTax: null,
  totalDepreciation: null,
  shelterValue: null,
  adjustedBasis: null,
  totalGain: null,
  sale: null,
  netOfRecapture: null,
  note: null,
};

export function readAfterTax(t: AfterTaxTerms): AfterTaxRead {
  if (!positive(t.price)) {
    return { ...EMPTY, note: "Set what the property cost." };
  }
  if (!real(t.landPct) || t.landPct < 0 || t.landPct >= 100) {
    return {
      ...EMPTY,
      note: "Set the land's share of the price, under 100 — land is never depreciable, so a deal that is all land has nothing to write off.",
    };
  }
  if (!positive(t.lifeYears)) {
    return { ...EMPTY, note: "Set the schedule: 27.5 years residential, 39 commercial." };
  }
  const segPct = real(t.costSegPct) && t.costSegPct > 0 ? t.costSegPct : 0;
  if (segPct + t.landPct > 100) {
    return {
      ...EMPTY,
      note: "The land and the cost-segregation carve-out cannot be more than the whole price between them.",
    };
  }

  // RULE ONE. Land comes out first and never comes back. Everything below
  // is computed on what is left.
  const depreciableBasis = pctOf(t.price, 100 - t.landPct);
  const shortBasis = pctOf(t.price, segPct);
  const buildingBasis = depreciableBasis - shortBasis;

  const segLife = positive(t.costSegLifeYears) ? t.costSegLifeYears : 5;
  const bonus = real(t.bonusPct) && t.bonusPct > 0 ? Math.min(100, t.bonusPct) : 0;

  const buildingAnnual = buildingBasis / t.lifeYears;
  // Bonus is taken in year one on the carve-out; the remainder of that
  // carve-out runs straight-line over its own short life.
  const bonusYearOne = pctOf(shortBasis, bonus);
  const shortAnnual = (shortBasis - bonusYearOne) / segLife;

  const yearOneDepreciation = buildingAnnual + shortAnnual + bonusYearOne;
  const steadyDepreciation = buildingAnnual + shortAnnual;

  const noi = real(t.noi) ? t.noi : 0;
  const interest = real(t.interest) ? t.interest : 0;
  const yearOneTaxable = noi - interest - yearOneDepreciation;
  const ordinary = real(t.ordinaryRatePct) ? t.ordinaryRatePct : 0;
  // A negative tax is not a refund on its own; it is the value of a loss
  // set against other income, which is what a real estate investor with
  // other income actually gets. Reported signed rather than floored at
  // zero, because the shelter IS the answer people come here for.
  const yearOneTax = pctOf(yearOneTaxable, ordinary);

  const hold = positive(t.holdYears) ? t.holdYears : null;
  if (hold === null) {
    return {
      ...EMPTY,
      depreciableBasis: round(depreciableBasis),
      buildingBasis: round(buildingBasis),
      shortBasis: round(shortBasis),
      yearOneDepreciation: round(yearOneDepreciation),
      steadyDepreciation: round(steadyDepreciation),
      yearOneTaxable: round(yearOneTaxable),
      yearOneTax: round(yearOneTax),
      note: "Set the hold and the sale price to see what recapture takes back.",
    };
  }

  // Depreciation stops when the schedule runs out, which on a long hold of
  // 5-year property it does. Capped per schedule rather than in total.
  const buildingTaken = Math.min(buildingBasis, buildingAnnual * hold);
  const shortTaken = Math.min(shortBasis, bonusYearOne + shortAnnual * hold);
  const totalDepreciation = buildingTaken + shortTaken;
  const shelterValue = pctOf(totalDepreciation, ordinary);
  const adjustedBasis = t.price - totalDepreciation;

  if (!positive(t.salePrice)) {
    return {
      ...EMPTY,
      depreciableBasis: round(depreciableBasis),
      buildingBasis: round(buildingBasis),
      shortBasis: round(shortBasis),
      yearOneDepreciation: round(yearOneDepreciation),
      steadyDepreciation: round(steadyDepreciation),
      yearOneTaxable: round(yearOneTaxable),
      yearOneTax: round(yearOneTax),
      totalDepreciation: round(totalDepreciation),
      shelterValue: round(shelterValue),
      adjustedBasis: round(adjustedBasis),
      note: "Set the sale price to see what recapture takes back.",
    };
  }

  const totalGain = t.salePrice - adjustedBasis;

  // RULE TWO. The gain is three pieces, each with its own rate, and they
  // are filled in a fixed order: section 1245 property first (recaptured at
  // the ordinary rate), then unrecaptured section 1250 gain on the building
  // (25%), and only what is left above the original price is capital gain.
  const recapRate = real(t.recaptureRatePct) ? t.recaptureRatePct : 25;
  const capRate = real(t.capGainsRatePct) ? t.capGainsRatePct : 20;

  let left = Math.max(0, totalGain);
  const ordinaryRecapture = Math.min(left, shortTaken);
  left -= ordinaryRecapture;
  const unrecaptured1250 = Math.min(left, buildingTaken);
  left -= unrecaptured1250;
  const capitalGain = left;

  const tax =
    pctOf(ordinaryRecapture, ordinary) +
    pctOf(unrecaptured1250, recapRate) +
    pctOf(capitalGain, capRate);

  // RULE THREE. What the shelter was actually worth, once the sale has
  // taken its share back. On a deal with no appreciation and one rate
  // either side this lands near zero, which is the honest headline:
  // depreciation moves tax through time rather than removing it.
  const recaptureCost =
    pctOf(ordinaryRecapture, ordinary) + pctOf(unrecaptured1250, recapRate);
  const netOfRecapture = shelterValue - recaptureCost;

  return {
    depreciableBasis: round(depreciableBasis),
    buildingBasis: round(buildingBasis),
    shortBasis: round(shortBasis),
    yearOneDepreciation: round(yearOneDepreciation),
    steadyDepreciation: round(steadyDepreciation),
    yearOneTaxable: round(yearOneTaxable),
    yearOneTax: round(yearOneTax),
    totalDepreciation: round(totalDepreciation),
    shelterValue: round(shelterValue),
    adjustedBasis: round(adjustedBasis),
    totalGain: round(totalGain),
    sale: {
      ordinaryRecapture: round(ordinaryRecapture),
      unrecaptured1250: round(unrecaptured1250),
      capitalGain: round(capitalGain),
      tax: round(tax),
    },
    netOfRecapture: round(netOfRecapture),
    note:
      totalGain < 0
        ? "The sale is below the depreciated basis, so there is a LOSS rather than a gain — no recapture is due."
        : null,
  };
}
