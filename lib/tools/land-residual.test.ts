import { describe, expect, it } from "vitest";
import { readResidual, type ResidualTerms } from "./land-residual";

/** A 165,000 SF development on a site that carries it. */
const SEED: ResidualTerms = {
  buildableSf: 165_000,
  units: 180,
  stabilizedNoi: 4_200_000,
  exitCapPct: 5.5,
  hardCostPerSf: 270,
  softCostPct: 22,
  carryPct: 6,
  profitOnCostPct: 15,
  targetYieldOnCostPct: 6.25,
};

const BLANK: ResidualTerms = {
  buildableSf: null,
  units: null,
  stabilizedNoi: null,
  exitCapPct: null,
  hardCostPerSf: null,
  softCostPct: null,
  carryPct: null,
  profitOnCostPct: null,
  targetYieldOnCostPct: null,
};

describe("readResidual — what the dirt is worth", () => {
  it("values the finished building at the exit cap", () => {
    // $4.2M at a 5.5% cap.
    expect(readResidual(SEED).completedValue).toBe(76_363_636);
  });

  it("builds the building at the stated cost", () => {
    const r = readResidual(SEED);
    expect(r.hardCost).toBe(44_550_000);
    // Soft costs quote against HARD costs — 22% of $44.55M, not of the total.
    expect(r.softCost).toBe(9_801_000);
  });

  it("leaves the land as the residual", () => {
    const r = readResidual(SEED);
    expect(r.land).toBe(8_293_492);
    expect(r.landPerBuildableSf).toBe(50.26);
    expect(r.landPerUnit).toBe(46_075);
  });

  it("charges the carry on the land as well, without going in circles", () => {
    // The carry is 6% of land + hard + soft — and the land is what we are
    // solving for. Solved rather than approximated: on the seeded deal the
    // carry is $3,758,670, which is 6% of the $62.64M that precedes it.
    const r = readResidual(SEED);
    const carry = r.byProfit!.carry;
    expect(carry).toBe(3_758_670);
    const beforeCarry = r.byProfit!.budget - carry;
    expect(Math.round(carry / beforeCarry / 0.06)).toBe(1);
    // …and the carry is bigger than the shortcut of 6% on hard and soft alone.
    expect(carry).toBeGreaterThan((r.hardCost! + r.softCost!) * 0.06);
  });
});

describe("readResidual — the two hurdles are different tests", () => {
  it("answers under each", () => {
    const r = readResidual(SEED);
    expect(r.byProfit!.land).toBe(8_293_492);
    expect(r.byYield!.land).toBe(9_045_226);
  });

  it("the tighter one binds", () => {
    const r = readResidual(SEED);
    expect(r.binding).toBe("profit");
    expect(r.land).toBe(r.byProfit!.land);
    expect(r.land!).toBeLessThan(r.byYield!.land);
  });

  it("the other one binds when it is the tighter", () => {
    // Demand 7.5% on cost instead of 6.25% and the yield test allows less.
    const r = readResidual({ ...SEED, targetYieldOnCostPct: 7.5 });
    expect(r.binding).toBe("yield");
    expect(r.land).toBe(r.byYield!.land);
    expect(r.land!).toBeLessThan(r.byProfit!.land);
  });

  it("answers on one hurdle alone", () => {
    const onlyProfit = readResidual({ ...SEED, targetYieldOnCostPct: null });
    expect(onlyProfit.binding).toBe("profit");
    expect(onlyProfit.byYield).toBeNull();
    expect(onlyProfit.land).toBe(8_293_492);

    const onlyYield = readResidual({ ...SEED, profitOnCostPct: null });
    expect(onlyYield.binding).toBe("yield");
    expect(onlyYield.byProfit).toBeNull();
    expect(onlyYield.land).toBe(9_045_226);
  });

  it("says the margin the yield test leaves, so the two compare", () => {
    // The yield test sets no profit — but one falls out of the gap between
    // a 6.25% target and a 5.5% exit, and naming it is what lets the two
    // hurdles be read side by side.
    const r = readResidual(SEED);
    expect(r.byProfit!.profitOnCostPct).toBe(15);
    expect(r.byYield!.profitOnCostPct).toBeGreaterThan(13);
    expect(r.byYield!.profitOnCostPct).toBeLessThan(14);
  });

  it("asks for a hurdle rather than guessing one", () => {
    const r = readResidual({ ...SEED, profitOnCostPct: null, targetYieldOnCostPct: null });
    expect(r.note).toContain("profit on cost or a target yield on cost");
    expect(r.land).toBeNull();
  });
});

describe("readResidual — the parts add up to the whole", () => {
  it("every segment of the completed value, summing to it exactly", () => {
    const r = readResidual(SEED);
    expect(r.lines.map((x) => x.label)).toEqual([
      "Hard costs",
      "Soft costs",
      "Carry",
      "Developer profit",
      "Land",
    ]);
    const sum = r.lines.reduce((s, x) => s + x.amount, 0);
    expect(sum).toBe(r.completedValue);
  });

  it("holds even where the arithmetic would round apart", () => {
    // Land is derived from the rounded pieces rather than rounded on its
    // own, so the bar always fills. Drive it over a range of inputs.
    for (const noi of [3_150_000, 4_200_000, 5_500_001, 9_999_999]) {
      for (const cap of [4.35, 5.5, 6.125]) {
        const r = readResidual({ ...SEED, stabilizedNoi: noi, exitCapPct: cap });
        const sum = r.lines.reduce((s, x) => s + x.amount, 0);
        expect(sum, `NOI ${noi} at ${cap}%`).toBe(r.completedValue);
      }
    }
  });
});

describe("readResidual — a residual is a range, not a number", () => {
  it("re-solves at a quarter point wider on the exit cap", () => {
    const r = readResidual(SEED);
    expect(r.capShockLand).toBe(5_569_819);
    // 25bp takes about a third off the land.
    const lost = 1 - r.capShockLand! / r.land!;
    expect(lost).toBeGreaterThan(0.3);
    expect(lost).toBeLessThan(0.35);
  });

  it("re-solves at a 5% cost overrun", () => {
    const r = readResidual(SEED);
    expect(r.costShockLand).toBe(5_575_942);
    const lost = 1 - r.costShockLand! / r.land!;
    expect(lost).toBeGreaterThan(0.3);
    expect(lost).toBeLessThan(0.35);
  });

  it("the shock is never a proportional scaling of the input", () => {
    // 5% on the hard cost is 33% on the land. A residual amplifies
    // everything upstream of it, which is the reason the figure is
    // reported at all.
    const r = readResidual(SEED);
    const costMove = 0.05;
    const landMove = 1 - r.costShockLand! / r.land!;
    expect(landMove / costMove).toBeGreaterThan(6);
  });
});

describe("readResidual — what it refuses", () => {
  it("reports a negative residual rather than clamping it to zero", () => {
    // Build the same building where it is worth far less finished. The
    // site does not work at any price, free included, and a zero would
    // hide exactly that.
    const r = readResidual({ ...SEED, exitCapPct: 8 });
    expect(r.land!).toBeLessThan(0);
    expect(r.note).toContain("does not work at any land price");
    // The picture still ties.
    expect(r.lines.reduce((s, x) => s + x.amount, 0)).toBe(r.completedValue);
  });

  it("names each missing figure it cannot do without", () => {
    expect(readResidual(BLANK).note).toContain("NOI the finished building");
    expect(readResidual({ ...BLANK, stabilizedNoi: 4_200_000 }).note).toContain("cap rate");
    expect(
      readResidual({ ...BLANK, stabilizedNoi: 4_200_000, exitCapPct: 5.5 }).note,
    ).toContain("square feet the site can carry");
    expect(
      readResidual({
        ...BLANK,
        stabilizedNoi: 4_200_000,
        exitCapPct: 5.5,
        buildableSf: 165_000,
      }).note,
    ).toContain("construction cost");
  });

  it("a blank is null, never zero", () => {
    const r = readResidual(BLANK);
    expect(r.completedValue).toBeNull();
    expect(r.land).toBeNull();
    expect(r.binding).toBeNull();
    expect(r.lines).toEqual([]);
    expect(r.capShockLand).toBeNull();
  });

  it("works with no soft costs and no carry stated", () => {
    // Both are optional — absent means zero of that cost, not a refusal,
    // because a land price quoted before the soft budget exists is a real
    // first pass.
    const r = readResidual({ ...SEED, softCostPct: null, carryPct: null });
    expect(r.softCost).toBe(0);
    expect(r.byProfit!.carry).toBe(0);
    expect(r.land).toBeGreaterThan(readResidual(SEED).land!);
    expect(r.lines.map((x) => x.label)).not.toContain("Soft costs");
    expect(r.lines.map((x) => x.label)).not.toContain("Carry");
    expect(r.lines.reduce((s, x) => s + x.amount, 0)).toBe(r.completedValue);
  });

  it("says the land per unit only when the units are stated", () => {
    expect(readResidual({ ...SEED, units: null }).landPerUnit).toBeNull();
    expect(readResidual({ ...SEED, units: null }).landPerBuildableSf).toBe(50.26);
  });
});
