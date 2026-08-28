import { describe, expect, it, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRentRollWorkbook, colLetter, isoToSerial } from "./workbook";
import { buildRentRollCashFlow, type WorkbookInputs } from "./cashflow";
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
    expect((cf.getCell(CF_ROW.leveredIrr, 2).value as CellVal).formula).toMatch(/^IRR\(/);
    // HyperFormula has no XIRR, so the recalculation assertions below don't
    // cover it — LibreOffice does. What's asserted here is that the cell holds
    // the native function rather than a value we computed and pasted.
    expect((cf.getCell(44, 2).value as CellVal).formula).toMatch(/^XIRR\(/);
    expect((cf.getCell(CF_ROW.equityMultiple, 2).value as CellVal).formula).toContain("SUM(");
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
});
