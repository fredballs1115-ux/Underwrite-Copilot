import { describe, expect, it } from "vitest";
import { irr } from "@/lib/underwrite/engine";
import { DOWNSIDE_EXIT_HAIRCUT, readFeeDrag, type FeeTerms } from "@/lib/tools/fee-drag";

/**
 * A $30M deal on a $10.5M cheque, sold at $40M in year 5 — a property
 * return of 20.63%, which is high enough to clear the 15% hurdle and earn a
 * promote. That matters: on a deal that never reaches its first hurdle the
 * promote is zero and rule 4's whole claim (the fee share MOVES) is a
 * constant. The weak fixture below is that case, deliberately.
 */
const SEED: FeeTerms = {
  cashFlows: [-10_500_000, 700_000, 790_000, 880_000, 970_000, 21_500_000],
  lpEquityPct: 90,
  prefPct: 8,
  tiers: [
    { hurdlePct: 15, lpSharePct: 70 },
    { hurdlePct: 20, lpSharePct: 50 },
  ],
  purchasePrice: 30_000_000,
  salePrice: 40_000_000,
  acquisitionFeePct: 1.5,
  assetManagementFeePct: 1.5,
  assetManagementBase: "equity",
  effectiveGrossRevenue: 3_600_000,
  dispositionFeePct: 1,
};

const NO_FEES: FeeTerms = {
  ...SEED,
  acquisitionFeePct: 0,
  assetManagementFeePct: 0,
  dispositionFeePct: 0,
};

describe("readFeeDrag — the three returns", () => {
  it("separates the property's return, the LP's before fees, and the LP's net", () => {
    const r = readFeeDrag(SEED);
    expect(r.dealIrrPct).toBe(20.63);
    expect(r.lpIrrBeforeFeesPct).toBe(17.39);
    expect(r.lpIrrPct).toBe(15.71);
  });

  it("orders them — a fee cannot raise a return, and nor can a promote", () => {
    const r = readFeeDrag(SEED);
    expect(r.dealIrrPct!).toBeGreaterThanOrEqual(r.lpIrrBeforeFeesPct!);
    expect(r.lpIrrBeforeFeesPct!).toBeGreaterThanOrEqual(r.lpIrrPct!);
  });

  it("splits the total drag into exactly its two causes", () => {
    const r = readFeeDrag(SEED);
    expect(r.promoteDragPts! + r.feeDragPts!).toBeCloseTo(r.totalDragPts!, 2);
    expect(r.totalDragPts).toBe(4.92);
  });

  /** The identity that proves the fee layer is a layer and not a rewrite. */
  it("with no fees at all, the LP's net return IS the waterfall's", () => {
    const r = readFeeDrag(NO_FEES);
    expect(r.totalFees).toBe(0);
    expect(r.feeDragPts).toBe(0);
    expect(r.lpIrrPct).toBe(r.lpIrrBeforeFeesPct);
  });

  /** …and with no promote either, it is the property's. */
  it("with no fees and no promote, the LP's return is the deal's", () => {
    const r = readFeeDrag({ ...NO_FEES, lpEquityPct: 100, prefPct: 0, tiers: [] });
    expect(r.lpIrrPct).toBe(r.dealIrrPct);
    expect(r.totalDragPts).toBe(0);
  });
});

describe("rule 1 — the acquisition fee has two denominators", () => {
  it("is quoted against the price and paid out of the equity", () => {
    const r = readFeeDrag(SEED);
    expect(r.acquisitionFee).toBe(450_000); // 1.5% of $30,000,000
    // The same fee against the cheque the LP actually wires. A "1.5% fee"
    // is 4.11% of the money at risk, which is the figure no deck prints.
    expect(r.acquisitionFeePctOfEquity).toBe(4.11);
    expect(r.acquisitionFeePctOfEquity!).toBeGreaterThan(SEED.acquisitionFeePct!);
  });

  it("is an extra cheque at closing, never a haircut to a distribution", () => {
    const only: FeeTerms = { ...NO_FEES, acquisitionFeePct: 1.5 };
    const r = readFeeDrag(only);
    const none = readFeeDrag(NO_FEES);
    // More equity in for the same cash back — so the multiple falls. Netting
    // the fee from a later distribution would leave the year-0 cheque alone
    // and understate the drag.
    expect(r.lpMultiple!).toBeLessThan(none.lpMultiple!);
    expect(r.totalFees).toBe(450_000);
  });

  it("without a price there is no base, so there is no fee", () => {
    const r = readFeeDrag({ ...SEED, purchasePrice: null });
    expect(r.acquisitionFee).toBe(0);
    expect(r.acquisitionFeePctOfEquity).toBeNull();
  });
});

describe("rule 2 — the base is the lever the term sheet omits", () => {
  it("computes both bases whenever both are available", () => {
    const r = readFeeDrag(SEED);
    expect(r.assetManagementIfEquityBase).toBe(164_250);
    expect(r.assetManagementIfRevenueBase).toBe(54_000);
    expect(r.assetManagementBaseGap).toBe(110_250);
  });

  it("one word changes the annual fee threefold, and the LP's return with it", () => {
    const onEquity = readFeeDrag(SEED);
    const onRevenue = readFeeDrag({ ...SEED, assetManagementBase: "revenue" });
    expect(onEquity.assetManagementAnnual).toBe(164_250);
    expect(onRevenue.assetManagementAnnual).toBe(54_000);
    expect(onRevenue.lpIrrPct!).toBeGreaterThan(onEquity.lpIrrPct!);
  });

  it("a revenue base with no revenue given says so rather than charging nothing quietly", () => {
    const r = readFeeDrag({ ...SEED, assetManagementBase: "revenue", effectiveGrossRevenue: null });
    expect(r.assetManagementAnnual).toBeNull();
    expect(r.note).toContain("effective gross revenue");
  });
});

describe("rule 3 — the fees are senior to the preferred return", () => {
  /**
   * The same three percentages on a deal that merely did not work: a 3.4%
   * property return, an LP that never reaches its 8% pref, and a sponsor
   * paid in full regardless.
   */
  const WEAK: FeeTerms = {
    ...SEED,
    cashFlows: [-10_500_000, 300_000, 320_000, 340_000, 360_000, 11_000_000],
    salePrice: 31_000_000,
  };

  it("pays the sponsor in full on a deal that earns its LP almost nothing", () => {
    const r = readFeeDrag(WEAK);
    expect(r.gpTakePromote).toBe(0);
    expect(r.gpTakeFees).toBeGreaterThan(1_500_000);
    expect(r.feeShareOfGpTakePct).toBe(100);
  });

  it("leaves the LP under its pref while the fees are paid", () => {
    const r = readFeeDrag(WEAK);
    expect(r.lpIrrPct!).toBeLessThan(WEAK.prefPct!);
    expect(r.feeDragPts).toBe(3);
    expect(r.promoteDragPts).toBe(0);
  });

  it("states the fee load against the cheque the LP wires", () => {
    const r = readFeeDrag(SEED);
    expect(r.totalFeesPctOfEquity).toBe(15.26);
  });

  it("totals exactly the three fees — nothing derived, nothing dropped", () => {
    const r = readFeeDrag(SEED);
    expect(r.acquisitionFee + r.assetManagementTotal + r.dispositionFee).toBe(r.totalFees);
    expect(r.gpTakeFees + r.gpTakePromote).toBe(r.gpTakeTotal);
  });
});

describe("rule 4 — the fee share grows as the deal weakens", () => {
  it("moves from just under half to two thirds on a 10% softer exit", () => {
    const r = readFeeDrag(SEED);
    expect(r.feeShareOfGpTakePct).toBe(47.6);
    expect(r.downsideFeeSharePct).toBe(66.5);
    expect(r.downsideFeeSharePct!).toBeGreaterThan(r.feeShareOfGpTakePct!);
  });

  it("halves the promote while the fees barely move — which is why the share moves", () => {
    const r = readFeeDrag(SEED);
    const promoteFall = r.gpTakePromote - r.downsideGpTakePromote!;
    const feeFall = r.gpTakeFees - (r.downsideGpTakeTotal! - r.downsideGpTakePromote!);
    expect(r.downsideGpTakePromote!).toBeLessThan(r.gpTakePromote / 2);
    expect(promoteFall).toBeGreaterThan(feeFall * 10);
  });

  /**
   * The design choice, made checkable. The haircut is struck against the
   * SALE PRICE because the final flow is net of the loan payoff — cutting
   * the flow by the same percent would understate the downside by exactly
   * the leverage, and on this deal that is nearly half of it.
   */
  it("strikes the haircut on the sale price, not on the final cash flow", () => {
    const r = readFeeDrag(SEED);
    const flows = [...SEED.cashFlows];
    flows[flows.length - 1] = flows[flows.length - 1] * (1 - DOWNSIDE_EXIT_HAIRCUT / 100);
    const cuttingTheFlow = round2(irr(flows)! * 100);

    // $4,000,000 off a $40,000,000 sale against $2,150,000 off the flow.
    expect(r.downsideDealIrrPct).toBe(13.49);
    expect(cuttingTheFlow).toBeGreaterThan(r.downsideDealIrrPct!);
    expect(cuttingTheFlow - r.downsideDealIrrPct!).toBeGreaterThan(2);
  });

  it("has no downside to report without a sale price to strike it against", () => {
    const r = readFeeDrag({ ...SEED, salePrice: null });
    expect(r.downsideDealIrrPct).toBeNull();
    expect(r.downsideFeeSharePct).toBeNull();
    expect(r.dispositionFee).toBe(0);
  });
});

describe("readFeeDrag — the fee that becomes a capital call", () => {
  it("names the first year the fee turns a distribution into a cheque", () => {
    const r = readFeeDrag({
      ...SEED,
      cashFlows: [-10_500_000, 120_000, 140_000, 700_000, 780_000, 21_500_000],
      assetManagementFeePct: 2,
    });
    expect(r.capitalCallYear).toBe(1);
    expect(r.note).toContain("capital call");
  });

  it("stays silent where every year covers its own fee", () => {
    expect(readFeeDrag(SEED).capitalCallYear).toBeNull();
  });
});

describe("readFeeDrag — what it refuses", () => {
  it("wants more than one period", () => {
    const r = readFeeDrag({ ...SEED, cashFlows: [-10_500_000] });
    expect(r.note).toContain("at least two periods");
    expect(r.lpIrrPct).toBeNull();
  });

  it("wants the equity going out, not coming in", () => {
    const r = readFeeDrag({ ...SEED, cashFlows: [10_500_000, 21_500_000] });
    expect(r.note).toContain("must be negative");
  });

  it("wants the LP's share of the equity", () => {
    expect(readFeeDrag({ ...SEED, lpEquityPct: null }).note).toContain("LP's share");
    expect(readFeeDrag({ ...SEED, lpEquityPct: 140 }).note).toContain("LP's share");
  });

  it("wants a preferred return, and zero is an answer", () => {
    expect(readFeeDrag({ ...SEED, prefPct: null }).note).toContain("preferred return");
    expect(readFeeDrag({ ...SEED, prefPct: 0 }).lpIrrPct).not.toBeNull();
  });
});

describe("readFeeDrag — the multiple counts every dollar in", () => {
  it("puts a mid-life capital call in the denominator", () => {
    const withCall = readFeeDrag({
      ...NO_FEES,
      cashFlows: [-10_500_000, 700_000, -1_000_000, 880_000, 970_000, 21_500_000],
    });
    const without = readFeeDrag({
      ...NO_FEES,
      cashFlows: [-10_500_000, 700_000, 0, 880_000, 970_000, 21_500_000],
    });
    // The same cash back, a million more in — the multiple has to fall.
    expect(withCall.dealMultiple!).toBeLessThan(without.dealMultiple!);
  });

describe("readFeeDrag — a missing stream is a sentence, not a throw", () => {
  it("refuses rather than dereferencing an absent cashFlows", () => {
    // Typed as required and the card always passes an array, so this is a
    // belt rather than a live bug — but a throw inside a client component is
    // a broken page where every sibling reader returns a sentence.
    const r = readFeeDrag({ ...SEED, cashFlows: undefined as unknown as number[] });
    expect(r.note).toContain("at least two periods");
    expect(r.lpIrrPct).toBeNull();
  });
});
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
