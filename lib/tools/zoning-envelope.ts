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
 * density — on 140 units the density limit holds, a 5% bonus for a 20%
 * set-aside costs $150,000 a year. `bonusBreakEvenPct` is that figure,
 * drawn beside the offer, because "20% more units for 20% affordable"
 * sounds like a fair swap and is not one: the two percentages are measured
 * against different things.
 *
 * And a bonus lifts the DENSITY LIMIT, not the site: the bonused count is
 * the minimum again, the lifted density in place of the old one, so where
 * floor area, height or parking already holds the site under the density
 * limit the bonus adds nothing until that cap is relieved — rule 1 applied
 * to the bonus. The first version applied it to whatever cap bound, and on
 * the seed, where parking holds the site to 140, it printed 168 units and
 * $528,000 a year that the site cannot hold; the 20% bonus lifts the
 * density limit to 192 and adds none of them, and taken as it stands it
 * restricts 21 of the 140 for $252,000 a year. `bonusNote` names the cap
 * that holds it and the relief that would let the lifted limit fit.
 *
 * The crossing is CONTINUOUS and unit counts are INTEGERS, so the realised
 * sign flips a little above it — at 140 units the break-even reads 8.7% and
 * a 9% bonus is still $12,000 down, because the bonused count floors and
 * the set-aside ceilings. That is the arithmetic being honest about a
 * building made of whole apartments, not a rounding bug to correct.
 *
 * Pure, no I/O. Sizes are square feet unless a name says otherwise.
 */

import { withArticle } from "@/lib/article";

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
  /** rule 4 — the trade, priced. The density limit the bonus lifts to… */
  unitsByDensityWithBonus: number | null;
  /** …the count once it is lifted: the minimum again, the lifted density in
   *  place of the old one, so a cap that already held the site still does */
  unitsWithBonus: number | null;
  /** the cap that binds with the bonus — where it is not density, the bonus
   *  is held below the limit it lifted */
  bindingWithBonus: Binding | null;
  /** the units the bonus actually adds, and that as a share of the base */
  unitsAddedByBonus: number | null;
  usableBonusPct: number | null;
  setAsideUnits: number | null;
  rentWithoutBonus: number | null;
  rentWithBonus: number | null;
  bonusWorth: number | null;
  /** the bonus this set-aside needs before the trade pays, in % — rule 4 */
  bonusBreakEvenPct: number | null;
  /** what the bonus does on this site, where a cap holds it below the limit
   *  it lifts or there is no density limit to lift — drawn with the bonus */
  bonusNote: string | null;
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
  unitsByDensityWithBonus: null,
  unitsWithBonus: null,
  bindingWithBonus: null,
  unitsAddedByBonus: null,
  usableBonusPct: null,
  setAsideUnits: null,
  rentWithoutBonus: null,
  rentWithBonus: null,
  bonusWorth: null,
  bonusBreakEvenPct: null,
  bonusNote: null,
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

  // Every cap but density, in the order a tie is named in. The bonus lifts
  // the density limit and nothing else, so it re-takes the minimum over
  // these with its own density in the old one's place — rule 4.
  const others: Cap[] = [];
  if (unitsByFar !== null) others.push({ name: "floor area", units: unitsByFar });
  if (unitsByHeight !== null) others.push({ name: "height", units: unitsByHeight });
  if (unitsByParking !== null) others.push({ name: "parking", units: unitsByParking });
  const caps: Cap[] =
    unitsByDensity === null ? others : [{ name: "density", units: unitsByDensity }, ...others];

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
  const smallest = smallestOf(caps);
  const units = Math.max(0, smallest.units);
  const binding = smallest.name;

  const buildableGrossSf = round(units * grossSfPerUnit);
  const footprintSf = floors === null || floors <= 0 ? null : round((units * envelopePerUnit) / floors);
  const spacesRequired = ratio > 0 ? Math.ceil(units * ratio) : null;
  const parkingLandSf =
    t.parkingType === "surface" && spacesRequired !== null
      ? round(spacesRequired * SF_PER_SURFACE_SPACE)
      : null;

  // What would have to give for a lifted density limit to fit — the figure
  // a relief request asks for, solved from each cap's own line.
  const reliefFor = (name: Binding, target: number): string | null => {
    if (name === "floor area" && positive(t.far)) {
      return `a floor area ratio of ${(Math.ceil(((target * farPerUnit) / (t.siteSf as number)) * 100) / 100).toFixed(2)}`;
    }
    if (name === "height" && maxFootprint !== null && positive(t.floorToFloorFt)) {
      const storeys = Math.ceil((target * envelopePerUnit) / maxFootprint);
      return `${storeys} storeys (${round(storeys * t.floorToFloorFt)} feet)`;
    }
    if (name === "parking" && floors !== null) {
      // The joint line of rule 3 solved for the ratio instead of the units.
      const most = (t.siteSf as number) / target - grossSfPerUnit / floors;
      if (most <= 0) return "more storeys than the height limit allows — the footprint alone would cover the site";
      const ratioAtMost = Math.floor((most / SF_PER_SURFACE_SPACE) * 100) / 100;
      return ratioAtMost <= 0
        ? "no surface parking at all"
        : `${ratioAtMost.toFixed(2)} spaces a unit or fewer`;
    }
    return null;
  };

  const bonus = bonusTrade(t, units, unitsByDensity, others, reliefFor);

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

interface Cap {
  name: Binding;
  units: number;
}

/** The smallest cap, the first named on a tie — rule 1. */
function smallestOf(caps: Cap[]): Cap {
  return caps.reduce((a, b) => (b.units < a.units ? b : a));
}

/**
 * Rule 4. The bonus lifts the density limit and the site gets the minimum
 * again — so a cap that already held the site under the density limit
 * holds the bonus too, and the units it adds are the lifted minimum less
 * the base one, never the base grossed up. The set-aside is struck against
 * the BONUSED count, which is what makes a generous bonus with a generous
 * set-aside so often a wash — the discount applies to units the bonus did
 * not create.
 */
function bonusTrade(
  t: EnvelopeInput,
  baseUnits: number,
  unitsByDensity: number | null,
  others: Cap[],
  reliefFor: (name: Binding, target: number) => string | null,
): Pick<
  EnvelopeRead,
  | "unitsByDensityWithBonus"
  | "unitsWithBonus"
  | "bindingWithBonus"
  | "unitsAddedByBonus"
  | "usableBonusPct"
  | "setAsideUnits"
  | "rentWithoutBonus"
  | "rentWithBonus"
  | "bonusWorth"
  | "bonusBreakEvenPct"
  | "bonusNote"
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

  const none = {
    unitsByDensityWithBonus: null,
    unitsWithBonus: null,
    bindingWithBonus: null,
    unitsAddedByBonus: null,
    usableBonusPct: null,
    setAsideUnits: null,
    rentWithoutBonus: null,
    rentWithBonus: null,
    bonusWorth: null,
    bonusBreakEvenPct: breakEven,
    bonusNote: null,
  };
  if (pct === null) return none;
  // A bonus is a share of the density limit. Without one there is nothing
  // for it to lift, and pricing it against another cap is the phantom this
  // function exists to refuse.
  if (unitsByDensity === null) {
    return {
      ...none,
      bonusNote: `A density bonus lifts the density limit, and none is entered — so the ${trimmed(pct)}% bonus is not priced.`,
    };
  }

  const unitsByDensityWithBonus = Math.floor(unitsByDensity * (1 + pct / 100));
  const held = smallestOf([{ name: "density", units: unitsByDensityWithBonus }, ...others]);
  const unitsWithBonus = Math.max(0, held.units);
  const bindingWithBonus = held.name;
  const unitsAddedByBonus = unitsWithBonus - baseUnits;
  const usableBonusPct = baseUnits > 0 ? round1((unitsAddedByBonus / baseUnits) * 100) : null;
  const setAsideUnits = setAside === null ? 0 : Math.ceil(unitsWithBonus * (setAside / 100));

  const priced =
    market === null || restricted === null
      ? null
      : (() => {
          const rentWithoutBonus = round(baseUnits * market);
          const rentWithBonus = round(
            (unitsWithBonus - setAsideUnits) * market + setAsideUnits * restricted,
          );
          return { rentWithoutBonus, rentWithBonus, bonusWorth: round(rentWithBonus - rentWithoutBonus) };
        })();

  // Where a cap other than density holds the bonused count, the bonus is
  // held below the limit it lifted: say which cap, what it would take, and
  // — where it adds nothing — what taking it would cost anyway.
  let bonusNote: string | null = null;
  if (unitsByDensityWithBonus <= unitsByDensity) {
    bonusNote = `${withArticle(`${trimmed(pct)}%`, true)} bonus on a density limit of ${unitsByDensity} units rounds to no whole unit.`;
  } else if (bindingWithBonus !== "density") {
    const relief = reliefFor(bindingWithBonus, unitsByDensityWithBonus);
    const next = others
      .filter((c) => c.name !== bindingWithBonus && c.units < unitsByDensityWithBonus)
      .sort((a, b) => a.units - b.units)[0];
    const reliefWords =
      relief === null
        ? null
        : `${relief} would fit all ${unitsByDensityWithBonus}${next ? `, and ${next.name} would hold it to ${next.units} after that` : ""}`;
    if (unitsAddedByBonus <= 0) {
      const cost =
        priced !== null && setAsideUnits > 0 && priced.bonusWorth < 0
          ? ` Taken as it stands it restricts ${setAsideUnits} of the ${unitsWithBonus} units for nothing: ${usd(Math.abs(priced.bonusWorth))} a year off the rent roll.`
          : "";
      bonusNote = `The ${trimmed(pct)}% bonus lifts the density limit to ${unitsByDensityWithBonus} units, but ${bindingWithBonus} still holds the site to ${unitsWithBonus}, so it adds none of them without relief${reliefWords === null ? "" : `: ${reliefWords}`}.${cost}`;
    } else {
      bonusNote = `The ${trimmed(pct)}% bonus lifts the density limit to ${unitsByDensityWithBonus} units, but ${bindingWithBonus} holds the site to ${unitsWithBonus}, so it adds ${unitsAddedByBonus} ${unitsAddedByBonus === 1 ? "unit" : "units"}, ${usableBonusPct}% rather than ${trimmed(pct)}%${reliefWords === null ? "" : `; ${reliefWords}`}.`;
    }
  }

  return {
    unitsByDensityWithBonus,
    unitsWithBonus,
    bindingWithBonus,
    unitsAddedByBonus,
    usableBonusPct,
    setAsideUnits,
    rentWithoutBonus: priced?.rentWithoutBonus ?? null,
    rentWithBonus: priced?.rentWithBonus ?? null,
    bonusWorth: priced?.bonusWorth ?? null,
    bonusBreakEvenPct: breakEven,
    bonusNote,
  };
}

/**
 * The one sentence, leading with rule 4 where a bonus adds units and has
 * been priced — a trade that loses money is the finding, and it is the one
 * that reads as free. A bonus that adds NO units is not that finding: no
 * size of bonus pays while another cap holds the site, so the site's own
 * finding leads and `bonusNote` says what the bonus does.
 */
function noteFor(x: EnvelopeRead, t: EnvelopeInput): string {
  const adds = x.unitsAddedByBonus !== null && x.unitsAddedByBonus > 0;
  // A trade that loses money while reading as free density leads.
  if (adds && x.bonusWorth !== null && x.bonusWorth < 0 && x.bonusBreakEvenPct !== null) {
    // Where another cap holds the bonus short, the bonus that counts is the
    // one the site can use, not the one offered.
    const held =
      x.usableBonusPct !== null && x.bindingWithBonus !== "density" && positive(t.bonusDensityPct)
        ? `${x.bindingWithBonus} holds the site to ${withArticle(`${x.usableBonusPct}%`)} bonus, not the ${trimmed(t.bonusDensityPct)}% offered, and `
        : "";
    return `The density bonus takes ${usd(Math.abs(x.bonusWorth))} a year off the rent roll: ${held}this set-aside needs a bonus above ${x.bonusBreakEvenPct}% before it pays, because the discount is struck against the bonused count and reaches units the bonus never created.`;
  }
  // Then the site's own finding — parking binding is the one nobody expects.
  if (x.binding === "parking" && t.parkingType === "surface") {
    return `Parking binds: the spaces and the footprint are competing for the same ${Math.round(t.siteSf ?? 0).toLocaleString("en-US")} square feet, so a deck buys units rather than convenience.`;
  }
  if (adds && x.bonusWorth !== null && x.bonusWorth > 0 && x.bonusBreakEvenPct !== null) {
    return `The density bonus adds ${x.unitsAddedByBonus} units and ${usd(x.bonusWorth)} a year — it clears the ${x.bonusBreakEvenPct}% this set-aside needs to break even.`;
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

/** A percent as typed, without a trailing ".0". */
function trimmed(n: number): string {
  return String(round(n, 2));
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

const round1 = (n: number) => round(n, 1);
const round2 = (n: number) => round(n, 2);
