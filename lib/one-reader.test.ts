// One figure, one reader (research pass 34): a deal's figure reads the same
// on every surface that summarizes it — the deal header, the pipeline card
// and its CSV, the meeting workbook, the compare table, the analytics and
// the internal comps. Each case here is a deal of the pass's own shape, read
// through the reader each surface calls.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";
import type { ExtractedMetric, ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { inferStrategy, planSummary } from "./deal-strategy";
import { pickSlots } from "./pipeline-slots";
import { pipelineExportRow, type ExportRowContext } from "./pipeline-export-row";
import { buildPipelineWorkbook, type PipelineExportRow } from "./pipeline-workbook";
import { compareReturns } from "./compare-figures";
import { SHARE_CAP_WORDS, capSlotWithheld, goingInCapFigure } from "./compare-interest";
import { deriveInternalComps } from "./internal-comps";
import { pctText, yieldOnCostText } from "./plan-facts";
import { CompareTable, type Col } from "@/app/(app)/deals/compare/compare-table";
import { visibleText } from "./render-lint";

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "p. 3" });
const ex = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult =>
  ({ dealName: "Deal", assetClass: "multifamily", market: "Dallas, TX", address: "", metrics, ...over }) as ExtractionResult;

const ctx: ExportRowContext = { box: null, job: null, offersDue: null, addedBy: null, today: "2026-10-05" };

/** The meeting workbook's row 6 (row 5 is the stage band), read back. */
async function workbookRow(row: PipelineExportRow): Promise<ExcelJS.Row> {
  const buf = await buildPipelineWorkbook([row], new Date("2026-10-05T12:00:00Z"), null);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.getWorksheet("Pipeline")!.getRow(6);
}

/** A compare column as the compare page builds it from `compareReturns`. */
function compareCol(e: ExtractionResult, id = "x", signal: FirstSignal | null = null): Col {
  const strategy = inferStrategy(e, signal);
  const figs = compareReturns(e, null, strategy, undefined, signal);
  return {
    id,
    name: `Deal ${id}`,
    assetClass: "multifamily",
    market: "Dallas, TX",
    coveredMarket: null,
    verdict: null,
    reason: null,
    hasModel: false,
    fit: null,
    fitNote: null,
    strategy: strategy.label,
    planDeal: figs.planDeal,
    irr: null,
    em: null,
    coc: null,
    cap: figs.cap,
    capFrom: figs.capFrom,
    capWithheld: figs.capWithheld,
    yoc: figs.yoc,
    yocFrom: figs.yocFrom,
    leverage: null,
    price: null,
    noi: null,
    interest: figs.tag,
    noteYtm: figs.noteYtmPct,
    withheld: figs.withheld,
  };
}

const compareText = (cols: Col[]) => visibleText(renderToStaticMarkup(React.createElement(CompareTable, { cols })));

describe("a plan's yield on cost and a going-in cap, at the header's two decimals everywhere (findings 5 and 9)", () => {
  // The pass's value-add: $1,337,800 over $21,350,000 is 6.266%.
  const valueAdd = ex(
    [
      m("Asking price", "$18,500,000"),
      m("Total project cost", "$21,350,000"),
      m("Stabilized NOI", "$1,337,800"),
      m("Units", "120"),
    ],
    { strategy: { kind: "value_add", summary: "Renovate 120 units", capitalBudget: "", timeline: "" } },
  );

  it("the card, the CSV and the map pin print the header's 6.27%, never 6.3%", () => {
    const plan = planSummary(valueAdd, inferStrategy(valueAdd))!;
    expect(yieldOnCostText(plan.yieldOnCost!)).toBe("6.27%");
    expect(pickSlots(valueAdd, null).yoc).toBe("6.27%");
  });

  it("the meeting workbook writes the plan's own fraction, never a rounded string read back", async () => {
    const row = pipelineExportRow({ name: "Value-add", asset_class: "multifamily", created_at: "2026-10-01T00:00:00Z", verdict: null, extraction: valueAdd, stage: "screening" }, ctx);
    expect(row.yieldOnCost).toBeCloseTo(1_337_800 / 21_350_000, 12);
    const cell = (await workbookRow(row)).getCell(9);
    expect(cell.value).toBeCloseTo(1_337_800 / 21_350_000, 12);
    expect(cell.numFmt).toBe("0.00%");
    // "0.00%" over the raw fraction is 6.27%; over a re-parsed "6.3%" it was 6.30%.
    expect(((cell.value as number) * 100).toFixed(2)).toBe("6.27");
  });

  it("the compare table prints the yield and a stated cap as the header does", () => {
    const stabilized = ex([m("Asking price", "$41,950,000"), m("Going-in cap rate", "5.45%")]);
    const text = compareText([compareCol(valueAdd, "v"), compareCol(stabilized, "s")]);
    expect(text).toContain("6.27% (OM)");
    expect(text).toContain("5.45% (OM)");
    expect(text).not.toMatch(/6\.3% \(OM\)|5\.5% \(OM\)/);
    // The card prints the memorandum's 5.45% too.
    expect(pickSlots(stabilized, null).cap).toBe("5.45%");
  });

  it("a sibling's yield in the internal comps is its header's", () => {
    const row = { id: "v", name: "Value-add", asset_class: "multifamily", created_at: "2026-10-01T00:00:00Z", is_sample: false, verdict: null, extraction: valueAdd };
    const [comp] = deriveInternalComps("other", "multifamily", { assetClass: "multifamily" }, [row]);
    expect(comp.yieldOnCostLabel).toBe("6.27%");
  });

  it("a percent at two decimals: the analytics' dots and tiles, the compare cap", () => {
    expect(pctText(5.45)).toBe("5.45%");
    expect(pctText(5.4)).toBe("5.40%");
    expect(pctText(6.266)).toBe("6.27%");
    // The analytics page labels its dots, tiles and market cells through
    // it — a dot labelled "5.5%" was a deal whose card said "5.45%".
    const page = readFileSync(join(process.cwd(), "app/(app)/analytics/page.tsx"), "utf8");
    expect(page).toMatch(/const pct = pctText;/);
    expect(page).not.toMatch(/toFixed\(1\)\}%/);
  });
});

const signalOf = (over: Partial<FirstSignal>): FirstSignal => ({
  dealName: "Deal",
  assetClass: "multifamily",
  market: "Dallas, TX",
  askPrice: "",
  size: "",
  goingInCap: "",
  perUnit: "",
  take: "",
  ...over,
});

describe("the going-in cap: the memorandum's, else the first signal's, withheld by one rule (findings 8 and 15)", () => {
  it("a cap only the first signal read: the header's 5.6% on the card, the CSV, the workbook and the compare table", async () => {
    // Price and NOI stated, no cap row; the first signal read 5.6%.
    const e = ex([m("Asking price", "$24,000,000"), m("In-place NOI", "$1,344,000")]);
    const signal = signalOf({ askPrice: "$24,000,000", goingInCap: "5.6%" });
    // The header's own read (app/(app)/deals/[id]/page.tsx), through the slot it draws.
    expect(goingInCapFigure(e, "5.6%").value).toBe("5.6%");
    // The card and its CSV cell.
    expect(pickSlots(e, signal).cap).toBe("5.6%");
    // The meeting workbook.
    const row = pipelineExportRow({ name: "Deal", asset_class: "multifamily", created_at: "2026-10-01T00:00:00Z", verdict: null, extraction: e, first_signal: signal, stage: "screening" }, ctx);
    expect(row.cap).toBe("5.6%");
    expect((await workbookRow(row)).getCell(8).value).toBeCloseTo(0.056, 10);
    // The compare table, as the compare page reads the column.
    const figs = compareReturns(e, null, inferStrategy(e, signal), undefined, signal);
    expect(figs.cap).toBe(5.6);
    expect(compareText([compareCol(e, "x", signal)])).toContain("5.60% (OM)");
  });

  it("a 49% share: the memorandum's cap on the header, the card, the workbook and now the compare table", async () => {
    const share = ex([m("Asking price", "$20,580,000"), m("Going-in cap rate", "5.40%"), m("Units", "200")], {
      interest: { kind: "partial_interest", summary: "", share: "49% limited partnership interest", groundLease: "", loan: "", page: "p. 2" },
    });
    expect(goingInCapFigure(share, "5.40%").value).toBe("5.40%");
    expect(pickSlots(share, null)).toMatchObject({ cap: "5.40%", capWithheld: null });
    const row = pipelineExportRow({ name: "Share", asset_class: "multifamily", created_at: "2026-10-01T00:00:00Z", verdict: null, extraction: share, stage: "screening" }, ctx);
    expect((await workbookRow(row)).getCell(8).value).toBeCloseTo(0.054, 10);
    // No model ran: the table had left the cap blank.
    expect(compareText([compareCol(share)])).toContain("5.40% (OM)");
  });

  it("a share beside the loan its entity carries: the cap withheld on every surface, saying so", async () => {
    const recap = ex(
      [m("Asking price", "$20,580,000"), m("Going-in cap rate", "5.40%"), m("Units", "200"), m("Entity loan balance", "$56,500,000")],
      { interest: { kind: "partial_interest", summary: "", share: "49% limited partnership interest", groundLease: "", loan: "", page: "p. 2" } },
    );
    expect(capSlotWithheld(recap)).toBe("share");
    // The header (and the bar that repeats it), with its reason.
    expect(goingInCapFigure(recap, "5.40%")).toEqual({ label: "Going-in cap", value: "n/a — share", title: SHARE_CAP_WORDS.title });
    // The card: no cap, and why.
    expect(pickSlots(recap, null)).toMatchObject({ cap: null, capWithheld: "share" });
    // The workbook's cell says so rather than a dash.
    const row = pipelineExportRow({ name: "Recap", asset_class: "multifamily", created_at: "2026-10-01T00:00:00Z", verdict: null, extraction: recap, stage: "screening" }, ctx);
    expect(row).toMatchObject({ cap: null, capWithheld: "share" });
    expect((await workbookRow(row)).getCell(8).value).toBe("n/a — share");
    // The compare table.
    const figs = compareReturns(recap, null, inferStrategy(recap));
    expect(figs).toMatchObject({ cap: null, capWithheld: "share" });
    const text = compareText([compareCol(recap)]);
    expect(text).toMatch(/Going-in cap\s*n\/a — share/);
    expect(text).not.toContain("5.40%");
  });

  it("a note and a position keep their own yield in the slot; a leased fee keeps its cap", () => {
    expect(capSlotWithheld(ex([], { interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" } }))).toBe("note");
    expect(capSlotWithheld(ex([], { interest: { kind: "preferred_equity", summary: "", share: "", groundLease: "", loan: "", page: "" } }))).toBe("position");
    const leasedFee = ex([m("Asking price", "$15,000,000"), m("Cap rate", "4.00%")], {
      interest: { kind: "leased_fee", summary: "", share: "", groundLease: "", loan: "", page: "" },
    });
    expect(capSlotWithheld(leasedFee)).toBeNull();
    expect(pickSlots(leasedFee, null).cap).toBe("4.00%");
  });
});
