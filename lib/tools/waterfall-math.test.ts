import { describe, expect, it } from "vitest";
import { runWaterfall, type WaterfallTerms } from "@/lib/tools/waterfall-math";

// A plain deal: $10M of equity, four years of thin cash, a $15M exit.
// 90/10 LP/GP, an 8% pref, then 80/20 to 12% and 70/30 above it — the
// structure most JV term sheets actually use.
const DEAL: WaterfallTerms = {
  cashFlows: [-10_000_000, 400_000, 500_000, 600_000, 15_000_000],
  lpEquityPct: 90,
  prefPct: 8,
  tiers: [
    { hurdlePct: 12, lpSharePct: 80 },
    { hurdlePct: 18, lpSharePct: 70 },
  ],
};

describe("runWaterfall — the shape of the answer", () => {
  it("splits the equity cheque pro rata", () => {
    const w = runWaterfall(DEAL);
    expect(w.lp.contributed).toBe(9_000_000);
    expect(w.gp.contributed).toBe(1_000_000);
  });

  it("distributes every dollar the deal produced, and no more", () => {
    const w = runWaterfall(DEAL);
    const produced = DEAL.cashFlows.slice(1).reduce((s, x) => s + x, 0);
    expect(w.lp.distributed + w.gp.distributed).toBeCloseTo(produced, 0);
  });

  it("the property's IRR is not anybody's IRR", () => {
    const w = runWaterfall(DEAL);
    expect(w.dealIrrPct).not.toBeNull();
    // The LP gives up return to the promote; the GP is paid for it.
    expect(w.lp.irrPct!).toBeLessThan(w.dealIrrPct!);
    expect(w.gp.irrPct!).toBeGreaterThan(w.dealIrrPct!);
    expect(w.lpDragPts!).toBeLessThan(0);
  });

  it("names the promote as what the GP took ABOVE its pro-rata share", () => {
    const w = runWaterfall(DEAL);
    const total = w.lp.distributed + w.gp.distributed;
    expect(w.promote).toBeCloseTo(w.gp.distributed - total * 0.1, 0);
    expect(w.promote).toBeGreaterThan(0);
    expect(w.promoteSharePct).toBeGreaterThan(0);
  });
});

describe("runWaterfall — the hurdles are really hurdles", () => {
  it("a deal that exactly clears the pref pays the GP nothing but its share", () => {
    // $10M out, one payment back four years later at exactly 8% compounded:
    // $10M × 1.08^4 = $13,604,890. Nothing is left over, so the promote is 0.
    const w = runWaterfall({
      ...DEAL,
      cashFlows: [-10_000_000, 0, 0, 0, 10_000_000 * Math.pow(1.08, 4)],
    });
    expect(w.promote).toBe(0);
    // Both sides earn the pref rate and nothing more.
    expect(w.lp.irrPct).toBeCloseTo(8, 1);
    expect(w.gp.irrPct).toBeCloseTo(8, 1);
  });

  it("a deal that lands UNDER the pref gives the GP no promote at all", () => {
    const w = runWaterfall({ ...DEAL, cashFlows: [-10_000_000, 0, 0, 0, 11_000_000] });
    expect(w.promote).toBe(0);
    // Everything flows through tier one, so both sides take the same beating.
    expect(w.lp.irrPct).toBeCloseTo(w.gp.irrPct!, 1);
    expect(w.lp.irrPct!).toBeLessThan(8);
  });

  it("stops the pref tier exactly at the pref, not a dollar past it", () => {
    const w = runWaterfall(DEAL);
    const pref = w.byTier[0];
    // Rebuild the LP's flows through the pref tier alone: its IRR must be
    // the pref rate. (The whole pref is paid in the final period here.)
    const lpPref = [-9_000_000, 0, 0, 0, 0];
    lpPref[4] = pref.toLp;
    // …plus what tier one paid in the earlier periods, which for this deal
    // is all of the interim cash.
    const interim = DEAL.cashFlows.slice(1, 4);
    const paidEarly = interim.reduce((s, x) => s + x, 0);
    expect(pref.toLp + pref.toGp).toBeGreaterThan(paidEarly);
    // The pref splits PRO RATA — the GP's 10% co-invest earns its 10% here.
    // What makes it a pref is the hurdle, not a 100%-to-LP split.
    expect(pref.toGp / pref.total).toBeCloseTo(0.1, 4);
  });

  it("the LP's IRR lands at the top hurdle when cash runs out there", () => {
    // Tuned so the deal produces just enough to clear 12% and no more:
    // $10M × 1.12^4 = $15,735,194, all in year 4.
    const w = runWaterfall({
      ...DEAL,
      cashFlows: [-10_000_000, 0, 0, 0, 10_000_000 * Math.pow(1.12, 4)],
      tiers: [{ hurdlePct: 12, lpSharePct: 80 }],
    });
    // Everything above the pref is split 80/20 until the LP reaches 12%.
    // The LP's own IRR must be at or just under 12% — it cannot pass a
    // hurdle it is still climbing toward.
    expect(w.lp.irrPct!).toBeLessThanOrEqual(12.01);
    expect(w.lp.irrPct!).toBeGreaterThan(8);
    expect(w.gp.irrPct!).toBeGreaterThan(12);
  });

  it("a bigger exit promotes more, and drags the LP further from the deal", () => {
    const small = runWaterfall(DEAL);
    const big = runWaterfall({
      ...DEAL,
      cashFlows: [-10_000_000, 400_000, 500_000, 600_000, 22_000_000],
    });
    expect(big.promote).toBeGreaterThan(small.promote);
    expect(big.lpDragPts!).toBeLessThan(small.lpDragPts!);
  });

  it("orders the tiers by hurdle however they are handed in", () => {
    const jumbled = runWaterfall({
      ...DEAL,
      tiers: [
        { hurdlePct: 18, lpSharePct: 70 },
        { hurdlePct: 12, lpSharePct: 80 },
      ],
    });
    const sorted = runWaterfall({
      ...DEAL,
      tiers: [
        { hurdlePct: 12, lpSharePct: 80 },
        { hurdlePct: 18, lpSharePct: 70 },
      ],
    });
    expect(jumbled.lp.distributed).toBeCloseTo(sorted.lp.distributed, 0);
    expect(jumbled.gp.distributed).toBeCloseTo(sorted.gp.distributed, 0);
  });

  it("keeps splitting above the last hurdle at the last tier's ratio", () => {
    const w = runWaterfall({
      ...DEAL,
      cashFlows: [-10_000_000, 0, 0, 0, 40_000_000],
      tiers: [{ hurdlePct: 12, lpSharePct: 80 }],
    });
    const above = w.byTier[w.byTier.length - 1];
    expect(above.label).toMatch(/Above 12%/);
    expect(above.toLp / above.total).toBeCloseTo(0.8, 4);
  });
});

describe("runWaterfall — no promote where none is earned", () => {
  it("a 100% LP deal with no tiers is a straight pass-through", () => {
    const w = runWaterfall({
      cashFlows: DEAL.cashFlows,
      lpEquityPct: 100,
      prefPct: 8,
      tiers: [],
    });
    expect(w.gp.contributed).toBe(0);
    expect(w.gp.distributed).toBe(0);
    expect(w.promote).toBe(0);
    expect(w.lp.irrPct).toBeCloseTo(w.dealIrrPct!, 2);
    expect(w.lpDragPts).toBeCloseTo(0, 2);
  });

  it("a zero pref sends cash straight into the promote tiers", () => {
    const w = runWaterfall({ ...DEAL, prefPct: 0 });
    expect(w.promote).toBeGreaterThan(runWaterfall(DEAL).promote);
  });

  it("a tier that pays the LP nothing cannot be used to reach a hurdle", () => {
    // 0% to the LP would divide by zero in the sizing; it is skipped, and
    // the cash falls through to the next tier rather than vanishing.
    const w = runWaterfall({
      ...DEAL,
      tiers: [{ hurdlePct: 12, lpSharePct: 0 }],
    });
    const produced = DEAL.cashFlows.slice(1).reduce((s, x) => s + x, 0);
    expect(w.lp.distributed + w.gp.distributed).toBeCloseTo(produced, 0);
  });
});

describe("runWaterfall — it asks rather than answering wrongly", () => {
  it("wants an equity cheque in the first period", () => {
    expect(runWaterfall({ ...DEAL, cashFlows: [10, 20, 30] }).note).toMatch(/must be negative/);
  });
  it("wants at least two periods", () => {
    expect(runWaterfall({ ...DEAL, cashFlows: [-10] }).note).toMatch(/two periods/);
  });
  it("wants the LP's share of the equity", () => {
    expect(runWaterfall({ ...DEAL, lpEquityPct: null }).note).toMatch(/LP/);
    expect(runWaterfall({ ...DEAL, lpEquityPct: 140 }).note).toMatch(/between 0 and 100/);
  });
  it("refuses a tier share outside 0 and 100", () => {
    // 120% to the LP pays the GP NEGATIVE dollars; −30% hands the GP 130%
    // of the tier. Both are typos, and both render as a negative bar.
    const over = runWaterfall({ ...DEAL, tiers: [{ hurdlePct: 12, lpSharePct: 120 }] });
    expect(over.note).toMatch(/between 0 and 100/);
    expect(over.byTier).toEqual([]);
    const under = runWaterfall({ ...DEAL, tiers: [{ hurdlePct: 12, lpSharePct: -30 }] });
    expect(under.note).toMatch(/between 0 and 100/);
    // The boundaries themselves are legitimate splits.
    expect(runWaterfall({ ...DEAL, tiers: [{ hurdlePct: 12, lpSharePct: 100 }] }).note).toBeNull();
    expect(runWaterfall({ ...DEAL, tiers: [{ hurdlePct: 12, lpSharePct: 0 }] }).note).toBeNull();
  });

  it("no side of any tier is ever paid a negative amount", () => {
    for (const tiers of [
      [{ hurdlePct: 12, lpSharePct: 80 }],
      [{ hurdlePct: 12, lpSharePct: 100 }],
      [{ hurdlePct: 12, lpSharePct: 0 }],
      [{ hurdlePct: 12, lpSharePct: 80 }, { hurdlePct: 18, lpSharePct: 70 }],
    ]) {
      const w = runWaterfall({ ...DEAL, cashFlows: [-10_000_000, 0, 0, 0, 40_000_000], tiers });
      for (const t of w.byTier) {
        expect(t.toLp, t.label).toBeGreaterThanOrEqual(0);
        expect(t.toGp, t.label).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("wants a preferred return", () => {
    expect(runWaterfall({ ...DEAL, prefPct: null }).note).toMatch(/preferred/);
    expect(runWaterfall({ ...DEAL, prefPct: -3 }).note).toMatch(/preferred/);
  });
  it("answers nothing rather than zeroes when it refuses", () => {
    const w = runWaterfall({ ...DEAL, prefPct: null });
    expect(w.byTier).toEqual([]);
    expect(w.dealIrrPct).toBeNull();
  });
});

describe("runWaterfall — a capital call mid-hold", () => {
  const CALL: WaterfallTerms = {
    ...DEAL,
    cashFlows: [-10_000_000, 400_000, -2_000_000, 600_000, 18_000_000],
  };

  it("splits a later call pro rata too, not through the waterfall", () => {
    const w = runWaterfall(CALL);
    expect(w.lp.contributed).toBe(10_800_000); // 90% of $12M
    expect(w.gp.contributed).toBe(1_200_000);
  });

  it("still distributes exactly what the deal produced", () => {
    const w = runWaterfall(CALL);
    const produced = CALL.cashFlows.filter((x) => x > 0).reduce((s, x) => s + x, 0);
    expect(w.lp.distributed + w.gp.distributed).toBeCloseTo(produced, 0);
  });

  it("the extra capital raises the bar the pref is measured against", () => {
    // Same distributions, more money in: the LP clears less of the ladder,
    // so the GP's promote is smaller.
    const withCall = runWaterfall(CALL);
    const without = runWaterfall({
      ...DEAL,
      cashFlows: [-10_000_000, 400_000, 0, 600_000, 18_000_000],
    });
    expect(withCall.promote).toBeLessThan(without.promote);
  });
});
