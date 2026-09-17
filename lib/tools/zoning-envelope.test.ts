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

describe("rule 4 — a density bonus is a trade with a computable break-even", () => {
  it("strikes the set-aside against the BONUSED count, not the base one", () => {
    const r = readEnvelope(SEED);
    expect(r.units).toBe(140);
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
    const thin = readEnvelope({ ...SEED, bonusDensityPct: 5, setAsidePct: 20 });
    expect(thin.bonusWorth).toBe(-150_000);
    expect(thin.note).toContain("takes $150,000 a year off the rent roll");
  });

  it("pays above it", () => {
    const fat = readEnvelope({ ...SEED, bonusDensityPct: 35, setAsidePct: 20 });
    expect(fat.bonusWorth).toBe(1_014_000);
  });

  /**
   * The crossing is continuous; apartments are whole. The bonused count
   * floors and the set-aside ceilings, so the realised sign flips a little
   * ABOVE the solved figure — documented rather than smoothed away.
   */
  it("flips sign just above the solved crossing, because units are integers", () => {
    const at = readEnvelope({ ...SEED, bonusDensityPct: 9, setAsidePct: 20 });
    const over = readEnvelope({ ...SEED, bonusDensityPct: 10, setAsidePct: 20 });
    expect(at.bonusBreakEvenPct).toBe(8.7);
    expect(at.bonusWorth!).toBeLessThan(0);
    expect(over.bonusWorth!).toBeGreaterThan(0);
  });

  it("is pure gain with no set-aside attached", () => {
    const r = readEnvelope({ ...SEED, setAsidePct: null });
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
    const r = readEnvelope({ ...SEED, restrictedRentAnnual: 30_000 });
    expect(r.bonusBreakEvenPct).toBeNull();
    expect(r.bonusWorth).toBe((r.unitsWithBonus! - r.units!) * 30_000);
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
