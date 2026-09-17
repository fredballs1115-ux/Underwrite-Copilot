import { describe, expect, it } from "vitest";
import {
  TERM_MARGIN_YEARS,
  leaseholdPv,
  readGroundLease,
  type GroundLeaseTerms,
} from "./ground-lease";

/**
 * The seeded lease, which is also what `/tools` renders: an $8M-NOI
 * building on land it does not own, paying $2M of ground rent with 40
 * years left, an unsubordinated fee, and a reset in fifteen years to 6%
 * of land value. Covered four times today; 2.22× after the reset.
 */
const SEED: GroundLeaseTerms = {
  noi: 8_000_000,
  groundRent: 2_000_000,
  escalationPct: 2,
  noiGrowthPct: 2.5,
  yearsRemaining: 40,
  discountRatePct: 8,
  feeSimpleCapPct: 5,
  subordinated: false,
  loanTermYears: 10,
  yearsToReset: 15,
  resetPctOfLand: 6,
  landValue: 60_000_000,
};

describe("the present value of a wasting asset", () => {
  it("is the term's cash flows and nothing after them", () => {
    // Built by hand rather than by a closed form: the NOI and the rent
    // grow at DIFFERENT rates, so no single annuity factor covers it,
    // and an annuity shortcut is exactly how this gets quietly wrong.
    let want = 0;
    for (let t = 1; t <= 3; t += 1) {
      const cash = 100 * Math.pow(1.05, t - 1) - 40 * Math.pow(1.03, t - 1);
      want += cash / Math.pow(1.1, t);
    }
    expect(leaseholdPv(100, 40, 5, 3, 3, 10)).toBeCloseTo(want, 10);
  });

  it("stops at expiry — a longer lease is worth strictly more", () => {
    const short = leaseholdPv(8_000_000, 2_000_000, 2.5, 2, 20, 8);
    const long = leaseholdPv(8_000_000, 2_000_000, 2.5, 2, 40, 8);
    expect(long).toBeGreaterThan(short);
    // And the extra twenty years are worth far less than the first
    // twenty, which is why a 99-year lease prices near fee simple and a
    // 30-year one does not.
    expect(long - short).toBeLessThan(short);
  });

  it("is zero over no term at all", () => {
    expect(leaseholdPv(8_000_000, 2_000_000, 2.5, 2, 0, 8)).toBe(0);
  });
});

describe("the error the card exists to prevent", () => {
  it("capitalises the leasehold NOI as though it were a perpetuity", () => {
    const r = readGroundLease(SEED);
    expect(r.leaseholdNoi).toBe(6_000_000);
    expect(r.asIfPerpetual).toBe(120_000_000); // $6M at a 5% fee-simple cap
  });

  it("and says how much of that figure is a reversion somebody else keeps", () => {
    const r = readGroundLease(SEED);
    expect(r.leaseholdValue).toBeLessThan(r.asIfPerpetual!);
    expect(r.overstatementPct).toBeGreaterThan(0);
    expect(r.note).toContain("a reversion");
  });

  it("gets worse as the term shortens — the whole point", () => {
    // Forty years at an 8% discount recovers most of a perpetuity's
    // value. Ten years does not, and a screening model that capitalises
    // is then wrong by more than half.
    const forty = readGroundLease(SEED).overstatementPct!;
    const twenty = readGroundLease({ ...SEED, yearsRemaining: 20 }).overstatementPct!;
    const ten = readGroundLease({ ...SEED, yearsRemaining: 10 }).overstatementPct!;
    expect(forty).toBeLessThan(twenty);
    expect(twenty).toBeLessThan(ten);
    expect(ten).toBeGreaterThan(50);
  });

  it("says so plainly when the ground rent eats the whole building", () => {
    // A rent above the NOI is a leasehold with no value at any discount
    // rate — reported rather than shown as a negative to be squinted at.
    const r = readGroundLease({ ...SEED, groundRent: 9_000_000 });
    expect(r.leaseholdNoi).toBe(-1_000_000);
    expect(r.leaseholdValue).toBeLessThan(0);
    expect(r.note).toContain("worth nothing at any discount rate");
  });
});

describe("coverage, which is the test the lender applies", () => {
  it("is NOI over the ground rent, not a DSCR", () => {
    expect(readGroundLease(SEED).coverage).toBe(4);
  });

  it("answers before a term or a discount rate is known", () => {
    // Often the only figure a reader came for, and it needs neither.
    const r = readGroundLease({ ...SEED, yearsRemaining: null, discountRatePct: null });
    expect(r.coverage).toBe(4);
    expect(r.leaseholdValue).toBeNull();
    expect(r.note).toContain("covered 4×");
  });
});

describe("the reset, which is an uncapped repricing", () => {
  it("strikes the new rent against land value, not against the old rent", () => {
    const r = readGroundLease(SEED);
    expect(r.resetRent).toBe(3_600_000); // 6% of $60M
    expect(r.resetCoverage).toBe(2.22);
  });

  it("names what coverage becomes, because that is the change", () => {
    expect(readGroundLease(SEED).note).toContain("coverage from 4× to 2.22×");
  });

  it("says WHEN, because a reset inside the hold is a different risk", () => {
    // The timing changes nothing in the arithmetic — the rent is struck
    // at land value whenever it lands — but a reset two years out sits
    // inside most hold periods and one twenty years out does not.
    expect(readGroundLease(SEED).note).toContain("In 15 years the reset takes");
    const unknown = readGroundLease({ ...SEED, yearsToReset: null });
    expect(unknown.note).toContain("The reset takes");
    expect(unknown.resetCoverage).toBe(2.22);
  });

  it("moves with land value — the exposure the lease does not cap", () => {
    // Land doubles, the rent doubles, and a comfortable lease becomes a
    // marginal one. Nothing in the lease prevents it.
    const r = readGroundLease({ ...SEED, landValue: 120_000_000 });
    expect(r.resetRent).toBe(7_200_000);
    expect(r.resetCoverage).toBe(1.11);
  });

  it("says nothing about a reset the lease does not have", () => {
    const r = readGroundLease({ ...SEED, resetPctOfLand: null });
    expect(r.resetRent).toBeNull();
    expect(r.resetCoverage).toBeNull();
  });
});

describe("subordination, which decides whether it is financeable", () => {
  it("clears when the term outlasts the loan by the market's margin", () => {
    // 40 years against a 10-year loan, with 10 years to spare and more.
    const r = readGroundLease(SEED);
    expect(r.financeable).toBe(true);
    expect(r.note).toContain("senior to the mortgage");
  });

  it("fails when an unsubordinated term does not clear it", () => {
    const r = readGroundLease({ ...SEED, yearsRemaining: 15 });
    expect(r.financeable).toBe(false);
    expect(r.note).toContain("lenders decline");
  });

  it("sits exactly on the margin rather than inside it", () => {
    // 10 + 10 = 20 passes; 19 does not. The boundary is stated, so it
    // cannot drift.
    expect(readGroundLease({ ...SEED, yearsRemaining: 20 }).financeable).toBe(true);
    expect(readGroundLease({ ...SEED, yearsRemaining: 19 }).financeable).toBe(false);
    expect(TERM_MARGIN_YEARS).toBe(10);
  });

  it("a subordinated fee is financeable whatever the term", () => {
    // The landlord has agreed to stand behind the mortgage, so the
    // lender can foreclose on the building without being wiped out.
    const r = readGroundLease({ ...SEED, subordinated: true, yearsRemaining: 12 });
    expect(r.financeable).toBe(true);
    expect(r.note).not.toContain("lenders decline");
  });
});

describe("the other half of the same lease", () => {
  it("values the leased fee as the rent plus the land coming back", () => {
    const r = readGroundLease(SEED);
    expect(r.leasedFeeValue).toBeGreaterThan(0);
    // It is closer to a bond than to a building: the rent stream alone,
    // with no land at the end, is already most of it over 40 years.
    const noLand = readGroundLease({ ...SEED, landValue: 1 });
    expect(noLand.leasedFeeValue).toBeLessThan(r.leasedFeeValue!);
  });

  it("moves the OPPOSITE way to the leasehold as the clock runs", () => {
    // The clock that destroys the leasehold is the same clock that
    // brings the land back sooner, so a shortening lease is worth less
    // to the tenant and MORE to the landlord. On the seeded lease the
    // leasehold falls $97.5M → $44.7M between forty years and ten while
    // the leased fee rises $32.7M → $42.3M. Two halves of one asset,
    // priced by opposite ends of the same term — which is why they
    // trade to different buyers.
    const forty = readGroundLease(SEED);
    const ten = readGroundLease({ ...SEED, yearsRemaining: 10 });
    expect(ten.leaseholdValue!).toBeLessThan(forty.leaseholdValue!);
    expect(ten.leasedFeeValue!).toBeGreaterThan(forty.leasedFeeValue!);
  });

  it("needs a land value, and says so by answering null without one", () => {
    const r = readGroundLease({ ...SEED, landValue: null });
    expect(r.leasedFeeValue).toBeNull();
    // Everything that does not need it still answers.
    expect(r.leaseholdValue).not.toBeNull();
    expect(r.coverage).toBe(4);
  });
});

describe("a blank is null, never zero", () => {
  it("asks for the NOI first", () => {
    const r = readGroundLease({ ...SEED, noi: null });
    expect(r.coverage).toBeNull();
    expect(r.note).toContain("NOI, before the ground rent");
  });

  it("says a building with no ground rent is not this calculation", () => {
    const r = readGroundLease({ ...SEED, groundRent: null });
    expect(r.leaseholdValue).toBeNull();
    expect(r.note).toContain("ordinary fee-simple building");
  });

  it("treats unstated growth and escalation as flat, not as unknown", () => {
    const r = readGroundLease({ ...SEED, noiGrowthPct: null, escalationPct: null });
    expect(r.leaseholdValue).not.toBeNull();
    // Flat cash of $6M for 40 years at 8% — a plain annuity, which is
    // the one case where the closed form does apply.
    const annuity = 6_000_000 * ((1 - Math.pow(1.08, -40)) / 0.08);
    expect(r.leaseholdValue).toBeCloseTo(Math.round(annuity), 0);
  });

  it("gives coverage without a fee-simple cap to compare against", () => {
    const r = readGroundLease({ ...SEED, feeSimpleCapPct: null });
    expect(r.asIfPerpetual).toBeNull();
    expect(r.overstatementPct).toBeNull();
    expect(r.leaseholdValue).not.toBeNull();
  });
});
