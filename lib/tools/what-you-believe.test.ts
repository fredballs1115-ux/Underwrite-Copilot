import { describe, expect, it } from "vitest";
import { irr } from "@/lib/underwrite/engine";
import {
  HEROIC_POINTS,
  STRETCH_POINTS,
  holdStream,
  readBelief,
  type BeliefInputs,
} from "./what-you-believe";

/**
 * The seeded deal, which is also what `/tools` renders: $25M for $1.5M of
 * NOI — a 6.00% going-in cap — held five years, sold at 6.25% with 2% of
 * selling cost, against a 12% UNLEVERED target and 3% growth called
 * ordinary. It needs 7.16% growth a year, which is heroic; or, at market
 * growth, an exit cap 99bp tighter than the one it is bought at.
 */
const SEED: BeliefInputs = {
  price: 25_000_000,
  noi: 1_500_000,
  holdYears: 5,
  exitCapPct: 6.25,
  targetIrrPct: 12,
  sellingCostPct: 2,
  marketGrowthPct: 3,
};

describe("the stream a hold produces", () => {
  it("starts at the going-in NOI and grows from there", () => {
    const s = holdStream(100, 10, 5, 3, 10, 0);
    expect(s[0]).toBe(-100);
    expect(s[1]).toBeCloseTo(10, 10); // year 1 is the going-in NOI
    expect(s[2]).toBeCloseTo(10.5, 10);
    // Year 3 carries its own NOI plus the sale.
    expect(s[3]).toBeGreaterThan(11);
  });

  it("capitalises the FORWARD NOI at the exit, not the trailing year", () => {
    // Three years at 5% growth: year 3 earns 11.025 and year 4 would earn
    // 11.576. At a 10% cap the sale is 115.76, not 110.25 — the difference
    // is a whole year of growth, and it is systematic.
    const s = holdStream(100, 10, 5, 3, 10, 0);
    const sale = s[3] - 10 * Math.pow(1.05, 2);
    expect(sale).toBeCloseTo((10 * Math.pow(1.05, 3)) / 0.1, 6);
    expect(sale).toBeCloseTo(115.7625, 4);
  });

  it("takes the cost of sale out of the exit, not out of the income", () => {
    const gross = holdStream(100, 10, 0, 2, 10, 0);
    const net = holdStream(100, 10, 0, 2, 10, 2);
    expect(net[1]).toBe(gross[1]); // the rent is untouched
    expect(net[2]).toBeCloseTo(gross[2] - 100 * 0.02, 6);
  });
});

describe("the growth the deal is assuming", () => {
  it("solves for it", () => {
    const r = readBelief(SEED);
    expect(r.goingInCapPct).toBe(6);
    expect(r.requiredGrowthPct).not.toBeNull();
  });

  it("and the shared irr agrees, which is the claim worth checking", () => {
    // The whole module rests on this: solve the growth, rebuild the
    // stream at it, and run it through the SAME irr that sits behind the
    // Excel export. If the solver and the engine ever disagree, the page
    // and the workbook would disagree too.
    const r = readBelief(SEED);
    const stream = holdStream(
      SEED.price!,
      SEED.noi!,
      r.requiredGrowthPct!,
      SEED.holdYears!,
      SEED.exitCapPct!,
      SEED.sellingCostPct!,
    );
    const back = irr(stream);
    expect(back).not.toBeNull();
    expect(back! * 100).toBeCloseTo(SEED.targetIrrPct!, 1);
  });

  it("needs more growth for a higher target", () => {
    const fifteen = readBelief(SEED).requiredGrowthPct!;
    const twenty = readBelief({ ...SEED, targetIrrPct: 20 }).requiredGrowthPct!;
    expect(twenty).toBeGreaterThan(fifteen);
  });

  it("needs more growth when the exit cap widens", () => {
    const tight = readBelief({ ...SEED, exitCapPct: 5.5 }).requiredGrowthPct!;
    const wide = readBelief({ ...SEED, exitCapPct: 7 }).requiredGrowthPct!;
    expect(wide).toBeGreaterThan(tight);
  });

  it("reports a NEGATIVE requirement rather than hiding it", () => {
    // A deal bought cheaply enough clears the target while shrinking.
    // That is information, not an error to clamp to zero.
    const r = readBelief({ ...SEED, price: 12_000_000 });
    expect(r.requiredGrowthPct).toBeLessThan(0);
  });

  it("says plainly when no growth rate gets there", () => {
    // At a 60% target on a 6% cap, operations cannot close the gap; the
    // answer is that the price or the exit has to move.
    const r = readBelief({ ...SEED, targetIrrPct: 60 });
    expect(r.requiredGrowthPct).toBeNull();
    expect(r.note).toContain("not the operations");
  });
});

describe("how far past ordinary that is", () => {
  it("measures the gap against the benchmark the caller supplies", () => {
    const r = readBelief(SEED);
    expect(r.aboveMarketBy).toBeCloseTo(r.requiredGrowthPct! - 3, 10);
  });

  it("names the distance, never the market", () => {
    // The words are about the gap from the caller's own benchmark. Move
    // the benchmark and the same deal changes description, which is the
    // point: this module does not have an opinion about growth.
    expect(readBelief({ ...SEED, marketGrowthPct: 12 }).reach).toBe("at market");
    expect(readBelief({ ...SEED, marketGrowthPct: 0.5 }).reach).toBe("heroic");
  });

  it("sits on the stated boundaries rather than drifting", () => {
    const r = readBelief(SEED);
    const g = r.requiredGrowthPct!;
    expect(readBelief({ ...SEED, marketGrowthPct: g - STRETCH_POINTS }).reach).toBe(
      "a stretch",
    );
    expect(readBelief({ ...SEED, marketGrowthPct: g - HEROIC_POINTS }).reach).toBe(
      "heroic",
    );
    expect(readBelief({ ...SEED, marketGrowthPct: g }).reach).toBe("at market");
  });
});

describe("cap compression is not a plan", () => {
  it("solves the other lever at the benchmark growth", () => {
    const r = readBelief(SEED);
    expect(r.requiredExitCapPct).not.toBeNull();
  });

  it("and that cap really does clear the target", () => {
    // Same round trip as the growth solve, on the other unknown.
    const r = readBelief(SEED);
    const stream = holdStream(
      SEED.price!,
      SEED.noi!,
      SEED.marketGrowthPct!,
      SEED.holdYears!,
      r.requiredExitCapPct!,
      SEED.sellingCostPct!,
    );
    expect(irr(stream)! * 100).toBeCloseTo(SEED.targetIrrPct!, 1);
  });

  it("flags an exit cap that has to be tighter than the going-in cap", () => {
    const r = readBelief(SEED);
    if (r.capShiftBps! < 0) {
      expect(r.note).toContain("TIGHTER");
      expect(r.note).toContain("bet on the market re-rating");
    } else {
      expect(r.note).toContain("as wide as");
    }
  });

  it("needs a tighter exit the higher the target goes", () => {
    const fifteen = readBelief(SEED).requiredExitCapPct!;
    const twenty = readBelief({ ...SEED, targetIrrPct: 20 }).requiredExitCapPct!;
    expect(twenty).toBeLessThan(fifteen);
  });
});

describe("a blank is null, never zero", () => {
  it("asks for the price first", () => {
    const r = readBelief({ ...SEED, price: null });
    expect(r.goingInCapPct).toBeNull();
    expect(r.note).toContain("price you are paying");
  });

  it("gives the going-in cap before the hold is known", () => {
    // It needs only the price and the NOI, and it is the figure that
    // frames everything else.
    const r = readBelief({ ...SEED, holdYears: null });
    expect(r.goingInCapPct).toBe(6);
    expect(r.requiredGrowthPct).toBeNull();
    expect(r.note).toContain("starts at a 6% cap");
  });

  it("treats an unstated selling cost as none rather than as unknown", () => {
    const r = readBelief({ ...SEED, sellingCostPct: null });
    expect(r.requiredGrowthPct).not.toBeNull();
    // No cost of sale means a bigger exit, so less growth is needed.
    expect(r.requiredGrowthPct!).toBeLessThan(readBelief(SEED).requiredGrowthPct!);
  });

  it("still solves the growth without a benchmark to judge it against", () => {
    const r = readBelief({ ...SEED, marketGrowthPct: null });
    expect(r.requiredGrowthPct).not.toBeNull();
    expect(r.reach).toBeNull();
    expect(r.aboveMarketBy).toBeNull();
    expect(r.requiredExitCapPct).toBeNull();
  });
});
