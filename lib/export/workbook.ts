import "server-only";
import ExcelJS from "exceljs";
import type { Lease } from "@/lib/rentroll/schema";
import type { WorkbookInputs } from "./cashflow";
import { buildRentRollCashFlow } from "./cashflow";

/**
 * The rent-roll model workbook (Phase 3) — four tabs, LIVE FORMULAS.
 *
 * The rule this file exists to enforce: NEVER WRITE A COMPUTED VALUE INTO A
 * CELL THAT SHOULD HOLD A FORMULA. A workbook full of hardcoded numbers looks
 * identical to a real model and is worthless the second someone changes an
 * assumption. Only two kinds of cell carry values here: the Assumptions tab's
 * inputs, and the rent roll's own lease data. Everything else is arithmetic
 * Excel performs.
 *
 * The formulas mirror lib/export/cashflow.ts line for line, and the test loads
 * the generated file, recalculates it, and asserts the IRR cell equals that
 * module's IRR — so a divergence fails the build rather than surfacing as a
 * wrong number in someone's IC memo.
 *
 * Dates are written as Excel SERIALS with a date format rather than as Date
 * objects: serials survive every reader, and date arithmetic
 * ((expiry − as-of) / 365.25) works on them directly.
 *
 * Formatting convention, stated on the Assumptions tab: blue = hardcoded
 * input, black = formula, green = a link to another tab.
 */

const ARIAL = "Arial";
const BLUE = { argb: "FF0000CC" };
const GREEN = { argb: "FF107C41" };
const INK = { argb: "FF18211F" };
const BRAND = { argb: "FF114E54" };
const MUTED = { argb: "FF5F6B69" };
const WHITE = { argb: "FFFFFFFF" };
const HEADFILL = "FF114E54";
const BANDFILL = "FFF2F1EC";
const LINE = "FFE7E4DD";

const FMT = {
  usd: '$#,##0;($#,##0);"-"',
  usd2: '$#,##0.00;($#,##0.00);"-"',
  psf: '$#,##0.00;($#,##0.00);"-"',
  pct1: "0.0%",
  pct2: "0.00%",
  int: "#,##0",
  num1: "#,##0.0",
  mult: '0.00"x"',
  date: "mm/dd/yyyy",
} as const;

/** Excel serial for an ISO date, off the 1899-12-30 epoch. */
export function isoToSerial(iso: string): number | null {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** 1-based column index → column letters. */
export function colLetter(col: number): string {
  let s = "";
  let c = col;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

function styleInput(cell: ExcelJS.Cell, fmt: string) {
  cell.font = { name: ARIAL, size: 10, color: BLUE };
  cell.numFmt = fmt;
}
function styleFormula(cell: ExcelJS.Cell, fmt: string, bold = false) {
  cell.font = { name: ARIAL, size: 10, color: INK, bold };
  cell.numFmt = fmt;
}
function styleLink(cell: ExcelJS.Cell, fmt: string) {
  cell.font = { name: ARIAL, size: 10, color: GREEN };
  cell.numFmt = fmt;
}
function label(
  cell: ExcelJS.Cell,
  text: string | number,
  opts: { bold?: boolean; color?: { argb: string }; indent?: number; size?: number } = {},
) {
  cell.value = text;
  cell.font = { name: ARIAL, size: opts.size ?? 10, bold: opts.bold, color: opts.color ?? INK };
  if (opts.indent) cell.alignment = { indent: opts.indent };
}
function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string, from: number, to: number) {
  for (let i = from; i <= to; i++) {
    ws.getCell(row, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADFILL } };
  }
  const c = ws.getCell(row, from);
  c.value = text.toUpperCase();
  c.font = { name: ARIAL, size: 10, bold: true, color: WHITE };
  ws.getRow(row).height = 16;
}
function titleRow(ws: ExcelJS.Worksheet, text: string) {
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { name: ARIAL, size: 15, bold: true, color: BRAND };
  ws.getRow(1).height = 21;
}
function bottomBorder(ws: ExcelJS.Worksheet, row: number, from: number, to: number) {
  for (let i = from; i <= to; i++) {
    ws.getCell(row, i).border = { bottom: { style: "thin", color: { argb: LINE } } };
  }
}

// ---------------------------------------------------------------------------
// Assumptions tab — the only cells in the workbook a user types into
// ---------------------------------------------------------------------------

/** Every Assumptions row the other tabs reference, in one place so a layout
 *  change can't silently break a formula on another sheet. */
export const A = {
  nra: 5,
  asOf: 6,
  holdYears: 7,
  price: 8,
  closingPct: 9,

  marketRent: 12,
  renewalProb: 13,
  termYears: 14,
  escalation: 15,
  renewalTi: 16,
  newTi: 17,
  renewalLc: 18,
  newLc: 19,
  downtimeMonths: 20,
  renewalFree: 21,
  newFree: 22,
  absorption: 23,

  otherIncome: 26,
  vacancy: 27,
  opexPsf: 28,
  expenseGrowth: 29,
  reimbursement: 30,
  mgmtFee: 31,
  reservesPsf: 32,
  capImprovements: 33,

  exitCap: 36,
  saleCostPct: 37,

  ltc: 40,
  rate: 41,
  ioMonths: 42,
  amortMonths: 43,
  financingPct: 44,

  termRentPsf: 47,
  renewalCostPsf: 48,
  newCostPsf: 49,
  blendedCostPsf: 50,
  loanBasis: 51,
  loanAmount: 52,
  financingCosts: 53,
  totalUses: 54,
  equity: 55,
  monthlyRate: 56,
  monthlyPayment: 57,
  amortizingMonths: 58,
  balanceAtExit: 59,
} as const;

/** `Assumptions!$B$n` for a named row. */
const AR = (row: number): string => `Assumptions!$B$${row}`;

function buildAssumptions(ws: ExcelJS.Worksheet, inputs: WorkbookInputs): void {
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 62;

  titleRow(ws, `ASSUMPTIONS — ${inputs.dealName}`);
  label(ws.getCell(2, 1), "Blue = input you edit · Black = formula · Green = link to another tab", {
    color: MUTED,
  });
  label(
    ws.getCell(3, 1),
    "Free rent and downtime are priced as leasing capital below NOI, not as a haircut to revenue.",
    { color: MUTED },
  );

  const row = (
    r: number,
    text: string,
    value: number | null,
    fmt: string,
    note: string,
  ) => {
    label(ws.getCell(r, 1), text, { indent: 1 });
    const cell = ws.getCell(r, 2);
    cell.value = value;
    styleInput(cell, fmt);
    label(ws.getCell(r, 3), note, { color: MUTED, size: 9 });
    bottomBorder(ws, r, 1, 3);
  };
  const derived = (r: number, text: string, formula: string, fmt: string, note: string) => {
    label(ws.getCell(r, 1), text, { indent: 1 });
    const cell = ws.getCell(r, 2);
    cell.value = { formula } as ExcelJS.CellFormulaValue;
    styleFormula(cell, fmt);
    label(ws.getCell(r, 3), note, { color: MUTED, size: 9 });
    bottomBorder(ws, r, 1, 3);
  };

  sectionHeader(ws, 4, "Property", 1, 3);
  row(A.nra, "Net rentable area (SF)", inputs.nra, FMT.int, "Every per-SF figure is against this.");
  row(A.asOf, "Analysis start date", isoToSerial(inputs.asOf), FMT.date, "The rent roll's as-of date. Drives years-to-expiry.");
  row(A.holdYears, "Hold period (years)", inputs.holdYears, FMT.int, "Sale at the end of this year, on forward NOI.");
  row(A.price, "Purchase price", inputs.purchasePrice, FMT.usd, "");
  row(A.closingPct, "Closing costs (% of price)", inputs.closingCostPct, FMT.pct2, "");

  sectionHeader(ws, 11, "Market leasing assumptions", 1, 3);
  row(A.marketRent, "Market rent ($/SF/yr)", inputs.profile.marketRentPsf, FMT.psf, "What rolled and vacant space re-leases at.");
  row(A.renewalProb, "Renewal probability", inputs.profile.renewalProbability, FMT.pct1, "Weights the renewal and new-deal cost branches.");
  row(A.termYears, "New lease term (years)", inputs.profile.termYears, FMT.num1, "Term the leasing commission is paid on.");
  row(A.escalation, "Annual escalation", inputs.profile.escalationPct, FMT.pct2, "Applied to contract, re-leased and lease-up rent.");
  row(A.renewalTi, "Renewal TI ($/SF)", inputs.profile.renewalTiPsf, FMT.psf, "");
  row(A.newTi, "New-deal TI ($/SF)", inputs.profile.newTiPsf, FMT.psf, "");
  row(A.renewalLc, "Renewal LC (% of term rent)", inputs.profile.renewalLcPct, FMT.pct2, "");
  row(A.newLc, "New-deal LC (% of term rent)", inputs.profile.newLcPct, FMT.pct2, "");
  row(A.downtimeMonths, "Downtime on a new deal (months)", inputs.profile.downtimeMonths, FMT.num1, "Carried at market rent. Zero on a renewal.");
  row(A.renewalFree, "Free rent — renewal (months)", inputs.profile.renewalFreeRentMonths, FMT.num1, "");
  row(A.newFree, "Free rent — new deal (months)", inputs.profile.newFreeRentMonths, FMT.num1, "");
  row(A.absorption, "Absorption (SF / month)", inputs.absorptionSfPerMonth, FMT.int, "Pace the vacant SF leases up at.");

  sectionHeader(ws, 25, "Operations", 1, 3);
  row(A.otherIncome, "Other income ($/yr)", inputs.otherIncomeAnnual, FMT.usd, "");
  row(A.vacancy, "General vacancy & credit loss", inputs.vacancyPct, FMT.pct1, "On potential gross revenue.");
  row(A.opexPsf, "Operating expenses ($/SF/yr)", inputs.opexPsf, FMT.psf, "");
  row(A.expenseGrowth, "Expense growth", inputs.expenseGrowthPct, FMT.pct2, "");
  row(A.reimbursement, "Expense recovery (% of opex)", inputs.reimbursementPct, FMT.pct1, "Reimbursed by tenants.");
  row(A.mgmtFee, "Management fee (% of EGR)", inputs.mgmtFeePct, FMT.pct2, "");
  row(A.reservesPsf, "Capital reserves ($/SF/yr)", inputs.reservesPsf, FMT.psf, "");
  row(A.capImprovements, "Capital improvements — Year 1", inputs.capitalImprovementsYr1, FMT.usd, "");

  sectionHeader(ws, 35, "Exit", 1, 3);
  row(A.exitCap, "Exit cap rate", inputs.exitCapPct, FMT.pct2, "Applied to forward (hold + 1) NOI.");
  row(A.saleCostPct, "Costs of sale", inputs.saleCostPct, FMT.pct2, "");

  sectionHeader(ws, 39, "Debt", 1, 3);
  row(A.ltc, "Loan to cost", inputs.ltc, FMT.pct1, "Sized off price + closing, excluding financing fees.");
  row(A.rate, "All-in rate", inputs.allInRatePct, FMT.pct2, "");
  row(A.ioMonths, "Interest-only period (months)", inputs.ioMonths, FMT.int, "");
  row(A.amortMonths, "Amortization (months)", inputs.amortMonths, FMT.int, "");
  row(A.financingPct, "Financing costs (% of loan)", inputs.financingCostPct, FMT.pct2, "");

  sectionHeader(ws, 46, "Derived — formulas, not inputs", 1, 3);
  derived(
    A.termRentPsf,
    "Total term rent ($/SF)",
    `IF(${AR(A.escalation)}=0,${AR(A.marketRent)}*${AR(A.termYears)},${AR(A.marketRent)}*((1+${AR(A.escalation)})^${AR(A.termYears)}-1)/${AR(A.escalation)})`,
    FMT.psf,
    "Escalations compounded over the term — the base leasing commissions are paid on.",
  );
  derived(
    A.renewalCostPsf,
    "Renewal cost ($/SF)",
    `${AR(A.renewalTi)}+${AR(A.renewalLc)}*${AR(A.termRentPsf)}+${AR(A.marketRent)}*${AR(A.renewalFree)}/12`,
    FMT.psf,
    "TI + LC + free rent.",
  );
  derived(
    A.newCostPsf,
    "New-deal cost ($/SF)",
    `${AR(A.newTi)}+${AR(A.newLc)}*${AR(A.termRentPsf)}+${AR(A.marketRent)}*${AR(A.newFree)}/12+${AR(A.marketRent)}*${AR(A.downtimeMonths)}/12`,
    FMT.psf,
    "TI + LC + free rent + downtime carried at market rent.",
  );
  derived(
    A.blendedCostPsf,
    "Blended rollover cost ($/SF)",
    `${AR(A.renewalProb)}*${AR(A.renewalCostPsf)}+(1-${AR(A.renewalProb)})*${AR(A.newCostPsf)}`,
    FMT.psf,
    "Probability-weighted. Every expiring SF is priced at this.",
  );
  derived(A.loanBasis, "Loan basis", `${AR(A.price)}*(1+${AR(A.closingPct)})`, FMT.usd, "Price + closing, excluding financing fees — no circular reference.");
  derived(A.loanAmount, "Loan amount", `${AR(A.loanBasis)}*${AR(A.ltc)}`, FMT.usd, "");
  derived(A.financingCosts, "Financing costs", `${AR(A.loanAmount)}*${AR(A.financingPct)}`, FMT.usd, "");
  derived(A.totalUses, "Total uses", `${AR(A.loanBasis)}+${AR(A.financingCosts)}`, FMT.usd, "");
  derived(A.equity, "Equity", `${AR(A.totalUses)}-${AR(A.loanAmount)}`, FMT.usd, "The plug — sources equal uses by construction.");
  derived(A.monthlyRate, "Monthly rate", `${AR(A.rate)}/12`, FMT.pct2, "");
  derived(
    A.monthlyPayment,
    "Monthly payment",
    `IF(${AR(A.amortMonths)}<=0,0,-PMT(${AR(A.monthlyRate)},${AR(A.amortMonths)},${AR(A.loanAmount)}))`,
    FMT.usd,
    "Level payment on the stated amortization.",
  );
  derived(
    A.amortizingMonths,
    "Amortizing months over the hold",
    `MAX(0,${AR(A.holdYears)}*12-${AR(A.ioMonths)})`,
    FMT.int,
    "Zero while the loan is still interest-only at sale.",
  );
  derived(
    A.balanceAtExit,
    "Loan balance at exit",
    `MAX(0,${AR(A.loanAmount)}*(1+${AR(A.monthlyRate)})^${AR(A.amortizingMonths)}-${AR(A.monthlyPayment)}*((1+${AR(A.monthlyRate)})^${AR(A.amortizingMonths)}-1)/${AR(A.monthlyRate)})`,
    FMT.usd,
    "Closed form, so no FV sign ambiguity.",
  );
}

// ---------------------------------------------------------------------------
// Rent Roll tab
// ---------------------------------------------------------------------------

const RR_HEADER_ROW = 3;
const RR_FIRST = 4;

interface RentRollAnchors {
  first: number;
  last: number;
  totalsRow: number;
  totalSf: string;
  occupiedSf: string;
  vacantSf: string;
  inPlaceRent: string;
  expiryYearRange: string;
  sfRange: string;
  rentRange: string;
}

function buildRentRoll(
  ws: ExcelJS.Worksheet,
  leases: Lease[],
  inputs: WorkbookInputs,
): RentRollAnchors {
  const widths = [10, 30, 11, 12, 12, 14, 10, 8, 10, 10, 12, 10, 10, 9];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  titleRow(ws, `RENT ROLL — ${inputs.dealName}`);
  label(
    ws.getCell(2, 1),
    "Blue cells came from your file. Black cells are formulas off them and off the Assumptions tab.",
    { color: MUTED },
  );

  const headers = [
    "Suite", "Tenant", "SF", "Lease start", "Lease expiry", "Base rent (annual)",
    "Rent $/SF", "Basis", "Escalation", "Expiry year", "Yrs to expiry", "% of NRA",
    "Occupied", "Dated",
  ];
  headers.forEach((h, i) => {
    const c = ws.getCell(RR_HEADER_ROW, i + 1);
    c.value = h;
    c.font = { name: ARIAL, size: 9, bold: true, color: WHITE };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADFILL } };
    c.alignment = { wrapText: true, vertical: "bottom" };
  });
  ws.getRow(RR_HEADER_ROW).height = 26;

  const first = RR_FIRST;
  leases.forEach((l, i) => {
    const r = first + i;
    const v = (col: number, value: string | number | null, fmt?: string) => {
      const cell = ws.getCell(r, col);
      cell.value = value;
      if (fmt) styleInput(cell, fmt);
      else cell.font = { name: ARIAL, size: 10, color: BLUE };
    };
    v(1, l.suite || null);
    // A genuinely EMPTY cell, not an empty string: the occupancy indicator
    // below tests B="" and an inline empty string is not blank to every reader.
    v(2, l.vacant ? null : l.tenant);
    v(3, l.sf, FMT.int);
    v(4, l.leaseStart ? isoToSerial(l.leaseStart) : null, FMT.date);
    v(5, l.leaseExpiry ? isoToSerial(l.leaseExpiry) : null, FMT.date);
    v(6, l.baseRentAnnual, FMT.usd);

    const f = (col: number, formula: string, fmt: string) => {
      const cell = ws.getCell(r, col);
      cell.value = { formula } as ExcelJS.CellFormulaValue;
      styleFormula(cell, fmt);
    };
    f(7, `IF(N(C${r})=0,"",F${r}/C${r})`, FMT.psf);
    v(8, l.rentBasis === "unknown" ? "" : l.rentBasis);
    v(9, l.escalationPct, FMT.pct2);
    f(10, `IF(E${r}="","",YEAR(E${r}))`, FMT.int);
    // 0, not "", so the SUMPRODUCT weightings below stay numeric.
    f(11, `IF(E${r}="",0,MAX(0,(E${r}-${AR(A.asOf)})/365.25))`, FMT.num1);
    f(12, `IF(${AR(A.nra)}=0,"",C${r}/${AR(A.nra)})`, FMT.pct1);
    // Two indicator columns, so every roll statistic is a SUMPRODUCT over
    // numbers rather than a criteria string a reader might interpret its own
    // way: M = the space is occupied, N = it is occupied AND carries a date
    // (the WALT basis).
    f(13, `IF(B${r}="",0,1)`, FMT.int);
    f(14, `IF(OR(E${r}="",M${r}=0),0,1)`, FMT.int);
    if (i % 2 === 1) {
      for (let c = 1; c <= 14; c++) {
        ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDFILL } };
      }
    }
  });

  const last = first + Math.max(0, leases.length - 1);
  const totalsRow = first + leases.length;
  const sfRange = `$C$${first}:$C$${last}`;
  const rentRange = `$F$${first}:$F$${last}`;
  const yearsRange = `$K$${first}:$K$${last}`;
  const occupiedRange = `$M$${first}:$M$${last}`;
  const datedRange = `$N$${first}:$N$${last}`;
  const expiryYearRange = `$J$${first}:$J$${last}`;

  label(ws.getCell(totalsRow, 1), "Total", { bold: true });
  const totalSfCell = ws.getCell(totalsRow, 3);
  totalSfCell.value = { formula: `SUM(${sfRange})` } as ExcelJS.CellFormulaValue;
  styleFormula(totalSfCell, FMT.int, true);
  const totalRentCell = ws.getCell(totalsRow, 6);
  totalRentCell.value = { formula: `SUM(${rentRange})` } as ExcelJS.CellFormulaValue;
  styleFormula(totalRentCell, FMT.usd, true);
  bottomBorder(ws, totalsRow, 1, 14);

  // Stats block, all formulas.
  const statFirst = totalsRow + 2;
  sectionHeader(ws, statFirst - 1, "Roll statistics", 1, 3);
  const stats: [string, string, string][] = [
    ["Total SF", `SUM(${sfRange})`, FMT.int],
    ["Occupied SF", `SUMPRODUCT(${sfRange},${occupiedRange})`, FMT.int],
    ["Vacant SF", `B${statFirst}-B${statFirst + 1}`, FMT.int],
    ["Occupancy", `IF(B${statFirst}=0,"",B${statFirst + 1}/B${statFirst})`, FMT.pct1],
    ["In-place base rent", `SUM(${rentRange})`, FMT.usd],
    [
      "Weighted rent ($/SF)",
      `IF(B${statFirst + 1}=0,"",B${statFirst + 4}/B${statFirst + 1})`,
      FMT.psf,
    ],
    [
      "WALT — SF weighted (yrs)",
      `IF(SUMPRODUCT(${sfRange},${datedRange})=0,"",SUMPRODUCT(${yearsRange},${sfRange},${datedRange})/SUMPRODUCT(${sfRange},${datedRange}))`,
      FMT.num1,
    ],
    [
      "WALT — rent weighted (yrs)",
      `IF(SUMPRODUCT(${rentRange},${datedRange})=0,"",SUMPRODUCT(${yearsRange},${rentRange},${datedRange})/SUMPRODUCT(${rentRange},${datedRange}))`,
      FMT.num1,
    ],
  ];
  stats.forEach(([text, formula, fmt], i) => {
    const r = statFirst + i;
    label(ws.getCell(r, 1), text, { indent: 1 });
    const cell = ws.getCell(r, 2);
    cell.value = { formula } as ExcelJS.CellFormulaValue;
    styleFormula(cell, fmt);
    bottomBorder(ws, r, 1, 2);
  });

  return {
    first,
    last,
    totalsRow,
    totalSf: `'Rent Roll'!$B$${statFirst}`,
    occupiedSf: `'Rent Roll'!$B$${statFirst + 1}`,
    vacantSf: `'Rent Roll'!$B$${statFirst + 2}`,
    inPlaceRent: `'Rent Roll'!$B$${statFirst + 4}`,
    expiryYearRange: `'Rent Roll'!${expiryYearRange}`,
    sfRange: `'Rent Roll'!${sfRange}`,
    rentRange: `'Rent Roll'!${rentRange}`,
  };
}

// ---------------------------------------------------------------------------
// Rollover tab
// ---------------------------------------------------------------------------

const RO_HEADER_ROW = 3;
const RO_FIRST = 4;

interface RolloverAnchors {
  first: number;
  last: number;
  sfExpiring: string;
  cumulativeSf: string;
  cumulativeRent: string;
  totalCost: string;
}

function buildRollover(
  ws: ExcelJS.Worksheet,
  rr: RentRollAnchors,
  years: number,
): RolloverAnchors {
  const widths = [8, 12, 12, 10, 14, 9, 13, 14, 13, 13, 13, 13, 15, 11];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  titleRow(ws, "ROLLOVER SCHEDULE & LEASING CAPITAL");
  label(
    ws.getCell(2, 1),
    "SUMIFS across the Rent Roll by expiry year. TI, LC, free rent and downtime price off the Assumptions tab.",
    { color: MUTED },
  );

  const headers = [
    "Yr", "Calendar", "SF expiring", "% of NRA", "Rent expiring", "Leases",
    "Cum. SF rolled", "Cum. rent rolled", "TI", "LC", "Free rent", "Downtime",
    "Leasing capital", "Cost / SF",
  ];
  headers.forEach((h, i) => {
    const c = ws.getCell(RO_HEADER_ROW, i + 1);
    c.value = h;
    c.font = { name: ARIAL, size: 9, bold: true, color: WHITE };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADFILL } };
    c.alignment = { wrapText: true, vertical: "bottom" };
  });
  ws.getRow(RO_HEADER_ROW).height = 26;

  const first = RO_FIRST;
  for (let n = 1; n <= years; n++) {
    const r = first + n - 1;
    const yearCell = ws.getCell(r, 1);
    yearCell.value = n;
    styleFormula(yearCell, FMT.int);

    const f = (col: number, formula: string, fmt: string, link = false) => {
      const cell = ws.getCell(r, col);
      cell.value = { formula } as ExcelJS.CellFormulaValue;
      if (link) styleLink(cell, fmt);
      else styleFormula(cell, fmt);
    };

    f(2, `YEAR(${AR(A.asOf)})+A${r}-1`, FMT.int);
    // Analysis year 1 absorbs anything already expired (holdover) as well as
    // its own calendar year; later years take their year alone.
    const criteria = n === 1 ? `"<="&B${r}` : `B${r}`;
    f(3, `SUMIFS(${rr.sfRange},${rr.expiryYearRange},${criteria})`, FMT.int, true);
    f(4, `IF(${AR(A.nra)}=0,"",C${r}/${AR(A.nra)})`, FMT.pct1);
    f(5, `SUMIFS(${rr.rentRange},${rr.expiryYearRange},${criteria})`, FMT.usd, true);
    f(6, `COUNTIFS(${rr.expiryYearRange},${criteria})`, FMT.int, true);
    f(7, `SUM($C$${first}:C${r})`, FMT.int);
    f(8, `SUM($E$${first}:E${r})`, FMT.usd);
    f(9, `C${r}*(${AR(A.renewalProb)}*${AR(A.renewalTi)}+(1-${AR(A.renewalProb)})*${AR(A.newTi)})`, FMT.usd);
    f(
      10,
      `C${r}*${AR(A.termRentPsf)}*(${AR(A.renewalProb)}*${AR(A.renewalLc)}+(1-${AR(A.renewalProb)})*${AR(A.newLc)})`,
      FMT.usd,
    );
    f(
      11,
      `C${r}*${AR(A.marketRent)}*(${AR(A.renewalProb)}*${AR(A.renewalFree)}+(1-${AR(A.renewalProb)})*${AR(A.newFree)})/12`,
      FMT.usd,
    );
    f(12, `C${r}*${AR(A.marketRent)}*(1-${AR(A.renewalProb)})*${AR(A.downtimeMonths)}/12`, FMT.usd);
    f(13, `SUM(I${r}:L${r})`, FMT.usd, false);
    f(14, `IF(C${r}=0,"",M${r}/C${r})`, FMT.psf);

    if (n % 2 === 0) {
      for (let c = 1; c <= 14; c++) {
        ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDFILL } };
      }
    }
  }

  const last = first + years - 1;
  const totalsRow = last + 1;
  label(ws.getCell(totalsRow, 1), "Total", { bold: true });
  for (const col of [3, 5, 9, 10, 11, 12, 13]) {
    const cell = ws.getCell(totalsRow, col);
    cell.value = {
      formula: `SUM(${colLetter(col)}${first}:${colLetter(col)}${last})`,
    } as ExcelJS.CellFormulaValue;
    styleFormula(cell, col === 3 ? FMT.int : FMT.usd, true);
  }
  bottomBorder(ws, totalsRow, 1, 14);

  return {
    first,
    last,
    sfExpiring: `Rollover!$C$${first}:$C$${last}`,
    cumulativeSf: `Rollover!$G$${first}:$G$${last}`,
    cumulativeRent: `Rollover!$H$${first}:$H$${last}`,
    totalCost: `Rollover!$M$${first}:$M$${last}`,
  };
}

// ---------------------------------------------------------------------------
// Cash Flow tab
// ---------------------------------------------------------------------------

const CF = {
  yearNo: 2,
  date: 3,
  contractRent: 6,
  releasedRent: 7,
  leaseUpRent: 8,
  otherIncome: 9,
  pgr: 10,
  vacancy: 11,
  reimbursements: 12,
  egr: 13,
  opex: 16,
  mgmtFee: 17,
  noi: 18,
  leasingCapital: 21,
  reserves: 22,
  capImprovements: 23,
  cfbd: 24,
  debtService: 27,
  leveredCf: 28,
  reversionNoi: 31,
  grossSale: 32,
  saleCosts: 33,
  loanPayoff: 34,
  netSaleLevered: 35,
  netSaleUnlevered: 36,
  unleveredVector: 39,
  leveredVector: 40,
  unleveredIrr: 42,
  leveredIrr: 43,
  leveredXirr: 44,
  equityMultiple: 45,
  peakEquity: 46,
} as const;

function buildCashFlow(
  ws: ExcelJS.Worksheet,
  rr: RentRollAnchors,
  ro: RolloverAnchors,
  holdYears: number,
): void {
  ws.getColumn(1).width = 34;
  // B = Yr 0, C..(C+hold-1) = Yr 1..hold, then one reversion column.
  const firstYearCol = 3;
  const lastYearCol = firstYearCol + holdYears - 1;
  const reversionCol = lastYearCol + 1;
  for (let c = 2; c <= reversionCol; c++) ws.getColumn(c).width = 14;

  titleRow(ws, "CASH FLOW");
  label(
    ws.getCell(2, 1),
    "Every figure below is a formula. Change an assumption and the IRR moves.",
    { color: MUTED },
  );

  // Year numbers and dates.
  const yr = ws.getCell(CF.yearNo, 2);
  yr.value = 0;
  styleFormula(yr, FMT.int, true);
  for (let c = firstYearCol; c <= reversionCol; c++) {
    const cell = ws.getCell(CF.yearNo, c);
    cell.value = { formula: `${colLetter(c - 1)}${CF.yearNo}+1` } as ExcelJS.CellFormulaValue;
    styleFormula(cell, FMT.int, true);
    cell.alignment = { horizontal: "right" };
  }
  for (let c = 2; c <= reversionCol; c++) {
    const cell = ws.getCell(CF.date, c);
    cell.value = {
      formula: `EDATE(${AR(A.asOf)},12*${colLetter(c)}$${CF.yearNo})`,
    } as ExcelJS.CellFormulaValue;
    styleFormula(cell, FMT.date);
  }
  label(ws.getCell(CF.yearNo, 1), "Analysis year", { bold: true });
  label(ws.getCell(CF.date, 1), "Period end", { color: MUTED });
  bottomBorder(ws, CF.date, 1, reversionCol);

  const line = (
    row: number,
    text: string,
    formulaFor: (col: string, n: string) => string,
    fmt: string,
    opts: { bold?: boolean; link?: boolean; indent?: number } = {},
  ) => {
    label(ws.getCell(row, 1), text, { bold: opts.bold, indent: opts.indent });
    for (let c = firstYearCol; c <= reversionCol; c++) {
      const col = colLetter(c);
      const cell = ws.getCell(row, c);
      cell.value = { formula: formulaFor(col, `${col}$${CF.yearNo}`) } as ExcelJS.CellFormulaValue;
      if (opts.link) styleLink(cell, fmt);
      else styleFormula(cell, fmt, opts.bold);
    }
  };

  const esc = AR(A.escalation);
  const growth = (n: string) => `(1+${esc})^(${n}-1)`;

  sectionHeader(ws, 5, "Revenue", 1, reversionCol);
  line(
    CF.contractRent,
    "Contract base rent",
    (col, n) => `MAX(0,${rr.inPlaceRent}-INDEX(${ro.cumulativeRent},${n}))*${growth(n)}`,
    FMT.usd,
    { indent: 1 },
  );
  line(
    CF.releasedRent,
    "Re-leased rent (rolled space)",
    (col, n) => `INDEX(${ro.cumulativeSf},${n})*${AR(A.marketRent)}*${growth(n)}`,
    FMT.usd,
    { indent: 1 },
  );
  line(
    CF.leaseUpRent,
    "Lease-up rent (vacant space)",
    (col, n) =>
      `MIN(${rr.vacantSf},MAX(0,${AR(A.absorption)}*12*(${n}-0.5)))*${AR(A.marketRent)}*${growth(n)}`,
    FMT.usd,
    { indent: 1 },
  );
  line(CF.otherIncome, "Other income", (col, n) => `${AR(A.otherIncome)}*${growth(n)}`, FMT.usd, {
    indent: 1,
  });
  line(
    CF.pgr,
    "Potential gross revenue",
    (col) => `SUM(${col}${CF.contractRent}:${col}${CF.otherIncome})`,
    FMT.usd,
    { bold: true },
  );
  line(
    CF.vacancy,
    "General vacancy & credit loss",
    (col) => `-${col}${CF.pgr}*${AR(A.vacancy)}`,
    FMT.usd,
    { indent: 1 },
  );
  line(
    CF.reimbursements,
    "Expense reimbursements",
    (col) => `${col}${CF.opex}*${AR(A.reimbursement)}`,
    FMT.usd,
    { indent: 1 },
  );
  line(
    CF.egr,
    "Effective gross revenue",
    (col) => `${col}${CF.pgr}+${col}${CF.vacancy}+${col}${CF.reimbursements}`,
    FMT.usd,
    { bold: true },
  );

  sectionHeader(ws, 15, "Operating expenses", 1, reversionCol);
  line(
    CF.opex,
    "Operating expenses",
    (col, n) => `${AR(A.opexPsf)}*${AR(A.nra)}*(1+${AR(A.expenseGrowth)})^(${n}-1)`,
    FMT.usd,
    { indent: 1 },
  );
  line(CF.mgmtFee, "Management fee", (col) => `${col}${CF.egr}*${AR(A.mgmtFee)}`, FMT.usd, {
    indent: 1,
  });
  line(
    CF.noi,
    "Net operating income",
    (col) => `${col}${CF.egr}-${col}${CF.opex}-${col}${CF.mgmtFee}`,
    FMT.usd,
    { bold: true },
  );

  sectionHeader(ws, 20, "Capital", 1, reversionCol);
  line(
    CF.leasingCapital,
    "Leasing capital (TI / LC / free rent / downtime)",
    (col, n) => `INDEX(${ro.totalCost},${n})`,
    FMT.usd,
    { indent: 1, link: true },
  );
  line(
    CF.reserves,
    "Capital reserves",
    (col, n) => `${AR(A.reservesPsf)}*${AR(A.nra)}*(1+${AR(A.expenseGrowth)})^(${n}-1)`,
    FMT.usd,
    { indent: 1 },
  );
  line(
    CF.capImprovements,
    "Capital improvements",
    (col, n) => `IF(${n}=1,${AR(A.capImprovements)},0)`,
    FMT.usd,
    { indent: 1 },
  );
  line(
    CF.cfbd,
    "Cash flow before debt service",
    (col) =>
      `${col}${CF.noi}-${col}${CF.leasingCapital}-${col}${CF.reserves}-${col}${CF.capImprovements}`,
    FMT.usd,
    { bold: true },
  );

  sectionHeader(ws, 26, "Debt", 1, reversionCol);
  line(
    CF.debtService,
    "Debt service",
    (col, n) =>
      `IF(${n}*12<=${AR(A.ioMonths)},${AR(A.loanAmount)}*${AR(A.rate)},${AR(A.monthlyPayment)}*12)`,
    FMT.usd,
    { indent: 1 },
  );
  line(
    CF.leveredCf,
    "Levered cash flow",
    (col) => `${col}${CF.cfbd}-${col}${CF.debtService}`,
    FMT.usd,
    { bold: true },
  );

  // The reversion column is an exit basis, not an operating year — grey it so
  // nobody reads Yr 11 as part of the hold.
  for (let r = CF.contractRent; r <= CF.leveredCf; r++) {
    const cell = ws.getCell(r, reversionCol);
    cell.font = { ...(cell.font ?? {}), color: MUTED };
  }
  // NB: the reversion column's year number is load-bearing — every operating
  // formula reads INDEX(..., M$2) — so it is greyed, never blanked.
  ws.getCell(CF.date, reversionCol).note = "Exit basis only — forward NOI for the sale.";
  ws.getCell(CF.yearNo, reversionCol).font = { name: ARIAL, size: 10, bold: true, color: MUTED };

  // ── Reversion & returns ────────────────────────────────────────────────
  sectionHeader(ws, 30, "Reversion & returns", 1, reversionCol);
  const single = (row: number, text: string, formula: string, fmt: string, bold = false) => {
    label(ws.getCell(row, 1), text, { bold, indent: bold ? 0 : 1 });
    const cell = ws.getCell(row, 2);
    cell.value = { formula } as ExcelJS.CellFormulaValue;
    styleFormula(cell, fmt, bold);
    bottomBorder(ws, row, 1, 2);
  };

  const revCol = colLetter(reversionCol);
  const lastCol = colLetter(lastYearCol);
  single(CF.reversionNoi, "Reversion NOI (forward year)", `${revCol}${CF.noi}`, FMT.usd);
  single(CF.grossSale, "Gross sale proceeds", `B${CF.reversionNoi}/${AR(A.exitCap)}`, FMT.usd);
  single(CF.saleCosts, "Costs of sale", `-B${CF.grossSale}*${AR(A.saleCostPct)}`, FMT.usd);
  single(CF.loanPayoff, "Loan payoff", `-${AR(A.balanceAtExit)}`, FMT.usd);
  single(
    CF.netSaleLevered,
    "Net sale proceeds — levered",
    `B${CF.grossSale}+B${CF.saleCosts}+B${CF.loanPayoff}`,
    FMT.usd,
    true,
  );
  single(
    CF.netSaleUnlevered,
    "Net sale proceeds — unlevered",
    `B${CF.grossSale}+B${CF.saleCosts}`,
    FMT.usd,
  );

  sectionHeader(ws, 38, "Return vectors", 1, reversionCol);
  // Year 0 outflows.
  const unlev0 = ws.getCell(CF.unleveredVector, 2);
  unlev0.value = { formula: `-${AR(A.loanBasis)}` } as ExcelJS.CellFormulaValue;
  styleFormula(unlev0, FMT.usd);
  const lev0 = ws.getCell(CF.leveredVector, 2);
  lev0.value = { formula: `-${AR(A.equity)}` } as ExcelJS.CellFormulaValue;
  styleFormula(lev0, FMT.usd);
  label(ws.getCell(CF.unleveredVector, 1), "Unlevered cash flow", { bold: true });
  label(ws.getCell(CF.leveredVector, 1), "Levered cash flow", { bold: true });

  for (let c = firstYearCol; c <= lastYearCol; c++) {
    const col = colLetter(c);
    const isLast = c === lastYearCol;
    const u = ws.getCell(CF.unleveredVector, c);
    u.value = {
      formula: isLast ? `${col}${CF.cfbd}+B${CF.netSaleUnlevered}` : `${col}${CF.cfbd}`,
    } as ExcelJS.CellFormulaValue;
    styleFormula(u, FMT.usd);
    const l = ws.getCell(CF.leveredVector, c);
    l.value = {
      formula: isLast ? `${col}${CF.leveredCf}+B${CF.netSaleLevered}` : `${col}${CF.leveredCf}`,
    } as ExcelJS.CellFormulaValue;
    styleFormula(l, FMT.usd);
  }

  sectionHeader(ws, 41, "Returns", 1, reversionCol);
  single(
    CF.unleveredIrr,
    "Unlevered IRR",
    `IRR(B${CF.unleveredVector}:${lastCol}${CF.unleveredVector})`,
    FMT.pct2,
    true,
  );
  single(
    CF.leveredIrr,
    "Levered IRR",
    `IRR(B${CF.leveredVector}:${lastCol}${CF.leveredVector})`,
    FMT.pct2,
    true,
  );
  single(
    CF.leveredXirr,
    "Levered XIRR (dated)",
    `XIRR(B${CF.leveredVector}:${lastCol}${CF.leveredVector},B${CF.date}:${lastCol}${CF.date})`,
    FMT.pct2,
  );
  single(
    CF.equityMultiple,
    "Equity multiple",
    `IF(${AR(A.equity)}=0,"",SUM(${colLetter(firstYearCol)}${CF.leveredVector}:${lastCol}${CF.leveredVector})/${AR(A.equity)})`,
    FMT.mult,
    true,
  );
  single(CF.peakEquity, "Equity invested", AR(A.equity), FMT.usd);
}

// ---------------------------------------------------------------------------

function printSetup(ws: ExcelJS.Worksheet, landscape = true) {
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: landscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
}

/**
 * Build the four-tab rent roll model. `holdYears` is taken from the inputs and
 * clamped to 1–10: the Cash Flow tab is a ten-year model by design.
 */
export async function buildRentRollWorkbook(
  leases: Lease[],
  inputs: WorkbookInputs,
): Promise<Buffer> {
  const holdYears = Math.min(10, Math.max(1, Math.round(inputs.holdYears)));
  const resolved: WorkbookInputs = { ...inputs, holdYears };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Underwrite Copilot";
  wb.created = new Date(0);
  // Tell Excel and LibreOffice to recalculate on open — the workbook ships
  // with formulas and no cached results, which is the point.
  wb.calcProperties.fullCalcOnLoad = true;

  const wsAssum = wb.addWorksheet("Assumptions", { views: [{ showGridLines: false }] });
  const wsRoll = wb.addWorksheet("Rent Roll", {
    views: [{ state: "frozen", xSplit: 2, ySplit: RR_HEADER_ROW, showGridLines: false }],
  });
  const wsRollover = wb.addWorksheet("Rollover", {
    views: [{ state: "frozen", xSplit: 2, ySplit: RO_HEADER_ROW, showGridLines: false }],
  });
  const wsCf = wb.addWorksheet("Cash Flow", {
    views: [{ state: "frozen", xSplit: 1, ySplit: CF.date, showGridLines: false }],
  });
  wsAssum.properties.tabColor = { argb: HEADFILL };
  wsCf.properties.tabColor = { argb: HEADFILL };

  buildAssumptions(wsAssum, resolved);
  const rr = buildRentRoll(wsRoll, leases, resolved);
  // One extra row so the reversion year's NOI has a rollover bucket to read.
  const ro = buildRollover(wsRollover, rr, holdYears + 1);
  buildCashFlow(wsCf, rr, ro, holdYears);

  [wsAssum, wsRoll, wsRollover, wsCf].forEach((ws) => printSetup(ws, ws !== wsAssum));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Re-exported so the API route and the tests share one entry point. */
export { buildRentRollCashFlow };
