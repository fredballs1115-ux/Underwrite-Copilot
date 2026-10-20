// The screening model runs its growth and its exit at the figure the stress
// test decides each row by, else the memorandum's stated figure, else the
// default (the owner's rule of 2026-10-20) — on a real deal; the sample is
// never seeded. Held here on the sample's own memorandum read as a real
// deal's (it states a 4.0% rent growth, a 5.45% going-in cap and a 5.25%
// exit, and no expense growth), on Philadelphia's figures as a page reads
// them.
import { describe, expect, it } from "vitest";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { SAMPLE_DEAL } from "./sample-deal";
import { SAMPLE_ACTUALS, sampleDerivedInputs } from "./sample-derive";
import { NO_DEBT_SEEDS } from "./debt-index";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import { computeUnderwrite } from "./underwrite/engine";
import { modelMarketFor } from "./model-market";
import { modelEvidenceFor, type ModelEvidence } from "./model-evidence";
import { modelVsMarketFor, type MarketReads } from "./model-vs-market";
import { buildStressTest } from "./stress-test";
import { decidingFigureOf } from "./stress-deciders";
import { countyOf, placeDeal } from "./market-county";
import type { ExtractionResult } from "./anthropic/types";
import type { ZoriRead } from "./zori";
import ExcelJS from "exceljs";
import { buildUnderwriteWorkbook } from "./underwrite/workbook";
import { refCapNote } from "./plan-sensitivity";

const ROWS: RateRow[] = [
  { series_id: "PHIL942URN", obs_date: "2026-07-01", value: 4.1 },
  { series_id: "RRVRNEQ156N", obs_date: "2026-04-01", value: 4.6 },
  { series_id: "HVS_RVR_37980", obs_date: "2026-04-01", value: 5.8 },
  { series_id: "HVS_RVR_37980_MOE", obs_date: "2026-04-01", value: 1.9 },
];
for (let i = 0; i < 14; i++) {
  const d = new Date(Date.UTC(2026, 7 - i, 1)).toISOString().slice(0, 10);
  ROWS.push({ series_id: "CUURA102SEHA", obs_date: d, value: i === 0 ? 420 : i === 12 ? 400 : 410 });
}
const ZORI: ZoriRead = {
  rent: 1820,
  yoyPct: 2.9,
  asOf: "2026-08-31",
  note: "Zillow Observed Rent Index (ZORI), all homes, smoothed, Philadelphia, PA metro area, month ending 2026-08-31. Data: Zillow Research.",
  shared: false,
  mfrRent: 1690,
  mfrYoyPct: 2.4,
  homeValue: null,
  homeValueYoyPct: null,
  priceToRentYears: null,
};
const READS: MarketReads = {
  rates: readMetroRates("philadelphia", ROWS, FIXTURE_NOW),
  zori: ZORI,
  national: readRates(REAL_ROWS, FIXTURE_NOW),
  now: FIXTURE_NOW,
};
const CPI = READS.national.find((r) => r.meta.id === "CPIAUCSL_YOY")!;

const ex = SAMPLE_DEAL.extraction;
const metro = placeDeal(SAMPLE_DEAL.address, countyOf(SAMPLE_DEAL.address, null)).live;
const evidenceOf = (extraction: ExtractionResult, reads: MarketReads | null, storedAssetClass: string | null = SAMPLE_DEAL.asset_class): ModelEvidence =>
  modelEvidenceFor({ extraction, firstSignal: null, storedAssetClass, metro, reads });
const derive = (extraction: ExtractionResult, evidence: ModelEvidence | null, isSample = false) =>
  deriveUnderwriteInputs(extraction, SAMPLE_DEAL.name, SAMPLE_ACTUALS, modelMarketFor(isSample, NO_DEBT_SEEDS, evidence));

describe("the screening model's growth and exit, published evidence first", () => {
  it("a real deal runs the stress test's deciding figures, each named in its note", () => {
    const evidence = evidenceOf(ex, READS);
    const d = derive(ex, evidence);
    // Rent growth: Zillow's apartment asking rents, the first in an
    // apartment building's order — not the OM's 4.0%, not the flat 3.0%.
    expect(d.inputs.rentGrowthPct).toBeCloseTo(0.024, 10);
    expect(d.sources.rentGrowthPct).toMatchObject({
      provenance: "derived",
      note: `2.4%/yr — Zillow's apartment asking rents: +2.4% over the year to Aug 2026 (Zillow Research; ${metro!.name}); the stress test's deciding figure — enter your own`,
      published: { label: "Asking rent, apartments", publisher: "Zillow Research", asOf: "2026-08-31" },
    });
    // Expense growth: consumer prices, all items.
    expect(d.inputs.expenseGrowthPct).toBeCloseTo(CPI.value / 100, 10);
    expect(d.sources.expenseGrowthPct?.note).toMatch(/^\d+\.\d%\/yr — consumer prices, all items \(the CPI\): [+−-]?\d+\.\d% over the year to [A-Z][a-z]{2} \d{4} \(BLS via FRED; national\); the stress test's deciding figure — enter your own$/);
    // The exit: the going-in cap decides, so the model stays at it, never
    // the OM's stated 5.25%.
    expect(d.inputs.exitCapPct).toBeCloseTo(0.0545, 10);
    expect(d.sources.exitCapPct?.note).toMatch(/^Defaulted to the OM's stated going-in cap.*; the stress test's deciding figure for the exit — set your exit view$/);
  });

  it("runs the very figure each stress-test row is decided by", () => {
    // An OM that states its expense growth too, so all three rows decide.
    const stated: ExtractionResult = { ...ex, metrics: [...ex.metrics, { label: "Expense growth", value: "2.5%/yr", flagged: false, page: "p. 40" }] };
    const evidence = evidenceOf(stated, READS);
    const derived = derive(stated, evidence);
    const mvm = modelVsMarketFor({ derived, extraction: stated, firstSignal: null, storedAssetClass: SAMPLE_DEAL.asset_class, metro, reads: READS });
    const test = buildStressTest({
      extraction: stated,
      firstSignal: null,
      challenger: null,
      market: null,
      modelVsMarket: mvm,
      actuals: null,
      derived,
      storedAssetClass: SAMPLE_DEAL.asset_class,
      readOn: "2026-09-21",
    });
    const row = (k: string) => test.rows.find((r) => r.key === k)!;
    for (const [key, input] of [
      ["rent_growth", "rentGrowthPct"],
      ["expense_growth", "expenseGrowthPct"],
      ["exit_cap", "exitCapPct"],
    ] as const) {
      const decided = decidingFigureOf(row(key));
      expect(decided, key).not.toBeNull();
      if (!decided) continue;
      expect(derived.inputs[input] * 100, key).toBeCloseTo(decided.figure, 9);
    }
    // The rent row's two runs are ONE input apart, the model as it runs
    // already at the evidence's figure.
    const rent = row("rent_growth");
    expect(rent.impact).not.toBeNull();
    expect(rent.impact!.omValue).toBeCloseTo(0.04, 10);
    expect(rent.impact!.altValue).toBeCloseTo(derived.inputs.rentGrowthPct, 12);
    expect(rent.impact!.note).toContain("The model itself already runs at it.");
    const base = computeUnderwrite({ ...derived.inputs, rentGrowthPct: 0.04 }).returns.leveredIrrPct! * 100;
    expect(rent.impact!.baseIrrPct).toBeCloseTo(base, 9);
    expect(rent.impact!.altIrrPct).toBeCloseTo(computeUnderwrite(derived.inputs).returns.leveredIrrPct! * 100, 9);
    // The exit row: the model already runs the going-in cap that decides it.
    expect(row("exit_cap").impact!.note).toContain("The model itself already runs at it.");
  });

  it("with no reads, falls through to the memorandum's stated figures, then the default", () => {
    const evidence = evidenceOf(ex, null);
    expect(evidence.rentGrowth.decided).toBeNull();
    const d = derive(ex, evidence);
    expect(d.inputs.rentGrowthPct).toBeCloseTo(0.04, 10);
    expect(d.sources.rentGrowthPct).toMatchObject({
      provenance: "extracted",
      page: "p. 40",
      note: "4.0%/yr — the OM's Rent growth, 4.0%/yr, as stated: no fresh published figure decides the rent growth — enter your own",
    });
    expect(d.inputs.expenseGrowthPct).toBe(0.03);
    expect(d.sources.expenseGrowthPct).toMatchObject({
      provenance: "assumption",
      note: "Default 3.0%/yr — no fresh published figure decides the expense growth and the OM states none — set your view",
    });
    // The going-in cap decides the exit with no read at all.
    expect(d.inputs.exitCapPct).toBeCloseTo(0.0545, 10);
  });

  it("a stale or absent figure falls through, never to zero", () => {
    // No Zillow read and no national table: the CPI rent decides the rent;
    // nothing decides the expenses, and the memorandum states none.
    const evidence = evidenceOf(ex, { ...READS, zori: null, national: [] });
    const d = derive(ex, evidence);
    expect(evidence.rentGrowth.decided?.label).toBe("Rent paid by sitting tenants (CPI rent)");
    expect(d.inputs.rentGrowthPct).toBeCloseTo(evidence.rentGrowth.decided!.pct / 100, 10);
    expect(d.inputs.expenseGrowthPct).toBe(0.03);
    // A national table read long after: every figure stale, none decides.
    const late = new Date("2027-12-01T12:00:00Z");
    const stale = evidenceOf(ex, { rates: readMetroRates("philadelphia", ROWS, late), zori: null, national: readRates(REAL_ROWS, late), now: late });
    expect(stale.rentGrowth.decided).toBeNull();
    expect(stale.expenseGrowth.decided).toBeNull();
    expect(derive(ex, stale).inputs.rentGrowthPct).toBeCloseTo(0.04, 10);
  });

  it("with no going-in cap, the exit runs the research tracker's cap range at its low end, the row's deciding figure", () => {
    const noGoingIn: ExtractionResult = { ...ex, metrics: ex.metrics.filter((m) => !/going-in|pro forma cap/i.test(m.label)) };
    const evidence = evidenceOf(noGoingIn, READS);
    expect(evidence.exitCap.decided).toMatchObject({ kind: "published", pct: 5 });
    const d = derive(noGoingIn, evidence);
    expect(d.inputs.exitCapPct).toBeCloseTo(0.05, 10);
    expect(d.sources.exitCapPct).toMatchObject({
      provenance: "derived",
      note: `5.00% — the research tracker's cap range, at its low end: ${evidence.exitCap.decided!.label}, late 2025 / early 2026 (research tracker: Northmarq; ${metro!.name}); the stress test's deciding figure for the exit, where the OM states no going-in cap it is held to — set your exit view`,
      published: { publisher: "research tracker: Northmarq" },
    });
    const mvm = modelVsMarketFor({ derived: d, extraction: noGoingIn, firstSignal: null, storedAssetClass: SAMPLE_DEAL.asset_class, metro, reads: READS });
    const row = buildStressTest({ extraction: noGoingIn, firstSignal: null, challenger: null, market: null, modelVsMarket: mvm, actuals: null, derived: d, storedAssetClass: SAMPLE_DEAL.asset_class, readOn: "2026-09-21" }).rows.find((r) => r.key === "exit_cap")!;
    expect(decidingFigureOf(row)?.figure).toBe(5);
    expect(row.impact!.note).toContain("The model itself already runs at it.");
    // The plan page's reference cap says whose it is, never the OM's.
    expect(refCapNote(d.sources.exitCapPct!.provenance, d.sources.exitCapPct!.published != null)).toBe(
      "the research tracker's cap range at its low end, the stress test's deciding figure, which the model also exits at",
    );
  });

  it("the exit runs the memorandum's stated exit only where no going-in cap or cap range decides", () => {
    const noGoingIn: ExtractionResult = { ...ex, metrics: ex.metrics.filter((m) => !/going-in|pro forma cap/i.test(m.label)) };
    const evidence = evidenceOf(noGoingIn, null);
    expect(evidence.exitCap.decided).toBeNull();
    const d = derive(noGoingIn, evidence);
    expect(d.inputs.exitCapPct).toBeCloseTo(0.0525, 10);
    expect(d.sources.exitCapPct).toMatchObject({
      provenance: "extracted",
      page: "p. 41",
      note: "The OM's Exit cap, 5.25%, as stated: no going-in cap or published cap range decides the exit — set your exit view",
    });
    // And with neither stated, the default.
    const bare: ExtractionResult = { ...ex, metrics: ex.metrics.filter((m) => !/cap/i.test(m.label)) };
    expect(derive(bare, evidenceOf(bare, null)).inputs.exitCapPct).toBe(0.06);
  });

  it("land reads no figure of the wrong kind", () => {
    const land: ExtractionResult = { ...ex, assetClass: "land" };
    const evidence = evidenceOf(land, READS, "land");
    expect(evidence.rentGrowth.decided).toBeNull();
    expect(evidence.expenseGrowth.decided).toBeNull();
    expect(evidence.exitCap.decided).toBeNull();
  });

  it("the workbook's Sources column says whose figure each input is", async () => {
    const d = derive(ex, evidenceOf(ex, READS));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(d, null)) as unknown as ArrayBuffer);
    const assum = wb.getWorksheet("Assumptions")!;
    const rowOf = (label: string): number => {
      for (let r = 1; r <= assum.rowCount; r++) if (assum.getCell(r, 1).value === label) return r;
      throw new Error(label);
    };
    const rent = rowOf("Rent Growth %");
    // The input stays a typed value the model's formulas read.
    expect(assum.getCell(rent, 2).value).toBeCloseTo(0.024, 10);
    expect(assum.getCell(rent, 2).name).toBe("RentGrowth");
    expect(String(assum.getCell(rent, 3).value)).toBe(`Published — ${d.sources.rentGrowthPct!.note}`);
    expect(String(assum.getCell(rowOf("Expense Growth %"), 3).value)).toBe(`Published — ${d.sources.expenseGrowthPct!.note}`);
    expect(String(assum.getCell(rowOf("Exit Cap"), 3).value)).toMatch(/^Derived — Defaulted to the OM's stated going-in cap.*the stress test's deciding figure for the exit — set your exit view$/);
    // With no reads the memorandum's own figure, credited to it with its page.
    const om = derive(ex, evidenceOf(ex, null));
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load((await buildUnderwriteWorkbook(om, null)) as unknown as ArrayBuffer);
    const a2 = wb2.getWorksheet("Assumptions")!;
    let r2 = 1;
    while (a2.getCell(r2, 1).value !== "Rent Growth %") r2++;
    expect(String(a2.getCell(r2, 3).value)).toBe("OM p. 40 — 4.0%/yr — the OM's Rent growth, 4.0%/yr, as stated: no fresh published figure decides the rent growth — enter your own");
  });

  it("the sample is never seeded: handed the evidence, its model is the demo's", () => {
    const evidence = evidenceOf(ex, READS);
    const signedIn = derive(ex, evidence, true);
    expect(signedIn.inputs).toEqual(sampleDerivedInputs().inputs);
    expect(signedIn.inputs.rentGrowthPct).toBe(0.03);
    expect(signedIn.inputs.expenseGrowthPct).toBe(0.03);
    expect(signedIn.sources.rentGrowthPct?.note).toBe("Default 3.0%/yr — set your view");
    expect(modelMarketFor(true, NO_DEBT_SEEDS, evidence)).toEqual({ debtIndex: null });
  });
});
