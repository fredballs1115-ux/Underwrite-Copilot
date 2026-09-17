import { describe, expect, it } from "vitest";
import {
  GROSS_FLAG_PCT,
  MAX_COMPS,
  MIN_COMPS,
  MIN_GROSS_FOR_WEIGHT,
  THIN_COMPS,
  gridEvidence,
  readGrid,
  timeAdjustment,
  type GridTerms,
} from "./comp-grid";

/**
 * A 200-unit subject, recently renovated and better located than most of
 * what has traded — the ordinary case, and the one that matters, because
 * nearly every adjustment runs the same way and the sign convention
 * therefore does not quietly cancel out.
 */
const SEED: GridTerms = {
  subjectSize: 200,
  unitLabel: "unit",
  marketGrowthPct: 6,
  askingPrice: 22_000_000,
  comps: [
    {
      name: "Grantham Row",
      price: 18_400_000,
      size: 184,
      monthsAgo: 8,
      adjustments: [
        { label: "Location", pct: 8 },
        { label: "Size", pct: 2 },
        { label: "Condition", pct: 6 },
      ],
    },
    {
      name: "Fielder's Walk",
      price: 12_900_000,
      size: 142,
      monthsAgo: 19,
      adjustments: [
        { label: "Location", pct: 12 },
        { label: "Size", pct: -4 },
        { label: "Condition", pct: 5 },
      ],
    },
    {
      name: "The Harlan",
      price: 26_750_000,
      size: 244,
      monthsAgo: 4,
      adjustments: [
        { label: "Location", pct: -6 },
        { label: "Size", pct: 5 },
        { label: "Quality", pct: -4 },
      ],
    },
    {
      name: "Ashcroft Mill",
      price: 9_600_000,
      size: 96,
      monthsAgo: 26,
      adjustments: [
        { label: "Location", pct: 10 },
        { label: "Size", pct: -6 },
        { label: "Condition", pct: 12 },
      ],
    },
    {
      name: "Palmer Yard",
      price: 21_300_000,
      size: 210,
      monthsAgo: 2,
      adjustments: [
        { label: "Location", pct: 2 },
        { label: "Size", pct: -1 },
        { label: "Condition", pct: 3 },
      ],
    },
  ],
};

const flipped = (t: GridTerms): GridTerms => ({
  ...t,
  comps: t.comps.map((c) => ({
    ...c,
    adjustments: c.adjustments.map((a) => ({ ...a, pct: a.pct === null ? null : -a.pct })),
  })),
});

describe("readGrid — rule 1, an inferior comp adjusts UP", () => {
  it("indicates $22,278,254 against a $22,000,000 ask", () => {
    const r = readGrid(SEED);
    expect(r.indicatedBasis).toBe(111_391.27);
    expect(r.indicatedValue).toBe(22_278_254);
    expect(r.askPremium).toBe(-278_254);
    expect(r.askPremiumPct).toBe(-1.2);
  });

  it("and getting the sign backwards costs $2,524,284 — a ninth of the deal", () => {
    const r = readGrid(SEED);
    expect(r.valueIfSignsReversed).toBe(19_753_970);
    expect(r.signErrorValue).toBe(-2_524_284);
    // Twice the adjustment, near enough: the sign flips rather than the
    // magnitude changing, so the error is the double of the correction.
    expect(Math.abs(r.signErrorValue!) / r.indicatedValue!).toBeGreaterThan(0.1);
  });

  it("which REVERSES the answer rather than shading it", () => {
    const r = readGrid(SEED);
    // Read correctly the ask is defensible; read backwards it is 11.4%
    // rich and the deal gets passed on. That is the whole point of the
    // convention, and no figure on a grid reports it.
    expect(r.askPremiumPct).toBeLessThan(0);
    expect(r.askPremiumIfSignsReversedPct).toBe(11.4);
  });

  it("the running of it is the same grid, so flipping twice returns", () => {
    const back = readGrid(flipped(flipped(SEED)));
    expect(back.indicatedValue).toBe(readGrid(SEED).indicatedValue);
    // And flipping once lands exactly where the counterfactual said it would.
    expect(readGrid(flipped(SEED)).indicatedValue).toBe(readGrid(SEED).valueIfSignsReversed);
  });

  it("a grid with no adjustments cannot have the sign wrong", () => {
    const none = readGrid({
      ...SEED,
      comps: SEED.comps.map((c) => ({ ...c, adjustments: [] })),
    });
    expect(none.signErrorValue).toBe(0);
    expect(none.valueIfSignsReversed).toBe(none.indicatedValue);
  });

  it("and it half hides in a grid whose adjustments point both ways", () => {
    // Two comps inferior and two superior by the same amount. The error
    // shrinks to 5.0% from the seed's 11.3% — which is why it survives
    // review on such a grid, and why a balanced-looking set is no defence.
    const balanced: GridTerms = {
      ...SEED,
      comps: [
        { ...SEED.comps[0], adjustments: [{ label: "L", pct: 10 }] },
        { ...SEED.comps[1], adjustments: [{ label: "L", pct: -10 }] },
        { ...SEED.comps[2], adjustments: [{ label: "L", pct: 10 }] },
        { ...SEED.comps[3], adjustments: [{ label: "L", pct: -10 }] },
      ],
    };
    const share = (t: GridTerms) => {
      const g = readGrid(t);
      return Math.abs(g.signErrorValue! / g.indicatedValue!);
    };
    expect(share(balanced)).toBeCloseTo(0.05, 2);
    expect(share(SEED)).toBeCloseTo(0.113, 3);
    expect(share(balanced)).toBeLessThan(share(SEED) / 2);
    // It does not go to zero even there, because the comps sit at
    // different bases: a +10% on the dearest comp is more dollars than a
    // −10% on the cheapest, so equal-and-opposite adjustments do not net
    // out of a reconciliation the way they net out of a column.
    expect(share(balanced)).toBeGreaterThan(0.01);
  });
});

describe("readGrid — rule 2, the time adjustment is the one left out", () => {
  it("compounds rather than pro-rating", () => {
    expect(timeAdjustment(6, 12)).toBeCloseTo(6, 6);
    // Two years at 6% is 12.36%, not 12.00%.
    expect(round1(timeAdjustment(6, 24))).toBe(12.4);
    expect(round1(timeAdjustment(6, 26))).toBe(13.5);
    expect(timeAdjustment(6, 0)).toBe(0);
    // A falling market adjusts down, and a sale in the future adjusts
    // nothing rather than backwards.
    expect(round1(timeAdjustment(-4, 18))).toBe(-5.9);
    expect(timeAdjustment(6, -5)).toBe(0);
  });

  it("is worth $743,844 on the seed, and the convention argument $10,668", () => {
    const r = readGrid(SEED);
    expect(r.valueIfTimeIgnored).toBe(21_534_410);
    expect(r.timeAdjustmentValue).toBe(743_844);
    expect(r.conventionGap).toBe(-10_668);
    // The adjustment nobody makes is worth seventy times the argument
    // everybody has. This is the module's whole reason for existing and it
    // is computed, never asserted.
    expect(Math.abs(r.timeAdjustmentValue!) / Math.abs(r.conventionGap!)).toBeGreaterThan(50);
  });

  it("and the note says so, naming both figures", () => {
    const note = readGrid(SEED).note;
    expect(note).toContain("is the TIME adjustment");
    expect(note).toContain("$743,844");
    expect(note).toContain("$10,668");
  });

  it("no growth given is no time adjustment, never a guessed one", () => {
    const r = readGrid({ ...SEED, marketGrowthPct: null });
    expect(r.timeAdjustmentValue).toBe(0);
    expect(r.indicatedValue).toBe(readGrid(SEED).valueIfTimeIgnored);
    for (const c of r.comps) expect(c.timeAdjustmentPct).toBe(0);
  });

  it("the two conventions agree on small adjustments and part on large ones", () => {
    const gapAt = (scale: number) =>
      Math.abs(
        readGrid({
          ...SEED,
          comps: SEED.comps.map((c) => ({
            ...c,
            adjustments: c.adjustments.map((a) => ({
              ...a,
              pct: a.pct === null ? null : a.pct * scale,
            })),
          })),
        }).conventionGap!,
      );
    expect(gapAt(4)).toBeGreaterThan(gapAt(2));
    expect(gapAt(2)).toBeGreaterThan(gapAt(1));
    expect(gapAt(1)).toBeGreaterThan(gapAt(0.5));
  });

  it("summing can take a comp to zero, and multiplying cannot", () => {
    const savage = readGrid({
      ...SEED,
      comps: SEED.comps.slice(0, 3).map((c) => ({
        ...c,
        adjustments: [
          { label: "A", pct: -30 },
          { label: "B", pct: -30 },
          { label: "C", pct: -30 },
          { label: "D", pct: -30 },
        ],
      })),
    });
    for (const c of savage.comps) {
      expect(c.additiveWentNegative).toBe(true);
      expect(c.basisAdditive).toBeNull();
      expect(c.basisAdjusted).toBeGreaterThan(0);
    }
    // No convention figure is reported at all: a reconciliation that drops
    // the comps one convention broke on is not a fair comparison to one
    // that kept them.
    expect(savage.additiveBasis).toBeNull();
    expect(savage.conventionGap).toBeNull();
    expect(savage.note).toContain("a price cannot be adjusted away");
  });
});

describe("readGrid — rule 3, gross measures comparability, net does not", () => {
  it("a comp that nets to zero on ±15% is flagged, not praised", () => {
    const r = readGrid({
      subjectSize: 200,
      unitLabel: "unit",
      marketGrowthPct: 0,
      askingPrice: null,
      comps: [
        {
          name: "Nets to zero",
          price: 20_000_000,
          size: 200,
          monthsAgo: 0,
          adjustments: [
            { label: "L", pct: 15 },
            { label: "S", pct: -15 },
          ],
        },
        {
          name: "Barely touched",
          price: 20_000_000,
          size: 200,
          monthsAgo: 0,
          adjustments: [{ label: "C", pct: 1 }],
        },
        {
          name: "Also clean",
          price: 19_600_000,
          size: 200,
          monthsAgo: 0,
          adjustments: [{ label: "C", pct: 2 }],
        },
      ],
    });
    const zero = r.comps[0];
    expect(zero.netAdjustmentPct).toBe(0);
    expect(zero.grossAdjustmentPct).toBe(30);
    expect(zero.flagged).toBe(true);
    expect(r.flaggedCount).toBe(1);
    expect(r.note).toContain("nets to nothing while being a quarter judgement");
  });

  it("the time adjustment counts toward the gross, because it is judgement too", () => {
    const r = readGrid(SEED);
    const mill = r.comps.find((c) => c.name === "Ashcroft Mill")!;
    // 10 + 6 + 12 of property, plus 13.5 of market movement.
    expect(mill.netAdjustmentPct).toBe(16);
    expect(mill.grossAdjustmentPct).toBe(41.5);
    expect(mill.timeAdjustmentPct).toBe(13.5);
    expect(round1(28 + mill.timeAdjustmentPct!)).toBe(mill.grossAdjustmentPct);
  });

  it("a flagged comp is still shown — dropping it leaves thinner evidence", () => {
    const r = readGrid(SEED);
    expect(r.flaggedCount).toBe(2);
    expect(r.usableCount).toBe(5);
    expect(r.comps.filter((c) => c.flagged).map((c) => c.name)).toEqual([
      "Fielder's Walk",
      "Ashcroft Mill",
    ]);
    expect(GROSS_FLAG_PCT).toBe(25);
  });
});

describe("readGrid — rule 4, weighted rather than averaged", () => {
  it("leans on the comp needing least adjustment", () => {
    const r = readGrid(SEED);
    expect(r.strongest).toBe("Palmer Yard");
    expect(r.weakest).toBe("Ashcroft Mill");
    const palmer = r.comps.find((c) => c.name === "Palmer Yard")!;
    const mill = r.comps.find((c) => c.name === "Ashcroft Mill")!;
    expect(palmer.weightPct).toBe(46.3);
    expect(mill.weightPct).toBe(7.8);
    // And the weighted answer therefore sits below the straight mean, which
    // the widest-adjusted comp pulls up.
    expect(r.indicatedBasis).toBeLessThan(r.meanBasis!);
    expect(r.meanBasis).toBe(115_539.84);
  });

  it("the weights are a share of one whole", () => {
    const r = readGrid(SEED);
    const total = r.comps.reduce((s, c) => s + (c.weightPct ?? 0), 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it("the inverse is floored, so 1% and 2% are not treated as twice apart", () => {
    const r = readGrid({
      subjectSize: 200,
      unitLabel: "unit",
      marketGrowthPct: 0,
      askingPrice: null,
      comps: [
        { name: "1%", price: 20_000_000, size: 200, monthsAgo: 0, adjustments: [{ label: "x", pct: 1 }] },
        { name: "2%", price: 20_400_000, size: 200, monthsAgo: 0, adjustments: [{ label: "x", pct: -2 }] },
        { name: "3%", price: 19_800_000, size: 200, monthsAgo: 0, adjustments: [{ label: "x", pct: 3 }] },
        { name: "40%", price: 32_000_000, size: 200, monthsAgo: 0, adjustments: [{ label: "x", pct: -40 }] },
      ],
    });
    expect(MIN_GROSS_FOR_WEIGHT).toBe(5);
    // All three good comps carry the same weight; unfloored the first would
    // have carried twice the second, which a comp grid cannot support.
    expect(r.comps.slice(0, 3).map((c) => c.weightPct)).toEqual([32, 32, 32]);
    expect(r.comps[3].weightPct).toBe(4);
  });

  it("the range is reported, because a wide one is not evidence", () => {
    const r = readGrid(SEED);
    expect(r.lowBasis).toBe(105_915.04);
    expect(r.highBasis).toBe(131_391.7);
    expect(r.rangePct).toBe(24.1);
  });

  it("and a set that does not agree with itself says so", () => {
    const wide = readGrid({
      subjectSize: 200,
      unitLabel: "unit",
      marketGrowthPct: 0,
      askingPrice: null,
      comps: [
        { name: "Low", price: 14_000_000, size: 200, monthsAgo: 0, adjustments: [{ label: "x", pct: 2 }] },
        { name: "Mid", price: 20_000_000, size: 200, monthsAgo: 0, adjustments: [{ label: "x", pct: 1 }] },
        { name: "High", price: 24_000_000, size: 200, monthsAgo: 0, adjustments: [{ label: "x", pct: 3 }] },
      ],
    });
    expect(wide.rangePct).toBeGreaterThan(25);
    expect(wide.note).toContain("not agreeing on a value");
  });
});

describe("readGrid — how much evidence there is", () => {
  it("grades a set by the same floors the comps page uses", () => {
    expect(MIN_COMPS).toBe(3);
    expect(THIN_COMPS).toBe(5);
    expect(gridEvidence(0)).toBe("none");
    expect(gridEvidence(1)).toBe("individual");
    expect(gridEvidence(2)).toBe("individual");
    expect(gridEvidence(3)).toBe("thin");
    expect(gridEvidence(4)).toBe("thin");
    expect(gridEvidence(5)).toBe("usable");
  });

  it("one comp is a data point and the note says so — and still shows the figure", () => {
    const r = readGrid({ ...SEED, comps: SEED.comps.slice(0, 1) });
    expect(r.evidence).toBe("individual");
    expect(r.note).toContain("it is a data point");
    // The figure is never hidden: it is the evidence there is, and an
    // analyst who can see it decides for themselves.
    expect(r.indicatedValue).toBe(24_278_976);
  });

  it("two comps are two data points, said as a plural", () => {
    expect(readGrid({ ...SEED, comps: SEED.comps.slice(0, 2) }).note).toContain(
      "they are two data points",
    );
  });

  it("a comp with no price or no size is carried blank, never dropped silently", () => {
    const r = readGrid({
      ...SEED,
      comps: [{ ...SEED.comps[0], price: null }, ...SEED.comps.slice(1)],
    });
    expect(r.comps).toHaveLength(5);
    expect(r.comps[0].basisAdjusted).toBeNull();
    expect(r.comps[0].weightPct).toBeNull();
    expect(r.usableCount).toBe(4);
    expect(r.evidence).toBe("thin");
  });

  it("a size of zero is not a size", () => {
    expect(
      readGrid({ ...SEED, comps: [{ ...SEED.comps[0], size: 0 }, ...SEED.comps.slice(1)] })
        .usableCount,
    ).toBe(4);
  });

  it("refuses a paste rather than reconciling it", () => {
    const many = readGrid({
      ...SEED,
      comps: [...SEED.comps, ...SEED.comps, ...SEED.comps.slice(0, 3)],
    });
    expect(many.comps).toEqual([]);
    expect(many.indicatedValue).toBeNull();
    expect(many.note).toContain(`cut it to the ${MAX_COMPS}`);
  });
});

describe("readGrid — refusals and blanks", () => {
  it("names what an empty grid needs", () => {
    const r = readGrid({ ...SEED, comps: [] });
    expect(r.note).toContain("its price, its size and how long ago it sold");
    expect(r.evidence).toBe("none");
  });

  it("no comp with both a price and a size says that, not nothing", () => {
    const r = readGrid({
      ...SEED,
      comps: SEED.comps.map((c) => ({ ...c, price: null })),
    });
    expect(r.note).toContain("nothing to put on a per-unit basis");
    expect(r.comps).toHaveLength(5);
  });

  it("a blank is null, never zero", () => {
    const r = readGrid({ ...SEED, subjectSize: null });
    // The basis still reads; only the figures that need a size are withheld.
    expect(r.indicatedBasis).toBe(111_391.27);
    expect(r.indicatedValue).toBeNull();
    expect(r.askPremium).toBeNull();
    expect(r.signErrorValue).toBeNull();
    expect(r.timeAdjustmentValue).toBeNull();
    expect(r.conventionGap).toBeNull();
  });

  it("no ask is no comparison to one", () => {
    const r = readGrid({ ...SEED, askingPrice: null });
    expect(r.askPremium).toBeNull();
    expect(r.askPremiumPct).toBeNull();
    expect(r.askPremiumIfSignsReversedPct).toBeNull();
    // And every other figure is untouched by its absence.
    expect(r.indicatedValue).toBe(readGrid(SEED).indicatedValue);
  });

  it("an adjustment line with no percentage is not an adjustment of zero", () => {
    const r = readGrid({
      ...SEED,
      comps: [
        { ...SEED.comps[0], adjustments: [{ label: "Location", pct: null }] },
        ...SEED.comps.slice(1),
      ],
    });
    // Only the time adjustment remains in the gross, which is the honest
    // reading: a line left blank states nothing.
    expect(r.comps[0].netAdjustmentPct).toBe(0);
    expect(r.comps[0].grossAdjustmentPct).toBe(4);
  });

  it("every figure is finite, at every edge", () => {
    const edges: GridTerms[] = [
      SEED,
      { ...SEED, marketGrowthPct: -90 },
      { ...SEED, marketGrowthPct: 400 },
      { ...SEED, subjectSize: 0.0001 },
      { ...SEED, askingPrice: 1 },
      {
        ...SEED,
        comps: SEED.comps.map((c) => ({
          ...c,
          monthsAgo: 600,
          adjustments: [{ label: "x", pct: -99 }],
        })),
      },
    ];
    for (const t of edges) {
      const r = readGrid(t);
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "number") {
          expect(Number.isFinite(v), `${k} is not finite`).toBe(true);
          expect(Object.is(v, -0), `${k} is negative zero`).toBe(false);
        }
      }
      for (const c of r.comps) {
        for (const [k, v] of Object.entries(c)) {
          if (typeof v === "number") expect(Number.isFinite(v), `${c.name}.${k}`).toBe(true);
        }
      }
    }
  });
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
