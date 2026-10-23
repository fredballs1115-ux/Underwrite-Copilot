// The screening model runs its growth and its exit never more optimistic
// than the OM (the owner's rule of 2026-10-20): the more cautious of the
// figure the stress test decides each row by and the memorandum's stated
// figure where both stand — the lower rent growth, the higher expense
// growth, the higher exit cap — else the one that stands, else the default;
// on a real deal; the sample is never seeded. Held here on the sample's own memorandum read as a real
// deal's (it states a 4.0% rent growth, a 5.45% going-in cap and a 5.25%
// exit, and no expense growth), on Philadelphia's figures as a page reads
// them.
import { describe, expect, it } from "vitest";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { SAMPLE_DEAL } from "./sample-deal";
import { SAMPLE_ACTUALS, sampleDerivedInputs } from "./sample-derive";
import { NO_DEBT_SEEDS } from "./debt-index";
import { cellPct, deriveUnderwriteInputs } from "./underwrite/inputs";
import { computeUnderwrite } from "./underwrite/engine";
import { modelMarketFor } from "./model-market";
import { modelEvidenceFor, type ModelEvidence } from "./model-evidence";
import { SET_FROM_TRAILING_CAUTIOUS, SET_FROM_TRAILING_STANCE, SET_FROM_WORDS, modelVsMarketFor, type MarketReads } from "./model-vs-market";
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

const without = (re: RegExp, e: ExtractionResult = ex): ExtractionResult => ({ ...e, metrics: e.metrics.filter((m) => !re.test(m.label)) });
const withRow = (label: string, value: string, e: ExtractionResult = ex, page = "p. 41"): ExtractionResult => ({
  ...e,
  metrics: [...e.metrics.filter((m) => m.label !== label), { label, value, flagged: false, page }],
});
const NO_GOING_IN = /going-in|pro forma cap/i;
const ZILLOW_NOTE = `Zillow's apartment asking rents, the figure for this kind of rent: +2.4% over the year to Aug 2026 (Zillow Research; ${metro!.name})`;
const CPI_NOTE = (n: string) =>
  `consumer prices, all items (the CPI), the broad price level the expense base moves with: ${n} over the year to Aug 2026 (BLS via FRED; national)`;
const TRACKER = "the low end of the research tracker's 5.00–5.70% apartment cap range (Northmarq, late 2025 / early 2026, read Aug 25, 2026; a research print, not a feed)";

describe("the screening model's growth and exit, never more optimistic than the OM", () => {
  it("a real deal runs the more cautious of the deciding figure and the OM's own, each named in its note", () => {
    const evidence = evidenceOf(ex, READS);
    const d = derive(ex, evidence);
    // Rent growth: Zillow's +2.4% is under the OM's 4.0%, so it runs.
    expect(d.inputs.rentGrowthPct).toBeCloseTo(0.024, 10);
    expect(d.sources.rentGrowthPct).toMatchObject({
      provenance: "derived",
      note: `2.4%/yr — ${ZILLOW_NOTE}, more cautious than the OM's rent growth of 4.0%/yr (p. 40); the stress test's deciding figure — enter your own`,
      published: { label: "Asking rent, apartments", publisher: "Zillow Research", asOf: "2026-08-31" },
    });
    // Expense growth: the CPI, the OM stating none — the note at the
    // cell's own two places, never 3.4% beside a 3.35% cell.
    expect(d.inputs.expenseGrowthPct).toBeCloseTo(CPI.value / 100, 10);
    expect(d.sources.expenseGrowthPct?.note).toBe(
      `${(Math.round(CPI.value * 100) / 100).toFixed(2)}%/yr — ${CPI_NOTE(`+${CPI.value.toFixed(1)}%`)}; the stress test's deciding figure, the OM stating no expense growth — enter your own`,
    );
    // The exit: the OM's own 5.70% pro forma cap, the higher of it and the
    // 5.45% going-in cap that decides the stress test's exit row (the review
    // of 2026-10-23), over the OM's own 5.25% exit — named as the OM's own
    // figure, never as more.
    expect(d.inputs.exitCapPct).toBeCloseTo(0.057, 10);
    expect(d.sources.exitCapPct).toMatchObject({
      provenance: "extracted",
      page: "p. 8",
      note: "5.70% — the OM's pro forma cap as stated, the more cautious of it and the OM's 5.45% going-in cap; the model runs no exit tighter than the OM's; the model's own year-1 NOI over its price is 5.45%: 25 bps of expansion ride in these returns — set your exit view",
    });
    // Off the going-in cap, so the playground says the gap to the model's
    // own entry, as the note does.
    expect(d.sources.exitCapPct?.offGoingIn).toBe(true);
  });

  it("rent growth: the OM's lower figure runs where the published one is higher (the audit's office at 7.2% against 4.0%)", () => {
    const hot = { ...READS, zori: { ...ZORI, mfrYoyPct: 7.2 } };
    const d = derive(ex, evidenceOf(ex, hot));
    expect(d.inputs.rentGrowthPct).toBeCloseTo(0.04, 10);
    expect(d.sources.rentGrowthPct).toMatchObject({
      provenance: "extracted",
      page: "p. 40",
      note: `4.0%/yr — the OM's rent growth as stated, the more cautious of it and Zillow's apartment asking rents, the figure for this kind of rent: +7.2% over the year to Aug 2026 (Zillow Research; ${metro!.name}); the model runs no figure more optimistic than the OM's — enter your own`,
    });
    // No more optimistic than the OM's own: the levered IRR at the OM's
    // figure, never at the hotter index.
    const atIndex = computeUnderwrite({ ...d.inputs, rentGrowthPct: 0.072 }).returns.leveredIrrPct!;
    expect(computeUnderwrite(d.inputs).returns.leveredIrrPct!).toBeLessThan(atIndex);
    // A tie runs the published figure, which is the OM's too.
    const tie = derive(ex, evidenceOf(ex, { ...READS, zori: { ...ZORI, mfrYoyPct: 4 } }));
    expect(tie.inputs.rentGrowthPct).toBeCloseTo(0.04, 10);
    expect(tie.sources.rentGrowthPct?.note).toContain(", the same as the OM's rent growth (p. 40); the stress test's deciding figure");
  });

  it("expense growth: the higher of the two runs, either way", () => {
    // The OM's 2.5% is under the CPI: the CPI runs.
    const low = withRow("Expense growth", "2.5%/yr");
    const dLow = derive(low, evidenceOf(low, READS));
    expect(dLow.inputs.expenseGrowthPct).toBeCloseTo(CPI.value / 100, 10);
    expect(dLow.sources.expenseGrowthPct?.note).toContain(", more cautious than the OM's expense growth of 2.5%/yr (p. 41); the stress test's deciding figure — enter your own");
    // The OM's 4.0% is over it: the OM's runs.
    const high = withRow("Expense growth", "4.0%/yr");
    const dHigh = derive(high, evidenceOf(high, READS));
    expect(dHigh.inputs.expenseGrowthPct).toBeCloseTo(0.04, 10);
    expect(dHigh.sources.expenseGrowthPct).toMatchObject({
      provenance: "extracted",
      page: "p. 41",
      note: `4.0%/yr — the OM's expense growth as stated, the more cautious of it and ${CPI_NOTE(`+${CPI.value.toFixed(1)}%`)}; the model runs no figure more optimistic than the OM's — enter your own`,
    });
    // A value with words past its figure keeps them, once.
    const worded = withRow("Expense growth", "3.5% years 1–2, then 3.0%");
    expect(derive(worded, evidenceOf(worded, READS)).sources.expenseGrowthPct?.note).toMatch(/^3\.5%\/yr — the OM's expense growth \("3\.5% years 1–2, then 3\.0%"\) as stated, the more cautious of it and /);
  });

  it("the exit: the higher of the deciding cap and the OM's own stated exit, either way", () => {
    // The OM's 5.75% exit over its 5.45% going-in cap: the OM's runs, and
    // the expansion against the model's own entry is said.
    const wide = withRow("Exit cap", "5.75%");
    const d = derive(wide, evidenceOf(wide, READS));
    expect(d.inputs.exitCapPct).toBeCloseTo(0.0575, 10);
    expect(d.sources.exitCapPct).toMatchObject({
      provenance: "extracted",
      page: "p. 41",
      offGoingIn: true,
      note: "5.75% — the OM's exit cap as stated, the more cautious of it and the OM's 5.45% going-in cap; the model runs no exit tighter than the OM's; the model's own year-1 NOI over its price is 5.45%: 30 bps of expansion ride in these returns — set your exit view",
    });
    // With no going-in cap, the tracker's 5.00% low end against the OM's
    // 5.25%: the OM's runs (the audit's 5.00% against 5.25%), the
    // compression against the model's own entry said.
    const noGoingIn = without(NO_GOING_IN);
    const evidence = evidenceOf(noGoingIn, READS);
    expect(evidence.exitCap.decided).toMatchObject({ kind: "published", pct: 5 });
    const d2 = derive(noGoingIn, evidence);
    expect(d2.inputs.exitCapPct).toBeCloseTo(0.0525, 10);
    expect(d2.sources.exitCapPct).toMatchObject({
      provenance: "extracted",
      page: "p. 41",
      note: `5.25% — the OM's exit cap as stated, the more cautious of it and ${TRACKER}; the model runs no exit tighter than the OM's; the model's own year-1 NOI over its price is 5.45%: 20 bps of compression ride in these returns — set your exit view`,
    });
    expect(d2.sources.exitCapPct?.published).toBeUndefined();
    // And an OM exit under the tracker's low end: the tracker's runs, said as
    // research, with the true reason the going-in cap does not decide.
    const tight = withRow("Exit cap", "4.75%", noGoingIn);
    const d3 = derive(tight, evidenceOf(tight, READS));
    expect(d3.inputs.exitCapPct).toBeCloseTo(0.05, 10);
    expect(d3.sources.exitCapPct).toMatchObject({
      provenance: "derived",
      offGoingIn: true,
      note: `5.00% — ${TRACKER}, more cautious than the OM's exit cap of 4.75% (p. 41); the stress test's deciding figure for the exit, since the OM states no going-in cap; the model's own year-1 NOI over its price is 5.45%: 45 bps of compression ride in these returns — set your exit view`,
      published: { publisher: "research tracker: Northmarq", research: true },
    });
    expect(d3.sources.exitCapPct!.note).not.toContain("where the OM states no going-in cap it is held to");
    // The plan page's reference cap says whose it is.
    expect(refCapNote(d3.sources.exitCapPct!.provenance, d3.sources.exitCapPct!.published != null)).toBe(
      "the research tracker's cap range at its low end, the stress test's deciding figure, which the model also exits at",
    );
    // The stress row, decided by the tracker, re-runs one input apart.
    const mvm = modelVsMarketFor({ derived: d3, extraction: tight, firstSignal: null, storedAssetClass: SAMPLE_DEAL.asset_class, metro, reads: READS });
    const row = buildStressTest({ extraction: tight, firstSignal: null, challenger: null, market: null, modelVsMarket: mvm, actuals: null, derived: d3, storedAssetClass: SAMPLE_DEAL.asset_class, readOn: "2026-09-21" }).rows.find((r) => r.key === "exit_cap")!;
    expect(decidingFigureOf(row)?.figure).toBe(5);
    expect(row.impact!.note).toContain("The model itself already runs at it.");
  });

  it("with no reads, the memorandum's own figures, with the true reason no published figure stands", () => {
    const evidence = evidenceOf(ex, null);
    expect(evidence.rentGrowth.decided).toBeNull();
    const d = derive(ex, evidence);
    expect(d.inputs.rentGrowthPct).toBeCloseTo(0.04, 10);
    // One figure, never "4.0%/yr — the OM's Rent growth, 4.0%/yr".
    expect(d.sources.rentGrowthPct).toMatchObject({
      provenance: "extracted",
      page: "p. 40",
      note: "4.0%/yr — the OM's rent growth as stated: today's published figures were not read — enter your own",
    });
    expect(d.inputs.expenseGrowthPct).toBe(0.03);
    expect(d.sources.expenseGrowthPct).toMatchObject({
      provenance: "assumption",
      note: "Default 3.0%/yr — today's published figures were not read and the OM states none — set your view",
    });
    // The OM's own caps decide the exit with no read at all: the higher of
    // its going-in and pro forma caps.
    expect(d.inputs.exitCapPct).toBeCloseTo(0.057, 10);
    // With no going-in cap, the OM's stated exit, said why.
    const noGoingIn = without(NO_GOING_IN);
    const d2 = derive(noGoingIn, evidenceOf(noGoingIn, null));
    expect(d2.inputs.exitCapPct).toBeCloseTo(0.0525, 10);
    expect(d2.sources.exitCapPct).toMatchObject({
      provenance: "extracted",
      page: "p. 41",
      note: "5.25% — the OM's exit cap as stated: the OM states no going-in cap, and today's published figures were not read; the model's own year-1 NOI over its price is 5.45%: 20 bps of compression ride in these returns — set your exit view",
    });
    // And with neither stated, the default.
    const bare = without(/cap/i);
    expect(derive(bare, evidenceOf(bare, null)).inputs.exitCapPct).toBe(0.06);
  });

  it("a stale or absent figure falls through, never to zero", () => {
    // No Zillow read and no national table: the CPI rent decides the rent
    // row at +5.0%, over the OM's 4.0% — so the OM's runs; nothing decides
    // the expenses, and the memorandum states none.
    const evidence = evidenceOf(ex, { ...READS, zori: null, national: [] });
    const d = derive(ex, evidence);
    expect(evidence.rentGrowth.decided?.label).toBe("Rent paid by sitting tenants (CPI rent)");
    expect(evidence.rentGrowth.decided!.pct).toBeGreaterThan(4);
    expect(d.inputs.rentGrowthPct).toBeCloseTo(0.04, 10);
    expect(d.sources.rentGrowthPct?.note).toContain("the more cautious of it and the rent sitting tenants pay (CPI rent)");
    expect(d.inputs.expenseGrowthPct).toBe(0.03);
    expect(d.sources.expenseGrowthPct?.note).toBe("Default 3.0%/yr — no fresh published figure decides the expense growth and the OM states none — set your view");
    // A national table read long after: every figure stale, none decides.
    const late = new Date("2027-12-01T12:00:00Z");
    const stale = evidenceOf(ex, { rates: readMetroRates("philadelphia", ROWS, late), zori: null, national: readRates(REAL_ROWS, late), now: late });
    expect(stale.rentGrowth.decided).toBeNull();
    expect(stale.expenseGrowth.decided).toBeNull();
    expect(derive(ex, stale).inputs.rentGrowthPct).toBeCloseTo(0.04, 10);
  });

  it("a fresh figure past the band says so, never that no fresh figure decides", () => {
    const d = derive(ex, evidenceOf(ex, { ...READS, zori: { ...ZORI, mfrYoyPct: 17 } }));
    expect(d.inputs.rentGrowthPct).toBeCloseTo(0.04, 10);
    expect(d.sources.rentGrowthPct?.note).toBe(
      "4.0%/yr — the OM's rent growth as stated: Zillow's apartment asking rents, 17.0% (Zillow Research), is past the −5% to +15% a year the model runs — enter your own",
    );
  });

  it("a hotel and land: the class has no published rent index", () => {
    const hotel: ExtractionResult = { ...ex, assetClass: "hotel" };
    const h = derive(hotel, evidenceOf(hotel, READS, "hospitality_str"));
    expect(h.sources.rentGrowthPct?.note).toBe("4.0%/yr — the OM's rent growth as stated: the class has no published rent index — enter your own");
    const land: ExtractionResult = { ...ex, assetClass: "land" };
    const evidence = evidenceOf(land, READS, "land");
    expect(evidence.rentGrowth.decided).toBeNull();
    expect(evidence.expenseGrowth.decided).toBeNull();
    expect(evidence.rentGrowth.absent).toBe("the class has no published rent index");
    expect(derive(land, evidence).sources.expenseGrowthPct?.note).toBe(
      "Default 3.0%/yr — land has no expense base a published figure speaks to and the OM states none — set your view",
    );
  });

  it("land's exit evidence is the stress row's own: the going-in cap it states, and no published range", () => {
    const land: ExtractionResult = { ...ex, assetClass: "land" };
    const evidence = evidenceOf(land, READS, "land");
    // The stress test's exit row reads its pieces with no class gate; the
    // model reads the same pieces, so the two agree.
    const mvm = modelVsMarketFor({ derived: null, extraction: land, firstSignal: null, storedAssetClass: "land", metro, reads: READS });
    const row = buildStressTest({ extraction: land, firstSignal: null, challenger: null, market: null, modelVsMarket: mvm, actuals: null, derived: null, storedAssetClass: "land", readOn: "2026-09-21" }).rows.find((r) => r.key === "exit_cap");
    const rowFigure = row ? decidingFigureOf(row)?.figure ?? null : null;
    // The model runs the higher of its deciding going-in cap and the OM's
    // own stated figure, here the pro forma cap that decides the row.
    expect(Math.max(evidence.exitCap.decided?.pct ?? 0, evidence.exitCap.stated?.pct ?? 0)).toBe(rowFigure);
    expect(evidence.exitCap.stated?.label).toBe("Pro forma cap");
    expect(evidence.exitCap.decided?.kind ?? "om_internal").toBe("om_internal");
  });

  it("a park's note carries why its figure decides: the closest published figure, not a park's own kind of rent", () => {
    const park: ExtractionResult = { ...ex, assetClass: "manufactured housing" };
    const evidence = evidenceOf(park, READS, "manufactured_housing");
    expect(evidence.rentGrowth.decided?.why).toMatch(/^the closest published figure, not a park's own kind of rent/);
    const d = derive(park, evidence);
    expect(d.sources.rentGrowthPct?.note).toContain("Zillow's asking rents across all home types, the closest published figure, not a park's own kind of rent");
  });

  it("the workbook's Sources column says whose figure each input is, and a research range as research", async () => {
    const sourcesOf = async (d: ReturnType<typeof derive>) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await buildUnderwriteWorkbook(d, null)) as unknown as ArrayBuffer);
      const assum = wb.getWorksheet("Assumptions")!;
      return (label: string): { value: unknown; note: string; name?: string } => {
        for (let r = 1; r <= assum.rowCount; r++) {
          if (assum.getCell(r, 1).value === label) return { value: assum.getCell(r, 2).value, note: String(assum.getCell(r, 3).value), name: assum.getCell(r, 2).name };
        }
        throw new Error(label);
      };
    };
    const d = derive(ex, evidenceOf(ex, READS));
    const at = await sourcesOf(d);
    // The input stays a typed value the model's formulas read.
    expect(at("Rent Growth %").value).toBeCloseTo(0.024, 10);
    expect(at("Rent Growth %").name).toBe("RentGrowth");
    expect(at("Rent Growth %").note).toBe(`Published — ${d.sources.rentGrowthPct!.note}`);
    expect(at("Expense Growth %").note).toBe(`Published — ${d.sources.expenseGrowthPct!.note}`);
    expect(at("Exit Cap").note).toBe(`OM p. 8 — ${d.sources.exitCapPct!.note}`);
    // The tracker's range: Research, never Published.
    const tight = withRow("Exit cap", "4.75%", without(NO_GOING_IN));
    const dt = derive(tight, evidenceOf(tight, READS));
    expect((await sourcesOf(dt))("Exit Cap").note).toBe(`Research — ${dt.sources.exitCapPct!.note}`);
    // With no reads the memorandum's own figure, credited to it with its page.
    const om = derive(ex, evidenceOf(ex, null));
    expect((await sourcesOf(om))("Rent Growth %").note).toBe("OM p. 40 — 4.0%/yr — the OM's rent growth as stated: today's published figures were not read — enter your own");
  });

  it("prints a growth note at the cell's own precision", () => {
    expect(cellPct(3.35302)).toBe("3.35%");
    expect(cellPct(4)).toBe("4.0%");
    expect(cellPct(2.4)).toBe("2.4%");
    expect(cellPct(-1.25)).toBe("-1.25%");
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

  it("the model read never grades the model against the figure it was set from (an investor's walkthrough)", () => {
    const evidence = evidenceOf(ex, READS);
    const derived = derive(ex, evidence);
    const mvm = modelVsMarketFor({ derived, extraction: ex, firstSignal: null, storedAssetClass: SAMPLE_DEAL.asset_class, metro, reads: READS })!;
    const check = (k: string) => mvm.checks.find((c) => c.key === k)!;
    // Rent growth runs Zillow's apartment asking rents: said as the figure
    // the model runs, no tone, never "sits at it".
    const rent = check("rent_growth");
    expect(rent.setFrom).toBe(true);
    expect(rent.tone).toBe("set_from");
    expect(rent.toneLabel).toBe("the figure the model runs");
    expect(rent.read).toContain(
      `${SET_FROM_WORDS}: Zillow's apartment asking rents, the figure for this kind of rent, so it is not checked against it; the other figures are shown beside it, never held to. Read off a trailing year, it is a cautious stance, not a forecast.`,
    );
    expect(rent.read).not.toMatch(/sits at it|runs (ahead of|behind) it|asked to beat/);
    // Expense growth runs the CPI, the OM stating none: the same.
    const expense = check("expense_growth");
    expect(expense.tone).toBe("set_from");
    expect(expense.read).toContain(`${SET_FROM_WORDS}: consumer prices, all items (the CPI), the broad price level the expense base moves with, so it is not checked against it`);
    // The OM states no expense growth, so the CPI ran alone: a stance, never
    // called cautious, since there was nothing more optimistic beside it.
    // The OM's 4.0% rent growth, over Zillow's 2.4%, is what makes Zillow's run cautious.
    expect(derived.sources.rentGrowthPct?.published?.overOm).toBe(true);
    expect(derived.sources.expenseGrowthPct?.published?.overOm).toBeUndefined();
    expect(expense.read).toContain(SET_FROM_TRAILING_STANCE);
    expect(expense.read).not.toContain("cautious");
    expect(rent.read).toContain(SET_FROM_TRAILING_CAUTIOUS);
    // The exit runs the OM's own going-in cap: a check of the exit against
    // the entry and the 10-year, as before.
    const exit = check("exit_cap");
    expect(exit.setFrom).toBeUndefined();
    expect(exit.read).not.toContain(SET_FROM_WORDS);
    // The OM's own figure running: a check, as before.
    const hot = { ...READS, zori: { ...ZORI, mfrYoyPct: 7.2 } };
    const dHot = derive(ex, evidenceOf(ex, hot));
    const hotRent = modelVsMarketFor({ derived: dHot, extraction: ex, firstSignal: null, storedAssetClass: SAMPLE_DEAL.asset_class, metro, reads: hot })!.checks.find((c) => c.key === "rent_growth")!;
    expect(hotRent.setFrom).toBeUndefined();
    expect(hotRent.tone).toBe("behind");
    // An exit run at the research range's low end: the range's part says so.
    const tight = withRow("Exit cap", "4.75%", without(NO_GOING_IN));
    const d3 = derive(tight, evidenceOf(tight, READS));
    const exit3 = modelVsMarketFor({ derived: d3, extraction: tight, firstSignal: null, storedAssetClass: SAMPLE_DEAL.asset_class, metro, reads: READS })!.checks.find((c) => c.key === "exit_cap")!;
    expect(exit3.setFrom).toBe(true);
    expect(exit3.read).toContain(`${SET_FROM_WORDS}: the exit runs at its low end, so the exit is not checked against the range.`);
    expect(exit3.read).not.toMatch(/exit cap sits (inside|at) it/);
  });

  it("the workbook's Market Read tab and the report's block print the same set-from row", async () => {
    const evidence = evidenceOf(ex, READS);
    const derived = derive(ex, evidence);
    const mvm = modelVsMarketFor({ derived, extraction: ex, firstSignal: null, storedAssetClass: SAMPLE_DEAL.asset_class, metro, reads: READS })!;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(derived, null, mvm)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Market Read")!;
    const cells: string[] = [];
    ws.eachRow((r) => r.eachCell((c) => cells.push(String(c.value ?? ""))));
    expect(cells).toContain("the figure the model runs");
    expect(cells.some((c) => c.includes(`${SET_FROM_WORDS}: Zillow's apartment asking rents`))).toBe(true);
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
