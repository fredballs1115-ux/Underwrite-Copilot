import { describe, expect, it } from "vitest";
import { readBuyout, type BuyoutTerms } from "./lease-buyout";

/**
 * The seeded lease, which is also what `/tools` renders: 40,000 feet at
 * $28 against a $42 market, six years left, nine months of downtime and
 * $60 a foot of allowance to replace the tenant. Chosen because the
 * headline spread is large, the honest answer is half of it, and the
 * deal still does not happen.
 */
const SEED: BuyoutTerms = {
  sf: 40_000,
  inPlaceRentPsf: 28,
  marketRentPsf: 42,
  yearsRemaining: 6,
  inPlaceEscalationPct: 2.5,
  marketGrowthPct: 3,
  landlordRatePct: 8,
  tenantRatePct: 15,
  downtimeMonths: 9,
  tiPsf: 60,
  commissionPct: 4,
  newTermYears: 10,
  outsideValue: 0,
  tenantMovingCost: 750_000,
};

/** The seed with every friction taken out — no turnover at all. */
const FRICTIONLESS: BuyoutTerms = {
  ...SEED,
  downtimeMonths: 0,
  tiPsf: 0,
  commissionPct: 0,
};

describe("the spread, which is where everyone starts", () => {
  it("says it per foot and per year", () => {
    const r = readBuyout(SEED);
    expect(r.spreadPsf).toBe(14);
    expect(r.spreadAnnual).toBe(560_000);
  });

  it("prices the spread over the term the way the naive calculation does", () => {
    expect(readBuyout(SEED).naiveSpreadPv).toBe(2_933_935);
  });
});

describe("rule 1 — the turnover is deferred, not avoided", () => {
  it("answers well under the spread, and says by how much", () => {
    const r = readBuyout(SEED);
    expect(r.buyoutValue).toBe(1_498_772);
    expect(r.buyoutValue!).toBeLessThan(r.naiveSpreadPv!);
    expect(r.naiveSpreadPv! - r.buyoutValue!).toBe(1_435_163);
    expect(r.note).toContain("too much");
  });

  it("does not charge the whole turnover bill against the buyout", () => {
    // The bill is $3.19M and the gap between the two answers is $1.44M.
    // Subtracting the bill outright — the common version — would have
    // made the buyout look worth less than nothing.
    const r = readBuyout(SEED);
    expect(r.reTenantingCost).toBe(3_187_642);
    expect(r.naiveSpreadPv! - r.buyoutValue!).toBeLessThan(r.reTenantingCost!);
    expect(r.naiveSpreadPv! - r.reTenantingCost!).toBeLessThan(0);
    expect(r.buyoutValue!).toBeGreaterThan(0);
  });

  it("splits the bill into the pieces a landlord negotiates separately", () => {
    const r = readBuyout(SEED);
    expect(r.tiCost).toBe(2_400_000); // $60 x 40,000
    expect(r.commissionCost).toBe(787_642);
    expect(r.tiCost! + r.commissionCost!).toBe(r.reTenantingCost);
    expect(r.downtimeCost).toBe(1_288_245); // nine months at the market rent
  });
});

describe("rule 2 — it is two streams, not a spread", () => {
  it("is worth exactly nothing on a lease with nothing left to run", () => {
    // The claim the whole model turns on: the spread is still $14 a foot
    // on the last day, and ending the lease that day changes nothing.
    const r = readBuyout({ ...SEED, yearsRemaining: 0 });
    expect(r.spreadPsf).toBe(14);
    expect(r.buyoutValue).toBe(0);
    expect(r.note).toContain("nothing left to run");
  });

  it("reduces to the naive answer exactly when there is no turnover", () => {
    // Not a tautology: the two are computed by different code paths. The
    // naive figure prices a spread; this prices two whole streams. They
    // agree to the dollar precisely when the naive figure's hidden
    // assumption — that the space re-lets instantly and for nothing —
    // is made true.
    const r = readBuyout(FRICTIONLESS);
    expect(r.buyoutValue).toBe(r.naiveSpreadPv);
    expect(r.buyoutValue).toBe(2_933_935);
  });

  it("grows with the years left", () => {
    const three = readBuyout({ ...SEED, yearsRemaining: 3 }).buyoutValue!;
    const six = readBuyout(SEED).buyoutValue!;
    const ten = readBuyout({ ...SEED, yearsRemaining: 10 }).buyoutValue!;
    expect(three).toBeLessThan(six);
    expect(six).toBeLessThan(ten);
  });

  it("flips SIGN against the naive answer on a modest spread", () => {
    // The strongest form of rule 1, and not a shading of the number: at
    // $38 against a $42 market the spread calculation says the landlord
    // should pay $908,072 to end the lease, and the honest answer is
    // that they should pay the tenant to STAY. A $4 spread is $160,000 a
    // year and the turnover it brings forward carries at more than that.
    const r = readBuyout({ ...SEED, inPlaceRentPsf: 38 });
    expect(r.spreadPsf).toBe(4);
    expect(r.naiveSpreadPv).toBe(908_072);
    expect(r.buyoutValue).toBe(-527_092);
    expect(r.naiveSpreadPv!).toBeGreaterThan(0);
    expect(r.buyoutValue!).toBeLessThan(0);
  });

  it("is still positive on a short lease with a large spread", () => {
    // The mirror of the case above, and the reason the test for a
    // negative value is not simply "a short term": six months of a $14
    // spread more than covers bringing the turnover forward six months.
    expect(readBuyout({ ...SEED, yearsRemaining: 0.5 }).buyoutValue).toBe(129_303);
  });
});

describe("rule 3 — the spread cancels between the two sides", () => {
  it("leaves exactly nothing on the table with no friction and one rate", () => {
    // The cleanest statement of why a buyout creates no value of itself:
    // what the landlord gains the tenant loses, to the dollar.
    const r = readBuyout({
      ...FRICTIONLESS,
      tenantRatePct: SEED.landlordRatePct,
      tenantMovingCost: 0,
    });
    expect(r.zopa).toBe(0);
  });

  it("goes negative once the frictions are put back", () => {
    const r = readBuyout({ ...SEED, tenantRatePct: 8, tenantMovingCost: 0 });
    expect(r.zopa!).toBeLessThan(0);
    expect(r.zopa).toBe(r.buyoutValue! - r.naiveSpreadPv!);
  });

  it("has no deal in it on the seeded terms, and says why", () => {
    const r = readBuyout(SEED);
    expect(r.landlordCeiling).toBe(1_498_772);
    expect(r.tenantFloor).toBe(3_178_017);
    expect(r.zopa).toBe(-1_679_245);
    expect(r.note).toContain("no deal on these terms");
    expect(r.note).toContain("vacant possession");
  });

  it("opens when vacant possession is worth more than the frictions", () => {
    const r = readBuyout({ ...SEED, outsideValue: 2_000_000 });
    // One for one on the ceiling, which is the whole point of the input.
    expect(r.landlordCeiling).toBe(1_498_772 + 2_000_000);
    expect(r.zopa).toBe(320_755);
    expect(r.note).toContain("There is a deal in it");
  });

  it("opens when the tenant discounts the future harder", () => {
    // The other real driver, and the reason a tenant short of cash is
    // the one who sells. Monotone, and it crosses zero.
    const floors = [8, 12, 15, 25, 40].map(
      (t) => readBuyout({ ...SEED, tenantRatePct: t, tenantMovingCost: 0 }).tenantFloor!,
    );
    for (let i = 1; i < floors.length; i += 1) {
      expect(floors[i]).toBeLessThan(floors[i - 1]);
    }
    expect(readBuyout({ ...SEED, tenantRatePct: 25, tenantMovingCost: 0 }).zopa!).toBeLessThan(0);
    expect(readBuyout({ ...SEED, tenantRatePct: 40, tenantMovingCost: 0 }).zopa!).toBeGreaterThan(0);
  });

  it("adds the tenant's move to the tenant's floor, never to the landlord's", () => {
    const withMove = readBuyout(SEED);
    const without = readBuyout({ ...SEED, tenantMovingCost: 0 });
    expect(withMove.tenantFloor! - without.tenantFloor!).toBe(750_000);
    expect(withMove.landlordCeiling).toBe(without.landlordCeiling);
  });

  it("says nothing about a zone without the tenant's own rate", () => {
    const r = readBuyout({ ...SEED, tenantRatePct: null });
    expect(r.tenantFloor).toBeNull();
    expect(r.zopa).toBeNull();
    expect(r.buyoutValue).toBe(1_498_772);
  });
});

describe("the conventions it shares with the rest of /tools", () => {
  it("steps the in-place rent on the lease's own anniversary", () => {
    // A 2.5% step matters: turning it off leaves the tenant cheaper for
    // longer, so the spread — and the buyout — is worth more.
    const stepping = readBuyout(SEED).buyoutValue!;
    const flat = readBuyout({ ...SEED, inPlaceEscalationPct: 0 }).buyoutValue!;
    expect(flat).toBeGreaterThan(stepping);
  });

  it("writes the commission against the new lease's gross rent", () => {
    const r = readBuyout(SEED);
    const half = readBuyout({ ...SEED, commissionPct: 2 });
    expect(half.commissionCost).toBe(round(r.commissionCost! / 2));
    // And it scales with the term, because the fee is on the whole term.
    const five = readBuyout({ ...SEED, newTermYears: 5 });
    expect(five.commissionCost!).toBeLessThan(r.commissionCost!);
  });

  it("treats a blank as absent rather than as zero", () => {
    const r = readBuyout({
      ...SEED,
      inPlaceEscalationPct: null,
      marketGrowthPct: null,
      tiPsf: null,
      commissionPct: null,
      downtimeMonths: null,
    });
    expect(r.tiCost).toBe(0);
    expect(r.commissionCost).toBe(0);
    expect(r.downtimeCost).toBe(0);
    // With nothing to pay and no gap to close, it is the naive answer.
    expect(r.buyoutValue).toBe(r.naiveSpreadPv);
  });
});

describe("what it says with nothing to go on", () => {
  it("asks for the space first", () => {
    const r = readBuyout({ ...SEED, sf: null });
    expect(r.spreadPsf).toBeNull();
    expect(r.note).toBe("Enter the size of the space.");
  });

  it("asks for both rents before anything else", () => {
    expect(readBuyout({ ...SEED, marketRentPsf: null }).note).toContain(
      "the rent the space would let for",
    );
  });

  it("draws the spread and asks for the term", () => {
    const r = readBuyout({ ...SEED, yearsRemaining: null });
    expect(r.spreadPsf).toBe(14);
    expect(r.spreadAnnual).toBe(560_000);
    expect(r.buyoutValue).toBeNull();
    expect(r.note).toContain("Enter the years left");
  });

  it("reports an over-market lease as a negative spread rather than refusing", () => {
    // A tenant paying above market is a reason NOT to buy them out, and
    // the figure says so on its own.
    const r = readBuyout({ ...SEED, inPlaceRentPsf: 50 });
    expect(r.spreadPsf).toBe(-8);
    expect(r.buyoutValue!).toBeLessThan(0);
  });
});

function round(n: number): number {
  return Math.round(n);
}
