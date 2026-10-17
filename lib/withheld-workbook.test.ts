// Research pass 40, H1: the deal page withholds the returns on a building the
// model runs 90% vacant or more, and beside a plausibility finding against
// them. The full report left only its max bid out for the nearly vacant
// building and printed both grids and the base case beside the page's
// withheld tiles; the underwriting workbook's Deal Summary printed every
// return under no word at all (a leased fee's 56.9% IRR read off the
// building's NOI). Both now say the page's own reason; the workbook keeps
// every formula live and shows the word over it. The fixtures are the pass's
// own; every name is invented.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import {
  buildSensitivityData,
  misreadPageLine,
  nearlyVacantPageLine,
  nearlyVacantReason,
  screeningCompareModel,
} from "@/lib/underwrite/report-grid";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { modelReturnsRead } from "@/lib/compare-interest";
import { assessPlausibility, inferStrategy } from "@/lib/deal-strategy";
import { buildReportData } from "@/lib/memo/report-document";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { ex, m } from "@/lib/pass38.fixture";

// The pass's leased fee: the building's NOI read as the land's income.
const LEASED_FEE = ex({
  dealName: "Fernwood Pad",
  assetClass: "retail",
  interest: { kind: "leased_fee", summary: "The leased fee", share: "", groundLease: "Ground lease to 2071", loan: "", page: "" },
  metrics: [m("Asking price", "$10,000,000"), m("Ground rent", "$400,000"), m("NOI", "$1,500,000"), m("Total SF", "60,000 SF")],
});
// The pass's nearly vacant office: 5% occupied, run at 95% vacancy.
const VACANT = ex({
  dealName: "1200 Corporate Drive",
  assetClass: "office",
  metrics: [m("Asking price", "$8,500,000"), m("Total SF", "42,000 SF"), m("Occupancy", "5%", "in_place"), m("NOI (in-place)", "$40,000")],
});
// The same building with an NOI its price can carry: no finding stands, and
// only the vacancy withholds.
const VACANT_ONLY = ex({
  dealName: "1200 Corporate Drive",
  assetClass: "office",
  metrics: [m("Asking price", "$8,500,000"), m("Total SF", "42,000 SF"), m("Occupancy", "5%", "in_place"), m("NOI (in-place)", "$500,000")],
});

const findingsOf = (x: ExtractionResult) => assessPlausibility(x, inferStrategy(x));

const reportOf = (x: ExtractionResult) => {
  const d = deriveUnderwriteInputs(x, "x");
  return {
    d,
    s: buildSensitivityData(d.inputs, null, {
      sources: d.sources,
      occupancyPct: d.meta.occupancyPct ?? null,
      interest: modelReturnsRead(x, screeningCompareModel(d.inputs)),
      findings: findingsOf(x),
    }),
  };
};

const workbookOf = async (x: ExtractionResult, withFindings = true) => {
  const d = deriveUnderwriteInputs(x, "x");
  const wb = new ExcelJS.Workbook();
  const buf = await buildUnderwriteWorkbook(d, null, null, null, new Date("2026-10-05T12:00:00Z"), withFindings ? findingsOf(x) : null);
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return { d, wb };
};

const WITHHELD_FMT = '"withheld";"withheld";"withheld";"withheld"';
const formulaOf = (c: ExcelJS.Cell) => (c.value as { formula?: string } | null)?.formula ?? null;
const rowOf = (ws: ExcelJS.Worksheet, col: number, text: string): number => {
  let found = 0;
  ws.eachRow((row, n) => {
    if (!found && String(row.getCell(col).value ?? "").trim() === text) found = n;
  });
  return found;
};

/** The Sensitivity tab's IRR and multiple matrices: every cell reading a
 *  scenario off the hidden engine tab. */
const sensMatrixCells = (ws: ExcelJS.Worksheet): ExcelJS.Cell[] => {
  const out: ExcelJS.Cell[] = [];
  ws.eachRow((row) => {
    row.eachCell((c) => {
      if (/Sensitivity Engine/.test(formulaOf(c) ?? "")) out.push(c);
    });
  });
  return out;
};

describe("the report leaves its grids out wherever the page withholds its tiles (research pass 40, H1)", () => {
  it("says the page's own reason for a building run nearly vacant — first, as the page does", () => {
    const { d, s } = reportOf(VACANT);
    const reason = nearlyVacantReason(d.inputs, d.meta.occupancyPct)!;
    // The page's own line over its tiles is the vacancy's, ahead of the
    // finding the same figures raise; the report had said the finding's.
    expect(nearlyVacantPageLine(d.inputs, d.meta.occupancyPct, { maxBid: false })).toBe(`The returns and the cap on year-1 NOI are withheld: ${reason}`);
    expect(s.withheld).toBe(`The IRR grids and the max bid are left out: ${reason}`);
    expect(s.readsStand).toBe(true);
  });

  it("leaves the grids and the base case out where only the vacancy stands, and keeps the model's reads", () => {
    expect(findingsOf(VACANT_ONLY).filter((f) => f.severity === "high" || f.code === "implied_cap_low")).toEqual([]);
    const { d, s } = reportOf(VACANT_ONLY);
    expect(d.inputs.vacancyPct).toBeCloseTo(0.95, 10);
    // It had printed both grids and a base case beside the page's withheld tiles.
    expect(s.withheld).toBe(`The IRR grids and the max bid are left out: ${nearlyVacantReason(d.inputs, d.meta.occupancyPct)}`);
    expect(s.readsStand).toBe(true);
    const deal = { name: "1200 Corporate Drive", asset_class: "office", extraction: VACANT_ONLY, challenges: null, comps: null, market: null, reconciliation: null, verdict: null, prior_screen: null } as unknown as DealRow;
    const input = buildReportData(deal, "October 5, 2026", [], s);
    expect(input.sensitivity).toBeNull();
    expect(input.withheld).toBe(s.withheld);
  });
});

describe("the workbook's Deal Summary says withheld over its live formulas (research pass 40, H1)", () => {
  it("marks a leased fee's returns withheld beside the finding the page withholds them under", async () => {
    const findings = findingsOf(LEASED_FEE);
    const page = misreadPageLine(findings, { maxBid: false })!;
    expect(page).toMatch(/^The returns are withheld: NOI of \$1\.5M is 3\.8× the \$400k ground rent on a leased fee/);
    const { wb } = await workbookOf(LEASED_FEE);
    const ws = wb.getWorksheet("Deal Summary")!;
    const lines: string[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string") lines.push(v);
    });
    const reason = page.replace(/^The returns are withheld: /, "");
    expect(lines).toContain(
      `The returns are withheld on the deal page, and the full report leaves its grids and max bid out: ${reason} The cells marked “withheld” keep their live formulas: give one a number format to read it.`,
    );
    // The four return tiles show the word over their formulas (the price
    // tile keeps its figure), and the Return Summary's returns with them.
    const tileRow = rowOf(ws, 2, "LEVERED IRR");
    expect(tileRow).toBeGreaterThan(0);
    for (const col of [2, 3, 4, 5]) {
      const c = ws.getCell(tileRow + 1, col);
      expect(formulaOf(c), `tile ${col}`).toBeTruthy();
      expect(c.numFmt, `tile ${col}`).toBe(WITHHELD_FMT);
    }
    expect(ws.getCell(tileRow + 1, 1).numFmt).not.toBe(WITHHELD_FMT);
    for (const lab of ["Unlevered IRR (before AM fee)", "Levered IRR", "Unlevered Equity Multiple (before AM fee)", "Levered Equity Multiple"]) {
      const c = ws.getCell(rowOf(ws, 4, lab), 5);
      expect(formulaOf(c), lab).toMatch(/IRR\(|SUM\(/);
      expect(c.numFmt, lab).toBe(WITHHELD_FMT);
    }
    // The cap on year-1 NOI stands beside a finding, as the page's cap does.
    expect(ws.getCell(rowOf(ws, 4, "Going-In Cap on the Land's Price (Yr-1 NOI / Price)"), 5).numFmt).toBe("0.00%");
    // The Sensitivity tab says whose grids they are, on its blank row.
    const sens = wb.getWorksheet("Sensitivity")!;
    expect(String(sens.getCell(3, 1).value)).toBe(
      "The deal page withholds this model's returns and the full report leaves its grids out — the Deal Summary says why.",
    );
    // And its matrices show the word over their live formulas: the centre
    // of "Exit Cap × Hold Period" is the very IRR the tiles withhold (audit
    // C4, L1).
    const matrix = sensMatrixCells(sens);
    expect(matrix.length).toBe(150);
    for (const c of matrix) {
      expect(formulaOf(c)).toBeTruthy();
      expect(c.numFmt).toBe(WITHHELD_FMT);
    }
    // No colour scale ranks the figures the word hides.
    expect((sens as unknown as { conditionalFormattings: unknown[] }).conditionalFormattings).toEqual([]);
  }, 45000);

  it("marks a nearly vacant building's returns and its cap on year-1 NOI, in the page's order", async () => {
    const { d, wb } = await workbookOf(VACANT);
    const ws = wb.getWorksheet("Deal Summary")!;
    const reason = nearlyVacantReason(d.inputs, d.meta.occupancyPct)!;
    const lines: string[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string") lines.push(v);
    });
    expect(lines).toContain(
      `The returns and the cap on year-1 NOI are withheld on the deal page, and the full report leaves its grids and max bid out: ${reason} The cells marked “withheld” keep their live formulas: give one a number format to read it.`,
    );
    for (const lab of ["Going-In Cap (Yr-1 NOI / Price)", "Year-1 Yield on Total Uses (before yr-1 capital)", "Levered IRR"]) {
      const c = ws.getCell(rowOf(ws, 4, lab), 5);
      expect(formulaOf(c), lab).toBeTruthy();
      expect(c.numFmt, lab).toBe(WITHHELD_FMT);
    }
    // The vacancy is the model's own: it is read with no findings handed in.
    const bare = await workbookOf(VACANT, false);
    expect(bare.wb.getWorksheet("Deal Summary")!.getCell(rowOf(bare.wb.getWorksheet("Deal Summary")!, 4, "Levered IRR"), 5).numFmt).toBe(WITHHELD_FMT);
  }, 45000);

  it("leaves a deal whose figures tie exactly as before", async () => {
    const fine = ex({
      dealName: "Fernwood Center",
      assetClass: "office",
      metrics: [m("Asking price", "$20,000,000"), m("NOI (in-place)", "$1,400,000", "in_place"), m("Total SF", "80,000 SF")],
    });
    expect(findingsOf(fine)).toEqual([]);
    const { wb } = await workbookOf(fine);
    const ws = wb.getWorksheet("Deal Summary")!;
    expect(ws.getCell(rowOf(ws, 4, "Levered IRR"), 5).numFmt).toBe("0.0%");
    expect(ws.getCell(rowOf(ws, 4, "Levered Equity Multiple"), 5).numFmt).toBe('0.00"x";"—";"—"');
    let said = false;
    ws.eachRow((row) => {
      if (/withheld on the deal page/.test(String(row.getCell(1).value ?? ""))) said = true;
    });
    expect(said).toBe(false);
    expect(wb.getWorksheet("Sensitivity")!.getCell(3, 1).value).toBeNull();
    const matrix = sensMatrixCells(wb.getWorksheet("Sensitivity")!);
    expect(matrix.length).toBe(150);
    expect(matrix.every((c) => c.numFmt === "0.0%" || c.numFmt === '0.00"x";"—";"—"')).toBe(true);
  }, 45000);
});

// Audit C4, M3: a retail leasehold whose ground lease ends Dec 31, 2028, read
// on Oct 5, 2026 — inside the model's five-year hold. The deal page's tiles
// read "n/a — lease ends in year 3" and the report leaves its grids out over
// the leasehold card's sentence; the workbook's Deal Summary had printed
// every return live under the generic leasehold caveat.
describe("the workbook withholds a leasehold whose lease ends inside the hold, as the page and the report do", () => {
  const AS_OF = new Date("2026-10-05T12:00:00Z");
  const LEASEHOLD = ex({
    dealName: "Fernwood Leasehold",
    assetClass: "retail",
    interest: {
      kind: "leasehold",
      summary: "The leasehold under a ground lease",
      share: "",
      groundLease: "Ground lease expires December 31, 2028; no extension options",
      loan: "",
      page: "",
    },
    metrics: [
      m("Asking price", "$10,000,000"),
      m("NOI (in-place)", "$950,000", "in_place"),
      m("Total SF", "60,000 SF"),
      m("Ground lease expiration", "December 31, 2028"),
    ],
  });

  it("marks the returns withheld over their live formulas, the leasehold card's sentence in the band", async () => {
    const d = deriveUnderwriteInputs(LEASEHOLD, "x", undefined, undefined, { asOf: AS_OF });
    const interest = modelReturnsRead(LEASEHOLD, screeningCompareModel(d.inputs), AS_OF);
    expect(interest.withheld).toBe("lease");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(d, null, null, null, AS_OF, findingsOf(LEASEHOLD), interest)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Deal Summary")!;
    const lines: string[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string") lines.push(v);
    });
    expect(lines).toContain(
      `The returns are withheld on the deal page, and the full report leaves its grids and max bid out. ${interest.line} The cells marked “withheld” keep their live formulas: give one a number format to read it.`,
    );
    const tileRow = rowOf(ws, 2, "LEVERED IRR");
    for (const col of [2, 3, 4, 5]) expect(ws.getCell(tileRow + 1, col).numFmt, `tile ${col}`).toBe(WITHHELD_FMT);
    const irr = ws.getCell(rowOf(ws, 4, "Levered IRR"), 5);
    expect(formulaOf(irr)).toMatch(/IRR\(/);
    expect(irr.numFmt).toBe(WITHHELD_FMT);
    // The cap on year-1 NOI stands, as the page's cap does.
    expect(ws.getCell(rowOf(ws, 4, "Going-In Cap (Yr-1 NOI / Price)"), 5).numFmt).toBe("0.00%");
  }, 45000);
});
