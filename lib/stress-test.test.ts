import { afterEach, describe, expect, it, vi } from "vitest";

// The engine, spied: the stress test may run it again on the model's inputs
// with ONE input swapped — never two — and the spy sees every call.
vi.mock("@/lib/underwrite/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/underwrite/engine")>();
  return { ...mod, computeUnderwrite: vi.fn(mod.computeUnderwrite) };
});

import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { modelVsMarket, type ModelVsMarket, type ModelVsMarketInput } from "./model-vs-market";
import { trackerFor } from "./tracker-read";
import { regulationForDeal } from "./rent-regulation";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import { summarizeT12 } from "./actuals/analyze";
import { readActuals } from "./actuals/actuals-read";
import { inferStrategy } from "./deal-strategy";
import type { ChallengerResult, ExtractionResult } from "./anthropic/types";
import type { DebtIndex } from "./debt-index";
import { STRESS_KEYS, STRESS_METHODS, type StressKey, type StressRow } from "./stress-test-types";
import { CHALLENGE_KEYWORDS, buildStressTest, challengeKey, type StressTestArgs } from "./stress-test";

const spy = computeUnderwrite as unknown as ReturnType<typeof vi.fn>;
afterEach(() => spy.mockClear());

// ── Fixtures ──────────────────────────────────────────────────────────────

const row = (label: string, value: string, page = "p. 12") => ({ label, value, flagged: false, page });

/** A stabilized apartment building in Washington: 153 units, 94% occupied,
 *  a pro forma 12.8% over its T-12. */
const APARTMENT: ExtractionResult = {
  dealName: "The Maddox",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1200 N Capitol St NW, Washington, DC 20002",
  totalPages: 48,
  strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
  metrics: [
    row("Asking price", "$42,000,000", "p. 5"),
    row("Units", "153", "p. 4"),
    row("Rentable SF", "140,000", "p. 4"),
    row("Occupancy", "94%", "p. 8"),
    row("NOI (in-place)", "$2,400,000", "p. 7"),
    row("NOI (stabilized, pro forma)", "$2,650,000", "p. 7"),
    row("Going-in cap rate", "5.71%", "p. 6"),
    row("Exit cap rate", "5.50%", "p. 21"),
    row("Rent growth", "4.0%", "p. 21"),
    row("Expense growth", "2.5%", "p. 21"),
    row("Real estate taxes", "$380,000", "p. 15"),
    row("Assessed value", "$30,000,000", "p. 15"),
    row("Insurance", "$120,000", "p. 15"),
    row("Interest rate", "5.25%", "p. 30"),
    row("Pro forma rent", "$2,350/unit/mo", "p. 20"),
  ],
};

const T12 = summarizeT12({
  periodEndDate: "2026-06-30",
  collectedRent: 4_400_000,
  vacancyLoss: -400_400, // 9.1% of the scheduled rent, filed as a negative
  otherIncome: 100_000,
  egi: null,
  opex: [
    { key: "taxes", label: "Real estate taxes", amount: 380_000, page: "p. 2" },
    { key: "insurance", label: "Insurance", amount: 150_000, page: "p. 2" },
    { key: "payroll", label: "Payroll", amount: 620_000, page: "p. 2" },
    { key: "rm", label: "Repairs & maintenance", amount: 600_000, page: "p. 2" },
  ],
  totalOpex: null,
  noi: null,
  page: "p. 2",
});

const FIVE: DebtIndex = { id: "DGS5", short: "5-yr", pct: 4.78, asOf: "2026-09-17", kind: "treasury" };

// Washington's figures, the shape lib/model-vs-market.test.ts reads them in.
const national = readRates(REAL_ROWS, FIXTURE_NOW);
const rentIndex: RateRow[] = [];
for (let i = 0; i < 14; i++) {
  const d = new Date(Date.UTC(2026, 7 - i, 1)).toISOString().slice(0, 10);
  rentIndex.push({ series_id: "CUURS35ASEHA", obs_date: d, value: i === 0 ? 420 : i === 12 ? 400 : 410 });
}
const METRO_ROWS: RateRow[] = [
  { series_id: "WASH911URN", obs_date: "2026-07-01", value: 4.0 },
  { series_id: "RRVRSOQ156N", obs_date: "2026-04-01", value: 9.5 },
  { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 6.2 },
  { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
  ...rentIndex,
];
const rates = readMetroRates("dc", METRO_ROWS, FIXTURE_NOW);
const zori = {
  rent: 2412,
  yoyPct: 2.3,
  asOf: "2026-08-31",
  note: "Zillow Observed Rent Index (ZORI), all homes, smoothed, Washington, DC metro area, month ending 2026-08-31. Data: Zillow Research.",
  shared: false,
  mfrRent: 2150,
  mfrYoyPct: 1.1,
  homeValue: null,
  homeValueYoyPct: null,
  priceToRentYears: null,
};

function readFor(derived: ReturnType<typeof deriveUnderwriteInputs>, extra: Partial<ModelVsMarketInput> = {}): ModelVsMarket {
  const input: ModelVsMarketInput = {
    inputs: derived.inputs,
    sources: derived.sources,
    assetClass: "multifamily",
    plan: false,
    goingInCapPct: 5.71,
    metro: { id: "dc", name: "Washington DC" },
    rates,
    zori,
    national,
    now: FIXTURE_NOW,
    ...extra,
  };
  return modelVsMarket(input)!;
}

const READ_ON = FIXTURE_NOW.toISOString().slice(0, 10);

function apartmentArgs(overrides: Partial<StressTestArgs> = {}): StressTestArgs {
  const actualsIn = { t12: { summary: T12, periodEnd: "2026-06-30" } };
  const derived = deriveUnderwriteInputs(APARTMENT, "The Maddox", actualsIn, { debtIndex: FIVE });
  const actuals = readActuals({ metrics: APARTMENT.metrics, strategy: inferStrategy(APARTMENT), rentRoll: null, t12: actualsIn.t12, assetClass: "multifamily" });
  return {
    extraction: APARTMENT,
    challenger: null,
    market: { checks: [], summary: "", liveBrief: { metro: "Washington DC", readOn: READ_ON, lines: [], figures: [{ key: "dgs10", label: "10-year Treasury", value: 4.94, unit: "pct", asOf: "2026-09-17" }] } },
    modelVsMarket: readFor(derived),
    actuals,
    derived,
    storedAssetClass: "multifamily",
    readOn: READ_ON,
    ...overrides,
  };
}

const rowOf = (t: { rows: StressRow[] }, key: StressKey): StressRow => {
  const r = t.rows.find((x) => x.key === key);
  if (!r) throw new Error(`no ${key} row`);
  return r;
};

// ── A stabilized apartment deal with a T-12 ──────────────────────────────

describe("a stabilized apartment deal with a T-12", () => {
  const test = buildStressTest(apartmentArgs());

  it("sets the OM's 6% vacancy against the T-12's 9.1% first, and the impact's IRR drops", () => {
    const v = rowOf(test, "vacancy");
    expect(v.omSays).toEqual({ text: "Occupancy: 94% as stated, which leaves 6.0% vacancy", value: 6, page: 8 });
    expect(v.evidence[0]).toMatchObject({ kind: "document", publisher: "the deal's T-12", scope: "deal", value: 9.1, asOf: "2026-06-30" });
    // The share is over the T-12's own rent line (the figure its EGI nets
    // the vacancy from), never a "scheduled rent" the reader does not read.
    expect(v.evidence[0].label).toBe("The deal's T-12: vacancy loss over its rent line");
    expect(v.evidence[0].text).toBe("9.1% ($400k of the $4.4M rent line its EGI nets the vacancy from, TTM to 2026-06-30)");
    expect(v.evidence.map((e) => e.kind)).toEqual(["document", "published", "published", "rule_of_thumb"]);
    expect(v.evidence[1]).toMatchObject({ label: "Rental vacancy, metro area", publisher: "Census Bureau", scope: "metro", asOf: "2026-04-01" });
    // The region's figure is the region's, never passed off as the metro's.
    expect(v.evidence[2]).toMatchObject({ label: "Rental vacancy, South Census region", scope: "region", value: 9.5 });
    expect(v.evidence[3]).toMatchObject({ label: "Multifamily vacancy, a rule of thumb", publisher: "a rule of thumb", scope: "class", value: 5, asOf: null });
    expect(v.gap).toEqual({ value: 3.1, unit: "pts", text: "The OM's 6.0% is 3.1 points under the evidence's 9.1%." });
    // 3.1 points past the T-12: past the 3-point threshold, unsupported.
    expect(v.verdict).toBe("unsupported");
    expect(v.impact).not.toBeNull();
    expect(v.impact!.input).toBe("vacancyPct");
    expect(v.impact!.evidenceIndex).toBe(0);
    expect(v.impact!.omValue).toBeCloseTo(0.06, 6);
    expect(v.impact!.altValue).toBeCloseTo(0.091, 6);
    expect(v.impact!.altIrrPct!).toBeLessThan(v.impact!.baseIrrPct!);
    expect(v.impact!.note).toMatch(/^If vacancy is the deal's T-12's 9\.1%, not the OM's 6\.0%, the levered IRR moves from \d+\.\d% to -?\d+\.\d% \(\d\.\d\dx to \d\.\d\dx equity multiple\)\.$/);
    expect(v.method).toBe(
      "The OM's stabilized vacancy against the deal's T-12: vacancy loss over its rent line (the deal's T-12), then rental vacancy, metro area (Census Bureau), rental vacancy, South Census region (FRED) and multifamily vacancy, a rule of thumb (a rule of thumb).",
    );
  });

  it("holds the OM's pro forma NOI to the T-12's, in dollars, by the actuals card's own bands", () => {
    const n = rowOf(test, "noi");
    expect(n.omSays.value).toBe(2_650_000);
    expect(n.omSays.page).toBe(7);
    expect(n.evidence[0]).toMatchObject({ kind: "document", label: "The deal's T-12 NOI", value: T12.noi, asOf: "2026-06-30" });
    expect(n.evidence.map((e) => e.label)).toContain("The OM's in-place NOI against its pro forma");
    expect(n.gap!.unit).toBe("usd");
    expect(n.gap!.value).toBe(2_650_000 - T12.noi!);
    expect(n.verdict).toBe("unsupported");
    expect(n.impact!.input).toBe("inPlaceRentAnnual");
    // The base run is the OM's pro forma, the alternative the T-12's, and
    // the model — which anchors on the T-12 — is said to run at the latter.
    expect(n.impact!.note).toMatch(/^If year-1 NOI is the deal's T-12's \$2\.\d\dM, not the OM's \$2\.65M, the levered IRR moves from \d+\.\d% to -?\d+\.\d% \(\d\.\d\dx to \d\.\d\dx equity multiple\)\. The model itself already runs at it\.$/);
    expect(n.impact!.altIrrPct!).toBeLessThan(n.impact!.baseIrrPct!);
  });

  it("prices every gap from the OM's figure, not the model's default, and names the model's own figure where it is a third value", () => {
    const args = apartmentArgs();
    const inputs = args.derived!.inputs;
    const irrAt = (patch: Partial<UnderwriteInputs>) => computeUnderwrite({ ...inputs, ...patch }).returns.leveredIrrPct! * 100;
    const t = buildStressTest(args);
    // The debt: the model runs at the seed's 6.78%, so a base run on the
    // model's inputs would have priced nothing; the base is the OM's 5.25%.
    const d = rowOf(t, "debt");
    expect(d.impact!.baseIrrPct).toBeCloseTo(irrAt({ allInRatePct: 0.0525 }), 6);
    expect(d.impact!.altIrrPct).toBeCloseTo(irrAt({ allInRatePct: 0.0678 }), 6);
    expect(d.impact!.altIrrPct!).toBeLessThan(d.impact!.baseIrrPct!);
    expect(d.impact!.note).toMatch(/^If the all-in rate is the index plus the class's spread's 6\.78%, not the OM's 5\.25%, the levered IRR moves from \d+\.\d% to \d+\.\d% \(.*\)\. The model itself already runs at it\.$/);
    // The exit: the model exits at the going-in cap, so the compression the
    // row calls stretched is priced from the OM's 5.50%.
    const x = rowOf(t, "exit_cap");
    expect(x.impact!.baseIrrPct).toBeCloseTo(irrAt({ exitCapPct: 0.055 }), 6);
    expect(x.impact!.altIrrPct).toBeCloseTo(irrAt({ exitCapPct: 0.0571 }), 6);
    expect(x.impact!.note).toContain("If the exit cap is the going-in cap's 5.71%, not the OM's 5.50%, the levered IRR moves from");
    expect(x.impact!.note).toContain("The model itself already runs at it.");
    // Rent growth: the model's 3.0% is neither the OM's 4.0% nor the
    // trailing year's 5.0%, so the note names it.
    const g = rowOf(t, "rent_growth");
    expect(g.impact!.baseIrrPct).toBeCloseTo(irrAt({ rentGrowthPct: 0.04 }), 6);
    expect(g.impact!.altIrrPct).toBeCloseTo(irrAt({ rentGrowthPct: 0.05 }), 6);
    expect(g.impact!.note).toMatch(/, not the OM's 4\.0%\/yr, the levered IRR moves from .* The model itself runs 3\.0%\/yr\.$/);
    // Vacancy: the model's 6.0% is the OM's own, so nothing is added.
    expect(rowOf(t, "vacancy").impact!.note).not.toContain("The model itself");
  });

  it("reads the taxes off the OM's own bill and assessed value, and the insurance off the T-12 and the index", () => {
    const t = rowOf(test, "taxes");
    expect(t.omSays).toEqual({ text: "Real estate taxes: $380,000", value: 380_000, page: 15 });
    // $380k over $30M assessed is 1.27%, on $42M $532k.
    expect(t.evidence[0]).toMatchObject({ kind: "om_internal", label: "The bill the OM's own figures imply on the price", value: 532_000, scope: "deal" });
    expect(t.evidence[1]).toMatchObject({ kind: "document", label: "The deal's T-12 tax line", value: 380_000 });
    expect(t.gap).toMatchObject({ value: 152_000, unit: "usd" });
    expect(t.verdict).toBe("unsupported");
    expect(t.impact!.input).toBe("expenseLines");
    expect(t.impact!.altIrrPct!).toBeLessThan(t.impact!.baseIrrPct!);
    expect(t.impact!.note).toMatch(/^If the tax line is the \$532k its own figures imply on the price, not the OM's \$380k, the levered IRR moves from/);
    const i = rowOf(test, "insurance");
    expect(i.omSays.value).toBe(120_000);
    expect(i.evidence[0]).toMatchObject({ kind: "document", label: "The deal's T-12 insurance line", value: 150_000 });
    expect(i.evidence[1]).toMatchObject({ kind: "published", scope: "nation", publisher: "BLS via FRED" });
    expect(i.evidence[1].label).toContain("insurance premiums");
    expect(i.gap).toMatchObject({ value: 30_000, unit: "usd" });
    expect(i.verdict).toBe("unsupported");
    expect(i.impact!.input).toBe("expenseLines");
  });

  it("sets the exit cap against the going-in cap, the rent growth against the trailing year and the debt against the seeded rate", () => {
    const x = rowOf(test, "exit_cap");
    expect(x.omSays).toEqual({ text: "Exit cap rate: 5.50%", value: 5.5, page: 21 });
    expect(x.evidence[0]).toMatchObject({ kind: "om_internal", label: "The OM's going-in cap", value: 5.71 });
    expect(x.evidence[1]).toMatchObject({ kind: "published", label: "10-year Treasury", value: 4.94, scope: "nation" });
    expect(x.evidence[1].text).toContain("the exit's spread over it is 56 bps");
    expect(x.gap).toEqual({ value: 21, unit: "bps", text: "The OM's 5.50% exit is 21 bps tighter than its 5.71% going-in cap — cap compression." });
    expect(x.verdict).toBe("stretched");
    expect(x.impact!.input).toBe("exitCapPct");
    expect(x.impact!.altValue).toBeCloseTo(0.0571, 6);

    const g = rowOf(test, "rent_growth");
    expect(g.omSays.value).toBe(4);
    expect(g.evidence.map((e) => e.label)).toEqual(["Asking rent, all home types", "Asking rent, apartments", "Rent paid by sitting tenants (CPI rent)"]);
    expect(g.evidence.every((e) => e.kind === "published" && e.scope === "metro")).toBe(true);
    // The highest market figure is the rent index's +5.0%: the OM's 4.0% is under it.
    expect(g.gap).toMatchObject({ value: -1, unit: "pts" });
    expect(g.verdict).toBe("holds");
    expect(g.impact!.input).toBe("rentGrowthPct");

    const e = rowOf(test, "expense_growth");
    expect(e.omSays.value).toBe(2.5);
    expect(e.evidence[0].label).toBe("Consumer prices (CPI, all items)");
    expect(e.evidence.every((x) => x.scope === "nation")).toBe(true);
    // Under core's 2.4%? No — 2.5 is over the lowest index, the conservative side.
    expect(e.verdict).toBe("holds");
    expect(e.impact!.input).toBe("expenseGrowthPct");

    const d = rowOf(test, "debt");
    expect(d.omSays).toEqual({ text: "Interest rate: 5.25%", value: 5.25, page: 30 });
    // The index is the fact, dated by its own day (read back off the seed's
    // note, lib/debt-index's `debtRateNote`); the spread is a rule of thumb.
    expect(d.evidence[0]).toEqual({
      kind: "published",
      label: "The index the model prices off: 5-yr Treasury",
      text: "4.78% (FRED, Sep 17, 2026)",
      value: 4.78,
      asOf: "2026-09-17",
      publisher: "FRED",
      scope: "nation",
    });
    expect(d.evidence[1]).toMatchObject({ kind: "rule_of_thumb", value: 6.78, asOf: null, publisher: "a screening default", scope: "class" });
    expect(d.evidence[1].text).toContain("+200 bps over the index, the class's screening default, not a quote: 6.78% all in");
    expect(d.evidence.map((e) => e.label)).toEqual([
      "The index the model prices off: 5-yr Treasury",
      "The class's screening spread over it, a rule of thumb",
      "10-year Treasury, as the market check read it",
      "Lender tests at screening defaults, the binding one named",
      "Negative leverage: the going-in cap against the all-in rate",
    ]);
    expect(d.gap).toEqual({ value: 153, unit: "bps", text: "The OM's 5.25% is 153 bps under the index plus the class's spread, 6.78%." });
    // 153 bps under the index plus a default spread, but over the bare
    // 4.78% index: stretched, never unsupported on a rule of thumb.
    expect(d.verdict).toBe("stretched");
    expect(d.impact!.input).toBe("allInRatePct");
    expect(d.impact!.evidenceIndex).toBe(1);
  });

  it("reads the index off the DebtIndex where one is handed in, the same as off the note, and reads a rate under the bare index unsupported", () => {
    const given = rowOf(buildStressTest(apartmentArgs({ debtIndex: FIVE })), "debt");
    expect(given.evidence[0]).toEqual(rowOf(test, "debt").evidence[0]);
    expect(given.evidence[1].text).toContain("+200 bps over the index");
    const cheap = { ...APARTMENT, metrics: APARTMENT.metrics.map((m) => (m.label === "Interest rate" ? { ...m, value: "4.50%" } : m)) };
    const d = rowOf(buildStressTest(apartmentArgs({ extraction: cheap })), "debt");
    expect(d.gap).toMatchObject({ value: 228, unit: "bps" });
    expect(d.verdict).toBe("unsupported");
  });

  it("strikes the basis on the price over the units, and withholds a verdict with no comp", () => {
    const b = rowOf(test, "basis");
    expect(b.omSays).toEqual({ text: "$275k/unit (Asking price $42,000,000 over 153 units)", value: 274_510, page: 5 });
    expect(b.evidence.map((e) => e.kind)).toEqual(["rule_of_thumb"]);
    expect(b.verdict).toBe("unchecked");
    expect(b.impact).toBeNull();
  });

  it("omits a row with nothing stated and nothing found, and no impact is withheld", () => {
    expect(test.rows.map((r) => r.key)).toEqual(["basis", "exit_cap", "debt", "noi", "vacancy", "rent_growth", "expense_growth", "taxes", "insurance"]);
    expect(test.impactsWithheld).toBeNull();
    expect(test.readOn).toBe(READ_ON);
  });

  it("re-runs the engine with exactly ONE input changed, the one the impact names", () => {
    const args = apartmentArgs();
    const baseInputs = args.derived!.inputs;
    spy.mockClear();
    const t = buildStressTest(args);
    expect(t.rows.some((r) => r.impact)).toBe(true);
    // Every run the test made is on the model's own inputs or on a copy
    // with one key swapped — never two: the base run carries the OM's
    // figure in that key and the alternative the evidence's, so the two
    // differ in it alone, and in nothing else from the model.
    const swapped = (spy.mock.calls as [UnderwriteInputs][]).map(([i]) => i).filter((i) => i !== baseInputs);
    expect(swapped.length).toBeGreaterThan(0);
    const changedKeys = new Set<string>();
    for (const alt of swapped) {
      const diff = (Object.keys(alt) as (keyof UnderwriteInputs)[]).filter((k) => JSON.stringify(alt[k]) !== JSON.stringify(baseInputs[k]));
      expect(diff.length, `a run changed ${diff.join(", ")}`).toBeLessThanOrEqual(1);
      diff.forEach((k) => changedKeys.add(k));
    }
    const impacts = t.rows.filter((r) => r.impact).map((r) => r.impact!);
    // Every key a run changed is one an impact names, and every impact whose
    // alternative differs from the OM's figure changed its key; one whose
    // figures are one is a pair of runs with nothing between them, said so.
    for (const k of changedKeys) expect(impacts.map((i) => i.input)).toContain(k);
    for (const i of impacts) {
      if (Math.abs(i.altValue - i.omValue) > 1e-9) expect(changedKeys.has(i.input), i.input).toBe(true);
      else expect(i.note).toContain("stands on it");
    }
    for (const k of ["vacancyPct", "expenseLines", "exitCapPct", "allInRatePct", "rentGrowthPct"]) expect(changedKeys.has(k), k).toBe(true);
  });
});

// ── A deal with only published figures ───────────────────────────────────

describe("a deal with only published figures", () => {
  const ex: ExtractionResult = {
    ...APARTMENT,
    metrics: APARTMENT.metrics.filter((m) => !/Interest rate|Assessed|Insurance|Real estate taxes|Exit cap|Expense growth/.test(m.label)).map((m) => (m.label === "Occupancy" ? { ...m, value: "99%" } : m)),
  };
  const derived = deriveUnderwriteInputs(ex, "x", undefined, { debtIndex: FIVE });
  const test = buildStressTest({ extraction: ex, challenger: null, market: null, modelVsMarket: readFor(derived), actuals: null, derived, storedAssetClass: "multifamily", readOn: READ_ON });

  it("reads the vacancy against the survey inside its margin, then the region, then the class's norm", () => {
    const v = rowOf(test, "vacancy");
    expect(v.omSays.value).toBe(1);
    expect(v.evidence.map((e) => e.kind)).toEqual(["published", "published", "rule_of_thumb"]);
    expect(v.evidence[0].text).toBe("6.2% ±2.2 pts (Q2 2026)");
    // 1.0% against 6.2 ±2.2: 5.2 points under, 3.0 beyond the margin — stretched, not yet unsupported.
    expect(v.gap).toMatchObject({ value: 5.2, unit: "pts" });
    expect(v.verdict).toBe("stretched");
    expect(v.impact!.input).toBe("vacancyPct");
    expect(v.impact!.evidenceIndex).toBe(0);
    expect(v.impact!.note).toContain("Census Bureau's 6.2%");
  });

  it("with no T-12, holds the pro forma NOI to the OM's own in-place figure and reads stretched at most", () => {
    const n = rowOf(test, "noi");
    expect(n.evidence.map((e) => e.kind)).toEqual(["om_internal"]);
    // $2.65M is 10.4% over the OM's own $2.4M: past the 10% band, but the
    // memorandum against itself never reads unsupported.
    expect(n.gap).toMatchObject({ value: 250_000, unit: "usd" });
    expect(n.verdict).toBe("stretched");
  });

  it("marks a row the OM states no figure for as unchecked with the reason, and keeps its evidence", () => {
    const x = rowOf(test, "exit_cap");
    expect(x.omSays).toEqual({ text: "The OM states no exit cap.", value: null, page: null });
    expect(x.verdict).toBe("unchecked");
    expect(x.unchecked).toBe("The OM states no exit cap.");
    expect(x.evidence.map((e) => e.label)).toEqual(["The OM's going-in cap", "10-year Treasury"]);
    expect(x.gap).toBeNull();
    expect(x.impact).toBeNull();
    // The index was read, so the insurance row stands unchecked with the
    // evidence; nothing at all was read for the taxes, so there is no row.
    const i = rowOf(test, "insurance");
    expect(i.verdict).toBe("unchecked");
    expect(i.unchecked).toBe("The OM states no insurance premium.");
    expect(i.evidence.map((e) => e.kind)).toEqual(["published"]);
    expect(i.evidence[0].value).toBeNull();
    expect(test.rows.map((r) => r.key)).not.toContain("taxes");
  });
});

// ── A share ──────────────────────────────────────────────────────────────

/** A 49% interest at $20M: the whole the price implies is $40.8M, which
 *  the derived model already runs at. */
const SHARE: ExtractionResult = {
  ...APARTMENT,
  interest: { kind: "partial_interest", summary: "A 49% interest in the owning entity", share: "49%", groundLease: "", loan: "", page: "p. 3" },
  metrics: APARTMENT.metrics.map((m) => (m.label === "Asking price" ? { ...m, value: "$20,000,000" } : m)),
};

describe("a 49% share", () => {
  const derived = deriveUnderwriteInputs(SHARE, "x", undefined, { debtIndex: FIVE });
  const test = buildStressTest({ extraction: SHARE, challenger: null, market: null, modelVsMarket: readFor(derived), actuals: null, derived, storedAssetClass: "multifamily", readOn: READ_ON });

  it("works the reset bill on the whole the share's price implies, grossed up once", () => {
    expect(derived.inputs.purchasePrice).toBeCloseTo(20_000_000 / 0.49, 0);
    const t = rowOf(test, "taxes");
    // $380k over $30M is 1.27%; on the $40.8M whole, $517k — not on $83.3M.
    expect(t.evidence[0]).toMatchObject({ label: "The bill the OM's own figures imply on the price", value: 517_007 });
    expect(t.evidence[0].text).toContain("on the $40.82M price is $517k a year");
  });

  it("says the basis is struck on the whole the share's price implies, never the share's price over every unit", () => {
    const b = rowOf(test, "basis");
    expect(b.omSays).toEqual({ text: "$267k/unit (the whole the 49% share's $20,000,000 price implies, $40.82M, over 153 units)", value: 266_773, page: 5 });
    // The model's price is the whole, not the building's as stated: no re-run.
    expect(b.impact).toBeNull();
  });
});

// ── A tax abatement ──────────────────────────────────────────────────────

describe("a stated tax abatement is read against the model's sale", () => {
  // No assessed value, so the abatement is the only figure the bill could
  // be held to; the OM states the abated bill and the unabated one.
  const withAbatement = (ends: string): ExtractionResult => ({
    ...APARTMENT,
    metrics: [...APARTMENT.metrics.filter((m) => m.label !== "Assessed value"), row("Tax abatement", "421-a", "p. 15"), row("Tax abatement expiration", ends, "p. 15"), row("Unabated real estate taxes", "$900,000", "p. 15")],
  });

  it("ending after the hold, the full bill is the next buyer's: shown with no figure, and the row stands unchecked", () => {
    const t = rowOf(buildStressTest(apartmentArgs({ extraction: withAbatement("June 2045") })), "taxes");
    const a = t.evidence.find((e) => e.label === "The stated tax abatement and when it ends")!;
    expect(a).toMatchObject({ kind: "om_internal", value: null, asOf: "2045-06-01" });
    expect(a.text).toContain("it ends after the model's 5-year hold, so the step-up is the next buyer's to price");
    expect(t.verdict).toBe("unchecked");
    expect(t.impact).toBeNull();
  });

  it("ending inside the hold, the full bill is the buyer's: the abated bill is held to the unabated one, and the note says which is which", () => {
    const t = rowOf(buildStressTest(apartmentArgs({ extraction: withAbatement("June 2029") })), "taxes");
    expect(t.evidence[0]).toMatchObject({ label: "The stated tax abatement and when it ends", value: 900_000, asOf: "2029-06-01" });
    expect(t.evidence[0].text).toContain("it ends inside the model's 5-year hold, so the full bill is the buyer's");
    expect(t.gap).toEqual({ value: 520_000, unit: "usd", text: "The OM's $380k is $520k (57.8%) under the $900k it states as the unabated bill." });
    expect(t.verdict).toBe("unsupported");
    expect(t.impact!.note).toMatch(/^If the tax line is the unabated bill's \$900k, not the abated \$380k, the levered IRR moves from/);
    expect(t.impact!.note).not.toContain("the OM's");
  });

  it("with no stated end, the step-up is placed against no sale", () => {
    const ex = { ...withAbatement("June 2029"), metrics: withAbatement("June 2029").metrics.filter((m) => m.label !== "Tax abatement expiration") };
    const t = rowOf(buildStressTest(apartmentArgs({ extraction: ex })), "taxes");
    const a = t.evidence.find((e) => e.label === "The stated tax abatement and when it ends")!;
    expect(a.value).toBeNull();
    expect(a.text).toContain("the OM states no end, so the step-up is placed against no sale");
  });
});

// ── A plan deal ──────────────────────────────────────────────────────────

describe("a value-add plan deal", () => {
  const ex: ExtractionResult = {
    ...APARTMENT,
    strategy: { kind: "value_add", summary: "Renovate 120 classic units", capitalBudget: "$1,800,000", timeline: "24 months" },
    metrics: [
      ...APARTMENT.metrics,
      row("Units to renovate", "120", "p. 22"),
      row("Renovation cost per unit", "$15,000", "p. 22"),
      row("Renovation premium", "$250/mo", "p. 22"),
      row("Achieved renovation premium", "$190/mo", "p. 23"),
      row("Classic rent", "$1,650", "p. 23"),
      row("Renovated rent", "$1,900", "p. 23"),
      row("Renovation period", "24 months", "p. 22"),
    ],
  };
  const derived = deriveUnderwriteInputs(ex, "x", undefined, { debtIndex: FIVE });
  const test = buildStressTest({ extraction: ex, challenger: null, market: null, modelVsMarket: readFor(derived, { plan: true }), actuals: null, derived, storedAssetClass: "multifamily", readOn: READ_ON });

  it("withholds every impact: a plan deal is judged on its yield on total cost", () => {
    expect(test.impactsWithheld).toBe("A plan deal is judged on its yield on total cost: the model's levered return runs the finished project's figures over the price, so no return is re-run on it.");
    expect(test.rows.every((r) => r.impact === null)).toBe(true);
    // The rows still read: the verdicts are the gaps', not the model's.
    expect(rowOf(test, "vacancy").verdict).not.toBe("unchecked");
  });

  it("reads the renovation premium against the achieved one, the rents and the break-even", () => {
    const p = rowOf(test, "renovation_premium");
    expect(p.omSays).toEqual({ text: "$250 a month a renovated door, as stated", value: 250, page: 22 });
    expect(p.evidence.map((e) => e.label)).toEqual([
      "Achieved premium on the doors already renovated",
      "The OM's classic and renovated rents, against its lease comps' rents",
      "Break-even premium at the model's exit cap",
    ]);
    expect(p.evidence[0]).toMatchObject({ kind: "om_internal", value: 190 });
    expect(p.evidence[2]).toMatchObject({ kind: "rule_of_thumb", publisher: "the model's own arithmetic" });
    // $15,000 × 5.71% / 12 = $71 a month.
    expect(p.evidence[2].value).toBe(71);
    expect(p.gap).toEqual({ value: 60, unit: "usd", text: "The projected $250 is $60 a month (31.6%) over the achieved $190." });
    expect(p.verdict).toBe("unsupported");
    expect(p.impact).toBeNull();
  });
});

// ── A note ───────────────────────────────────────────────────────────────

describe("a note secured by the building", () => {
  const ex: ExtractionResult = {
    ...APARTMENT,
    interest: { kind: "note", summary: "A first mortgage note", share: "", groundLease: "", loan: "$30,000,000 UPB at 6.5%", page: "p. 3" },
    metrics: [
      row("Asking price", "$27,000,000", "p. 5"),
      row("Unpaid principal balance", "$30,000,000", "p. 3"),
      row("Note rate", "6.50%", "p. 3"),
      row("Maturity date", "March 2028", "p. 3"),
      row("Units", "153", "p. 4"),
      row("Occupancy", "94%", "p. 8"),
      row("NOI (in-place)", "$2,400,000", "p. 7"),
      row("Going-in cap rate", "8.9%", "p. 6"),
      row("Exit cap rate", "6.00%", "p. 21"),
    ],
  };
  const derived = deriveUnderwriteInputs(ex, "x", undefined, { debtIndex: FIVE });
  const test = buildStressTest({ extraction: ex, challenger: null, market: null, modelVsMarket: readFor(derived, { goingInCapPct: null }), actuals: null, derived, storedAssetClass: "multifamily", readOn: READ_ON });

  it("strikes no basis on a loan's price, sets the exit against no collateral cap, and re-runs nothing", () => {
    const b = rowOf(test, "basis");
    expect(b.omSays.value).toBeNull();
    expect(b.omSays.text).toBe("No basis is struck: the price buys a note secured by the building, not the building.");
    expect(b.verdict).toBe("unchecked");
    const x = rowOf(test, "exit_cap");
    expect(x.evidence.map((e) => e.label)).not.toContain("The OM's going-in cap");
    expect(test.impactsWithheld).toBe("No return is re-run: the price buys a note secured by the building, not the building.");
    expect(test.rows.every((r) => r.impact === null)).toBe(true);
  });

  it("builds no debt row: the note's coupon is the note's, not an acquisition loan's", () => {
    expect(test.rows.map((r) => r.key)).not.toContain("debt");
  });
});

describe("the vacancy the row reads is the OM's allowance", () => {
  it("reads 'Vacancy & credit loss: 7.0%' as the allowance, and a dollar vacancy loss as no allowance", () => {
    const both = { ...APARTMENT, metrics: [...APARTMENT.metrics, row("Vacancy loss", "$400,400", "p. 9"), row("Vacancy & credit loss", "7.0%", "p. 21")] };
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: both })), "vacancy").omSays).toEqual({ text: "Vacancy & credit loss: 7.0%", value: 7, page: 21 });
    const dollars = { ...APARTMENT, metrics: [...APARTMENT.metrics, row("Vacancy loss", "$400,400", "p. 9")] };
    // Only the dollar line: the stated occupancy stands in, as before.
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: dollars })), "vacancy").omSays.text).toBe("Occupancy: 94% as stated, which leaves 6.0% vacancy");
  });
});

describe("the premium the insurance row reads is the building's, never insurance income", () => {
  const withRows = (...extra: { label: string; value: string }[]): ExtractionResult => ({
    ...APARTMENT,
    metrics: [...APARTMENT.metrics.filter((m) => m.label !== "Insurance"), ...extra.map((r) => row(r.label, r.value, "p. 15"))],
  });

  it("refuses a storage facility's tenant-insurance income by its label, and a value whose words say income", () => {
    const ex = withRows({ label: "Tenant insurance", value: "$45,000 annual income" }, { label: "Insurance program revenue", value: "$45,000" }, { label: "Insurance", value: "$45,000 of income" });
    const i = rowOf(buildStressTest(apartmentArgs({ extraction: ex })), "insurance");
    expect(i.verdict).toBe("unchecked");
    expect(i.unchecked).toBe("The OM states no insurance premium.");
  });

  it("still reads the premium past them", () => {
    const ex = withRows({ label: "Tenant insurance", value: "$45,000 annual income" }, { label: "Insurance", value: "$120,000" });
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: ex })), "insurance").omSays).toEqual({ text: "Insurance: $120,000", value: 120_000, page: 15 });
  });
});

describe("the loan rate the debt row reads is the acquisition loan's", () => {
  const withRows = (...extra: { label: string; value: string }[]): ExtractionResult => ({
    ...APARTMENT,
    metrics: [...APARTMENT.metrics.filter((m) => m.label !== "Interest rate"), ...extra.map((r) => row(r.label, r.value, "p. 30"))],
  });

  it("reads the interest rate past an existing, in-place or current loan's, and a note rate on a fee simple", () => {
    const ex = withRows({ label: "Existing loan rate", value: "3.50%" }, { label: "In-place loan rate", value: "3.60%" }, { label: "Current loan rate", value: "3.70%" }, { label: "Note rate", value: "3.80%" }, { label: "Interest rate", value: "5.25%" });
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: ex })), "debt").omSays).toEqual({ text: "Interest rate: 5.25%", value: 5.25, page: 30 });
  });

  it("with only another loan's rate on file, the OM states no loan rate", () => {
    const ex = withRows({ label: "Existing loan rate", value: "3.50%" }, { label: "Unpaid principal balance rate", value: "6.50%" });
    const d = rowOf(buildStressTest(apartmentArgs({ extraction: ex })), "debt");
    expect(d.verdict).toBe("unchecked");
    expect(d.unchecked).toBe("The OM states no loan rate.");
  });
});

// ── The challenger's words ───────────────────────────────────────────────

describe("the challenger's words ride beside the rows", () => {
  const stored: ChallengerResult = {
    stressTest: "",
    challenges: [
      { assumption: "Stabilized occupancy of 94%", severity: "high", challenge: "The T-12 ran 90.9%.", question: "What was occupancy each month?", page: "p. 8" },
      { assumption: "Exit cap of 5.50% against a 5.71% going-in cap", severity: "medium", challenge: "Compression.", question: "Why?", page: "p. 21" },
      { assumption: "Vacancy allowance of 6%", severity: "low", challenge: "A second vacancy point.", question: "And this?", page: "" },
      { assumption: "The broker's narrative on the submarket", severity: "low", challenge: "Nothing numerate.", question: "Which comps?", page: "p. 99" },
    ],
  };

  it("matches a challenge stored without a key by its assumption's words, and files the rest as other rows", () => {
    expect(stored.challenges.map(challengeKey)).toEqual(["vacancy", "exit_cap", "vacancy", "other"]);
    const test = buildStressTest(apartmentArgs({ challenger: stored }));
    expect(rowOf(test, "vacancy").challenge).toEqual({ severity: "high", challenge: "The T-12 ran 90.9%.", question: "What was occupancy each month?" });
    expect(rowOf(test, "exit_cap").challenge).toEqual({ severity: "medium", challenge: "Compression.", question: "Why?" });
    const others = test.rows.filter((r) => r.key === "other");
    expect(others.map((r) => r.title)).toEqual(["Vacancy allowance of 6%", "The broker's narrative on the submarket"]);
    expect(others[0].unchecked).toBe("A second challenge on the stabilized vacancy; its row carries the first.");
    expect(others[1]).toMatchObject({ verdict: "unchecked", impact: null, gap: null, evidence: [] });
    // p. 99 is past the deck's 48 pages: no page.
    expect(others[1].omSays).toEqual({ text: "The broker's narrative on the submarket", value: null, page: null });
    expect(others[1].method).toBe("The challenger's own critique; no reader tests it and no figure is swapped.");
    expect(test.rows[test.rows.length - 1].key).toBe("other");
  });

  it("takes the challenger's own key and figures where it wrote them", () => {
    const keyed: ChallengerResult = {
      stressTest: "",
      challenges: [
        { assumption: "A figure nobody's keyword names", severity: "high", challenge: "x", question: "y", page: "p. 2", key: "insurance", omFigure: 120_000, altFigure: 150_000, altBasis: "the T-12's $150k insurance line" },
        { assumption: "Something else", severity: "low", challenge: "z", question: "w", page: "", key: "other", omFigure: null, altFigure: 95, altBasis: "a rule of thumb: a stabilized apartment building runs about 95% occupied" },
      ],
    };
    expect(keyed.challenges.map(challengeKey)).toEqual(["insurance", "other"]);
    const test = buildStressTest(apartmentArgs({ challenger: keyed }));
    expect(rowOf(test, "insurance").challenge?.challenge).toBe("x");
    const other = test.rows.find((r) => r.key === "other")!;
    expect(other.method).toBe("The challenger's own critique, holding the figure against 95 (a rule of thumb: a stabilized apartment building runs about 95% occupied); no reader tests it and no figure is swapped.");
  });

  it("the keyword table covers every key but other, in an order a premium wins before the rents", () => {
    expect(CHALLENGE_KEYWORDS.map((k) => k.key).sort()).toEqual(STRESS_KEYS.filter((k) => k !== "other").sort());
    expect(challengeKey({ assumption: "Renovated rent premium of $250", severity: "low", challenge: "", question: "" })).toBe("renovation_premium");
    expect(challengeKey({ assumption: "Insurance premium at the seller's legacy policy", severity: "low", challenge: "", question: "" })).toBe("insurance");
    expect(challengeKey({ assumption: "Real estate taxes not reset to the sale price", severity: "low", challenge: "", question: "" })).toBe("taxes");
    expect(challengeKey({ assumption: "Asking price per unit against the comps", severity: "low", challenge: "", question: "" })).toBe("basis");
  });

  it("files a phrase by what it is about, not by a word in it", () => {
    const k = (assumption: string) => challengeKey({ assumption, severity: "low", challenge: "", question: "" });
    // "Bad debt" is a collections line, nobody's loan.
    expect(k("Bad debt at 0.5% of GPR")).toBe("other");
    expect(k("Debt service coverage of 1.20x")).toBe("debt");
    // "Tax-exempt bond financing" is the debt's, not the taxes'.
    expect(k("Tax-exempt bond financing at 4.1%")).toBe("debt");
    expect(k("Real estate taxes held flat")).toBe("taxes");
    // A premium over replacement cost is the basis's; an insurance premium is insurance.
    expect(k("A 20% premium over replacement cost")).toBe("basis");
    expect(k("Insurance premium at the seller's policy")).toBe("insurance");
    // A figure per unit is the basis's only beside a price word.
    expect(k("Payroll of $1,200 per unit")).toBe("other");
    expect(k("Asking $275,000 per unit")).toBe("basis");
    expect(k("Pricing at $310 psf")).toBe("basis");
  });
});

// ── The methodology is true of the code ──────────────────────────────────

/**
 * For each STRESS_METHODS sentence, a label or publisher the reader emits
 * for it — read off the evidence of the fixtures below, which between them
 * hand the reader every source the methodology names.
 */
const AGAINST_SOURCES: Record<StressKey, string[]> = {
  basis: ["The memorandum's sale comps", "Recorded sales (", "Your past screens in", "Prices the class trades in"],
  exit_cap: ["The OM's going-in cap", "10-year Treasury", "cap (research tracker)"],
  debt: ["The index the model prices off", "Lender tests at screening defaults", "Negative leverage"],
  noi: ["The deal's T-12 NOI", "The rent roll's in-place rent", "The OM's in-place NOI against its pro forma"],
  vacancy: ["The deal's rent roll", "Rental vacancy, metro area", "vacancy (research tracker)", "a rule of thumb"],
  rent_growth: ["Asking rent, apartments", "sitting tenants", "Rents charged by", "allowance on the regulated units"],
  expense_growth: ["Consumer prices", "insurance premiums", "breakeven"],
  taxes: ["The bill the OM's own figures imply", "The stated tax abatement"],
  insurance: ["Commercial property insurance premiums", "The deal's T-12 insurance line"],
  renovation_premium: ["Achieved premium", "classic and renovated rents", "Break-even premium"],
  other: ["The challenger's own critique"],
};

describe("every STRESS_METHODS sentence names a source the reader attaches", () => {
  // The apartment deal with every source handed in: a rent roll, the T-12,
  // the memorandum's comps, recorded sales, the reader's past screens, an
  // abatement, a value-add program and a challenge.
  const withEverything: ExtractionResult = {
    ...APARTMENT,
    metrics: [
      ...APARTMENT.metrics,
      row("Tax abatement", "421-a", "p. 15"),
      row("Tax abatement expiration", "June 2031", "p. 15"),
      row("Unabated real estate taxes", "$900,000", "p. 15"),
      row("Units to renovate", "120", "p. 22"),
      row("Renovation cost per unit", "$15,000", "p. 22"),
      row("Renovation premium", "$250/mo", "p. 22"),
      row("Achieved renovation premium", "$190/mo", "p. 23"),
      row("Classic rent", "$1,650", "p. 23"),
      row("Renovated rent", "$1,900", "p. 23"),
    ],
  };
  const rentRoll = {
    asOf: "2026-07-01",
    summary: { unitCount: 153, occupiedUnits: 139, totalSf: 140_000, occupiedSf: 127_000, sfWeightedOccupancy: 127_000 / 140_000, waltYears: null, weightedAvgRentPsf: null, avgRentMonthly: 2_190, rentUnits: 139, expiryBuckets: null, expiryCoveredSf: 0, truncated: false },
  };
  const actualsIn = { rentRoll, t12: { summary: T12, periodEnd: "2026-06-30" } };
  const derived = deriveUnderwriteInputs(withEverything, "x", actualsIn, { debtIndex: FIVE });
  const actuals = readActuals({ metrics: withEverything.metrics, strategy: inferStrategy(withEverything), ...actualsIn, assetClass: "multifamily" });
  // A Brooklyn walk-up's regulation, so the rent-growth check carries the
  // regime's allowance (lib/rent-regulation).
  const brooklyn: ExtractionResult = { ...APARTMENT, metrics: [row("Asking price", "$14,000,000"), row("Units", "48"), row("Year built", "1931"), row("Rent-regulated units", "41")] };
  const regulation = regulationForDeal({ extraction: brooklyn, address: { state: "NY", city: "Brooklyn", county: "Kings County" }, siteFlags: null, assetClass: "multifamily" }, "2026-10-05");
  const apartmentTest = buildStressTest({
    extraction: withEverything,
    challenger: { stressTest: "", challenges: [{ assumption: "The broker's story", severity: "low", challenge: "words", question: "which?", page: "" }] },
    market: null,
    modelVsMarket: readFor(derived, { now: new Date("2026-10-05T12:00:00Z"), regulation }),
    actuals,
    derived,
    storedAssetClass: "multifamily",
    brokerComps: {
      saleComps: [
        { name: "The Ellery", detail: "$252,000 per unit, 5.6% cap, sold Mar 2026", support: "supports", note: "" },
        { name: "Park Place", detail: "$261K/door, 5.4% cap", support: "favorable", note: "" },
      ],
      leaseComps: [{ name: "The Rowan", detail: "$2,050/mo one-bedroom", support: "supports", note: "" }],
      redFlags: [],
      summary: "",
    },
    recordedSales: { count: 4, medianPerSqft: 310, medianPerUnit: 240_000, providerName: "Philadelphia OPA", retrievedAt: "2026-10-01", href: "https://example.test/records" },
    pastScreens: { count: 3, perUnitMedian: 255_000, perSfMedian: 290, market: "Washington DC" },
    readOn: "2026-10-05",
  });
  // An office deal in Washington, whose vacancy and exit read the research
  // tracker's band and cap range (lib/tracker-read), and whose rents read
  // the national index of office lessors' rents.
  const office: ExtractionResult = {
    ...APARTMENT,
    assetClass: "office",
    metrics: APARTMENT.metrics.filter((m) => !/Units|Pro forma rent/.test(m.label)),
  };
  const officeDerived = deriveUnderwriteInputs(office, "x", undefined, { debtIndex: FIVE });
  const officeTest = buildStressTest({
    extraction: office,
    challenger: null,
    market: null,
    modelVsMarket: modelVsMarket({
      inputs: officeDerived.inputs,
      sources: officeDerived.sources,
      assetClass: "office",
      plan: false,
      goingInCapPct: 5.71,
      metro: { id: "dc", name: "Washington DC" },
      rates,
      zori: null,
      national,
      tracker: trackerFor("dc", "office", "office"),
      now: FIXTURE_NOW,
    })!,
    actuals: null,
    derived: officeDerived,
    storedAssetClass: "office",
    readOn: READ_ON,
  });
  // A Chicago apartment deal: its tracker carries a cap (Essex Realty's
  // transaction average, April 2026 — for the small-building stock, so the
  // read holds the exit to nothing in it) which rides as published evidence,
  // shown and not compared.
  const chicago: ExtractionResult = { ...APARTMENT, market: "Chicago, IL", address: "1 N State St, Chicago, IL 60602" };
  const chicagoDerived = deriveUnderwriteInputs(chicago, "x", undefined, { debtIndex: FIVE });
  const chicagoTest = buildStressTest({
    extraction: chicago,
    challenger: null,
    market: null,
    modelVsMarket: readFor(chicagoDerived, { metro: { id: "chicago", name: "Chicago" }, tracker: trackerFor("chicago", "multifamily", "multifamily") }),
    actuals: null,
    derived: chicagoDerived,
    storedAssetClass: "multifamily",
    readOn: READ_ON,
  });
  const labels = (key: StressKey): string[] =>
    [apartmentTest, officeTest, chicagoTest].flatMap((t) => t.rows.filter((r) => r.key === key).flatMap((r) => [...r.evidence.map((e) => e.label), ...r.evidence.map((e) => e.publisher), r.method]));

  it("a tracker cap the read holds the exit to nothing in is shown as the metro's published figure and never decides the verdict", () => {
    const x = rowOf(chicagoTest, "exit_cap");
    const tracker = x.evidence.find((e) => /cap \(research tracker\)/.test(e.label))!;
    expect(tracker).toMatchObject({ kind: "published", scope: "metro", value: 8.3, asOf: "April 2026" });
    expect(tracker.publisher).toContain("Essex Realty");
    // 5.50% against an 8.3% average would be 280 bps under it; the verdict
    // is the going-in cap's 21 bps of compression, as in Washington.
    expect(x.gap).toMatchObject({ value: 21, unit: "bps" });
    expect(x.verdict).toBe("stretched");
  });

  it("the map covers every key, one entry a sentence", () => {
    expect(Object.keys(AGAINST_SOURCES).sort()).toEqual([...STRESS_KEYS].sort());
    for (const m of STRESS_METHODS) expect(AGAINST_SOURCES[m.key].length, m.key).toBe(m.against.length);
  });

  for (const m of STRESS_METHODS) {
    it(`${m.key}: each "against" sentence has a label the reader emits`, () => {
      const emitted = labels(m.key);
      m.against.forEach((sentence, i) => {
        const needle = AGAINST_SOURCES[m.key][i];
        expect(emitted.some((l) => l.includes(needle)), `${m.key} #${i} "${sentence}" → "${needle}" in ${JSON.stringify(emitted)}`).toBe(true);
      });
    });
  }

  it("the basis reads the memorandum's comps, the recorded sales, the past screens and the band, best first", () => {
    const b = rowOf(apartmentTest, "basis");
    expect(b.evidence.map((e) => e.kind)).toEqual(["om_internal", "published", "document", "rule_of_thumb"]);
    expect(b.evidence[0].value).toBe(256_500);
    expect(b.evidence[1]).toMatchObject({ value: 240_000, href: "https://example.test/records", asOf: "2026-10-01" });
    expect(b.gap).toMatchObject({ unit: "pct", value: 7 });
    expect(b.verdict).toBe("stretched");
    expect(b.impact!.input).toBe("purchasePrice");
    expect(b.impact!.altValue).toBeCloseTo((42_000_000 * 256_500) / 274_510, 0);
    // The note names whose median the price is re-run at, and that the loan
    // re-sizes with the price — the median is the comps', not "the OM's".
    expect(b.impact!.note).toMatch(
      /^If the price is the memorandum's sale comps' median, \$39\.24M \(\$257k\/unit\), at the model's loan-to-cost \(the loan re-sizes with the price\), not the OM's \$42M \(\$275k\/unit\), the levered IRR moves from/,
    );
  });

  it("the office deal's vacancy and exit read the tracker as published figures, the metro's", () => {
    const v = rowOf(officeTest, "vacancy");
    expect(v.evidence.some((e) => /vacancy \(research tracker\)/.test(e.label) && e.kind === "published" && e.scope === "metro")).toBe(true);
    const g = rowOf(officeTest, "rent_growth");
    expect(g.evidence[0]).toMatchObject({ scope: "nation", publisher: "BLS via FRED" });
  });
});
