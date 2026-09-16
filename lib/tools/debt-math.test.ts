import { describe, expect, it } from "vitest";
import { readDebt, testRefi } from "@/lib/tools/debt-math";

// A round loan to check the schedule against arithmetic anyone can redo:
// $10,000,000 at 6.5%, 30-year amortisation, 10-year term.
const BASE = {
  loan: 10_000_000,
  ratePct: 6.5,
  amortYears: 30,
  termYears: 10,
};

describe("readDebt — the schedule", () => {
  it("computes the level payment a mortgage calculator would", () => {
    const d = readDebt(BASE);
    // $10M at 6.5% over 360 months is $63,207.02 a month = $758,484 a year.
    expect(d.amortisingPayment).toBeGreaterThan(758_000);
    expect(d.amortisingPayment).toBeLessThan(759_000);
  });

  it("pays down about 1.2% of principal in the first year", () => {
    const d = readDebt(BASE);
    const y1 = d.years[0];
    expect(y1.principal / BASE.loan).toBeGreaterThan(0.011);
    expect(y1.principal / BASE.loan).toBeLessThan(0.013);
  });

  it("is mostly interest in year one — the figure that surprises people", () => {
    const d = readDebt(BASE);
    const y1 = d.years[0];
    expect(y1.interest / y1.debtService).toBeGreaterThan(0.83);
  });

  it("leaves a balloon near $8.478M after ten years", () => {
    const d = readDebt(BASE);
    expect(d.balloon).toBeGreaterThan(8_470_000);
    expect(d.balloon).toBeLessThan(8_485_000);
  });

  it("closes each year where the next one opens", () => {
    const d = readDebt(BASE);
    for (let i = 1; i < d.years.length; i++) {
      expect(d.years[i].opening).toBeCloseTo(d.years[i - 1].closing, 0);
    }
  });

  it("balances: opening less principal is closing, every year", () => {
    const d = readDebt(BASE);
    for (const y of d.years) {
      expect(y.opening - y.principal).toBeCloseTo(y.closing, 0);
      expect(y.interest + y.principal).toBeCloseTo(y.debtService, 0);
    }
  });

  it("the balloon is the loan less everything amortised", () => {
    const d = readDebt(BASE);
    expect(BASE.loan - (d.principalPaid ?? 0)).toBeCloseTo(d.balloon ?? 0, 0);
  });

  it("reports principal repaid as a share of the loan", () => {
    const d = readDebt(BASE);
    // Ten years into a thirty-year schedule retires 15.2% of principal —
    // a third of the term for a seventh of the balance.
    expect(d.paidOffPct).toBeGreaterThan(15);
    expect(d.paidOffPct).toBeLessThan(15.5);
  });

  it("runs one row per year of the term", () => {
    expect(readDebt(BASE).years).toHaveLength(10);
    expect(readDebt({ ...BASE, termYears: 5 }).years).toHaveLength(5);
  });
});

describe("readDebt — interest-only", () => {
  it("pays no principal during the IO years", () => {
    const d = readDebt({ ...BASE, ioYears: 3 });
    expect(d.years[0].principal).toBe(0);
    expect(d.years[2].principal).toBe(0);
    expect(d.years[3].principal).toBeGreaterThan(0);
    expect(d.years[0].io).toBe(true);
    expect(d.years[3].io).toBe(false);
  });

  it("holds the balance flat through the IO years", () => {
    const d = readDebt({ ...BASE, ioYears: 3 });
    expect(d.years[2].closing).toBe(BASE.loan);
  });

  it("charges the rate itself while interest-only", () => {
    const d = readDebt({ ...BASE, ioYears: 3 });
    // 6.5% of $10M, monthly compounded to $650,000 a year exactly.
    expect(d.years[0].debtService).toBeCloseTo(650_000, -1);
    expect(d.ioPayment).toBeCloseTo(650_000, -1);
  });

  it("leaves a BIGGER balloon than the same loan without IO", () => {
    // The market convention: the payment after the IO period amortises over
    // the full period again, so IO is not a deferral — it is less principal
    // repaid over the term, full stop.
    const withIo = readDebt({ ...BASE, ioYears: 3 });
    const without = readDebt(BASE);
    expect(withIo.balloon!).toBeGreaterThan(without.balloon!);
  });

  it("an IO period as long as the term is a full-term IO loan", () => {
    const d = readDebt({ ...BASE, ioYears: 10 });
    expect(d.balloon).toBe(BASE.loan);
    expect(d.principalPaid).toBe(0);
    expect(d.years.every((y) => y.io)).toBe(true);
    expect(d.note).toMatch(/[Ii]nterest-only/);
  });

  it("no amortisation period at all reads as full-term interest-only", () => {
    const d = readDebt({ ...BASE, amortYears: null });
    expect(d.balloon).toBe(BASE.loan);
    expect(d.amortisingPayment).toBeNull();
    expect(d.note).toMatch(/[Ii]nterest-only/);
  });

  it("an IO period longer than the term does not run past the term", () => {
    const d = readDebt({ ...BASE, ioYears: 30, termYears: 5 });
    expect(d.years).toHaveLength(5);
    expect(d.balloon).toBe(BASE.loan);
  });
});

describe("readDebt — the edges", () => {
  it("a zero rate amortises principal only", () => {
    const d = readDebt({ loan: 3_600_000, ratePct: 0, amortYears: 30, termYears: 10 });
    expect(d.interestPaid).toBe(0);
    // $3.6M over 360 months is $10,000 a month.
    expect(d.amortisingPayment).toBeCloseTo(120_000, 0);
    expect(d.balloon).toBeCloseTo(2_400_000, 0);
  });

  it("a term past the amortisation period retires the loan and says when", () => {
    const d = readDebt({ loan: 1_000_000, ratePct: 5, amortYears: 10, termYears: 15 });
    expect(d.balloon).toBe(0);
    expect(d.retiredInYear).toBe(10);
    expect(d.years).toHaveLength(15);
    // The years past payoff cost nothing.
    expect(d.years[12].debtService).toBe(0);
  });

  it("never overpays on the final instalment", () => {
    const d = readDebt({ loan: 1_000_000, ratePct: 5, amortYears: 10, termYears: 12 });
    expect(d.principalPaid).toBeCloseTo(1_000_000, 0);
    expect(d.years[9].closing).toBe(0);
  });

  it("asks for what it needs instead of answering with zeroes", () => {
    expect(readDebt({ ...BASE, loan: null }).note).toMatch(/loan amount/);
    expect(readDebt({ ...BASE, ratePct: null }).note).toMatch(/rate/);
    expect(readDebt({ ...BASE, termYears: null }).note).toMatch(/term/);
    expect(readDebt({ ...BASE, loan: null }).years).toEqual([]);
  });

  it("a negative rate is refused, not amortised", () => {
    expect(readDebt({ ...BASE, ratePct: -2 }).years).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

const REFI = {
  balloon: 8_530_000,
  noiAtRefi: 1_400_000,
  exitCapPct: 6.5,
  newRatePct: 7,
  newAmortYears: 30,
  maxLtvPct: 65,
  minDscr: 1.25,
  minDebtYieldPct: 9,
};

describe("testRefi", () => {
  it("values the asset off NOI and the exit cap", () => {
    // $1.4M ÷ 6.5% = $21.54M
    expect(testRefi(REFI).value).toBeCloseTo(21_538_461, -2);
  });

  it("names the binding test, as the sizer does", () => {
    const r = testRefi(REFI);
    expect(r.binding).not.toBeNull();
    expect(r.tests).toHaveLength(3);
    expect(r.tests.filter((t) => t.binding)).toHaveLength(1);
    // The new loan is the least of the three.
    expect(r.newLoan).toBe(Math.round(Math.min(...r.tests.map((t) => t.maxLoan))));
  });

  it("calls a take-out above the balloon a cash-out", () => {
    const r = testRefi(REFI);
    expect(r.newLoan!).toBeGreaterThan(REFI.balloon);
    expect(r.verdict).toBe("cash out");
    expect(r.proceeds!).toBeGreaterThan(0);
    expect(r.shortfall).toBeNull();
  });

  it("calls a take-out below the balloon a cash-in, with the shortfall", () => {
    // NOI flat and rates up: the classic 2022 vintage refinance.
    const r = testRefi({ ...REFI, noiAtRefi: 950_000, newRatePct: 8, exitCapPct: 7.5 });
    expect(r.verdict).toBe("cash in");
    expect(r.proceeds!).toBeLessThan(0);
    expect(r.shortfall).toBe(Math.abs(r.proceeds!));
    expect(r.shortfall!).toBeGreaterThan(0);
  });

  it("a take-out that lands on the balloon is not a capital event", () => {
    const r = testRefi(REFI);
    // Work backwards: set debt yield so it sizes to exactly the balloon.
    const onTheNose = testRefi({
      ...REFI,
      maxLtvPct: null,
      minDscr: null,
      minDebtYieldPct: (REFI.noiAtRefi / REFI.balloon) * 100,
    });
    expect(onTheNose.verdict).toBe("covers it");
    expect(Math.abs(onTheNose.proceeds!)).toBeLessThanOrEqual(1000);
    expect(r.verdict).not.toBe("covers it");
  });

  it("reports where the new loan lands as an LTV", () => {
    const r = testRefi(REFI);
    expect(r.newLtvPct).toBeGreaterThan(0);
    expect(r.newLtvPct).toBeLessThanOrEqual(65);
  });

  describe("the NOI that clears the balloon", () => {
    it("inverts a binding debt yield", () => {
      const r = testRefi({ ...REFI, maxLtvPct: null, minDscr: null, noiAtRefi: 700_000 });
      expect(r.binding!.key).toBe("debtYield");
      // $8.53M × 9% = $767,700
      expect(r.noiToClear).toBeCloseTo(767_700, -2);
      // …and at that NOI the refinance does clear.
      const at = testRefi({ ...REFI, maxLtvPct: null, minDscr: null, noiAtRefi: r.noiToClear });
      expect(at.verdict).toBe("covers it");
    });

    it("inverts a binding LTV", () => {
      const r = testRefi({
        ...REFI,
        minDscr: null,
        minDebtYieldPct: null,
        noiAtRefi: 700_000,
      });
      expect(r.binding!.key).toBe("ltv");
      // $8.53M × 6.5% ÷ 65% = $853,000
      expect(r.noiToClear).toBeCloseTo(853_000, -2);
      const at = testRefi({
        ...REFI,
        minDscr: null,
        minDebtYieldPct: null,
        noiAtRefi: r.noiToClear,
      });
      expect(at.verdict).toBe("covers it");
    });

    it("inverts a binding DSCR through the constant that sized it", () => {
      const r = testRefi({
        ...REFI,
        maxLtvPct: null,
        minDebtYieldPct: null,
        noiAtRefi: 500_000,
      });
      expect(r.binding!.key).toBe("dscr");
      const at = testRefi({
        ...REFI,
        maxLtvPct: null,
        minDebtYieldPct: null,
        noiAtRefi: r.noiToClear,
      });
      expect(at.verdict).toBe("covers it");
    });
  });

  it("says what is missing instead of answering", () => {
    expect(testRefi({ ...REFI, noiAtRefi: null }).note).toMatch(/NOI/);
    expect(testRefi({ ...REFI, balloon: null }).note).toMatch(/[Nn]othing is owed/);
    expect(
      testRefi({ ...REFI, maxLtvPct: null, minDscr: null, minDebtYieldPct: null }).note,
    ).toMatch(/lender test/);
  });

  it("still values the asset when no test is set", () => {
    const r = testRefi({ ...REFI, maxLtvPct: null, minDscr: null, minDebtYieldPct: null });
    expect(r.value).toBeCloseTo(21_538_461, -2);
    expect(r.newLoan).toBeNull();
  });

  it("a negative NOI supports no take-out at all", () => {
    const r = testRefi({ ...REFI, noiAtRefi: -200_000 });
    expect(r.newLoan).toBeNull();
    expect(r.verdict).toBeNull();
  });
});

describe("the two together", () => {
  it("the schedule's balloon is what the refi has to retire", () => {
    const d = readDebt(BASE);
    const r = testRefi({ ...REFI, balloon: d.balloon });
    expect(r.proceeds).toBeCloseTo(r.newLoan! - d.balloon!, 0);
  });

  it("interest-only makes the same deal harder to refinance", () => {
    const amortising = readDebt(BASE);
    const io = readDebt({ ...BASE, ioYears: 5 });
    const a = testRefi({ ...REFI, balloon: amortising.balloon });
    const b = testRefi({ ...REFI, balloon: io.balloon });
    expect(b.proceeds!).toBeLessThan(a.proceeds!);
  });
});
