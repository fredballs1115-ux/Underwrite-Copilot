import { describe, expect, it } from "vitest";
import { MAX_TERM, readStraightLine, type LeaseTerms } from "@/lib/tools/straight-line-rent";

/**
 * 20,000 SF at $32 with 3% bumps, six months free, a ten-year term, bought
 * in year 2. The concession at the front makes rule 2 visible and pulls the
 * crossing forward to year 5.
 */
const SEED: LeaseTerms = {
  termYears: 10,
  startingRentPerSf: 32,
  escalationPct: 3,
  freeMonths: 6,
  areaSf: 20_000,
  currentYear: 2,
  capRatePct: 6.5,
};

describe("the identity the module rests on", () => {
  it("moves rent between years and never creates any", () => {
    const r = readStraightLine(SEED);
    // The cumulative gap returns to exactly zero at expiry — which is what
    // "straight-line" means, said as arithmetic.
    expect(r.years[r.years.length - 1].cumulativeGap).toBe(0);
  });

  it("reports the same total both ways, to within the per-year rounding", () => {
    const r = readStraightLine(SEED);
    const cash = r.years.reduce((s, y) => s + y.cashRent, 0);
    const straight = r.years.reduce((s, y) => s + y.straightLineRent, 0);
    // Each year is rounded to the dollar on its own (the debt schedule's
    // rule), so the two sums agree within a few dollars rather than exactly.
    expect(Math.abs(cash - straight)).toBeLessThan(10);
    expect(Math.abs(cash - r.totalRent)).toBeLessThan(10);
  });

  it("reports one straight-line figure for every year of the term", () => {
    const r = readStraightLine(SEED);
    const distinct = new Set(r.years.map((y) => y.straightLineRent));
    expect(distinct.size).toBe(1);
    expect(r.straightLineRent).toBe(701_688);
  });
});

describe("rule 1 — the sign reverses, and the crossing says where", () => {
  it("overstates early and understates late", () => {
    const early = readStraightLine({ ...SEED, currentYear: 2 });
    const late = readStraightLine({ ...SEED, currentYear: 8 });
    expect(early.gapThisYear).toBe(42_488);
    expect(late.gapThisYear).toBe(-85_431);
    expect(early.beforeCrossing).toBe(true);
    expect(late.beforeCrossing).toBe(false);
  });

  it("finds the single year cash overtakes the statement", () => {
    const r = readStraightLine(SEED);
    expect(r.crossingYear).toBe(5);
    const before = r.years.slice(0, 4);
    const after = r.years.slice(4);
    expect(before.every((y) => y.cashRent < y.straightLineRent)).toBe(true);
    expect(after.every((y) => y.cashRent >= y.straightLineRent)).toBe(true);
  });

  it("names the direction in the note rather than assuming one", () => {
    expect(readStraightLine({ ...SEED, currentYear: 2 }).note).toContain("more rent than the building collects");
    expect(readStraightLine({ ...SEED, currentYear: 8 }).note).toContain("UNDERSTATES the cash");
  });

  it("has no crossing on a flat lease with no concession, because nothing differs", () => {
    const r = readStraightLine({ ...SEED, escalationPct: 0, freeMonths: 0 });
    expect(r.gapThisYear).toBe(0);
    expect(r.years.every((y) => y.gap === 0)).toBe(true);
    expect(r.note).toContain("the same number every year");
  });
});

describe("rule 2 — free rent is averaged in too", () => {
  it("reports revenue in a year the landlord collects half of", () => {
    const r = readStraightLine({ ...SEED, currentYear: 1 });
    expect(r.cashRentThisYear).toBe(320_000); // six months of $32 × 20,000
    expect(r.straightLineRent).toBe(701_688);
    // The statement reports more than double what the building banks.
    expect(r.gapPct).toBe(119.3);
  });

  it("puts the widest gap at the front when the concession is there", () => {
    const withFree = readStraightLine(SEED);
    expect(withFree.widestGapYear).toBe(1);
    expect(withFree.widestGap).toBe(381_688);
  });

  it("…and at the back when there is none, which is the escalation alone", () => {
    const none = readStraightLine({ ...SEED, freeMonths: 0 });
    expect(none.widestGapYear).toBe(10);
    expect(none.widestGap).toBeLessThan(0);
    // No concession pushes the crossing later — year 6 rather than year 5.
    expect(none.crossingYear).toBe(6);
  });

  it("spills a concession longer than a year into the second year", () => {
    const r = readStraightLine({ ...SEED, freeMonths: 18, currentYear: 2 });
    expect(r.years[0].cashRent).toBe(0);
    expect(r.years[1].cashRent).toBeGreaterThan(0);
    expect(r.years[1].cashRent).toBeLessThan(readStraightLine(SEED).years[1].cashRent);
  });
});

describe("rule 3 — the gap capitalises", () => {
  it("prices this year's gap at the stated cap", () => {
    const r = readStraightLine(SEED);
    expect(r.valueOfGap).toBe(653_662); // 42,488 / 0.065
    expect(r.note).toContain("$653,662 of price");
  });

  it("carries the sign, so a late year is a price UNDERSTATED", () => {
    const r = readStraightLine({ ...SEED, currentYear: 8 });
    expect(r.valueOfGap).toBeLessThan(0);
  });

  it("says nothing about price without a cap rate to strike it at", () => {
    const r = readStraightLine({ ...SEED, capRatePct: null });
    expect(r.valueOfGap).toBeNull();
    expect(r.note).toContain("Enter the cap rate");
  });
});

describe("rule 4 — the deferred rent receivable", () => {
  it("is the cumulative gap to the year being bought", () => {
    const r = readStraightLine(SEED);
    expect(r.deferredRentReceivable).toBe(424_177);
    expect(r.deferredRentReceivable).toBe(r.years[1].cumulativeGap);
  });

  it("peaks at the crossing and is gone at expiry", () => {
    const r = readStraightLine(SEED);
    // The peak sits in the last year before cash overtakes — year 4 here.
    expect(r.peakReceivable).toBe(449_232);
    expect(r.years[3].cumulativeGap).toBe(r.peakReceivable);
    expect(r.years[r.years.length - 1].cumulativeGap).toBe(0);
  });

  it("never goes negative on a lease that only escalates", () => {
    const r = readStraightLine(SEED);
    expect(r.years.every((y) => y.cumulativeGap >= 0)).toBe(true);
  });
});

describe("readStraightLine — what it refuses", () => {
  it("wants a term it can believe", () => {
    expect(readStraightLine({ ...SEED, termYears: null }).note).toContain("term between");
    expect(readStraightLine({ ...SEED, termYears: MAX_TERM + 1 }).note).toContain("term between");
    expect(readStraightLine({ ...SEED, termYears: MAX_TERM }).years).toHaveLength(MAX_TERM);
  });

  it("wants a rent and an area", () => {
    expect(readStraightLine({ ...SEED, startingRentPerSf: null }).note).toContain("starting rent");
    expect(readStraightLine({ ...SEED, areaSf: null }).note).toContain("starting rent");
  });

  it("clamps the year being bought into the term rather than reading past it", () => {
    expect(readStraightLine({ ...SEED, currentYear: 99 }).gapThisYear).toBe(
      readStraightLine({ ...SEED, currentYear: 10 }).gapThisYear,
    );
    expect(readStraightLine({ ...SEED, currentYear: 0 }).gapThisYear).toBe(
      readStraightLine({ ...SEED, currentYear: 1 }).gapThisYear,
    );
  });

  it("caps a concession at the term rather than billing negative rent", () => {
    const r = readStraightLine({ ...SEED, freeMonths: 999 });
    expect(r.totalRent).toBe(0);
    expect(r.years.every((y) => y.cashRent === 0)).toBe(true);
  });
});
