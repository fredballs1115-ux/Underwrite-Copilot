import { describe, expect, it } from "vitest";
import { readStack, type StackInputs } from "./capital-stack";

/**
 * The seeded stack, which is also what `/tools` renders: a $100M deal
 * earning $6.5M, a cheap amortising senior, a 9% mezzanine and an 11%
 * preferred that accrues. Chosen because the blend reads fine and both
 * layers above the senior are destroying equity value — the case the
 * module exists to catch.
 */
const SEED: StackInputs = {
  totalCost: 100_000_000,
  noi: 6_500_000,
  seniorAmount: 60_000_000,
  seniorRatePct: 5,
  seniorAmortYears: 30,
  mezzAmount: 10_000_000,
  mezzRatePct: 9,
  prefAmount: 8_000_000,
  prefRatePct: 11,
  prefAccrues: true,
  holdYears: 5,
  targetEquityReturnPct: 15,
};

describe("the stack itself", () => {
  it("makes the common equity the plug", () => {
    const r = readStack(SEED);
    expect(r.commonEquity).toBe(22_000_000);
    const funded = r.layers
      .filter((l) => l.key !== "common")
      .reduce((a, l) => a + l.amount, 0);
    expect(funded + r.commonEquity!).toBe(SEED.totalCost);
  });

  it("reports a stack larger than the cost as negative equity, never zero", () => {
    const r = readStack({ ...SEED, seniorAmount: 95_000_000 });
    expect(r.commonEquity).toBe(-13_000_000);
    expect(r.note).toContain("MORE than the deal costs");
  });

  it("stacks each layer's share cumulatively to 100", () => {
    const r = readStack(SEED);
    expect(r.layers.map((l) => l.throughPct)).toEqual([60, 70, 78, 100]);
    expect(r.layers.at(-1)!.key).toBe("common");
  });

  it("leaves out a layer that is not there", () => {
    const r = readStack({ ...SEED, mezzAmount: null, prefAmount: null });
    expect(r.layers.map((l) => l.key)).toEqual(["senior", "common"]);
    expect(r.commonEquity).toBe(40_000_000);
  });

  it("keeps the common equity row even when it is the whole deal", () => {
    const r = readStack({
      ...SEED,
      seniorAmount: null,
      mezzAmount: null,
      prefAmount: null,
    });
    expect(r.layers.map((l) => l.key)).toEqual(["common"]);
    expect(r.layers[0].amount).toBe(100_000_000);
  });
});

describe("rule 1 — leverage is tested at the margin, not on the blend", () => {
  it("passes the blend and still names both layers as dilutive", () => {
    const r = readStack(SEED);
    expect(r.yieldOnCostPct).toBe(6.5);
    // 6.13% against a 6.5% yield: the average says the stack is fine.
    expect(r.blendedRatePct).toBe(6.13);
    expect(r.blendedRatePct!).toBeLessThan(r.yieldOnCostPct!);
    // And both layers above the senior cost more than the building earns.
    expect(r.dilutive).toEqual(["Mezzanine", "Preferred (accruing)"]);
    expect(r.blendHidesIt).toBe(true);
    expect(r.note).toContain("The blend is hiding it");
  });

  it("is the margin that is right: the dilutive layers do lower the return", () => {
    // The claim behind rule 1, checked rather than asserted. Adding the
    // two layers above the senior takes cash out of the deal every year.
    const withLayers = readStack(SEED);
    const seniorOnly = readStack({ ...SEED, mezzAmount: null, prefAmount: null });
    expect(withLayers.cashFlowAfterDebt!).toBeLessThan(seniorOnly.cashFlowAfterDebt!);
    expect(seniorOnly.cashFlowAfterDebt! - withLayers.cashFlowAfterDebt!).toBe(900_000);
  });

  it("calls a stack accretive when every layer is under the yield", () => {
    const r = readStack({ ...SEED, mezzRatePct: 6, prefRatePct: 6.25 });
    expect(r.dilutive).toEqual([]);
    expect(r.blendHidesIt).toBe(false);
    expect(r.note).toContain("Every funded layer costs less");
  });

  it("never sets blendHidesIt when the blend already fails", () => {
    const r = readStack({ ...SEED, mezzRatePct: 18, prefRatePct: 20 });
    expect(r.blendedRatePct!).toBeGreaterThan(r.yieldOnCostPct!);
    expect(r.dilutive.length).toBe(2);
    expect(r.blendHidesIt).toBe(false);
  });

  it("never judges the common equity, which is the thing being judged", () => {
    const r = readStack(SEED);
    expect(r.layers.find((l) => l.key === "common")!.accretive).toBeNull();
  });

  it("leaves a rateless layer out of the blend rather than counting it at zero", () => {
    const r = readStack({ ...SEED, mezzRatePct: null });
    // 60 at 5 and 8 at 11 over 68, not over 78.
    expect(r.blendedRatePct).toBe(round2((60 * 5 + 8 * 11) / 68));
    expect(r.layers.find((l) => l.key === "mezz")!.accretive).toBeNull();
  });
});

describe("rule 2 — amortisation is a transfer, not a cost", () => {
  it("tests the senior on its rate and covers it on its constant", () => {
    const r = readStack(SEED);
    const senior = r.layers.find((l) => l.key === "senior")!;
    expect(senior.ratePct).toBe(5);
    expect(senior.constantPct).toBe(6.44);
    // The constant is above the 6.5% yield's near neighbourhood, the rate
    // is well below it — and the rate is what decides.
    expect(senior.accretive).toBe(true);
  });

  it("would call the same loan marginal if it tested the constant", () => {
    // The error rule 2 exists to prevent, stated as arithmetic: a 5%
    // senior over 25 years has a constant ABOVE the yield on cost, and
    // judging it there would reject a plainly accretive loan.
    const r = readStack({ ...SEED, seniorAmortYears: 25 });
    const senior = r.layers.find((l) => l.key === "senior")!;
    expect(senior.constantPct!).toBeGreaterThan(r.yieldOnCostPct!);
    expect(senior.ratePct!).toBeLessThan(r.yieldOnCostPct!);
    expect(senior.accretive).toBe(true);
  });

  it("makes an interest-only senior's constant its rate", () => {
    const r = readStack({ ...SEED, seniorAmortYears: null });
    const senior = r.layers.find((l) => l.key === "senior")!;
    expect(senior.constantPct).toBe(5);
    expect(r.seniorDebtService).toBe(3_000_000);
  });
});

describe("rule 3 — an accruing preferred flatters the current return", () => {
  it("raises cash-on-cash while taking cash out of the deal", () => {
    const r = readStack(SEED);
    expect(r.cashOnCashSeniorOnlyPct).toBe(6.59);
    expect(r.cashOnCashPct).toBe(7.89);
    // The ratio rose; the cash fell. Both are true, and the second is
    // the one that matters.
    expect(r.cashOnCashPct!).toBeGreaterThan(r.cashOnCashSeniorOnlyPct!);
    expect(r.cashFlowAfterDebt).toBe(1_734_884);
    expect(r.note).toContain("The ratio is not the test here");
  });

  it("takes no cash for an accruing preferred and cash for a current one", () => {
    const accruing = readStack(SEED);
    const current = readStack({ ...SEED, prefAccrues: false });
    expect(accruing.layers.find((l) => l.key === "pref")!.annualCash).toBe(0);
    expect(current.layers.find((l) => l.key === "pref")!.annualCash).toBe(880_000);
    expect(current.cashFlowAfterDebt).toBe(accruing.cashFlowAfterDebt! - 880_000);
  });

  it("names the accruing preferred in its own label", () => {
    expect(readStack(SEED).layers.find((l) => l.key === "pref")!.label).toBe(
      "Preferred (accruing)",
    );
    expect(
      readStack({ ...SEED, prefAccrues: false }).layers.find((l) => l.key === "pref")!
        .label,
    ).toBe("Preferred (current pay)");
  });

  it("stays quiet about the ratio when no layer is dilutive", () => {
    const r = readStack({ ...SEED, mezzRatePct: 4, prefRatePct: 4 });
    expect(r.note).not.toContain("The ratio is not the test here");
  });
});

describe("rule 4 — compounding is its own cost", () => {
  it("prices the accrual and the compounding inside it", () => {
    const r = readStack(SEED);
    expect(r.prefBalanceAtExit).toBe(13_480_465);
    expect(r.prefAccrued).toBe(5_480_465);
    // Simple interest over the same five years is 8M x 11% x 5 = 4.4M.
    expect(r.accrualCost).toBe(5_480_465 - 4_400_000);
  });

  it("charges nothing for compounding over a single year", () => {
    // The claim the figure rests on: one year of accrual IS simple
    // interest, so the compounding cost is exactly zero.
    const r = readStack({ ...SEED, holdYears: 1 });
    expect(r.accrualCost).toBe(0);
    expect(r.prefAccrued).toBe(880_000);
  });

  it("grows the cost with the hold", () => {
    const five = readStack(SEED).accrualCost!;
    const ten = readStack({ ...SEED, holdYears: 10 }).accrualCost!;
    expect(ten).toBeGreaterThan(five * 3);
  });

  it("says nothing about accrual for a preferred that pays current", () => {
    const r = readStack({ ...SEED, prefAccrues: false });
    expect(r.prefBalanceAtExit).toBeNull();
    expect(r.accrualCost).toBeNull();
  });
});

describe("rule 5 — three coverage ratios, not one", () => {
  it("separates the senior's, the lenders' and everything that must be paid", () => {
    const r = readStack({ ...SEED, prefAccrues: false });
    expect(r.seniorDscr).toBe(1.68);
    expect(r.combinedDscr).toBe(1.36);
    expect(r.fixedChargeCoverage).toBe(1.15);
    expect(r.seniorDscr!).toBeGreaterThan(r.combinedDscr!);
    expect(r.combinedDscr!).toBeGreaterThan(r.fixedChargeCoverage!);
  });

  it("keeps an accruing preferred out of fixed charges", () => {
    const r = readStack(SEED);
    expect(r.fixedCharges).toBe(r.combinedDebtService);
    expect(r.fixedChargeCoverage).toBe(r.combinedDscr);
  });

  it("leaves the mezzanine out of the senior's own ratio", () => {
    const r = readStack(SEED);
    expect(r.seniorDebtService).toBe(3_865_116);
    expect(r.combinedDebtService).toBe(3_865_116 + 900_000);
    expect(r.note).toContain("decides who can take the property");
  });

  it("says nothing about the gap when there is no mezzanine", () => {
    const r = readStack({ ...SEED, mezzAmount: null });
    expect(r.combinedDscr).toBe(r.seniorDscr);
    expect(r.note).not.toContain("decides who can take the property");
  });
});

describe("the cost of capital", () => {
  it("weights by the dollars, never by the count of layers", () => {
    const r = readStack(SEED);
    // The four-layer average of 5, 9, 11 and 15 is 10; the weighted
    // answer is 8.08, because the senior is most of the money.
    expect(r.waccPct).toBe(8.08);
    expect(r.waccPct).not.toBe(10);
  });

  it("has no WACC without a target for the equity", () => {
    expect(readStack({ ...SEED, targetEquityReturnPct: null }).waccPct).toBeNull();
    expect(readStack({ ...SEED, targetEquityReturnPct: null }).blendedRatePct).toBe(6.13);
  });

  it("has no WACC when the stack leaves no equity to weight", () => {
    expect(readStack({ ...SEED, seniorAmount: 95_000_000 }).waccPct).toBeNull();
  });
});

describe("what it says with nothing to go on", () => {
  it("asks for the cost first", () => {
    const r = readStack({ ...SEED, totalCost: null });
    expect(r.layers).toEqual([]);
    expect(r.note).toBe("Enter what the deal costs, all in.");
  });

  it("draws the stack without an NOI and asks for one", () => {
    const r = readStack({ ...SEED, noi: null });
    expect(r.layers.length).toBe(4);
    expect(r.yieldOnCostPct).toBeNull();
    expect(r.dilutive).toEqual([]);
    expect(r.blendHidesIt).toBe(false);
    expect(r.note).toContain("Enter year one's NOI");
  });

  it("treats a zero-dollar layer as absent rather than as a layer", () => {
    const r = readStack({ ...SEED, mezzAmount: 0 });
    expect(r.layers.map((l) => l.key)).toEqual(["senior", "pref", "common"]);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
