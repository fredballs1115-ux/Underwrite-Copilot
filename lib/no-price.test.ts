// Research pass 38, part 1's leftover (f): a memorandum that states no price,
// an NOI of zero or less and a going-in cap. The model backs a price out of
// that NOI over the cap — a figure of zero or less — and runs it (the
// owner's to change). The playground's field showed it, as "$-5,636,364",
// beside a sentence saying the model ran "on an assumed NOI" when it ran the
// memorandum's own loss; the workbook printed it as the Purchase Price in
// three places and set the stated cap over it as a going-in cap. Now no
// surface shows it, and the returns are withheld under one sentence: the
// memorandum's NOI is not a year's income to price on. Every name is
// invented.
import { describe, expect, it } from "vitest";
import React from "react";
import ExcelJS from "exceljs";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import {
  buildSensitivityData,
  placeholderPageLine,
  placeholderReason,
  placeholderWorkbookLine,
} from "@/lib/underwrite/report-grid";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { buildReportData, ReportDocument } from "@/lib/memo/report-document";
import { pdfTextOf } from "@/lib/memo/pdf-text-of";
import { gluedWords, visibleText } from "@/lib/render-lint";
import type { DealRow } from "@/lib/deals";
import { ex, m } from "@/lib/pass38.fixture";

const STABILIZED = { kind: "stabilized", summary: "A stabilized office building", capitalBudget: "", timeline: "" };
const losing = (noi: string) =>
  ex({
    assetClass: "Office",
    dealName: "Fernwood Center",
    strategy: STABILIZED,
    metrics: [m("NOI (in-place)", noi, "in_place"), m("Going-in cap rate", "5.50%"), m("Total SF", "80,000 SF")],
  });
// −$310,000 over 5.50% is −$5,636,364: never printed.
const NO_FIGURE = /5,636,36|5\.6M|5\.64M/;
const REASON =
  "no price was read from the memorandum, and its −$310,000 NOI (in-place) is not a year's income to price on, so that NOI over the stated going-in cap is no price and the returns run on it would describe no deal.";

const workbookOf = async (model: ReturnType<typeof deriveUnderwriteInputs>) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildUnderwriteWorkbook(model)) as unknown as ArrayBuffer);
  return wb;
};

describe("a price backed out of an NOI of zero or less is no price (research pass 38)", () => {
  const d = deriveUnderwriteInputs(losing("-310,000"), "x");

  it("marks it on the price's source, in words that print no figure — the model's figure is unchanged", () => {
    // The owner's figure: the NOI over the cap, as before.
    expect(d.inputs.purchasePrice).toBeCloseTo(-310_000 / 0.055, 4);
    expect(d.sources.purchasePrice).toMatchObject({ provenance: "derived", noPrice: { label: "NOI (in-place)", value: -310_000 } });
    expect(d.sources.purchasePrice!.note).toBe(
      "The OM states no price, and its NOI (in-place) of −$310,000 is not a year's income to price on: that NOI ÷ the stated going-in cap is no price — enter the purchase price",
    );
    // A positive NOI over the cap is a price, as before.
    const priced = deriveUnderwriteInputs(losing("310,000"), "x");
    expect(priced.sources.purchasePrice).toEqual({ provenance: "derived", note: "NOI ÷ going-in cap", page: undefined });
  });

  it("withholds the returns on the page and in the report under one sentence, and the page never shows the figure", async () => {
    expect(placeholderReason(d.inputs, d.sources)).toBe(REASON);
    const page = placeholderPageLine(d.inputs, d.sources, { priceEntered: false, maxBid: false });
    expect(page).toBe(
      `The returns are withheld: ${REASON} A price typed above reprices the model, but not its year-1 NOI, which stays the memorandum's — so the returns stay withheld.`,
    );
    // With a price typed, the NOI half stands.
    expect(placeholderReason(d.inputs, d.sources, { priceEntered: true })).toBe(
      "the memorandum's −$310,000 NOI (in-place) is not a year's income to price on, and the model runs it as its year-1 NOI whatever price is typed, so the returns run on it would describe no deal.",
    );

    const data: PlaygroundData = { inputs: d.inputs, dealAssetClass: "Office", checkSource: null, box: null, sources: d.sources, occupancyPct: null, findings: [] };
    const html = renderToStaticMarkup(React.createElement(SensitivityPlayground, { data }));
    const text = visibleText(html);
    expect(text).toContain(page!);
    expect(text).toContain("n/a — no price");
    expect(text).toContain("no price was read — type the price you would pay");
    expect(html).toMatch(/aria-label="Purchase price scenario"/);
    expect(html).toContain('placeholder="Type a price"');
    expect(html).not.toMatch(NO_FIGURE);
    expect(html).not.toContain("$-");
    expect(gluedWords(text)).toEqual([]);

    const sensitivity = buildSensitivityData(d.inputs, null, { sources: d.sources, findings: [] });
    expect(sensitivity.withheld).toBe(`The IRR grids and the max bid are left out: ${REASON}`);
    const deal = { name: "Fernwood Center", asset_class: "office", extraction: losing("-310,000"), challenges: null, comps: null, market: null, reconciliation: null, verdict: null, prior_screen: null } as unknown as DealRow;
    const input = buildReportData(deal, "October 5, 2026", [], sensitivity);
    expect(input.sensitivity).toBeNull();
    const pdf = pdfTextOf(
      await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]),
    ).replace(/\s+/g, " ");
    expect(pdf).toContain("is not a year's income to price on, so that NOI over the stated going-in cap is no price");
    expect(pdf).not.toMatch(NO_FIGURE);
  }, 45000);

  it("shows no price in the workbook, keeps the model's figure live, and says the line", async () => {
    const wb = await workbookOf(d);
    const words = '$#,##0;"no price: enter one";"no price: enter one"';
    const assumptions = wb.getWorksheet("Assumptions")!;
    let priceRow = 0;
    assumptions.eachRow((row, n) => {
      if (row.getCell(1).value === "Purchase Price") priceRow = n;
    });
    const priceCell = assumptions.getRow(priceRow).getCell(2);
    // The figure is the model's, untouched; it is shown as words.
    expect(priceCell.value).toBeCloseTo(-310_000 / 0.055, 4);
    expect(priceCell.numFmt).toBe(words);
    const summary = wb.getWorksheet("Deal Summary")!;
    const cells: { v: unknown; fmt?: string }[] = [];
    summary.eachRow((row) => row.eachCell((c) => cells.push({ v: c.value, fmt: c.numFmt })));
    const formulas = cells.filter((c) => typeof c.v === "object" && c.v != null && "formula" in c.v);
    const priceCells = formulas.filter((c) => (c.v as { formula: string }).formula === "PurchasePrice");
    expect(priceCells.length).toBe(2);
    for (const c of priceCells) expect(c.fmt).toBe(words);
    expect(cells.some((c) => c.v === "PURCHASE PRICE (NONE READ)")).toBe(true);
    expect(formulas.some((c) => /^IF\(PurchasePrice<=0,"n\/a",/.test((c.v as { formula: string }).formula))).toBe(true);
    const line = placeholderWorkbookLine(d.inputs, d.sources)!;
    expect(line).toBe(
      "No price was read from the memorandum, and its −$310,000 NOI (in-place) is not a year's income to price on, so that NOI over the stated going-in cap is no price and the returns run on it describe no deal. Enter the price you would pay as the Purchase Price on the Assumptions tab, and the In-Place Rental Revenue and expenses that make the year-1 NOI you would run: a price entered alone leaves the memorandum's NOI as the year-1 NOI.",
    );
    expect(cells.some((c) => c.v === line)).toBe(true);
    // No basis is struck on it.
    const ops: string[] = [];
    wb.getWorksheet("Operating Metrics")!.eachRow((row) => ops.push(String(row.getCell(1).value ?? "")));
    expect(ops).toContain(
      "Price / SF and All-in Basis / SF left out: no price was read from the memorandum, and its NOI (in-place) is not a year's income to price on, so the Purchase Price is no price and no basis is struck on it.",
    );
    expect(ops).not.toContain("Price / SF");
  }, 45000);

  it("reads an NOI of nothing the same way: a price of zero is no price either", () => {
    const zero = deriveUnderwriteInputs(losing("0"), "x");
    expect(zero.inputs.purchasePrice).toBe(0);
    expect(zero.sources.purchasePrice?.noPrice).toEqual({ label: "NOI (in-place)", value: 0 });
    expect(placeholderReason(zero.inputs, zero.sources)).toBe(REASON.replace("−$310,000", "$0"));
  });
});
