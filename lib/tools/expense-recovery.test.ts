import { describe, expect, it } from "vitest";
import {
  GROSS_UP_TO,
  grossUp,
  readRecovery,
  type RecoveryTerms,
} from "./expense-recovery";

/**
 * The seeded reconciliation, which is also what `/tools` renders.
 *
 * A 100,000 SF building with a 12,000 SF tenant. The base year was struck
 * while the building was 72% leased — the ordinary case after a soft
 * letting year, and the case gross-up exists for. Everything on the card
 * follows from those two facts.
 */
const SEED: RecoveryTerms = {
  tenantSf: 12_000,
  buildingSf: 100_000,
  basis: "base year",
  base: { fixed: 640_000, variable: 900_000, occupancyPct: 72 },
  stopPerSf: null,
  current: { fixed: 720_000, variable: 1_180_000, occupancyPct: 94 },
  grossUpToPct: 95,
  capPct: 5,
  capType: "cumulative",
  controllablePct: 60,
  yearsSinceBase: 3,
  estimatedPaid: 30_000,
};

describe("gross-up", () => {
  it("scales the variable part only", () => {
    // $1M fixed and $1M variable at 50% full grosses up to $1M + $1.9M,
    // never to $3.8M. Grossing up the TOTAL is the second most common
    // error here and it overstates every year it touches.
    expect(grossUp({ fixed: 1_000_000, variable: 1_000_000, occupancyPct: 50 }, 95)).toBe(
      1_000_000 + 1_900_000,
    );
  });

  it("never scales a building that is already fuller than the target", () => {
    // Scaling DOWN would hand the tenant a discount the lease does not
    // give: a 99% building is already spending what a 95% one spends.
    const full = { fixed: 500_000, variable: 500_000, occupancyPct: 99 };
    expect(grossUp(full, 95)).toBe(1_000_000);
  });

  it("answers nothing when the occupancy is unstated", () => {
    expect(grossUp({ fixed: 1, variable: 1, occupancyPct: null }, 95)).toBeNull();
  });

  it("uses 95% as the convention", () => {
    expect(GROSS_UP_TO).toBe(95);
  });
});

describe("the reconciliation", () => {
  it("grosses BOTH years to the same occupancy", () => {
    const r = readRecovery(SEED);
    // Base: 640,000 + 900,000 × (95/72) = 640,000 + 1,187,500 = 1,827,500
    expect(r.baseGrossedUp).toBe(1_827_500);
    expect(r.baseGrossUpAdj).toBe(287_500);
    // Current: 720,000 + 1,180,000 × (95/94) = 720,000 + 1,192,553.19…
    expect(r.currentGrossedUp).toBe(1_912_553);
    expect(r.currentGrossUpAdj).toBe(12_553);
  });

  it("reads the tenant's share off the two areas", () => {
    const r = readRecovery(SEED);
    expect(r.sharePct).toBe(12);
  });

  it("bills the increase over the grossed-up floor, not over the actual", () => {
    const r = readRecovery(SEED);
    expect(r.increase).toBe(1_912_553 - 1_827_500);
  });

  it("answers in the direction the money moves", () => {
    const r = readRecovery(SEED);
    // The tenant's share of a small increase, against $30,000 already
    // paid in estimates — so this statement is a REFUND, which is the
    // sentence a reader wants and not "your share was $10,206".
    expect(r.tenantShare).toBe(10_206);
    expect(r.dueFromTenant).toBe(10_206 - 30_000);
    expect(r.dueFromTenant).toBeLessThan(0);
  });
});

describe("the one-sided gross-up", () => {
  it("prices the error rather than merely warning about it", () => {
    const r = readRecovery(SEED);
    // Leave the base year at its actual $1,540,000 and the building-wide
    // increase goes from $85,053 to $372,553 — four and a half times.
    expect(r.increase).toBe(85_053);
    expect(r.oneSidedShare).toBe(38_623);
    expect(r.oneSidedCost).toBe(28_417);
    expect(r.oneSidedCost).toBe(r.oneSidedShare! - r.tenantShare!);
  });

  it("lets the cap catch part of an inflated bill, but only part", () => {
    // The tenant's bill does NOT rise by the same multiple as the
    // increase, because the cap's ceiling is unmoved and starts to bind on
    // the inflated figure. Strip the cap out and the whole $372,553 is
    // billed: $44,706 against the honest $10,206. A cap is a backstop
    // against a gross-up error, never a substitute for catching one.
    const r = readRecovery(SEED);
    const uncapped = readRecovery({ ...SEED, capType: "none" });
    expect(uncapped.oneSidedShare).toBe(44_706);
    expect(uncapped.oneSidedCost).toBeGreaterThan(r.oneSidedCost!);
  });

  it("is never cheaper for the tenant than the honest reading", () => {
    // Whatever the occupancies, leaving the base year ungrossed can only
    // widen the increase — the claim that makes this worth checking on
    // every statement rather than only on a suspicious one.
    for (const occ of [40, 55, 72, 88, 94, 99]) {
      const r = readRecovery({
        ...SEED,
        base: { ...SEED.base, occupancyPct: occ },
      });
      expect(r.oneSidedCost, `base at ${occ}%`).toBeGreaterThanOrEqual(0);
    }
  });

  it("costs nothing when the base year was already full", () => {
    const r = readRecovery({
      ...SEED,
      base: { fixed: 640_000, variable: 900_000, occupancyPct: 96 },
    });
    expect(r.baseGrossUpAdj).toBe(0);
    expect(r.oneSidedCost).toBe(0);
  });

  it("names the soft base year in words when there is one", () => {
    expect(readRecovery(SEED).note).toContain("72% occupancy");
    expect(readRecovery(SEED).note).toContain("pays for the building filling up");
    const full = readRecovery({ ...SEED, base: { ...SEED.base, occupancyPct: 92 } });
    expect(full.note).toBeNull();
  });
});

describe("the cap", () => {
  it("reaches the controllable share only, and says what it did not reach", () => {
    // A 5% cap on a building whose insurance doubled is worth much less
    // than it sounds, which is why the carve-out is reported beside it.
    const r = readRecovery({ ...SEED, current: { fixed: 1_400_000, variable: 1_180_000, occupancyPct: 94 } });
    expect(r.carvedOut).toBe(Math.round(r.increase! * 0.4));
    expect(r.carvedOut! + Math.round(r.increase! * 0.6)).toBe(r.increase);
  });

  it("gives a cumulative cap more room than a non-cumulative one", () => {
    // Same 5%, same three years, same words in a term sheet. Cumulative
    // compounds off the base year and banks the unused room; the other
    // allows one year's worth.
    const cum = readRecovery({ ...SEED, current: { fixed: 1_600_000, variable: 1_500_000, occupancyPct: 94 } });
    const non = readRecovery({
      ...SEED,
      capType: "non-cumulative",
      current: { fixed: 1_600_000, variable: 1_500_000, occupancyPct: 94 },
    });
    expect(cum.capCeiling!).toBeGreaterThan(non.capCeiling!);
    expect(non.capSaved!).toBeGreaterThan(cum.capSaved!);
    expect(non.tenantShare!).toBeLessThan(cum.tenantShare!);
  });

  it("compounds the cumulative ceiling off the base year", () => {
    const r = readRecovery({ ...SEED, current: { fixed: 1_600_000, variable: 1_500_000, occupancyPct: 94 } });
    const baseControllable = 1_827_500 * 0.6;
    expect(r.capCeiling).toBe(
      Math.round(baseControllable * Math.pow(1.05, 3) - baseControllable),
    );
  });

  it("takes nothing off a bill that is under the ceiling", () => {
    const r = readRecovery(SEED);
    expect(r.capSaved).toBe(0);
    expect(r.billable).toBe(r.increase);
  });

  it("is absent entirely when the lease has none", () => {
    const r = readRecovery({ ...SEED, capType: "none" });
    expect(r.capCeiling).toBeNull();
    expect(r.capSaved).toBe(0);
  });
});

describe("a stop is not a base year", () => {
  it("takes the stop as a fixed floor over the whole building", () => {
    // $16.00/SF over 100,000 SF is a $1.6M floor — a number, not a year,
    // so nothing about the building's occupancy touches it.
    const r = readRecovery({ ...SEED, basis: "expense stop", stopPerSf: 16 });
    expect(r.baseGrossedUp).toBe(1_600_000);
    expect(r.baseGrossUpAdj).toBe(0);
    expect(r.increase).toBe(1_912_553 - 1_600_000);
  });

  it("has no one-sided error to make, because a stop cannot drift", () => {
    const r = readRecovery({ ...SEED, basis: "expense stop", stopPerSf: 16 });
    expect(r.oneSidedCost).toBe(0);
  });

  it("asks for the stop rather than guessing one", () => {
    const r = readRecovery({ ...SEED, basis: "expense stop", stopPerSf: null });
    expect(r.increase).toBeNull();
    expect(r.note).toContain("expense stop");
    // The current year is still answered — it does not depend on the floor.
    expect(r.currentGrossedUp).toBe(1_912_553);
  });
});

describe("a blank is null, never zero", () => {
  it("asks for the two areas first", () => {
    expect(readRecovery({ ...SEED, buildingSf: null }).note).toContain(
      "the building's",
    );
    expect(readRecovery({ ...SEED, tenantSf: null }).sharePct).toBeNull();
  });

  it("refuses premises larger than the building", () => {
    const r = readRecovery({ ...SEED, tenantSf: 120_000 });
    expect(r.sharePct).toBeNull();
    expect(r.note).toContain("cannot be larger than the building");
  });

  it("asks for the base year's occupancy, and says why", () => {
    const r = readRecovery({ ...SEED, base: { ...SEED.base, occupancyPct: null } });
    expect(r.baseGrossedUp).toBeNull();
    expect(r.note).toContain("half-empty building");
  });

  it("says plainly when nothing is recoverable", () => {
    // Expenses at or below the floor: the landlord absorbs it, and a
    // statement showing a balance due on these figures is wrong.
    const r = readRecovery({
      ...SEED,
      current: { fixed: 500_000, variable: 800_000, occupancyPct: 94 },
    });
    expect(r.increase).toBe(0);
    expect(r.tenantShare).toBe(0);
    expect(r.dueFromTenant).toBe(-30_000);
    expect(r.note).toContain("nothing is recoverable");
  });

  it("treats unstated estimates as none paid rather than as an unknown", () => {
    const r = readRecovery({ ...SEED, estimatedPaid: null });
    expect(r.dueFromTenant).toBe(r.tenantShare);
  });

  it("falls back to 95% when the gross-up target is unstated", () => {
    const r = readRecovery({ ...SEED, grossUpToPct: null });
    expect(r.baseGrossedUp).toBe(1_827_500);
  });
});
