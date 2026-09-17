import { describe, it, expect } from "vitest";
import { readRoll, readRollover, MAX_YEARS, type RollInput } from "@/lib/tools/rollover";

/**
 * A 200,000-foot flex building, 86% leased, with one long cheap distribution
 * tenant holding a third of the space and five shorter office suites paying
 * four to five times the rent.
 *
 * Nothing about it is unusual — which is the point. Every figure the
 * memorandum would quote about this roll is true, and three of them are
 * longer than the figure anyone should bid on.
 */
const ROLL = `Anchor Distribution\t60,000\t8.50\t12
Ridgeline Capital\t22,000\t46.00\t3
Meridian Health\t34,000\t38.00\t7\t4
Croft & Palmer\t18,000\t42.00\t2
Vantage Studios\t26,000\t31.00\t5
Blue Harbor Foods\t12,000\t28.00\t1`;

const SEED: Omit<RollInput, "rows"> = {
  buildingSf: 200_000,
  holdYears: 5,
  capitalPerSf: 45,
  downtimeMonths: 6,
  renewalProbabilityPct: 65,
};

const rows = () => readRoll(ROLL, 2026).rows;
const run = (over: Partial<RollInput> = {}) => readRollover({ rows: rows(), ...SEED, ...over });

describe("rule 1 — weight by rent, not by area", () => {
  it("answers both, because they are different numbers", () => {
    const r = run();
    expect(r.waltByArea).toBe(7);
    expect(r.waltByRent).toBe(5.1);
  });

  it("is longer by area here, which is the figure a memorandum quotes", () => {
    // Not a rule of arithmetic — a fact about how buildings are leased. The
    // long leases are the cheap ones, so area-weighting flatters.
    expect(run().waltByArea!).toBeGreaterThan(run().waltByRent!);
  });

  it("is the one 60,000-foot lease doing it", () => {
    // Drop the distribution tenant and the two averages converge, which is
    // the mechanism asserted rather than asserted about.
    const without = readRollover({
      ...SEED,
      rows: rows().filter((l) => l.tenant !== "Anchor Distribution"),
    });
    expect(Math.abs(without.waltByArea! - without.waltByRent!)).toBeLessThan(0.5);
  });

  it("covers every lease by area and only the rented ones by rent", () => {
    const r = run();
    expect(r.leaseCount).toBe(6);
    expect(r.rentedLeases).toBe(6);
    expect(r.leasedSf).toBe(172_000);
    expect(r.totalRent).toBe(4_712_000);
  });
});

describe("rule 2 — a break option is an expiry", () => {
  it("runs the term to whichever comes first", () => {
    const r = run();
    expect(r.waltToBreak).toBe(4.3);
    expect(r.breakGivesUpYears).toBe(0.8);
  });

  it("says so, ahead of the other three — it is the quoted figure that is wrong", () => {
    expect(run().note).toBe("Break options give up 0.8 years of the quoted term, leaving 4.3.");
  });

  it("puts the space in the year the tenant can leave, not the year the lease ends", () => {
    // Meridian's 34,000 feet expire in year 7 and are at risk in year 4.
    const r = run();
    expect(r.years[3].sfExpiring).toBe(34_000);
    expect(r.years[3].year).toBe(4);
  });

  it("ignores a break that falls after the expiry, which is not a break at all", () => {
    const odd = readRoll("A\t10,000\t30\t3\t5", 2026);
    expect(readRollover({ rows: odd.rows }).waltToBreak).toBe(3);
  });

  it("and the two terms agree when nobody has an option", () => {
    const none = rows().map((l) => ({ ...l, breakYears: null }));
    const r = readRollover({ ...SEED, rows: none });
    expect(r.waltToBreak).toBe(r.waltByRent);
    expect(r.breakGivesUpYears).toBe(0);
  });
});

describe("rule 3 — an average hides a cliff", () => {
  it("cannot tell two buildings apart, and the schedule can", () => {
    // The whole rule in one assertion: identical weighted average term,
    // 20% of the income rolling in the worst year against 60%.
    const smooth = readRoll(
      ["A\t20,000\t30\t1", "B\t20,000\t30\t2", "C\t20,000\t30\t3", "D\t20,000\t30\t4", "E\t20,000\t30\t5"].join("\n"),
      2026,
    );
    const cliff = readRoll(
      ["A\t10,000\t30\t1", "B\t10,000\t30\t2", "C\t60,000\t30\t3", "D\t10,000\t30\t4", "E\t10,000\t30\t5"].join("\n"),
      2026,
    );
    const s = readRollover({ rows: smooth.rows, holdYears: 5 });
    const c = readRollover({ rows: cliff.rows, holdYears: 5 });

    expect(s.waltByRent).toBe(3);
    expect(c.waltByRent).toBe(3);
    expect(s.worstYear!.sharePct).toBe(20);
    expect(c.worstYear!.sharePct).toBe(60);
  });

  it("names the cliff, and says nothing about the even roll", () => {
    const smooth = readRoll(
      ["A\t20,000\t30\t1", "B\t20,000\t30\t2", "C\t20,000\t30\t3", "D\t20,000\t30\t4", "E\t20,000\t30\t5"].join("\n"),
      2026,
    );
    const cliff = readRoll(
      ["A\t10,000\t30\t1", "B\t10,000\t30\t2", "C\t60,000\t30\t3", "D\t10,000\t30\t4", "E\t10,000\t30\t5"].join("\n"),
      2026,
    );
    expect(readRollover({ rows: cliff.rows, holdYears: 5 }).note).toContain(
      "Year 3 rolls 60% of the income, against 20% on an even roll",
    );
    expect(readRollover({ rows: smooth.rows, holdYears: 5 }).note).toContain(
      "even enough that the average describes it",
    );
  });

  it("names the worst year on the seeded roll and what stands behind it", () => {
    const r = run();
    expect(r.worstYear!.year).toBe(4);
    expect(r.worstYear!.sharePct).toBe(27.4);
    expect(r.evenYearSharePct).toBe(8.3);
    expect(r.rollWithinHoldPct).toBe(89.2);
  });

  it("accumulates, so the schedule reads as a schedule", () => {
    const r = run();
    expect(r.years.map((y) => y.cumulativePct)).toEqual([7.1, 23.2, 44.7, 72.1, 89.2]);
    expect(r.years[4].cumulativePct).toBe(r.rollWithinHoldPct);
  });

  it("measures the worst year by AREA when no rent is stated", () => {
    // Without this every year ties at zero and the FIRST is reported as the
    // cliff — a schedule's headline figure decided by row order.
    const bare = readRoll("A\t10,000\t1\nB\t60,000\t3\nC\t10,000\t5", 2026);
    const r = readRollover({ rows: bare.rows, holdYears: 5 });
    expect(r.waltByRent).toBeNull();
    expect(r.worstYear!.year).toBe(3);
    expect(r.worstYear!.sfExpiring).toBe(60_000);
  });
});

describe("rule 4 — the cliff's cost is capital and downtime", () => {
  it("lands the whole cheque in the year the space rolls", () => {
    const r = run();
    expect(r.years.map((y) => y.capital)).toEqual([540_000, 810_000, 990_000, 1_530_000, 1_170_000]);
    expect(r.capitalWorstYear).toBe(1_530_000);
    expect(r.capitalOverHold).toBe(5_040_000);
  });

  it("owes more in the cliff year than the rent that rolls", () => {
    // The figure the card exists to put on a page: $1.53M of leasing capital
    // against $1.29M of income at risk, and none of it in the NOI.
    const r = run();
    expect(r.capitalWorstYear!).toBeGreaterThan(r.worstYear!.rentExpiring);
  });

  it("charges downtime only on the share that leaves", () => {
    const r = run();
    // Six months at a 65% renewal rate is 0.5 × 0.35 of the rent rolling.
    expect(r.years[3].downtime).toBe(Math.round(1_292_000 * 0.5 * 0.35));
    expect(r.downtimeOverHold).toBe(735_350);
  });

  it("charges none of it when every tenant renews", () => {
    expect(run({ renewalProbabilityPct: 100 }).downtimeOverHold).toBe(0);
  });

  it("reports nothing rather than zero when the costs are not given", () => {
    const r = run({ capitalPerSf: null, downtimeMonths: null });
    expect(r.capitalOverHold).toBeNull();
    expect(r.downtimeOverHold).toBeNull();
    expect(r.capitalWorstYear).toBeNull();
  });
});

describe("the roll is not the building", () => {
  it("reads the vacancy as what is missing from the roll", () => {
    const r = run();
    expect(r.occupancyPct).toBe(86);
    expect(r.vacantSf).toBe(28_000);
  });

  it("reports no occupancy at all without the building's own size", () => {
    // Summing the roll and calling it the building reports 100% occupancy
    // for every property ever screened.
    const r = run({ buildingSf: null });
    expect(r.occupancyPct).toBeNull();
    expect(r.vacantSf).toBeNull();
  });

  it("says the two inputs disagree rather than absorbing it", () => {
    const r = run({ buildingSf: 150_000 });
    expect(r.occupancyPct).toBe(100);
    expect(r.note).toContain("172,000 SF against a building of 150,000");
  });
});

describe("reading the roll", () => {
  it("takes a rent per foot, and a TOTAL annual rent, and knows which", () => {
    // $1,012,000 read as a per-foot rent on 22,000 feet would report the
    // building's income in the billions. The ratio decides it for the whole
    // column at once.
    const perSf = readRoll("Ridgeline\t22,000\t46.00\t3", 2026);
    const total = readRoll("Ridgeline\t22,000\t1,012,000\t3", 2026);
    expect(perSf.rentWasTotal).toBe(false);
    expect(total.rentWasTotal).toBe(true);
    expect(total.rows[0].rentPerSf).toBe(46);
  });

  it("takes years remaining, and calendar years, and knows which", () => {
    const years = readRoll("A\t22,000\t46\t3", 2026);
    const cal = readRoll("A\t22,000\t46\t2029", 2026);
    expect(years.expiryWasCalendar).toBe(false);
    expect(cal.expiryWasCalendar).toBe(true);
    expect(cal.rows[0].expiryYears).toBe(3);
  });

  it("reads the year out of a date rather than dropping the lease", () => {
    // readFigure is strict about the whole string by design, so a pasted
    // date would take the lease with it — and a dropped lease silently
    // shortens every figure the module reports.
    const r = readRoll("A\t22,000\t46\t12/31/2029", 2026);
    expect(r.skipped).toEqual([]);
    expect(r.rows[0].expiryYears).toBe(3);
  });

  it("never splits a grouped thousand into its own column", () => {
    const r = readRoll("Blue Harbor Foods, 12,000, 28.00, 1", 2026);
    expect(r.rows[0]).toMatchObject({ sf: 12_000, rentPerSf: 28, expiryYears: 1 });
  });

  it("takes a roll with no rent column at all", () => {
    const r = readRoll("A\t10,000\t3", 2026);
    expect(r.rows[0]).toMatchObject({ sf: 10_000, rentPerSf: null, expiryYears: 3 });
  });

  it("takes the break as a fourth number", () => {
    expect(readRoll("A\t10,000\t30\t7\t4", 2026).rows[0].breakYears).toBe(4);
  });

  it("keeps a line it cannot read rather than guessing at it", () => {
    const r = readRoll("Total / average\n\nA\t10,000\t30\t3", 2026);
    expect(r.skipped).toEqual(["Total / average"]);
    expect(r.rows).toHaveLength(1);
  });

  it("reads a roll pasted without its tenant column", () => {
    const r = readRoll("10,000\t30\t3", 2026);
    expect(r.rows[0].tenant).toBe("10,000 SF");
    expect(r.rows[0].sf).toBe(10_000);
  });
});

describe("what it refuses", () => {
  it("answers with a prompt on nothing at all", () => {
    expect(readRollover({ rows: [] }).years).toEqual([]);
    expect(readRollover({ rows: [] }).note).toContain("Paste the rent roll");
  });

  it("rolls a tenant already in holdover in year one — they can leave today", () => {
    const r = readRollover({ rows: readRoll("A\t10,000\t30\t0", 2026).rows, holdYears: 5 });
    expect(r.years[0].sfExpiring).toBe(10_000);
  });

  it("counts a lease past the horizon in the totals and not in the table", () => {
    const r = run();
    const inTable = r.years.reduce((a, y) => a + y.sfExpiring, 0);
    expect(inTable).toBe(172_000 - 60_000);
    expect(r.leasedSf).toBe(172_000);
    expect(r.rollWithinHoldPct!).toBeLessThan(100);
  });

  it("runs five years when no horizon is given, and never past the limit", () => {
    expect(readRollover({ rows: rows() }).years).toHaveLength(5);
    expect(run({ holdYears: 40 }).years).toHaveLength(MAX_YEARS);
    expect(MAX_YEARS).toBe(15);
  });

  it("drops a lease with no square footage rather than weighting it at nothing", () => {
    const r = readRollover({ rows: [...rows(), { tenant: "Vacant", sf: 0, rentPerSf: null, expiryYears: 3, breakYears: null }] });
    expect(r.leaseCount).toBe(6);
  });
});
