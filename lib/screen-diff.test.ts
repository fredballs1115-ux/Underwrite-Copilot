import { describe, expect, it } from "vitest";
import { computeScreenDiff, type PriorScreen } from "./screen-diff";

const m = (label: string, value: string, basis?: string) => ({ label, value, basis });

const prior = (metrics: ReturnType<typeof m>[], verdict = "caution"): PriorScreen => ({
  at: "2026-08-01T00:00:00Z",
  extraction: { metrics },
  verdict: { verdict },
});

describe("computeScreenDiff — the going-in cap tracker reads only the going-in cap", () => {
  it("tracks the cap on today's income, from the buyer's side", () => {
    const d = computeScreenDiff(
      prior([m("Going-in cap rate", "5.50%")]),
      { metrics: [m("Going-in cap rate", "5.20%")] },
      { verdict: "caution" },
    )!;
    const row = d.rows.find((r) => r.label === "Going-in cap")!;
    expect(row.before).toBe("5.50%");
    expect(row.after).toBe("5.20%");
    expect(row.delta).toBe("−0.30pt");
    expect(row.direction).toBe("worse");
  });

  it("never diffs a stabilized or pro forma cap as the going-in cap", () => {
    const d = computeScreenDiff(
      prior([m("Going-in cap (stabilized)", "7.0%")]),
      { metrics: [m("Going-in cap (stabilized)", "7.5%")] },
      null,
    );
    expect(d).toBeNull();
  });
});

describe("computeScreenDiff — a plan deal retrades on its plan", () => {
  const before = [
    m("Purchase price", "$20,000,000"),
    m("Stabilized NOI (pro forma)", "$21,000,000"),
    m("Total project cost", "$180,000,000"),
    m("Yield on cost", "11.7%"),
  ];
  const after = [
    m("Purchase price", "$20,000,000"),
    m("Stabilized NOI (pro forma)", "$19,500,000"),
    m("Total project cost", "$195,000,000"),
    m("Yield on cost", "10.0%"),
  ];
  const d = computeScreenDiff(prior(before), { metrics: after }, { verdict: "pass_on" })!;
  const by = Object.fromEntries(d.rows.map((r) => [r.label, r]));

  it("shows the finished project's NOI, the budget and the yield moving, each from the buyer's side", () => {
    expect(by["Asking price"].direction).toBe("flat");
    expect(by["Stabilized NOI (pro forma)"].delta).toBe("−$1.5M (−7.1%)");
    expect(by["Stabilized NOI (pro forma)"].direction).toBe("worse");
    expect(by["Total project cost"].delta).toBe("+$15.0M (+8.3%)");
    expect(by["Total project cost"].direction).toBe("worse");
    expect(by["Capital budget"]).toBeUndefined();
    expect(by["Yield on cost"].delta).toBe("−1.70pt");
    expect(by["Yield on cost"].direction).toBe("worse");
    expect(d.allFlat).toBe(false);
    expect(d.verdictChanged).toBe(true);
  });

  it("the stabilized figure never doubles as the in-place NOI or the going-in cap", () => {
    expect(by["NOI"]).toBeUndefined();
    expect(by["Going-in cap"]).toBeUndefined();
  });

  it("reads 'NOI (stabilized, pro forma)' too, and never a Year 1 NOI", () => {
    const stab = computeScreenDiff(
      prior([m("NOI (stabilized, pro forma)", "$21,000,000")]),
      { metrics: [m("NOI (stabilized, pro forma)", "$21,000,000")] },
      null,
    )!;
    expect(stab.rows.map((r) => r.label)).toEqual(["Stabilized NOI (pro forma)"]);
    expect(stab.allFlat).toBe(true);

    const yr1 = computeScreenDiff(
      prior([m("Year 1 NOI", "$1,000,000")]),
      { metrics: [m("Year 1 NOI", "$1,050,000")] },
      null,
    )!;
    expect(yr1.rows.map((r) => r.label)).toEqual(["NOI"]);
    expect(yr1.rows[0].direction).toBe("better");
  });

  it("the all-in total and the works alone are two figures, never paired as one retrade", () => {
    // Same deal, two extractions that named the cost differently: one carried
    // the total (with the price inside), the other the construction budget.
    // Pairing them would read the price as a $20M retrade.
    const d = computeScreenDiff(
      prior([m("Total project cost", "$180,000,000", "pro_forma")]),
      { metrics: [m("Construction budget", "$160,000,000", "pro_forma")] },
      null,
    );
    expect(d).toBeNull();

    const both = computeScreenDiff(
      prior([m("Total project cost", "$180,000,000"), m("Construction budget", "$160,000,000")]),
      { metrics: [m("Total project cost", "$190,000,000"), m("Construction budget", "$170,000,000")] },
      null,
    )!;
    const by = Object.fromEntries(both.rows.map((r) => [r.label, r]));
    expect(by["Total project cost"].delta).toBe("+$10.0M (+5.6%)");
    expect(by["Capital budget"].delta).toBe("+$10.0M (+6.3%)");
  });

  it("the stabilized NOI tracker reads the headline figure, never its per-unit expression", () => {
    const d = computeScreenDiff(
      prior([m("Stabilized NOI per unit", "$34,000"), m("Stabilized NOI (pro forma)", "$21,000,000")]),
      { metrics: [m("Stabilized NOI per unit", "$32,000"), m("Stabilized NOI (pro forma)", "$21,000,000")] },
      null,
    )!;
    expect(d.rows.map((r) => r.label)).toEqual(["Stabilized NOI (pro forma)"]);
    expect(d.allFlat).toBe(true);
  });
});

describe("computeScreenDiff — per-unit rows read the price, and the NOI row reads the NOI", () => {
  it("an insurance or rent per unit is never the 'Price / unit' row", () => {
    const d = computeScreenDiff(
      prior([m("Insurance per unit", "$1,100"), m("Price per unit", "$252,000")]),
      { metrics: [m("Insurance per unit", "$1,450"), m("Price per unit", "$240,000")] },
      null,
    )!;
    const row = d.rows.find((r) => r.label === "Price / unit")!;
    expect(row.before).toBe("$252,000");
    expect(row.delta).toBe("−$12k (−4.8%)");
    expect(row.direction).toBe("better");
  });

  it("an OM carrying only an NOI per unit adds no NOI row", () => {
    expect(
      computeScreenDiff(prior([m("NOI per unit", "$9,800")]), { metrics: [m("NOI per unit", "$9,200")] }, null),
    ).toBeNull();
  });
});

describe("computeScreenDiff — the asking price tracker reads the ask", () => {
  it("never reads what the building last traded for as the price", () => {
    const d = computeScreenDiff(
      prior([m("Last sale price (2019)", "$30,000,000"), m("Asking price", "$42,000,000")]),
      { metrics: [m("Last sale price (2019)", "$30,000,000"), m("Asking price", "$40,000,000")] },
      null,
    )!;
    const row = d.rows.find((r) => r.label === "Asking price")!;
    expect(row.before).toBe("$42,000,000");
    expect(row.delta).toBe("−$2.0M (−4.8%)");
    expect(row.direction).toBe("better");
  });
});

describe("computeScreenDiff — the Occupancy row is today's occupancy", () => {
  it("a stabilized occupancy never pairs as the Occupancy row", () => {
    expect(
      computeScreenDiff(
        prior([m("Stabilized occupancy", "95%")]),
        { metrics: [m("Stabilized occupancy", "96%")] },
        null,
      ),
    ).toBeNull();
    const d = computeScreenDiff(
      prior([m("Stabilized occupancy", "95%"), m("Current occupancy", "42%")]),
      { metrics: [m("Stabilized occupancy", "95%"), m("Current occupancy", "45%")] },
      null,
    )!;
    expect(d.rows.map((r) => r.label)).toEqual(["Occupancy"]);
    expect(d.rows[0].delta).toBe("+3.00pt");
    expect(d.rows[0].direction).toBe("better");
  });

  it("an 'NOI at stabilization' is the plan's NOI row, never today's", () => {
    const d = computeScreenDiff(
      prior([m("NOI at stabilization", "$5,600,000")]),
      { metrics: [m("NOI at stabilization", "$6,300,000")] },
      null,
    )!;
    expect(d.rows.map((r) => r.label)).toEqual(["Stabilized NOI (pro forma)"]);
    expect(d.rows[0].delta).toBe("+$700k (+12.5%)");
    expect(
      computeScreenDiff(prior([m("NOI at completion", "$5,600,000")]), { metrics: [m("NOI at completion", "$6,300,000")] }, null)!.rows.map(
        (r) => r.label,
      ),
    ).toEqual(["Stabilized NOI (pro forma)"]);
  });

  it("an occupancy cost or growth never pairs as the Occupancy row; a T-12 average does", () => {
    expect(
      computeScreenDiff(
        prior([m("Occupancy cost ratio", "12%")]),
        { metrics: [m("Occupancy cost ratio", "13%")] },
        null,
      ),
    ).toBeNull();
    expect(
      computeScreenDiff(prior([m("Occupancy growth", "2%")]), { metrics: [m("Occupancy growth", "3%")] }, null),
    ).toBeNull();
    const d = computeScreenDiff(
      prior([m("T-12 average occupancy", "91%")]),
      { metrics: [m("T-12 average occupancy", "93%")] },
      null,
    )!;
    expect(d.rows.map((r) => r.label)).toEqual(["Occupancy"]);
    expect(d.rows[0].delta).toBe("+2.00pt");
  });

  it("an 'Avg SF / unit' row ahead of the price per unit is never the 'Price / unit' row", () => {
    const d = computeScreenDiff(
      prior([m("Avg SF / unit", "912"), m("Price per unit", "$252,016")]),
      { metrics: [m("Avg SF / unit", "905"), m("Price per unit", "$240,000")] },
      null,
    )!;
    const row = d.rows.find((r) => r.label === "Price / unit")!;
    expect(row.before).toBe("$252,016");
    expect(row.after).toBe("$240,000");
    expect(row.direction).toBe("better");
  });
});
