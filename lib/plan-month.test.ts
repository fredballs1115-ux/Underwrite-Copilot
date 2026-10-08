// Audit C4, M2: a plan's NOI the memorandum states a month at a time was
// read as the year it makes (research pass 40) and said so in the deal
// context alone. The plan's facts — the deal page's strip, the shared
// screen, the report's plan page — the memo's strategy line and the
// workbook's input cell printed the year bare, the workbook crediting
// $1,320,000 to "OM p. 3", which states no such figure. Every name is
// invented.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanSensitivity } from "@/app/(app)/deals/[id]/plan-sensitivity";
import ExcelJS from "exceljs";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { DealRow } from "@/lib/deals";
import { inferStrategy, planSummary } from "@/lib/deal-strategy";
import { planFacts } from "@/lib/plan-facts";
import { buildMemoData } from "@/lib/memo/memo-document";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = "p. 3"): Row => ({ label, value, flagged: false, page });

const VALUE_ADD: ExtractionResult = {
  dealName: "Monthly Value-Add",
  assetClass: "multifamily",
  market: "",
  address: "",
  strategy: { kind: "value_add", summary: "Renovate the interiors", capitalBudget: "", timeline: "" },
  metrics: [
    row("Asking price", "$17,000,000", "p. 2"),
    row("Stabilized NOI (monthly)", "$110,000"),
    row("Renovation budget", "$2,000,000", "p. 4"),
  ],
} as ExtractionResult;

describe("a plan's NOI stated a month at a time is said with its month wherever it is printed", () => {
  const plan = planSummary(VALUE_ADD, inferStrategy(VALUE_ADD))!;

  it("the plan's facts — the deal page, the shared screen, the report's plan page", () => {
    expect(plan.stabilizedNoi).toMatchObject({ value: 1_320_000, month: 110_000 });
    const noi = planFacts(plan).find(([label]) => label === "Stabilized NOI")!;
    expect(noi[1]).toBe("$1.32M (twelve times the $110k a month stated)");
  });

  it("the memo's strategy line", () => {
    const deal = { name: "Monthly Value-Add", asset_class: "multifamily", extraction: VALUE_ADD, prior_screen: null } as unknown as DealRow;
    expect(buildMemoData(deal, "October 5, 2026").strategyLine).toMatch(
      /stabilized NOI \$1\.32M \(twelve times the \$110,000 a month stated\) on \$19\.\dM total cost/,
    );
  });

  it("the workbook's input cell, sourced as the month times twelve, never a year the OM states", async () => {
    const d = deriveUnderwriteInputs(VALUE_ADD, "x");
    expect(d.meta.stabilizedNoi).toEqual({ value: 1_320_000, page: "p. 3", month: 110_000 });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(d)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Deal Summary")!;
    let r = 1;
    while (r < 200 && ws.getCell(r, 1).value !== "OM Stabilized NOI (pro forma)") r++;
    expect(ws.getCell(r, 2).value).toBe(1_320_000);
    expect(String(ws.getCell(r, 3).value)).toBe("OM p. 3: $110,000 a month × 12");
  }, 30000);

  it("the deal page's stress card and the yield-withheld sentence, as the report says them (audit C6, LOW-1)", () => {
    const html = renderToStaticMarkup(createElement(PlanSensitivity, { plan, refCap: { pct: 0.06, provenance: "assumption" } }));
    expect(html).toContain("under the OM&#x27;s $1.32M (twelve times the $110k a month stated) — down to");
    // A year mislabelled monthly: the twelve is where the misread lies, so
    // the sentence that withholds the yield says it.
    const misread = {
      ...VALUE_ADD,
      metrics: [row("Asking price", "$17,000,000", "p. 2"), row("Stabilized NOI (monthly)", "$1,320,000"), row("Renovation budget", "$2,000,000", "p. 4")],
    } as ExtractionResult;
    const p = planSummary(misread, inferStrategy(misread))!;
    expect(p.yieldOnCost).toBeNull();
    expect(p.yieldWithheld).toMatch(/the \$15\.8\d?M \(twelve times the \$1\.3\d?M a month stated\) stabilized NOI over the \$19\.0M total cost/);
  });
});
