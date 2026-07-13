import { describe, it, expect } from "vitest";
import { computeUnderwrite, type UnderwriteInputs } from "./engine";
import { scenarioMetrics } from "./playground";
import { solveMaxBid } from "./solver";

/** Same realistic levered base case the playground tests use. */
function baseInputs(over: Partial<UnderwriteInputs> = {}): UnderwriteInputs {
  return {
    purchasePrice: 10_000_000,
    holdMonths: 60,
    acqFeePct: 0,
    acqFeeCap: 0,
    transferTaxPct: 0,
    recordationTaxPct: 0,
    generalHoldPct: 0.01,
    buyerLegal: 0,
    lenderLegal: 0,
    thirdPartyReports: 0,
    miscClosing: 0,
    inPlaceRentAnnual: 1_100_000,
    expenseRecoveriesAnnual: 0,
    otherRevenueAnnual: 0,
    vacancyPct: 0.05,
    rentGrowthPct: 0.03,
    expenseLines: [{ label: "Operating expenses", annual: 420_000 }],
    mgmtFeePct: 0,
    expenseGrowthPct: 0.03,
    rsf: 100_000,
    reservesPsf: 0.2,
    capitalImprovementsYr1: 0,
    tiPsf: 0,
    lcPct: 0,
    amFeePctEquity: 0.005,
    ltc: 0.6,
    allInRatePct: 0.06,
    ioMonths: 0,
    amortMonths: 360,
    financingCostPct: 0.01,
    exitCapPct: 0.06,
    saleCostPct: 0.02,
    ...over,
  };
}

describe("solveMaxBid — price that clears the floors", () => {
  const base = baseInputs();
  const baseIrr = scenarioMetrics(base).leveredIrrPct!;

  it("solving for exactly the base IRR lands on the modeled price", () => {
    const s = solveMaxBid(base, { minIrr: baseIrr });
    expect(s.price).not.toBeNull();
    // IRR is strictly decreasing in price here, so the feasibility edge IS
    // the modeled price (within bisection resolution).
    expect(Math.abs(s.price! - base.purchasePrice)).toBeLessThan(2_000);
    expect(s.unbounded).toBe(false);
    expect(s.binding).toBe("minIrr");
  });

  it("a laxer floor allows a higher bid; a stricter floor forces a lower one", () => {
    const lax = solveMaxBid(base, { minIrr: baseIrr - 0.02 });
    const strict = solveMaxBid(base, { minIrr: baseIrr + 0.02 });
    expect(lax.price!).toBeGreaterThan(base.purchasePrice);
    expect(strict.price!).toBeLessThan(base.purchasePrice);
    expect(lax.deltaPct!).toBeGreaterThan(0);
    expect(strict.deltaPct!).toBeLessThan(0);
  });

  it("the solved price actually clears the floor — and $50k more does not", () => {
    const floor = baseIrr + 0.015;
    const s = solveMaxBid(base, { minIrr: floor });
    const atSolved = scenarioMetrics(
      baseInputs({ purchasePrice: s.price! }),
    ).leveredIrrPct!;
    const above = scenarioMetrics(
      baseInputs({ purchasePrice: s.price! + 50_000 }),
    ).leveredIrrPct!;
    expect(atSolved).toBeGreaterThanOrEqual(floor - 1e-9);
    expect(above).toBeLessThan(floor);
  });

  it("cap floor cross-checks against the closed form (price = yr-1 NOI / cap)", () => {
    // goingInCapPct = year1Noi / price and year-1 NOI is price-independent,
    // so the solver must land on the algebraic answer.
    const year1Noi = computeUnderwrite(base).cashFlow[0].noi;
    const s = solveMaxBid(base, { minCap: 0.062 });
    expect(s.price).not.toBeNull();
    expect(Math.abs(s.price! - year1Noi / 0.062)).toBeLessThan(2_000);
    expect(s.binding).toBe("minCap");
  });

  it("multiple floors bind at the tightest one", () => {
    // A cap floor requiring a much lower price than the IRR floor does.
    const irrOnly = solveMaxBid(base, { minIrr: baseIrr - 0.01 });
    const both = solveMaxBid(base, { minIrr: baseIrr - 0.01, minCap: 0.08 });
    expect(both.price!).toBeLessThan(irrOnly.price!);
    expect(both.binding).toBe("minCap");
  });

  it("an impossible floor returns null (never a fabricated number)", () => {
    // Cap is bounded by yr-1 NOI / (5% of price) inside the search window —
    // a 200% cap floor is genuinely unattainable, unlike a huge IRR floor,
    // which a deep-enough discount CAN clear (and the solver should say so).
    const s = solveMaxBid(base, { minCap: 2 });
    expect(s.price).toBeNull();
    expect(s.deltaPct).toBeNull();
    expect(s.at).toBeNull();
  });

  it("an extreme IRR floor is honestly solvable at a deep discount", () => {
    const s = solveMaxBid(base, { minIrr: 0.6 });
    expect(s.price).not.toBeNull();
    expect(s.price!).toBeLessThan(base.purchasePrice * 0.5);
    expect(s.binding).toBe("minIrr");
  });

  it("a floor met even at 2× price reports unbounded instead of a fake edge", () => {
    const s = solveMaxBid(base, { minCap: 0.005 });
    expect(s.unbounded).toBe(true);
    expect(s.price).toBeCloseTo(base.purchasePrice * 2, 6);
    expect(s.binding).toBeNull();
  });

  it("no floors → no solution object, not a crash", () => {
    const s = solveMaxBid(base, {});
    expect(s.price).toBeNull();
    expect(s.binding).toBeNull();
  });

  it("levers move the answer the right way: a worse exit cap lowers the bid", () => {
    const floor = baseIrr - 0.01;
    const asIs = solveMaxBid(base, { minIrr: floor });
    const stressed = solveMaxBid(base, { minIrr: floor }, { exitCapPct: 0.07 });
    expect(stressed.price!).toBeLessThan(asIs.price!);
  });

  it("is deterministic", () => {
    const a = solveMaxBid(base, { minIrr: baseIrr - 0.005, minCoc: 0.03 });
    const b = solveMaxBid(base, { minIrr: baseIrr - 0.005, minCoc: 0.03 });
    expect(a).toEqual(b);
  });

  it("reports the metrics at the solved price", () => {
    const s = solveMaxBid(base, { minIrr: baseIrr - 0.01 });
    expect(s.at).not.toBeNull();
    expect(s.at!.irr).toBeGreaterThanOrEqual(baseIrr - 0.01 - 1e-9);
    expect(s.at!.cap).toBeGreaterThan(0);
  });
});
