import { describe, expect, it } from "vitest";
import {
  MAX_BUILD_MONTHS,
  MAX_DOWNTIME_MONTHS,
  MAX_GROUND_LEASE_YEARS,
  MAX_HOLD_YEARS,
  MAX_LEASE_YEARS,
  MAX_LOAN_MONTHS,
  heldNote,
  heldTo,
} from "./limits";
import { readPrepayment, type PrepayTerms } from "./prepayment";
import { readAssumption, type AssumptionTerms } from "./loan-assumption";
import { readRenovation, type RenovationTerms } from "./renovation";
import { readDraw, type DrawTerms } from "./construction-draw";
import { readBelief, type BeliefInputs } from "./what-you-believe";
import { readGroundLease, type GroundLeaseTerms } from "./ground-lease";
import { readBuyout, type BuyoutTerms } from "./lease-buyout";

/**
 * A figure typed — or carried in a link — far past the longest a card runs
 * must answer at once, as the longest. Each card builds its answer a month
 * or a year at a time, so before the bound a million-year hold was a loop
 * a million long and the page froze: the loan assumption ran past four
 * minutes (the research pass of 2026-10-01). Each module is held here to
 * two things: a huge figure returns well inside a frame budget a person
 * would notice, and it returns exactly what the bound itself returns.
 */

/** Runs `read` on the bound, then on the huge figure, timing the second. */
function promptly<T>(read: () => T, atBound: () => T): { result: T; bound: T; ms: number } {
  const bound = atBound(); // warm: the timing is the huge figure's own
  const t0 = performance.now();
  const result = read();
  return { result, bound, ms: performance.now() - t0 };
}

const HUGE = 1_000_000_000;
// A generous budget, so a slow CI runner never fails it: a run at the bound
// takes a few milliseconds (the loan assumption's thirty-year hold, the
// slowest, about 150), while the unbounded runs took seconds to minutes.
const BUDGET_MS = 2_000;

describe("the bound itself", () => {
  it("holds a figure past it to it, and leaves one within it alone", () => {
    expect(heldTo(1e9, 30)).toBe(30);
    expect(heldTo(30, 30)).toBe(30);
    expect(heldTo(7.5, 30)).toBe(7.5);
  });

  it("says so only where a figure was held", () => {
    expect(heldNote(100, MAX_HOLD_YEARS, "Hold", "years")).toBe(
      "Hold read as 30 years, the longest this card runs.",
    );
    expect(heldNote(5_000, MAX_GROUND_LEASE_YEARS, "Years left", "years")).toBe(
      "Years left read as 999 years, the longest this card runs.",
    );
    expect(heldNote(1e9, MAX_LOAN_MONTHS, "Months left")).toBe(
      "Months left read as 600, the longest this card runs.",
    );
    // At the bound, within it, or blank: read as typed, nothing to say.
    expect(heldNote(30, MAX_HOLD_YEARS, "Hold", "years")).toBeNull();
    expect(heldNote(5, MAX_HOLD_YEARS, "Hold", "years")).toBeNull();
    expect(heldNote(null, MAX_HOLD_YEARS, "Hold", "years")).toBeNull();
  });
});

describe("a huge figure returns at once, as the longest the card runs", () => {
  it("prepayment: months left", () => {
    const seed: PrepayTerms = {
      balance: 20_000_000,
      loanRatePct: 3.75,
      monthsRemaining: 30,
      amortYears: 30,
      treasuryRatePct: 4.75,
      floorPct: 1,
      defeasanceCosts: 75_000,
      monthsToOpen: 24,
      marketLoanRatePct: 6.5,
    };
    const r = promptly(
      () => readPrepayment({ ...seed, monthsRemaining: HUGE }),
      () => readPrepayment({ ...seed, monthsRemaining: MAX_LOAN_MONTHS }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
    expect(r.result.yieldMaintenance).not.toBeNull();
  });

  it("loan assumption: the hold", () => {
    const seed: AssumptionTerms = {
      price: 20_000_000,
      noi: 1_100_000,
      noiGrowthPct: 3,
      exitCapPct: 5.75,
      holdYears: 5,
      closingCostPct: 1.5,
      assumedBalance: 9_600_000,
      assumedRatePct: 3.5,
      assumedAmortYears: 25,
      assumedRemainingYears: 5,
      assumptionFeePct: 1,
      marketRatePct: 6.5,
      newLoanLtvPct: 60,
      newLoanAmortYears: 30,
      newLoanFeePct: 1,
    };
    const r = promptly(
      () => readAssumption({ ...seed, holdYears: HUGE }),
      () => readAssumption({ ...seed, holdYears: MAX_HOLD_YEARS }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
    expect(r.result.assume).not.toBeNull();
  });

  it("renovation: the hold", () => {
    const seed: RenovationTerms = {
      units: 200,
      inPlaceRent: 1_400,
      renovatedCompRent: 1_650,
      classicCompRent: 1_500,
      costPerDoor: 15_000,
      makeReadyPerDoor: 2_500,
      normalTurnDays: 14,
      renovationDownDays: 35,
      annualTurnoverPct: 35,
      crewDoorsPerMonth: 8,
      exitCapPct: 5,
      holdYears: 5,
      claimedProgramMonths: 24,
    };
    const r = promptly(
      () => readRenovation({ ...seed, holdYears: HUGE }),
      () => readRenovation({ ...seed, holdYears: MAX_HOLD_YEARS }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
  });

  it("construction draw: the months of works", () => {
    const seed: DrawTerms = {
      landCost: 5_000_000,
      hardCost: 20_000_000,
      softCost: 5_000_000,
      softAtCloseP: 30,
      months: 24,
      ratePct: 8.5,
      ltcPct: 65,
      curve: "s-curve",
      order: "equity-first",
    };
    const r = promptly(
      () => readDraw({ ...seed, months: HUGE }),
      () => readDraw({ ...seed, months: MAX_BUILD_MONTHS }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
    // one row a month, closing through completion — never a million
    expect(r.result.schedule.length).toBe(MAX_BUILD_MONTHS + 1);
  });

  it("what you would have to believe: the hold", () => {
    const seed: BeliefInputs = {
      price: 25_000_000,
      noi: 1_500_000,
      holdYears: 5,
      exitCapPct: 6.25,
      targetIrrPct: 12,
      sellingCostPct: 2,
      marketGrowthPct: 3,
    };
    const r = promptly(
      () => readBelief({ ...seed, holdYears: HUGE }),
      () => readBelief({ ...seed, holdYears: MAX_HOLD_YEARS }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
  });

  it("ground lease: the years left", () => {
    const seed: GroundLeaseTerms = {
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
    const r = promptly(
      () => readGroundLease({ ...seed, yearsRemaining: HUGE }),
      () => readGroundLease({ ...seed, yearsRemaining: MAX_GROUND_LEASE_YEARS }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
  });

  it("lease buyout: the years left, the new term and the downtime", () => {
    const seed: BuyoutTerms = {
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
    const r = promptly(
      () =>
        readBuyout({ ...seed, yearsRemaining: HUGE, newTermYears: HUGE, downtimeMonths: HUGE }),
      () =>
        readBuyout({
          ...seed,
          yearsRemaining: MAX_LEASE_YEARS,
          newTermYears: MAX_LEASE_YEARS,
          downtimeMonths: MAX_DOWNTIME_MONTHS,
        }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
    // …and the note says the years the streams actually ran
    expect(r.result.note).toContain(`${MAX_LEASE_YEARS} years of market rent`);
  });
});
