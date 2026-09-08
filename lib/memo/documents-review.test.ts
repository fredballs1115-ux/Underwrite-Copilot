// The eighth review's document cases — the memo, the full report, the
// shared screen and the briefs handed to the model, read as the person on
// the other end reads them: the PDFs are rendered and their text read back
// (pdf-text-of.ts), so a block that drops the asking price, a chip whose
// mark encodes to nothing, a page citation the app refuses to show, or a
// -17.9x "equity multiple" fails here and not in someone's inbox.
import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { MemoDocument, STATUS_CHIP, buildMemoData } from "./memo-document";
import { ReportDocument, buildReportData, citedPage } from "./report-document";
import { pdfSafe } from "./pdf-text";
import { pdfTextOf } from "./pdf-text-of";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { evaluateBuyBox } from "@/lib/criteria";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildSensitivityData, heatCellEm, type HeatCell } from "@/lib/underwrite/report-grid";
import { buildPlanReport } from "@/lib/plan-sensitivity";
import { planFacts } from "@/lib/plan-facts";
import { inferStrategy, planSummary } from "@/lib/deal-strategy";
import { verdictInstruction } from "@/lib/anthropic/prompts";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult } from "@/lib/anthropic/types";

const render = async (element: React.ReactElement): Promise<string> =>
  pdfTextOf(await renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]));

const sampleDeal = {
  name: SAMPLE_DEAL.name,
  asset_class: SAMPLE_DEAL.asset_class,
  extraction: SAMPLE_DEAL.extraction,
  challenges: SAMPLE_DEAL.challenges,
  comps: SAMPLE_DEAL.comps,
  market: SAMPLE_DEAL.market,
  reconciliation: SAMPLE_DEAL.reconciliation,
  verdict: SAMPLE_DEAL.verdict,
  prior_screen: null,
} as unknown as DealRow;

const sampleChecks = evaluateBuyBox(
  SAMPLE_DEAL.asset_class,
  {
    assetClass: SAMPLE_DEAL.extraction.assetClass,
    market: SAMPLE_DEAL.extraction.market,
    metrics: SAMPLE_DEAL.extraction.metrics,
  },
  SAMPLE_DEMO_BOX,
);

// The conversion: a $21M stabilized NOI beside a $20M price, a 40-page OM
// with one citation that points past its last page.
const conversion: ExtractionResult = {
  dealName: "1200 K Street — Office-to-Residential Conversion",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1200 K St NW, Washington, DC",
  totalPages: 40,
  strategy: {
    kind: "conversion",
    summary: "Convert a vacant 300,000 SF office building into 612 apartments.",
    capitalBudget: "$160M hard and soft costs",
    timeline: "24 months of construction, 12 months of lease-up",
  },
  metrics: [
    { label: "Purchase price", value: "$20,000,000", flagged: false, page: "p. 3" },
    { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: false, page: "p. 12" },
    { label: "Total project cost", value: "$180,000,000", flagged: false, page: "p. 14" },
    { label: "Proposed units", value: "612", flagged: false, page: "p. 5" },
    { label: "Rentable square feet", value: "300,000", flagged: false, page: "p. 412" },
  ],
};

// The same plan stated as one all-in total and no price: the "budget" IS
// the total cost, with the acquisition inside it.
const allInOnly: ExtractionResult = {
  ...conversion,
  metrics: [
    { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: false, page: "p. 12" },
    { label: "Total project cost", value: "$180,000,000", flagged: false, page: "p. 14" },
    { label: "Proposed units", value: "612", flagged: false, page: "p. 5" },
  ],
};

function planDealRow(extraction: ExtractionResult): DealRow {
  return {
    name: extraction.dealName,
    asset_class: "multifamily",
    extraction,
    challenges: null,
    comps: null,
    market: null,
    reconciliation: null,
    verdict: SAMPLE_DEAL.verdict,
    prior_screen: null,
  } as unknown as DealRow;
}

function reportFor(extraction: ExtractionResult, overrides?: string[]) {
  const derived = deriveUnderwriteInputs(extraction, extraction.dealName ?? "Deal");
  const plan = buildPlanReport(extraction, {
    pct: derived.inputs.exitCapPct,
    provenance: derived.sources.exitCapPct?.provenance ?? "assumption",
  });
  const sensitivity = buildSensitivityData(derived.inputs, null);
  return buildReportData(planDealRow(extraction), "September 8, 2026", [], sensitivity, undefined, plan, overrides);
}

describe("the eighth review's document cases", () => {
  it("1. the memo's key terms lead with the asking price, the going-in cap and the unit count — not four flagged pro-forma rows", async () => {
    const data = buildMemoData(sampleDeal, "September 8, 2026", sampleChecks);
    // The screen block is present, so the block is cut at four — and the
    // deal-defining rows are inside the cut.
    expect(data.keyTerms).toHaveLength(4);
    expect(data.keyTerms.slice(0, 3).map((t) => t.label)).toEqual(["Asking price", "Going-in cap", "Units"]);
    const text = await render(React.createElement(MemoDocument, { data }));
    expect(text).toMatch(/KEY TERMS\nASKING PRICE\n\$68,000,000\nGOING-IN CAP\n5\.45%\nUNITS\n248\n/);
  }, 30000);

  it("2. the report omits the IRR sensitivity page on a plan deal and says so on the plan page; a stabilized asset keeps it", async () => {
    const input = reportFor(conversion);
    expect(input.sensitivity).toBeNull();
    const text = await render(React.createElement(ReportDocument, { input }));
    expect(text).not.toMatch(/Sensitivity analysis/);
    expect(text).not.toMatch(/-4\d\.\d%/);
    expect(text).toMatch(/The IRR sensitivity page is omitted on a plan deal/);
    // The stabilized sample keeps its grids.
    const derived = deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name);
    const stabilized = buildReportData(sampleDeal, "September 8, 2026", sampleChecks, buildSensitivityData(derived.inputs, null));
    expect(stabilized.sensitivity).not.toBeNull();
  }, 45000);

  it("2b. an equity multiple at or below zero prints as a dash, never as a negative multiple", () => {
    const cell = (em: number | null) => ({ irrPct: -0.478, em, bucket: "far_below" }) as unknown as HeatCell;
    expect(heatCellEm(cell(-17.9))).toBe("—");
    expect(heatCellEm(cell(0))).toBe("—");
    expect(heatCellEm(cell(null))).toBe("—");
    expect(heatCellEm(cell(1.94))).toBe("1.9x");
  });

  it("4. the verdict prompt's ranges bullet carries the plan carve-out, not only the deal-killers bullet", () => {
    const bullets = verdictInstruction().split("\n");
    const ranges = bullets.find((l) => l.startsWith("- `ranges`"));
    const killers = bullets.find((l) => l.startsWith("- `dealKillers`"));
    expect(ranges).toMatch(/TOTAL COST per unit or per SF, never the shell's or the land's price alone/);
    expect(killers).toMatch(/basis is total cost per unit or per SF/);
  });

  it("5. both document routes judge the buy box from the deal page's own check source", () => {
    for (const route of ["app/api/deals/[id]/memo/route.ts", "app/api/deals/[id]/report/route.ts"]) {
      const src = readFileSync(route, "utf8");
      expect(src, route).toMatch(/buyBoxCheckSource\(/);
      expect(src, route).toMatch(/inferStrategy\(extraction, firstSignal\)\.kind/);
      expect(src, route).toMatch(/deal\.address as StructuredAddress/);
      // The raw extraction is never the third argument any more.
      expect(src, route).not.toMatch(/evaluateBuyBox\(\s*deal\.asset_class,\s*\(deal\.extraction as ExtractionResult\)/);
    }
    // The report route also carries the analyst's override lines into page 1.
    expect(readFileSync("app/api/deals/[id]/report/route.ts", "utf8")).toMatch(/dealOverrideLines\(/);
  });

  it("6. every buy-box chip mark survives the PDF text filter, and a passing criterion prints its mark", async () => {
    for (const [status, chip] of Object.entries(STATUS_CHIP)) {
      expect(chip.mark, status).not.toBe("");
      expect(pdfSafe(chip.mark), status).toBe(chip.mark);
    }
    const data = buildMemoData(sampleDeal, "September 8, 2026", sampleChecks);
    expect(data.buyBox.map((c) => c.status)).toContain("pass");
    const text = await render(React.createElement(MemoDocument, { data }));
    const block = text.slice(text.indexOf("BUY BOX"));
    expect(block).toMatch(/^BUY BOX\n\+\nAsset class\n/);
  }, 30000);

  it("7. the report prints a page citation only when it falls inside the OM's page count", async () => {
    expect(citedPage("p. 412", 40)).toBe("—");
    expect(citedPage("p. 12", 40)).toBe("p. 12");
    expect(citedPage("p. 12", null)).toBe("—");
    expect(citedPage("", 40)).toBe("—");
    const input = reportFor(conversion);
    expect(input.totalPages).toBe(40);
    const text = await render(React.createElement(ReportDocument, { input }));
    expect(text).not.toMatch(/p\. 412/);
    expect(text).toMatch(/Rentable square feet\n300,000\n—\n—/);
    expect(text).toMatch(/Purchase price\n\$20,000,000\n—\np\. 3/);
  }, 45000);

  it("8. the full report's memo page carries the analyst's override lines, as the standalone memo does", async () => {
    const input = reportFor(conversion, ["Supply check dismissed: the pipeline counts a project that broke ground in 2019."]);
    expect(input.memo.overrides).toHaveLength(1);
    const text = await render(React.createElement(ReportDocument, { input }));
    expect(text).toMatch(/SUBMARKET CHECKS OVERRIDDEN/);
    expect(text).toMatch(/Supply check dismissed/);
  }, 45000);

  it("9. the memo's ranges keep the model's confidence", async () => {
    const data = buildMemoData(sampleDeal, "September 8, 2026", sampleChecks);
    expect(data.ranges.length).toBeGreaterThan(0);
    for (const r of data.ranges) expect(["high", "medium", "low"]).toContain(r.confidence);
    const text = await render(React.createElement(MemoDocument, { data }));
    expect(text).toMatch(/SOURCE\nCONF\./);
    expect(text).toMatch(new RegExp(`\\n${data.ranges[0].confidence}\\n`));
  }, 30000);

  it("10. the report's plan strip reads the same facts, in the same words and format, as the deal page and the shared screen", async () => {
    const facts = planFacts(planSummary(conversion, inferStrategy(conversion))!);
    const text = await render(React.createElement(ReportDocument, { input: reportFor(conversion) }));
    // A long label wraps inside its strip cell, so compare with whitespace
    // collapsed: label, then its value.
    const flat = text.replace(/\s+/g, " ");
    for (const [label, value] of facts) {
      expect(flat, label).toContain(`${label.toUpperCase()} ${value}`);
    }
    // $21.0M and $180.0M, as the deal page prints them — not $21M / $180M.
    expect(text).toMatch(/STABILIZED NOI\n\$21\.0M/);
    expect(flat).toContain("BASIS PER UNIT (ALL-IN) $294k");
  }, 45000);

  it("11. an all-in-only plan calls its overrun figure total cost; a stated budget is still the budget", async () => {
    const allIn = await render(React.createElement(ReportDocument, { input: reportFor(allInOnly) }));
    expect(allIn).toMatch(/Total cost would have to run \d+% over/);
    expect(allIn).toMatch(/TOTAL COST, AGAINST THE OM'S/);
    expect(allIn).not.toMatch(/The budget would have to run/);
    const budgeted = await render(React.createElement(ReportDocument, { input: reportFor(conversion) }));
    expect(budgeted).toMatch(/The budget would have to run \d+% over/);
    expect(budgeted).toMatch(/THE BUDGET, AGAINST THE OM'S/);
  }, 60000);

  it("12. the shared screen orders its key terms as the memo does and badges each figure's basis", () => {
    const src = readFileSync("app/share/[token]/page.tsx", "utf8");
    expect(src).toMatch(/keyTermRows\(safeExtraction\?\.metrics \?\? \[\], strategy\.kind, 8\)/);
    expect(src).toMatch(/m\.basis === "pro_forma"/);
    expect(src).toMatch(/m\.basis === "in_place"/);
    // …and keeps each range's confidence and basis line.
    expect(src).toMatch(/RANGE_CONF\[r\.confidence\]/);
    expect(src).toMatch(/r\.basis && /);
  });
});
