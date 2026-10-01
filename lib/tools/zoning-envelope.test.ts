import { describe, expect, it } from "vitest";
import {
  SF_PER_ACRE,
  SF_PER_SURFACE_SPACE,
  readEnvelope,
  type EnvelopeInput,
} from "@/lib/tools/zoning-envelope";

/**
 * A two-acre infill site: 80 units per acre, 2.5 floor area ratio, 75 feet
 * at 11-foot floors, 50% coverage, 900 square foot units at 82% efficiency,
 * 1.25 surface spaces.
 *
 * Seeded on SURFACE parking deliberately. Four caps land at 160 / 198 / 238
 * / 140, so the site is held by the one nobody writes at the top of a pro
 * forma — which is the card's whole argument.
 */
const SEED: EnvelopeInput = {
  siteSf: 87_120,
  unitsPerAcre: 80,
  far: 2.5,
  maxHeightFt: 75,
  floorToFloorFt: 11,
  lotCoveragePct: 50,
  avgUnitSf: 900,
  efficiencyPct: 82,
  parkingRatio: 1.25,
  parkingType: "surface",
  parkingCountsAgainstFar: false,
  bonusDensityPct: 20,
  setAsidePct: 15,
  marketRentAnnual: 30_000,
  restrictedRentAnnual: 18_000,
};

describe("rule 1 — the answer is the minimum, and the binding cap is named", () => {
  it("computes every cap independently before taking the smallest", () => {
    const r = readEnvelope(SEED);
    expect(r.unitsByDensity).toBe(160); // 2 acres × 80
    expect(r.unitsByFar).toBe(198);
    expect(r.unitsByHeight).toBe(238);
    expect(r.unitsByParking).toBe(140);
  });

  it("takes the smallest and names it", () => {
    const r = readEnvelope(SEED);
    expect(r.units).toBe(140);
    expect(r.binding).toBe("parking");
    const every = [r.unitsByDensity!, r.unitsByFar!, r.unitsByHeight!, r.unitsByParking!];
    expect(r.units).toBe(Math.min(...every));
  });

  it("answers from whichever caps were given, and refuses when none were", () => {
    const densityOnly = readEnvelope({
      ...SEED,
      far: null,
      maxHeightFt: null,
      lotCoveragePct: null,
      parkingRatio: null,
    });
    expect(densityOnly.units).toBe(160);
    expect(densityOnly.binding).toBe("density");

    const none = readEnvelope({
      ...SEED,
      unitsPerAcre: null,
      far: null,
      maxHeightFt: null,
      lotCoveragePct: null,
    });
    expect(none.units).toBeNull();
    expect(none.note).toContain("at least one limit");
  });

  it("says the site both ways", () => {
    expect(readEnvelope(SEED).siteAcres).toBe(2);
    expect(SEED.siteSf).toBe(2 * SF_PER_ACRE);
  });
});

describe("rule 2 — floor area is gross, a unit is net", () => {
  it("charges a unit its gross area, not its net", () => {
    const r = readEnvelope(SEED);
    expect(r.grossSfPerUnit).toBe(1098); // 900 / 0.82
    expect(r.grossSfPerUnit!).toBeGreaterThan(SEED.avgUnitSf!);
  });

  it("prices forgetting it — 44 units the floor area ratio does not allow", () => {
    const r = readEnvelope(SEED);
    expect(r.naiveUnitsByFar).toBe(242);
    expect(r.unitsByFar).toBe(198);
    expect(r.unitsOverstatedByEfficiency).toBe(44);
  });

  it("closes the gap entirely at 100% efficiency, which is the check", () => {
    const r = readEnvelope({ ...SEED, efficiencyPct: 100 });
    expect(r.grossSfPerUnit).toBe(SEED.avgUnitSf);
    expect(r.unitsOverstatedByEfficiency).toBe(0);
  });

  it("wants the efficiency before it answers anything measured in floor area", () => {
    const r = readEnvelope({ ...SEED, efficiencyPct: null });
    expect(r.units).toBeNull();
    expect(r.note).toContain("efficiency");
  });
});

describe("rule 3 — surface parking competes with the building for the site", () => {
  it("solves the spaces and the footprint together, not as two questions", () => {
    const r = readEnvelope(SEED);
    // The joint line, re-derived: units × (ratio × 350 + gross / floors) ≤ site.
    const perUnit = 1.25 * SF_PER_SURFACE_SPACE + 1098 / 6;
    expect(r.unitsByParking).toBe(Math.floor(87_120 / perUnit));
    expect(r.parkingLandSf).toBe(61_250); // 175 spaces × 350
  });

  it("a deck buys twenty units, and moves which line binds", () => {
    const surface = readEnvelope(SEED);
    const deck = readEnvelope({ ...SEED, parkingType: "structured" });
    expect(surface.units).toBe(140);
    expect(deck.units).toBe(160);
    expect(surface.binding).toBe("parking");
    expect(deck.binding).toBe("density");
    // Structured spaces take no site area at all — they are building.
    expect(deck.parkingLandSf).toBeNull();
  });

  it("charges structured parking against floor area only where the code does", () => {
    const exempt = readEnvelope({ ...SEED, parkingType: "structured" });
    const counted = readEnvelope({
      ...SEED,
      parkingType: "structured",
      parkingCountsAgainstFar: true,
    });
    expect(counted.unitsByFar!).toBeLessThan(exempt.unitsByFar!);
  });

  it("has no parking cap without a storey count to trade the footprint against", () => {
    // Answering here would be assuming a single-storey building.
    const r = readEnvelope({ ...SEED, maxHeightFt: null });
    expect(r.unitsByParking).toBeNull();
    expect(r.binding).toBe("density");
  });

  it("has no parking cap when no spaces are required", () => {
    const r = readEnvelope({ ...SEED, parkingRatio: 0 });
    expect(r.unitsByParking).toBeNull();
    expect(r.spacesRequired).toBeNull();
  });
});

/**
 * A site the density limit holds: 70 units an acre on the same two acres,
 * no other cap given — 140 units, every one of them liftable by a bonus.
 * Rule 4's arithmetic is drawn here, where a bonus has room to add units.
 */
const DENSITY_BOUND: EnvelopeInput = {
  ...SEED,
  unitsPerAcre: 70,
  far: null,
  maxHeightFt: null,
  lotCoveragePct: null,
  parkingRatio: null,
};

describe("rule 4 — a density bonus is a trade with a computable break-even", () => {
  it("strikes the set-aside against the BONUSED count, not the base one", () => {
    const r = readEnvelope(DENSITY_BOUND);
    expect(r.units).toBe(140);
    expect(r.binding).toBe("density");
    expect(r.unitsWithBonus).toBe(168); // +20%
    expect(r.setAsideUnits).toBe(26); // 15% of 168, not of 140
    expect(r.setAsideUnits!).toBeGreaterThan(Math.ceil(140 * 0.15));
  });

  it("solves the bonus this set-aside needs before the trade pays", () => {
    // s·(M − R) / (M − s·(M − R)) at 20% on $30,000 against $18,000.
    expect(readEnvelope({ ...SEED, setAsidePct: 20 }).bonusBreakEvenPct).toBe(8.7);
    expect(readEnvelope({ ...SEED, setAsidePct: 15 }).bonusBreakEvenPct).toBe(6.4);
    expect(readEnvelope({ ...SEED, setAsidePct: 25 }).bonusBreakEvenPct).toBe(11.1);
  });

  it("loses money below that bonus while reading as free density", () => {
    const thin = readEnvelope({ ...DENSITY_BOUND, bonusDensityPct: 5, setAsidePct: 20 });
    expect(thin.bonusWorth).toBe(-150_000);
    expect(thin.note).toContain("takes $150,000 a year off the rent roll");
  });

  it("pays above it", () => {
    const fat = readEnvelope({ ...DENSITY_BOUND, bonusDensityPct: 35, setAsidePct: 20 });
    expect(fat.bonusWorth).toBe(1_014_000);
  });

  /**
   * The crossing is continuous; apartments are whole. The bonused count
   * floors and the set-aside ceilings, so the realised sign flips a little
   * ABOVE the solved figure — documented rather than smoothed away.
   */
  it("flips sign just above the solved crossing, because units are integers", () => {
    const at = readEnvelope({ ...DENSITY_BOUND, bonusDensityPct: 9, setAsidePct: 20 });
    const over = readEnvelope({ ...DENSITY_BOUND, bonusDensityPct: 10, setAsidePct: 20 });
    expect(at.bonusBreakEvenPct).toBe(8.7);
    expect(at.bonusWorth).toBe(-12_000);
    expect(over.bonusWorth!).toBeGreaterThan(0);
  });

  it("is pure gain with no set-aside attached", () => {
    const r = readEnvelope({ ...DENSITY_BOUND, setAsidePct: null });
    expect(r.setAsideUnits).toBe(0);
    expect(r.bonusWorth).toBe((r.unitsWithBonus! - r.units!) * SEED.marketRentAnnual!);
    expect(r.bonusBreakEvenPct).toBeNull();
  });

  it("still solves the crossing when no bonus is on offer, which is the point of it", () => {
    const r = readEnvelope({ ...SEED, bonusDensityPct: null, setAsidePct: 20 });
    expect(r.unitsWithBonus).toBeNull();
    expect(r.bonusBreakEvenPct).toBe(8.7);
  });

  it("has no crossing where the restricted rent is not a discount", () => {
    const r = readEnvelope({ ...DENSITY_BOUND, restrictedRentAnnual: 30_000 });
    expect(r.bonusBreakEvenPct).toBeNull();
    expect(r.bonusWorth).toBe((r.unitsWithBonus! - r.units!) * 30_000);
  });
});

describe("rule 4 — a bonus lifts the density limit, not the site", () => {
  it("adds nothing on the seed, where parking holds the site under the density limit", () => {
    // The first version grossed the parking-bound 140 up by the bonus and
    // printed 168 units and +$528,000 a year — a phantom: the bonus lifts the
    // density limit from 160 to 192, and parking still holds the site to 140.
    const r = readEnvelope(SEED);
    expect(r.units).toBe(140);
    expect(r.binding).toBe("parking");
    expect(r.unitsByDensityWithBonus).toBe(192);
    expect(r.unitsWithBonus).toBe(140);
    expect(r.unitsWithBonus).not.toBe(168);
    expect(r.bindingWithBonus).toBe("parking");
    expect(r.unitsAddedByBonus).toBe(0);
    expect(r.usableBonusPct).toBe(0);
  });

  it("prices taking it anyway as what it is: the set-aside, for nothing", () => {
    // 15% of the same 140 units restricted at $12,000 under market.
    const r = readEnvelope(SEED);
    expect(r.setAsideUnits).toBe(21);
    expect(r.bonusWorth).toBe(-252_000);
    expect(r.bonusWorth).toBe(-21 * (30_000 - 18_000));
    expect(r.bonusNote).toContain("adds none of them without relief");
    expect(r.bonusNote).toContain("$252,000 a year off the rent roll");
    // Not the break-even finding — no bonus pays while parking holds the
    // site — so the site's own finding leads the note.
    expect(r.note).toContain("Parking binds");
    expect(r.note).not.toContain("needs a bonus above");
  });

  it("names the relief the lifted limit would need: the ratio the joint line solves to", () => {
    const r = readEnvelope(SEED);
    // (site / 192 − gross / floors) / 350 = 0.7738, floored to 0.77.
    expect(r.bonusNote).toContain("0.77 spaces a unit or fewer would fit all 192");
    // And it is the right ratio: at 0.77 the parking cap reaches 192, at 0.78
    // it does not.
    expect(readEnvelope({ ...SEED, parkingRatio: 0.77 }).unitsByParking).toBe(192);
    expect(readEnvelope({ ...SEED, parkingRatio: 0.78 }).unitsByParking).toBe(191);
  });

  it("is held part of the way where a cap sits between the two density limits", () => {
    // A deck: density binds at 160, the envelope at 170 — so the 20% bonus
    // adds 10 units, 6.3%, under the 6.4% a 15% set-aside needs.
    const r = readEnvelope({ ...SEED, parkingType: "structured" });
    expect(r.units).toBe(160);
    expect(r.unitsByDensityWithBonus).toBe(192);
    expect(r.unitsWithBonus).toBe(170);
    expect(r.bindingWithBonus).toBe("height");
    expect(r.unitsAddedByBonus).toBe(10);
    expect(r.usableBonusPct).toBe(6.3);
    expect(r.setAsideUnits).toBe(26);
    expect(r.bonusWorth).toBe(-12_000);
    expect(r.note).toContain("height holds the site to a 6.3% bonus, not the 20% offered");
    // Seven storeys, 77 feet at 11-foot floors, fit all 192.
    expect(r.bonusNote).toContain("adds 10 units, 6.3% rather than 20%");
    expect(r.bonusNote).toContain("7 storeys (77 feet) would fit all 192");
    expect(
      readEnvelope({ ...SEED, parkingType: "structured", maxHeightFt: 77 }).unitsByHeight!,
    ).toBeGreaterThanOrEqual(192);
  });

  it("names the next cap where relieving the first is not enough", () => {
    const r = readEnvelope({ ...SEED, far: 1.6, parkingType: "structured" });
    expect(r.binding).toBe("floor area");
    expect(r.unitsWithBonus).toBe(127);
    expect(r.bonusNote).toContain(
      "a floor area ratio of 2.42 would fit all 192, and height would hold it to 170 after that",
    );
  });

  it("has nothing to lift without a density limit, and prices nothing", () => {
    const r = readEnvelope({ ...SEED, unitsPerAcre: null });
    expect(r.units).toBe(140);
    expect(r.unitsWithBonus).toBeNull();
    expect(r.bonusWorth).toBeNull();
    expect(r.bonusNote).toContain("none is entered");
  });

  it("says when the bonus rounds to no whole unit", () => {
    const r = readEnvelope({ ...DENSITY_BOUND, unitsPerAcre: 5, bonusDensityPct: 5 });
    expect(r.units).toBe(10);
    expect(r.unitsWithBonus).toBe(10);
    expect(r.bonusNote).toBe("A 5% bonus on a density limit of 10 units rounds to no whole unit.");
  });
});

describe("readEnvelope — the building the answer implies", () => {
  it("reports the gross area, the storeys and the footprint it needs", () => {
    const r = readEnvelope(SEED);
    expect(r.floors).toBe(6); // 75 / 11
    expect(r.buildableGrossSf).toBe(153_659);
    expect(r.footprintSf).toBe(25_610);
    expect(r.coverageUsedPct).toBe(29.4);
    // Parking binds, so the envelope is not the constraint — the footprint
    // lands well under the 50% the code allows.
    expect(r.coverageUsedPct!).toBeLessThan(SEED.lotCoveragePct!);
  });

  it("counts the spaces the answer owes", () => {
    expect(readEnvelope(SEED).spacesRequired).toBe(175); // 140 × 1.25
  });

  it("wants a site and a unit size before anything", () => {
    expect(readEnvelope({ ...SEED, siteSf: null }).note).toContain("site area");
    expect(readEnvelope({ ...SEED, avgUnitSf: null }).note).toContain("average unit size");
  });
});
