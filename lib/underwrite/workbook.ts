import "server-only";
import { dealTypeLabelFor } from "@/lib/interest";
import ExcelJS from "exceljs";
import type { UnderwriteInputs } from "./engine";
import { computeUnderwrite } from "./engine";
import { defaultIncrements } from "./sensitivity";
import type { DerivedModel, InputSource } from "./inputs";
import { applyWorkbookBranding, type ExportBranding } from "@/lib/excel-branding";
import { STRATEGY_LABEL, STRATEGY_READING, isPlanDeal } from "@/lib/deal-strategy";
import type { ModelVsMarket } from "@/lib/model-vs-market";
import { readGrainNote, readScope } from "@/lib/model-vs-market-scope";
import { datedLong } from "@/lib/debt-index";
import { portfolioFacts, type PortfolioRead } from "@/lib/portfolio";
import { PLAN_RETURNS_CAVEAT_WORKBOOK } from "./plan-caveat";
import type { InterestKind } from "@/lib/anthropic/types";

/**
 * The institutional acquisition-template workbook (Feature 1). Visible tabs:
 * Cover, Deal Summary, Assumptions, Cash Flow (annual), Monthly Cash Flow,
 * Debt Schedule, Sensitivity. The MAIN MODEL is live — every number is an
 * Excel formula off the Assumptions inputs, so changing the exit cap
 * recalculates levered IRR, and the formulas mirror lib/underwrite/engine.ts
 * so the web app's numbers match the workbook.
 *
 * Sensitivity: a veryHidden engine tab holds one live cash-flow block per
 * scenario (3 pairings × 5×5 = 75); the visible Sensitivity tab presents
 * numeric IRR and EM matrices reading those blocks, with color scales. The
 * engine-tab layout (shared rows, scenarios from column C, IRR row 23 / EM
 * row 24) is load-bearing — workbook.test.ts addresses it directly.
 *
 * Conventions (stated on the Cover tab): blue = input, black = formula,
 * green = link, yellow fill = the assumptions most worth flexing. Monthly
 * Cash Flow presents operating lines at the model's ANNUAL convention ÷ 12
 * (with per-year tie-out checks against the annual tab); the Debt Schedule
 * is the exact month-by-month amortization and its exit balance ties to the
 * Deal Summary's Outstanding Debt.
 */

const ARIAL = "Arial";
const BLUE = { argb: "FF0000CC" };
const GREEN = { argb: "FF107C41" };
const INK = { argb: "FF18211F" };
const BRAND = { argb: "FF114E54" };
const MUTED = { argb: "FF5F6B69" };
const WHITE = { argb: "FFFFFFFF" };
const YELLOW = "FFFDF3D0";
const HEADFILL = "FF114E54";
const BANDFILL = "FFF2F1EC"; // light warm band for KPI tiles / zebra
const LINE = "FFE7E4DD";

const FMT = {
  usd: '$#,##0;($#,##0);"-"',
  psf: "$0.00",
  pct1: "0.0%",
  pct2: "0.00%",
  mult: '0.0"x"',
  int: "#,##0",
  ratio: '0.00"x"',
} as const;

function sourceText(s: InputSource | undefined): string {
  if (!s) return "";
  const tag = s.provenance === "extracted" ? "OM" : s.provenance === "derived" ? "Derived" : "Assumption";
  const page = s.provenance === "extracted" && s.page ? ` ${s.page}` : "";
  return `${tag}${page} — ${s.note}`;
}
function provColor(p: InputSource["provenance"] | undefined) {
  if (p === "extracted") return INK;
  if (p === "derived") return BRAND;
  return MUTED;
}
function styleInput(cell: ExcelJS.Cell, fmt: string, flex = false) {
  cell.font = { name: ARIAL, size: 10, color: BLUE };
  cell.numFmt = fmt;
  if (flex) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
}
function styleFormula(cell: ExcelJS.Cell, fmt: string, color = INK, bold = false) {
  cell.font = { name: ARIAL, size: 10, color, bold };
  cell.numFmt = fmt;
}
function styleLink(cell: ExcelJS.Cell, fmt: string) {
  cell.font = { name: ARIAL, size: 10, color: GREEN };
  cell.numFmt = fmt;
}
function label(cell: ExcelJS.Cell, text: string | number, opts: { bold?: boolean; color?: { argb: string }; indent?: number; size?: number } = {}) {
  cell.value = text;
  cell.font = { name: ARIAL, size: opts.size ?? 10, bold: opts.bold, color: opts.color ?? INK };
  if (opts.indent) cell.alignment = { indent: opts.indent };
}
function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string, fromCol: number, toCol: number) {
  for (let i = fromCol; i <= toCol; i++) {
    ws.getCell(row, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADFILL } };
  }
  const c = ws.getCell(row, fromCol);
  c.value = text.toUpperCase();
  c.font = { name: ARIAL, size: 10, bold: true, color: WHITE };
  ws.getRow(row).height = 16;
}
function titleRow(ws: ExcelJS.Worksheet, text: string) {
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { name: ARIAL, size: 16, bold: true, color: BRAND };
  ws.getRow(1).height = 22;
}
function bottomBorder(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number) {
  for (let i = fromCol; i <= toCol; i++) {
    ws.getCell(row, i).border = { bottom: { style: "thin", color: { argb: LINE } } };
  }
}
/** A1 address from 1-based row/col. */
function cellA1(row: number, col: number): string {
  let s = "";
  let c = col;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return `${s}${row}`;
}
/** Landscape, fit-to-width print setup — every tab prints clean. */
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

export async function buildUnderwriteWorkbook(
  model: DerivedModel,
  branding?: ExportBranding | null,
  /** the model's assumptions against the published figures, read when the
   *  workbook was built (lib/model-vs-market) — a data tab beside the
   *  Assumptions it reads; no tab at all with nothing read */
  marketRead?: ModelVsMarket | null,
  /** a portfolio memorandum's properties (lib/portfolio) — a tab of their
   *  own after the Deal Summary; no tab for a single property */
  portfolio?: PortfolioRead | null,
  /** when the workbook was built — the day its cover's "from today" lines
   *  were read on, printed on the cover and set as the file's created and
   *  modified time (it was 1970) */
  builtAt: Date = new Date(),
): Promise<Buffer> {
  const { inputs } = model;
  const result = computeUnderwrite(inputs);
  const holdYears = result.holdYears;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Underwrite Copilot";
  wb.created = builtAt;
  wb.modified = builtAt;

  const wsCover = wb.addWorksheet("Cover", { views: [{ showGridLines: false }] });
  const wsSummary = wb.addWorksheet("Deal Summary", { views: [{ showGridLines: false }] });
  const wsPortfolio =
    portfolio && portfolio.assets.length >= 2
      ? wb.addWorksheet("Portfolio", { views: [{ state: "frozen", xSplit: 1, ySplit: PORTFOLIO_HEAD_ROW, showGridLines: false }] })
      : null;
  const wsAssum = wb.addWorksheet("Assumptions", { views: [{ showGridLines: false }] });
  const wsRead =
    marketRead && marketRead.checks.length > 0
      ? wb.addWorksheet("Market Read", { views: [{ showGridLines: false }] })
      : null;
  const wsCf = wb.addWorksheet("Cash Flow", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2, showGridLines: false }],
  });
  const wsMonthly = wb.addWorksheet("Monthly Cash Flow", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 3, showGridLines: false }],
  });
  const wsDebt = wb.addWorksheet("Debt Schedule", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: false }],
  });
  const wsOps = wb.addWorksheet("Operating Metrics", { views: [{ showGridLines: false }] });
  const wsSens = wb.addWorksheet("Sensitivity", { views: [{ showGridLines: false }] });
  // Hidden tab holding one live cash-flow block per sensitivity scenario.
  const wsEng = wb.addWorksheet("Sensitivity Engine", { state: "veryHidden" });

  // Tab colors: brand for the dashboard, muted sand for detail tabs.
  wsCover.properties.tabColor = { argb: HEADFILL };
  wsSummary.properties.tabColor = { argb: HEADFILL };
  wsSens.properties.tabColor = { argb: "FFA05A1C" };

  buildCover(wsCover, model, branding, { portfolio: !!wsPortfolio, marketRead: !!wsRead }, builtAt);
  buildAssumptions(wsAssum, inputs, model.sources, model.meta.strategy, model.meta.interest?.kind);
  if (wsPortfolio && portfolio) buildPortfolio(wsPortfolio, portfolio, model.meta.unitNoun ?? { one: "unit", many: "units" });
  if (wsRead && marketRead) buildMarketRead(wsRead, marketRead);
  const cf = buildCashFlow(wsCf, inputs, holdYears);
  buildDealSummary(wsSummary, model, cf, holdYears);
  buildMonthlyCashFlow(wsMonthly, cf, inputs, holdYears);
  buildDebtSchedule(wsDebt, inputs);
  buildOperatingMetrics(wsOps, cf, model, holdYears);
  buildSensitivity(wsSens, wsEng, inputs);

  const visible = [
    wsCover,
    wsSummary,
    ...(wsPortfolio ? [wsPortfolio] : []),
    wsAssum,
    ...(wsRead ? [wsRead] : []),
    wsCf,
    wsMonthly,
    wsDebt,
    wsOps,
    wsSens,
  ];
  visible.forEach((ws) => printSetup(ws, ws !== wsCover && ws !== wsAssum));
  // Monthly is 60+ columns — fitting it to one page width prints a smear.
  // Paginate across pages instead, repeating the line labels on each page.
  wsMonthly.pageSetup = {
    ...wsMonthly.pageSetup,
    fitToPage: false,
    printTitlesColumn: "A:A",
  };
  // The amortization table spans pages — repeat its header row on each.
  wsDebt.pageSetup = { ...wsDebt.pageSetup, printTitlesRow: "3:3" };

  // Firm branding (Feature 6): file properties + print chrome, plus the
  // Cover's "Prepared by" line (written in buildCover) — additive only, so
  // no formula anchor can shift.
  applyWorkbookBranding(wb, visible, model.meta.dealName, branding);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── COVER ─────────────────────────────────────────────────────────────────────
function buildCover(
  ws: ExcelJS.Worksheet,
  model: DerivedModel,
  branding?: ExportBranding | null,
  /** which of the optional tabs this workbook carries, for the Contents */
  optional: { portfolio: boolean; marketRead: boolean } = { portfolio: false, marketRead: false },
  /** when it was built: the day "years from today" on this cover counts from */
  builtAt: Date = new Date(),
) {
  const { meta } = model;
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 64;
  ws.getColumn(4).width = 3;

  // Brand banner.
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= 4; c++) {
      ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADFILL } };
    }
  }
  const firm = branding?.firmName?.trim();
  const banner = ws.getCell(2, 2);
  banner.value = firm ? firm.toUpperCase() : "UNDERWRITE COPILOT";
  banner.font = { name: ARIAL, size: 12, bold: true, color: WHITE };
  if (firm) {
    const by = ws.getCell(3, 2);
    by.value = "Powered by Underwrite Copilot";
    by.font = { name: ARIAL, size: 8, color: { argb: "FFB8CFCf".toUpperCase() } };
  }

  let r = 6;
  const title = ws.getCell(r, 2);
  title.value = meta.dealName;
  title.font = { name: ARIAL, size: 22, bold: true, color: BRAND };
  ws.getRow(r).height = 30;
  r++;
  label(ws.getCell(r, 2), "Acquisition screening model", { size: 12, color: MUTED });
  r += 2;

  const fact = (lab: string, val: string | null | undefined) => {
    label(ws.getCell(r, 2), lab, { bold: true, size: 10, color: MUTED });
    label(ws.getCell(r, 3), val || "—", { size: 10 });
    r++;
  };
  fact("Asset class", meta.assetClass);
  fact("Market", meta.market);
  fact("Address", meta.address);
  // The day the workbook was built: every "years from today" below — a
  // ground lease's term, an abatement's end — counts from it, and a file
  // opened months later would otherwise read them as this year's.
  fact(
    "Built",
    builtAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
  );
  // The deal's strategy decides what its figures mean. On a plan deal
  // (value-add, conversion, development, lease-up) the cover says so, because
  // the OM's stabilized NOI is the finished project's figure — never this
  // model's year 1 — and a reader opening the file cold has to know that.
  const dealKind = meta.strategy ?? "unknown";
  if (dealKind !== "unknown") {
    // Whose strategy it is on a note or a leased fee, the deal header's own
    // label (lib/interest): the type describes the collateral, or the
    // leaseholder's building, never what the price buys.
    fact("Deal type", dealTypeLabelFor(STRATEGY_LABEL[dealKind], meta.interest?.kind));
    const reading = ws.getCell(r, 3);
    reading.value = isPlanDeal(dealKind)
      ? `${STRATEGY_READING[dealKind]} This annual model books the capital budget in year 1 and anchors year-1 income on in-place or assumed figures — the Assumptions tab names each source.`
      : STRATEGY_READING[dealKind];
    reading.font = { name: ARIAL, size: 9, color: MUTED };
    reading.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = isPlanDeal(dealKind) ? 54 : 28;
    r++;
  }
  // What is being sold (#414): a note, a share, a leasehold — and what this
  // model is and is not on it, before anyone reads a return off it.
  if (meta.interest) {
    fact("What is being sold", meta.interest.line);
    if (meta.interest.modelCaveat) {
      const c = ws.getCell(r, 3);
      c.value = meta.interest.modelCaveat;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 40;
      r++;
    }
  }
  // The seller's loan offered for assumption (#419): as stated, then what
  // it is worth against this model's own new loan.
  if (meta.assumable) {
    fact("The seller's loan", meta.assumable.line);
    const c = ws.getCell(r, 3);
    c.value = meta.assumable.read;
    c.font = { name: ARIAL, size: 9, color: MUTED };
    c.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = 40;
    r++;
  }
  // A note the seller offers to carry (#462): as stated, then what it is
  // worth against this model's own new loan.
  if (meta.sellerNote) {
    fact("The seller's note", meta.sellerNote.line);
    const c = ws.getCell(r, 3);
    c.value = meta.sellerNote.read;
    c.font = { name: ARIAL, size: 9, color: MUTED };
    c.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = 40;
    r++;
  }
  // A covenant or a contract that sets the rents (#453): how much of the
  // building is restricted and until when, then what this model's one rent
  // growth rate is not on it.
  if (meta.affordable) {
    fact("Affordability", meta.affordable.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 28;
    if (meta.affordable.modelCaveat) {
      const c = ws.getCell(r, 3);
      c.value = meta.affordable.modelCaveat;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 52;
      r++;
    }
  }
  // The one lease a single-tenant property is (#454): the tenant, the
  // term and the increases, then what they mean for this model — the years
  // left at its sale, and "enter 1.92% as the rent growth" where the
  // lease's own increases differ from the Rent Growth input.
  if (meta.singleTenant) {
    fact("The single tenant", meta.singleTenant.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.singleTenant.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.singleTenant.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 64;
      r++;
    }
  }
  // A multi-tenant property's listed tenants (#457): the roster, then what
  // this model does not carry for its roll — the leasing capital, and its
  // vacancy flat through the worst year.
  if (meta.roster) {
    fact("The tenants", meta.roster.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.roster.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.roster.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 64;
      r++;
    }
  }
  // A value-add renovation program (#460): the program, then what a door
  // is worth at this model's exit cap and the premium the model does not
  // carry.
  if (meta.valueAdd) {
    fact("The value-add program", meta.valueAdd.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.valueAdd.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.valueAdd.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 64;
      r++;
    }
  }
  // A property-tax abatement (#461): the abatement, then where it ends
  // against this model's sale and the step-up at its exit cap.
  if (meta.taxAbatement) {
    fact("The tax abatement", meta.taxAbatement.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.taxAbatement.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.taxAbatement.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 64;
      r++;
    }
  }
  // A student building (#468): its pre-leasing against last year's, its
  // beds and its walk, then the model's vacancy against the beds to sign.
  if (meta.student) {
    fact("Student housing", meta.student.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.student.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.student.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 40;
      r++;
    }
  }
  // A manufactured-housing park (#470): its pads, lot rent, homes and
  // utilities, then what the model does with the gap to market, the
  // park-owned homes and a private system.
  if (meta.mh) {
    fact("The park", meta.mh.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.mh.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.mh.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 64;
      r++;
    }
  }
  // A self-storage facility (#471): its occupancies, rates and platform,
  // then what the model does with the premium over street and a lease-up.
  if (meta.storage) {
    fact("The facility", meta.storage.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.storage.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.storage.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 40;
      r++;
    }
  }
  // What the third-party reports found (#465): the Phase I, the immediate
  // repairs, the seismic PML and the zoning, then what this model does with
  // the repairs.
  if (meta.siteReports) {
    fact("The reports", meta.siteReports.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.siteReports.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.siteReports.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 40;
      r++;
    }
  }
  // How the property is sold (#456): an auction's bid, premium, reserve
  // and deadline, then the most this model pays all-in at the screening
  // hurdle, backed out of the premium.
  if (meta.sale) {
    fact("How it is sold", meta.sale.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.sale.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.sale.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 40;
      r++;
    }
  }
  // What a hotel is sold with (#455): the flag, the encumbrance, the PIP
  // and the franchise's end, then the PIP against this model's capital
  // line and the agreements' clocks against its hold.
  if (meta.hotel) {
    fact("The hotel", meta.hotel.line);
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 40;
    if (meta.hotel.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.hotel.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 52;
      r++;
    }
  }
  // A leasehold's exit (#422): this model's sale valued on the years its
  // lease has left then, and the Exit Cap that runs the workbook on the
  // term — the input stays the model's; the reader decides. The lease's
  // end rides in "What is being sold" above.
  if (meta.leasehold) {
    fact("The exit, on the lease's term", meta.leasehold.line);
    // A sentence, not a figure: wrapped, with the room it needs.
    ws.getCell(r - 1, 3).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r - 1).height = 52;
    if (meta.leasehold.read) {
      const c = ws.getCell(r, 3);
      c.value = meta.leasehold.read;
      c.font = { name: ARIAL, size: 9, color: MUTED };
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 64;
      r++;
    }
  }
  r++;

  sectionHeader(ws, r, "Contents", 2, 3);
  r++;
  const toc: [string, string][] = [
    ["Deal Summary", "KPIs, sources & uses, residual value, and return summary"],
    ...(optional.portfolio
      ? ([["Portfolio", "Each property as the OM states it, with live shares, allocation caps and the allocations against the ask"]] as [string, string][])
      : []),
    ["Assumptions", "Every input with its source (OM page, derived, or assumption)"],
    ...(optional.marketRead
      ? ([["Market Read", "The model's assumptions against the published figures, as read the day this was built"]] as [string, string][])
      : []),
    ["Cash Flow", "Annual property and investment cash flow through exit"],
    ["Monthly Cash Flow", "Monthly operating detail with per-year ties to the annual tab"],
    ["Debt Schedule", "Month-by-month amortization; exit payoff ties to Deal Summary"],
    ["Operating Metrics", "Margins, coverage and breakeven occupancy by year; year-1 yardsticks per unit and per SF where the count and size are stated"],
    ["Sensitivity", "Live IRR and equity-multiple matrices across 75 scenarios"],
  ];
  for (const [name, desc] of toc) {
    label(ws.getCell(r, 2), name, { bold: true, size: 10 });
    label(ws.getCell(r, 3), desc, { size: 10, color: MUTED });
    r++;
  }
  r++;

  sectionHeader(ws, r, "How to read this model", 2, 3);
  r++;
  const legend: [string, { argb: string }, string][] = [
    ["Blue", BLUE, "input — type over it and the model recalculates"],
    ["Black", INK, "formula — computed from the inputs"],
    ["Green", GREEN, "link — pulled from another tab"],
  ];
  for (const [name, color, desc] of legend) {
    const c = ws.getCell(r, 2);
    c.value = name;
    c.font = { name: ARIAL, size: 10, bold: true, color };
    label(ws.getCell(r, 3), desc, { size: 10, color: MUTED });
    r++;
  }
  const flexCell = ws.getCell(r, 2);
  flexCell.value = "Yellow fill";
  flexCell.font = { name: ARIAL, size: 10, bold: true, color: INK };
  flexCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  label(ws.getCell(r, 3), "the assumptions most worth flexing first", { size: 10, color: MUTED });
  r += 2;

  label(
    ws.getCell(r, 2),
    "Screening tool — verify against source documents before relying on any figure. Not investment advice.",
    { size: 8, color: MUTED },
  );
}

// ── ASSUMPTIONS ───────────────────────────────────────────────────────────────
function buildAssumptions(
  ws: ExcelJS.Worksheet,
  inp: UnderwriteInputs,
  sources: DerivedModel["sources"],
  strategy: DerivedModel["meta"]["strategy"],
  /** what the price buys (the cover's `meta.interest.kind`), which says
   *  whose strategy the deal type is on a note or a leased fee */
  interestKind?: InterestKind,
) {
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 64;
  titleRow(ws, "Assumptions");
  label(ws.getCell(1, 3), "SOURCE", { bold: true, color: MUTED, size: 9 });

  let r = 3;
  const src = (row: number, key: keyof UnderwriteInputs | "expenseLines") => {
    const s = sources[key as keyof typeof sources];
    if (!s) return;
    const sc = ws.getCell(row, 3);
    sc.value = sourceText(s);
    sc.font = { name: ARIAL, size: 9, color: provColor(s.provenance) };
  };
  const input = (lab: string, value: number, name: string, fmt: string, key?: keyof UnderwriteInputs, flex = false) => {
    label(ws.getCell(r, 1), lab, { indent: 1 });
    const c = ws.getCell(r, 2);
    c.value = value;
    c.name = name;
    styleInput(c, fmt, flex);
    if (key) src(r, key);
    r++;
  };
  // A formula over this tab's own inputs: black, per the cover's legend —
  // green is a link pulled from another tab, which none of these is.
  const derived = (lab: string, formula: string, name: string, fmt: string, bold = false) => {
    label(ws.getCell(r, 1), lab, { bold, indent: 1 });
    const c = ws.getCell(r, 2);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    c.name = name;
    styleFormula(c, fmt, INK, bold);
    r++;
  };
  const header = (t: string) => { sectionHeader(ws, r, t, 1, 3); r++; };

  header("Deal");
  // What kind of deal this is, before any number: on a plan deal the OM's
  // stabilized pro forma is the finished project's NOI and must not be read
  // as the year-1 income the rows below anchor on.
  const dealKind = strategy ?? "unknown";
  if (dealKind !== "unknown") {
    label(ws.getCell(r, 1), "Deal Type", { indent: 1 });
    // Whose strategy it is on a note or a leased fee, as the cover says it
    // (lib/interest): the collateral's, or the leaseholder's building's.
    const kindLabel = dealTypeLabelFor(STRATEGY_LABEL[dealKind], interestKind);
    label(ws.getCell(r, 2), kindLabel);
    const note = ws.getCell(r, 3);
    note.value = isPlanDeal(dealKind)
      ? `${STRATEGY_READING[dealKind]} Year-1 income below is in-place or assumed — never the OM's stabilized pro forma.`
      : STRATEGY_READING[dealKind];
    note.font = { name: ARIAL, size: 9, color: MUTED };
    if (kindLabel !== STRATEGY_LABEL[dealKind]) {
      // The qualified label is longer than the column: wrapped, with the
      // row's three cells set at its top.
      ws.getCell(r, 1).alignment = { indent: 1, vertical: "top" };
      ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(r, 3).alignment = { vertical: "top" };
      ws.getRow(r).height = 40;
    }
    r++;
  }
  input("Purchase Price", inp.purchasePrice, "PurchasePrice", FMT.usd, "purchasePrice", true);
  // Hold is STRUCTURAL: it sets the number of cash-flow years and the sale
  // year, which are baked at export. Not a flex input — editing it in the file
  // would only partially recalc (a longer-hold IRR would be wrong). Nor does a
  // re-export change it: every export runs the model's one hold
  // (lib/underwrite/inputs HOLD_MONTHS), so the cell says it is fixed and why.
  input("Hold Period (months) — fixed", inp.holdMonths, "HoldMonths", FMT.int);
  ws.getCell(r - 1, 2).font = { name: ARIAL, size: 10, color: INK }; // black (formula-like), not blue input
  {
    const sc = ws.getCell(r - 1, 3);
    const said = sources.holdMonths ? `${sourceText(sources.holdMonths)}. ` : "";
    sc.value = `${said}Fixed: the Cash Flow tab's years and the sale year are built for this hold, so typing over it recalculates only part of the model.`;
    sc.font = { name: ARIAL, size: 9, color: provColor(sources.holdMonths?.provenance) };
  }
  input("Acquisition Fee %", inp.acqFeePct, "AcqFeePct", FMT.pct2, "acqFeePct");
  input("Acquisition Fee Cap", inp.acqFeeCap, "AcqFeeCap", FMT.usd);

  header("Closing Cost Detail");
  input("Transfer Tax % of price", inp.transferTaxPct, "TransferTaxPct", FMT.pct2);
  label(ws.getCell(r - 1, 3), "Enter your jurisdiction's transfer-tax rate", { color: MUTED, size: 9 });
  input("Recordation Tax % of price", inp.recordationTaxPct, "RecordationTaxPct", FMT.pct2);
  label(ws.getCell(r - 1, 3), "Enter your jurisdiction's recordation-tax rate", { color: MUTED, size: 9 });
  input("General Hold % of price", inp.generalHoldPct, "GeneralHoldPct", FMT.pct2, "generalHoldPct");
  input("Buyer Legal", inp.buyerLegal, "BuyerLegal", FMT.usd);
  input("Lender Legal", inp.lenderLegal, "LenderLegal", FMT.usd);
  input("Appraisal / PCA / Phase I", inp.thirdPartyReports, "ThirdPartyReports", FMT.usd);
  input("3rd Party / Misc.", inp.miscClosing, "MiscClosing", FMT.usd);
  derived("Total Closing Costs", "PurchasePrice*(TransferTaxPct+RecordationTaxPct+GeneralHoldPct)+BuyerLegal+LenderLegal+ThirdPartyReports+MiscClosing", "ClosingCostsTotal", FMT.usd, true);
  derived("Closing Costs % of price", "ClosingCostsTotal/PurchasePrice", "ClosingCostPct_Buy", FMT.pct2);

  header("Income");
  input("In-Place Rental Revenue (annual)", inp.inPlaceRentAnnual, "InPlaceRent", FMT.usd, "inPlaceRentAnnual");
  input("Expense Recoveries (annual)", inp.expenseRecoveriesAnnual, "Recoveries", FMT.usd);
  input("Other Revenue (annual)", inp.otherRevenueAnnual, "OtherRev", FMT.usd);
  input("General Vacancy & Credit Loss %", inp.vacancyPct, "VacancyPct", FMT.pct1, "vacancyPct", true);
  input("Rent Growth %", inp.rentGrowthPct, "RentGrowth", FMT.pct1, "rentGrowthPct", true);

  header("Expenses");
  const opexStart = r;
  inp.expenseLines.forEach((line, i) => {
    label(ws.getCell(r, 1), line.label, { indent: 1 });
    const c = ws.getCell(r, 2);
    c.value = line.annual;
    styleInput(c, FMT.usd);
    if (i === 0) src(r, "expenseLines");
    r++;
  });
  derived("Total Operating Expenses (yr 1)", `SUM(${cellA1(opexStart, 2)}:${cellA1(r - 1, 2)})`, "TotalBaseOpex", FMT.usd, true);
  input("Management Fee % of EGI", inp.mgmtFeePct, "MgmtFeePct", FMT.pct1, "mgmtFeePct");
  input("Expense Growth %", inp.expenseGrowthPct, "ExpGrowth", FMT.pct1, "expenseGrowthPct", true);

  header("Capital");
  input("Rentable SF", inp.rsf, "RSF", FMT.int, "rsf");
  input("Capital Reserves $/SF/yr", inp.reservesPsf, "ReservesPSF", FMT.psf, "reservesPsf");
  input("Capital Improvements (yr 1)", inp.capitalImprovementsYr1, "CapImprovements", FMT.usd, "capitalImprovementsYr1");
  // The engine charges TI × the building's whole rentable SF in every year
  // (the Cash Flow tab's Tenant Improvements line) — so the label says so,
  // and a per-lease allowance on the space that rolls is not typed in here.
  input("TI $/SF/yr, whole building", inp.tiPsf, "TIPSF", FMT.psf);
  label(ws.getCell(r - 1, 3), "Charged on every SF of the building, every year — not a per-lease allowance", { color: MUTED, size: 9 });
  // The same for the commission: the Cash Flow tab charges it on the year's
  // whole rent, every year, not on the leases that roll.
  input("Leasing Commission % of all rent, every year", inp.lcPct, "LCPct", FMT.pct1);
  label(ws.getCell(r - 1, 3), "Charged on the year's whole rent, every year — not a commission on the leases that roll", { color: MUTED, size: 9 });

  header("Fees");
  input("Asset Management Fee % of equity/yr", inp.amFeePctEquity, "AMFeePctEquity", FMT.pct2, "amFeePctEquity");

  header("Financing");
  // Struck on the acquisition cost — price, closing costs and fee (the Deal
  // Summary's Loan Basis); the capital plan is paid from year-1 cash flow.
  input("Loan to Cost (acquisition cost)", inp.ltc, "LTC", FMT.pct1, "ltc", true);
  input("All-in Rate (index + spread)", inp.allInRatePct, "AllInRate", FMT.pct2, "allInRatePct", true);
  input("Interest-Only Period (months; 999 = full)", inp.ioMonths, "IOMonths", FMT.int, "ioMonths");
  input("Amortization (months)", inp.amortMonths, "AmortMonths", FMT.int, "amortMonths");
  input("Financing Costs % of loan", inp.financingCostPct, "FinCostPct", FMT.pct2, "financingCostPct");

  header("Exit");
  input("Exit Cap", inp.exitCapPct, "ExitCap", FMT.pct2, "exitCapPct", true);
  input("Sale Costs % of price", inp.saleCostPct, "SaleCostPct", FMT.pct1, "saleCostPct");
}

// ── CASH FLOW (ANNUAL) ────────────────────────────────────────────────────────
interface CfMap {
  firstOpCol: number;
  lastOpCol: number;
  fwdCol: number;
  y0Col: number;
  rows: Record<string, number>;
}

/** The Portfolio tab's header row; the properties start on the row under it
 *  (the frozen pane and the tests address it). */
export const PORTFOLIO_HEAD_ROW = 5;

/**
 * The Portfolio tab (#411) — one row a property as the memorandum states it,
 * in blue because each is an input (the OM's figure: type over it and the
 * tab recalculates), a blank where the memorandum states nothing, never a
 * zero. The columns a buyer derives are LIVE formulas off those cells: the
 * allocation per unit and the cap on it (the ALLOCATION's cap — the seller's
 * split, not a value), each property's share of the count, the area and the
 * NOI — each only once EVERY property states that figure, lib/portfolio's
 * rule, so filling the last blank draws the share rather than a share of a
 * partial total — the portfolio's totals under the same rule, and the
 * allocations against the ask. Excel's own data bars on the shares, never a
 * picture: they stay live as the figures change.
 */
function buildPortfolio(ws: ExcelJS.Worksheet, p: PortfolioRead, noun: { one: string; many: string }) {
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const columns: Array<[string, number]> = [
    ["Property", 30],
    ["Address", 38],
    ["Market", 20],
    [cap(noun.many), 10],
    ["Area (SF)", 12],
    ["NOI", 14],
    ["Occupancy", 11],
    ["Year built", 10],
    ["Allocated price", 16],
    [`Allocated / ${cap(noun.one)}`, 15],
    ["Cap on the allocation", 13],
    [`Share of ${noun.many}`, 13],
    ["Share of SF", 12],
    ["Share of NOI", 12],
    ["OM page", 9],
  ];
  columns.forEach(([, w], i) => {
    ws.getColumn(i + 1).width = w;
  });
  titleRow(ws, `The portfolio — ${p.assets.length} properties`);
  label(
    ws.getCell(2, 1),
    "Each property as the memorandum states it (blue: type over a figure and the tab recalculates); a blank is a figure it does not state, never a zero. A share is drawn only once every property states that figure. An allocation is the seller's split of the price, not a value.",
    { color: MUTED, size: 9 },
  );
  const facts = portfolioFacts(p);
  if (facts.length > 0) label(ws.getCell(3, 1), facts.join(" "), { color: INK, size: 9 });

  const head = PORTFOLIO_HEAD_ROW;
  sectionHeader(ws, head, columns[0][0], 1, columns.length);
  columns.forEach(([h], i) => {
    if (i === 0) return;
    const c = ws.getCell(head, i + 1);
    c.value = h.toUpperCase();
    c.font = { name: ARIAL, size: 10, bold: true, color: WHITE };
    c.alignment = { wrapText: true, vertical: "middle" };
  });
  ws.getRow(head).height = 28;

  const first = head + 1;
  const last = head + p.assets.length;
  const col = (letter: string) => `${letter}$${first}:${letter}$${last}`;
  const input = (cell: ExcelJS.Cell, v: number | null, fmt: string) => {
    if (v != null) cell.value = v;
    styleInput(cell, fmt);
  };
  const formula = (cell: ExcelJS.Cell, f: string, fmt: string, bold = false) => {
    cell.value = { formula: f } as ExcelJS.CellFormulaValue;
    styleFormula(cell, fmt, INK, bold);
  };
  // A share of the whole, only once every property states the figure.
  const shareOf = (letter: string, r: number) =>
    `IF(AND(COUNT(${col(letter)})=ROWS(${col(letter)}),SUM(${col(letter)})>0),${letter}${r}/SUM(${col(letter)}),"")`;

  p.assets.forEach((a, i) => {
    const r = first + i;
    label(ws.getCell(r, 1), a.name, { bold: true });
    label(ws.getCell(r, 2), a.address, { size: 9, color: MUTED });
    label(ws.getCell(r, 3), a.market?.name ?? "", { size: 9 });
    input(ws.getCell(r, 4), a.count, FMT.int);
    input(ws.getCell(r, 5), a.area, FMT.int);
    input(ws.getCell(r, 6), a.noi, FMT.usd);
    input(ws.getCell(r, 7), a.occupancy != null ? a.occupancy / 100 : null, FMT.pct1);
    input(ws.getCell(r, 8), a.yearBuilt, "0");
    input(ws.getCell(r, 9), a.allocated, FMT.usd);
    formula(ws.getCell(r, 10), `IF(AND(ISNUMBER(I${r}),ISNUMBER(D${r}),D${r}>0),I${r}/D${r},"")`, FMT.usd);
    formula(ws.getCell(r, 11), `IF(AND(ISNUMBER(F${r}),ISNUMBER(I${r}),I${r}>0),F${r}/I${r},"")`, FMT.pct2);
    formula(ws.getCell(r, 12), shareOf("D", r), FMT.pct1);
    formula(ws.getCell(r, 13), shareOf("E", r), FMT.pct1);
    formula(ws.getCell(r, 14), shareOf("F", r), FMT.pct1);
    label(ws.getCell(r, 15), a.page, { size: 9, color: MUTED });
    if (i % 2 === 1) {
      for (let c = 1; c <= columns.length; c++) {
        ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDFILL } };
      }
    }
  });

  // The portfolio's totals — each only when every property states it.
  const total = last + 1;
  label(ws.getCell(total, 1), "Portfolio", { bold: true });
  const sumIfAll = (letter: string) => `IF(COUNT(${col(letter)})=ROWS(${col(letter)}),SUM(${col(letter)}),"")`;
  formula(ws.getCell(total, 4), sumIfAll("D"), FMT.int, true);
  formula(ws.getCell(total, 5), sumIfAll("E"), FMT.int, true);
  formula(ws.getCell(total, 6), sumIfAll("F"), FMT.usd, true);
  formula(ws.getCell(total, 9), sumIfAll("I"), FMT.usd, true);
  formula(ws.getCell(total, 10), `IF(AND(ISNUMBER(I${total}),ISNUMBER(D${total}),D${total}>0),I${total}/D${total},"")`, FMT.usd, true);
  formula(ws.getCell(total, 11), `IF(AND(ISNUMBER(F${total}),ISNUMBER(I${total}),I${total}>0),F${total}/I${total},"")`, FMT.pct2, true);
  for (let c = 1; c <= columns.length; c++) {
    ws.getCell(total, c).border = { top: { style: "thin", color: { argb: LINE } } };
  }

  // The allocations against the ask: the memorandum's own check.
  const ask = total + 2;
  label(ws.getCell(ask, 1), "Asking price — the memorandum's, for the whole", { bold: true });
  input(ws.getCell(ask, 9), p.askingPrice, FMT.usd);
  const gap = ask + 1;
  label(ws.getCell(gap, 1), "Allocations against the ask", { bold: true });
  label(ws.getCell(gap, 2), "Above a percent either way, the allocation does not add up to the price — put it to the broker.", {
    size: 9,
    color: MUTED,
  });
  formula(ws.getCell(gap, 9), `IF(AND(ISNUMBER(I${total}),ISNUMBER(I${ask}),I${ask}>0),I${total}/I${ask}-1,"")`, FMT.pct1, true);

  // Excel's own data bars on the three shares, from zero to the whole (1,
  // 100%), so a property's bar fills its share of the cell — a 53% share
  // half the cell, as on the deal page's card and the report's page. Scaled
  // to the column's largest share, a 53% share filled 97% of it.
  for (const letter of ["L", "M", "N"]) {
    ws.addConditionalFormatting({
      ref: `${letter}${first}:${letter}${last}`,
      rules: [
        {
          type: "dataBar",
          priority: 1,
          gradient: false,
          minLength: 0,
          maxLength: 100,
          showValue: true,
          border: false,
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: 1 },
          ],
          color: { argb: "FFB5CDC9" },
        } as unknown as ExcelJS.ConditionalFormattingRule,
      ],
    });
  }
}

/**
 * The Market Read tab — the model's assumptions against the published
 * figures as the deal page's card and the report print them, one row a
 * published figure: the assumption, the model's figure and where it came
 * from, the figure with its date and publisher (the value raw, so it sorts
 * and computes), the read, and the sentence. Data only, no formulas: it
 * says what the assumptions were checked against on the day the workbook
 * was built, and the Assumptions tab stays the live model.
 */
function buildMarketRead(ws: ExcelJS.Worksheet, read: ModelVsMarket) {
  [24, 12, 26, 56, 10, 12, 18, 30, 110].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  titleRow(ws, "Assumptions against the published figures");
  // The deal page's card's own words (lib/model-vs-market-scope): the
  // published figures for the market or the state, and the nation's — the
  // day in the card's own format ("Sep 21, 2026"), never the ISO key.
  label(ws.getCell(2, 1), readScope(read, datedLong(read.readOn)), { color: MUTED, size: 9 });
  label(
    ws.getCell(3, 1),
    `A trailing year is what an assumption is being asked to beat, not a forecast; ${readGrainNote(read)} The model's figures are the Assumptions tab's as built; change them there.`,
    { color: MUTED, size: 9 },
  );
  const headers = ["Assumption", "Model", "Model source", "Published figure", "Figure", "As of", "Publisher", "Read", "What the figures say"];
  sectionHeader(ws, 5, headers[0], 1, headers.length);
  headers.forEach((h, i) => {
    if (i === 0) return;
    const c = ws.getCell(5, i + 1);
    c.value = h.toUpperCase();
    c.font = { name: ARIAL, size: 10, bold: true, color: WHITE };
  });
  let r = 6;
  for (const c of read.checks) {
    const figures = c.published.length > 0 ? c.published : [null];
    figures.forEach((p, i) => {
      if (i === 0) {
        label(ws.getCell(r, 1), c.title, { bold: true });
        label(ws.getCell(r, 2), c.model);
        label(ws.getCell(r, 3), c.modelSource, { color: MUTED, size: 9 });
        label(ws.getCell(r, 8), c.toneLabel);
        const s = ws.getCell(r, 9);
        s.value = c.read;
        s.font = { name: ARIAL, size: 9, color: MUTED };
        s.alignment = { wrapText: true, vertical: "top" };
      }
      if (p) {
        label(ws.getCell(r, 4), `${p.label}: ${p.text}`, { size: 9 });
        const v = ws.getCell(r, 5);
        // Raw, so it sorts and computes, and shown in its unit: a published
        // figure is a percent change or a level in percent (PublishedFigure),
        // so the format's "%" is a literal, never Excel's ×100 percent.
        v.value = p.value;
        v.numFmt = '0.00"%"';
        v.font = { name: ARIAL, size: 10, color: INK };
        // A feed's observation day is a date, so the column sorts by it; a
        // research figure's period ("Q1 2026", "undated") stays as written,
        // and so does a day that does not exist, never rolled into another.
        const day = /^\d{4}-\d{2}-\d{2}$/.test(p.asOf) ? Date.parse(`${p.asOf}T00:00:00Z`) : NaN;
        const asOf = ws.getCell(r, 6);
        if (Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === p.asOf) {
          asOf.value = new Date(day);
          asOf.numFmt = "mmm d, yyyy";
          asOf.font = { name: ARIAL, size: 9, color: INK };
          asOf.alignment = { horizontal: "left" };
        } else {
          label(asOf, p.asOf, { size: 9 });
        }
        label(ws.getCell(r, 7), p.publisher, { size: 9, color: MUTED });
      }
      r++;
    });
    bottomBorder(ws, r - 1, 1, headers.length);
  }
}

function buildCashFlow(ws: ExcelJS.Worksheet, inp: UnderwriteInputs, holdYears: number): CfMap {
  ws.getColumn(1).width = 36;
  const y0Col = 2;
  const firstOpCol = 3;
  const lastOpCol = firstOpCol + holdYears - 1;
  const fwdCol = lastOpCol + 1;
  for (let c = y0Col; c <= fwdCol; c++) ws.getColumn(c).width = 14;

  titleRow(ws, "Cash Flow");
  for (let y = 0; y <= holdYears + 1; y++) {
    const c = ws.getCell(1, y0Col + y);
    c.value = y;
    c.font = { name: ARIAL, size: 10, bold: true, color: INK };
    c.alignment = { horizontal: "right" };
  }
  label(ws.getCell(2, 1), "Year", { bold: true });
  for (let y = 0; y <= holdYears + 1; y++) {
    const c = ws.getCell(2, y0Col + y);
    // The year after the hold is not a year owned: its NOI is the one the
    // exit cap capitalises into the sale (the Deal Summary's Residual NOI),
    // and the header says so.
    c.value = { formula: y === holdYears + 1 ? `"Yr "&${y}&" (exit NOI)"` : `"Yr "&${y}` } as ExcelJS.CellFormulaValue;
    c.font = { name: ARIAL, size: 8, color: MUTED };
    c.alignment = { horizontal: "right" };
  }

  const rows: Record<string, number> = {};
  // Body rows in order, for zebra striping after the ladder is built —
  // readability on a 20-line ladder without touching any formula anchor.
  const bodyRows: number[] = [];
  let r = 4;
  const at = (key: string, col: number) => cellA1(rows[key], col);
  const prev = (col: number) => cellA1(r, col - 1);

  const line = (
    key: string,
    text: string,
    formulaFor: (col: number, y: number) => string | null,
    fmt: string,
    opts: { bold?: boolean; y0?: string; fwd?: boolean } = {},
  ) => {
    rows[key] = r;
    bodyRows.push(r);
    label(ws.getCell(r, 1), text, { bold: opts.bold });
    if (opts.y0) {
      ws.getCell(r, y0Col).value = { formula: opts.y0 } as ExcelJS.CellFormulaValue;
      styleFormula(ws.getCell(r, y0Col), fmt, INK, opts.bold);
    }
    for (let y = 1; y <= holdYears; y++) {
      const col = firstOpCol + (y - 1);
      const f = formulaFor(col, y);
      if (f == null) continue;
      ws.getCell(r, col).value = { formula: f } as ExcelJS.CellFormulaValue;
      styleFormula(ws.getCell(r, col), fmt, INK, opts.bold);
    }
    if (opts.fwd) {
      const f = formulaFor(fwdCol, holdYears + 1);
      if (f != null) {
        ws.getCell(r, fwdCol).value = { formula: f } as ExcelJS.CellFormulaValue;
        styleFormula(ws.getCell(r, fwdCol), fmt, INK, opts.bold);
      }
    }
    if (opts.bold) bottomBorder(ws, r, 1, fwdCol);
    r++;
  };

  sectionHeader(ws, r, "Property Cash Flow", 1, fwdCol);
  r++;
  line("rent", "Rental Revenue", (col, y) => (y === 1 ? "InPlaceRent" : `${prev(col)}*(1+RentGrowth)`), FMT.usd, { fwd: true });
  line("recoveries", "Expense Recoveries", (col, y) => (y === 1 ? "Recoveries" : `${prev(col)}*(1+ExpGrowth)`), FMT.usd, { fwd: true });
  line("other", "Other Revenue", (col, y) => (y === 1 ? "OtherRev" : `${prev(col)}*(1+RentGrowth)`), FMT.usd, { fwd: true });
  line("pgr", "Potential Gross Revenue", (col) => `${at("rent", col)}+${at("recoveries", col)}+${at("other", col)}`, FMT.usd, { bold: true, fwd: true });
  line("vacancy", "General Vacancy & Credit Loss", (col) => `-${at("pgr", col)}*VacancyPct`, FMT.usd, { fwd: true });
  line("egr", "Effective Gross Revenue", (col) => `${at("pgr", col)}+${at("vacancy", col)}`, FMT.usd, { bold: true, fwd: true });
  line("opex", "Operating Expenses (incl. mgmt fee)", (col, y) => `-(TotalBaseOpex*(1+ExpGrowth)^(${y}-1)+${at("egr", col)}*MgmtFeePct)`, FMT.usd, { fwd: true });
  line("noi", "Net Operating Income", (col) => `${at("egr", col)}+${at("opex", col)}`, FMT.usd, { bold: true, fwd: true });
  line("ti", "Tenant Improvements", () => `-TIPSF*RSF`, FMT.usd);
  line("lc", "Leasing Commissions", (col) => `-LCPct*${at("rent", col)}`, FMT.usd);
  line("reserves", "Capital Reserves", (col, y) => `-ReservesPSF*RSF*(1+ExpGrowth)^(${y}-1)`, FMT.usd);
  line("capimp", "Capital Improvements", (col, y) => (y === 1 ? "-CapImprovements" : "0"), FMT.usd);
  line("totalcapex", "Total Capital Expenditures", (col) => `${at("ti", col)}+${at("lc", col)}+${at("reserves", col)}+${at("capimp", col)}`, FMT.usd, { bold: true });
  line("amfee", "Asset Management Fees", () => `-Equity*AMFeePctEquity`, FMT.usd);
  line("pcf", "Property Cash Flow Before Debt", (col) => `${at("noi", col)}+${at("totalcapex", col)}+${at("amfee", col)}`, FMT.usd, { bold: true });
  line("debt", "Debt Service Payments", (col, y) => `-IF(${y}<=IOMonths/12,LoanAmount*AllInRate,MonthlyPmt*12)`, FMT.usd);
  line("levcf", "Levered Cash Flow", (col) => `${at("pcf", col)}+${at("debt", col)}`, FMT.usd, { bold: true });

  r++;
  sectionHeader(ws, r, "Metrics", 1, fwdCol);
  r++;
  line("dscr", "DSCR (NOI)", (col) => `IF(${at("debt", col)}=0,"n/a",${at("noi", col)}/-${at("debt", col)})`, FMT.ratio);
  line("debtyield", "Debt Yield", (col) => `IF(LoanAmount=0,"n/a",${at("noi", col)}/LoanAmount)`, FMT.pct1);

  r++;
  sectionHeader(ws, r, "Investment Cash Flow", 1, fwdCol);
  r++;
  line("unlev", "Unlevered Investment Cash Flow",
    (col, y) => {
      const base = `${at("noi", col)}+${at("totalcapex", col)}`;
      return y === holdYears ? `${base}+(GrossSale-GrossSale*SaleCostPct)` : base;
    },
    FMT.usd, { bold: true, y0: "-(PurchasePrice+ClosingCostsTotal+AcqFee)" });
  line("lev", "Levered Investment Cash Flow",
    (col, y) => (y === holdYears ? `${at("levcf", col)}+NetSaleProceeds` : `${at("levcf", col)}`),
    FMT.usd, { bold: true, y0: "-Equity" });

  // Zebra: every other body row gets the light band, full ladder width.
  // Fill only — borders, fonts, and formulas are untouched.
  bodyRows.forEach((rowNum, i) => {
    if (i % 2 === 0) return;
    for (let c2 = 1; c2 <= fwdCol; c2++) {
      ws.getCell(rowNum, c2).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BANDFILL },
      };
    }
  });

  // Data bars across the two rows a reader follows year by year — NOI and
  // levered cash flow — over the operating years only: the forward year is
  // the reversion's input, not a year owned, and the sale proceeds sit on
  // their own vector row, so the bar compares like with like. Excel draws
  // these off the formulas and keeps them live; nothing is computed into a
  // cell.
  for (const key of ["noi", "levcf"]) {
    ws.addConditionalFormatting({
      ref: `${cellA1(rows[key], firstOpCol)}:${cellA1(rows[key], lastOpCol)}`,
      rules: [
        {
          type: "dataBar",
          priority: 1,
          gradient: false,
          minLength: 0,
          maxLength: 100,
          showValue: true,
          border: false,
          cfvo: [{ type: "min" }, { type: "max" }],
          // The bar's colour rides the rule's model even though the typing
          // omits it (exceljs writes it as the databar's <color>).
          color: { argb: "FFB5CDC9" },
        } as unknown as ExcelJS.ConditionalFormattingRule,
      ],
    });
  }

  return { firstOpCol, lastOpCol, fwdCol, y0Col, rows };
}

// ── DEAL SUMMARY ────────────────────────────────────────────────────────────
function buildDealSummary(ws: ExcelJS.Worksheet, model: DerivedModel, cf: CfMap, holdYears: number) {
  const { meta } = model;
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 3;
  ws.getColumn(4).width = 30;
  ws.getColumn(5).width = 18;
  titleRow(ws, meta.dealName);

  const cfAddr = (row: number, col: number) => `'Cash Flow'!${cellA1(row, col)}`;
  const noiY1 = cfAddr(cf.rows.noi, cf.firstOpCol);
  const noiFwd = cfAddr(cf.rows.noi, cf.fwdCol);
  const dscrY1 = cfAddr(cf.rows.dscr, cf.firstOpCol);
  const unlevRange = `'Cash Flow'!${cellA1(cf.rows.unlev, cf.y0Col)}:${cellA1(cf.rows.unlev, cf.lastOpCol)}`;
  const levRange = `'Cash Flow'!${cellA1(cf.rows.lev, cf.y0Col)}:${cellA1(cf.rows.lev, cf.lastOpCol)}`;
  const unlevOps = `'Cash Flow'!${cellA1(cf.rows.unlev, cf.firstOpCol)}:${cellA1(cf.rows.unlev, cf.lastOpCol)}`;
  const levcfRange = `'Cash Flow'!${cellA1(cf.rows.levcf, cf.firstOpCol)}:${cellA1(cf.rows.levcf, cf.lastOpCol)}`;
  const levcfY1 = cfAddr(cf.rows.levcf, cf.firstOpCol);

  // ── KPI BAND ── five headline tiles the IC reads first. Values are live
  // formulas over the same named cells the rest of the book uses.
  let r = 3;
  const kpis: [string, string, string][] = [
    ["Purchase Price", "PurchasePrice", FMT.usd],
    ["Levered IRR", `IFERROR(IRR(${levRange}),"—")`, FMT.pct1],
    ["Equity Multiple", `IF(Equity=0,"n/a",(SUM(${levcfRange})+NetSaleProceeds)/Equity)`, FMT.mult],
    ["Year-1 Cash-on-Cash", `IF(Equity=0,"n/a",${levcfY1}/Equity)`, FMT.pct1],
    ["Year-1 DSCR", dscrY1, FMT.ratio],
  ];
  // Tiles live in columns 1,2,4,5 + one merged pair — keep it simple: five
  // tiles across columns 1..5 with the spacer col 3 carrying the middle tile.
  ws.getColumn(3).width = 18;
  const tileEdge = { style: "thin" as const, color: { argb: LINE } };
  kpis.forEach(([lab, formula, fmt], i) => {
    const col = 1 + i;
    const l = ws.getCell(r, col);
    l.value = lab.toUpperCase();
    l.font = { name: ARIAL, size: 8, bold: true, color: MUTED };
    l.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDFILL } };
    l.alignment = { horizontal: "center", vertical: "middle" };
    // Outlined as a tile pair: label carries the top edge, value the bottom.
    l.border = { top: tileEdge, left: tileEdge, right: tileEdge };
    const v = ws.getCell(r + 1, col);
    v.value = { formula } as ExcelJS.CellFormulaValue;
    v.font = { name: ARIAL, size: 13, bold: true, color: BRAND };
    v.numFmt = fmt;
    v.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDFILL } };
    v.alignment = { horizontal: "center", vertical: "middle" };
    v.border = { bottom: tileEdge, left: tileEdge, right: tileEdge };
  });
  ws.getRow(r).height = 14;
  ws.getRow(r + 1).height = 24;
  const dealKind = meta.strategy ?? "unknown";
  const planDeal = dealKind !== "unknown" && isPlanDeal(dealKind);
  if (planDeal) {
    // On a plan deal the tiles are the screening model's returns, struck
    // with the whole budget in year 1 — the deal page's own caveat, said
    // under them before anyone quotes one.
    const row = r + 2;
    ws.mergeCells(row, 1, row, 5);
    const c = ws.getCell(row, 1);
    c.value = PLAN_RETURNS_CAVEAT_WORKBOOK;
    c.font = { name: ARIAL, size: 9, color: MUTED };
    c.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(row).height = 36;
    r += 4;
  } else {
    r += 3;
  }

  // ── PROJECT OVERVIEW ──
  sectionHeader(ws, r, "Project Overview", 1, 5); r++;
  // The deal's facts are text written into the file, as the Cover prints
  // them — plain, never the green the legend keeps for a link to another tab.
  label(ws.getCell(r, 1), "Building Name"); label(ws.getCell(r, 2), meta.dealName);
  label(ws.getCell(r, 4), "Asset Class"); label(ws.getCell(r, 5), meta.assetClass); r++;
  label(ws.getCell(r, 1), "Address"); label(ws.getCell(r, 2), meta.address || "—");
  label(ws.getCell(r, 4), "Market"); label(ws.getCell(r, 5), meta.market || "—"); r++;
  // A size the documents do not state is the count × a typical unit or a
  // placeholder (the Assumptions tab names which) — marked here as the
  // Operating Metrics tab marks it by leaving its per-SF figures out.
  label(ws.getCell(r, 1), model.sources.rsf?.provenance === "assumption" ? "Rentable SF (assumed)" : "Rentable SF");
  ws.getCell(r, 2).value = { formula: "RSF" } as ExcelJS.CellFormulaValue; styleLink(ws.getCell(r, 2), FMT.int);
  label(ws.getCell(r, 4), "In-Place Occupancy");
  // The documents' figure, typed in: an input's blue (it is read for the
  // vacancy at export; nothing in the book reads this cell).
  if (meta.occupancyPct != null) { ws.getCell(r, 5).value = meta.occupancyPct; styleInput(ws.getCell(r, 5), FMT.pct1); }
  else label(ws.getCell(r, 5), "n/a", { color: MUTED });
  // Deal type, and on a plan deal the budget the returns have to pay for —
  // a live link to the Assumptions cell, so flexing it flows through.
  if (dealKind !== "unknown") {
    r++;
    // Whose strategy it is on a note or a leased fee, as the cover says it.
    label(ws.getCell(r, 1), "Deal Type"); label(ws.getCell(r, 2), dealTypeLabelFor(STRATEGY_LABEL[dealKind], meta.interest?.kind));
    if (planDeal) {
      label(ws.getCell(r, 4), "Capital Budget (yr 1)");
      ws.getCell(r, 5).value = { formula: "CapImprovements" } as ExcelJS.CellFormulaValue; styleLink(ws.getCell(r, 5), FMT.usd);
      // The plan's own yardstick, as an input beside the budget: the OM's
      // stabilized pro forma NOI (the finished project's figure, never year
      // 1's) and the total cost it sits over — uses plus the capital plan.
      // The return block below reads both; the year-1 cap stays labelled as
      // the cap on modelled year-1 income, which on a plan deal it is.
      r++;
      label(ws.getCell(r, 1), "OM Stabilized NOI (pro forma)");
      const noiCell = ws.getCell(r, 2);
      if (meta.stabilizedNoi) {
        // The OM's figure typed in, which the yield below reads: an input.
        noiCell.value = meta.stabilizedNoi.value;
        styleInput(noiCell, FMT.usd);
        noiCell.alignment = { horizontal: "right" };
        label(ws.getCell(r, 3), meta.stabilizedNoi.page ? `OM ${meta.stabilizedNoi.page}` : "OM", { color: MUTED, size: 9 });
      } else {
        // A blank is null, never zero: the OM stated no stabilized figure.
        label(noiCell, "not stated", { color: MUTED });
      }
      noiCell.name = "StabilizedNOI";
      label(ws.getCell(r, 4), "Total Cost (uses + capital plan)");
      const tcCell = ws.getCell(r, 5);
      tcCell.value = { formula: "TotalUses+CapImprovements" } as ExcelJS.CellFormulaValue;
      tcCell.name = "TotalCost";
      styleFormula(tcCell, FMT.usd);
    }
  }
  r += 2;

  // ── SOURCES & USES ──
  sectionHeader(ws, r, "Sources", 1, 2);
  sectionHeader(ws, r, "Uses", 4, 5); r++;
  const rowStart = r;
  const usesRow = (rr: number, lab: string, formula: string, name?: string, bold = false) => {
    label(ws.getCell(rr, 4), lab, { bold, indent: 1 });
    const c = ws.getCell(rr, 5);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    if (name) c.name = name;
    styleFormula(c, FMT.usd, INK, bold);
  };
  // Uses = acquisition cost + financing. Capital improvements / TI / LC are
  // OPERATING outflows in the Cash Flow ladder, not capitalized here — folding
  // them into uses AND the ladder would double-count them.
  usesRow(r, "Purchase Price", "PurchasePrice"); r++;
  usesRow(r, "DD / Closing Costs", "ClosingCostsTotal"); r++;
  usesRow(r, "Acquisition Fee", "MIN(AcqFeePct*PurchasePrice,AcqFeeCap)", "AcqFee"); r++;
  usesRow(r, "Loan Basis (acquisition cost)", `SUM(${cellA1(rowStart, 5)}:${cellA1(r - 1, 5)})`, "LoanBasis"); r++;
  usesRow(r, "Financing Costs", "FinCostPct*LoanAmount", "FinancingCosts"); r++;
  usesRow(r, "TOTAL USES", "LoanBasis+FinancingCosts", "TotalUses", true);
  r++;

  // Sources block (rows aligned to Uses start)
  let sr = rowStart;
  const srcRow = (lab: string, formula: string, name?: string, bold = false) => {
    label(ws.getCell(sr, 1), lab, { bold, indent: 1 });
    const c = ws.getCell(sr, 2);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    if (name) c.name = name;
    styleFormula(c, FMT.usd, INK, bold);
    sr++;
  };
  srcRow("Initial Loan Proceeds", "LTC*LoanBasis", "LoanAmount");
  srcRow("Sponsor Equity", "TotalUses-LoanAmount", "Equity");
  srcRow("TOTAL SOURCES", "LoanAmount+Equity", "TotalSources", true);
  label(ws.getCell(sr, 1), "Sources = Uses", { bold: true });
  const chk = ws.getCell(sr, 2);
  chk.value = { formula: "ROUND(TotalSources,0)=ROUND(TotalUses,0)" } as ExcelJS.CellFormulaValue;
  chk.name = "CheckSU";
  chk.font = { name: ARIAL, size: 10, bold: true };
  ws.addConditionalFormatting({
    ref: chk.address,
    rules: [
      { type: "cellIs", operator: "equal", priority: 1, formulae: ['FALSE'], style: { font: { color: { argb: "FFB23A30" }, bold: true } } },
      { type: "cellIs", operator: "equal", priority: 2, formulae: ['TRUE'], style: { font: { color: { argb: "FF1B7A5E" }, bold: true } } },
    ],
  });
  // The capital plan is neither a source nor a use here: the engine spends
  // it in year 1's cash flow (the Cash Flow tab's Capital Improvements line),
  // so the loan is struck on the acquisition cost and the equity above
  // leaves it out. Said under Sources, with the budget linked.
  sr++;
  label(ws.getCell(sr, 1), "Capital Plan (yr 1)", { indent: 1 });
  const capPlan = ws.getCell(sr, 2);
  capPlan.value = { formula: "CapImprovements" } as ExcelJS.CellFormulaValue;
  styleLink(capPlan, FMT.usd);
  sr++;
  label(ws.getCell(sr, 1), "paid from year-1 cash flow, not these sources", { indent: 1, size: 9, color: MUTED });
  r = Math.max(r, sr) + 2;

  // Monthly payment helper (named), mirrors engine.monthlyPayment.
  label(ws.getCell(r, 1), "Monthly Debt Payment", { indent: 1 });
  ws.getCell(r, 2).value = { formula: "IF(AllInRate=0,LoanAmount/AmortMonths,LoanAmount*(AllInRate/12)/(1-(1+AllInRate/12)^(-AmortMonths)))" } as ExcelJS.CellFormulaValue;
  ws.getCell(r, 2).name = "MonthlyPmt";
  styleFormula(ws.getCell(r, 2), FMT.usd);
  r += 2;

  // ── RESIDUAL + RETURN SUMMARY ──
  sectionHeader(ws, r, "Residual Sale Value", 1, 2);
  sectionHeader(ws, r, "Return Summary", 4, 5); r++;
  const resTop = r;
  const resRow = (lab: string, formula: string, fmt: string, name?: string, link = false, bold = false) => {
    label(ws.getCell(r, 1), lab, { bold, indent: 1 });
    const c = ws.getCell(r, 2);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    if (name) c.name = name;
    if (link) styleLink(c, fmt);
    else styleFormula(c, fmt, INK, bold);
    r++;
  };
  resRow("Residual NOI (forward)", noiFwd, FMT.usd, undefined, true);
  resRow("Exit Cap", "ExitCap", FMT.pct2, undefined, true);
  resRow("Gross Sale Proceeds", `IF(ExitCap=0,0,${noiFwd}/ExitCap)`, FMT.usd, "GrossSale");
  resRow("Sale Costs", "GrossSale*SaleCostPct", FMT.usd, "SaleCosts");
  // Guard rate=0 (interest-free) so the amortization closed form never divides
  // by zero — mirrors engine.loanBalanceAtExit's r===0 branch.
  resRow("Outstanding Debt", "IF(HoldMonths<=IOMonths,LoanAmount,IF(AllInRate=0,MAX(0,LoanAmount-MonthlyPmt*(HoldMonths-IOMonths)),LoanAmount*(1+AllInRate/12)^(HoldMonths-IOMonths)-MonthlyPmt*(((1+AllInRate/12)^(HoldMonths-IOMonths)-1)/(AllInRate/12))))", FMT.usd, "OutstandingDebt");
  resRow("Net Sale Proceeds", "GrossSale-SaleCosts-OutstandingDebt", FMT.usd, "NetSaleProceeds", false, true);

  let rr = resTop;
  const ret = (lab: string, formula: string, fmt: string, name?: string) => {
    label(ws.getCell(rr, 4), lab, { indent: 1 });
    const c = ws.getCell(rr, 5);
    c.value = { formula } as ExcelJS.CellFormulaValue;
    if (name) c.name = name;
    styleFormula(c, fmt);
    rr++;
  };
  if (planDeal) {
    // A plan deal has no going-in cap: year-1 income here is in-place or
    // assumed, so the cell says what it is. The yield the plan is judged on
    // is the OM's stabilized NOI over total cost — never year-1 NOI over
    // uses that leave the budget out. This cell's total cost is the uses
    // (price, closing, fees) plus the capital plan, so it reads a little
    // under the deal page's, the memo's and the report's, which divide by
    // the price plus the budget; the label says which.
    ret("Cap on Yr-1 Income (as modelled)", `IF(PurchasePrice=0,"n/a",${noiY1}/PurchasePrice)`, FMT.pct2);
    ret(
      "Yield on Cost (OM stabilized NOI / uses + capital plan)",
      `IF(OR(NOT(ISNUMBER(StabilizedNOI)),TotalCost=0),"n/a",StabilizedNOI/TotalCost)`,
      FMT.pct2,
      "YieldOnCost",
    );
  } else {
    // The model's year-1 NOI over the price — not the OM's stated cap, which
    // the deal's header and cards print; the label says which it is.
    ret("Going-In Cap (Yr-1 NOI / Price)", `IF(PurchasePrice=0,"n/a",${noiY1}/PurchasePrice)`, FMT.pct2);
    ret("Stabilized Yield (on cost)", `IF(TotalUses=0,"n/a",${noiY1}/TotalUses)`, FMT.pct2);
  }
  ret("Unlevered IRR", `IFERROR(IRR(${unlevRange}),"check inputs")`, FMT.pct1);
  ret("Levered IRR", `IFERROR(IRR(${levRange}),"check inputs")`, FMT.pct1, "LeveredIRR");
  ret("Unlevered Equity Multiple", `IF((PurchasePrice+ClosingCostsTotal+AcqFee)=0,"n/a",(SUM(${unlevOps}))/(PurchasePrice+ClosingCostsTotal+AcqFee))`, FMT.mult);
  ret("Levered Equity Multiple", `IF(Equity=0,"n/a",(SUM(${levcfRange})+NetSaleProceeds)/Equity)`, FMT.mult, "LeveredEM");
  r = Math.max(r, rr) + 1;

  label(ws.getCell(r, 1), "Sensitivity matrices live on the Sensitivity tab; monthly detail and the amortization table on their own tabs.", { color: MUTED, size: 9 });
  void holdYears;
}

// ── MONTHLY CASH FLOW ─────────────────────────────────────────────────────────
/**
 * Monthly operating detail at the model's ANNUAL convention ÷ 12 — every
 * month of operating year y shows one-twelfth of that year's annual line, and
 * debt service follows the annual IO-by-operating-year convention, so each
 * year's twelve months SUM EXACTLY to the annual tab (the tie row proves it
 * in-sheet). The Debt Schedule tab carries the exact month-by-month
 * amortization for balances and payoff.
 */
function buildMonthlyCashFlow(ws: ExcelJS.Worksheet, cf: CfMap, inp: UnderwriteInputs, holdYears: number) {
  const holdMonths = holdYears * 12;
  ws.getColumn(1).width = 34;
  const firstCol = 2;
  for (let m = 1; m <= holdMonths; m++) ws.getColumn(firstCol + m - 1).width = 12;

  titleRow(ws, "Monthly Cash Flow");
  label(ws.getCell(1, 3), "annual convention ÷ 12 — each year ties to the Cash Flow tab", { color: MUTED, size: 9 });
  label(ws.getCell(2, 1), "Month", { bold: true });
  label(ws.getCell(3, 1), "Operating Year", { bold: true, color: MUTED, size: 9 });
  for (let m = 1; m <= holdMonths; m++) {
    const col = firstCol + m - 1;
    const mc = ws.getCell(2, col);
    mc.value = m;
    mc.font = { name: ARIAL, size: 9, bold: true, color: INK };
    mc.alignment = { horizontal: "right" };
    const yc = ws.getCell(3, col);
    yc.value = `Yr ${Math.ceil(m / 12)}`;
    yc.font = { name: ARIAL, size: 8, color: MUTED };
    yc.alignment = { horizontal: "right" };
  }

  const annual = (key: string, y: number) => `'Cash Flow'!${cellA1(cf.rows[key], cf.firstOpCol + y - 1)}`;

  let r = 5;
  const rows: Record<string, number> = {};
  const line = (
    key: string,
    text: string,
    monthly: (m: number, y: number) => string,
    opts: { bold?: boolean } = {},
  ) => {
    rows[key] = r;
    label(ws.getCell(r, 1), text, { bold: opts.bold });
    for (let m = 1; m <= holdMonths; m++) {
      const y = Math.ceil(m / 12);
      const c = ws.getCell(r, firstCol + m - 1);
      c.value = { formula: monthly(m, y) } as ExcelJS.CellFormulaValue;
      styleFormula(c, FMT.usd, INK, opts.bold);
      c.font = { ...c.font, size: 9 };
    }
    if (opts.bold) bottomBorder(ws, r, 1, firstCol + holdMonths - 1);
    r++;
  };

  sectionHeader(ws, r, "Property Cash Flow (monthly)", 1, Math.min(firstCol + holdMonths - 1, 14));
  r++;
  line("rent", "Rental Revenue", (_m, y) => `${annual("rent", y)}/12`);
  line("recoveries", "Expense Recoveries", (_m, y) => `${annual("recoveries", y)}/12`);
  line("other", "Other Revenue", (_m, y) => `${annual("other", y)}/12`);
  line("pgr", "Potential Gross Revenue", (_m, y) => `${annual("pgr", y)}/12`, { bold: true });
  line("vacancy", "General Vacancy & Credit Loss", (_m, y) => `${annual("vacancy", y)}/12`);
  line("egr", "Effective Gross Revenue", (_m, y) => `${annual("egr", y)}/12`, { bold: true });
  line("opex", "Operating Expenses (incl. mgmt fee)", (_m, y) => `${annual("opex", y)}/12`);
  line("noi", "Net Operating Income", (_m, y) => `${annual("noi", y)}/12`, { bold: true });
  line("capex", "Total Capital Expenditures", (_m, y) => `${annual("totalcapex", y)}/12`);
  line("amfee", "Asset Management Fees", (_m, y) => `${annual("amfee", y)}/12`);
  line("pcf", "Property Cash Flow Before Debt", (_m, y) => `${annual("pcf", y)}/12`, { bold: true });
  // Debt at the annual convention (IO by operating year) so the tie holds for
  // every input; the exact split lives on the Debt Schedule tab.
  line("debt", "Debt Service (annual convention)", (_m, y) => `-IF(${y}<=IOMonths/12,LoanAmount*AllInRate/12,MonthlyPmt)`);
  line("levcf", "Levered Cash Flow", (_m, y) => `(${annual("pcf", y)}/12)-IF(${y}<=IOMonths/12,LoanAmount*AllInRate/12,MonthlyPmt)`, { bold: true });

  // Tie row: at each year's December column, TRUE iff the year's 12 months sum
  // to the annual tab's levered cash flow (rounded to the dollar).
  r++;
  rows.tie = r;
  label(ws.getCell(r, 1), "Ties to annual Cash Flow", { bold: true, color: MUTED, size: 9 });
  for (let y = 1; y <= holdYears; y++) {
    const decCol = firstCol + y * 12 - 1;
    const from = cellA1(rows.levcf, firstCol + (y - 1) * 12);
    const to = cellA1(rows.levcf, decCol);
    const c = ws.getCell(r, decCol);
    c.value = { formula: `ROUND(SUM(${from}:${to})-${annual("levcf", y)},0)=0` } as ExcelJS.CellFormulaValue;
    c.font = { name: ARIAL, size: 9, bold: true };
    c.alignment = { horizontal: "right" };
    ws.addConditionalFormatting({
      ref: c.address,
      rules: [
        { type: "cellIs", operator: "equal", priority: 1, formulae: ["FALSE"], style: { font: { color: { argb: "FFB23A30" }, bold: true } } },
        { type: "cellIs", operator: "equal", priority: 2, formulae: ["TRUE"], style: { font: { color: { argb: "FF1B7A5E" }, bold: true } } },
      ],
    });
  }
  void inp;
}

// ── DEBT SCHEDULE ─────────────────────────────────────────────────────────────
/**
 * Exact month-by-month amortization: interest-only through IOMonths, then the
 * fixed payment splits into interest + principal off the running balance. The
 * exit-month balance ties to the Deal Summary's closed-form Outstanding Debt
 * (CheckDebtTie) — same math, iterated vs closed form.
 */
function buildDebtSchedule(ws: ExcelJS.Worksheet, inp: UnderwriteInputs) {
  const holdMonths = Math.max(1, inp.holdMonths);
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 10;
  for (let c = 3; c <= 7; c++) ws.getColumn(c).width = 16;

  titleRow(ws, "Debt Schedule");
  label(ws.getCell(1, 3), "exact monthly amortization — exit payoff ties to Deal Summary", { color: MUTED, size: 9 });

  const headRow = 3;
  const heads = ["Month", "Op Year", "Beginning Balance", "Payment", "Interest", "Principal", "Ending Balance"];
  heads.forEach((h, i) => {
    const c = ws.getCell(headRow, 1 + i);
    c.value = h;
    c.font = { name: ARIAL, size: 9, bold: true, color: WHITE };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADFILL } };
    c.alignment = { horizontal: i < 2 ? "center" : "right" };
  });

  const first = headRow + 1;
  for (let m = 1; m <= holdMonths; m++) {
    const r = first + m - 1;
    const y = Math.ceil(m / 12);
    const begin = m === 1 ? "LoanAmount" : cellA1(r - 1, 7);
    const mc = ws.getCell(r, 1);
    mc.value = m;
    mc.font = { name: ARIAL, size: 9, color: MUTED };
    mc.alignment = { horizontal: "center" };
    const yc = ws.getCell(r, 2);
    yc.value = y;
    yc.font = { name: ARIAL, size: 9, color: MUTED };
    yc.alignment = { horizontal: "center" };

    const put = (col: number, formula: string, bold = false) => {
      const c = ws.getCell(r, col);
      c.value = { formula } as ExcelJS.CellFormulaValue;
      styleFormula(c, FMT.usd, INK, bold);
      c.font = { ...c.font, size: 9 };
    };
    put(3, begin);
    put(4, `IF(${m}<=IOMonths,${cellA1(r, 3)}*AllInRate/12,MonthlyPmt)`);
    put(5, `${cellA1(r, 3)}*AllInRate/12`);
    put(6, `${cellA1(r, 4)}-${cellA1(r, 5)}`);
    put(7, `MAX(0,${cellA1(r, 3)}-${cellA1(r, 6)})`);
    if (m % 12 === 0) bottomBorder(ws, r, 1, 7);
  }
  const lastRow = first + holdMonths - 1;

  // Tie check: iterated ending balance == the closed-form Outstanding Debt.
  const tieRow = lastRow + 2;
  label(ws.getCell(tieRow, 3), "Exit balance ties to Deal Summary", { bold: true, color: MUTED, size: 9 });
  const tie = ws.getCell(tieRow, 7);
  tie.value = { formula: `ROUND(${cellA1(lastRow, 7)}-OutstandingDebt,0)=0` } as ExcelJS.CellFormulaValue;
  tie.name = "CheckDebtTie";
  tie.font = { name: ARIAL, size: 9, bold: true };
  tie.alignment = { horizontal: "right" };
  ws.addConditionalFormatting({
    ref: tie.address,
    rules: [
      { type: "cellIs", operator: "equal", priority: 1, formulae: ["FALSE"], style: { font: { color: { argb: "FFB23A30" }, bold: true } } },
      { type: "cellIs", operator: "equal", priority: 2, formulae: ["TRUE"], style: { font: { color: { argb: "FF1B7A5E" }, bold: true } } },
    ],
  });

  // Annual rollup: interest / principal / total by operating year.
  let r = tieRow + 2;
  sectionHeader(ws, r, "Annual Rollup", 1, 7);
  r++;
  ["Op Year", "", "", "Payments", "Interest", "Principal", "Year-End Balance"].forEach((h, i) => {
    if (!h) return;
    const c = ws.getCell(r, 1 + i);
    c.value = h;
    c.font = { name: ARIAL, size: 9, bold: true, color: MUTED };
    c.alignment = { horizontal: i === 0 ? "center" : "right" };
  });
  r++;
  const years = Math.ceil(holdMonths / 12);
  for (let y = 1; y <= years; y++) {
    const from = first + (y - 1) * 12;
    const to = Math.min(first + y * 12 - 1, lastRow);
    const yc = ws.getCell(r, 1);
    yc.value = y;
    yc.font = { name: ARIAL, size: 9, color: MUTED };
    yc.alignment = { horizontal: "center" };
    const put = (col: number, formula: string) => {
      const c = ws.getCell(r, col);
      c.value = { formula } as ExcelJS.CellFormulaValue;
      styleFormula(c, FMT.usd);
      c.font = { ...c.font, size: 9 };
    };
    put(4, `SUM(${cellA1(from, 4)}:${cellA1(to, 4)})`);
    put(5, `SUM(${cellA1(from, 5)}:${cellA1(to, 5)})`);
    put(6, `SUM(${cellA1(from, 6)}:${cellA1(to, 6)})`);
    put(7, cellA1(to, 7));
    r++;
  }
}

// ── SENSITIVITY ───────────────────────────────────────────────────────────────
/**
 * LIVE sensitivity: the hidden engine tab holds one compact cash-flow block per
 * scenario cell (3 pairings × 5×5 = 75), and the visible Sensitivity tab
 * presents numeric IRR and EM matrices reading those blocks — edit any
 * assumption and every matrix recomputes with the rest of the model.
 *
 * The de-fragiliser: the sensitivity axes (exit cap, hold, price, LTC, rate)
 * never touch NOI, so NOI-per-year and capex-per-year are IDENTICAL across all
 * scenarios — computed once in shared columns and referenced by every block.
 * Each scenario column is then just its overrides + loan/equity/debt/sale +
 * a levered cash-flow vector. A scenario's hold sets which year the sale lands;
 * years beyond it are 0, and trailing zeros don't change IRR — so a single
 * fixed-height block (tall enough for the longest hold) serves every scenario.
 *
 * The axes are live too: each axis cell on the visible tab is a formula off
 * its named input (the centre is the input itself, the steps are written at
 * export), and every override row reads its axis cell or the named input —
 * never a number — so an input typed into the file re-centres every grid
 * on it. A price scenario strikes its closing costs and fee at its own
 * price, as the engine does.
 *
 * LOAD-BEARING LAYOUT: workbook.test.ts reads the engine tab directly —
 * scenarios start at column C in grid order (index = gi*25 + ri*5 + ci), the
 * IRR sits on sheet row 23 and the EM on row 24. Do not add rows to a block.
 */
// ── OPERATING METRICS ── the ratio ladder an IC actually checks year by
// year — expense ratio, NOI margin, DSCR, debt yield, breakeven occupancy,
// cash-on-cash — plus per-unit and per-SF yardsticks. Every cell is a live
// formula over the Cash Flow tab and the book's named cells, so changing
// any assumption re-prices this ladder too.
function buildOperatingMetrics(
  ws: ExcelJS.Worksheet,
  cf: CfMap,
  model: DerivedModel,
  holdYears: number,
) {
  ws.getColumn(1).width = 34;
  const firstCol = 2;
  const lastCol = firstCol + holdYears - 1;
  for (let c = firstCol; c <= lastCol; c++) ws.getColumn(c).width = 13;

  titleRow(ws, "Operating Metrics");
  label(
    ws.getCell(2, 1),
    "Every ratio recomputes live off the Cash Flow tab — change an assumption and this ladder re-prices.",
    { color: MUTED, size: 9 },
  );

  // 0-based operating-year offset → Cash Flow cell address
  const at = (key: string, y: number) =>
    `'Cash Flow'!${cellA1(cf.rows[key], cf.firstOpCol + y)}`;

  let r = 4;
  sectionHeader(ws, r, "Margins & risk — by operating year", 1, lastCol);
  r++;
  label(ws.getCell(r, 1), "OPERATING YEAR", { bold: true, color: MUTED, size: 8 });
  for (let y = 0; y < holdYears; y++) {
    const c = ws.getCell(r, firstCol + y);
    c.value = y + 1;
    c.font = { name: ARIAL, size: 9, bold: true, color: INK };
    c.alignment = { horizontal: "right" };
  }
  bottomBorder(ws, r, 1, lastCol);
  r++;

  const ratioRows: [string, (y: number) => string, string][] = [
    [
      "Expense Ratio (OpEx / EGR)",
      (y) => `IF(${at("egr", y)}=0,"n/a",-${at("opex", y)}/${at("egr", y)})`,
      FMT.pct1,
    ],
    [
      "NOI Margin",
      (y) => `IF(${at("egr", y)}=0,"n/a",${at("noi", y)}/${at("egr", y)})`,
      FMT.pct1,
    ],
    ["DSCR (NOI)", (y) => `${at("dscr", y)}`, FMT.ratio],
    ["Debt Yield", (y) => `${at("debtyield", y)}`, FMT.pct1],
    [
      "Breakeven Occupancy",
      (y) =>
        `IF(${at("pgr", y)}=0,"n/a",(-${at("opex", y)}-${at("debt", y)})/${at("pgr", y)})`,
      FMT.pct1,
    ],
    [
      "Cash-on-Cash (levered)",
      (y) => `IF(Equity=0,"n/a",${at("levcf", y)}/Equity)`,
      FMT.pct1,
    ],
  ];
  ratioRows.forEach(([lab, f, fmt], i) => {
    if (i % 2 === 1) {
      for (let c = 1; c <= lastCol; c++) {
        ws.getCell(r, c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: BANDFILL },
        };
      }
    }
    label(ws.getCell(r, 1), lab);
    for (let y = 0; y < holdYears; y++) {
      const cell = ws.getCell(r, firstCol + y);
      cell.value = { formula: f(y) } as ExcelJS.CellFormulaValue;
      styleFormula(cell, fmt);
      cell.alignment = { horizontal: "right" };
    }
    r++;
  });
  bottomBorder(ws, r - 1, 1, lastCol);
  r++;
  label(
    ws.getCell(r, 1),
    // What the formula covers, said: the row leaves reserves, capital and
    // the asset management fee out, so it is not where cash flow crosses zero.
    "Breakeven occupancy = (OpEx + Debt Service) ÷ Potential Gross Revenue — the occupancy at which revenue covers the year's operating expenses and debt service, before reserves, capital costs and the asset management fee. Screen it against the market's actual vacancy, not the pro forma's.",
    { color: MUTED, size: 9 },
  );
  r += 2;

  sectionHeader(ws, r, "Per-unit & per-SF yardsticks — year 1", 1, lastCol);
  r++;
  const twoCol = (lab: string, formula: string, fmt: string, zebra: boolean) => {
    if (zebra) {
      for (let c = 1; c <= 2; c++) {
        ws.getCell(r, c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: BANDFILL },
        };
      }
    }
    label(ws.getCell(r, 1), lab);
    const cell = ws.getCell(r, 2);
    cell.value = { formula } as ExcelJS.CellFormulaValue;
    styleFormula(cell, fmt);
    cell.alignment = { horizontal: "right" };
    r++;
  };

  const units = model.meta.units;
  // The per-unit rows in the class's own noun (lib/asset-words): "Price /
  // Key" on a hotel, "Price / Pad" on a park. The named range stays
  // UnitsCount, so every formula reads the same cell whatever it is called.
  const capWord = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const nounOne = capWord(model.meta.unitNoun?.one ?? "unit");
  const nounMany = capWord(model.meta.unitNoun?.many ?? "units");
  let zebra = false;
  if (units && units > 0) {
    label(ws.getCell(r, 1), nounMany);
    const u = ws.getCell(r, 2);
    u.value = units;
    u.name = "UnitsCount";
    // The documents' count typed in, which every per-unit row reads: an input.
    styleInput(u, FMT.int);
    u.alignment = { horizontal: "right" };
    r++;
    twoCol(`Price / ${nounOne}`, "PurchasePrice/UnitsCount", FMT.usd, (zebra = !zebra));
    // What a finished unit costs all-in — the basis a comp is held against
    // on a plan deal; on a stabilized asset with no capital plan it equals
    // the price per unit. Live: it moves with the capital plan input.
    twoCol(
      `All-in Basis / ${nounOne} (price + capital plan)`,
      "(PurchasePrice+CapImprovements)/UnitsCount",
      FMT.usd,
      (zebra = !zebra),
    );
    twoCol(
      `Year-1 Rent / ${nounOne} / Month`,
      `${at("rent", 0)}/UnitsCount/12`,
      FMT.usd,
      (zebra = !zebra),
    );
    twoCol(`Year-1 NOI / ${nounOne}`, `${at("noi", 0)}/UnitsCount`, FMT.usd, (zebra = !zebra));
    twoCol(
      `Year-1 OpEx / ${nounOne}`,
      `-${at("opex", 0)}/UnitsCount`,
      FMT.usd,
      (zebra = !zebra),
    );
  } else {
    label(
      ws.getCell(r, 1),
      `${nounOne} count not stated in the OM or rent roll — per-${nounOne.toLowerCase()} yardsticks omitted rather than guessed.`,
      { color: MUTED, size: 9 },
    );
    r++;
  }
  // The per-SF ladder gets the same honesty as the per-unit block: when the
  // building's size is an assumed placeholder (no OM size, no rent roll)
  // the yardsticks are omitted with a stated reason, never printed as if
  // "$680/SF" were the deal's figure.
  if (model.sources.rsf?.provenance !== "assumption") {
    twoCol("Price / SF", "PurchasePrice/RSF", FMT.psf, (zebra = !zebra));
    twoCol(
      "All-in Basis / SF (price + capital plan)",
      "(PurchasePrice+CapImprovements)/RSF",
      FMT.psf,
      (zebra = !zebra),
    );
    twoCol("Year-1 NOI / SF", `${at("noi", 0)}/RSF`, FMT.psf, (zebra = !zebra));
    twoCol(
      "Year-1 Rent / SF / Year",
      `${at("rent", 0)}/RSF`,
      FMT.psf,
      (zebra = !zebra),
    );
  } else {
    label(
      ws.getCell(r, 1),
      "Building size not stated in the OM or rent roll — per-SF yardsticks omitted rather than guessed (enter RSF on Assumptions to add them).",
      { color: MUTED, size: 9 },
    );
    r++;
  }
  bottomBorder(ws, r - 1, 1, 2);
}

/**
 * One sensitivity axis: the named input it varies, the step between its five
 * values and the floor under them (lib/underwrite/sensitivity's
 * `centeredAxis`). The axis cells are LIVE formulas off the input — the
 * centre is the input itself, so it stays the model's base case whatever is
 * typed into the file — while the step stays the one written at export.
 */
interface SensAxisDef {
  name: string;
  step: number;
  min: number;
  fmt: string;
}

/** The axis's value at k steps from the input, as a formula. */
function axisFormula(a: SensAxisDef, k: number): string {
  if (k === 0) return a.name;
  return `MAX(${a.min},${a.name}${k > 0 ? "+" : "-"}${Math.abs(k)}*${a.step})`;
}

function buildSensitivity(
  wsSens: ExcelJS.Worksheet,
  eng: ExcelJS.Worksheet,
  inp: UnderwriteInputs,
) {
  const inc = defaultIncrements(inp);
  const steps = [-2, -1, 0, 1, 2];
  const AXES = {
    cap: { name: "ExitCap", step: inc.capStep, min: 0.0025, fmt: FMT.pct2 },
    hold: { name: "HoldMonths", step: inc.monthsStep, min: 12, fmt: FMT.int },
    price: { name: "PurchasePrice", step: inc.priceStep, min: 0, fmt: FMT.usd },
    ltc: { name: "LTC", step: inc.ltcStep, min: 0, fmt: FMT.pct2 },
    rate: { name: "AllInRate", step: inc.rateStep, min: 0.0025, fmt: FMT.pct2 },
  } satisfies Record<string, SensAxisDef>;
  // The hold is structural (the Assumptions tab says so): the engine blocks
  // are sized for the longest hold its axis reaches at export.
  const holdVals = steps.map((k) => Math.max(12, inp.holdMonths + k * inc.monthsStep));
  const maxHoldM = Math.max(...holdVals, inp.holdMonths);
  const maxYears = Math.max(1, Math.ceil(maxHoldM / 12));

  // ── shared rows on the engine tab (column B), referenced by every scenario ──
  // NOI at yearsElapsed e (0..maxYears): operating year y uses e=y-1; the
  // forward exit NOI at hold h uses e=h.
  eng.getColumn(1).width = 22;
  let sr = 1;
  eng.getCell(sr, 1).value = "shared: NOI by years-elapsed"; sr++;
  const noiRow: number[] = []; // noiRow[e] = sheet row of NOI at years-elapsed e
  for (let e = 0; e <= maxYears; e++) {
    const rent = `(InPlaceRent*(1+RentGrowth)^${e})`;
    const rec = `(Recoveries*(1+ExpGrowth)^${e})`;
    const oth = `(OtherRev*(1+RentGrowth)^${e})`;
    const egr = `((${rent}+${rec}+${oth})*(1-VacancyPct))`;
    const opex = `(TotalBaseOpex*(1+ExpGrowth)^${e}+${egr}*MgmtFeePct)`;
    eng.getCell(sr, 1).value = `NOI e=${e}`;
    eng.getCell(sr, 2).value = { formula: `${egr}-${opex}` } as ExcelJS.CellFormulaValue;
    noiRow[e] = sr;
    sr++;
  }
  const capexRow: number[] = []; // capexRow[y] = sheet row of total capex for op year y
  for (let y = 1; y <= maxYears; y++) {
    const rent = `(InPlaceRent*(1+RentGrowth)^${y - 1})`;
    eng.getCell(sr, 1).value = `capex y=${y}`;
    eng.getCell(sr, 2).value = {
      formula: `TIPSF*RSF+LCPct*${rent}+ReservesPSF*RSF*(1+ExpGrowth)^${y - 1}+IF(${y}=1,CapImprovements,0)`,
    } as ExcelJS.CellFormulaValue;
    capexRow[y] = sr;
    sr++;
  }
  const B = (row: number) => `B${row}`;

  // ── one scenario column; returns its IRR / EM cell addresses ──
  let col = 3; // scenarios start at column C
  const scenario = (o: {
    price?: string; ltc?: string; rate?: string; cap?: string; holdM?: string;
  }): { irr: string; em: string } => {
    const c = col++;
    const A1 = (row: number) => `${eng.getCell(row, c).address}`;
    let row = 1;
    const put = (formula: string): string => {
      eng.getCell(row, c).value = { formula } as ExcelJS.CellFormulaValue;
      const a = A1(row);
      row++;
      return a;
    };
    // overrides: the visible tab's axis cell where this scenario varies the
    // input, else the global named range — a formula either way, so a
    // scenario follows its axis when the input it is centred on changes
    const price = put(o.price ?? "PurchasePrice");
    const ltc = put(o.ltc ?? "LTC");
    const rate = put(o.rate ?? "AllInRate");
    const cap = put(o.cap ?? "ExitCap");
    const holdM = put(o.holdM ?? "HoldMonths");
    // derived — the closing costs and the fee struck at THIS scenario's
    // price (the Assumptions tab's ClosingCostsTotal formula with the price
    // swapped), as the engine strikes them at each price it is run at
    const loanBasis = put(
      `${price}+${price}*(TransferTaxPct+RecordationTaxPct+GeneralHoldPct)+BuyerLegal+LenderLegal+ThirdPartyReports+MiscClosing+MIN(AcqFeePct*${price},AcqFeeCap)`,
    );
    const loan = put(`${ltc}*${loanBasis}`);
    const equity = put(`${loanBasis}+FinCostPct*${loan}-${loan}`);
    const mpmt = put(`IF(${rate}=0,${loan}/AmortMonths,${loan}*(${rate}/12)/(1-(1+${rate}/12)^(-AmortMonths)))`);
    const holdY = put(`ROUND(${holdM}/12,0)`);
    // forward NOI at exit = NOI at years-elapsed = holdY → INDEX the shared col
    const fwd = put(`INDEX($B$${noiRow[0]}:$B$${noiRow[maxYears]},${holdY}+1)`);
    const gross = put(`IF(${cap}=0,0,${fwd}/${cap})`);
    const exitDebt = put(
      `IF(${holdM}<=IOMonths,${loan},IF(${rate}=0,MAX(0,${loan}-${mpmt}*(${holdM}-IOMonths)),${loan}*(1+${rate}/12)^(${holdM}-IOMonths)-${mpmt}*(((1+${rate}/12)^(${holdM}-IOMonths)-1)/(${rate}/12))))`,
    );
    const netSale = put(`${gross}-${gross}*SaleCostPct-${exitDebt}`);
    // levered cash-flow vector: year 0 = -equity; years 1..maxYears
    const y0 = put(`-${equity}`);
    const yCells: string[] = [y0];
    for (let y = 1; y <= maxYears; y++) {
      // Interest-only while within the IO PERIOD (IOMonths), not the hold —
      // mirrors engine.annualDebtService (y*12 <= ioMonths).
      const ds = `IF(${y}<=IOMonths/12,${loan}*${rate},${mpmt}*12)`;
      const opCf = `${B(noiRow[y - 1])}-${B(capexRow[y])}-${equity}*AMFeePctEquity-(${ds})`;
      const sale = `IF(${y}=${holdY},${netSale},0)`;
      yCells.push(put(`IF(${y}>${holdY},0,(${opCf})+${sale})`));
    }
    const irr = put(`IFERROR(IRR(${yCells[0]}:${yCells[yCells.length - 1]}),"")`);
    const em = put(`IFERROR(SUM(${yCells[1]}:${yCells[yCells.length - 1]})/${equity},"")`);
    return { irr: `'Sensitivity Engine'!${irr}`, em: `'Sensitivity Engine'!${em}` };
  };

  // ── the visible matrices ──
  interface GridDef {
    title: string;
    rowLabel: string;
    colLabel: string;
    rowAxis: SensAxisDef;
    colAxis: SensAxisDef;
    /** a scenario's overrides, from its row's and its column's axis cells */
    override: (rowRef: string, colRef: string) => Parameters<typeof scenario>[0];
  }
  const grids: GridDef[] = [
    { title: "Exit Cap × Hold Period", rowLabel: "Hold (months)", colLabel: "Exit cap", rowAxis: AXES.hold, colAxis: AXES.cap, override: (h, cp) => ({ holdM: h, cap: cp }) },
    { title: "Exit Cap × Purchase Price", rowLabel: "Price", colLabel: "Exit cap", rowAxis: AXES.price, colAxis: AXES.cap, override: (p, cp) => ({ price: p, cap: cp }) },
    { title: "Leverage × Rate", rowLabel: "All-in rate", colLabel: "LTC", rowAxis: AXES.rate, colAxis: AXES.ltc, override: (rt, lt) => ({ rate: rt, ltc: lt }) },
  ];
  // An axis cell as a scenario on the hidden tab reads it.
  const axisRef = (row: number, c: number) => `'${wsSens.name}'!${cellA1(row, c).replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2")}`;

  wsSens.getColumn(1).width = 16;
  for (let c = 2; c <= 13; c++) wsSens.getColumn(c).width = 11;
  titleRow(wsSens, "Sensitivity");
  let r = 2;
  label(
    wsSens.getCell(r, 1),
    "Live — every cell is a full re-run of the model, its axes centred on the inputs as they stand. Change any assumption and all 75 scenarios recompute.",
    { color: MUTED, size: 9 },
  );
  r += 2;

  const IRR_COLS = { from: 2, to: 6 }; // B..F
  const EM_COLS = { from: 8, to: 12 }; // H..L
  const axisStyle = (cell: ExcelJS.Cell, fmt: string, base: boolean) => {
    cell.numFmt = fmt;
    cell.font = { name: ARIAL, size: 9, bold: base, color: MUTED };
  };

  for (const g of grids) {
    // This grid's rows — its title, the matrices' labels, the column axis,
    // then five rows of scenarios — are fixed before any scenario is
    // written, so each scenario reads its own axis cells.
    const axisRow = r + 2;
    const bodyTop = r + 3;
    // One scenario per cell, shared by the IRR matrix and the EM matrix, in
    // grid order (the engine tab's load-bearing layout).
    const cells: { irr: string; em: string }[][] = steps.map((_k, ri) =>
      steps.map((_c, ci) => scenario(g.override(axisRef(bodyTop + ri, 1), axisRef(axisRow, IRR_COLS.from + ci)))),
    );

    sectionHeader(wsSens, r, g.title, 1, 12);
    r++;
    label(wsSens.getCell(r, IRR_COLS.from), "LEVERED IRR", { bold: true, color: MUTED, size: 8 });
    label(wsSens.getCell(r, EM_COLS.from), "EQUITY MULTIPLE", { bold: true, color: MUTED, size: 8 });
    label(wsSens.getCell(r, 1), `${g.rowLabel} ↓ · ${g.colLabel} →`, { color: MUTED, size: 8 });
    r++;

    // Column axis (shared header row for both matrices): a live formula off
    // the input over the IRR matrix, which the EM matrix's header reads.
    steps.forEach((k, ci) => {
      const ic = wsSens.getCell(r, IRR_COLS.from + ci);
      ic.value = { formula: axisFormula(g.colAxis, k) } as ExcelJS.CellFormulaValue;
      const ec = wsSens.getCell(r, EM_COLS.from + ci);
      ec.value = { formula: cellA1(r, IRR_COLS.from + ci) } as ExcelJS.CellFormulaValue;
      for (const cell of [ic, ec]) {
        axisStyle(cell, g.colAxis.fmt, ci === 2);
        cell.alignment = { horizontal: "center" };
      }
    });
    r++;

    steps.forEach((k, ri) => {
      const rl = wsSens.getCell(r, 1);
      rl.value = { formula: axisFormula(g.rowAxis, k) } as ExcelJS.CellFormulaValue;
      axisStyle(rl, g.rowAxis.fmt, ri === 2);
      steps.forEach((_c, ci) => {
        const { irr, em } = cells[ri][ci];
        const ic = wsSens.getCell(r, IRR_COLS.from + ci);
        ic.value = { formula: `IF(${irr}="","",${irr})` } as ExcelJS.CellFormulaValue;
        ic.numFmt = FMT.pct1;
        ic.alignment = { horizontal: "center" };
        ic.font = { name: ARIAL, size: 9, bold: ri === 2 && ci === 2, color: INK };
        const ec = wsSens.getCell(r, EM_COLS.from + ci);
        ec.value = { formula: `IF(${em}="","",${em})` } as ExcelJS.CellFormulaValue;
        ec.numFmt = FMT.mult;
        ec.alignment = { horizontal: "center" };
        ec.font = { name: ARIAL, size: 9, bold: ri === 2 && ci === 2, color: INK };
      });
      r++;
    });
    const bodyBottom = r - 1;

    // Color scales: red → white → green, low to high (higher is better for
    // both IRR and EM). Excel renders these; recalc engines just ignore them.
    for (const cols of [IRR_COLS, EM_COLS]) {
      wsSens.addConditionalFormatting({
        ref: `${cellA1(bodyTop, cols.from)}:${cellA1(bodyBottom, cols.to)}`,
        rules: [
          {
            type: "colorScale",
            priority: 1,
            cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }],
            color: [{ argb: "FFF4CCCC" }, { argb: "FFFFFFFF" }, { argb: "FFCFE7DC" }],
          } as never,
        ],
      });
    }
    r += 2;
  }
  label(wsSens.getCell(r, 1), "Center row/column = the model's base case. Bold cell = base scenario.", { color: MUTED, size: 9 });
  // The centre follows the input; the step does not. Said, so a price typed
  // into the file is not expected to rescale the price step.
  const bps = (d: number) => `${Math.round(d * 10_000)} bps`;
  label(
    wsSens.getCell(r + 1, 1),
    `Each axis steps from the input as it stands, by the steps set at export: exit cap ${bps(inc.capStep)}, hold ${inc.monthsStep} months, price $${inc.priceStep.toLocaleString("en-US")}, LTC ${(inc.ltcStep * 100).toFixed(1)} points, rate ${bps(inc.rateStep)}.`,
    { color: MUTED, size: 9 },
  );
}
