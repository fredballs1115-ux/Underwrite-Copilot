import { describe, expect, it } from "vitest";
import {
  MAX_BUILD_MONTHS,
  MAX_DOWNTIME_MONTHS,
  MAX_GROUND_LEASE_YEARS,
  MAX_HOLD_YEARS,
  MAX_LEASEBACK_YEARS,
  MAX_LEASE_UP_MONTHS,
  MAX_LEASE_YEARS,
  MAX_LOAN_MONTHS,
  MAX_LOAN_TERM_YEARS,
  MAX_ROLLOVER_YEARS,
  heldNote,
  heldTo,
  pastEndNote,
} from "./limits";
import { readPrepayment, type PrepayTerms } from "./prepayment";
import { readAssumption, type AssumptionTerms } from "./loan-assumption";
import { readRenovation, type RenovationTerms } from "./renovation";
import { readDraw, type DrawTerms } from "./construction-draw";
import { readBelief, type BeliefInputs } from "./what-you-believe";
import { readGroundLease, type GroundLeaseTerms } from "./ground-lease";
import { readBuyout, type BuyoutTerms } from "./lease-buyout";
import { readDebt } from "./debt-math";
import { MAX_YEARS, readRollover, type LeaseRow } from "./rollover";
import { MAX_MONTHS, readLeaseUp, type LeaseUpInput } from "./lease-up";
import { MAX_TERM, readLeaseback, type SaleLeasebackInput } from "./sale-leaseback";

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

  it("says what falls past a schedule's end, where it ends before the answer", () => {
    expect(pastEndNote(MAX_LEASE_UP_MONTHS, "months", ["the cash is not back by then"])).toBe(
      "Run to 60 months, the longest this card runs: the cash is not back by then.",
    );
    expect(pastEndNote(60, "months", ["one", "two"])).toBe(
      "Run to 60 months, the longest this card runs: one; two.",
    );
    expect(pastEndNote(MAX_LEASE_UP_MONTHS, "months", [])).toBeNull();
  });

  it("is the one bound each module reads, not a copy of it", () => {
    // The modules keep their own names for their tests and their callers;
    // each is the limit here, so the card's sentence and the module's
    // schedule cannot hold a figure to two different lengths.
    expect(MAX_YEARS).toBe(MAX_ROLLOVER_YEARS);
    expect(MAX_MONTHS).toBe(MAX_LEASE_UP_MONTHS);
    expect(MAX_TERM).toBe(MAX_LEASEBACK_YEARS);
    expect([MAX_LOAN_TERM_YEARS, MAX_ROLLOVER_YEARS, MAX_LEASEBACK_YEARS, MAX_LEASE_UP_MONTHS]).toEqual([
      40, 15, 50, 60,
    ]);
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

  it("the loan over the hold: the term", () => {
    const seed = { loan: 13_000_000, ratePct: 6.5, amortYears: 30, ioYears: 0, termYears: 10 };
    const r = promptly(
      () => readDebt({ ...seed, termYears: HUGE }),
      () => readDebt({ ...seed, termYears: MAX_LOAN_TERM_YEARS }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
    expect(r.result.years).toHaveLength(MAX_LOAN_TERM_YEARS);
  });

  it("the rollover schedule: the hold", () => {
    const rows: LeaseRow[] = [
      { tenant: "Anchor", sf: 60_000, rentPerSf: 8.5, expiryYears: 12, breakYears: null },
      { tenant: "Ridgeline", sf: 22_000, rentPerSf: 46, expiryYears: 3, breakYears: null },
    ];
    const r = promptly(
      () => readRollover({ rows, holdYears: HUGE }),
      () => readRollover({ rows, holdYears: MAX_ROLLOVER_YEARS }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
    expect(r.result.years).toHaveLength(MAX_ROLLOVER_YEARS);
  });

  it("the lease-up: the months it runs", () => {
    const seed: LeaseUpInput = {
      buildingSf: 120_000,
      preLeasedSf: 24_000,
      stabilizedOccupancyPct: 92,
      absorptionSfPerMonth: 4_000,
      rentPerSf: 34,
      freeRentMonths: 6,
      tiPerSf: 65,
      lcPerSf: 18,
      opexPerSf: 11,
      fixedOpexSharePct: 65,
      monthlyDebtService: null,
      maxMonths: MAX_LEASE_UP_MONTHS,
    };
    const r = promptly(
      () => readLeaseUp({ ...seed, maxMonths: HUGE }),
      () => readLeaseUp(seed),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
    expect(r.result.months).toHaveLength(MAX_LEASE_UP_MONTHS);
  });

  it("the sale-leaseback: the term", () => {
    const seed: SaleLeasebackInput = {
      buildingSf: 180_000,
      marketRentPerSf: 7.5,
      contractRentPerSf: 9,
      termYears: 20,
      escalationPct: 2,
      creditCapPct: 6,
      marketCapPct: 6.25,
      discountRatePct: 8,
      sellingCostPct: 1.5,
      mortgageRatePct: 6.5,
      mortgageAmortYears: 25,
      maxLtvPct: 60,
      minDscr: 1.3,
      minDebtYieldPct: 9,
    };
    const r = promptly(
      () => readLeaseback({ ...seed, termYears: HUGE }),
      () => readLeaseback({ ...seed, termYears: MAX_LEASEBACK_YEARS }),
    );
    expect(r.ms).toBeLessThan(BUDGET_MS);
    expect(r.result).toEqual(r.bound);
    expect(r.result.note).toContain(`year ${MAX_LEASEBACK_YEARS}`);
  });
});
