/**
 * The measures printed on one page of an offering memorandum.
 *
 * These are the smallest calculations on this site and the ones an analyst
 * most often leaves it for — not because they are hard, but because nobody
 * keeps 43,560 in their head and the load factor is quoted two different
 * ways by people who both think theirs is the obvious one.
 *
 * Two questions, two functions.
 *
 * `readLand` answers what the dirt is and what it carries: acres against
 * square feet, the floor area ratio against whatever the zoning allows,
 * units per acre, land per unit, the average unit, and the parking said both
 * ways. `readSpace` answers what a foot of the building actually is:
 * rentable against gross, the load factor, and — the figure the whole thing
 * exists for — what the quoted rent works out to per foot you can put a desk
 * on.
 *
 * Pure, no I/O.
 */

/** One acre, exactly. Nobody keeps this in their head, which is the point. */
export const SF_PER_ACRE = 43_560;

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

// ── the land ───────────────────────────────────────────────────────────────

export interface LandTerms {
  /** the site in acres, as a survey or a deed states it */
  acres: number | null;
  /** the site in square feet, as a site plan states it */
  landSf: number | null;
  /** the building's GROSS floor area — what a zoning code measures FAR on */
  buildingSf: number | null;
  /** apartments, keys, or whatever the building is counted in */
  units: number | null;
  /** parking spaces */
  spaces: number | null;
  /** the floor area ratio the zoning allows, e.g. 2.5 */
  farLimit: number | null;
}

export interface LandRead {
  acres: number | null;
  landSf: number | null;
  /** gross building area over land area — dimensionless */
  far: number | null;
  /** the gross floor area the FAR limit permits on this site */
  allowedSf: number | null;
  /** allowed less built — NEGATIVE where the building exceeds the limit */
  headroomSf: number | null;
  unitsPerAcre: number | null;
  landSfPerUnit: number | null;
  /** gross building area per unit — the average unit, loaded */
  avgUnitSf: number | null;
  spacesPerUnit: number | null;
  /** the commercial convention: spaces per 1,000 SF of building */
  spacesPer1000Sf: number | null;
  note: string | null;
}

// There is no empty-read constant here, unlike `readSpace` below: `readLand`
// never refuses. Every figure it reports is independent of the others, so a
// site with only an acreage answers with the acreage and nulls the rest,
// which is exactly the "a blank is null" rule applied a field at a time.
export function readLand(t: LandTerms): LandRead {
  // Acres and square feet are one measurement, entered from whichever side
  // the document happened to state. An OM that states both has usually
  // rounded one of them, so a small gap is normal and a large one means the
  // two lines describe different parcels — a site plan's "land area" that
  // quietly excludes an out-parcel is the usual culprit. Say so rather than
  // silently picking a side; but still ANSWER, from the acreage, because
  // that is the figure a deed carries and a zoning code is written against.
  let acres: number | null = null;
  let landSf: number | null = null;
  let note: string | null = null;

  if (positive(t.acres) && positive(t.landSf)) {
    const fromAcres = t.acres * SF_PER_ACRE;
    const gap = Math.abs(fromAcres - t.landSf) / Math.max(fromAcres, t.landSf);
    if (gap > 0.01) {
      note = `${trim(t.acres)} acres is ${fmt(fromAcres)} SF, not ${fmt(
        t.landSf,
      )} — the acreage is used below.`;
    }
    acres = t.acres;
    landSf = fromAcres;
  } else if (positive(t.acres)) {
    acres = t.acres;
    landSf = t.acres * SF_PER_ACRE;
  } else if (positive(t.landSf)) {
    landSf = t.landSf;
    acres = t.landSf / SF_PER_ACRE;
  }

  const far = positive(landSf) && positive(t.buildingSf) ? t.buildingSf / landSf : null;
  const allowedSf = positive(landSf) && positive(t.farLimit) ? t.farLimit * landSf : null;
  // Signed, and never clamped. A negative headroom is a real condition — a
  // legal non-conforming building, or a site whose zoning changed under it —
  // and it is exactly what someone checking a FAR limit needs to see.
  const headroomSf =
    allowedSf !== null && positive(t.buildingSf) ? allowedSf - t.buildingSf : null;

  return {
    acres: acres === null ? null : round(acres, 3),
    landSf: landSf === null ? null : round(landSf),
    far: far === null ? null : round(far, 2),
    allowedSf: allowedSf === null ? null : round(allowedSf),
    headroomSf: headroomSf === null ? null : round(headroomSf),
    unitsPerAcre:
      positive(acres) && positive(t.units) ? round(t.units / acres, 1) : null,
    landSfPerUnit:
      positive(landSf) && positive(t.units) ? round(landSf / t.units) : null,
    avgUnitSf:
      positive(t.buildingSf) && positive(t.units) ? round(t.buildingSf / t.units) : null,
    spacesPerUnit:
      positive(t.spaces) && positive(t.units) ? round(t.spaces / t.units, 2) : null,
    spacesPer1000Sf:
      positive(t.spaces) && positive(t.buildingSf)
        ? round(t.spaces / (t.buildingSf / 1000), 2)
        : null,
    note,
  };
}

// ── the building's own feet ────────────────────────────────────────────────

export interface SpaceTerms {
  /** gross building area, everything inside the walls */
  grossSf: number | null;
  /** rentable area — what the lease is written on, load included */
  rentableSf: number | null;
  /** usable area — the premises themselves, no common area */
  usableSf: number | null;
  /** the quoted rent, annual, per RENTABLE foot */
  rentPerRsf: number | null;
}

export interface SpaceRead {
  /** rentable over gross — the share of the building that can be leased */
  efficiencyPct: number | null;
  /** the market's quote: rentable over usable, less one */
  loadFactorPct: number | null;
  /** the other number people call a load factor: common area over rentable */
  commonAreaSharePct: number | null;
  /** the rent per foot you can actually occupy — always the higher figure */
  rentPerUsf: number | null;
  annualRent: number | null;
  monthlyRent: number | null;
  note: string | null;
}

const EMPTY_SPACE: SpaceRead = {
  efficiencyPct: null,
  loadFactorPct: null,
  commonAreaSharePct: null,
  rentPerUsf: null,
  annualRent: null,
  monthlyRent: null,
  note: null,
};

export function readSpace(t: SpaceTerms): SpaceRead {
  // Usable area is a subset of rentable area by definition — the premises
  // plus a share of the lobby, the corridors and the core IS the rentable
  // figure. Reversed, the load factor comes out negative and the rent per
  // usable foot comes out BELOW the quoted rent, which is the one thing
  // this card exists to say cannot happen. Refuse rather than compute it.
  if (positive(t.rentableSf) && positive(t.usableSf) && t.usableSf > t.rentableSf) {
    return {
      ...EMPTY_SPACE,
      note: "Usable area is part of rentable area, so it cannot be the larger of the two.",
    };
  }

  const efficiencyPct =
    positive(t.grossSf) && positive(t.rentableSf) ? (t.rentableSf / t.grossSf) * 100 : null;

  // The two figures people both call "the load factor", kept apart because
  // they are never the same number and the gap grows with the load. A 15%
  // load factor — rentable is 1.15 times usable, which is how a landlord
  // quotes it — is a 13.0% common-area share. Quoting the smaller one as
  // the load understates the rent per usable foot, every time.
  const loadFactorPct =
    positive(t.rentableSf) && positive(t.usableSf)
      ? (t.rentableSf / t.usableSf - 1) * 100
      : null;
  const commonAreaSharePct =
    positive(t.rentableSf) && positive(t.usableSf)
      ? (1 - t.usableSf / t.rentableSf) * 100
      : null;

  // The point of the whole card. Two buildings quoting the same rent per
  // rentable foot are not the same deal if their loads differ, and the rent
  // per USABLE foot is the only figure that compares them — it is what the
  // tenant pays for the space it can furnish.
  const rentPerUsf =
    positive(t.rentPerRsf) && positive(t.rentableSf) && positive(t.usableSf)
      ? (t.rentPerRsf * t.rentableSf) / t.usableSf
      : null;

  const annualRent =
    positive(t.rentPerRsf) && positive(t.rentableSf) ? t.rentPerRsf * t.rentableSf : null;

  return {
    efficiencyPct: efficiencyPct === null ? null : round(efficiencyPct, 1),
    loadFactorPct: loadFactorPct === null ? null : round(loadFactorPct, 1),
    commonAreaSharePct: commonAreaSharePct === null ? null : round(commonAreaSharePct, 1),
    rentPerUsf: rentPerUsf === null ? null : round(rentPerUsf, 2),
    annualRent: annualRent === null ? null : round(annualRent),
    monthlyRent: annualRent === null ? null : round(annualRent / 12),
    note:
      efficiencyPct !== null && efficiencyPct > 100
        ? "Rentable area is above gross — check which figure is which."
        : null,
  };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function trim(n: number): string {
  const s = n.toFixed(2);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
