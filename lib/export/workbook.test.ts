import { describe, expect, it, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRentRollWorkbook, colLetter, isoToSerial } from "./workbook";
import { buildRentRollCashFlow, pmt, type WorkbookInputs } from "./cashflow";
import { parseCsv, suggestMapping, toLeases } from "@/lib/rentroll/parse";
import { PROFILE_DEFAULTS, normalizeProfile } from "@/lib/rentroll/profiles";
import { CLEAN_CSV } from "@/lib/rentroll/__fixtures__";
import type { Lease } from "@/lib/rentroll/schema";

const grid = parseCsv(CLEAN_CSV);
const LEASES: Lease[] = toLeases(grid, suggestMapping(grid)).leases;

const INPUTS: WorkbookInputs = {
  dealName: "Northgate Commerce Center",
  asOf: "2026-01-01",
  nra: 100_000,
  purchasePrice: 18_000_000,
  closingCostPct: 0.015,
  otherIncomeAnnual: 45_000,
  vacancyPct: 0.05,
  opexPsf: 3.2,
  expenseGrowthPct: 0.03,
  reimbursementPct: 0.9,
  mgmtFeePct: 0.03,
  reservesPsf: 0.15,
  capitalImprovementsYr1: 250_000,
  profile: normalizeProfile({ ...PROFILE_DEFAULTS.industrial, marketRentPsf: 14 }),
  absorptionSfPerMonth: 2_500,
  exitCapPct: 0.065,
  saleCostPct: 0.02,
  holdYears: 10,
  ltc: 0.6,
  allInRatePct: 0.06,
  ioMonths: 24,
  amortMonths: 360,
  financingCostPct: 0.01,
};

// ---------------------------------------------------------------------------
// HyperFormula harness — loads the real .xlsx and evaluates its formula graph.
// ---------------------------------------------------------------------------

interface CellVal {
  formula?: string;
  result?: unknown;
  richText?: { text: string }[];
}

function cellToHf(v: unknown): number | string | boolean | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  // exceljs reads a number cell carrying a date format back as a Date. On
  // disk it is an Excel serial, which is what the formulas do arithmetic on —
  // so convert it back rather than handing HyperFormula a string.
  if (v instanceof Date) return Math.round((v.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000);
  const o = v as CellVal;
  if (o.formula != null) return `=${o.formula}`;
  if (o.richText) return o.richText.map((r) => r.text).join("");
  if (o.result !== undefined) return o.result as number | string;
  return null;
}

async function loadWorkbook(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheets: Record<string, (number | string | boolean | null)[][]> = {};
  const sheetNames: string[] = [];
  wb.eachSheet((ws) => {
    sheetNames.push(ws.name);
    const rows: (number | string | boolean | null)[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row: (number | string | boolean | null)[] = [];
      for (let c = 1; c <= ws.columnCount; c++) row.push(cellToHf(ws.getCell(r, c).value));
      rows.push(row);
    }
    sheets[ws.name] = rows;
  });
  const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3" });
  const sheetId = (name: string) => sheetNames.indexOf(name);
  const value = (sheet: string, row: number, col: number) =>
    hf.getCellValue({ sheet: sheetId(sheet), row: row - 1, col: col - 1 });
  const setValue = (sheet: string, row: number, col: number, v: number) =>
    hf.setCellContents({ sheet: sheetId(sheet), row: row - 1, col: col - 1 }, v);
  return { wb, hf, value, setValue };
}

/** Row numbers on the Cash Flow tab that the assertions address. */
const CF_ROW = {
  noi: 18,
  cfbd: 24,
  leveredCf: 28,
  leveredVector: 40,
  unleveredIrr: 42,
  leveredIrr: 43,
  equityMultiple: 45,
};
const ASSUM_EXIT_CAP_ROW = 36;

let buffer: Buffer;
const model = buildRentRollCashFlow(LEASES, INPUTS);

beforeAll(async () => {
  buffer = await buildRentRollWorkbook(LEASES, INPUTS);
}, 30_000);

describe("buildRentRollWorkbook — structure", () => {
  it("writes the four tabs the phase specifies", async () => {
    const { wb } = await loadWorkbook(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Assumptions",
      "Rent Roll",
      "Rollover",
      "Cash Flow",
    ]);
  });

  it("the Rollover tab's SF-expiring and leasing-capital columns carry data bars over the year rows only", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Rollover")!;
    const cfs = (
      ws as unknown as { conditionalFormattings: { ref: string; rules: { type: string; cfvo?: { type: string }[] }[] }[] }
    ).conditionalFormattings;
    const bars = cfs.filter((cf) => cf.rules.some((r) => r.type === "dataBar"));
    // Year rows 4 through 14 (a ten-year hold plus the forward year); the
    // Total row (15) draws no bar.
    expect(bars.map((cf) => cf.ref).sort()).toEqual(["C4:C14", "M4:M14"]);
    for (const cf of bars) {
      const rule = cf.rules.find((r) => r.type === "dataBar")!;
      expect(rule.cfvo?.map((c) => c.type)).toEqual(["min", "max"]);
    }
    expect(ws.getCell(15, 1).value).toBe("Total");
  });

  it("the Cash Flow tab's NOI and levered cash-flow rows carry data bars over the operating years only", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Cash Flow")!;
    const cfs = (
      ws as unknown as { conditionalFormattings: { ref: string; rules: { type: string }[] }[] }
    ).conditionalFormattings;
    const bars = cfs.filter((cf) => cf.rules.some((r) => r.type === "dataBar"));
    // Years 1–10 sit in C..L; the reversion column (M) and the return
    // vectors (rows 39–40, which carry the sale) draw no bar.
    expect(bars.map((cf) => cf.ref).sort()).toEqual([`C${CF_ROW.noi}:L${CF_ROW.noi}`, `C${CF_ROW.leveredCf}:L${CF_ROW.leveredCf}`].sort());
  });

  it("never writes a computed value where a formula belongs", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const cf = wb.getWorksheet("Cash Flow")!;
    // Every operating line across every year column must be a formula.
    for (const row of [CF_ROW.noi, CF_ROW.cfbd, CF_ROW.leveredCf]) {
      for (let c = 3; c <= 13; c++) {
        const v = cf.getCell(row, c).value as CellVal | null;
        expect(v, `Cash Flow!${colLetter(c)}${row}`).toBeTruthy();
        expect(v!.formula, `Cash Flow!${colLetter(c)}${row}`).toBeTruthy();
      }
    }
    // The headline returns too.
    for (const row of [CF_ROW.unleveredIrr, CF_ROW.leveredIrr, CF_ROW.equityMultiple]) {
      expect((cf.getCell(row, 2).value as CellVal).formula).toBeTruthy();
    }
    // …and the Rent Roll's derived columns, which must not be pre-computed.
    const roll = wb.getWorksheet("Rent Roll")!;
    for (let r = 4; r < 4 + LEASES.length; r++) {
      for (const c of [7, 10, 11, 12, 13]) {
        expect((roll.getCell(r, c).value as CellVal)?.formula, `Rent Roll!${colLetter(c)}${r}`).toBeTruthy();
      }
    }
  });

  it("uses native Excel IRR, XIRR and an equity-multiple formula", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const cf = wb.getWorksheet("Cash Flow")!;
    // The native function, wrapped so flows no rate solves read a sentence
    // rather than an error code (research pass 35).
    expect((cf.getCell(CF_ROW.leveredIrr, 2).value as CellVal).formula).toMatch(/^IFERROR\(IRR\(B40:L40\),/);
    expect((cf.getCell(CF_ROW.unleveredIrr, 2).value as CellVal).formula).toMatch(/^IFERROR\(IRR\(B39:L39\),/);
    // HyperFormula has no XIRR, so the recalculation assertions below don't
    // cover it — LibreOffice does. What's asserted here is that the cell holds
    // the native function rather than a value we computed and pasted.
    expect((cf.getCell(44, 2).value as CellVal).formula).toMatch(/^IFERROR\(XIRR\(B40:L40,B3:L3\),/);
    expect((cf.getCell(CF_ROW.equityMultiple, 2).value as CellVal).formula).toContain("SUM(");
  });

  // Research pass 35 (F8): years printed "2,027", the statistics' labels were
  // cut at a 10-wide column, and the indicator columns printed 1 and 0.
  it("prints a year as a year, the indicators as Yes or No over their 1 and 0, and the statistics' labels whole", async () => {
    const { wb, value } = await loadWorkbook(buffer);
    const roll = wb.getWorksheet("Rent Roll")!;
    for (let r = 4; r < 4 + LEASES.length; r++) {
      expect(roll.getCell(r, 10).numFmt, `Rent Roll!J${r}`).toBe("0");
      for (const c of [13, 14]) expect(roll.getCell(r, c).numFmt, `Rent Roll!${colLetter(c)}${r}`).toBe('"Yes";"Yes";"No"');
    }
    // The indicators still hold numbers, which the statistics multiply.
    expect(value("Rent Roll", 4, 10)).toBe(2027);
    expect(value("Rent Roll", 4, 13)).toBe(1);
    expect(value("Rent Roll", 6, 13)).toBe(0); // the vacant suite
    const rollover = wb.getWorksheet("Rollover")!;
    expect(rollover.getCell(4, 2).numFmt).toBe("0");
    expect(value("Rollover", 4, 2)).toBe(2026);
    // Wide enough for "WALT — rent weighted (yrs)" and its indent.
    expect(roll.getColumn(1).width).toBeGreaterThanOrEqual(26);
  });

  it("writes no serial for a day that does not exist, so the page and the workbook date the same leases", () => {
    expect(isoToSerial("2027-12-31")).toBe(46_752);
    // The engine would roll 30 February into 2 March; the page calls it undated.
    expect(isoToSerial("2027-02-30")).toBeNull();
    expect(isoToSerial("2028-31-12")).toBeNull();
  });

  it("writes the rent roll's own data as inputs, not formulas", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const roll = wb.getWorksheet("Rent Roll")!;
    expect(roll.getCell(4, 2).value).toBe("Ardent Logistics");
    expect(roll.getCell(4, 3).value).toBe(40_000);
    // Written as an Excel serial with a date format; exceljs's reader hands
    // it back as a Date, which is the same instant.
    const expiry = roll.getCell(4, 5).value as Date;
    expect(Math.round((expiry.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000)).toBe(
      isoToSerial("2027-12-31"),
    );
  });
});

describe("buildRentRollWorkbook — it says what it assumes, in words only", () => {
  const assumptions = async (buf: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Assumptions")!;
    return (row: number, col: number) => String(ws.getCell(row, col).value ?? "");
  };
  const NOTES = {
    asOf: "Today, Oct 1, 2026, the day this file was made — the rent roll states no as-of date; enter it.",
    absorption: "A placeholder: the 15,000 SF vacant leased over 36 months — not the market's absorption.",
    rate: "10-yr Treasury 4.12% (FRED, Sep 30, 2026) + 225 bps industrial spread, a screening default — enter your quote.",
    vacancy: "The deal model's vacancy (Rent roll actual — 85.0% SF-weighted occupancy).",
    reimbursement: "0%: this export assumes no tenant reimburses an operating expense.",
  };

  it("opens the Assumptions tab on the vacancy and recovery it leaves to the reader", async () => {
    const zero = await assumptions(await buildRentRollWorkbook(LEASES, { ...INPUTS, reimbursementPct: 0 }));
    expect(zero(3, 1)).toMatch(/^Before you read the IRR: general vacancy \(row 27\) comes off every year's revenue/);
    expect(zero(3, 1)).toContain("expense recovery (row 30) is 0%");
    // A workbook whose recovery is set says nothing of a zero it does not have.
    const set = await assumptions(buffer);
    expect(set(3, 1)).toContain("general vacancy (row 27)");
    expect(set(3, 1)).not.toContain("is 0%");
    // The per-lease bumps are on the Rent Roll tab and run nothing; it says so.
    expect(set(15, 3)).toContain("each lease's own escalation on the Rent Roll tab is shown, not used");
  });

  it("prints the caller's note beside each seeded input, and never calls today the roll's as-of date", async () => {
    const noted = await assumptions(await buildRentRollWorkbook(LEASES, { ...INPUTS, notes: NOTES }));
    expect(noted(6, 3)).toBe(NOTES.asOf);
    expect(noted(23, 3)).toBe(NOTES.absorption);
    expect(noted(27, 3)).toBe(NOTES.vacancy);
    expect(noted(30, 3)).toBe(NOTES.reimbursement);
    expect(noted(41, 3)).toBe(NOTES.rate);
    const bare = await assumptions(buffer);
    expect(bare(6, 3)).not.toMatch(/rent roll's as-of date/i);
  });

  it("changes no figure: the noted workbook recalculates to the same returns", async () => {
    const { value } = await loadWorkbook(await buildRentRollWorkbook(LEASES, { ...INPUTS, notes: NOTES }));
    expect(value("Cash Flow", CF_ROW.leveredIrr, 2) as number).toBeCloseTo(model.leveredIrr!, 6);
    expect(buildRentRollCashFlow(LEASES, { ...INPUTS, notes: NOTES }).leveredIrr).toBe(model.leveredIrr);
  });
});

describe("buildRentRollWorkbook — the formulas compute the app's numbers", () => {
  it("recalculates NOI to the app's figure, year by year", async () => {
    const { value } = await loadWorkbook(buffer);
    model.years.forEach((y, i) => {
      const cell = value("Cash Flow", CF_ROW.noi, 3 + i) as number;
      expect(typeof cell, `year ${y.year} NOI`).toBe("number");
      expect(cell).toBeCloseTo(y.noi, 4);
    });
  });

  it("recalculates levered cash flow to the app's figure", async () => {
    const { value } = await loadWorkbook(buffer);
    model.years.forEach((y, i) => {
      expect(value("Cash Flow", CF_ROW.leveredCf, 3 + i) as number).toBeCloseTo(
        y.leveredCashFlow,
        4,
      );
    });
  });

  it("matches the app's levered IRR to four decimals", async () => {
    const { value } = await loadWorkbook(buffer);
    const cellIrr = value("Cash Flow", CF_ROW.leveredIrr, 2) as number;
    expect(typeof cellIrr).toBe("number");
    expect(model.leveredIrr).not.toBeNull();
    expect(cellIrr).toBeCloseTo(model.leveredIrr!, 4);
  });

  it("matches the app's unlevered IRR and equity multiple", async () => {
    const { value } = await loadWorkbook(buffer);
    expect(value("Cash Flow", CF_ROW.unleveredIrr, 2) as number).toBeCloseTo(
      model.unleveredIrr!,
      4,
    );
    expect(value("Cash Flow", CF_ROW.equityMultiple, 2) as number).toBeCloseTo(
      model.equityMultiple!,
      4,
    );
  });

  it("ties the sale year's vector cell to cash flow plus net sale proceeds", async () => {
    const { value } = await loadWorkbook(buffer);
    const last = model.years[model.years.length - 1];
    expect(value("Cash Flow", CF_ROW.leveredVector, 3 + model.years.length - 1) as number).toBeCloseTo(
      last.leveredCashFlow + model.netSaleProceedsLevered,
      3,
    );
  });
});

// Research pass 35 (F8): on flows that never earn the equity back the
// levered IRR read #NUM! (HyperFormula, Excel) and Err:523 (LibreOffice),
// beside an equity multiple of -1.71x. The multiple is the formula's honest
// answer and stays; the IRR cell says why it has no rate, and stays a formula.
// A price far over what the roll's income carries, at 90% loan-to-cost: the
// debt service outruns the NOI every year and the sale does not repay the loan.
const UNDERWATER: WorkbookInputs = { ...INPUTS, purchasePrice: 100_000_000, ltc: 0.9 };

describe("buildRentRollWorkbook — flows no rate solves read a sentence, not an error", () => {
  const sunk = buildRentRollCashFlow(LEASES, UNDERWATER);

  it("says the levered flows never turn positive, as the mirror does, and stays a formula", async () => {
    // The fixture is what it says: every levered flow at or under zero.
    expect(Math.max(...sunk.leveredVector)).toBeLessThanOrEqual(0);
    expect(sunk.leveredIrr).toBeNull();
    expect(sunk.leveredIrrNote).toBe("no IRR: the levered flows never turn positive");
    const { wb, value } = await loadWorkbook(await buildRentRollWorkbook(LEASES, UNDERWATER));
    expect(value("Cash Flow", CF_ROW.leveredIrr, 2)).toBe(sunk.leveredIrrNote);
    expect((wb.getWorksheet("Cash Flow")!.getCell(CF_ROW.leveredIrr, 2).value as CellVal).formula).toMatch(/^IFERROR\(IRR\(B40:L40\),IF\(MAX\(B40:L40\)<=0,/);
    // The multiple is left as the formula computes it.
    expect(value("Cash Flow", CF_ROW.equityMultiple, 2) as number).toBeLessThan(0);
    // A rate that stands has no note, in the mirror or the file.
    expect(model.leveredIrrNote).toBeNull();
    expect(model.unleveredIrrNote).toBeNull();
  });
});

describe("buildRentRollWorkbook — the model is live", () => {
  it("moves levered IRR when the exit cap on the Assumptions tab changes", async () => {
    const { value, setValue } = await loadWorkbook(buffer);
    const before = value("Cash Flow", CF_ROW.leveredIrr, 2) as number;
    setValue("Assumptions", ASSUM_EXIT_CAP_ROW, 2, 0.05);
    const after = value("Cash Flow", CF_ROW.leveredIrr, 2) as number;
    expect(typeof after).toBe("number");
    // A tighter exit cap is a higher sale price, so the return has to rise.
    expect(after).toBeGreaterThan(before);
    // And it should be a real move, not a rounding wobble.
    expect(after - before).toBeGreaterThan(0.01);

    // Confirm the app agrees with the recalculated figure.
    const recomputed = buildRentRollCashFlow(LEASES, { ...INPUTS, exitCapPct: 0.05 });
    expect(after).toBeCloseTo(recomputed.leveredIrr!, 4);
  });

  it("moves NOI when the market rent changes", async () => {
    const { value, setValue } = await loadWorkbook(buffer);
    const before = value("Cash Flow", CF_ROW.noi, 12) as number;
    setValue("Assumptions", 12, 2, 20); // market rent $/SF
    const after = value("Cash Flow", CF_ROW.noi, 12) as number;
    expect(after).toBeGreaterThan(before);
  });
});

// The audit of 2026-10-05: the balance at exit divided by the monthly rate
// and the gross sale by the exit cap, so a 0% loan or a 0% exit cap typed
// into the file read #DIV/0! there and in every return below it, while the
// mirror (lib/export/cashflow) answers both. Each cell is still a formula,
// and takes the mirror's own branch.
const ASSUM_ROW = { rate: 41, monthlyPayment: 57, balanceAtExit: 59 };
const CF_SALE_ROW = { grossSale: 32, saleCosts: 33, loanPayoff: 34, netSaleLevered: 35, netSaleUnlevered: 36 };

describe("buildRentRollWorkbook — a 0% rate and a 0% exit cap compute as the mirror does", () => {
  it("a 0% loan's balance at exit is the loan less the payments made", async () => {
    const { wb, value, setValue } = await loadWorkbook(buffer);
    // At the seeded rate the closed form stands, as before.
    expect(value("Assumptions", ASSUM_ROW.balanceAtExit, 2) as number).toBeCloseTo(model.loanPayoff, 2);

    setValue("Assumptions", ASSUM_ROW.rate, 2, 0);
    const zero = buildRentRollCashFlow(LEASES, { ...INPUTS, allInRatePct: 0 });
    // The fixture is what it says: a loan that amortizes, at no interest.
    expect(zero.loanPayoff).toBeGreaterThan(0);
    expect(zero.loanPayoff).toBeLessThan(zero.loanAmount);
    expect(value("Assumptions", ASSUM_ROW.monthlyPayment, 2) as number).toBeCloseTo(
      pmt(zero.loanAmount, 0, INPUTS.amortMonths),
      4,
    );
    const balance = value("Assumptions", ASSUM_ROW.balanceAtExit, 2);
    expect(typeof balance, "the balance at exit reads a figure, not #DIV/0!").toBe("number");
    expect(balance as number).toBeCloseTo(zero.loanPayoff, 2);
    expect(value("Cash Flow", CF_SALE_ROW.loanPayoff, 2) as number).toBeCloseTo(-zero.loanPayoff, 2);
    expect(value("Cash Flow", CF_SALE_ROW.netSaleLevered, 2) as number).toBeCloseTo(zero.netSaleProceedsLevered, 2);
    // …and the returns the payoff feeds.
    zero.years.forEach((y, i) => {
      expect(value("Cash Flow", CF_ROW.leveredCf, 3 + i) as number).toBeCloseTo(y.leveredCashFlow, 4);
    });
    expect(value("Cash Flow", CF_ROW.leveredIrr, 2) as number).toBeCloseTo(zero.leveredIrr!, 4);
    expect(value("Cash Flow", CF_ROW.equityMultiple, 2) as number).toBeCloseTo(zero.equityMultiple!, 4);
    // Still a formula, the zero rate's branch first.
    const formula = (wb.getWorksheet("Assumptions")!.getCell(ASSUM_ROW.balanceAtExit, 2).value as CellVal).formula;
    expect(formula).toMatch(/^IF\(Assumptions!\$B\$56=0,MAX\(0,Assumptions!\$B\$52-Assumptions!\$B\$57\*Assumptions!\$B\$58\),MAX\(0,/);
  });

  it("an exit cap of 0% or below strikes no sale price, as the mirror does, and the returns still read", async () => {
    const { wb, value, setValue } = await loadWorkbook(buffer);
    setValue("Assumptions", ASSUM_EXIT_CAP_ROW, 2, 0);
    const noCap = buildRentRollCashFlow(LEASES, { ...INPUTS, exitCapPct: 0 });
    expect(noCap.grossSaleProceeds).toBe(0);
    expect(value("Cash Flow", CF_SALE_ROW.grossSale, 2)).toBe(0);
    expect(value("Cash Flow", CF_SALE_ROW.saleCosts, 2) as number).toBeCloseTo(0, 6);
    expect(value("Cash Flow", CF_SALE_ROW.netSaleUnlevered, 2) as number).toBeCloseTo(0, 6);
    expect(value("Cash Flow", CF_SALE_ROW.loanPayoff, 2) as number).toBeCloseTo(-noCap.loanPayoff, 2);
    expect(value("Cash Flow", CF_SALE_ROW.netSaleLevered, 2) as number).toBeCloseTo(noCap.netSaleProceedsLevered, 2);
    expect(value("Cash Flow", CF_ROW.unleveredIrr, 2) as number).toBeCloseTo(noCap.unleveredIrr!, 4);
    expect(value("Cash Flow", CF_ROW.equityMultiple, 2) as number).toBeCloseTo(noCap.equityMultiple!, 4);
    // The mirror finds no levered rate for these flows, and the cell says so
    // in the mirror's words rather than reading #DIV/0!.
    expect(noCap.leveredIrr).toBeNull();
    expect(value("Cash Flow", CF_ROW.leveredIrr, 2)).toBe(noCap.leveredIrrNote);
    // A cap below zero is no cap either, in both.
    setValue("Assumptions", ASSUM_EXIT_CAP_ROW, 2, -0.01);
    expect(value("Cash Flow", CF_SALE_ROW.grossSale, 2)).toBe(0);
    expect(buildRentRollCashFlow(LEASES, { ...INPUTS, exitCapPct: -0.01 }).grossSaleProceeds).toBe(0);
    // Still a formula, and at a real cap it divides as before.
    const cell = wb.getWorksheet("Cash Flow")!.getCell(CF_SALE_ROW.grossSale, 2);
    expect((cell.value as CellVal).formula).toBe("IF(Assumptions!$B$36>0,B31/Assumptions!$B$36,0)");
    setValue("Assumptions", ASSUM_EXIT_CAP_ROW, 2, INPUTS.exitCapPct);
    expect(value("Cash Flow", CF_SALE_ROW.grossSale, 2) as number).toBeCloseTo(model.grossSaleProceeds, 2);
  });
});

// ---------------------------------------------------------------------------
// LibreOffice headless — the independent check. Skipped when soffice is absent
// so the suite still runs locally; CI installs it.
// ---------------------------------------------------------------------------

const SOFFICE = ["/usr/bin/soffice", "/usr/bin/libreoffice"].find((p) => existsSync(p));

/**
 * LibreOffice headless is the INDEPENDENT check: HyperFormula is a JS
 * reimplementation of Excel's functions, so proving the workbook against it
 * alone would be marking our own homework. LibreOffice loads the real file,
 * recalculates it with a different engine, and it also has XIRR, which
 * HyperFormula does not.
 *
 * Requires the `libreoffice-calc` package — `libreoffice-core` alone cannot
 * load a spreadsheet at all. The test skips only when soffice is missing
 * entirely; a present-but-unusable install FAILS, loudly, rather than passing
 * as a silent skip.
 */
describe.skipIf(!SOFFICE)("LibreOffice recalculation", () => {
  it("recalculates the workbook to the app's own returns", () => {
    const dir = mkdtempSync(join(tmpdir(), "rentroll-wb-"));
    const xlsx = join(dir, "model.xlsx");
    const outDir = join(dir, "out");
    mkdirSync(outDir);
    writeFileSync(xlsx, buffer);

    // Calc CSV export options, in order: field separator (44 = comma), text
    // delimiter (34 = "), charset (76 = UTF-8), first line, column formats,
    // language, quoted-as-text, detect special numbers, save AS SHOWN (false —
    // we want raw values), export formulas (false), unused, sheet (4 = Cash
    // Flow). LibreOffice recalculates on load because the workbook sets
    // fullCalcOnLoad and ships no cached results.
    execFileSync(
      SOFFICE!,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=file://${join(dir, "loprofile")}`,
        "--convert-to",
        "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,,4",
        "--outdir",
        outDir,
        xlsx,
      ],
      { stdio: "pipe", timeout: 240_000 },
    );

    // LibreOffice names the file after the sheet it exported.
    const produced = readdirSync(outDir).filter((f) => f.endsWith(".csv"));
    expect(
      produced.length,
      "LibreOffice produced no CSV — is the libreoffice-calc package installed?",
    ).toBeGreaterThan(0);
    const rows = parseCsv(readFileSync(join(outDir, produced[0]), "utf8"));

    /** Read a labelled row's column-B value, stripping the % LibreOffice adds. */
    const labelled = (name: string): number => {
      const row = rows.find((r) => String(r[0] ?? "").trim() === name);
      expect(row, `no "${name}" row in the exported Cash Flow tab`).toBeDefined();
      const raw = String(row![1] ?? "").replace(/[%$,\s]/g, "");
      const n = Number(raw);
      expect(Number.isFinite(n), `"${name}" came back as "${row![1]}"`).toBe(true);
      // A percent-formatted cell exports as 14.6167%, not 0.146167.
      return String(row![1]).includes("%") ? n / 100 : n;
    };

    expect(labelled("Levered IRR")).toBeCloseTo(model.leveredIrr!, 4);
    expect(labelled("Unlevered IRR")).toBeCloseTo(model.unleveredIrr!, 4);
    expect(labelled("Equity multiple")).toBeCloseTo(model.equityMultiple!, 4);
    // XIRR dates the flows a year apart, so it lands near — not on — the
    // undated IRR. Within 50 bps is the honest tolerance.
    expect(labelled("Levered XIRR (dated)")).toBeCloseTo(model.leveredIrr!, 2);
  }, 300_000);

  // LibreOffice answered Err:523 for an IRR no rate solves; the cell now
  // reads the mirror's sentence there too, and XIRR's says the same.
  it("reads the sentence, not Err:523, where the levered flows never turn positive", () => {
    const dir = mkdtempSync(join(tmpdir(), "rentroll-wb-sunk-"));
    const xlsx = join(dir, "model.xlsx");
    const outDir = join(dir, "out");
    mkdirSync(outDir);
    return buildRentRollWorkbook(LEASES, UNDERWATER).then((buf) => {
      writeFileSync(xlsx, buf);
      execFileSync(
        SOFFICE!,
        [
          "--headless",
          "--norestore",
          `-env:UserInstallation=file://${join(dir, "loprofile")}`,
          "--convert-to",
          "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,,4",
          "--outdir",
          outDir,
          xlsx,
        ],
        { stdio: "pipe", timeout: 240_000 },
      );
      const produced = readdirSync(outDir).filter((f) => f.endsWith(".csv"));
      expect(produced.length).toBeGreaterThan(0);
      const rows = parseCsv(readFileSync(join(outDir, produced[0]), "utf8"));
      const cell = (name: string) => String(rows.find((r) => String(r[0] ?? "").trim() === name)?.[1] ?? "");
      const sunk = buildRentRollCashFlow(LEASES, UNDERWATER);
      expect(cell("Levered IRR")).toBe(sunk.leveredIrrNote);
      expect(cell("Levered XIRR (dated)")).toBe("no XIRR: the levered flows never turn positive");
    });
  }, 300_000);

  // The balance at exit and the gross sale divided by a rate and a cap the
  // file let a reader set to zero; LibreOffice read Err:532 (#DIV/0!) there.
  it("reads the mirror's sale and payoff, not #DIV/0!, at a 0% rate and a 0% exit cap", async () => {
    const DEGENERATE: WorkbookInputs = { ...INPUTS, allInRatePct: 0, exitCapPct: 0 };
    const dir = mkdtempSync(join(tmpdir(), "rentroll-wb-zero-"));
    const xlsx = join(dir, "model.xlsx");
    const outDir = join(dir, "out");
    mkdirSync(outDir);
    writeFileSync(xlsx, await buildRentRollWorkbook(LEASES, DEGENERATE));
    execFileSync(
      SOFFICE!,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=file://${join(dir, "loprofile")}`,
        "--convert-to",
        "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,,4",
        "--outdir",
        outDir,
        xlsx,
      ],
      { stdio: "pipe", timeout: 240_000 },
    );
    const produced = readdirSync(outDir).filter((f) => f.endsWith(".csv"));
    expect(produced.length).toBeGreaterThan(0);
    const rows = parseCsv(readFileSync(join(outDir, produced[0]), "utf8"));
    const figure = (name: string): number => {
      const raw = String(rows.find((r) => String(r[0] ?? "").trim() === name)?.[1] ?? "");
      const n = Number(raw.replace(/[%$,\s]/g, ""));
      expect(Number.isFinite(n), `"${name}" came back as "${raw}"`).toBe(true);
      return raw.includes("%") ? n / 100 : n;
    };
    const both = buildRentRollCashFlow(LEASES, DEGENERATE);
    expect(figure("Gross sale proceeds")).toBe(0);
    expect(figure("Loan payoff")).toBeCloseTo(-both.loanPayoff, 2);
    expect(figure("Net sale proceeds — levered")).toBeCloseTo(both.netSaleProceedsLevered, 2);
    expect(figure("Unlevered IRR")).toBeCloseTo(both.unleveredIrr!, 4);
    expect(figure("Equity multiple")).toBeCloseTo(both.equityMultiple!, 4);
  }, 300_000);
});
