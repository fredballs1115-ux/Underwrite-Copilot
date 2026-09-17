import { describe, expect, it } from "vitest";
import { readFeasibility, type FeasibilityInput } from "@/lib/tools/feasibility-rent";

/**
 * 120,000 rentable feet at $310 hard on $9M of land, 28% soft, a 4% fee,
 * against a 6.25% required yield on cost. $9.50 of opex, 5% vacancy.
 * The market signs $38 and grows 3%; the building being held cost $260.
 */
const SEED: FeasibilityInput = {
  buildableSf: 120_000,
  landCost: 9_000_000,
  hardCostPerSf: 310,
  softCostPct: 28,
  developerFeePct: 4,
  requiredYieldOnCostPct: 6.25,
  opexPerSf: 9.5,
  stabilizedVacancyPct: 5,
  marketRentPerSf: 38,
  rentGrowthPct: 3,
  yourBasisPerSf: 260,
};

describe("the budget", () => {
  it("strikes the developer's fee on the construction, never on the land", () => {
    const r = readFeasibility(SEED);
    expect(r.hardCost).toBe(37_200_000);
    expect(r.softCost).toBe(10_416_000); // 28% of hard
    expect(r.developerFee).toBe(1_904_640); // 4% of hard + soft
    expect(r.developerFee).toBe(Math.round((37_200_000 + 10_416_000) * 0.04));
    expect(r.totalCost).toBe(58_520_640);
  });

  it("adds up, and says the cost per foot", () => {
    const r = readFeasibility(SEED);
    expect(r.hardCost! + r.softCost! + r.developerFee! + 9_000_000).toBe(r.totalCost);
    expect(r.costPerSf).toBe(487.67);
  });
});

describe("rule 1 — the feasibility rent falls out of the required return", () => {
  it("solves the rent a new building needs", () => {
    const r = readFeasibility(SEED);
    expect(r.requiredNoi).toBe(3_657_540); // 6.25% of total cost
    expect(r.feasibilityRentPerSf).toBe(42.08);
  });

  it("rebuilds the NOI from the solved rent — the check the rest rests on", () => {
    const r = readFeasibility(SEED);
    const egi = r.feasibilityRentPerSf! * 120_000 * 0.95;
    const noi = egi - 9.5 * 120_000;
    // The rent is reported to the cent, so rebuilding from it can be out
    // by up to half a cent over every leased foot — which is what the
    // tolerance is, said in the unit it comes from rather than guessed.
    const halfACentOfLeasedArea = 0.005 * 120_000 * 0.95;
    expect(Math.abs(noi - r.requiredNoi!)).toBeLessThanOrEqual(halfACentOfLeasedArea);
  });

  it("rises with the required yield, because it is a cost-side number", () => {
    const low = readFeasibility({ ...SEED, requiredYieldOnCostPct: 5.5 });
    const high = readFeasibility({ ...SEED, requiredYieldOnCostPct: 7.5 });
    expect(high.feasibilityRentPerSf!).toBeGreaterThan(low.feasibilityRentPerSf!);
    // …and it moves not at all with what the market currently signs.
    const other = readFeasibility({ ...SEED, marketRentPerSf: 60 });
    expect(other.feasibilityRentPerSf).toBe(readFeasibility(SEED).feasibilityRentPerSf);
  });
});

describe("rule 2 — the discount to replacement cost is not the moat", () => {
  it("can be cheap against replacement AND exposed to new supply at once", () => {
    const r = readFeasibility({ ...SEED, marketRentPerSf: 52, yourBasisPerSf: 260 });
    expect(r.basisVsReplacementPct).toBe(53.3);
    expect(r.supplyProtected).toBe(false);
    expect(r.rentGapPerSf).toBe(-9.92); // the market pays MORE than needed
    expect(r.note).toContain("and still exposed");
  });

  it("…and dear against replacement AND protected, which is the mirror", () => {
    const r = readFeasibility({ ...SEED, marketRentPerSf: 30, yourBasisPerSf: 420 });
    expect(r.basisVsReplacementPct).toBe(86.1);
    expect(r.supplyProtected).toBe(true);
    expect(r.rentGapPct).toBe(40.3);
    expect(r.yearsOfGrowthToFeasibility).toBe(11.5);
  });

  it("reads the rent gap and nothing else — the basis cannot move it", () => {
    const cheap = readFeasibility({ ...SEED, yourBasisPerSf: 100 });
    const dear = readFeasibility({ ...SEED, yourBasisPerSf: 900 });
    const none = readFeasibility({ ...SEED, yourBasisPerSf: null });
    expect(cheap.supplyProtected).toBe(dear.supplyProtected);
    expect(none.supplyProtected).toBe(cheap.supplyProtected);
    expect(none.basisVsReplacementPct).toBeNull();
  });

  it("has no answer without a market rent to compare against", () => {
    const r = readFeasibility({ ...SEED, marketRentPerSf: null });
    expect(r.supplyProtected).toBeNull();
    expect(r.rentGapPerSf).toBeNull();
    expect(r.feasibilityRentPerSf).not.toBeNull();
    expect(r.note).toContain("Enter today's market rent");
  });
});

describe("rule 3 — replacement cost carries today's land price", () => {
  it("moves the same building's percentage of replacement with the land alone", () => {
    const cheap = readFeasibility({ ...SEED, landCost: 3_000_000 });
    const dear = readFeasibility({ ...SEED, landCost: 18_000_000 });
    // Not one brick has moved; the building is a different share of
    // replacement cost in two different land markets.
    expect(cheap.basisVsReplacementPct!).toBeGreaterThan(dear.basisVsReplacementPct!);
    expect(cheap.landShareOfCostPct!).toBeLessThan(dear.landShareOfCostPct!);
  });

  it("says how much of the cost is land, so the claim can be read", () => {
    expect(readFeasibility(SEED).landShareOfCostPct).toBe(15.4);
  });

  it("raises the feasibility rent when the land does, which is the supply link", () => {
    const dear = readFeasibility({ ...SEED, landCost: 18_000_000 });
    expect(dear.feasibilityRentPerSf!).toBeGreaterThan(readFeasibility(SEED).feasibilityRentPerSf!);
  });
});

describe("rule 4 — the gap closes from either side", () => {
  it("prices the rent side at the stated growth", () => {
    expect(readFeasibility(SEED).yearsOfGrowthToFeasibility).toBe(3.5);
    // Faster growth closes it sooner.
    expect(readFeasibility({ ...SEED, rentGrowthPct: 6 }).yearsOfGrowthToFeasibility!).toBeLessThan(3.5);
  });

  it("has no years to report where the gap is already closed, or nothing grows", () => {
    expect(readFeasibility({ ...SEED, marketRentPerSf: 52 }).yearsOfGrowthToFeasibility).toBeNull();
    expect(readFeasibility({ ...SEED, rentGrowthPct: 0 }).yearsOfGrowthToFeasibility).toBeNull();
    expect(readFeasibility({ ...SEED, rentGrowthPct: null }).yearsOfGrowthToFeasibility).toBeNull();
  });

  /**
   * The identity that proves the cost side is the same model run
   * backwards: build at the solved hard cost and the feasibility rent IS
   * today's market rent, to the cent.
   */
  it("solves the cost side, and building at it makes today's rent pencil exactly", () => {
    const r = readFeasibility(SEED);
    expect(r.breakEvenHardCostPerSf).toBe(263.37);
    const at = readFeasibility({ ...SEED, hardCostPerSf: r.breakEvenHardCostPerSf! });
    expect(at.feasibilityRentPerSf).toBe(SEED.marketRentPerSf);
  });

  it("goes negative where the land alone is too dear for free construction", () => {
    // $18 rents against $16M of land: the budget today's rent supports is
    // smaller than the land already cost.
    const r = readFeasibility({ ...SEED, marketRentPerSf: 18, landCost: 16_000_000 });
    expect(r.breakEvenHardCostPerSf!).toBeLessThan(0);
  });

  it("rises with the rent, because a dearer market carries a dearer build", () => {
    const a = readFeasibility({ ...SEED, marketRentPerSf: 38 });
    const b = readFeasibility({ ...SEED, marketRentPerSf: 52 });
    expect(b.breakEvenHardCostPerSf!).toBeGreaterThan(a.breakEvenHardCostPerSf!);
  });
});

describe("readFeasibility — what it refuses", () => {
  it("wants an area, a hard cost and a required yield", () => {
    expect(readFeasibility({ ...SEED, buildableSf: null }).note).toContain("rentable area");
    expect(readFeasibility({ ...SEED, hardCostPerSf: null }).note).toContain("hard construction cost");
    expect(readFeasibility({ ...SEED, requiredYieldOnCostPct: null }).note).toContain("yield on cost");
  });

  it("treats a missing land cost as no land rather than refusing", () => {
    const r = readFeasibility({ ...SEED, landCost: null });
    expect(r.landShareOfCostPct).toBe(0);
    expect(r.totalCost).toBe(37_200_000 + 10_416_000 + 1_904_640);
  });

  it("treats missing soft costs, fee, opex and vacancy as zero, never as absent", () => {
    const bare = readFeasibility({
      ...SEED,
      softCostPct: null,
      developerFeePct: null,
      opexPerSf: null,
      stabilizedVacancyPct: null,
    });
    expect(bare.totalCost).toBe(9_000_000 + 37_200_000);
    // rent = cost × yield / sf, with nothing else in the way
    expect(bare.feasibilityRentPerSf).toBe(round2((46_200_000 * 0.0625) / 120_000));
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
