import { describe, it, expect } from "vitest";
import { computeUnderwrite, type UnderwriteInputs } from "./engine";
import { runScenario } from "./playground";
import { buildCapGrowthGrid, heatBucket, heatCellText } from "./report-grid";

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
});

describe("heatBucket — the IC color scale", () => {
  it("buckets at the spec thresholds", () => {
    expect(heatBucket(0.151)).toBe("green");
    expect(heatBucket(0.15)).toBe("yellow"); // 10–15% band includes 15
    expect(heatBucket(0.1)).toBe("yellow");
    expect(heatBucket(0.0999)).toBe("orange");
    expect(heatBucket(0.05)).toBe("orange");
    expect(heatBucket(0.0499)).toBe("red");
    expect(heatBucket(-0.02)).toBe("red");
    expect(heatBucket(null)).toBe("none");
  });
});

describe("heatCellText", () => {
  it("formats 'IRR / EM' compactly", () => {
    expect(heatCellText({ irrPct: 0.152, em: 1.94 })).toBe("15.2% / 1.9x");
    expect(heatCellText({ irrPct: null, em: 1.2 })).toBe("— / 1.2x");
  });
});
