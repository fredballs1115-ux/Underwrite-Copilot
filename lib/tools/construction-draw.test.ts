import { describe, expect, it } from "vitest";
import { DEFAULT_DRAW_PROFILE } from "../construction-debt";
import { curveAt, readDraw, type DrawTerms } from "./construction-draw";

/** The card's own seeded project: $30M of costs over two years at 65% LTC. */
const SEED: DrawTerms = {
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

describe("the schedule closes on itself", () => {
  const r = readDraw(SEED);

  it("sizes the loan on a total cost that includes its own reserve", () => {
    expect(r.hardCostsTotal).toBe(30_000_000);
    expect(r.interestReserve).toBe(1_357_269);
    expect(r.totalCost).toBe(31_357_269);
    expect(r.loan).toBe(20_382_225);
    expect(r.equity).toBe(10_975_044);
  });

  it("is a fixed point: the loan funds the costs equity did not, plus the reserve", () => {
    // The identity the iteration has to reach. If the reserve were solved
    // with the wrong draw shape this would not close.
    expect(r.hardCostsTotal! - r.equity! + r.interestReserve!).toBe(r.loan);
  });

  it("is exactly the LTC of the total it sized against", () => {
    expect(r.loan!).toBeCloseTo(r.totalCost! * 0.65, 0);
  });

  it("ends fully drawn, and the last balance is the loan", () => {
    const last = r.schedule[r.schedule.length - 1];
    expect(last.month).toBe(24);
    expect(last.balance).toBe(r.loan);
    expect(r.peakBalance).toBe(r.loan);
    expect(r.peakMonth).toBe(24);
  });

  it("draws every real dollar of the budget by completion", () => {
    expect(r.schedule[r.schedule.length - 1].costToDate).toBe(30_000_000);
  });
});

describe("the shortcut the deal page uses", () => {
  const r = readDraw(SEED);

  it("is the 0.55 constant, and this is the one it is measured against", () => {
    // Held to the exported constant so the two cannot drift apart silently.
    expect(DEFAULT_DRAW_PROFILE).toBe(0.55);
    expect(r.reserveAtShortcut!).toBeCloseTo(r.reserveIfDrawnAtOnce! * 0.55, 0);
  });

  it("overstates this reserve by 40%", () => {
    expect(r.reserveAtShortcut).toBe(1_905_738);
    expect(r.shortcutOverstatesBy).toBe(548_469);
    expect(r.shortcutOverstatesBy! / r.interestReserve!).toBeCloseTo(0.404, 2);
    expect(r.note).toContain("40% high");
  });

  it("measures the profile the constant assumes, and it is not 0.55", () => {
    // The point of the card: 0.416 is what this draw actually averages.
    expect(r.impliedDrawProfile).toBe(0.42);
  });

  it("describes a PARI PASSU draw, where it is roughly right", () => {
    // 0.55 is not wrong in general — it is wrong for the funding order
    // construction lenders actually require.
    const pari = readDraw({ ...SEED, order: "pari-passu" });
    expect(pari.impliedDrawProfile).toBe(0.61);
    expect(pari.shortcutOverstatesBy!).toBeLessThan(0);
    expect(Math.abs(pari.shortcutOverstatesBy!) / pari.interestReserve!).toBeLessThan(0.1);
  });

  it("is far off the fully-drawn figure, which nobody uses and everybody fears", () => {
    expect(r.reserveIfDrawnAtOnce).toBe(3_464_978);
    expect(r.reserveIfDrawnAtOnce! / r.interestReserve!).toBeGreaterThan(2.5);
  });
});

describe("equity first", () => {
  it("keeps the loan out of the first months entirely", () => {
    const r = readDraw(SEED);
    expect(r.firstAdvanceMonth).toBe(7);
    expect(r.schedule[6].balance).toBe(0);
    expect(r.schedule[7].balance).toBeGreaterThan(0);
    expect(r.note).toContain("Equity funds the first 7 of 24 months");
  });

  it("draws from month zero when the funding is pari passu", () => {
    const pari = readDraw({ ...SEED, order: "pari-passu" });
    expect(pari.firstAdvanceMonth).toBe(0);
    expect(pari.schedule[0].balance).toBeGreaterThan(0);
  });

  it("delays the first advance further as the loan shrinks", () => {
    // More equity in front means the loan waits longer and costs less.
    const low = readDraw({ ...SEED, ltcPct: 40 });
    const high = readDraw({ ...SEED, ltcPct: 80 });
    expect(low.firstAdvanceMonth).toBe(13);
    expect(high.firstAdvanceMonth).toBe(0);
    expect(low.impliedDrawProfile!).toBeLessThan(r0().impliedDrawProfile!);
    expect(high.impliedDrawProfile!).toBeGreaterThan(r0().impliedDrawProfile!);
  });

  it("charges no reserve at all when the deal is all cash", () => {
    // A 0% LTC is an answer, not a missing input: no loan, no reserve, and
    // a total cost that is just the budget.
    const allCash = readDraw({ ...SEED, ltcPct: 0 });
    expect(allCash.loan).toBe(0);
    expect(allCash.interestReserve).toBe(0);
    expect(allCash.totalCost).toBe(30_000_000);
    expect(allCash.firstAdvanceMonth).toBeNull();
    expect(allCash.note).toContain("never draws");
  });

  it("still answers for a sliver of a loan rather than rounding it away", () => {
    // The boundary above it: a nominal LTC is a real, tiny loan drawn at the
    // very end, and the schedule says so rather than calling it all cash.
    const sliver = readDraw({ ...SEED, ltcPct: 0.0001 });
    expect(sliver.loan).toBe(30);
    expect(sliver.firstAdvanceMonth).toBe(24);
  });
});

function r0() {
  return readDraw(SEED);
}

describe("the curve is an assumption, and a named one", () => {
  it("is smoothstep, flat at both ends and half-built at the midpoint", () => {
    expect(curveAt(0, "s-curve")).toBe(0);
    expect(curveAt(0.5, "s-curve")).toBe(0.5);
    expect(curveAt(1, "s-curve")).toBe(1);
    // Flat at the start: the first tenth of the term spends under 3%.
    expect(curveAt(0.1, "s-curve")).toBeLessThan(0.03);
    // And symmetric about the middle.
    expect(curveAt(0.25, "s-curve") + curveAt(0.75, "s-curve")).toBeCloseTo(1, 10);
  });

  it("is the identity on a straight line", () => {
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(curveAt(x, "straight-line")).toBe(x);
    }
  });

  it("clamps outside the term rather than extrapolating", () => {
    expect(curveAt(-1, "s-curve")).toBe(0);
    expect(curveAt(2, "s-curve")).toBe(1);
  });

  it("costs less on a straight line, because the spend lands earlier only in the middle", () => {
    // Straight-line draws sooner in the first half, so under equity-first
    // the loan starts sooner — and still ends up cheaper here, because the
    // S-curve's back-loaded spend is what the loan is actually funding.
    const line = readDraw({ ...SEED, curve: "straight-line" });
    expect(line.firstAdvanceMonth).toBe(5);
    expect(line.interestReserve!).toBeLessThan(readDraw(SEED).interestReserve!);
  });
});

describe("what the reserve is worth knowing as", () => {
  it("says what share of the loan is not building anything", () => {
    const r = readDraw(SEED);
    expect(r.reserveShareOfLoanPct).toBe(6.66);
  });

  it("grows with the rate", () => {
    const cheap = readDraw({ ...SEED, ratePct: 5 });
    const dear = readDraw({ ...SEED, ratePct: 12 });
    expect(cheap.interestReserve!).toBeLessThan(readDraw(SEED).interestReserve!);
    expect(dear.interestReserve!).toBeGreaterThan(readDraw(SEED).interestReserve!);
  });

  it("grows faster than the term, because interest capitalises", () => {
    // Twice the months is more than twice the reserve: the second year pays
    // interest on the first year's interest.
    const one = readDraw({ ...SEED, months: 12 });
    const two = readDraw({ ...SEED, months: 24 });
    expect(two.interestReserve! / one.interestReserve!).toBeGreaterThan(2);
  });

  it("is zero at a zero rate, however long the works run", () => {
    const free = readDraw({ ...SEED, ratePct: 0 });
    expect(free.interestReserve).toBe(0);
    expect(free.totalCost).toBe(30_000_000);
  });
});

describe("what it refuses", () => {
  it("answers nothing without the budget", () => {
    for (const k of ["landCost", "hardCost", "softCost"] as const) {
      expect(readDraw({ ...SEED, [k]: null }).interestReserve, k).toBeNull();
    }
  });

  it("answers nothing without a term, a rate or an LTC", () => {
    expect(readDraw({ ...SEED, months: null }).loan).toBeNull();
    expect(readDraw({ ...SEED, ratePct: null }).loan).toBeNull();
    expect(readDraw({ ...SEED, ltcPct: null }).loan).toBeNull();
  });

  it("refuses an LTC over 100, which is not a loan-to-cost", () => {
    expect(readDraw({ ...SEED, ltcPct: 120 }).loan).toBeNull();
  });

  it("takes a zero land cost, which a ground lease deal has", () => {
    const leasehold = readDraw({ ...SEED, landCost: 0 });
    expect(leasehold.hardCostsTotal).toBe(25_000_000);
    expect(leasehold.interestReserve!).toBeGreaterThan(0);
  });

  it("takes every soft cost at closing, and none", () => {
    expect(readDraw({ ...SEED, softAtCloseP: 100 }).interestReserve!).toBeGreaterThan(0);
    expect(readDraw({ ...SEED, softAtCloseP: 0 }).interestReserve!).toBeGreaterThan(0);
    // All of it at closing is spent before the curve starts, so the loan
    // waits longer than when it trickles.
    expect(readDraw({ ...SEED, softAtCloseP: 100 }).firstAdvanceMonth!).toBeLessThan(
      readDraw({ ...SEED, softAtCloseP: 0 }).firstAdvanceMonth!,
    );
  });
});

describe("the schedule it hands the page", () => {
  const r = readDraw(SEED);

  it("is one row a month, closing included", () => {
    expect(r.schedule).toHaveLength(25);
    expect(r.schedule[0].month).toBe(0);
    expect(r.schedule[24].month).toBe(24);
  });

  it("never goes backwards, on the costs or the balance", () => {
    for (let i = 1; i < r.schedule.length; i += 1) {
      expect(r.schedule[i].costToDate).toBeGreaterThanOrEqual(r.schedule[i - 1].costToDate);
      expect(r.schedule[i].balance).toBeGreaterThanOrEqual(r.schedule[i - 1].balance);
    }
  });

  it("charges no interest at closing, because nothing is outstanding yet", () => {
    expect(r.schedule[0].interest).toBe(0);
  });

  it("adds its interest up to the reserve", () => {
    const summed = r.schedule.reduce((a, m) => a + m.interest, 0);
    // Each row is rounded for display, so this lands within the rounding.
    expect(Math.abs(summed - r.interestReserve!)).toBeLessThan(r.schedule.length);
  });
});
