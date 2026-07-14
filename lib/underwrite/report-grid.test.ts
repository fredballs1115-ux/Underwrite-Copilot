import { describe, it, expect } from "vitest";
import { computeUnderwrite, type UnderwriteInputs } from "./engine";
import { runScenario } from "./playground";
import {
  buildCapGrowthGrid,
  buildPriceCapGrid,
  buildSensitivityData,
  gridTakeaway,
  heatBucket,
  heatLegend,
  heatCellIrr,
  heatCellEm,
  heatCellText,
  HEAT_BG,
} from "./report-grid";

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

describe("buildCapGrowthGrid", () => {
  const inputs = baseInputs();
  const grid = buildCapGrowthGrid(inputs);

  it("is 5×5 with the base at the center", () => {
    expect(grid.capRows).toHaveLength(5);
    expect(grid.growthCols).toHaveLength(5);
    expect(grid.cells).toHaveLength(5);
    expect(grid.cells.every((r) => r.length === 5)).toBe(true);
    expect(grid.capRows[grid.baseRow]).toBe(inputs.exitCapPct);
    expect(grid.growthCols[grid.baseCol]).toBe(inputs.rentGrowthPct);
  });

  it("center cell equals the untouched base model exactly", () => {
    const base = computeUnderwrite(inputs);
    const center = grid.cells[grid.baseRow][grid.baseCol];
    expect(center.irrPct).toBe(base.returns.leveredIrrPct);
    expect(center.em).toBe(base.returns.leveredEquityMultiple);
  });

  it("every cell equals an independent scenario run", () => {
    const m = runScenario(inputs, { exitCapPct: grid.capRows[0], rentGrowthPct: grid.growthCols[4] });
    expect(grid.cells[0][4].irrPct).toBe(m.leveredIrrPct);
    expect(grid.cells[0][4].em).toBe(m.leveredEquityMultiple);
  });

  it("IRR falls down the cap rows and rises across the growth columns", () => {
    for (let c = 0; c < 5; c++) {
      for (let r = 1; r < 5; r++) {
        expect(grid.cells[r][c].irrPct!).toBeLessThan(grid.cells[r - 1][c].irrPct!);
      }
    }
    for (let r = 0; r < 5; r++) {
      for (let c = 1; c < 5; c++) {
        expect(grid.cells[r][c].irrPct!).toBeGreaterThan(grid.cells[r][c - 1].irrPct!);
      }
    }
  });

  it("is deterministic", () => {
    expect(buildCapGrowthGrid(inputs)).toEqual(grid);
  });

  it("dedupes rows when the base cap sits at a lever bound", () => {
    // Cap 25% is the exitCapPct lever max: the two stops above the base
    // clamp onto it, so only 3 distinct cap rows survive — no repeated rows
    // in the printed grid, and the base row still points at the base value.
    const g = buildCapGrowthGrid(baseInputs({ exitCapPct: 0.25 }));
    expect(g.capRows).toEqual([0.245, 0.2475, 0.25]);
    expect(g.capRows[g.baseRow]).toBe(0.25);
    expect(g.cells).toHaveLength(3);
    expect(g.cells.every((r) => r.length === g.growthCols.length)).toBe(true);
    // Growth 3% is mid-range — its columns stay a full 5 wide.
    expect(g.growthCols).toHaveLength(5);
    expect(g.growthCols[g.baseCol]).toBe(0.03);
  });
});

describe("heatBucket — diverging around the buyer's hurdle", () => {
  it("steps every 3 points from the hurdle (default 15%)", () => {
    expect(heatBucket(0.21)).toBe("well_above"); // hurdle+6
    expect(heatBucket(0.209)).toBe("above");
    expect(heatBucket(0.18)).toBe("above"); // hurdle+3
    expect(heatBucket(0.15)).toBe("clears"); // the hurdle itself clears
    expect(heatBucket(0.1494)).toBe("close"); // prints "14.9%"
    expect(heatBucket(0.12)).toBe("close"); // hurdle−3
    expect(heatBucket(0.1194)).toBe("short"); // prints "11.9%"
    expect(heatBucket(0.09)).toBe("short"); // hurdle−6
    expect(heatBucket(0.0894)).toBe("deep_short"); // prints "8.9%"
    expect(heatBucket(-0.02)).toBe("deep_short");
    expect(heatBucket(null)).toBe("none");
  });

  it("re-anchors on a custom hurdle", () => {
    expect(heatBucket(0.13, 13)).toBe("clears");
    expect(heatBucket(0.1294, 13)).toBe("close"); // prints "12.9%"
    expect(heatBucket(0.19, 13)).toBe("well_above");
    expect(heatBucket(0.069, 13)).toBe("deep_short");
  });

  it("agrees with the printed 1dp number at band edges", () => {
    // 14.996% prints "15.0%" — must color as clearing a 15% hurdle.
    expect(heatBucket(0.14996)).toBe("clears");
    // 14.94% prints "14.9%" — below the printed hurdle → close.
    expect(heatBucket(0.1494)).toBe("close");
  });

  it("every bucket has a background", () => {
    for (const b of ["well_above", "above", "clears", "close", "short", "deep_short", "none"] as const) {
      expect(HEAT_BG[b]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("heatLegend", () => {
  it("spells the ranges against the actual hurdle", () => {
    const labels = heatLegend(13).map((l) => l.label);
    expect(labels).toEqual(["IRR 19%+", "16%–19%", "13%–16%", "10%–13%", "7%–10%", "< 7%"]);
  });

  it("stays WinAnsi-safe (standard Helvetica can't print ≥ or arrows)", () => {
    for (const l of heatLegend(15)) {
      expect(l.label).not.toMatch(/[≥≤→↓×]/);
    }
  });
});

describe("cell text", () => {
  it("splits IRR and EM lines", () => {
    expect(heatCellIrr({ irrPct: 0.152, em: 1.94 })).toBe("15.2%");
    expect(heatCellEm({ irrPct: 0.152, em: 1.94 })).toBe("1.9x");
    expect(heatCellIrr({ irrPct: null, em: 1.2 })).toBe("—");
    expect(heatCellText({ irrPct: 0.152, em: 1.94 })).toBe("15.2% / 1.9x");
  });

  it("never prints negative zero", () => {
    expect(heatCellIrr({ irrPct: -0.0004, em: 0.99 })).toBe("0.0%");
    expect(heatCellIrr({ irrPct: -0.031, em: 0.8 })).toBe("-3.1%");
  });
});

describe("buildPriceCapGrid — the retrade grid", () => {
  const inputs = baseInputs();
  const grid = buildPriceCapGrid(inputs);

  it("is 5 price rows (±10% in 5% steps) × the cap stops, base centered", () => {
    expect(grid.priceRows.map((p) => p.deltaPct)).toEqual([-0.1, -0.05, 0, 0.05, 0.1]);
    expect(grid.priceRows[grid.baseRow].price).toBe(inputs.purchasePrice);
    expect(grid.capCols[grid.baseCol]).toBe(inputs.exitCapPct);
    expect(grid.cells).toHaveLength(5);
  });

  it("base cell equals the untouched base model exactly", () => {
    const base = computeUnderwrite(inputs);
    const center = grid.cells[grid.baseRow][grid.baseCol];
    expect(center.irrPct).toBe(base.returns.leveredIrrPct);
    expect(center.em).toBe(base.returns.leveredEquityMultiple);
  });

  it("IRR rises as the price falls, at every cap", () => {
    for (let c = 0; c < grid.capCols.length; c++) {
      for (let r = 1; r < grid.priceRows.length; r++) {
        expect(grid.cells[r][c].irrPct!).toBeLessThan(grid.cells[r - 1][c].irrPct!);
      }
    }
  });
});

describe("gridTakeaway", () => {
  const inputs = baseInputs();
  const grid = buildCapGrowthGrid(inputs);

  it("names the flip points and matches the grid's own cells", () => {
    const line = gridTakeaway(grid, 12);
    expect(line).toMatch(/12%/);
    // Cross-check one leg by hand: max cap clearing 12% at the base growth col.
    const clearingCaps = grid.capRows.filter(
      (_, r) =>
        Number((grid.cells[r][grid.baseCol].irrPct! * 100).toFixed(1)) >= 12,
    );
    if (clearingCaps.length > 0 && clearingCaps.length < grid.capRows.length) {
      expect(line).toContain(`${(Math.max(...clearingCaps) * 100).toFixed(2)}%`);
    }
  });

  it("handles the all-clear and none-clear extremes", () => {
    expect(gridTakeaway(grid, 0.1)).toMatch(/every tested/i);
    expect(gridTakeaway(grid, 99)).toMatch(/no tested/i);
  });

  it("is WinAnsi-safe", () => {
    for (const h of [0.1, 12, 15, 99]) {
      expect(gridTakeaway(grid, h)).not.toMatch(/[≥≤→↓]/);
    }
  });
});

describe("buildSensitivityData", () => {
  const inputs = baseInputs();

  it("bundles both grids, the hurdle, the takeaway, and a max bid", () => {
    const s = buildSensitivityData(inputs, 12);
    expect(s.hurdlePct).toBe(12);
    expect(s.hurdleSource).toBe("buybox");
    expect(s.grid.cells.length).toBeGreaterThan(0);
    expect(s.priceGrid.cells.length).toBe(5);
    expect(s.takeaway).toMatch(/12%/);
    // A max bid holding 12% IRR exists for this model and prices below a
    // 12%-clearing point exist in the search range.
    expect(s.maxBid).not.toBeNull();
    expect(s.maxBid!.price).toBeGreaterThan(0);
  });

  it("falls back to the 15% default hurdle when the box has none", () => {
    const s = buildSensitivityData(inputs, null);
    expect(s.hurdlePct).toBe(15);
    expect(s.hurdleSource).toBe("default");
  });
});
