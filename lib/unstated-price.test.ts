// Research pass 40, item 15: the Assumption Bridge's scenario form, the
// valuations page's "Our UW" column and the rent-roll workbook's price cell
// printed the model's purchase price whatever it was — the site's
// $10,000,000 placeholder on an unpriced deal, or a figure backed out of an
// NOI of zero or less, which is no price — as if a memorandum had stated it.
// Each now says so, in the report's own reason (`placeholderReason`), and
// none prints the no-price figure. Every name is invented.
import { describe, expect, it } from "vitest";
import React from "react";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { placeholderReason, unstatedPrice } from "@/lib/underwrite/report-grid";
import { buildRentRollWorkbook } from "@/lib/export/workbook";
import type { WorkbookInputs } from "@/lib/export/cashflow";
import { PROFILE_DEFAULTS, normalizeProfile } from "@/lib/rentroll/profiles";
import { parseCsv, suggestMapping, toLeases } from "@/lib/rentroll/parse";
import { CLEAN_CSV } from "@/lib/rentroll/__fixtures__";
import { ValuationsView, type ColumnData } from "@/app/(app)/deals/[id]/valuations/valuations-view";
import { visibleText } from "@/lib/render-lint";
import { ex, m } from "@/lib/pass38.fixture";

const STABILIZED = { kind: "stabilized", summary: "A stabilized office building", capitalBudget: "", timeline: "" };
const unpriced = deriveUnderwriteInputs(
  ex({ assetClass: "Office", dealName: "Larkspur Court", strategy: STABILIZED, metrics: [m("Total SF", "80,000 SF")] }),
  "x",
);
const losing = deriveUnderwriteInputs(
  ex({
    assetClass: "Office",
    dealName: "Fernwood Center",
    strategy: STABILIZED,
    metrics: [m("NOI (in-place)", "-310,000", "in_place"), m("Going-in cap rate", "5.50%"), m("Total SF", "80,000 SF")],
  }),
  "x",
);
const priced = deriveUnderwriteInputs(
  ex({
    assetClass: "Office",
    dealName: "Oakmere Plaza",
    strategy: STABILIZED,
    metrics: [m("Asking price", "$20,000,000"), m("NOI (in-place)", "$1,200,000", "in_place"), m("Total SF", "80,000 SF")],
  }),
  "x",
);
// −$310,000 over 5.50% is −$5,636,364: never printed.
const NO_FIGURE = /5,636,36|5\.6M|5\.64M/;

const grid = parseCsv(CLEAN_CSV);
const LEASES = toLeases(grid, suggestMapping(grid)).leases;
const workbookInputs = (price: number, notes: WorkbookInputs["notes"]): WorkbookInputs => ({
  dealName: "x",
  asOf: "2026-01-01",
  nra: 100_000,
  purchasePrice: price,
  closingCostPct: 0.015,
  otherIncomeAnnual: 0,
  vacancyPct: 0.05,
  opexPsf: 3.2,
  expenseGrowthPct: 0.03,
  reimbursementPct: 0,
  mgmtFeePct: 0.03,
  reservesPsf: 0.15,
  capitalImprovementsYr1: 0,
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
  notes,
});
const assumptionsOf = async (inputs: WorkbookInputs) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildRentRollWorkbook(LEASES, inputs)) as unknown as ArrayBuffer);
  return wb.getWorksheet("Assumptions")!;
};

describe("the model's price where no memorandum stated one is said as that (research pass 40, item 15)", () => {
  it("names the placeholder and the no-price figure in the report's own reason, and nothing on a stated price", () => {
    const p = unstatedPrice(unpriced.inputs, unpriced.sources)!;
    expect(p.kind).toBe("placeholder");
    expect(p.chip).toBe("placeholder");
    expect(p.line.toLowerCase()).toBe(placeholderReason(unpriced.inputs, unpriced.sources)!.toLowerCase());
    expect(p.cell).toBe(
      "No price was read from the memorandum: $10,000,000 is the site's placeholder, not a price — enter the price you would pay.",
    );
    const n = unstatedPrice(losing.inputs, losing.sources)!;
    expect(n.kind).toBe("none");
    expect(n.chip).toBe("no price");
    expect(n.cell).toContain("is not a year's income to price on");
    expect(`${n.line} ${n.cell}`).not.toMatch(NO_FIGURE);
    expect(unstatedPrice(priced.inputs, priced.sources)).toBeNull();
  });

  it("the rent-roll workbook says it beside the price cell and above the IRR; a price that is none reads as none", async () => {
    const p = unstatedPrice(unpriced.inputs, unpriced.sources)!;
    const ws = await assumptionsOf(workbookInputs(unpriced.inputs.purchasePrice, { price: p.cell }));
    const priceRow = 8;
    expect(ws.getCell(priceRow, 1).value).toBe("Purchase price");
    expect(ws.getCell(priceRow, 2).value).toBe(10_000_000);
    expect(String(ws.getCell(priceRow, 3).value)).toBe(p.cell);
    expect(String(ws.getCell(3, 1).value)).toContain(p.cell);

    const n = unstatedPrice(losing.inputs, losing.sources)!;
    const ws2 = await assumptionsOf(workbookInputs(losing.inputs.purchasePrice, { price: n.cell, priceIsNone: true }));
    // The model's figure stays in the cell (the owner's), and reads as none.
    expect(ws2.getCell(priceRow, 2).value).toBeCloseTo(losing.inputs.purchasePrice, 4);
    expect(ws2.getCell(priceRow, 2).numFmt).toBe('$#,##0;"no price: enter one";"no price: enter one"');
    expect(String(ws2.getCell(priceRow, 3).value)).toBe(n.cell);
  });

  it("the valuations table explains the chip on Our UW's value", () => {
    const p = unstatedPrice(unpriced.inputs, unpriced.sources)!;
    const column: ColumnData = {
      id: "__ours",
      label: "Our UW",
      sourceType: "internal",
      extracted: false,
      internal: true,
      documentUrl: null,
      note: null,
      values: { headlineValue: unpriced.inputs.purchasePrice },
      citations: {},
      derivedFields: [],
      notes: { headlineValue: { chip: p.chip, title: p.line } },
      implied: { ok: false, error: p.line, leveredIrrPct: null, leveredEquityMultiple: null, substitutions: [] },
    };
    const html = renderToStaticMarkup(
      React.createElement(ValuationsView, { columns: [column], bridge: null, summary: null, tally: null, aLabel: null, bLabel: null }),
    );
    expect(visibleText(html).replace(/\s+/g, " ")).toContain(
      "placeholder = no price was read from the memorandum, so your model runs on the site’s placeholder; its IRR is withheld.",
    );
  });

  it("the three surfaces read it: the bridge's form, the valuations page and the rent-roll route", () => {
    const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
    const bridge = src("app/(app)/deals/[id]/bridge/page.tsx");
    expect(bridge).toMatch(/unstatedPrice\(model\.inputs, model\.sources\)/);
    expect(bridge).toContain('data-qa="bridge-price-chip"');
    const valuations = src("app/(app)/deals/[id]/valuations/page.tsx");
    expect(valuations).toMatch(/unstatedPrice\(model\.inputs, model\.sources\)/);
    expect(valuations).toMatch(/headlineValue: \{ chip: priceMark\.chip, title: priceMark\.line \}/);
    const route = src("app/api/deals/[id]/rent-roll.xlsx/route.ts");
    expect(route).toMatch(/price: priceMark\.cell, priceIsNone: priceMark\.kind === "none"/);
  });
});
