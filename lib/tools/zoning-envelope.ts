/**
 * What the site can actually hold.
 *
 * Every development pro forma opens with a unit count, and that unit count
 * almost always comes from ONE constraint — usually the density limit,
 * because it is the one written as a number of units. The zoning code
 * imposes four or five at once and the site gets the SMALLEST of them, so
 * the number at the top of the model is an upper bound on an upper bound
 * and nothing in the model says which line produced it.
 *
 * Four rules.
 *
 * Rule 1. THE ANSWER IS THE MINIMUM, AND THE BINDING CONSTRAINT IS THE
 * ANSWER'S REAL NAME. Density, floor area, the height-and-coverage
 * envelope and parking are independent caps; `binding` says which one the
 * site actually ran into, because that is what a variance request, a
 * rezoning or a site-plan revision has to move. `sizeLoan`'s convention,
 * applied to dirt.
 *
 * Rule 2. FLOOR AREA RATIO IS MEASURED ON GROSS BUILDING AREA; UNITS ARE
 * SOLD AND RENTED IN NET. They are different numbers and the gap is the
 * building's efficiency — corridors, stairs, lifts, lobbies, walls. A 900
 * square foot apartment in an 82%-efficient building consumes 1,098 square
 * feet of floor area ratio, so dividing the buildable area by the unit size
 * overstates the count by the whole inefficiency. `naiveUnitsByFar` is that
 * mistake priced, and it is the most common error on a napkin.
 *
 * Rule 3. SURFACE PARKING COMPETES WITH THE BUILDING FOR THE SAME LAND, so
 * it is not a separate cap at all — it is a JOINT constraint. Every unit
 * added needs its own spaces, and those spaces take site area the footprint
 * can no longer use. Treating "spaces that fit" and "units that fit" as two
 * independent questions gets both wrong; solved together it is one line:
 *
 *     units × (ratio × SF_PER_SURFACE_SPACE + unitGross / floors) ≤ site
 *
 * Structured parking escapes the land constraint and pays for it in the
 * envelope instead, and whether it consumes floor area ratio is a fact
 * about the code rather than about the building — so it is an input.
 *
 * Rule 4. A DENSITY BONUS IS A TRADE WITH A BREAK-EVEN, AND THE BREAK-EVEN
 * IS COMPUTABLE. The extra units are real and so is the restricted rent on
 * the set-aside, and the set-aside is struck against the BONUSED count
 * rather than the base one — so the discount reaches units the bonus never
 * created. That gives an exact crossing:
 *
 *     bonus needed = s·(market − restricted) / (market − s·(market − restricted))
 *
 * On the seeded rents a 20% set-aside needs a bonus above 8.7% to be worth
 * taking at all, and anything under it LOSES money while reading as free
 * density — a 5% bonus for a 20% set-aside costs $150,000 a year.
 * `bonusBreakEvenPct` is that figure, drawn beside the offer, because
 * "20% more units for 20% affordable" sounds like a fair swap and is not
 * one: the two percentages are measured against different things.
 *
 * The crossing is CONTINUOUS and unit counts are INTEGERS, so the realised
 * sign flips a little above it — on the seed the break-even reads 8.7% and
 * a 9% bonus is still $12,000 down, because the bonused count floors and
 * the set-aside ceilings. That is the arithmetic being honest about a
 * building made of whole apartments, not a rounding bug to correct.
 *
 * Pure, no I/O. Sizes are square feet unless a name says otherwise.
 */

/** Square feet a surface space takes, including its share of drive aisle. */
export const SF_PER_SURFACE_SPACE = 350;

/** Gross square feet a structured space takes inside a deck. */
export const SF_PER_STRUCTURED_SPACE = 350;

/** Square feet in an acre — the same constant `measure-math` uses. */
export const SF_PER_ACRE = 43_560;

function real(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function positive(n: number | null | undefined): n is number {
  return real(n) && n > 0;
}

export type ParkingType = "surface" | "structured";

/** Which line of the code the site ran into first. */
export type Binding = "density" | "floor area" | "height" | "parking";

export interface EnvelopeInput {
  /** the site, in square feet */
  siteSf: number | null;
  /** the density limit, in units per acre */
  unitsPerAcre: number | null;
  /** the floor area ratio */
  far: number | null;
  /** the height limit, in feet */
  maxHeightFt: number | null;
  /** floor to floor, in feet — what turns a height into a storey count */
  floorToFloorFt: number | null;
  /** the lot coverage limit, in % of the site */
  lotCoveragePct: number | null;
  /** the average unit, NET — rule 2 */
  avgUnitSf: number | null;
  /** net over gross, in % — rule 2 */
  efficiencyPct: number | null;
  /** spaces required per unit */
  parkingRatio: number | null;
  /** where those spaces go — rule 3 */
  parkingType: ParkingType;
  /** whether structured parking counts against the floor area ratio; a fact
   *  about the code, so it is an input and never inferred */
  parkingCountsAgainstFar: boolean;
  /** the density bonus on offer, in % over the base count — rule 4 */
  bonusDensityPct?: number | null;
  /** the affordable set-aside it requires, in % of the BONUSED count */
  setAsidePct?: number | null;
  /** annual market rent per unit */
  marketRentAnnual?: number | null;
  /** annual restricted rent per set-aside unit */
  restrictedRentAnnual?: number | null;
}

export interface EnvelopeRead {
  /** the site, said the other way */
  siteAcres: number | null;
  /** each cap on its own, before the minimum is taken */
  unitsByDensity: number | null;
  unitsByFar: number | null;
  unitsByHeight: number | null;
  unitsByParking: number | null;
  /** the smallest of them, and which one it was — rule 1 */
  units: number | null;
  binding: Binding | null;
  /** rule 2: the same floor-area cap with the efficiency forgotten, and
   *  what forgetting it would have added */
  naiveUnitsByFar: number | null;
  unitsOverstatedByEfficiency: number | null;
  /** what one unit costs in gross building area */
  grossSfPerUnit: number | null;
  /** the building the answer implies */
  buildableGrossSf: number | null;
  floors: number | null;
  footprintSf: number | null;
  /** how much of the site the footprint uses, against the limit */
  coverageUsedPct: number | null;
  /** rule 3 */
  spacesRequired: number | null;
  parkingLandSf: number | null;
  /** rule 4 — the trade, priced */
  unitsWithBonus: number | null;
  setAsideUnits: number | null;
  rentWithoutBonus: number | null;
  rentWithBonus: number | null;
  bonusWorth: number | null;
  /** the bonus this set-aside needs before the trade pays, in % — rule 4 */
  bonusBreakEvenPct: number | null;
  note: string | null;
}

const EMPTY: EnvelopeRead = {
  siteAcres: null,
  unitsByDensity: null,
  unitsByFar: null,
  unitsByHeight: null,
  unitsByParking: null,
  units: null,
  binding: null,
  naiveUnitsByFar: null,
  unitsOverstatedByEfficiency: null,
  grossSfPerUnit: null,
  buildableGrossSf: null,
  floors: null,
  footprintSf: null,
  coverageUsedPct: null,
  spacesRequired: null,
  parkingLandSf: null,
  unitsWithBonus: null,
  setAsideUnits: null,
  rentWithoutBonus: null,
  rentWithBonus: null,
  bonusWorth: null,
  bonusBreakEvenPct: null,
  note: null,
};

export function readEnvelope(t: EnvelopeInput): EnvelopeRead {
  if (!positive(t.siteSf)) {
    return { ...EMPTY, note: "Enter the site area to see what it holds." };
  }
  if (!positive(t.avgUnitSf)) {
    return { ...EMPTY, siteAcres: round2(t.siteSf / SF_PER_ACRE), note: "Enter the average unit size — every cap but density is measured in floor area." };
  }
  const efficiency = positive(t.efficiencyPct) && t.efficiencyPct <= 100 ? t.efficiencyPct / 100 : null;
  if (efficiency === null) {
    return {
      ...EMPTY,
      siteAcres: round2(t.siteSf / SF_PER_ACRE),
      note: "Enter the building's efficiency, between 0 and 100 — floor area ratio is measured gross and a unit is net.",
    };
  }

  const siteAcres = round2(t.siteSf / SF_PER_ACRE);
  // Rule 2. What one unit really costs in the currency the code counts in.
  const grossSfPerUnit = t.avgUnitSf / efficiency;

  const ratio = real(t.parkingRatio) && t.parkingRatio >= 0 ? t.parkingRatio : 0;
  const structuredPerUnit =
    t.parkingType === "structured" ? ratio * SF_PER_STRUCTURED_SPACE : 0;

  // Structured parking is building: it always eats the envelope, and it eats
  // the floor area ratio only where the code says it does.
  const farPerUnit =
    grossSfPerUnit + (t.parkingCountsAgainstFar ? structuredPerUnit : 0);
  const envelopePerUnit = grossSfPerUnit + structuredPerUnit;

  const unitsByDensity = positive(t.unitsPerAcre)
    ? Math.floor((t.siteSf / SF_PER_ACRE) * t.unitsPerAcre)
    : null;

  const unitsByFar = positive(t.far) ? Math.floor((t.siteSf * t.far) / farPerUnit) : null;
  // The same cap with rule 2 forgotten — the napkin answer.
  const naiveUnitsByFar = positive(t.far)
    ? Math.floor((t.siteSf * t.far) / (t.avgUnitSf + (t.parkingCountsAgainstFar ? structuredPerUnit : 0)))
    : null;

  const floors =
    positive(t.maxHeightFt) && positive(t.floorToFloorFt)
      ? Math.floor(t.maxHeightFt / t.floorToFloorFt)
      : null;
  const coverage =
    positive(t.lotCoveragePct) && t.lotCoveragePct <= 100 ? t.lotCoveragePct / 100 : null;
  const maxFootprint = coverage === null ? null : t.siteSf * coverage;
  const unitsByHeight =
    floors === null || maxFootprint === null
      ? null
      : Math.floor((floors * maxFootprint) / envelopePerUnit);

  // Rule 3. Surface parking and the building share one site, so this is
  // solved jointly rather than asked as two questions. Without a storey
  // count there is no footprint to trade against, so there is no answer —
  // saying "as many as the land holds" would be assuming one storey.
  const unitsByParking =
    t.parkingType !== "surface" || ratio <= 0
      ? null
      : floors === null
        ? null
        : Math.floor(t.siteSf / (ratio * SF_PER_SURFACE_SPACE + grossSfPerUnit / floors));

  const caps: { name: Binding; units: number }[] = [];
  if (unitsByDensity !== null) caps.push({ name: "density", units: unitsByDensity });
  if (unitsByFar !== null) caps.push({ name: "floor area", units: unitsByFar });
  if (unitsByHeight !== null) caps.push({ name: "height", units: unitsByHeight });
  if (unitsByParking !== null) caps.push({ name: "parking", units: unitsByParking });

  if (caps.length === 0) {
    return {
      ...EMPTY,
      siteAcres,
      grossSfPerUnit: round(grossSfPerUnit),
      naiveUnitsByFar,
      note: "Enter at least one limit — a density, a floor area ratio, or a height with a coverage.",
    };
  }

  // Rule 1. The minimum, and the name of the line that produced it.
  const smallest = caps.reduce((a, b) => (b.units < a.units ? b : a));
  const units = Math.max(0, smallest.units);
  const binding = smallest.name;

  const buildableGrossSf = round(units * grossSfPerUnit);
  const footprintSf = floors === null || floors <= 0 ? null : round((units * envelopePerUnit) / floors);
  const spacesRequired = ratio > 0 ? Math.ceil(units * ratio) : null;
  const parkingLandSf =
    t.parkingType === "surface" && spacesRequired !== null
      ? round(spacesRequired * SF_PER_SURFACE_SPACE)
      : null;

  const bonus = bonusTrade(t, units);

  const x: EnvelopeRead = {
    siteAcres,
    unitsByDensity,
    unitsByFar,
    unitsByHeight,
    unitsByParking,
    units,
    binding,
    naiveUnitsByFar,
    unitsOverstatedByEfficiency:
      naiveUnitsByFar === null || unitsByFar === null ? null : naiveUnitsByFar - unitsByFar,
    grossSfPerUnit: round(grossSfPerUnit),
    buildableGrossSf,
    floors,
    footprintSf,
    coverageUsedPct:
      footprintSf === null ? null : round1((footprintSf / t.siteSf) * 100),
    spacesRequired,
    parkingLandSf,
    ...bonus,
    note: null,
  };
  return { ...x, note: noteFor(x, t) };
}

/**
 * Rule 4. The set-aside is struck against the BONUSED count, which is what
 * makes a generous bonus with a generous set-aside so often a wash — the
 * discount applies to units the bonus did not create.
 */
function bonusTrade(
  t: EnvelopeInput,
  baseUnits: number,
): Pick<
  EnvelopeRead,
  | "unitsWithBonus"
  | "setAsideUnits"
  | "rentWithoutBonus"
  | "rentWithBonus"
  | "bonusWorth"
  | "bonusBreakEvenPct"
> {
  const pct = positive(t.bonusDensityPct) ? t.bonusDensityPct : null;
  const setAside = positive(t.setAsidePct) ? t.setAsidePct : null;
  const market = positive(t.marketRentAnnual) ? t.marketRentAnnual : null;
  const restricted =
    real(t.restrictedRentAnnual) && t.restrictedRentAnnual >= 0 ? t.restrictedRentAnnual : null;
  // The crossing, which exists whenever there is a discount to trade
  // against — independent of the bonus actually on offer, which is exactly
  // what makes it worth printing beside it.
  const breakEven =
    setAside === null || market === null || restricted === null || restricted >= market
      ? null
      : (() => {
          const give = (setAside / 100) * (market - restricted);
          return market - give <= 0 ? null : round1((give / (market - give)) * 100);
        })();

  if (pct === null) {
    return {
      unitsWithBonus: null,
      setAsideUnits: null,
      rentWithoutBonus: null,
      rentWithBonus: null,
      bonusWorth: null,
      bonusBreakEvenPct: breakEven,
    };
  }

  const unitsWithBonus = Math.floor(baseUnits * (1 + pct / 100));
  const setAsideUnits = setAside === null ? 0 : Math.ceil(unitsWithBonus * (setAside / 100));
  if (market === null || restricted === null) {
    return {
      unitsWithBonus,
      setAsideUnits,
      rentWithoutBonus: null,
      rentWithBonus: null,
      bonusWorth: null,
      bonusBreakEvenPct: breakEven,
    };
  }

  const rentWithoutBonus = round(baseUnits * market);
  const rentWithBonus = round(
    (unitsWithBonus - setAsideUnits) * market + setAsideUnits * restricted,
  );
  return {
    unitsWithBonus,
    setAsideUnits,
    rentWithoutBonus,
    rentWithBonus,
    bonusWorth: round(rentWithBonus - rentWithoutBonus),
    bonusBreakEvenPct: breakEven,
  };
}

/**
 * The one sentence, leading with rule 4 where a bonus has been priced — a
 * trade that loses money is the finding, and it is the one that reads as
 * free.
 */
function noteFor(x: EnvelopeRead, t: EnvelopeInput): string {
  // A trade that loses money while reading as free density leads.
  if (x.bonusWorth !== null && x.bonusWorth < 0 && x.bonusBreakEvenPct !== null) {
    return `The density bonus takes ${usd(Math.abs(x.bonusWorth))} a year off the rent roll: this set-aside needs a bonus above ${x.bonusBreakEvenPct}% before it pays, because the discount is struck against the bonused count and reaches units the bonus never created.`;
  }
  // Then the site's own finding — parking binding is the one nobody expects.
  if (x.binding === "parking" && t.parkingType === "surface") {
    return `Parking binds: the spaces and the footprint are competing for the same ${Math.round(t.siteSf ?? 0).toLocaleString("en-US")} square feet, so a deck buys units rather than convenience.`;
  }
  if (x.bonusWorth !== null && x.bonusWorth > 0 && x.bonusBreakEvenPct !== null) {
    return `The density bonus adds ${x.unitsWithBonus! - x.units!} units and ${usd(x.bonusWorth)} a year — it clears the ${x.bonusBreakEvenPct}% this set-aside needs to break even.`;
  }
  if (x.unitsOverstatedByEfficiency !== null && x.unitsOverstatedByEfficiency > 0) {
    return `${cap(x.binding)} binds, and measuring the units net rather than gross would have claimed ${x.unitsOverstatedByEfficiency} more than the floor area ratio allows.`;
  }
  if (x.binding !== null) {
    return `${cap(x.binding)} binds at ${x.units} units — that is the line a variance would have to move.`;
  }
  return "Enter the site and at least one limit.";
}

function cap(b: Binding | null): string {
  if (b === null) return "Nothing";
  return b.charAt(0).toUpperCase() + b.slice(1);
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

const round1 = (n: number) => round(n, 1);
const round2 = (n: number) => round(n, 2);
