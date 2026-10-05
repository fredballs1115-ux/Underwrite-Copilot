// One figure, one reader (research pass 34): a deal's figure reads the same
// on every surface that summarizes it — the deal header, the pipeline card
// and its CSV, the meeting workbook, the compare table, the analytics and
// the internal comps. Each case here is a deal of the pass's own shape, read
// through the reader each surface calls.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";
import type { ExtractedMetric, ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { inferStrategy, planSummary } from "./deal-strategy";
import { basisTag, pickSlots } from "./pipeline-slots";
import { vsMarketHeading } from "./research-data";
import { pipelineExportRow, type ExportRowContext } from "./pipeline-export-row";
import { buildPipelineWorkbook, type PipelineExportRow } from "./pipeline-workbook";
import { compareReturns } from "./compare-figures";
import { SHARE_CAP_WORDS, capSlotWithheld, goingInCapFigure } from "./compare-interest";
import { capCellText } from "./cap-slot";
import { interestShortLine, interestTag, readInterest } from "./interest";
import { deriveInternalComps } from "./internal-comps";
import { deriveAnalytics, fmtUsdCompact } from "./analytics";
import { buildComps, fmtBasisRange } from "./market-memory";
import { PLAN_YOC_TITLE, moneyCompact, pctText, planReadLine, yieldOnCostText } from "./plan-facts";
import { portfolioMoney } from "./portfolio";
import { exitMoney } from "./leasehold-exit";
import { assumableMoney } from "./assumable-debt";
import { fmtBasis } from "./comp-detail";
import { CompareTable, type Col } from "@/app/(app)/deals/compare/compare-table";
import { visibleText } from "./render-lint";
import { priceRange, priceRangeShort } from "./criteria";

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

  it("a sibling's stated range in the internal comps is its card's and its header's \"$40–42M\", never its top alone (finding 13)", () => {
    const ranged = ex([m("Pricing guidance", "$40,000,000 – $42,000,000"), m("Going-in cap rate", "5.50%"), m("Units", "150")]);
    const row = { id: "r", name: "Ranged", asset_class: "multifamily", created_at: "2026-10-01T00:00:00Z", is_sample: false, verdict: null, extraction: ranged };
    const [comp] = deriveInternalComps("other", "multifamily", { assetClass: "multifamily" }, [row]);
    expect(comp.priceLabel).toBe("$40–42M");
    // The card and the header draw the slot's stated range short the same way.
    expect(pickSlots(ranged, null).price).toBe("$40,000,000 – $42,000,000");
    expect(priceRangeShort(priceRange(pickSlots(ranged, null).price!)!)).toBe("$40–42M");
    // Its basis stays on the range's top, the end that does not flatter.
    expect(comp.basisLabel).toBe("$280k/unit");
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

  it("the analytics, the market memory and the internal comps pool no cap the deal's own header withholds", () => {
    const share = { kind: "partial_interest" as const, summary: "", share: "49% limited partnership interest", groundLease: "", loan: "", page: "p. 2" };
    const base = [m("Asking price", "$20,580,000"), m("Going-in cap rate", "5.40%"), m("Units", "200")];
    const row = (id: string, extraction: ExtractionResult) => ({
      id,
      name: id,
      asset_class: "multifamily",
      created_at: "2026-10-01T00:00:00Z",
      is_sample: false,
      stage: "screening",
      verdict: null,
      extraction,
    });
    const recap = row("recap", ex([...base, m("Entity loan balance", "$56,500,000")], { interest: share }));
    const plain = row("plain", ex(base, { interest: share }));
    const position = row(
      "position",
      ex([...base, m("Preferred equity amount", "$20,580,000"), m("Preferred return", "12% preferred return"), m("Mandatory redemption date", "June 2029")], {
        interest: { kind: "preferred_equity", summary: "", share: "", groundLease: "", loan: "", page: "p. 2" },
      }),
    );
    const charts = Object.fromEntries(deriveAnalytics([recap, plain, position]).map((d) => [d.id, d.capPct]));
    expect(charts).toEqual({ recap: null, plain: 5.4, position: null });
    const memory = Object.fromEntries(buildComps([recap, plain, position]).map((c) => [c.dealId, c.capPct]));
    expect(memory.plain).toBe(5.4);
    expect(memory.recap ?? null).toBeNull();
    expect(memory.position ?? null).toBeNull();
    const comps = Object.fromEntries(deriveInternalComps("other", "multifamily", { assetClass: "multifamily" }, [recap, plain, position]).map((c) => [c.dealId, c.capLabel]));
    expect(comps).toEqual({ recap: null, plain: "5.40%", position: null });
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

describe("a note's and a position's own yield, wherever the cap slot is printed (finding 10)", () => {
  const today = "2026-10-05";
  const on = { address: null, siteFlags: null, today };
  const note = ex(
    [
      m("Asking price", "$52,000,000"),
      m("Going-in cap rate", "8.65%"),
      m("Unpaid principal balance", "$60,000,000"),
      m("Note rate", "6.50%"),
      m("Maturity date", "March 31, 2029"),
      m("Payment status", "Performing"),
    ],
    { interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "p. 2" } },
  );
  const position = ex(
    [
      m("Asking price", "$8,000,000"),
      m("Preferred equity amount", "$8,000,000"),
      m("Preferred return", "12% preferred return, 8% current pay"),
      m("Current pay rate", "8.0%"),
      m("Mandatory redemption date", "June 2029"),
    ],
    { interest: { kind: "preferred_equity", summary: "", share: "", groundLease: "", loan: "", page: "p. 2" } },
  );

  for (const [what, e, to] of [
    ["a note", note, "to maturity"],
    ["a position", position, "to redemption"],
  ] as const) {
    it(`${what}: the card's figure in the CSV and the meeting workbook, never "n/a"`, async () => {
      const slots = pickSlots(e, null, null, on);
      expect(slots.cap).toBeNull();
      expect(slots.noteYield).toMatch(/^\d+\.\d%$/);
      // The CSV's cell (lib/cap-slot), as the card shows it.
      expect(capCellText(slots)).toBe(`${slots.noteYield} ${to}`);
      // The meeting workbook, read on the same day.
      const row = pipelineExportRow({ name: what, asset_class: "multifamily", created_at: "2026-10-01T00:00:00Z", verdict: null, extraction: e, stage: "screening" }, ctx);
      expect(row.noteYield).toBe(slots.noteYield);
      expect((await workbookRow(row)).getCell(8).value).toBe(`${slots.noteYield} ${to}`);
    });
  }
});

describe("the research panel's per-unit read is the card's basis, in the deal's own noun (finding 11)", () => {
  it("apartments stating both their units and their area: the card's $280k/unit, where the panel had printed nothing", () => {
    const e = ex([m("Asking price", "$42,000,000"), m("Units", "150"), m("Rentable SF", "142,500 SF")]);
    const basis = basisTag(e, inferStrategy(e).kind, "multifamily");
    expect(basis).toBe("$280k/unit");
    expect(pickSlots(e, null, "multifamily").basis).toBe(basis);
    expect(vsMarketHeading(basis)).toBe("vs. market — this deal ≈ $280k/unit");
  });

  it("a hotel counting its rooms: a room, never a unit", () => {
    const e = ex([m("Asking price", "$36,000,000"), m("Rooms", "180"), m("Building SF", "120,000 SF")], { assetClass: "hospitality_str" });
    const basis = basisTag(e, inferStrategy(e).kind, "hospitality_str");
    expect(basis).toBe("$200k/room");
    expect(vsMarketHeading(basis)).toBe("vs. market — this deal ≈ $200k/room");
  });

  it("no figure where the card has none: a conversion, a note", () => {
    expect(vsMarketHeading(null)).toBe("vs. market");
  });

  it("the deal page hands the panel the card's reader, and the panel parses no size text", () => {
    const page = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/page.tsx"), "utf8");
    expect(page).toMatch(/basis=\{extraction \? basisTag\(extraction, strategy\.kind, deal\.asset_class as string \| null\) : null\}/);
    const panel = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/research-panel.tsx"), "utf8");
    expect(panel).toContain("{vsMarketHeading(basis)}");
    expect(panel).not.toMatch(/pricePerUnit|\/unit` : ""/);
  });
});

describe("a plan deal is judged on its yield on total cost — never said to have no going-in cap (finding 12)", () => {
  it("the shared screen's sentence names the in-place cap a value-add's key terms print beside it", () => {
    expect(planReadLine("value_add", "Value-add", false)).toBe(
      "A value-add deal is judged on its yield on total cost, not on its in-place cap: the stabilized NOI is the finished project's figure, set over everything the plan costs — never a cap rate on the acquisition price.",
    );
    expect(planReadLine("lease_up", "Lease-up", false)).toMatch(/^A lease-up deal is judged on its yield on total cost, not on its in-place cap:/);
    // A development has no income in place to strike a cap on.
    expect(planReadLine("development", "Development", true)).toBe(
      "A development deal is judged on its yield on total cost: the stabilized NOI is the finished project's figure, set over everything the plan costs — never a cap rate on the land price.",
    );
    for (const k of ["value_add", "lease_up", "conversion", "development"] as const) {
      expect(planReadLine(k, "Plan", false)).not.toMatch(/has no going-in cap/);
    }
  });

  it("the pipeline's tooltips, the internal comps' and the analytics' notes read the same way", () => {
    expect(PLAN_YOC_TITLE).toMatch(/judged on .* not on its in-place cap/);
    for (const file of ["app/(app)/deals/pipeline.tsx", "app/(app)/deals/[id]/deal-view.tsx", "app/(app)/analytics/page.tsx", "app/share/[token]/plan-facts.tsx", "app/(app)/deals/[id]/research-panel.tsx"]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      // Visible words only: a comment may still describe the old reading.
      const visible = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(visible, file).not.toMatch(/(?:has|have|carry) no going-in cap/i);
    }
  });
});

describe("analytics, the market memory and the internal comps read a deal's kind with its first signal (finding 7)", () => {
  // The extraction names no plan; the first signal's take does.
  const e = ex([m("Asking price", "$20,000,000"), m("Going-in cap rate", "5.00%"), m("Units", "100")], {
    strategy: { kind: "unknown", summary: "", capitalBudget: "", timeline: "" },
  });
  const signal = signalOf({ askPrice: "$20,000,000", take: "A value-add play: the renovation program carries the return — check the premium." });
  const row = (first_signal: FirstSignal | null) => ({
    id: "v",
    name: "Value-add by its signal",
    asset_class: "multifamily",
    created_at: "2026-10-01T00:00:00Z",
    is_sample: false,
    stage: "screening",
    verdict: null,
    extraction: e,
    first_signal,
  });

  it("the deal page and the card read a value-add, so no cap is pooled or printed as a comp's", () => {
    expect(inferStrategy(e, signal).kind).toBe("value_add");
    expect(pickSlots(e, signal).cap).toBeNull();
    const [plotted] = deriveAnalytics([row(signal)]);
    expect(plotted.kind).toBe("value_add");
    expect(plotted.capPct).toBeNull();
    const [pooled] = buildComps([row(signal)]);
    expect(pooled?.capPct ?? null).toBeNull();
    const [comp] = deriveInternalComps("other", "multifamily", { assetClass: "multifamily" }, [row(signal)]);
    expect(comp.kindLabel).toBe("Value-add");
    expect(comp.capLabel).toBeNull();
  });

  it("a row read without its signal reads as before: the stabilized cap", () => {
    expect(deriveAnalytics([row(null)])[0].capPct).toBe(5);
    expect(buildComps([row(null)])[0].capPct).toBe(5);
    expect(deriveInternalComps("other", "multifamily", { assetClass: "multifamily" }, [row(null)])[0].capLabel).toBe("5.00%");
  });

  it("the analytics page and the market page select the first signal for it", () => {
    for (const file of ["app/(app)/analytics/page.tsx", "app/market/page.tsx"]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, file).toMatch(/\.select\("id, name, asset_class, created_at, is_sample,[^"]*extraction, first_signal"\)/);
    }
  });
});

describe("a compact figure is rounded one way on every surface (finding 14)", () => {
  // The pass's note: priced $5,550,000, it was "$5.5M" on its card and "the
  // $5.6M price is …" on its memo, its shared screen and its workbook cover.
  const note = ex([m("Asking price", "$5,550,000"), m("Unpaid principal balance", "$6,000,000")], {
    interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" },
    totalPages: 40,
  });

  it("every reader that writes money short says the note's $5.6M", () => {
    for (const write of [moneyCompact, fmtUsdCompact, portfolioMoney, exitMoney, assumableMoney]) {
      expect(write(5_550_000)).toBe("$5.6M");
    }
    const r = readInterest(note, 5_550_000, new Date("2026-10-05T12:00:00Z"))!;
    expect(r.lead).toContain("The $5.6M price is");
    expect(interestShortLine(r)).toContain("the $5.6M price");
    const row = { id: "n", name: "Note", asset_class: "multifamily", created_at: "2026-10-01T00:00:00Z", is_sample: false, verdict: null, extraction: note };
    expect(deriveInternalComps("other", "multifamily", { assetClass: "multifamily" }, [row])[0].priceLabel).toBe("$5.6M · note");
  });

  it("a key past a million reads one way on the card, beside the comps and in the market memory", () => {
    const e = ex([m("Asking price", "$430,000,000"), m("Keys", "200")], { assetClass: "hospitality_str" });
    const card = basisTag(e, inferStrategy(e).kind, "hospitality_str");
    expect(card).toBe("$2.2M/key");
    // The comps' caption had printed "$2.15M/key", the memory "$2150k/key".
    expect(fmtBasis(2_150_000, "unit", "key")).toBe(card);
    expect(fmtBasisRange({ min: 2_150_000, median: 2_150_000, max: 2_150_000, basis: "unit", noun: "key" })).toBe(card);
    expect(fmtBasisRange({ min: 950_000, median: 1_000_000, max: 1_150_000, basis: "unit", noun: "key" })).toBe("$950k–$1.2M/key");
  });

  it("no surface but lib/money writes a compact dollar by hand", () => {
    // Every surface reads through `compactUsd` now; a file listed here
    // would be one still writing its own.
    const elsewhere = new Set<string>([]);
    const lead = String.raw`(?:\$\$\{|"\$"\s*\+\s*)`;
    const handWritten = [
      // a float's toFixed on millions: (5_550_000 / 1e6).toFixed(1) is "5.5"
      new RegExp(String.raw`${lead}\(\s*[\w.!?]+\s*\/\s*(?:1e6|1_000_000)\s*\)\s*\.toFixed\(`),
      // a second writer of tenths of a million
      new RegExp(String.raw`${lead}\(\s*Math\.round\(\s*[\w.!?]+\s*\/\s*1e5\s*\)\s*\/\s*10\s*\)`),
      // a second writer of thousands
      new RegExp(String.raw`${lead}Math\.round\(\s*[\w.!?]+\s*\/\s*(?:1e3|1000|1_000)\s*\)`),
    ];
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const d of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${d.name}`;
        if (d.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) && rel !== "lib/money.ts" && !elsewhere.has(rel)) {
          const text = readFileSync(join(process.cwd(), rel), "utf8");
          if (handWritten.some((re) => re.test(text))) found.push(rel);
        }
      }
    };
    walk("app");
    walk("lib");
    expect(found).toEqual([]);
    // The card's own price writer is the helper.
    expect(readFileSync(join(process.cwd(), "app/(app)/deals/pipeline.tsx"), "utf8")).toMatch(/return compactUsd\(n\);/);
  });
});

describe("the card's dated slots on the reader's day, never the clock (finding 18)", () => {
  const leasehold = ex([m("Asking price", "$30,000,000"), m("Going-in cap rate", "6.00%"), m("Ground lease expiration", "December 31, 2071")], {
    interest: { kind: "leasehold", summary: "", share: "", groundLease: "", loan: "", page: "p. 4" },
  });
  const on = (today: string) => ({ address: null, siteFlags: null, today });

  it("what the price buys is counted from the day the page hands in", () => {
    const at = (today: string) => interestTag(leasehold, new Date(`${today}T12:00:00Z`));
    expect(pickSlots(leasehold, null, null, on("2026-10-05")).interest).toBe(at("2026-10-05"));
    // Years on, the tag counts from that day, not from the machine's.
    expect(at("2041-06-01")).not.toBe(at("2026-10-05"));
    expect(pickSlots(leasehold, null, null, on("2041-06-01")).interest).toBe(at("2041-06-01"));
    // The meeting workbook reads it on the route's day, as the card does.
    const row = pipelineExportRow({ name: "Leasehold", asset_class: "multifamily", created_at: "2026-10-01T00:00:00Z", verdict: null, extraction: leasehold, stage: "screening" }, { ...ctx, today: "2041-06-01" });
    expect(row.interest).toBe(at("2041-06-01"));
  });
});
