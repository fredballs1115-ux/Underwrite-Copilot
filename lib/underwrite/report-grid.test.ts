import { describe, it, expect } from "vitest";
import { computeUnderwrite, type UnderwriteInputs } from "./engine";
import { deriveUnderwriteInputs } from "./inputs";
import { runScenario, sliderValues } from "./playground";
import { bidFloors, fmtBid, solveMaxBid } from "./solver";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import {
  buildBaseCase,
  buildCapGrowthGrid,
  buildPriceCapGrid,
  buildSensitivityData,
  gridTakeaway,
  heatBucket,
  heatLegend,
  heatCellIrr,
  heatCellEm,
  heatCellText,
  maxBidSentence,
  pageBaseLevers,
  placeholderPageLine,
  placeholderReason,
  placeholderReturnsLine,
  placeholderWorkbookLine,
  HEAT_BG,
  type CapGrowthGrid,
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

describe("gridTakeaway says two full clauses, each with its own subject (research pass 35)", () => {
  // A grid built by hand: the IRR, in percent, at each exit cap (rows) and
  // growth rate (columns), the base at the centre.
  const at = (irr: (r: number, c: number) => number): CapGrowthGrid => ({
    capRows: [0.05, 0.0525, 0.055, 0.0575, 0.06],
    growthCols: [0.02, 0.025, 0.03, 0.035, 0.04],
    cells: [0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => ({ irrPct: irr(r, c) / 100, em: 1.5 }))),
    baseRow: 2,
    baseCol: 2,
  });
  // Clears 13% up to the 5.25% exit at base growth, and from 3.5% growth at
  // the base exit.
  const ordinary = at((r, c) => 13 + (c - 2) - (r - 1));

  it("the ordinary case: the deal holds up to a cap, and needs a growth rate", () => {
    expect(gridTakeaway(ordinary, 13)).toBe(
      "At base growth, the deal holds 13%+ up to a 5.25% exit cap; at the base exit cap, it needs at least 3.5% rent growth.",
    );
  });

  it("no tested exit cap clears the hurdle: no 'The deal no tested …'", () => {
    // Neither lever clears it (the pass's portfolio).
    expect(gridTakeaway(at(() => 5), 13)).toBe(
      "At base growth, no tested exit cap clears 13%; at the base exit cap, no tested rent growth clears it.",
    );
    // No cap clears at base growth, a faster RevPAR does at the base cap (the pass's hotel).
    expect(gridTakeaway(at((r, c) => 12 - (r - 2) * 0.4 + (c - 2) * 1.5), 13, "RevPAR growth")).toBe(
      "At base growth, no tested exit cap clears 13%; at the base exit cap, the deal needs at least 3.5% RevPAR growth.",
    );
  });

  it("every tested exit cap clears the hurdle: no 'The deal every tested …'", () => {
    expect(gridTakeaway(at(() => 30), 13)).toBe(
      "At base growth, every tested exit cap clears 13%; at the base exit cap, every tested growth rate clears it.",
    );
  });

  it("after a clause that names the deal, the hurdle is said again rather than as 'it'", () => {
    expect(gridTakeaway(at((r, c) => 13 - (r - 1) + (c - 2) * 0.1), 13)).toBe(
      "At base growth, the deal holds 13%+ up to a 5.25% exit cap; at the base exit cap, no tested rent growth clears 13%.",
    );
  });

  it("leads with what the grids are of where the price did not buy the building, and never calls it the deal", () => {
    const subject = "the collateral, run at the note's price";
    expect(gridTakeaway(ordinary, 13, "rent growth", subject)).toBe(
      "The collateral, run at the note's price: at base growth, it holds 13%+ up to a 5.25% exit cap; at the base exit cap, it needs at least 3.5% rent growth.",
    );
    expect(gridTakeaway(at(() => 5), 13, "rent growth", subject)).toBe(
      "The collateral, run at the note's price: at base growth, no tested exit cap clears 13%; at the base exit cap, no tested rent growth clears it.",
    );
    for (const irr of [() => 5, () => 30, (r: number, c: number) => 13 + (c - 2) - (r - 1)]) {
      expect(gridTakeaway(at(irr), 13, "rent growth", subject)).not.toMatch(/the deal/i);
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

describe("the report's max bid is the deal page's — the buy box's every floor, the binding one named", () => {
  // The demo page's own model and mandate (lib/sample-derive, SAMPLE_DEMO_BOX).
  const derived = sampleDerivedInputs();
  const inputs = derived.inputs;

  it("solves the page's own call: every floor the box sets, under the sliders' base stops", () => {
    const floors = bidFloors(SAMPLE_DEMO_BOX)!;
    // The playground's call, spelled out as it makes it.
    const stop = (lever: "exitCapPct" | "rentGrowthPct" | "vacancyPct") => {
      const s = sliderValues(lever, inputs[lever]);
      return s.values[s.baseIdx];
    };
    const page = solveMaxBid(inputs, floors, { exitCapPct: stop("exitCapPct"), rentGrowthPct: stop("rentGrowthPct"), vacancyPct: stop("vacancyPct") });
    const report = buildSensitivityData(inputs, SAMPLE_DEMO_BOX.minIrrPct ?? null, { floors });
    expect(report.maxBid?.price).toBe(page.price);
    expect(report.maxBid?.binding).toBe(page.binding);
    expect(report.maxBidFloors).toEqual({ floors, from: "buybox" });
    // The IRR floor alone — what the report solved before — clears a higher
    // price: the cash-on-cash floor binds first on the sample.
    const irrOnly = solveMaxBid(inputs, { minIrr: 0.13 });
    expect(page.binding).toBe("minCoc");
    expect(irrOnly.price!).toBeGreaterThan(page.price!);
  });

  it("says the bid as the page prints it, with the floors it clears and the one that binds", () => {
    const s = buildSensitivityData(inputs, SAMPLE_DEMO_BOX.minIrrPct ?? null, { floors: bidFloors(SAMPLE_DEMO_BOX) });
    const line = maxBidSentence(s);
    expect(line).toMatch(
      new RegExp(
        `^Max bid clearing your buy box's floors \\(13% IRR, 5% cash-on-cash, 5\\.75% going-in cap\\): \\${fmtBid(s.maxBid!.price).replace(".", "\\.")} \\(-\\d+\\.\\d% vs the modeled price\\); your 5% cash-on-cash floor binds\\. At that price: IRR \\d+\\.\\d%, year-1 cash-on-cash 5\\.0%, going-in cap \\d\\.\\d\\d%\\.$`,
      ),
    );
  });

  it("falls back to the screening hurdle's IRR where the box sets no floor, and says whose it is", () => {
    const none = buildSensitivityData(inputs, null, { floors: null });
    expect(none.maxBidFloors).toEqual({ floors: { minIrr: 0.15 }, from: "screening" });
    expect(maxBidSentence(none)).toMatch(/^Max bid holding the 15% screening hurdle: \$[\d.]+M \([-+]?\d+\.\d% vs the modeled price\)\./);
    // A caller that passes the box's IRR as the hurdle and no floors says
    // it is the buyer's target, not the screening default.
    expect(maxBidSentence(buildSensitivityData(inputs, 13))).toMatch(/^Max bid holding your 13% IRR target: /);
    // Nothing clears: the box's floors named, and why.
    expect(maxBidSentence({ ...none, maxBid: null, maxBidFloors: { floors: { minCoc: 0.5 }, from: "buybox" } })).toBe(
      "No price inside the tested range clears your buy box's floors (50% cash-on-cash) under these assumptions: the deal's economics, not its price, are the blocker.",
    );
  });
});

describe("where no price clears the box's floors together, the sentence names which floor never clears and how far the others clear alone (research pass 35)", () => {
  const floors = { minIrr: 0.1, minCoc: 0.05, minCap: 0.05 };

  it("names the cash-on-cash floor year 1's capital puts out of reach, and solves each other floor alone", () => {
    // $625k of year-1 NOI against $800k of first-year capital and $20k of
    // reserves: year 1's cash flow is negative whatever the price.
    const inputs = baseInputs({ capitalImprovementsYr1: 800_000 });
    const s = buildSensitivityData(inputs, 10, { floors });
    expect(s.maxBid).toBeNull();
    // Each floor's own solve, under the bid's own levers — never asserted.
    const levers = pageBaseLevers(inputs);
    const irr = solveMaxBid(inputs, { minIrr: 0.1 }, levers);
    const cap = solveMaxBid(inputs, { minCap: 0.05 }, levers);
    expect(solveMaxBid(inputs, { minCoc: 0.05 }, levers).price).toBeNull();
    expect(irr.price).not.toBeNull();
    expect(cap.price).not.toBeNull();
    expect(s.noBid).toEqual({
      alone: [
        { key: "minIrr", price: irr.price, unbounded: false },
        { key: "minCoc", price: null, unbounded: false },
        { key: "minCap", price: cap.price, unbounded: false },
      ],
      yearOneNegative: true,
      yearOneCapital: 800_000,
    });
    expect(maxBidSentence(s)).toBe(
      `No price inside the tested range clears your 5% cash-on-cash floor: year 1 carries $800k of capital, which leaves its cash flow negative at any price. Your 10% IRR floor alone clears up to ${fmtBid(irr.price!)}, and your 5% going-in cap floor alone up to ${fmtBid(cap.price!)}.`,
    );
    expect(maxBidSentence(s)).not.toContain("the deal's economics, not its price");
  });

  it("names no capital where the year's other capital lines already outrun its NOI", () => {
    // $1M of reserves a year over $625k of NOI: negative with no budget at all.
    const s = buildSensitivityData(baseInputs({ reservesPsf: 10 }), 10, { floors });
    expect(s.noBid?.yearOneNegative).toBe(true);
    expect(s.noBid?.yearOneCapital).toBeNull();
    expect(maxBidSentence(s)).toMatch(/^No price inside the tested range clears your 5% cash-on-cash floor: year 1's cash flow is negative at any price\. /);
  });

  it("reads nothing where a bid solves, or the box sets no floor", () => {
    expect(buildSensitivityData(baseInputs(), 10, { floors }).noBid).toBeNull();
    expect(buildSensitivityData(baseInputs({ capitalImprovementsYr1: 800_000 }), 10).noBid).toBeNull();
  });
});

describe("buildBaseCase — the base case the grids are struck around, as the workbook's Deal Summary holds it", () => {
  it("carries the engine's own figures and the derived model's own sources", () => {
    const derived = sampleDerivedInputs();
    const b = buildBaseCase(derived.inputs, derived.sources);
    const uw = computeUnderwrite(derived.inputs);
    const y1 = uw.cashFlow[0];
    expect(b.price).toBe(derived.inputs.purchasePrice);
    expect(b.loan).toBe(uw.sourcesUses.loanAmount);
    expect(b.equity).toBe(uw.sourcesUses.equity);
    expect(b.totalUses).toBe(uw.sourcesUses.totalUses);
    expect(b.loan + b.equity).toBeCloseTo(b.totalUses, 6);
    expect(b.price + b.closingCosts + b.acqFee + b.financingCosts).toBeCloseTo(b.totalUses, 6);
    expect(b.noiY1).toBe(y1.noi);
    expect(b.leveredIrr).toBe(uw.returns.leveredIrrPct);
    expect(b.equityMultiple).toBe(uw.returns.leveredEquityMultiple);
    expect(b.cocY1).toBeCloseTo(y1.leveredCashFlow / uw.sourcesUses.equity, 12);
    expect(b.dscrY1).toBe(y1.dscrNoi);
    expect(b.debtYieldY1).toBe(y1.debtYield);
    expect(b.holdYears).toBe(5);
    // Each input's own source: the ask the OM states, the defaults said as
    // defaults, the NOI from the T-12 the sample carries.
    expect(b.priceSource?.provenance).toBe("extracted");
    expect(b.ltcSource?.provenance).toBe("assumption");
    expect(b.holdSource?.provenance).toBe("assumption");
    expect(b.rateSource?.provenance).toBe("assumption");
    expect(b.noiSource?.note).toMatch(/^Grossed up from the T-12 actual NOI/);
    expect(b.costLine).toMatch(/^These returns carry a 1\.0% closing hold and a 2\.0% cost of sale/);
    // Only a caller that gives the sources gets one.
    expect(buildSensitivityData(derived.inputs, 13).baseCase).toBeNull();
    expect(buildSensitivityData(derived.inputs, 13, { sources: derived.sources }).baseCase).toEqual(b);
  });
});

describe("placeholderReturnsLine — a model on a placeholder prints none of its returns", () => {
  const x = (provenance: "extracted" | "derived" | "assumption") => ({ provenance, note: "" });
  const inputs = baseInputs();

  it("says why from the sources alone: a placeholder price, an assumed NOI, or both", () => {
    expect(placeholderReturnsLine(inputs, { purchasePrice: x("assumption"), inPlaceRentAnnual: x("derived") })).toBe(
      "The IRR grids and the max bid are left out: no price was read from the memorandum, so the model runs on a $10,000,000 placeholder and its returns would be the placeholder's.",
    );
    expect(placeholderReturnsLine(inputs, { purchasePrice: x("extracted"), inPlaceRentAnnual: x("assumption") })).toBe(
      "The IRR grids and the max bid are left out: no year-1 NOI the model could run on was read from the memorandum, so the model runs on an assumed one and its returns would be the assumption's.",
    );
    expect(placeholderReturnsLine(inputs, { purchasePrice: x("assumption"), inPlaceRentAnnual: x("assumption") })).toMatch(
      /^The IRR grids and the max bid are left out: no price was read from the memorandum, nor a year-1 NOI the model could run on/,
    );
  });

  it("prints the returns of a model whose price and NOI came from the documents, a derivation included", () => {
    expect(placeholderReturnsLine(inputs, { purchasePrice: x("extracted"), inPlaceRentAnnual: x("derived") })).toBeNull();
    // An auction's floor, a share grossed up, NOI over the going-in cap.
    expect(placeholderReturnsLine(inputs, { purchasePrice: x("derived"), inPlaceRentAnnual: x("derived") })).toBeNull();
    // A caller that passed no sources is read as before.
    expect(placeholderReturnsLine(inputs, null)).toBeNull();
    expect(buildSensitivityData(inputs, null).withheld).toBeNull();
  });

  it("reads the derived model's own sources: an unpriced memorandum's model is a placeholder's", () => {
    const unpriced = deriveUnderwriteInputs(
      {
        dealName: "Unpriced",
        assetClass: "multifamily",
        metrics: [
          { label: "Asking price", value: "Unpriced — call for offers", flagged: false, page: "p. 2" },
          { label: "NOI (in-place)", value: "$3,880,000", flagged: false, page: "p. 8" },
        ],
      },
      "Unpriced",
    );
    expect(unpriced.sources.purchasePrice?.provenance).toBe("assumption");
    expect(buildSensitivityData(unpriced.inputs, null, { sources: unpriced.sources }).withheld).toMatch(
      /^The IRR grids and the max bid are left out: no price was read/,
    );
    const priced = deriveUnderwriteInputs(
      {
        dealName: "Priced",
        assetClass: "multifamily",
        metrics: [
          { label: "Asking price", value: "$60,000,000", flagged: false, page: "p. 2" },
          { label: "NOI (in-place)", value: "$3,300,000", flagged: false, page: "p. 8" },
        ],
      },
      "Priced",
    );
    expect(buildSensitivityData(priced.inputs, null, { sources: priced.sources }).withheld).toBeNull();
  });

  it("says one reason on three surfaces: the report and the deal page withhold the returns, the workbook prints them live (research pass 34)", () => {
    const price = { purchasePrice: x("assumption"), inPlaceRentAnnual: x("derived") };
    const noi = { purchasePrice: x("extracted"), inPlaceRentAnnual: x("assumption") };
    expect(placeholderReason(inputs, price)).toBe(
      "no price was read from the memorandum, so the model runs on a $10,000,000 placeholder and its returns would be the placeholder's.",
    );
    // The deal page: the reason over the tiles, the max bid named only where
    // a floor would solve one, and the price field named while it is empty.
    expect(placeholderPageLine(inputs, price, { priceEntered: false, maxBid: true })).toBe(
      "The returns and the max bid are withheld: no price was read from the memorandum, so the model runs on a $10,000,000 placeholder and its returns would be the placeholder's. Type the price you would pay above to run the model on it.",
    );
    expect(placeholderPageLine(inputs, price, { priceEntered: false, maxBid: false })).toMatch(/^The returns are withheld: /);
    // A price typed lifts the price's half; an assumed NOI stays.
    expect(placeholderPageLine(inputs, price, { priceEntered: true, maxBid: true })).toBeNull();
    expect(placeholderPageLine(inputs, noi, { priceEntered: true, maxBid: false })).toBe(
      "The returns are withheld: no year-1 NOI the model could run on was read from the memorandum, so the model runs on an assumed one and its returns would be the assumption's.",
    );
    // The workbook prints them, live: "are", and the input to replace.
    expect(placeholderWorkbookLine(inputs, price)).toBe(
      "No price was read from the memorandum, so the model runs on a $10,000,000 placeholder and its returns are the placeholder's. Enter the price you would pay as the Purchase Price on the Assumptions tab.",
    );
    expect(placeholderWorkbookLine(inputs, noi)).toBe(
      "No year-1 NOI the model could run on was read from the memorandum, so the model runs on an assumed one and its returns are the assumption's.",
    );
    expect(placeholderWorkbookLine(inputs, { purchasePrice: x("extracted"), inPlaceRentAnnual: x("derived") })).toBeNull();
    expect(placeholderWorkbookLine(inputs, null)).toBeNull();
  });

  it("names a leased fee's ground rent rather than saying no year-1 income was read (research pass 34)", () => {
    // The memorandum states the ground rent, the leased fee's income; the
    // model reads no ground rent and ran an assumed NOI.
    const rent = { provenance: "assumption" as const, note: "", notRun: { label: "ground rent", value: 600_000 } };
    expect(placeholderReturnsLine(inputs, { purchasePrice: x("extracted"), inPlaceRentAnnual: rent })).toBe(
      "The IRR grids and the max bid are left out: the model does not run the memorandum's $600,000 ground rent as its year-1 income, so it runs on an assumed NOI and its returns would be the assumption's.",
    );
    expect(placeholderReturnsLine(inputs, { purchasePrice: x("assumption"), inPlaceRentAnnual: rent })).toBe(
      "The IRR grids and the max bid are left out: no price was read from the memorandum, and the model does not run its $600,000 ground rent as its year-1 income, so the model runs on a $10,000,000 placeholder price and an assumed NOI, and its returns would be a placeholder's.",
    );
    // The derived model's own sources carry it.
    const fee = deriveUnderwriteInputs(
      {
        dealName: "Leased fee",
        assetClass: "retail",
        interest: { kind: "leased_fee", summary: "", share: "", groundLease: "", loan: "", page: "" },
        metrics: [
          { label: "Asking price", value: "$15,000,000", flagged: false, page: "p. 2" },
          { label: "Ground rent", value: "$600,000", flagged: false, page: "p. 4" },
          { label: "Income before ground rent", value: "$3,000,000", flagged: false, page: "p. 6" },
        ],
      },
      "Leased fee",
    );
    const line = buildSensitivityData(fee.inputs, null, { sources: fee.sources }).withheld;
    expect(line).toContain("the model does not run the memorandum's $600,000 ground rent as its year-1 income");
    expect(line).not.toContain("no year-1 NOI");
  });
});
