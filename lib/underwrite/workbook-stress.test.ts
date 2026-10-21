// The underwriting workbook's Stress Test tab: the stress test the deal page
// prints (lib/stress-test, the sample's through lib/sample-stress), one row a
// stress row in the panel's order, then the headline — data only, absent
// where there is no test with rows, and the model's own tabs untouched. Read
// back from the built file.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import { STRESS_COLUMNS, STRESS_HEAD_ROW, buildUnderwriteWorkbook, stressTabRows } from "./workbook";
import { readOmFacts } from "./om-facts";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { sampleStressTest } from "@/lib/sample-stress";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { buildStressTest } from "@/lib/stress-test";
import { sortStressRows } from "@/app/stress-test-panel";
import {
  HOLDS_NO_RERUN,
  SAMPLE_PLAN_NOTE,
  bestEvidence,
  drawsRerun,
  headlineSentence,
  liveHeadline,
  partNote,
  shownHeadline,
  stressReadLine,
  whenWords,
} from "@/lib/stress-test-words";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { StressRow, StressTest } from "@/lib/stress-test-types";

const TODAY = "2026-10-20";
const model = sampleDerivedInputs();
const sample = sampleStressTest({ today: TODAY });
const col = (name: (typeof STRESS_COLUMNS)[number]) => STRESS_COLUMNS.indexOf(name) + 1;

async function load(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}
const build = (test: StressTest | null | undefined, omFacts = false) =>
  buildUnderwriteWorkbook(model, null, null, null, new Date("2026-10-20T12:00:00Z"), null, null, new Date("2026-10-20T12:00:00Z"), omFacts ? readOmFacts(SAMPLE_DEAL.extraction as ExtractionResult) : null, test);

/** A cell's value, a formula's cached result, null where empty. */
const valueOf = (c: ExcelJS.Cell): unknown => {
  const v = c.value;
  if (v == null) return null;
  if (typeof v === "object" && !(v instanceof Date) && "formula" in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
  return v;
};
const isFormula = (c: ExcelJS.Cell) => typeof c.value === "object" && c.value !== null && !(c.value instanceof Date) && "formula" in c.value;

/** The row's figure as the tab stores it: a percent as Excel's percent. */
const stored = (row: StressRow, v: number) =>
  ["vacancy", "rent_growth", "expense_growth", "exit_cap", "debt"].includes(row.key) ? v / 100 : v;

describe("the Stress Test tab", () => {
  it("sits beside the Market Read (after the Assumptions, before the OM Facts) and the Contents name it", async () => {
    const wb = await load(await build(sample, true));
    const names = wb.worksheets.map((w) => w.name);
    expect(names.indexOf("Stress Test")).toBe(names.indexOf("Assumptions") + 1);
    expect(names.indexOf("OM Facts")).toBe(names.indexOf("Stress Test") + 1);
    let listed = false;
    wb.getWorksheet("Cover")!.eachRow((r) => {
      if (r.getCell(2).value === "Stress Test") listed = true;
    });
    expect(listed).toBe(true);
  });

  it("says what it is, the test's own read line and, on the sample, the sample's plan note", async () => {
    const ws = (await load(await build(sample))).getWorksheet("Stress Test")!;
    expect(ws.getCell(1, 1).value).toBe("The stress test, struck in code");
    expect(String(ws.getCell(2, 1).value)).toContain("Data only: no formula on the model's own tabs reads this tab, and they stay live");
    expect(ws.getCell(3, 1).value).toBe(stressReadLine(sample));
    expect(ws.getCell(4, 1).value).toBe(SAMPLE_PLAN_NOTE);
    const head = STRESS_COLUMNS.slice(1).map((_, i) => ws.getCell(STRESS_HEAD_ROW, i + 2).value);
    expect(head).toEqual(STRESS_COLUMNS.slice(1).map((h) => h.toUpperCase()));
  });

  it("prints one row a stress row in the panel's order, each figure the row's own, a blank where it carries none", async () => {
    expect(stressTabRows(sample).map((r) => r.key)).toEqual(sortStressRows(sample.rows).map((r) => r.key));
    const ws = (await load(await build(sample))).getWorksheet("Stress Test")!;
    const rows = stressTabRows(sample);
    expect(rows.length).toBe(sample.rows.length);
    // the sample has a row of each shape this test reads
    expect(rows.some(drawsRerun)).toBe(true);
    expect(rows.some((r) => r.verdict === "unchecked")).toBe(true);
    rows.forEach((row, i) => {
      const r = STRESS_HEAD_ROW + 1 + i;
      const at = (name: (typeof STRESS_COLUMNS)[number]) => valueOf(ws.getCell(r, col(name)));
      expect(at("Assumption")).toBe(row.title);
      expect(String(at("Verdict")).toLowerCase()).toBe(row.verdict);
      if (row.omSays.value != null) expect(at("OM's figure")).toBeCloseTo(stored(row, row.omSays.value), 10);
      else expect(at("OM's figure"), row.key).toBeNull();
      expect(at("OM page")).toBe(row.omSays.page);
      const e = row.verdict === "unchecked" ? null : bestEvidence(row);
      if (e) {
        expect(at("The figure that decides")).toBe(`${e.label}: ${e.text}`);
        expect(String(at("Kind"))).toMatch(/^(The deal's own document|A published figure|A rule of thumb|The OM against itself)/);
        expect(at("Publisher or source")).toBe(e.publisher);
        if (e.value != null) expect(at("Figure")).toBeCloseTo(stored(row, e.value), 10);
        else expect(at("Figure")).toBeNull();
        const asOf = at("As of");
        if (asOf instanceof Date) {
          expect(asOf.toISOString().slice(0, 10)).toBe(e.asOf);
          expect(ws.getCell(r, col("As of")).numFmt).toBe("mmm d, yyyy");
          expect(whenWords(e.asOf)).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
        } else if (e.asOf) expect(asOf).toBe(whenWords(e.asOf));
        else if (e.kind !== "published") expect(asOf).toBeNull();
      } else {
        // An unchecked row was decided by nothing: no evidence, no gap, no move.
        for (const name of ["The figure that decides", "Kind", "Figure", "Publisher or source", "As of"] as const) expect(at(name), `${row.key} ${name}`).toBeNull();
      }
      if (row.gap) {
        expect(at("Gap (+ = the OM is more optimistic)")).toBeCloseTo(row.gap.unit === "pct" ? row.gap.value / 100 : row.gap.value, 10);
        expect(at("The gap, in words")).toBe(row.gap.text);
      } else {
        expect(at("Gap (+ = the OM is more optimistic)")).toBeNull();
        expect(at("The gap, in words")).toBeNull();
      }
      if (drawsRerun(row)) {
        const imp = row.impact!;
        expect(at("Re-run of")).toBe("Levered IRR");
        expect(at("At the OM's figure")).toBeCloseTo(imp.baseIrrPct! / 100, 10);
        expect(at("At the evidence's")).toBeCloseTo(imp.altIrrPct! / 100, 10);
        // The move is a formula over the two cells beside it, its result cached.
        const move = ws.getCell(r, col("Move (pts)"));
        expect(isFormula(move)).toBe(true);
        expect(valueOf(move)).toBeCloseTo(imp.altIrrPct! - imp.baseIrrPct!, 10);
        expect(String(at("The re-run, or why none"))).toContain(imp.note);
      } else {
        // A blank is null, never zero: no re-run drawn, no figure printed.
        for (const name of ["Re-run of", "At the OM's figure", "At the evidence's", "Move (pts)"] as const) expect(at(name), `${row.key} ${name}`).toBeNull();
        if (row.verdict === "holds") expect(at("The re-run, or why none")).toBe(HOLDS_NO_RERUN);
        if (row.verdict === "unchecked" && row.unchecked) expect(at("The re-run, or why none")).toBe(row.unchecked);
      }
      expect(at("How it was tested")).toBe(row.method || null);
    });
    // Nothing past the last row before the headline.
    expect(ws.getCell(STRESS_HEAD_ROW + 1 + rows.length, 1).value ?? null).toBeNull();
  });

  it("prints the headline as the panel does: the two cases, each part by its label, the gap a formula, the model beside them", async () => {
    const h = liveHeadline(sample)!;
    expect(h).not.toBeNull();
    expect(h.parts.length).toBeGreaterThan(1);
    const ws = (await load(await build(sample))).getWorksheet("Stress Test")!;
    const shown = shownHeadline(h);
    // Find the block by its labels in column A.
    // The headline's rows follow the stress rows (a part wears its row's own
    // title, as the panel prints it), so the search starts past them.
    const from = STRESS_HEAD_ROW + 1 + sample.rows.length;
    const rowOf = (text: string) => {
      for (let r = from; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === text) return r;
      throw new Error(`no row ${text}`);
    };
    expect(valueOf(ws.getCell(rowOf("On the OM's figures"), 2))).toBeCloseTo(shown.om! / 100, 10);
    expect(valueOf(ws.getCell(rowOf("With the evidence"), 2))).toBeCloseTo(shown.evidence! / 100, 10);
    for (const p of shown.parts) {
      const note = partNote(p);
      expect(valueOf(ws.getCell(rowOf(`${p.label}${note ? ` (${note})` : ""}`), 2))).toBeCloseTo(p.shown, 10);
    }
    const gap = ws.getCell(rowOf("The gap, the evidence's case less the OM's"), 2);
    expect(isFormula(gap)).toBe(true);
    // The printed parts add up to the printed gap.
    const sum = shown.parts.reduce((s, p) => s + p.shown, 0);
    expect(valueOf(gap)).toBeCloseTo(sum, 6);
    expect(valueOf(ws.getCell(rowOf("The screening model as it runs"), 2))).toBeCloseTo(h.modelIrrPct! / 100, 10);
    for (const o of h.omitted) expect(ws.getCell(rowOf(`Left out: ${o.label}`), 3).value).toBe(o.why);
    // The headline's whole sentences, the report's own.
    let said = false;
    ws.eachRow((r) => {
      if (r.getCell(1).value === headlineSentence(sample)) said = true;
    });
    expect(said).toBe(true);
  });

  it("draws Excel's own data bars on the move and on the headline's parts", async () => {
    const ws = (await load(await build(sample))).getWorksheet("Stress Test")!;
    const bars = (ws as unknown as { conditionalFormattings: { ref: string; rules: { type: string }[] }[] }).conditionalFormattings.filter((cf) =>
      cf.rules.some((r) => r.type === "dataBar"),
    );
    const moveLetter = ws.getColumn(col("Move (pts)")).letter;
    expect(bars.some((b) => b.ref.startsWith(`${moveLetter}${STRESS_HEAD_ROW + 1}:`))).toBe(true);
    expect(bars.some((b) => b.ref.startsWith("B"))).toBe(true);
  });

  it("computes its formulas in a spreadsheet engine to the values it caches", async () => {
    const ws = (await load(await build(sample))).getWorksheet("Stress Test")!;
    const grid: (number | string | null)[][] = [];
    const cached: { r: number; c: number; v: number }[] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row: (number | string | null)[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = ws.getCell(r, c);
        const v = cell.value;
        if (isFormula(cell)) {
          row.push(`=${(v as ExcelJS.CellFormulaValue).formula}`);
          cached.push({ r: r - 1, c: c - 1, v: Number((v as ExcelJS.CellFormulaValue).result) });
        } else row.push(typeof v === "number" || typeof v === "string" ? v : null);
      }
      grid.push(row);
    }
    const hf = HyperFormula.buildFromSheets({ s: grid }, { licenseKey: "gpl-v3" });
    expect(cached.length).toBeGreaterThan(0);
    for (const x of cached) expect(hf.getCellValue({ sheet: 0, row: x.r, col: x.c }) as number).toBeCloseTo(x.v, 9);
  });

  it("says a withheld re-run's reason on every row, and the headline goes with it", async () => {
    const withheld = buildStressTest({
      extraction: SAMPLE_DEAL.extraction as ExtractionResult,
      firstSignal: null,
      challenger: SAMPLE_DEAL.challenges,
      market: SAMPLE_DEAL.market,
      modelVsMarket: null,
      actuals: null,
      derived: null,
      storedAssetClass: SAMPLE_DEAL.asset_class,
      brokerComps: SAMPLE_DEAL.comps,
      readOn: TODAY,
    });
    expect(withheld.impactsWithheld).toBeTruthy();
    expect(withheld.rows.length).toBeGreaterThan(0);
    const ws = (await load(await build(withheld))).getWorksheet("Stress Test")!;
    // not the sample: no plan note
    expect(ws.getCell(4, 1).value ?? null).toBeNull();
    stressTabRows(withheld).forEach((row, i) => {
      const r = STRESS_HEAD_ROW + 1 + i;
      expect(ws.getCell(r, col("At the OM's figure")).value ?? null).toBeNull();
      if (row.verdict !== "holds" && row.verdict !== "unchecked" && !row.noRerun) {
        expect(ws.getCell(r, col("The re-run, or why none")).value).toBe(withheld.impactsWithheld);
      }
    });
    let said = false;
    ws.eachRow((r) => {
      if (r.getCell(1).value === headlineSentence(withheld)) said = true;
    });
    expect(said).toBe(true);
  });

  it("prints a plan deal's re-runs and headline as yield on cost, at two places", async () => {
    const base = sampleStressTest({ today: TODAY });
    const row = base.rows.find((r) => r.key === "vacancy")!;
    const plan: StressTest = {
      ...base,
      measure: "yield_on_cost",
      rows: [
        {
          ...row,
          impact: { ...row.impact!, measure: "yield_on_cost", input: "stabilizedNoi", baseIrrPct: null, altIrrPct: null, baseYocPct: 6.85, altYocPct: 6.4 },
        },
      ],
      headline: {
        measure: "yield_on_cost",
        omYocPct: 6.85,
        evidenceYocPct: 6.4,
        statedYoc: null,
        planCost: null,
        omIrrPct: null,
        evidenceIrrPct: null,
        omMultiple: null,
        evidenceMultiple: null,
        omKeys: ["vacancy"],
        parts: [{ key: "vacancy", label: row.title, pts: -0.45, multiple: null }],
        omitted: [],
        unsolved: 0,
      },
    };
    const ws = (await load(await build(plan))).getWorksheet("Stress Test")!;
    const r = STRESS_HEAD_ROW + 1;
    expect(ws.getCell(r, col("Re-run of")).value).toBe("Yield on cost");
    expect(ws.getCell(r, col("At the OM's figure")).value).toBeCloseTo(0.0685, 10);
    expect(ws.getCell(r, col("At the OM's figure")).numFmt).toBe("0.00%");
    expect(valueOf(ws.getCell(r, col("Move (pts)")))).toBeCloseTo(-0.45, 10);
    let headRow = 0;
    ws.eachRow((x, n) => {
      if (x.getCell(1).value === "YIELD ON COST") headRow = n;
    });
    expect(headRow).toBeGreaterThan(r);
    expect(ws.getCell(headRow + 1, 2).value).toBeCloseTo(0.0685, 10);
    expect(ws.getCell(headRow + 1, 2).numFmt).toBe("0.00%");
  });

  it("is absent with no stress test, or one with no rows — never an empty tab", async () => {
    expect((await load(await build(null))).getWorksheet("Stress Test")).toBeUndefined();
    expect((await load(await build(undefined))).getWorksheet("Stress Test")).toBeUndefined();
    expect((await load(await build({ ...sample, rows: [] }))).getWorksheet("Stress Test")).toBeUndefined();
  });

  it("leaves the model's own tabs exactly as they were, and no formula on them reads it", async () => {
    const without = await load(await build(null));
    const withTab = await load(await build(sample));
    const dump = (wb: ExcelJS.Workbook, name: string) => {
      const ws = wb.getWorksheet(name)!;
      const out: unknown[] = [];
      ws.eachRow({ includeEmpty: true }, (r, n) => r.eachCell({ includeEmpty: true }, (c, k) => out.push([n, k, JSON.stringify(c.value), c.numFmt])));
      return out;
    };
    for (const ws of without.worksheets) {
      // The Cover's Contents gains the tab's line; every other tab is the same.
      if (ws.name === "Cover") continue;
      expect(dump(withTab, ws.name), ws.name).toEqual(dump(without, ws.name));
    }
    for (const ws of withTab.worksheets) {
      if (ws.name === "Stress Test") continue;
      ws.eachRow((r) =>
        r.eachCell((c) => {
          if (isFormula(c)) expect((c.value as ExcelJS.CellFormulaValue).formula ?? "").not.toMatch(/Stress Test/);
        }),
      );
    }
    // The defined names the model reads are unchanged.
    const names = (wb: ExcelJS.Workbook) => JSON.stringify((wb.definedNames as unknown as { model: unknown }).model);
    expect(names(withTab)).toBe(names(without));
  });
});
