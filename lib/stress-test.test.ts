import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// The engine, spied: the stress test may run it again on the model's inputs
// with ONE input swapped — never two — and the spy sees every call.
vi.mock("@/lib/underwrite/engine", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/underwrite/engine")>();
  return { ...mod, computeUnderwrite: vi.fn(mod.computeUnderwrite) };
});

import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";
import { HISTORY_ROWS, readMetroRates, readRates, type RateRow } from "./live-rates";
import { GROWTH_AVERAGE_MIN_YEARS, compoundYearOverYear } from "./growth-average";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { modelVsMarket, type ModelVsMarket, type ModelVsMarketInput } from "./model-vs-market";
import { trackerFor } from "./tracker-read";
import { regulationForDeal } from "./rent-regulation";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import { summarizeT12 } from "./actuals/analyze";
import { readActuals } from "./actuals/actuals-read";
import { IMPLIED_CAP_CEILING, inferStrategy, planSummary, planWithBasisChecked } from "./deal-strategy";
import { subjectBasis } from "./comp-detail";
import { interestOf } from "./interest";
import { screenYearOf } from "./criteria";
import { basisTag } from "./pipeline-slots";
import { compactUsd } from "./money";
import { NO_RENT_INDEX } from "./rent-growth-decider";
import type { ChallengerResult, ExtractionResult } from "./anthropic/types";
import type { DebtIndex } from "./debt-index";
import { AVERAGE_NOT_FORECAST, GROWTH_HISTORY_HELD, STRESS_KEYS, STRESS_METHODS, TRAILING_YEAR_NOT_FORECAST, type StressKey, type StressRow } from "./stress-test-types";
import {
  CHALLENGE_KEYWORDS,
  HEADLINE_NOI_COMPONENTS,
  HEADLINE_NOI_REST_SHARE,
  HEADLINE_UNTESTED_KEYS,
  ROSTER_UNTESTED_PCT,
  MARKET_RENT_NO_RERUN,
  PLAN_MARKET_RENT_BESIDE_PREMIUM,
  INSURANCE_AT_HISTORY,
  INSURANCE_FLOOR_CONDITION,
  INSURANCE_NO_QUOTE,
  INSURANCE_NO_RERUN,
  INSURANCE_NO_RERUN_NO_T12,
  INSURANCE_NOT_DELIVERED,
  VACANCY_ECONOMIC_ONLY,
  ROLL_NOT_STABILIZED,
  STABILIZED_VACANCY_UNCHECKED,
  measureOf,
  exitCapPieces,
  expenseGrowthPieces,
  basisFloorWhy,
  SAME_SHARE,
  IRR_MOVE_STRETCH_BPS,
  leaseUpNotModelled,
  VACANCY_UNSUPPORTED_PTS,
  SHARE_NO_MODEL,
  PLAN_BASIS_LEFT_OUT,
  PLAN_BASIS_LEFT_OUT_FORWARD,
  PLAN_NO_YIELD_MEANING,
  PLAN_TAX_NO_TODAY,
  PLAN_TAX_NOT_ASSESSED,
  PLAN_TAX_NOT_PRO_FORMA,
  PLAN_VACANCY_DOCUMENT,
  PLAN_VACANCY_TODAY,
  PLAN_YIELD_LEAD,
  TAX_RATE_CEILING,
  TAX_RATE_MISREAD,
  YOC_MOVE_STRETCH_PTS,
  planMasterLeaseReason,
  planNoYieldReason,
  buildStressTest,
  holdsBand,
  challengeKey,
  headlinePrice,
  stabilizedVacancyStated,
  vacancyEconomicStated,
  vacancyDecidedBy,
  stressHeadline,
  type StressTestArgs,
} from "./stress-test";
import { HEADLINE_BASIS_LEFT_OUT, HEADLINE_METHOD, HEADLINE_NOI_LEFT_OUT, headlineBasisLeftOut } from "./stress-test-types";
import { evidenceDateTime, evidenceDay, evidencePeriod, evidenceShort, evidenceWhen, isoDayOf, sourceWithPage, whenWords, headlineLine, headlineName, headlineSentence, headlineShort, keptSentence, leadRows, moveShort, moveSize, noMoveWhy, rowWords, noiRestClause, noiRestSentence, ptsText, rerunWords, shownHeadline, stressReadLine, untestedSentence } from "./stress-test-words";
import { METRO_VACANCY_LABEL, VACANCY_ORDER } from "./stress-deciders";
import { planYieldBase } from "./plan-sensitivity";
import { monthlyOf } from "./value-add";
import { stressSection } from "./anthropic/verdict";
import { CANNOT, VERDICT_WORDS } from "./how-we-test";
import { SAMPLE_PLAN_NOTE } from "./stress-test-words";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StressTestPanel } from "@/app/stress-test-panel";
import { readRoster } from "./tenant-roster";
import { extractionInstruction } from "./anthropic/prompts";

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
  // The statement's own EGI is the rent line less the loss plus other
  // income, so its rent line is gross potential rent.
  egi: 4_099_600,
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

/** A rent roll beside the T-12: 139 of 153 units occupied, 9.2% vacant by
 *  its doors. */
const ROLL = {
  asOf: "2026-07-01",
  summary: { unitCount: 153, occupiedUnits: 139, totalSf: 140_000, occupiedSf: 127_000, sfWeightedOccupancy: 127_000 / 140_000, waltYears: null, weightedAvgRentPsf: null, avgRentMonthly: 2_190, rentUnits: 139, expiryBuckets: null, expiryCoveredSf: 0, truncated: false },
};

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

  it("holds today's occupancy, counted by doors, to the market's survey, and never to the T-12's economic vacancy (the review of 2026-10-21)", () => {
    const v = rowOf(test, "vacancy");
    // The OM states no vacancy allowance: its figure is today's occupancy,
    // titled and worded so, never a pro forma assumption.
    expect(v.title).toBe("Occupancy today");
    expect(v.omSays).toEqual({ text: "Occupancy: 94% as stated — today's occupancy, not a pro forma assumption — which leaves 6.0% vacant", value: 6, page: 8 });
    // The occupancy counts doors; the T-12's 9.1% is its vacancy and credit
    // loss over gross potential rent — dollars, with credit loss in it — so
    // it is shown beside the OM's figure and never decides it. With no rent
    // roll on file, the metro's survey (doors too) decides, inside its margin.
    expect(v.evidence.map((e) => e.kind)).toEqual(["published", "document", "published", "rule_of_thumb"]);
    expect(v.evidence[0]).toMatchObject({ label: "Rental vacancy, metro area", publisher: "Census Bureau", scope: "metro", asOf: "2026-04-01", value: 6.2 });
    expect(v.evidence[1]).toMatchObject({ kind: "document", publisher: "the deal's T-12", scope: "deal", value: 9.1, asOf: "2026-06-30" });
    // The share is over gross potential rent: here the rent line itself,
    // since the statement's stated EGI nets the vacancy from it — and the
    // sentence says what the loss was divided by, and that it is dollars.
    expect(v.evidence[1].label).toBe("The deal's T-12 economic vacancy (vacancy and credit loss over gross potential rent)");
    expect(v.evidence[1].text).toBe(
      "9.1% economic ($400k of $4.4M gross potential rent: the rent line, which the stated EGI nets the vacancy from; TTM to Jun 30, 2026); dollars, not doors: shown beside the OM's figure, which counts doors, and never deciding it",
    );
    // The region's figure is the region's, never passed off as the metro's.
    expect(v.evidence[2]).toMatchObject({ label: "Rental vacancy, South Census region", scope: "region", value: 9.5 });
    expect(v.evidence[3]).toMatchObject({ label: "Multifamily vacancy, a rule of thumb", publisher: "a rule of thumb", scope: "class", value: 5, asOf: null });
    expect(v.decidedBy).toBe(0);
    expect(v.gap).toEqual({
      value: 0.2,
      unit: "pts",
      text: "The OM's 6.0% is 0.2 points under the evidence's 6.2%, inside its ±2.2-pt margin. The deal's T-12 ran 9.1% economic vacancy over its trailing year, its vacancy and credit loss over gross potential rent — dollars, not doors — so it is shown beside the OM's figure, which counts doors, and never decides it.",
    });
    expect(v.verdict).toBe("holds");
    expect(v.measure).toBeUndefined();
    // The re-run is at the figure that decided, never at the T-12's dollars.
    expect(v.impact!.input).toBe("vacancyPct");
    expect(v.impact!.evidenceIndex).toBe(0);
    expect(v.impact!.altValue).toBeCloseTo(0.062, 6);
    // A publisher the label already names is not said twice.
    expect(v.method).toBe(
      "The OM's occupancy today against rental vacancy, metro area (Census Bureau), the one figure that decides; beside it, not deciding: the deal's T-12 economic vacancy (vacancy and credit loss over gross potential rent), rental vacancy, South Census region (Census Bureau via FRED) and multifamily vacancy, a rule of thumb.",
    );
  });

  it("decides a figure the OM states as economic by the T-12, the same measure, and shows the counts of doors beside it", () => {
    const econ: ExtractionResult = { ...APARTMENT, metrics: APARTMENT.metrics.filter((m) => m.label !== "Occupancy").concat(row("Economic occupancy", "88%", "p. 8")) };
    const v = rowOf(buildStressTest(apartmentArgs({ extraction: econ })), "vacancy");
    expect(v.title).toBe("Economic occupancy today");
    expect(v.measure).toBe("economic");
    expect(v.omSays).toEqual({ text: "Economic occupancy: 88% as stated — today's economic occupancy, not a pro forma assumption — which leaves 12.0% economic vacancy", value: 12, page: 8 });
    expect(v.evidence[0]).toMatchObject({ label: "The deal's T-12 economic vacancy (vacancy and credit loss over gross potential rent)", value: 9.1 });
    expect(v.evidence[0].text).not.toContain("never deciding");
    // 12.0% against the T-12's 9.1%: the conservative side, holds.
    expect(v.verdict).toBe("holds");
    expect(v.gap!.text).toBe(
      "The OM's 12.0% is 2.9 points over the evidence's 9.1% — the conservative side. The OM states its figure as economic, dollars, not doors, so it is held to the deal's T-12, the same measure. The rent roll's count and the published vacancy count doors, not dollars, so they are shown beside the OM's economic figure and never decide it.",
    );
    // With no T-12, the counts of doors still never decide it: the class's
    // norm does, named a rule of thumb.
    const noT12 = rowOf(buildStressTest(apartmentArgs({ extraction: econ, actuals: null })), "vacancy");
    expect(noT12.evidence[0].kind).toBe("rule_of_thumb");
    expect(noT12.ruleOfThumbOnly).toBe(true);
    expect(noT12.gap!.text).toContain("no T-12 is on file to hold it to, so the class's norm decides");
    // "Vacancy & credit loss" is an economic allowance: held to the T-12, and
    // the track record is told the market does not hold it.
    const vcl: ExtractionResult = { ...APARTMENT, metrics: [...APARTMENT.metrics, row("Vacancy & credit loss", "7.0%", "p. 21")] };
    const a = rowOf(buildStressTest(apartmentArgs({ extraction: vcl })), "vacancy");
    expect(a.title).toBe("Stabilized vacancy");
    expect(a.measure).toBe("economic");
    expect(a.evidence[0].label).toBe("The deal's T-12 economic vacancy (vacancy and credit loss over gross potential rent)");
    expect(a.verdict).toBe("stretched");
    expect(stabilizedVacancyStated(vcl)).toBe(false);
    // …and is told the OM's figure counts dollars, so an older screen's
    // challenge on it is scored by a later T-12, never a rent roll's doors.
    expect(vacancyEconomicStated(vcl)).toBe(true);
    expect(vacancyEconomicStated(APARTMENT)).toBe(false);
    expect(vacancyEconomicStated(null)).toBe(false);
    for (const page of ["app/(app)/deals/[id]/page.tsx", "app/(app)/analytics/page.tsx"]) {
      expect(readFileSync(page, "utf8"), page).toContain("vacancyEconomic: vacancyEconomicStated(extraction)");
    }
  });

  it("stands a figure counted by doors unchecked where the T-12's dollars are the only figure on file", () => {
    // Land carries no class norm; with no published read either, the T-12 is
    // all there is, and dollars do not decide doors.
    const land: ExtractionResult = { ...APARTMENT, assetClass: "land" };
    const v = rowOf(buildStressTest(apartmentArgs({ extraction: land, storedAssetClass: "land", modelVsMarket: null })), "vacancy");
    expect(v.verdict).toBe("unchecked");
    expect(v.decidedBy ?? null).toBeNull();
    expect(v.unchecked).toBe(VACANCY_ECONOMIC_ONLY);
    expect(v.impact).toBeNull();
  });

  it("says 'against' for the one figure the verdict is struck on and 'beside it, not deciding' for the rest", () => {
    // The 10-year is a yield, never compared; the lender tests and the
    // negative-leverage read carry no figure.
    expect(rowOf(test, "exit_cap").method).toBe("The OM's exit cap against the OM's going-in cap (the offering memorandum), the one figure that decides; beside it, not deciding: 10-year Treasury (FRED).");
    // The index plus the spread decides; the bare index beside it.
    expect(rowOf(test, "debt").method).toBe(
      "The OM's debt against the class's screening spread over it, a rule of thumb (a screening default), the one figure that decides; beside it, not deciding: the index the model prices off: 5-yr Treasury (FRED), 10-year Treasury, as the market check read it (FRED), lender tests at screening defaults, the binding one named (a rule of thumb) and negative leverage: the model's going-in cap against the loan's rate (the model's own figures).",
    );
    // The T-12 decides, the OM's own in-place figure beside it; "NOI" keeps its letters.
    expect(rowOf(test, "noi").method).toBe("The OM's NOI against the deal's T-12 NOI, the one figure that decides; beside it, not deciding: the OM's in-place NOI against its pro forma (the offering memorandum).");
    // Every row a figure decided names it on the row; an unchecked row none.
    for (const r of test.rows) {
      if (r.verdict === "unchecked") expect(r.decidedBy ?? null, r.key).toBeNull();
      else expect(r.evidence[r.decidedBy!]?.value, r.key).not.toBeNull();
    }
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

  it("never reads holds where its own re-run lowers the levered IRR 100 bps or more", async () => {
    // The sample's NOI is 4.7% over its T-12, inside the 5% band, yet the
    // re-run moves the levered IRR well over 100 bps (its figures the
    // engine's own, read off the row, never typed).
    const { sampleStressTest } = await import("@/lib/sample-cover");
    const n = rowOf(sampleStressTest("2026-10-19"), "noi");
    expect(IRR_MOVE_STRETCH_BPS).toBe(100);
    expect(n.verdict).toBe("stretched");
    const [from, to] = [n.impact!.baseIrrPct!, n.impact!.altIrrPct!].map((x) => x.toFixed(1).replace(".", "\\."));
    expect(n.gap!.text).toMatch(
      new RegExp(`^The OM's \\$3\\.88M is 4\\.7% \\(\\$174k\\) over the deal's T-12's \\$3\\.71M\\. The gap is within 5% of the T-12, but the return moves \\d+ bps on it \\(levered IRR ${from}% to ${to}%\\)\\.$`),
    );
  });

  it("says a verdict struck on a rule of thumb alone is one, and the vacancy's turns on the best kind present", () => {
    // No document and no published figure: the class's default alone.
    const v = rowOf(buildStressTest(apartmentArgs({ actuals: null, modelVsMarket: null })), "vacancy");
    expect(v.evidence.map((e) => e.kind)).toEqual(["rule_of_thumb"]);
    expect(v.ruleOfThumbOnly).toBe(true);
    expect(v.gap!.text.endsWith(" Against a rule of thumb only.")).toBe(true);
    // With the T-12 on file, the deal's own document decides.
    expect(rowOf(test, "vacancy").ruleOfThumbOnly).toBeUndefined();
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
    // Rent growth: the model's 3.0% is neither the OM's 4.0% nor Zillow's
    // apartment asking rents' 1.1%, so the note names it.
    const g = rowOf(t, "rent_growth");
    expect(g.impact!.baseIrrPct).toBeCloseTo(irrAt({ rentGrowthPct: 0.04 }), 6);
    expect(g.impact!.altIrrPct).toBeCloseTo(irrAt({ rentGrowthPct: 0.011 }), 6);
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
    // Whether the sale resets the assessment is the jurisdiction's: the
    // reset bill is a conditional re-strike of the OM's own figures, so 28.6%
    // under it reads stretched at most, and every sentence says the condition;
    // the sentence says its share over the OM's own line, 40.0%.
    expect(t.verdict).toBe("stretched");
    expect(t.gap!.text).toBe("If the sale resets the assessment to the price, the bill is $532k, $152k (40.0%) over the OM's $380k line — whether it does is the jurisdiction's to say.");
    expect(t.impact!.input).toBe("expenseLines");
    expect(t.impact!.altIrrPct!).toBeLessThan(t.impact!.baseIrrPct!);
    expect(t.impact!.note).toMatch(/^If the tax line is the \$532k bill if the sale resets the assessment to the price, not the OM's \$380k, the levered IRR moves from/);
    const i = rowOf(test, "insurance");
    expect(i.omSays.value).toBe(120_000);
    // The OM's $120k pro forma premium sits $30k under the seller's own
    // $150k T-12 premium: the OM against its own building's history (the
    // review of 2026-10-21). The T-12's premium decides — the floor a new
    // owner can expect, never a quote — so the row reads stretched at most.
    expect(i.evidence[0]).toMatchObject({ kind: "document", label: "The deal's T-12 insurance line", value: 150_000 });
    expect(i.evidence[0].text).toMatch(/; the seller's own premium, a working floor and a rule of thumb \(a new owner is rarely quoted under it\), not a quote$/);
    expect(i.decidedBy).toBe(0);
    expect(i.evidence[1]).toMatchObject({ kind: "published", scope: "nation", publisher: "BLS via FRED", value: null });
    // The index's figure is the OM's own premium moved by it, labelled so —
    // never set out as a premium of its own, and carrying no figure any
    // surface could hold the OM's to.
    expect(i.evidence[1].label).toBe("The OM's $120k moved by the national premium index (PPI, commercial multiple peril)");
    expect(i.evidence[1].text).toMatch(/^\$\d+k \(the index [+-−]?\d+\.\d% over the year to .+\); the national move applied to the OM's own figure, not a test of this premium$/);
    expect(i.verdict).toBe("stretched");
    expect(i.gap).toEqual({
      value: 30_000,
      unit: "usd",
      text: "The OM's $120k premium is $30k (20.0%) under the $150k the seller paid over the T-12: the OM against its own building's history. A new owner's quote is what finally decides the premium, and none is on file, so the T-12's is a working floor and a rule of thumb (a new owner is rarely quoted under it), not a quote, and the row reads stretched at most.",
    });
    expect(i.method).toBe(
      "The OM's insurance against the deal's T-12 insurance line, the one figure that decides; beside it, not deciding: the OM's $120k moved by the national premium index (PPI, commercial multiple peril) (BLS via FRED).",
    );
    // The re-run swaps the premium in the model's one expense line, which is
    // the T-12's load and already carries the T-12's $150k: the OM's run
    // carries $120k in its place, the evidence's the model's own line.
    expect(i.impact!.input).toBe("expenseLines");
    expect(Math.round(i.impact!.omValue)).toBe(1_720_000);
    expect(Math.round(i.impact!.altValue)).toBe(1_750_000);
    expect(i.impact!.altIrrPct!).toBeLessThan(i.impact!.baseIrrPct!);
    expect(i.impact!.note).toMatch(/^If the insurance line is the seller's \$150k T-12 premium, a working floor and a rule of thumb, not a quote, not the OM's \$120k, the levered IRR moves from .*\. The model itself already runs at it\.$/);
    expect(i.noRerun ?? null).toBeNull();
    // In the headline it is a player, marked as the floor it is, and the NOI
    // is left out for it (`HEADLINE_NOI_LEFT_OUT`).
    expect(test.headline!.omKeys).toContain("insurance");
    const part = test.headline!.parts.find((p) => p.key === "insurance")!;
    expect(part.conditional).toBe(INSURANCE_FLOOR_CONDITION);
    expect(part.pts).toBeLessThan(0);
    expect(test.headline!.omitted.find((o) => o.key === "noi")?.why).toBe(HEADLINE_NOI_LEFT_OUT);
    expect(test.rows.filter((r) => r.verdict === "unchecked").every((r) => r.impact == null)).toBe(true);
  });

  it("leaves a premium at or over the seller's own T-12 premium unchecked: history cannot say a new owner pays less", () => {
    for (const premium of ["$150,000", "$148,000", "$180,000"]) {
      const ex: ExtractionResult = { ...APARTMENT, metrics: APARTMENT.metrics.map((m) => (m.label === "Insurance" ? { ...m, value: premium } : m)) };
      const t = buildStressTest(apartmentArgs({ extraction: ex }));
      const i = rowOf(t, "insurance");
      // $148k is within SAME_SHARE (2%) of $150k: at it.
      expect(i.verdict, premium).toBe("unchecked");
      expect(i.unchecked).toBe(INSURANCE_AT_HISTORY);
      expect(i.evidence[0].text).toMatch(/; the seller's history, not a test of a new owner's quote$/);
      expect(i.method).toBe(
        "The OM's insurance beside the deal's T-12 insurance line and the OM's " +
          compactUsd(Number(premium.replace(/\D/g, "")), { millions: 2, trim: true }) +
          " moved by the national premium index (PPI, commercial multiple peril) (BLS via FRED): no figure decides it.",
      );
      // An unchecked row re-runs nothing (the walkthrough of 2026-10-20: a
      // re-run at the seller's own premium printed a move no evidence makes),
      // and it is in neither case.
      expect(i.impact).toBeNull();
      expect(i.noRerun).toBe(INSURANCE_NO_RERUN);
      expect(i.noRerunShort).toBe("no re-run: nothing tests the premium");
      expect(noMoveWhy(t, i)).toBe(INSURANCE_NO_RERUN);
      expect(t.headline!.omKeys).not.toContain("insurance");
    }
    // Just past the margin, the T-12 decides.
    const under: ExtractionResult = { ...APARTMENT, metrics: APARTMENT.metrics.map((m) => (m.label === "Insurance" ? { ...m, value: "$146,000" } : m)) };
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: under })), "insurance").verdict).toBe("stretched");
    // On a building the plan has yet to deliver the T-12 insures another
    // building, and decides nothing.
    const dev: ExtractionResult = { ...APARTMENT, strategy: { kind: "development", summary: "", capitalBudget: "", timeline: "" } };
    const d = rowOf(buildStressTest(apartmentArgs({ extraction: dev })), "insurance");
    expect(d.verdict).toBe("unchecked");
    expect(d.unchecked).toBe(INSURANCE_NOT_DELIVERED);
  });

  it("re-runs no insurance line without a T-12: the index only moves the OM's own premium", () => {
    const derived = deriveUnderwriteInputs(APARTMENT, "x", undefined, { debtIndex: FIVE });
    const t = buildStressTest(apartmentArgs({ derived, actuals: null, modelVsMarket: readFor(derived) }));
    const i = rowOf(t, "insurance");
    expect(i.verdict).toBe("unchecked");
    expect(i.unchecked).toBe(INSURANCE_NO_QUOTE);
    expect(i.noRerun).toBe(INSURANCE_NO_RERUN_NO_T12);
    expect(i.evidence.map((e) => [e.kind, e.value])).toEqual([["published", null]]);
    expect(i.impact).toBeNull();
    expect(t.headline!.omKeys).not.toContain("insurance");
  });

  it("swaps a line the T-12's expense load already carries, never adding the gap on top of it (audit H3)", () => {
    // The model's one expense line is the T-12's $1.75M total, which already
    // holds the T-12's $150k insurance and $380k taxes.
    const d = apartmentArgs().derived!;
    expect(d.sources.expenseLines?.doc).toBe("T-12");
    const total = d.inputs.expenseLines.reduce((s, l) => s + l.annual, 0);
    expect(Math.round(total)).toBe(1_750_000);
    const irrAt = (line: number) =>
      computeUnderwrite({ ...d.inputs, expenseLines: d.inputs.expenseLines.map((l, k) => (k === 0 ? { ...l, annual: l.annual + (line - total) } : l)) }).returns.leveredIrrPct! * 100;
    // The reset tax bill, against the T-12's $380k tax line (the OM's own
    // figure here): the OM's run is the model's line, the evidence's the line
    // less the T-12's $380k plus the $532k reset.
    const t = rowOf(test, "taxes").impact!;
    expect(Math.round(t.omValue)).toBe(1_750_000);
    expect(Math.round(t.altValue)).toBe(1_902_000);
    expect(t.baseIrrPct!).toBeCloseTo(irrAt(1_750_000), 9);
    expect(t.altIrrPct!).toBeCloseTo(irrAt(1_902_000), 9);
    // Where the T-12's tax line differs from the OM's bill, the OM's run
    // carries the OM's bill in its place, and the note says what the model runs.
    const t12Lower = { ...T12, opex: T12.opex.map((l) => (l.key === "taxes" ? { ...l, amount: 350_000 } : l)) };
    const lowered = summarizeT12({ periodEndDate: "2026-06-30", collectedRent: 4_400_000, vacancyLoss: -400_400, otherIncome: 100_000, egi: 4_099_600, opex: t12Lower.opex, totalOpex: null, noi: null, page: "p. 2" });
    const actualsIn = { t12: { summary: lowered, periodEnd: "2026-06-30" } };
    const derived = deriveUnderwriteInputs(APARTMENT, "The Maddox", actualsIn, { debtIndex: FIVE });
    const actuals = readActuals({ metrics: APARTMENT.metrics, strategy: inferStrategy(APARTMENT), rentRoll: null, t12: actualsIn.t12, assetClass: "multifamily" });
    const tt = rowOf(buildStressTest(apartmentArgs({ derived, actuals, modelVsMarket: readFor(derived) })), "taxes").impact!;
    const lineNow = derived.inputs.expenseLines.reduce((s, l) => s + l.annual, 0);
    expect(Math.round(tt.omValue)).toBe(Math.round(lineNow - 350_000 + 380_000));
    expect(Math.round(tt.altValue)).toBe(Math.round(lineNow - 350_000 + 532_000));
    expect(tt.note).toContain(`The model itself runs its one expense line at the T-12's ${compactUsd(lineNow, { millions: 2, trim: true })} total, with the T-12's $350k tax line in it.`);
    expect(tt.caveat).toBeUndefined();
  });

  it("says under the bars what a re-run on a T-12 load with no such line assumes: the line carries the OM's figure (audit of PR #486)", () => {
    const noTax = summarizeT12({ periodEndDate: "2026-06-30", collectedRent: 4_400_000, vacancyLoss: -400_400, otherIncome: 100_000, egi: 4_099_600, opex: T12.opex.filter((l) => l.key !== "taxes"), totalOpex: null, noi: null, page: "p. 2" });
    const actualsIn = { t12: { summary: noTax, periodEnd: "2026-06-30" } };
    const derived = deriveUnderwriteInputs(APARTMENT, "The Maddox", actualsIn, { debtIndex: FIVE });
    const actuals = readActuals({ metrics: APARTMENT.metrics, strategy: inferStrategy(APARTMENT), rentRoll: null, t12: actualsIn.t12, assetClass: "multifamily" });
    const built = buildStressTest(apartmentArgs({ derived, actuals, modelVsMarket: readFor(derived) }));
    const tax = rowOf(built, "taxes").impact!;
    expect(tax.caveat).toMatch(/^The model's expense line is the T-12's expense load, which breaks out no tax line, so it is read as carrying the OM's figure and the evidence's run moves it by the gap\.$/);
    // The note keeps it whole for the report; the panel prints the caveat
    // alone, muted under the bars, where the note is not printed.
    expect(tax.note.endsWith(tax.caveat!)).toBe(true);
    const html = renderToStaticMarkup(createElement(StressTestPanel, { test: built }));
    const row = html.slice(html.indexOf('data-qa="stress-row-taxes"') + 1);
    expect(row.slice(0, row.indexOf('data-qa="stress-row-'))).toContain(`data-qa="stress-impact-caveat">${tax.caveat!.replace(/'/g, "&#x27;")}</p>`);
  });

  it("sets the exit cap against the going-in cap, the rent growth against the trailing year and the debt against the seeded rate", () => {
    const x = rowOf(test, "exit_cap");
    expect(x.omSays).toEqual({ text: "Exit cap rate: 5.50%", value: 5.5, page: 21 });
    expect(x.evidence[0]).toMatchObject({ kind: "om_internal", label: "The OM's going-in cap", value: 5.71 });
    // A yield, not a cap: it carries no figure for the cap's track, and the
    // spread is said in its words.
    expect(x.evidence[1]).toMatchObject({ kind: "published", label: "10-year Treasury", value: null, scope: "nation" });
    expect(x.evidence[1].text).toContain("the exit's spread over it is 56 bps");
    expect(x.gap).toEqual({ value: 21, unit: "bps", text: "The OM's 5.50% exit is 21 bps tighter than its 5.71% going-in cap — cap compression." });
    expect(x.verdict).toBe("stretched");
    expect(x.impact!.input).toBe("exitCapPct");
    expect(x.impact!.altValue).toBeCloseTo(0.0571, 6);

    const g = rowOf(test, "rent_growth");
    expect(g.omSays.value).toBe(4);
    // The apartment asking rent decides, printed first; the rest beside it.
    expect(g.evidence.map((e) => e.label)).toEqual(["Asking rent, apartments", "Asking rent, all home types", "Rent paid by sitting tenants (CPI rent)"]);
    expect(g.evidence.every((e) => e.kind === "published" && e.scope === "metro")).toBe(true);
    // Never the highest figure (the sitting tenants' +5.0%): the OM's 4.0%
    // is 2.9 points over the apartments' +1.1%, past the 2-point threshold.
    expect(g.gap).toEqual({
      value: 2.9,
      unit: "pts",
      text: `Held to Zillow's apartment asking rents, the figure for this kind of rent: +1.1% over the year to Aug 2026 (Zillow Research), a single year's change. The OM's 4.0%/yr is 2.9 points over it. ${TRAILING_YEAR_NOT_FORECAST}`,
    });
    // The trailing year is said as one in the re-run's own words, never as a
    // rate a year the publisher states, and the memo's cell says it too.
    expect(g.impact!.note).toMatch(/^If rent growth is Zillow Research's \+1\.1% over the year to Aug 2026, run each year of the hold, not the OM's 4\.0%\/yr, the levered IRR moves from /);
    expect(g.impact!.note).not.toContain("1.1%/yr");
    expect(rowWords(g).against).toBe("+1.1% over the year to Aug 2026 (Zillow Research)");
    expect(STRESS_METHODS.find((m) => m.key === "rent_growth")!.limits).toContain(TRAILING_YEAR_NOT_FORECAST);
    expect(g.verdict).toBe("unsupported");
    expect(g.method).toBe("The OM's rent growth against asking rent, apartments (Zillow Research), the one figure that decides; beside it, not deciding: asking rent, all home types (Zillow Research) and rent paid by sitting tenants (CPI rent) (BLS).");
    expect(g.impact!.input).toBe("rentGrowthPct");
    expect(g.impact!.evidenceIndex).toBe(0);
    expect(g.impact!.altIrrPct!).toBeLessThan(g.impact!.baseIrrPct!);

    const e = rowOf(test, "expense_growth");
    expect(e.omSays.value).toBe(2.5);
    expect(e.evidence[0].label).toBe("Consumer prices (CPI, all items)");
    expect(e.evidence.every((x) => x.scope === "nation")).toBe(true);
    // All-items CPI decides (the broad price level the expense base moves
    // with): 2.5% is 0.9 points under its +3.4%, stretched — core's +2.4%,
    // which the lower index had let it hold against, is beside it, deciding
    // nothing (the owner's rule of 2026-10-20).
    expect(e.decidedBy).toBe(0);
    expect(e.evidence[1].label).toBe("Core CPI");
    expect(e.gap).toEqual({
      value: 0.9,
      unit: "pts",
      text: "Held to consumer prices, all items (the CPI), the broad price level the expense base moves with: +3.4% over the year to Aug 2026 (BLS via FRED), a single year's change. The OM's 2.5%/yr is 0.9 points under it. A trailing year is what the assumption is asked to beat, not a forecast.",
    });
    expect(e.impact!.note).toMatch(/^If expense growth is \+3\.4% over the year to Aug 2026 \(BLS via FRED\), run each year of the hold, not the OM's 2\.5%\/yr, /);
    expect(e.verdict).toBe("stretched");
    expect(e.method).toMatch(/^The OM's expense growth against consumer prices \(CPI, all items\) \(BLS via FRED\), the one figure that decides; beside it, not deciding: core CPI \(BLS via FRED\)/);
    expect(e.impact!.input).toBe("expenseGrowthPct");
    expect(e.impact!.altValue).toBeCloseTo(e.evidence[0].value! / 100, 9);

    const d = rowOf(test, "debt");
    expect(d.omSays).toEqual({ text: "Interest rate: 5.25%", value: 5.25, page: 30 });
    // The index is the fact, dated by its own day (read back off the seed's
    // note, lib/debt-index's `debtRateNote`); the spread is a rule of thumb.
    expect(d.evidence[0]).toEqual({
      kind: "published",
      label: "The index the model prices off: 5-yr Treasury",
      // Which tenor, said: the OM states no loan term, so the hold's.
      text: "4.78% (FRED, Sep 17, 2026), the tenor nearest the model's 5-year hold, since the OM states no loan term",
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
      "Negative leverage: the model's going-in cap against the loan's rate",
    ]);
    // The 10-year dated as the other published lines are, never a raw ISO day.
    expect(d.evidence[2].text).toBe("4.94% (FRED, Sep 17, 2026)");
    // The model's own arithmetic, never "the OM against itself", said as
    // what it is: a cap under the rate lowers the year-one cash yield.
    expect(d.evidence[4]).toMatchObject({ kind: "rule_of_thumb", publisher: "the model's own figures" });
    expect(d.evidence[4].text).toMatch(/^The model's year-1 NOI over its price is \d\.\d\d%, \d+ bps (under the OM's 5\.25% rate: negative leverage — the cap is under the loan's rate, so each borrowed dollar lowers the year-one cash yield|over the OM's 5\.25% rate: positive leverage — each borrowed dollar raises the year-one cash yield)$/);
    expect(d.evidence[4].text).not.toContain("loses money");
    expect(d.gap).toEqual({ value: 153, unit: "bps", text: "The OM's 5.25% is 153 bps under the index plus the class's spread, 6.78%. Against a rule of thumb only." });
    expect(d.ruleOfThumbOnly).toBe(true);
    // 153 bps under the index plus a default spread, but over the bare
    // 4.78% index: stretched, never unsupported on a rule of thumb.
    expect(d.verdict).toBe("stretched");
    expect(d.impact!.input).toBe("allInRatePct");
    expect(d.impact!.evidenceIndex).toBe(1);
  });

  it("names the OM's own leverage beside the lender tests' screening defaults, by its own measure, and runs nothing on it", () => {
    // The walkthrough: the row quoted the sizer's 65% LTV while the OM
    // states its own loan-to-value, which the row named nowhere.
    const lender = (rows: { label: string; value: string; page: string }[]) => {
      const ex = { ...APARTMENT, metrics: [...APARTMENT.metrics, ...rows.map((r) => row(r.label, r.value, r.page))] };
      return rowOf(buildStressTest(apartmentArgs({ extraction: ex })), "debt");
    };
    const plain = rowOf(test, "debt");
    const textOf = (d: typeof plain) => d.evidence.find((e) => e.label.startsWith("Lender tests"))!.text;
    // The model's loan said by its own measure, a share of cost.
    expect(textOf(plain)).toMatch(/; the model's loan, 60% of cost, is \$[\d.]+M — 65% LTV, 1\.25x and 8% debt yield are screening defaults$/);
    const ltv = lender([{ label: "Loan-to-value", value: "60%", page: "p. 44" }]);
    expect(textOf(ltv)).toMatch(/are screening defaults, beside the OM's own 60% loan-to-value \(p\. 44\)$/);
    // A loan-to-cost is a loan-to-cost, never a loan-to-value.
    const ltc = lender([{ label: "Loan-to-cost", value: "70%", page: "p. 31" }]);
    expect(textOf(ltc)).toMatch(/beside the OM's own 70% loan-to-cost \(p\. 31\)$/);
    expect(textOf(ltc)).not.toContain("70% loan-to-value");
    // Both stated: the value measure, the one the defaults' 65% LTV is.
    expect(textOf(lender([{ label: "LTC", value: "70%", page: "p. 31" }, { label: "LTV", value: "62.5%", page: "p. 32" }]))).toMatch(/the OM's own 62\.5% loan-to-value \(p\. 32\)$/);
    // An assumable loan's or an exit's leverage is not the OM's financing.
    expect(textOf(lender([{ label: "Assumable loan LTV", value: "48%", page: "p. 33" }]))).not.toContain("the OM's own");
    // Words only: the row's figure, gap, verdict and re-run are as before.
    for (const d of [ltv, ltc]) {
      expect(d.omSays).toEqual(plain.omSays);
      expect(d.gap).toEqual(plain.gap);
      expect(d.verdict).toBe(plain.verdict);
      expect(d.impact).toEqual(plain.impact);
    }
  });

  it("reads the index off the DebtIndex where one is handed in, the same as off the note, and reads a rate under the bare index unsupported", () => {
    const given = rowOf(buildStressTest(apartmentArgs({ indexGiven: FIVE })), "debt");
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
    // No comp with a figure, and no price band: the band any market
    // delivers in is a misread guard, never pricing evidence.
    expect(b.evidence).toEqual([]);
    expect(b.verdict).toBe("unchecked");
    expect(b.impact).toBeNull();
  });

  it("omits a row with nothing stated and nothing found, and no impact is withheld", () => {
    // The operating expenses stand unchecked beside the T-12: the OM states
    // no total and no ratio.
    // The market rent stands unchecked beside the OM's pro forma rent: no
    // lease comps are on file.
    expect(test.rows.map((r) => r.key)).toEqual(["basis", "exit_cap", "debt", "noi", "vacancy", "rent_growth", "market_rent", "expense_growth", "taxes", "insurance", "opex"]);
    expect(test.impactsWithheld).toBeNull();
    expect(test.readOn).toBe(READ_ON);
    // Its published evidence is today's read; with none handed in, the
    // stored market check's figures are the screen's, never today's.
    expect(test.publishedRead).toBe(true);
    expect(buildStressTest(apartmentArgs({ modelVsMarket: null })).publishedRead).toBe(false);
    // With no model, the caller's own reason leads (a surface that carries
    // none by design), else the default.
    expect(buildStressTest(apartmentArgs({ derived: null })).impactsWithheld).toBe("No model was derived for this deal, so no return is re-run.");
    expect(buildStressTest(apartmentArgs({ derived: null, withheldReason: SHARE_NO_MODEL })).impactsWithheld).toBe(SHARE_NO_MODEL);
    // A reason never stands in for a model that was handed in.
    expect(buildStressTest(apartmentArgs({ withheldReason: SHARE_NO_MODEL })).impactsWithheld).toBeNull();
  });

  it("re-runs the engine with exactly ONE input changed, the one the impact names", () => {
    const args = apartmentArgs();
    const baseInputs = args.derived!.inputs;
    spy.mockClear();
    const t = buildStressTest(args);
    expect(t.rows.some((r) => r.impact)).toBe(true);
    // The headline is struck last, on the finished rows, and runs the two
    // cases (every figure at once) and the split's mixes: its runs are the
    // last ones, counted by running it alone, and the rows' are the rest.
    const all = (spy.mock.calls as [UnderwriteInputs][]).map(([i]) => i);
    spy.mockClear();
    stressHeadline(t.rows, baseInputs);
    const headlineRuns = spy.mock.calls.length;
    expect(headlineRuns).toBeGreaterThan(0);
    // Every run a row made is on the model's own inputs or on a copy with
    // one key swapped — never two: the base run carries the OM's figure in
    // that key and the alternative the evidence's, so the two differ in it
    // alone, and in nothing else from the model.
    const swapped = all.slice(0, all.length - headlineRuns).filter((i) => i !== baseInputs);
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

// ── A stabilized vacancy assumption ──────────────────────────────────────

describe("a stabilized vacancy assumption on a deal read as stabilized", () => {
  /** The Maddox with a stated stabilized vacancy rate beside its occupancy
   *  today: a rate stated on its own counts doors (`measureOf`). */
  const withVacancy = (pct: string, kind: "stabilized" | "value_add" = "stabilized", label = "Stabilized vacancy"): ExtractionResult => ({
    ...APARTMENT,
    strategy: { kind, summary: "", capitalBudget: kind === "value_add" ? "$1,800,000" : "", timeline: "" },
    metrics: [...APARTMENT.metrics, row(label, pct, "p. 21")],
  });
  const argsFor = (ex: ExtractionResult, overrides: Partial<StressTestArgs> = {}, opts: { roll?: boolean } = {}): StressTestArgs => {
    const plan = ex.strategy?.kind !== "stabilized";
    const actualsIn = { t12: { summary: T12, periodEnd: "2026-06-30" } };
    const derived = deriveUnderwriteInputs(ex, "The Maddox", actualsIn, { debtIndex: FIVE });
    const actuals = readActuals({ metrics: ex.metrics, strategy: inferStrategy(ex), rentRoll: opts.roll ? ROLL : null, t12: actualsIn.t12, assetClass: "multifamily" });
    return { ...apartmentArgs({ extraction: ex, derived, actuals, modelVsMarket: readFor(derived, { plan }) }), ...overrides };
  };
  /** What the gap says of the T-12 beside a figure counted by doors. */
  const T12_BESIDE =
    " The deal's T-12 ran 9.1% economic vacancy over its trailing year, its vacancy and credit loss over gross potential rent — dollars, not doors — so it is shown beside the OM's figure, which counts doors, and never decides it.";

  it("holds it to the metro's survey inside its margin, the rent roll beside it as today's gap and the T-12's dollars beside it as dollars", () => {
    const v = rowOf(buildStressTest(argsFor(withVacancy("6.0%"), {}, { roll: true })), "vacancy");
    expect(v.title).toBe("Stabilized vacancy");
    expect(v.omSays).toEqual({ text: "Stabilized vacancy: 6.0%", value: 6, page: 21 });
    // The figure that decides first; the region's, the documents' and the
    // class's norm beside it.
    expect(v.evidence.map((e) => [e.kind, e.label])).toEqual([
      ["published", "Rental vacancy, metro area"],
      ["published", "Rental vacancy, South Census region"],
      ["document", "The deal's rent roll: the occupancy it runs at"],
      ["document", "The deal's T-12 economic vacancy (vacancy and credit loss over gross potential rent)"],
      ["rule_of_thumb", "Multifamily vacancy, a rule of thumb"],
    ]);
    // The rent roll counts doors, as the OM's figure does: today's gap. The
    // T-12 counts dollars: said so, never a gap to close.
    expect(v.evidence[2].text).toBe("9.2% vacant (by count, 139 of 153 units occupied, as of Jul 1, 2026); today's, 3.2 points over the stabilized assumption — the gap a lease-up has to close");
    expect(v.evidence[3].text).toBe(
      "9.1% economic ($400k of $4.4M gross potential rent: the rent line, which the stated EGI nets the vacancy from; TTM to Jun 30, 2026); dollars, not doors: shown beside the OM's figure, which counts doors, and never deciding it",
    );
    // 6.0% against 6.2% ±2.2: inside the margin, so it holds.
    expect(v.gap).toEqual({
      value: 0.2,
      unit: "pts",
      text: `The OM's 6.0% is a stabilized assumption, so it is held to the market's published figure: rental vacancy, metro area (Census Bureau), 6.2% ±2.2 pts. The OM is 0.2 points under it, inside its margin. Today the deal's rent roll runs 9.2% vacant, 3.2 points over the assumption — the gap a lease-up has to close. ${leaseUpNotModelled(9.2, 6)}${T12_BESIDE}`,
    });
    // The lease-up note rides only past the row's own threshold, and only on
    // the rent roll's doors: 3.2 points over.
    expect(v.gap!.text).toContain(leaseUpNotModelled(9.2, 6));
    expect(STRESS_METHODS.find((m) => m.key === "vacancy")!.limits.join(" ")).toContain(`more than ${VACANCY_UNSUPPORTED_PTS} points over the assumption`);
    expect(v.verdict).toBe("holds");
    expect(v.method).toBe(
      "The OM's stabilized vacancy against rental vacancy, metro area (Census Bureau), the one figure that decides; beside it, not deciding: rental vacancy, South Census region (Census Bureau via FRED), the deal's rent roll: the occupancy it runs at, the deal's T-12 economic vacancy (vacancy and credit loss over gross potential rent) and multifamily vacancy, a rule of thumb.",
    );
    // The engine is re-run at the figure that decided.
    expect(v.impact!.evidenceIndex).toBe(0);
    expect(v.impact!.altValue).toBeCloseTo(0.062, 6);
    expect(v.impact!.note).toMatch(/^If vacancy is Census Bureau's 6\.2%, not the OM's 6\.0%/);
    // With the T-12 alone beside it, no lease-up is read off its dollars.
    const t12Only = rowOf(buildStressTest(argsFor(withVacancy("6.0%"))), "vacancy");
    expect(t12Only.gap!.text).toBe(`The OM's 6.0% is a stabilized assumption, so it is held to the market's published figure: rental vacancy, metro area (Census Bureau), 6.2% ±2.2 pts. The OM is 0.2 points under it, inside its margin.${T12_BESIDE}`);
  });

  it("reads past the survey's margin stretched, and a building already at or under the assumption as support", () => {
    const tight = rowOf(buildStressTest(argsFor(withVacancy("3.0%"))), "vacancy");
    // 3.0% against 6.2% ±2.2: 3.2 points under, 1.0 past the margin.
    expect(tight.gap).toMatchObject({ value: 3.2, unit: "pts" });
    expect(tight.gap!.text).toContain("The OM is 3.2 points under it, 1.0 point past its margin.");
    expect(tight.verdict).toBe("stretched");
    const loose = rowOf(buildStressTest(argsFor(withVacancy("9.5%"), {}, { roll: true })), "vacancy");
    expect(loose.verdict).toBe("holds");
    expect(loose.gap!.text).toContain("The OM is 3.3 points over it — the conservative side. Today the deal's rent roll runs 9.2% vacant, 0.3 points under the assumption — support for it.");
    expect(loose.evidence.find((e) => e.publisher === "the deal's rent roll")!.text).toMatch(/; today's, 0\.3 points under the stabilized assumption — support for it$/);
  });

  it("with no fresh published figure, the class's norm decides, never today's rent roll, which stays beside it as the lease-up gap; the T-12's dollars never decide either", () => {
    // The investor's review of 2026-10-23: the rent roll had decided the
    // stabilized 6.0% "unsupported" whenever the market read failed, against
    // "holds" whenever it answered — one assumption, two verdicts on a feed.
    const v = rowOf(buildStressTest(argsFor(withVacancy("6.0%"), { modelVsMarket: null }, { roll: true })), "vacancy");
    expect(v.evidence.map((e) => e.kind)).toEqual(["rule_of_thumb", "document", "document"]);
    expect(v.evidence[1].publisher).toBe("the deal's rent roll");
    expect(v.evidence[1].text).toMatch(/; today's, 3\.2 points over the stabilized assumption — the gap a lease-up has to close$/);
    expect(v.gap!.text).toBe(
      `The OM's 6.0% is 1.0 point over the evidence's 5.0% — the conservative side. No fresh published vacancy figure for this market could be held to the stabilized assumption, so the class's norm decides; ${ROLL_NOT_STABILIZED}: today the deal's rent roll runs 9.2% vacant, 3.2 points over the assumption — the gap a lease-up has to close. ${leaseUpNotModelled(9.2, 6)}${T12_BESIDE} Against a rule of thumb only.`,
    );
    expect(v.verdict).toBe("holds");
    expect(v.ruleOfThumbOnly).toBe(true);
    expect(v.impact!.altValue).toBeCloseTo(0.05, 6);
    // With no market figure and no class norm (land states none), nothing can
    // decide: the row stands unchecked and says why, never on the rent roll.
    expect(VACANCY_ORDER.stabilized.map((s) => s.name)).not.toContain("the deal's rent roll");
    expect(STABILIZED_VACANCY_UNCHECKED).toContain("never the test of a stabilized figure");
    // With no rent roll either, the class's norm decides — never the T-12,
    // whose 9.1% carries credit loss the OM's 6.0% does not count.
    const bare = rowOf(buildStressTest(argsFor(withVacancy("6.0%"), { modelVsMarket: null })), "vacancy");
    expect(bare.evidence.map((e) => e.kind)).toEqual(["rule_of_thumb", "document"]);
    expect(bare.ruleOfThumbOnly).toBe(true);
    expect(bare.gap!.text).toBe(
      `The OM's 6.0% is 1.0 point over the evidence's 5.0% — the conservative side. No fresh published vacancy figure for this market could be held to the stabilized assumption, so the class's norm decides.${T12_BESIDE} Against a rule of thumb only.`,
    );
  });

  it("reads a pro forma's vacancy line as dollars, held to the T-12 on the same footing, whether or not the market read answers (the review of 2026-10-23)", () => {
    // "Vacancy (pro forma)" is the pro forma's deduction from gross potential
    // rent: dollars, not doors. The T-12 decides it, and the verdict does not
    // move with the market read.
    const pf = withVacancy("6.0%", "stabilized", "Vacancy (pro forma)");
    expect(measureOf("Vacancy (pro forma)")).toBe("economic");
    expect(measureOf("Underwritten vacancy")).toBe("economic");
    expect(measureOf("Vacancy & credit loss")).toBe("economic");
    expect(measureOf("Vacancy loss")).toBe("economic");
    expect(measureOf("Stabilized vacancy")).toBe("physical");
    expect(measureOf("Vacancy")).toBe("physical");
    expect(measureOf("Pro forma vacant units")).toBe("physical");
    expect(measureOf("Physical vacancy (pro forma)")).toBe("physical");
    const withRead = rowOf(buildStressTest(argsFor(pf, {}, { roll: true })), "vacancy");
    const without = rowOf(buildStressTest(argsFor(pf, { modelVsMarket: null }, { roll: true })), "vacancy");
    for (const v of [withRead, without]) {
      expect(v.measure).toBe("economic");
      expect(v.evidence[0]).toMatchObject({ kind: "document", publisher: "the deal's T-12", value: 9.1 });
      expect(v.verdict).toBe("unsupported");
      expect(v.gap!.text).toContain(
        "The OM's figure is its pro forma's vacancy line, a deduction from gross potential rent: dollars, not doors, so it is held to the deal's T-12, the same measure on the same footing: on a deal read as stabilized, a trailing year of what the building collected, not one day's count of doors.",
      );
      // The rent roll's doors stand beside it, never deciding.
      expect(v.evidence.find((e) => e.publisher === "the deal's rent roll")!.text).toMatch(/doors, not dollars: shown beside the OM's economic figure and never deciding it$/);
    }
    expect(withRead.gap!.text).toBe(without.gap!.text);
    // The track record scores it by a later T-12, its own measure.
    expect(vacancyEconomicStated(pf)).toBe(true);
    expect(stabilizedVacancyStated(pf)).toBe(false);
  });

  it("on a plan deal the market decides a stated stabilized vacancy too, the documents beside it as the gap the plan closes (the walkthrough of 2026-10-20)", () => {
    // The T-12 had decided a plan's stabilized 6.0% (unsupported) while the
    // same row said today's vacancy is not evidence of the stabilized figure.
    const v = rowOf(buildStressTest(argsFor(withVacancy("6.0%", "value_add"), {}, { roll: true })), "vacancy");
    expect(v.evidence[0]).toMatchObject({ kind: "published", label: METRO_VACANCY_LABEL });
    expect(v.decidedBy).toBe(0);
    const roll = v.evidence.find((e) => e.publisher === "the deal's rent roll")!;
    expect(roll.text).toMatch(/; today's, 3\.2 points over the stabilized assumption — the gap the plan closes$/);
    expect(v.gap!.text).toMatch(/^The OM's 6\.0% is a stabilized assumption, so it is held to the market's published figure: /);
    expect(v.gap!.text).toContain("Today the deal's rent roll runs 9.2% vacant, 3.2 points over the assumption — the gap the plan closes.");
    // A plan's yield is struck on the building stabilized: the lease-up is
    // the plan, not a run's omission.
    expect(v.gap!.text).not.toContain("not modelled in either case");
    expect(vacancyDecidedBy(buildStressTest(argsFor(withVacancy("6.0%", "value_add"))))).toBe("published");
    // With no fresh published figure the class's norm decides, never the
    // documents, which stay beside it as today's.
    const bare = rowOf(buildStressTest(argsFor(withVacancy("6.0%", "value_add"), { modelVsMarket: null }, { roll: true })), "vacancy");
    expect(bare.evidence[0].kind).toBe("rule_of_thumb");
    expect(bare.ruleOfThumbOnly).toBe(true);
    expect(bare.gap!.text).toContain(
      "No fresh published vacancy figure for this market could be held to the stabilized assumption, so the class's norm decides; today the deal's rent roll runs 9.2% vacant, 3.2 points over the assumption — the gap the plan closes, never the figure the plan's NOI runs at.",
    );
  });

  it("tells the track record which deals it holds to the market", () => {
    expect(stabilizedVacancyStated(withVacancy("6.0%"))).toBe(true);
    expect(stabilizedVacancyStated(withVacancy("6.0%", "value_add"))).toBe(false);
    expect(stabilizedVacancyStated(APARTMENT)).toBe(false);
    expect(stabilizedVacancyStated(null)).toBe(false);
  });

  it("says which kind decided the vacancy row, so the track record holds back a later document only where the market decided (audit M5)", () => {
    // The survey held the stabilized 6.0%: the market decided.
    expect(vacancyDecidedBy(buildStressTest(argsFor(withVacancy("6.0%"))))).toBe("published");
    // No fresh published figure: the class's norm decided, never the rent
    // roll beside it (the review of 2026-10-23).
    expect(vacancyDecidedBy(buildStressTest(argsFor(withVacancy("6.0%"), { modelVsMarket: null }, { roll: true })))).toBe("rule_of_thumb");
    // A pro forma's vacancy line is dollars: the T-12 decided it, the same measure.
    expect(vacancyDecidedBy(buildStressTest(argsFor(withVacancy("6.0%", "stabilized", "Vacancy (pro forma)"))))).toBe("document");
    expect(vacancyDecidedBy(null)).toBeNull();
    // The deal page asks it of its own built test, never of the extraction alone.
    const page = readFileSync("app/(app)/deals/[id]/page.tsx", "utf8");
    expect(page).toContain('stabilizedVacancyStated(extraction, firstSignal) && vacancyDecidedBy(stressTest) === "published"');
  });

  it("an occupancy the OM states for today is held to the rent roll, today's doors too", () => {
    // The Maddox states no allowance: its 94% is today's (the first describe).
    const v = rowOf(buildStressTest(argsFor(APARTMENT, {}, { roll: true })), "vacancy");
    expect(v.evidence[0]).toMatchObject({ kind: "document", publisher: "the deal's rent roll", value: 9.2 });
    expect(v.verdict).toBe("unsupported");
    // With the T-12 alone, its dollars stand beside, and the market's doors decide.
    expect(rowOf(buildStressTest(apartmentArgs()), "vacancy").evidence[0]).toMatchObject({ kind: "published" });
  });

  it("a commercial deal's stabilized vacancy is held to the research tracker's band", () => {
    const office: ExtractionResult = { ...withVacancy("10.0%"), assetClass: "office", metrics: withVacancy("10.0%").metrics.filter((m) => !/Units|Pro forma rent/.test(m.label)) };
    const officeDerived = deriveUnderwriteInputs(office, "x", undefined, { debtIndex: FIVE });
    const read = modelVsMarket({
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
    })!;
    const v = rowOf(buildStressTest({ extraction: office, challenger: null, market: null, modelVsMarket: read, actuals: null, derived: officeDerived, storedAssetClass: "office", readOn: READ_ON }), "vacancy");
    expect(v.evidence[0].label).toMatch(/vacancy \(research tracker\)/i);
    expect(v.method).toMatch(/^The OM's stabilized vacancy against office vacancy \(research tracker\)/);
    expect(v.gap!.text).toMatch(/^The OM's 10\.0% is a stabilized assumption, so it is held to the market's published figure: office vacancy \(research tracker\)/);
  });
});

describe("the rent growth is held to the figure for the deal's own kind of rent", () => {
  it("with no Zillow figure, the rent sitting tenants pay decides, said so", () => {
    const args = apartmentArgs();
    const g = rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { zori: null }) }), "rent_growth");
    expect(g.evidence.map((e) => e.label)).toEqual(["Rent paid by sitting tenants (CPI rent)"]);
    expect(g.gap!.text).toBe(
      "Held to the rent sitting tenants pay (CPI rent), the figure for this kind of rent where no Zillow asking rent was read; it averages every lease in place, so it lags the rents new leases sign at: +5.0% over the year to Aug 2026 (BLS), a single year's change. The OM's 4.0%/yr is 1.0 point under it — the conservative side. A trailing year is what the assumption is asked to beat, not a forecast.",
    );
    expect(g.verdict).toBe("holds");
    // The evidence lifts the return: the conservative side's cushion.
    expect(g.impact!.altIrrPct!).toBeGreaterThan(g.impact!.baseIrrPct!);
  });

  it("with no apartment index for the month, Zillow's all-homes figure decides", () => {
    const args = apartmentArgs();
    const g = rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { zori: { ...zori, mfrRent: null, mfrYoyPct: null } }) }), "rent_growth");
    expect(g.evidence.map((e) => e.label)).toEqual(["Asking rent, all home types", "Rent paid by sitting tenants (CPI rent)"]);
    expect(g.gap!.text).toMatch(/^Held to Zillow's asking rents across all home types, the nearest figure for this kind of rent, since Zillow's apartment index has no figure for the month: \+2\.3% over the year to Aug 2026 \(Zillow Research\), a single year's change\. The OM's 4\.0%\/yr is 1\.7 points over it\. A trailing year is what the assumption is asked to beat, not a forecast\.$/);
    expect(g.verdict).toBe("stretched");
  });

  it("reads a current, in-place, actual or T-12 vacancy as today's figure, never as a stabilized assumption held to the market (audit M6)", () => {
    for (const label of ["Current vacancy", "In-place vacancy", "Actual vacancy", "T-12 vacancy", "Vacancy today"]) {
      const ex = { ...APARTMENT, metrics: [...APARTMENT.metrics.filter((m) => m.label !== "Occupancy"), row("Units", "153"), row(label, "9.0%", "p. 8")] };
      expect(stabilizedVacancyStated(ex), label).toBe(false);
      const actuals = readActuals({ metrics: ex.metrics, strategy: inferStrategy(ex), rentRoll: ROLL, t12: { summary: T12, periodEnd: "2026-06-30" }, assetClass: "multifamily" });
      const v = rowOf(buildStressTest(apartmentArgs({ extraction: ex, actuals })), "vacancy");
      // A vacancy read off the trailing statement is the statement's loss
      // over its gross potential rent, dollars: the T-12 decides it, the same
      // measure. Any other is counted by doors: the rent roll decides it,
      // never the market's survey and never the T-12's dollars beside it.
      const trailing = label === "T-12 vacancy";
      expect(v.title, label).toBe(trailing ? "Economic vacancy today" : "Occupancy today");
      expect(v.omSays.text, label).toBe(`${label}: 9.0% as stated — today's ${trailing ? "economic " : ""}vacancy, not a pro forma assumption`);
      expect(v.evidence[0].publisher, label).toBe(trailing ? "the deal's T-12" : "the deal's rent roll");
    }
    // Beside a stabilized allowance, the stabilized one is the assumption.
    const both = { ...APARTMENT, metrics: [...APARTMENT.metrics, row("Current vacancy", "9.0%", "p. 8"), row("Stabilized vacancy", "5.0%", "p. 21")] };
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: both })), "vacancy").omSays.text).toBe("Stabilized vacancy: 5.0%");
    expect(stabilizedVacancyStated(both)).toBe(true);
  });

  it("is held to the same figure the model's rent-growth check is held to, so the card never reads inside where the row reads unsupported (audit H1)", () => {
    // The OM's 3.0% and the model's 3.0% against apartments' +0.8%: the
    // CPI's +5.0% had let the card read "inside the published range".
    const ex = { ...APARTMENT, metrics: APARTMENT.metrics.map((m) => (m.label === "Rent growth" ? { ...m, value: "3.0%" } : m)) };
    const args = apartmentArgs({ extraction: ex });
    const mvm = readFor(args.derived!, { zori: { ...zori, mfrYoyPct: 0.8 } });
    const card = mvm.checks.find((c) => c.key === "rent_growth")!;
    const g = rowOf(buildStressTest({ ...args, modelVsMarket: mvm }), "rent_growth");
    expect(g.verdict).toBe("unsupported");
    expect(g.evidence[g.impact!.evidenceIndex].label).toBe("Asking rent, apartments");
    expect(card.tone).toBe("ahead");
    expect(card.toneLabel).not.toBe("inside the published range");
    // The card's range is the one deciding figure; the others are beside it.
    const ranged = card.published.filter((_, i) => card.marks![i].role === "range").map((p) => p.label);
    expect(ranged).toEqual(["Asking rent, apartments"]);
  });

  it("holds a rented house to Zillow's all-homes rents first, and names the closest figure for a park, a student or a mixed-use building as no figure for that kind of rent (audit M4)", () => {
    const rowFor = (cls: string) => {
      const args = apartmentArgs({ storedAssetClass: cls });
      return rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { assetClass: cls }) }), "rent_growth");
    };
    const sfr = rowFor("sfr_btr");
    expect(sfr.evidence[sfr.impact!.evidenceIndex].label).toBe("Asking rent, all home types");
    expect(sfr.gap!.text).toMatch(/^Held to Zillow's asking rents across all home types, the figure for a rented home, houses among the home types it covers/);
    const park = rowFor("manufactured_housing");
    expect(park.evidence[park.impact!.evidenceIndex].label).toBe("Asking rent, all home types");
    expect(park.gap!.text).toContain("the closest published figure, not a park's own kind of rent: its income is lot rents, which no published index tracks");
    const student = rowFor("student_housing");
    expect(student.gap!.text).toContain("Held to Zillow's apartment asking rents, the closest published figure, not a student building's own kind of rent");
    const mixed = rowFor("mixed_use");
    expect(mixed.gap!.text).toContain("Held to Zillow's apartment asking rents, the closest published figure for the apartments, not the commercial space's rent");
    for (const r of [park, student, mixed]) expect(r.gap!.text, r.title).not.toContain("the figure for this kind of rent");
  });

  it("says lodging and licensed care read no rent index, rather than that nothing could be read (audit L4)", () => {
    for (const cls of ["hospitality_str", "senior_housing"]) {
      const args = apartmentArgs({ storedAssetClass: cls });
      const g = rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { assetClass: cls }) }), "rent_growth");
      expect(g.verdict, cls).toBe("unchecked");
      expect(g.unchecked, cls).toBe(NO_RENT_INDEX);
    }
  });
});

// ── The exit cap's threshold and its spread ──────────────────────────────

describe("the exit cap row", () => {
  const withCaps = (goingIn: string, exit: string): ExtractionResult => ({
    ...APARTMENT,
    metrics: APARTMENT.metrics.map((m) => (m.label === "Going-in cap rate" ? { ...m, value: goingIn } : m.label === "Exit cap rate" ? { ...m, value: exit } : m)),
  });

  it("reads 25 bps of compression unsupported, the threshold inclusive, and 24 bps stretched", () => {
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: withCaps("5.75%", "5.50%") })), "exit_cap")).toMatchObject({ gap: { value: 25, unit: "bps" }, verdict: "unsupported" });
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: withCaps("5.74%", "5.50%") })), "exit_cap")).toMatchObject({ gap: { value: 24, unit: "bps" }, verdict: "stretched" });
  });

  it("an exit flat to the going-in cap holds, and names adding expansion as a rule of thumb — no expansion figure invented", () => {
    const x = rowOf(buildStressTest(apartmentArgs({ extraction: withCaps("5.50%", "5.50%") })), "exit_cap");
    expect(x.verdict).toBe("holds");
    expect(x.gap!.text).toBe("The OM's 5.50% exit is flat to its 5.50% going-in cap; adding some expansion over a hold is a common rule of thumb, which the screen does not hold it to.");
  });

  it("says the exit's spread under the 10-year where it is under it", () => {
    const x = rowOf(buildStressTest(apartmentArgs({ extraction: withCaps("5.71%", "4.50%") })), "exit_cap");
    // The going-in cap's spread over the same yield rides beside the exit's.
    expect(x.evidence[1].text).toBe("4.94% on Sep 17, 2026 — the exit's spread under it is 44 bps; the going-in cap's spread over it is 77 bps");
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: withCaps("5.71%", "4.94%") })), "exit_cap").evidence[1].text).toBe(
      "4.94% on Sep 17, 2026 — the exit sits at it; the going-in cap's spread over it is 77 bps",
    );
  });

  it("is decided by the higher of the going-in cap and the OM's own pro forma cap, the other beside it, no expansion added (the review of 2026-10-23)", () => {
    // An exit capitalizes a forward NOI: the pro forma cap is the price's
    // yield on the OM's stabilized NOI, the income the exit sells.
    const withProForma = (goingIn: string, exit: string, proForma: string, label = "Pro forma cap rate"): ExtractionResult => ({
      ...withCaps(goingIn, exit),
      metrics: [...withCaps(goingIn, exit).metrics, row(label, proForma, "p. 8")],
    });
    const x = rowOf(buildStressTest(apartmentArgs({ extraction: withProForma("5.45%", "5.25%", "5.70%") })), "exit_cap");
    expect(x.decidedBy).toBe(0);
    expect(x.evidence[0]).toMatchObject({ kind: "om_internal", label: "The OM's pro forma cap", value: 5.7, page: 8 });
    expect(x.evidence[1]).toMatchObject({ label: "The OM's going-in cap", value: 5.45 });
    expect(x.gap).toMatchObject({ value: 45, unit: "bps" });
    expect(x.verdict).toBe("unsupported");
    expect(x.gap!.text).toBe(
      "The OM's 5.25% exit is 45 bps tighter than its 5.70% pro forma cap — the price's yield on its own stabilized NOI, the income the exit sells — so it sells that income dearer than this buyer pays for it: cap compression. Its 5.45% going-in cap, on today's NOI, is beside it.",
    );
    expect(x.impact!.altValue).toBeCloseTo(0.057, 9);
    expect(x.impact!.note).toMatch(/^If the exit cap is the pro forma cap's 5\.70%, not the OM's 5\.25%/);
    expect(x.method).toMatch(/^The OM's exit cap against the OM's pro forma cap \(the offering memorandum\), the one figure that decides; beside it, not deciding: the OM's going-in cap/);
    // A pro forma cap under the going-in cap: the going-in cap decides, the
    // pro forma beside it.
    const under = rowOf(buildStressTest(apartmentArgs({ extraction: withProForma("5.75%", "5.50%", "5.60%", "Stabilized cap rate") })), "exit_cap");
    expect(under.evidence[under.decidedBy!].label).toBe("The OM's going-in cap");
    expect(under.gap!.text).toBe("The OM's 5.50% exit is 25 bps tighter than its 5.75% going-in cap — cap compression. Its 5.60% pro forma cap, on its stabilized NOI, sits under it, shown beside it.");
    // Flat to the pro forma cap holds, the expansion habit named, never held to.
    const flat = rowOf(buildStressTest(apartmentArgs({ extraction: withProForma("5.45%", "5.70%", "5.70%") })), "exit_cap");
    expect(flat.verdict).toBe("holds");
    expect(flat.gap!.text).toContain("adding some expansion over a hold is a common rule of thumb, which the screen does not hold it to");
    // An exit, a cap on cost or a later year's cap is no pro forma cap.
    for (const label of ["Pro forma exit cap", "Stabilized yield on cost", "Pro forma cap rate (Year 3)", "Stabilized cap on cost"]) {
      const r = rowOf(buildStressTest(apartmentArgs({ extraction: withProForma("5.45%", "5.25%", "6.50%", label) })), "exit_cap");
      expect(r.evidence.some((e) => e.label === "The OM's pro forma cap"), label).toBe(false);
    }
    // The screening model keeps its exit reader's own pieces: the going-in cap
    // (lib/model-evidence reads them with `proForma: false`).
    expect(exitCapPieces(withProForma("5.45%", "5.25%", "5.70%"), false, null, null, { proForma: false }).decided!.label).toBe("The OM's going-in cap");
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

  it("re-runs no levered return: its rows re-run the plan's yield on total cost, and a row with no yield meaning says so", () => {
    expect(test.impactsWithheld).toBeNull();
    expect(test.measure).toBe("yield_on_cost");
    // No levered-IRR re-run anywhere: the model runs today's income.
    expect(test.rows.every((r) => r.impact == null || r.impact.measure === "yield_on_cost")).toBe(true);
    expect(test.rows.every((r) => r.impact == null || (r.impact.baseIrrPct == null && r.impact.altIrrPct == null))).toBe(true);
    // The rows still read: the verdicts are the gaps', not the model's.
    expect(rowOf(test, "vacancy").verdict).not.toBe("unchecked");
    // The OM's figure is today's occupancy, not the plan's stabilized
    // vacancy: no yield on cost is re-run on it, said so.
    expect(rowOf(test, "vacancy").title).toBe("Occupancy today");
    expect(rowOf(test, "vacancy").noRerun).toBe(PLAN_VACANCY_TODAY);
    // A growth rate, the exit and the debt have no yield-on-cost meaning;
    // the NOI row tests today's income.
    for (const k of ["rent_growth", "debt"] as const) {
      const r = rowOf(test, k);
      expect(r.verdict, k).not.toBe("unchecked");
      expect(r.impact, k).toBeNull();
      expect(r.noRerun, k).toBe(PLAN_NO_YIELD_MEANING[k]);
      expect(noMoveWhy(test, r), k).toBe(PLAN_NO_YIELD_MEANING[k]);
    }
    // An unchecked row has no figure to re-run either way: no sentence of the
    // plan's beside its own reason.
    expect(rowOf(test, "noi").verdict).toBe("unchecked");
    expect(rowOf(test, "noi").noRerun).toBeUndefined();
    // The bill is the seller's, not the pro forma's line: no re-run, said why.
    expect(rowOf(test, "taxes").verdict).toBe("stretched");
    expect(rowOf(test, "taxes").noRerun).toBe(PLAN_TAX_NOT_PRO_FORMA);
    // The read line names what is re-run.
    expect(stressReadLine(test)).toMatch(/; the plan's yield on total cost re-run with one figure swapped for the evidence's, in code\.$/);
  });

  it("re-runs the renovation premium on the doors to renovate: the stabilized NOI over the total cost, one figure moved", () => {
    const p = rowOf(test, "renovation_premium");
    // $42M + the $1.8M budget = $43.8M; $2.65M over it is 6.05%. The gap,
    // $60 a month on 120 doors for twelve months, is $86,400 off the NOI.
    expect(p.impact).toMatchObject({ measure: "yield_on_cost", input: "stabilizedNoi", evidenceIndex: 0, omValue: 2_650_000, altValue: 2_650_000 - 86_400 });
    expect(p.impact!.baseYocPct!).toBeCloseTo((2_650_000 / 43_800_000) * 100, 9);
    expect(p.impact!.altYocPct!).toBeCloseTo((2_563_600 / 43_800_000) * 100, 9);
    expect(p.impact!.note).toBe(
      "If the renovation premium is the achieved premium's $190 a month, not the OM's $250 a month, the yield on cost moves from 6.05% to 5.85% (the stabilized NOI $2.65M to $2.56M over the $43.8M total cost; the gap on the 120 doors to renovate, twelve months each, the stabilized NOI read as carrying the projected premium on every one).",
    );
    expect(moveShort(p.impact)).toBe("Yield on cost 6.05% to 5.85%");
    expect(rerunWords(test, p.impact)).toBe("from the plan's 6.05% yield on cost, its stabilized NOI over its total cost on the OM's own figures, one figure alone then set to the evidence's");
  });

  it("leads with the yield on cost on the OM's figures against the evidence's, the parts adding to the gap", () => {
    const h = test.headline!;
    expect(h.measure).toBe("yield_on_cost");
    expect(h.omIrrPct).toBeNull();
    expect(h.omYocPct!).toBeCloseTo((2_650_000 / 43_800_000) * 100, 9);
    expect(h.evidenceYocPct!).toBeCloseTo((2_563_600 / 43_800_000) * 100, 9);
    expect(h.parts.map((x) => x.key)).toEqual(["renovation_premium"]);
    expect(h.parts.reduce((s, x) => s + x.pts, 0)).toBeCloseTo(h.evidenceYocPct! - h.omYocPct!, 9);
    // The taxes are past their evidence and carry no re-run: left out, why said.
    expect(h.omitted.map((o) => o.key)).toContain("taxes");
    expect(headlineLine(test, "→")).toBe("Yield on cost on the OM's figures 6.05% → 5.85% with the evidence");
    const sentence = headlineSentence(test)!;
    expect(sentence).toMatch(/^Yield on cost on the OM's figures 6\.05% to 5\.85% with the evidence: the renovation premium −0\.20 pts, the one assumption past its evidence that the plan's yield is struck on\./);
    expect(sentence).toContain("Left out: the loan rate (the yield on cost is struck before debt); rent growth (a growth rate has no yield-on-cost meaning); ");
    expect(sentence).toContain("the taxes (the OM states no tax bill as its pro forma's line");
    expect(sentence).not.toMatch(/levered/i);
  });

  it("says why a row stands unchecked by what stopped it, never that the OM states nothing it prints beside the row", () => {
    // The OM states a going-in cap; on a value-add it is struck on today's
    // income, so the exit is not held to it — said so, never "no going-in cap".
    const x = rowOf(test, "exit_cap");
    expect(x.verdict).toBe("unchecked");
    expect(x.unchecked).toBe(
      "On a value-add, lease-up, conversion or development deal the OM's going-in cap is struck on today's income, not the stabilized income the exit sells, so the exit is not held to it; and no published cap range was read for this market and class.",
    );
    // The pro forma beside the in-place NOI is the business plan, never
    // called absent.
    const n = rowOf(test, "noi");
    expect(n.verdict).toBe("unchecked");
    expect(n.evidence.map((e) => e.kind)).toEqual(["om_internal"]);
    expect(n.unchecked).toBe("No T-12 is on file. On a value-add, lease-up, conversion or development deal the OM's pro forma NOI is the business plan, not today's income, so the in-place figure is not held to it.");
  });

  it("reads the renovation premium against the achieved one and the rents, the break-even said beside it", () => {
    const p = rowOf(test, "renovation_premium");
    expect(p.omSays).toEqual({ text: "$250 a month a renovated door, as stated", value: 250, page: 22 });
    // The break-even is what the program needs, not evidence of what a door
    // earns: never filed as evidence (it had read "a rule of thumb … the
    // deal's own figure" and widened the range to $71), said in the gap.
    expect(p.evidence.map((e) => e.label)).toEqual([
      "Achieved premium on the doors already renovated",
      "The OM's classic and renovated rents, against its lease comps' rents",
    ]);
    expect(p.evidence[0]).toMatchObject({ kind: "om_internal", value: 190 });
    expect(p.evidence.some((e) => e.kind === "rule_of_thumb")).toBe(false);
    // $15,000 × 5.71% / 12 = $71 a month.
    expect(p.gap).toEqual({
      value: 60,
      unit: "usd",
      text: "The projected $250 is $60 a month (31.6%) over the achieved $190. A $15,000 door needs $71 a month to pay for itself at the model's 5.71% exit cap: the break-even, what the program needs, not evidence of what a door earns.",
    });
    expect(p.ruleOfThumbOnly).toBeUndefined();
    expect(p.verdict).toBe("unsupported");
    // The premium is no model input; on a plan deal it moves the yield on cost.
    expect(p.impact?.measure).toBe("yield_on_cost");
  });
});

describe("a value-add's yield on cost, re-run row by row and split by Shapley values", () => {
  // The doors × a door's cost are the budget (no total stated); the OM
  // states its stabilized vacancy, its pro forma gross, today's tax bill and
  // its pro forma tax line, so each may move the stabilized NOI.
  const metrics = [
    row("Asking price", "$42,000,000", "p. 5"),
    row("Units", "153", "p. 4"),
    row("Rentable SF", "140,000", "p. 4"),
    row("NOI (in-place)", "$2,400,000", "p. 7"),
    row("NOI (stabilized, pro forma)", "$3,000,000", "p. 7"),
    row("Stabilized vacancy", "5.0%", "p. 21"),
    row("Pro forma gross potential rent", "$5,000,000", "p. 21"),
    row("Real estate taxes (in-place)", "$380,000", "p. 15"),
    row("Pro forma real estate taxes", "$380,000", "p. 15"),
    row("Assessed value", "$30,000,000", "p. 15"),
    row("Untrended yield on cost", "7.10%", "p. 24"),
    row("Rent growth", "4.0%", "p. 21"),
    row("Units to renovate", "120", "p. 22"),
    row("Renovation cost per unit", "$15,000", "p. 22"),
    row("Renovation premium", "$250/mo", "p. 22"),
    row("Achieved renovation premium", "$190/mo", "p. 23"),
  ];
  const ex: ExtractionResult = { ...APARTMENT, strategy: { kind: "value_add", summary: "Renovate 120 classic units", capitalBudget: "", timeline: "24 months" }, metrics };
  const actualsIn = { t12: { summary: T12, periodEnd: "2026-06-30" } };
  const derived = deriveUnderwriteInputs(ex, "x", actualsIn, { debtIndex: FIVE });
  const actuals = readActuals({ metrics, strategy: inferStrategy(ex), rentRoll: null, t12: actualsIn.t12, assetClass: "multifamily" });
  const test = buildStressTest({ extraction: ex, challenger: null, market: null, modelVsMarket: readFor(derived, { plan: true }), actuals, derived, storedAssetClass: "multifamily", readOn: READ_ON });
  const COST = 42_000_000 + 120 * 15_000;

  it("strikes the plan's yield on cost on the doors × a door's cost, and moves the stabilized NOI by each row's deciding figure", () => {
    expect(test.impactsWithheld).toBeNull();
    // Vacancy: the market's survey decides a plan's stated stabilized 5.0%
    // (6.2% ±2.2, inside its margin), and the T-12's 9.1% stands beside it
    // as the gap the plan closes — the building before the plan is done,
    // never the stabilized figure (audit H1: a lease-up 70% vacant on its
    // T-12 had read "7.88% to −0.79%"; the walkthrough of 2026-10-20: the
    // T-12 had decided the stabilized figure while the row said it was no
    // evidence of it).
    const v = rowOf(test, "vacancy");
    expect(v.title).toBe("Stabilized vacancy");
    expect(v.evidence[0]).toMatchObject({ kind: "published", label: METRO_VACANCY_LABEL });
    expect(v.verdict).toBe("holds");
    expect(v.impact).toMatchObject({ measure: "yield_on_cost", input: "stabilizedNoi" });
    expect(v.noRerun).toBeUndefined();
    // The T-12's 9.1% is dollars, not doors: shown beside the stabilized
    // figure as that, never as a gap the plan closes in doors.
    expect(v.evidence.find((e) => e.publisher === "the deal's T-12")!.text).toMatch(/dollars, not doors: shown beside the OM's figure, which counts doors, and never deciding it$/);
    expect(PLAN_VACANCY_DOCUMENT).toBe("Today's vacancy is the gap the plan closes, not evidence of the stabilized figure, so no yield on cost is re-run on it.");
    // Taxes: the rate is today's bill over today's assessment, $380k / $30M,
    // and its reset on the price, $532k, is set against the pro forma's line
    // and moved off the stabilized NOI it is in.
    const t = rowOf(test, "taxes");
    expect(t.omSays.text).toBe("Pro forma real estate taxes: $380,000");
    expect(t.evidence[0].text).toBe("today's $380k bill over $30M assessed is 1.27%, which on the $42M price is $532k a year if the sale resets the assessment to the price");
    expect(t.impact).toMatchObject({ measure: "yield_on_cost", input: "stabilizedNoi", omValue: 3_000_000, altValue: 3_000_000 - 152_000 });
    expect(t.noRerun).toBeUndefined();
    // The premium on the doors to renovate.
    expect(rowOf(test, "renovation_premium").impact!.altValue).toBe(3_000_000 - 86_400);
    // The NOI row tests today's income against the T-12: its verdict stands,
    // and no yield on cost is re-run on it.
    expect(rowOf(test, "noi").verdict).not.toBe("unchecked");
    expect(rowOf(test, "noi").noRerun).toBe(PLAN_NO_YIELD_MEANING.noi);
    // A cell with no room for the sentence says why in a few words: the
    // memo's lead row had printed an empty move (the walkthrough of 2026-10-20).
    expect(rowWords(rowOf(test, "rent_growth")).move).toBe("no yield-on-cost re-run: a growth rate");
    expect(rowWords(rowOf(test, "renovation_premium")).move).toMatch(/^Yield on cost 6\.85% to /);
  });

  it("splits the gap by Shapley values, the parts adding to it and, printed, to the printed gap", () => {
    // The market's survey holds the stated 5.0%, so the taxes and the
    // premium split the gap; the vacancy is in the OM's case and no part.
    const withT12 = test.headline!;
    expect(withT12.parts.map((p) => p.key).sort()).toEqual(["renovation_premium", "taxes"]);
    expect(withT12.omitted.map((o) => o.key)).not.toContain("vacancy");
    // A T-12 uploaded beside the plan moves no stabilized figure: the
    // headline is the one struck without it (it had made the headline gentler).
    const noT12 = buildStressTest({ extraction: ex, challenger: null, market: null, modelVsMarket: readFor(deriveUnderwriteInputs(ex, "x", undefined, { debtIndex: FIVE }), { plan: true }), actuals: null, derived: deriveUnderwriteInputs(ex, "x", undefined, { debtIndex: FIVE }), storedAssetClass: "multifamily", readOn: READ_ON });
    expect([withT12.omYocPct, withT12.evidenceYocPct]).toEqual([noT12.headline!.omYocPct, noT12.headline!.evidenceYocPct]);
    expect(rowOf(test, "vacancy").verdict).toBe(rowOf(noT12, "vacancy").verdict);
    // Where the market's published figure decides a stated stabilized
    // vacancy (no document on file), it moves the stabilized NOI: the OM's
    // 3.0% against the metro survey's 6.2% ±2.2, struck on the $5M gross.
    const mkt = { ...ex, metrics: metrics.map((m) => (m.label === "Stabilized vacancy" ? { ...m, value: "3.0%" } : m)) };
    const dm = deriveUnderwriteInputs(mkt, "x", undefined, { debtIndex: FIVE });
    const tm = buildStressTest({ extraction: mkt, challenger: null, market: null, modelVsMarket: readFor(dm, { plan: true }), actuals: null, derived: dm, storedAssetClass: "multifamily", readOn: READ_ON });
    const v = rowOf(tm, "vacancy");
    expect(v.evidence[0].kind).toBe("published");
    expect(v.noRerun).toBeUndefined();
    expect(v.impact).toMatchObject({ measure: "yield_on_cost", input: "stabilizedNoi", evidenceIndex: 0, omValue: 3_000_000 });
    expect(v.impact!.altValue).toBeCloseTo(3_000_000 - (5_000_000 * (v.evidence[0].value! - 3)) / 100, 6);
    expect(v.impact!.baseYocPct!).toBeCloseTo((3_000_000 / COST) * 100, 9);
    expect(v.impact!.note).toContain("the gap struck on the OM's pro forma gross potential rent of $5M");
    // The panel prints what the plan's gap is struck on under its bars.
    expect(v.impact!.caveat).toBe("The gap is struck on the OM's pro forma gross potential rent of $5M.");
    const h = tm.headline!;
    expect(h.measure).toBe("yield_on_cost");
    const moves = { vacancy: v.impact!, taxes: rowOf(tm, "taxes").impact!, renovation_premium: rowOf(tm, "renovation_premium").impact! };
    const drop = Object.values(moves).reduce((s, i) => s + (i.omValue - i.altValue), 0);
    expect(h.omYocPct!).toBeCloseTo((3_000_000 / COST) * 100, 9);
    expect(h.evidenceYocPct!).toBeCloseTo(((3_000_000 - drop) / COST) * 100, 9);
    expect(h.parts.map((p) => p.key).sort()).toEqual(["renovation_premium", "taxes", "vacancy"]);
    expect(h.parts.reduce((s, p) => s + p.pts, 0)).toBeCloseTo(h.evidenceYocPct! - h.omYocPct!, 9);
    // The NOI moves add over one cost, so each part is its own move over it.
    for (const p of h.parts) expect(p.pts).toBeCloseTo(-((moves[p.key as keyof typeof moves].omValue - moves[p.key as keyof typeof moves].altValue) / COST) * 100, 9);
    const shown = shownHeadline(h);
    expect(Math.round(shown.parts.reduce((s, p) => s + p.shown, 0) * 100)).toBe(Math.round((shown.evidence! - shown.om!) * 100));
    // The vacancy and the premium overlap a little, said on /how-we-test.
    expect(HEADLINE_METHOD.plan.join(" ")).toContain("the vacancy's gap is struck on a gross that carries the projected premium, and the headline does not net it out");
    // So do the vacancy and a market rent, both past their evidence.
    expect(HEADLINE_METHOD.plan.join(" ")).toContain("Vacancy and a market rent both past their evidence overlap the same way");
    // The OM's own stated yield on cost rides beside the two cases, as the OM's.
    expect(h.statedYoc).toEqual({ pct: 7.1, label: "Untrended yield on cost", page: 24, namesCost: false });
    // The two differ, so each is said with what it is struck on, from the
    // stated figures alone: the plan's on the price plus the program's
    // budget, the OM's row naming no cost.
    expect(h.planCost).toEqual({ total: COST, price: 42_000_000, budget: 120 * 15_000 });
    expect(headlineSentence(test)).toContain(
      "The OM states its own yield on cost of 7.10% (Untrended yield on cost, p. 24), its row naming no cost it is struck on; the plan's 6.85% is struck on the $43.8M total cost, the $42M price plus the $1.8M budget.",
    );
    // The memo's one line carries the OM's own stated figure too, from the
    // same reader.
    expect(headlineShort(test)).toContain("with the evidence (the OM states 7.10%, p. 24");
    expect(headlineSentence(test)).toContain("-point gap averaged over every order the swaps could be made in.");
  });

  it("re-runs the basis through the total cost, and leaves the price out of the split: both cases pay it", () => {
    const comps: NonNullable<StressTestArgs["brokerComps"]> = {
      saleComps: [
        { name: "Alder", detail: "$250,000 per unit, 5.6% cap", support: "supports", note: "" },
        { name: "Birch", detail: "$255,000 per unit, 5.5% cap", support: "supports", note: "" },
        { name: "Cedar", detail: "$260,000 per unit, 5.4% cap", support: "supports", note: "" },
      ],
      leaseComps: [],
      redFlags: [],
      summary: "",
    };
    const t = buildStressTest({ extraction: ex, challenger: null, market: null, modelVsMarket: readFor(derived, { plan: true }), actuals, derived, storedAssetClass: "multifamily", brokerComps: comps, readOn: READ_ON });
    const b = rowOf(t, "basis");
    expect(b.verdict).not.toBe("unchecked");
    // $43.8M over 153 units is $286k a unit all-in, against the $255k median.
    expect(b.impact).toMatchObject({ measure: "yield_on_cost", input: "totalCost", omValue: COST });
    expect(b.impact!.altValue).toBeCloseTo((COST * 255_000) / (COST / 153), 6);
    expect(t.headline!.omitted).toContainEqual({ key: "basis", label: "Basis", why: PLAN_BASIS_LEFT_OUT });
    expect(t.headline!.parts.map((p) => p.key)).not.toContain("basis");
  });

  it("re-runs nothing where the OM states no stabilized NOI, and says why", () => {
    const bare = { ...ex, metrics: metrics.filter((m) => !/stabilized, pro forma/.test(m.label)) };
    const d = deriveUnderwriteInputs(bare, "x", actualsIn, { debtIndex: FIVE });
    const t = buildStressTest({ extraction: bare, challenger: null, market: null, modelVsMarket: readFor(d, { plan: true }), actuals, derived: d, storedAssetClass: "multifamily", readOn: READ_ON });
    expect(t.impactsWithheld).toBe(`${PLAN_YIELD_LEAD}, and the OM states no stabilized NOI, so no return is re-run.`);
    expect(t.measure).toBeUndefined();
    expect(t.headline).toBeNull();
    expect(t.rows.every((r) => r.impact === null)).toBe(true);
    expect(headlineSentence(t)).toBe(`${t.impactsWithheld} The headline, the OM's figures against the evidence's in one run each, is withheld for the same reason.`);
    // No budget beside the price: no total cost.
    const noBudget = { ...ex, metrics: metrics.filter((m) => !/renovat/i.test(m.label)) };
    const d2 = deriveUnderwriteInputs(noBudget, "x", actualsIn, { debtIndex: FIVE });
    expect(buildStressTest({ extraction: noBudget, challenger: null, market: null, modelVsMarket: null, actuals, derived: d2, storedAssetClass: "multifamily", readOn: READ_ON }).impactsWithheld).toBe(
      `${PLAN_YIELD_LEAD}, and the OM states no budget for the plan beside the price, so no total cost is read and no return is re-run.`,
    );
  });

  it("withholds the re-runs where the yield is a misread (25% or more) or the all-in basis is outside the band, in the plan's own sentence", () => {
    expect(planYieldBase({ ...planSummary(ex, inferStrategy(ex))! })).not.toBeNull();
    // A stabilized NOI read off a row in thousands' place: $30M over $43.8M.
    const hot = { ...ex, metrics: metrics.map((m) => (/stabilized, pro forma/.test(m.label) ? { ...m, value: "$30,000,000" } : m)) };
    const hotPlan = planSummary(hot, inferStrategy(hot))!;
    expect(hotPlan.yieldWithheld).toBeTruthy();
    expect(IMPLIED_CAP_CEILING).toBe(0.25);
    const dh = deriveUnderwriteInputs(hot, "x", actualsIn, { debtIndex: FIVE });
    const th = buildStressTest({ extraction: hot, challenger: null, market: null, modelVsMarket: null, actuals, derived: dh, storedAssetClass: "multifamily", readOn: READ_ON });
    expect(th.impactsWithheld).toBe(planNoYieldReason(hotPlan));
    expect(th.impactsWithheld).toMatch(/^No yield on cost is struck: .*; no return is re-run\.$/);
    expect(th.headline).toBeNull();
    // The units read a hundredfold: $43.8M over 15,300 units is under $3k a
    // unit all-in, outside the band any market delivers at, while the yield
    // itself (6.85%) is no misread.
    const many = { ...ex, metrics: metrics.map((m) => (m.label === "Units" ? { ...m, value: "15,300" } : m)) };
    const checked = planWithBasisChecked(many, inferStrategy(many), planSummary(many, inferStrategy(many)))!;
    expect(checked.yieldWithheld ?? null).toBeNull();
    expect(checked.basisWithheld).toBeTruthy();
    expect(planYieldBase(checked)).toBeNull();
    const dm = deriveUnderwriteInputs(many, "x", actualsIn, { debtIndex: FIVE });
    const tm = buildStressTest({ extraction: many, challenger: null, market: null, modelVsMarket: null, actuals, derived: dm, storedAssetClass: "multifamily", readOn: READ_ON });
    expect(tm.impactsWithheld).toBe(planNoYieldReason(checked));
    expect(tm.impactsWithheld).toMatch(/^No all-in basis is struck: .*; no return is re-run\.$/);
    expect(tm.headline).toBeNull();
    // The page's sentence says the threshold the code holds.
    expect(HEADLINE_METHOD.plan.join(" ")).toContain(`${IMPLIED_CAP_CEILING * 100}% or more`);
  });

  it("draws the panel in yield-on-cost terms, its unit said", () => {
    const html = renderToStaticMarkup(createElement(StressTestPanel, { test }));
    expect(html).toContain('data-qa="stress-headline" data-measure="yield_on_cost"');
    expect(html).toMatch(/Yield on cost on the OM&#x27;s figures 6\.\d\d% → \d\.\d\d% with the evidence/);
    expect(html).toContain("The OM&#x27;s stated yield on cost");
    expect(html).toContain('data-measure="yield_on_cost"');
    expect(html).toMatch(/Yield on cost \d\.\d\d% → \d\.\d\d%/);
    expect(html).not.toMatch(/Levered IRR/);
    expect(html).not.toContain("The screening model as it runs");
    expect(html).toContain(PLAN_NO_YIELD_MEANING.rent_growth!.replace(/'/g, "&#x27;"));
  });
});

// ── The plan re-runs' audit (2026-10-20) ─────────────────────────────────

describe("the plan re-runs strike no yield on a figure the plan does not reach", () => {
  const planEx = (kind: "value_add" | "lease_up" | "development" | "conversion", metrics: ReturnType<typeof row>[], summary = ""): ExtractionResult => ({
    ...APARTMENT,
    strategy: { kind, summary, capitalBudget: "", timeline: "" },
    metrics,
  });
  const t12Vacant = (loss: number) =>
    summarizeT12({
      periodEndDate: "2026-06-30",
      collectedRent: 4_400_000,
      vacancyLoss: -loss,
      otherIncome: 0,
      egi: 4_400_000 - loss,
      opex: [{ key: "payroll", label: "Payroll", amount: 620_000, page: "p. 2" }],
      totalOpex: null,
      noi: null,
      page: "p. 2",
    });
  const build = (ex: ExtractionResult, opts: { t12?: ReturnType<typeof summarizeT12>; mvm?: boolean; brokerComps?: StressTestArgs["brokerComps"] } = {}) => {
    const actualsIn = opts.t12 ? { t12: { summary: opts.t12, periodEnd: "2026-06-30" } } : undefined;
    const derived = deriveUnderwriteInputs(ex, "x", actualsIn, { debtIndex: FIVE });
    const actuals = actualsIn ? readActuals({ metrics: ex.metrics, strategy: inferStrategy(ex), rentRoll: null, t12: actualsIn.t12, assetClass: "multifamily" }) : null;
    return buildStressTest({
      extraction: ex,
      challenger: null,
      market: null,
      modelVsMarket: opts.mvm ? readFor(derived, { plan: true }) : null,
      actuals,
      derived,
      storedAssetClass: "multifamily",
      brokerComps: opts.brokerComps ?? null,
      readOn: READ_ON,
    });
  };
  const allText = (t: ReturnType<typeof buildStressTest>) =>
    [...t.rows.flatMap((r) => [r.omSays.text, r.gap?.text ?? "", r.impact?.note ?? "", r.noRerun ?? "", r.unchecked ?? "", ...r.evidence.map((e) => e.text)]), headlineSentence(t) ?? ""].join("\n");

  it("never strikes a lease-up's stabilized NOI at the vacancy its T-12 runs today (audit H1)", () => {
    const ex = planEx("lease_up", [
      row("Asking price", "$30,000,000"),
      row("Units", "153"),
      row("Rentable SF", "140,000"),
      row("Stabilized NOI", "$2,600,000"),
      row("Stabilized vacancy", "5.0%"),
      row("Pro forma gross potential rent", "$4,400,000"),
      row("Capital budget", "$3,000,000"),
    ]);
    const t = build(ex, { t12: t12Vacant(3_080_000) });
    expect(t.measure).toBe("yield_on_cost");
    const v = rowOf(t, "vacancy");
    // The T-12's 70% economic vacancy is shown beside the class's norm,
    // which decides the stated stabilized 5.0% with no published figure read
    // (the walkthrough of 2026-10-20): dollars, never deciding doors…
    expect(v.evidence[0].kind).toBe("rule_of_thumb");
    expect(v.evidence.find((e) => e.kind === "document")).toMatchObject({ value: 70 });
    expect(v.evidence.find((e) => e.kind === "document")!.text).toMatch(/never deciding it$/);
    expect(v.verdict).toBe("holds");
    // …and no yield on cost is struck at the T-12's: it had read "7.88% to -0.79%".
    expect(v.impact?.altValue ?? 2_600_000).toBe(2_600_000);
    expect(allText(t)).not.toMatch(/-0\.79%|−0\.79%/);
  });

  it("reads today's bill and the pro forma's line apart, every row searched, and holds a pro forma that already carries the reset (audit H2, M2)", () => {
    for (const today of ["Real estate taxes (in-place)", "Real estate taxes"]) {
      const ex = planEx("value_add", [
        row("Asking price", "$42,000,000"),
        row("Units", "153"),
        row("Rentable SF", "140,000"),
        row("NOI (stabilized, pro forma)", "$3,000,000"),
        row("Capital budget", "$1,800,000"),
        row(today, "$380,000"),
        row("Pro forma real estate taxes", "$532,000"),
        row("Assessed value", "$30,000,000"),
      ]);
      const tx = rowOf(build(ex), "taxes");
      // The pro forma's $532k is what the stabilized NOI carries: it is the
      // OM's figure tested, against today's $380k / $30M reset on the $42M.
      expect(tx.omSays.text, today).toBe("Pro forma real estate taxes: $532,000");
      expect(tx.evidence[0].value, today).toBe(532_000);
      expect(tx.verdict, today).toBe("holds");
      expect(tx.gap!.text, today).toBe("If the sale resets the assessment to the price, the bill is $532k, at the OM's $532k line.");
      expect(tx.noRerun, today).toBeUndefined();
    }
  });

  it("works no rate off a pro forma bill, and strikes no reset on a building the plan has yet to deliver (audit H2)", () => {
    // A development whose only bill is the pro forma's, over the land's
    // assessment: it had read a $1.05M bill off a 17.5% "rate".
    const dev = planEx("development", [
      row("Land price", "$6,000,000"),
      row("Proposed units", "200"),
      row("Total development cost", "$60,000,000"),
      row("Stabilized NOI", "$3,900,000"),
      row("Pro forma real estate taxes", "$700,000"),
      row("Assessed value", "$4,000,000"),
    ]);
    const t = build(dev);
    expect(t.measure).toBe("yield_on_cost");
    const tx = rowOf(t, "taxes");
    expect(tx.verdict).toBe("unchecked");
    expect(tx.unchecked).toBe(PLAN_TAX_NO_TODAY);
    expect(tx.impact).toBeNull();
    expect(allText(t)).not.toContain("$1.05M");
    // With today's bill on the land stated, the reset is a floor: its verdict
    // stands, and nothing is re-run on a building assessed when finished.
    const withToday = planEx("development", [...dev.metrics, row("Real estate taxes", "$100,000")].map((m) => (/Pro forma/.test(m.label) ? { ...m, value: "$120,000" } : m)));
    const tw = build(withToday);
    const tr = rowOf(tw, "taxes");
    expect(tr.omSays.text).toBe("Pro forma real estate taxes: $120,000");
    expect(tr.evidence[0].value).toBe(150_000);
    expect(tr.verdict).toBe("stretched");
    expect(tr.impact).toBeNull();
    expect(tr.noRerun).toBe(PLAN_TAX_NOT_ASSESSED);
    expect(PLAN_TAX_NOT_ASSESSED).toBe("The finished building is not assessed at the price, so the reset bill struck on it is a floor, not the bill the stabilized NOI carries, and no yield on cost is re-run on it.");
    // A conversion reads the same, on the building's price.
    const conv = build(planEx("conversion", withToday.metrics.map((m) => (m.label === "Land price" ? { ...m, label: "Asking price" } : m))));
    expect(conv.measure).toBe("yield_on_cost");
    expect(rowOf(conv, "taxes").verdict).toBe("stretched");
    expect(rowOf(conv, "taxes").noRerun).toBe(PLAN_TAX_NOT_ASSESSED);
  });

  it("strikes no reset bill on a rate past the ceiling, on any deal, and says why (audit H2)", () => {
    expect(TAX_RATE_CEILING).toBe(0.05);
    expect(STRESS_METHODS.find((m) => m.key === "taxes")!.limits.join(" ")).toContain(`past ${TAX_RATE_CEILING * 100}% is read as a misread`);
    // $380k over a $5M assessment is 7.6%: a fractional assessment or a misread.
    const ex = { ...APARTMENT, metrics: APARTMENT.metrics.map((m) => (m.label === "Assessed value" ? { ...m, value: "$5,000,000" } : m)) };
    const tx = rowOf(buildStressTest(apartmentArgs({ extraction: ex })), "taxes");
    expect(tx.verdict).toBe("unchecked");
    expect(tx.unchecked).toBe(TAX_RATE_MISREAD);
    expect(tx.impact).toBeNull();
    expect(tx.evidence[0]).toMatchObject({ value: null });
    expect(tx.evidence[0].text).toBe("$380k over $5M assessed is 7.60%, past the 5% ceiling the screen holds for an effective rate on market value, so no reset bill is struck on it");
  });

  it("strikes no yield where the moved NOI is at or under zero, or the moved yield a misread (audit H3, L4)", () => {
    const base = [
      row("Asking price", "$42,000,000"),
      row("Units", "153"),
      row("Rentable SF", "140,000"),
      row("NOI (stabilized, pro forma)", "$500,000"),
      row("Units to renovate", "120"),
      row("Renovation cost per unit", "$15,000"),
      row("Renovation premium", "$500/mo"),
      row("Achieved renovation premium", "$100/mo"),
    ];
    const t = build(planEx("value_add", base));
    const p = rowOf(t, "renovation_premium");
    // $400 a month on 120 doors is $576k a year, past the $500k NOI.
    expect(p.verdict).toBe("unsupported");
    expect(p.impact).toBeNull();
    expect(p.noRerun).toBe(
      "If the renovation premium is the achieved premium's $100 a month, the stabilized NOI falls to −$76k, at or under zero, which is no stabilized plan: the figures do not tie, so no yield on cost is re-run on it.",
    );
    // A basis whose comps' figure moves the yield past 25%.
    const comps: NonNullable<StressTestArgs["brokerComps"]> = {
      saleComps: [
        { name: "Alder", detail: "$60,000 per unit", support: "supports", note: "" },
        { name: "Birch", detail: "$62,000 per unit", support: "supports", note: "" },
        { name: "Cedar", detail: "$64,000 per unit", support: "supports", note: "" },
      ],
      leaseComps: [],
      redFlags: [],
      summary: "",
    };
    const rich = base.map((m) => (/stabilized, pro forma/.test(m.label) ? { ...m, value: "$3,000,000" } : m));
    const b = rowOf(build(planEx("value_add", rich), { brokerComps: comps }), "basis");
    expect(b.verdict).toBe("unsupported");
    expect(b.impact).toBeNull();
    expect(b.noRerun).toMatch(/^If the all-in cost is the memorandum's sale comps' median, \$9\.\d+M \(\$62k\/unit\), the yield on cost would be \d\d\.\d\d%, at or past the 25% the screen holds as a misread: the figures do not tie, so no yield on cost is re-run on it\.$/);
  });

  it("reads no premium a square foot or in percent as dollars a door, and says a move too small to print stands (audit M1)", () => {
    expect(monthlyOf("$0.30/SF/mo")).toBeNull();
    expect(monthlyOf("$3.60 PSF")).toBeNull();
    expect(monthlyOf("$0.25 per square foot")).toBeNull();
    expect(monthlyOf("8%")).toBeNull();
    expect(monthlyOf("8 percent")).toBeNull();
    expect(monthlyOf("$250 – 20% on cost")).toBe(250);
    expect(monthlyOf("$250/mo")).toBe(250);
    const metrics = [
      row("Asking price", "$42,000,000"),
      row("Units", "153"),
      row("Rentable SF", "140,000"),
      row("NOI (stabilized, pro forma)", "$3,000,000"),
      row("Units to renovate", "120"),
      row("Renovation cost per unit", "$15,000"),
      row("Renovation premium", "$0.30/SF/mo"),
      row("Achieved renovation premium", "$0.20/SF/mo"),
    ];
    const perFoot = rowOf(build(planEx("value_add", metrics)), "renovation_premium");
    expect(perFoot.verdict).toBe("unchecked");
    expect(perFoot.impact).toBeNull();
    // $191 against $190: $1,440 a year off $3M over $43.8M, 6.85% both ways.
    const close = metrics.map((m) => (m.label === "Renovation premium" ? { ...m, value: "$191/mo" } : m.label === "Achieved renovation premium" ? { ...m, value: "$190/mo" } : m));
    const p = rowOf(build(planEx("value_add", close)), "renovation_premium");
    expect(p.impact!.note).toBe(
      "If the renovation premium is the achieved premium's $190 a month, not the OM's $191 a month, the yield on cost stands at 6.85% to two places (the stabilized NOI $3M to $3M over the $43.8M total cost; the gap on the 120 doors to renovate, twelve months each, the stabilized NOI read as carrying the projected premium on every one).",
    );
  });

  it("strikes a forward purchase's yield on the price alone, and says so in the headline and the brief (audit M3)", () => {
    const ex = planEx(
      "development",
      [
        row("Purchase price", "$70,000,000"),
        row("Proposed units", "200"),
        row("Total development budget", "$55,000,000"),
        row("Stabilized NOI", "$4,200,000"),
        row("Real estate taxes", "$40,000"),
        row("Pro forma real estate taxes", "$700,000"),
        row("Assessed value", "$4,000,000"),
      ],
      "Forward purchase at completion of a 200-unit building",
    );
    const comps: NonNullable<StressTestArgs["brokerComps"]> = {
      saleComps: [
        { name: "Alder", detail: "$300,000 per unit", support: "supports", note: "" },
        { name: "Birch", detail: "$310,000 per unit", support: "supports", note: "" },
        { name: "Cedar", detail: "$320,000 per unit", support: "supports", note: "" },
      ],
      leaseComps: [],
      redFlags: [],
      summary: "",
    };
    const t = build(ex, { brokerComps: comps });
    expect(planSummary(ex, inferStrategy(ex))!.forward).toBe(true);
    expect(t.forward).toBe(true);
    expect(rowOf(t, "basis").impact).toMatchObject({ input: "totalCost", omValue: 70_000_000 });
    expect(t.headline!.omitted).toContainEqual({ key: "basis", label: "Basis", why: PLAN_BASIS_LEFT_OUT_FORWARD });
    expect(PLAN_BASIS_LEFT_OUT_FORWARD).toContain("the price, the buyer's whole cost at delivery");
    expect(stressSection(t).join("\n")).toContain("over its total cost (the price, the buyer's whole cost at delivery)");
    expect(rowOf(t, "taxes").noRerun).toBe(PLAN_TAX_NOT_ASSESSED);
    expect(HEADLINE_METHOD.plan[0]).toContain("or on a forward purchase over the price, the buyer's whole cost at delivery");
  });

  it("reads a bare 'return on cost' as the plan's only on a development or conversion with no renovation program (audit M4)", () => {
    const va = planEx("value_add", [
      row("Asking price", "$42,000,000"),
      row("Units", "153"),
      row("NOI (stabilized, pro forma)", "$3,000,000"),
      row("Capital budget", "$1,800,000"),
      row("Return on cost", "18%"),
    ]);
    expect(build(va).headline?.statedYoc ?? null).toBeNull();
    const dev = planEx("development", [
      row("Land price", "$6,000,000"),
      row("Proposed units", "200"),
      row("Total development cost", "$60,000,000"),
      row("Stabilized NOI", "$3,900,000"),
      row("Stabilized vacancy", "8.0%"),
      row("Stabilized gross potential rent", "$6,500,000"),
      row("Return on cost", "6.5%", "p. 30"),
    ]);
    expect(build(dev).headline?.statedYoc).toEqual({ pct: 6.5, label: "Return on cost", page: 30, namesCost: false });
  });

  it("writes a negative yield with the true minus (audit L1)", () => {
    // No re-run prints one any more (a moved NOI at or under zero is struck
    // nowhere); the writer is held to the minus sign wherever it is reached.
    for (const t of [build(planEx("lease_up", [row("Asking price", "$30,000,000"), row("Units", "153"), row("Stabilized NOI", "$2,600,000"), row("Stabilized vacancy", "5.0%"), row("Pro forma gross potential rent", "$4,400,000"), row("Capital budget", "$3,000,000")]), { t12: t12Vacant(3_080_000) })]) {
      expect(allText(t)).not.toMatch(/(?:^|[\s(])-\d+\.\d\d%/m);
    }
  });

  it("never reads holds where the re-run lowers the yield on cost half a point or more (audit L2)", () => {
    expect(YOC_MOVE_STRETCH_PTS).toBe(0.5);
    // The OM's 5.0% inside the survey's 6.2% ±2.2 margin, on a $25M gross:
    // 1.2 points of it is $300k off the stabilized NOI, 0.68 points of yield.
    const ex = planEx("value_add", [
      row("Asking price", "$42,000,000"),
      row("Units", "153"),
      row("NOI (stabilized, pro forma)", "$3,000,000"),
      row("Capital budget", "$1,800,000"),
      row("Stabilized vacancy", "5.0%"),
      row("Pro forma gross potential rent", "$25,000,000"),
    ]);
    const v = rowOf(build(ex, { mvm: true }), "vacancy");
    expect(v.evidence[0].kind).toBe("published");
    expect(v.verdict).toBe("stretched");
    expect(v.gap!.text).toMatch(/The gap is within the figure's ±[\d.]+-pt margin, but the yield on cost moves 0\.\d\d points on it \(6\.85% to 6\.\d\d%\)\.$/);
    // A small gross keeps it holding.
    const small = rowOf(build({ ...ex, metrics: ex.metrics.map((m) => (/gross potential/.test(m.label) ? { ...m, value: "$5,000,000" } : m)) }, { mvm: true }), "vacancy");
    expect(small.verdict).toBe("holds");
    expect(VERDICT_WORDS.find((w) => w.word === "stretched")!.line).toContain(`a plan's yield on cost by ${YOC_MOVE_STRETCH_PTS} points or more`);
    expect(HEADLINE_METHOD.plan.join(" ")).toContain(`${YOC_MOVE_STRETCH_PTS} points or more reads stretched, as a ${IRR_MOVE_STRETCH_BPS}-bps move`);
    expect(HEADLINE_METHOD.plan.join(" ")).toContain(`${IMPLIED_CAP_CEILING * 100}% or more, is struck nowhere`);
  });

  it("strikes no plan yield on a master lease's price, said why (audit L6)", () => {
    const ex = planEx("value_add", [
      row("Asking price", "$42,000,000"),
      row("Units", "153"),
      row("NOI (stabilized, pro forma)", "$3,000,000"),
      row("Capital budget", "$1,800,000"),
    ]);
    const master = { ...ex, interest: { kind: "leasehold", summary: "The master lease of the building, sublet to its tenants", share: "", groundLease: "", loan: "", page: "" } } as ExtractionResult;
    const t = build(master);
    expect(t.impactsWithheld).toBe(planMasterLeaseReason("the price buys a master lease of the building, sublet to its tenants — the position between two rents, not the building"));
    expect(t.impactsWithheld).toBe(
      "No yield on cost is struck: the price buys a master lease of the building, sublet to its tenants — the position between two rents, not the building, so the building's stabilized NOI over that price is no yield on cost; no return is re-run.",
    );
    // The deal page's plan card reads the same: no yield struck, said why.
    const p = planSummary(master, inferStrategy(master, null))!;
    expect(p.yieldOnCost).toBeNull();
    expect(p.yieldWithheld).toMatch(/^No yield on cost is struck: the price buys a master lease of the building/);
    expect(planSummary(ex, inferStrategy(ex, null))!.yieldOnCost).not.toBeNull();
    expect(t.measure).toBeUndefined();
    expect(t.headline).toBeNull();
    expect(t.rows.every((r) => r.impact == null)).toBe(true);
    expect(HEADLINE_METHOD.limits).toContain("On a plan deal it has none: the plan's stabilized NOI is the building's, and over the position's price it is no yield on cost.");
  });

  it("says on every public surface that the plan is re-run where the OM states its stabilized NOI and total cost (audit L5)", () => {
    const words = "where the OM states its stabilized NOI and total cost";
    expect(CANNOT.find((c) => c.heading === "No levered return on a plan")!.line).toContain(words);
    expect(CANNOT.every((c) => c.line.length <= 260)).toBe(true);
    expect(readFileSync("app/page.tsx", "utf8")).toContain(words);
    expect(SAMPLE_PLAN_NOTE).toContain("where it states its stabilized NOI and total cost");
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

describe("a survey's margin reaches the survey's figure and no other's", () => {
  it("with the survey over the region, the region's own edge decides how far past the OM is", () => {
    // Survey 9.5% ±2.2 (its edge 7.3), region 6.2% (its edge 6.15), OM 3.0%:
    // 3.15 points past the nearer edge, unsupported. Applying the survey's
    // margin to the region's figure had read 1.0 past — stretched.
    const rows: RateRow[] = [
      { series_id: "RRVRSOQ156N", obs_date: "2026-04-01", value: 6.2 },
      { series_id: "HVS_RVR_47900", obs_date: "2026-04-01", value: 9.5 },
      { series_id: "HVS_RVR_47900_MOE", obs_date: "2026-04-01", value: 2.2 },
    ];
    const ex = { ...APARTMENT, metrics: APARTMENT.metrics.map((m) => (m.label === "Occupancy" ? { ...m, value: "97%" } : m)) };
    const derived = deriveUnderwriteInputs(ex, "x", undefined, { debtIndex: FIVE });
    const t = buildStressTest({ extraction: ex, challenger: null, market: null, modelVsMarket: readFor(derived, { rates: readMetroRates("dc", rows, FIXTURE_NOW) }), actuals: null, derived, storedAssetClass: "multifamily", readOn: READ_ON });
    const v = rowOf(t, "vacancy");
    expect(v.evidence.slice(0, 2).map((e) => [e.label, e.value])).toEqual([
      ["Rental vacancy, metro area", 9.5],
      ["Rental vacancy, South Census region", 6.2],
    ]);
    expect(v.gap).toMatchObject({ value: 6.5, unit: "pts" });
    expect(v.verdict).toBe("unsupported");
    // The OM at 4.5%: 1.65 past the region's edge, inside the survey's — stretched.
    const near = { ...APARTMENT, metrics: APARTMENT.metrics.map((m) => (m.label === "Occupancy" ? { ...m, value: "95.5%" } : m)) };
    const nd = deriveUnderwriteInputs(near, "x", undefined, { debtIndex: FIVE });
    const n = buildStressTest({ extraction: near, challenger: null, market: null, modelVsMarket: readFor(nd, { rates: readMetroRates("dc", rows, FIXTURE_NOW) }), actuals: null, derived: nd, storedAssetClass: "multifamily", readOn: READ_ON });
    expect(rowOf(n, "vacancy").verdict).toBe("stretched");
  });
});

describe("the vacancy the row reads is the OM's allowance", () => {
  it("reads 'Vacancy & credit loss: 7.0%' as the allowance, and a dollar vacancy loss as no allowance", () => {
    const both = { ...APARTMENT, metrics: [...APARTMENT.metrics, row("Vacancy loss", "$400,400", "p. 9"), row("Vacancy & credit loss", "7.0%", "p. 21")] };
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: both })), "vacancy").omSays).toEqual({ text: "Vacancy & credit loss: 7.0%", value: 7, page: 21 });
    const dollars = { ...APARTMENT, metrics: [...APARTMENT.metrics, row("Vacancy loss", "$400,400", "p. 9")] };
    // Only the dollar line: the stated occupancy stands in, as before.
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: dollars })), "vacancy").omSays.text).toBe("Occupancy: 94% as stated — today's occupancy, not a pro forma assumption — which leaves 6.0% vacant");
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

  it.each(["$1,200/unit", "$1,200 per unit", "$32,000/mo", "$650/door"])("refuses a premium stated per unit, per door or by the month (%s): it is not the year's", (value) => {
    const i = rowOf(buildStressTest(apartmentArgs({ extraction: withRows({ label: "Insurance", value }) })), "insurance");
    expect(i.verdict).toBe("unchecked");
    expect(i.unchecked).toBe("The OM states no insurance premium.");
    expect(i.omSays.value).toBeNull();
    expect(i.impact ?? null).toBeNull();
  });

  it("reads the year's premium past a per-unit restatement of it", () => {
    const ex = withRows({ label: "Insurance", value: "$1,200/unit" }, { label: "Insurance premium", value: "$120,000" });
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: ex })), "insurance").omSays.value).toBe(120_000);
  });
});

describe("the rent roll's vacancy is read by count on a class priced by the unit, by area on one priced by the foot", () => {
  // 240 units, 218 occupied (9.2% vacant by count), 90.6% of the area.
  const summary = { unitCount: 240, occupiedUnits: 218, totalSf: 220_720, occupiedSf: 200_000, sfWeightedOccupancy: 0.906, waltYears: 0.6, weightedAvgRentPsf: 30, expiryBuckets: null, expiryCoveredSf: 0, truncated: false };
  const withRoll = (assetClass: string) =>
    rowOf(
      buildStressTest(
        apartmentArgs({
          storedAssetClass: assetClass,
          actuals: readActuals({ metrics: APARTMENT.metrics, strategy: inferStrategy(APARTMENT), rentRoll: { summary, asOf: "2026-05-31" }, t12: null, assetClass }),
        }),
      ),
      "vacancy",
    ).evidence[0];

  it("an apartment building by its doors", () => {
    expect(withRoll("multifamily")).toMatchObject({ value: 9.2, text: "9.2% vacant (by count, 218 of 240 units occupied, as of May 31, 2026)" });
  });

  it("an office by its area", () => {
    expect(withRoll("office")).toMatchObject({ value: 9.4, text: "9.4% vacant (by area, SF-weighted, as of May 31, 2026)" });
  });
});

describe("a combined 'Taxes & insurance' row is neither line alone", () => {
  const combined: ExtractionResult = {
    ...APARTMENT,
    metrics: [...APARTMENT.metrics.filter((m) => m.label !== "Insurance" && m.label !== "Real estate taxes"), row("Taxes & insurance", "$500,000", "p. 15")],
  };
  const t12Combined = { ...T12, opex: [{ key: "taxes", label: "Taxes & insurance", amount: 530_000, page: "p. 2" }, ...T12.opex.filter((l) => l.key !== "taxes" && l.key !== "insurance")] };

  it("the OM's combined row reads as no tax bill and no premium", () => {
    const t = buildStressTest(apartmentArgs({ extraction: combined }));
    expect(rowOf(t, "taxes").omSays.text).toBe("The OM states no tax bill.");
    expect(rowOf(t, "insurance").omSays.text).toBe("The OM states no insurance premium.");
  });

  it("the T-12's combined line is neither the tax line nor the insurance line", () => {
    const actuals = readActuals({ metrics: APARTMENT.metrics, strategy: inferStrategy(APARTMENT), rentRoll: null, t12: { summary: t12Combined, periodEnd: "2026-06-30" }, assetClass: "multifamily" });
    const t = buildStressTest(apartmentArgs({ actuals }));
    expect(rowOf(t, "taxes").evidence.some((e) => e.label === "The deal's T-12 tax line")).toBe(false);
    expect(rowOf(t, "insurance").evidence.some((e) => e.label === "The deal's T-12 insurance line")).toBe(false);
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
    // The bare altFigure (95, no unit) is never printed; altBasis says it in words.
    expect(other.method).toBe("The challenger's own critique, holding the figure against a rule of thumb: a stabilized apartment building runs about 95% occupied; no reader tests it and no figure is swapped.");
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
    // A rent or renovation premium is never the insurance row's.
    expect(k("Market rent premium of $200 is unproven")).toBe("market_rent");
    expect(k("Rent growth of 4% a year")).toBe("rent_growth");
    expect(k("Renovation premium $200/mo")).toBe("renovation_premium");
    expect(k("Premium at the expiring policy's renewal")).toBe("insurance");
    expect(k("Rent premium of $150")).not.toBe("insurance");
    // A figure per unit is the basis's only beside a price word; an expense
    // line's level is the operating expenses'.
    expect(k("Payroll of $1,200 per unit")).toBe("opex");
    expect(k("Management fee of 2.5% is light")).toBe("opex");
    expect(k("Asking $275,000 per unit")).toBe("basis");
    expect(k("Pricing at $310 psf")).toBe("basis");
    // A rent's growth rate is the rent growth row's, whoever's rent it is.
    expect(k("Market rent growth of 4% a year")).toBe("rent_growth");
    expect(k("Pro forma rent growth")).toBe("rent_growth");
    expect(k("Market rents 12% over the comps")).toBe("market_rent");
    // An expense's growth in words is the growth row's; its level the opex row's.
    expect(k("Operating expenses grow 2% a year")).toBe("expense_growth");
    expect(k("Operating expenses increasing 2% annually")).toBe("expense_growth");
    expect(k("Operating expenses of $1.2M are light")).toBe("opex");
    // A debt service coverage is the loan's, never a policy's.
    expect(k("Debt service coverage at a rate premium")).toBe("debt");
    expect(k("Coverage limits at the expiring premium")).toBe("insurance");
  });
});

// ── The methodology is true of the code ──────────────────────────────────

/**
 * For each STRESS_METHODS sentence, a label or publisher the reader emits
 * for it — read off the evidence of the fixtures below, which between them
 * hand the reader every source the methodology names.
 */
const AGAINST_SOURCES: Record<StressKey, string[]> = {
  basis: ["The memorandum's sale comps", "Recorded sales (", "Other memoranda's asking prices in"],
  exit_cap: ["The OM's going-in cap", "The OM's pro forma cap", "10-year Treasury", "cap (research tracker)"],
  debt: ["The lender's quote on file", "The index the model prices off", "Lender tests at screening defaults", "Negative leverage"],
  noi: ["The deal's T-12 NOI", "The rent roll's in-place rent", "The OM's in-place NOI against its pro forma", "The OM's other income against the T-12's"],
  vacancy: ["Rental vacancy, metro area", "vacancy (research tracker)", "The deal's rent roll", "The deal's T-12 economic vacancy", "a rule of thumb"],
  rent_growth: ["Asking rent, apartments", "Asking rent, all home types", "sitting tenants", "Rents charged by", "allowance on the regulated units"],
  expense_growth: ["Consumer prices", "Core CPI", "insurance premiums", "breakeven"],
  taxes: ["The bill the OM's own figures imply", "The stated tax abatement", "The deal's T-12 tax line"],
  insurance: ["moved by the national premium index", "The deal's T-12 insurance line"],
  market_rent: ["The memorandum's lease comps", "The rent roll's in-place rent", "Asking rent, apartments, metro area"],
  opex: ["The deal's T-12 operating expenses", "The deal's T-12 expense lines", "The class's expense ratio, a rule of thumb"],
  renovation_premium: ["Achieved premium", "classic and renovated rents", "The program's pace against the turnover the OM states"],
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
      row("Annual turnover", "35%", "p. 23"),
      row("Renovation period", "24 months", "p. 22"),
      row("Operating expenses (pro forma)", "$1,640,000", "p. 9"),
      row("Management fee", "3.0%", "p. 9"),
      row("Payroll", "$590,000", "p. 9"),
      row("Other income", "$110,000", "p. 9"),
      // Under the going-in cap, so the going-in cap decides and it is beside it.
      row("Pro forma cap rate", "5.60%", "p. 6"),
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
    // The market check's stored figures: Zillow's apartment asking rent for
    // the metro, read beside the market rent.
    market: { checks: [], summary: "", liveBrief: { metro: "Washington DC", readOn: READ_ON, lines: [], figures: [{ key: "zori_mfr_rent", label: "Asking rent, apartments", value: 2150, unit: "usd", asOf: "2026-08-31" }] } },
    modelVsMarket: readFor(derived, { now: new Date("2026-10-05T12:00:00Z"), regulation }),
    actuals,
    derived,
    storedAssetClass: "multifamily",
    brokerComps: {
      saleComps: [
        { name: "The Ellery", detail: "$252,000 per unit, 5.6% cap, sold Mar 2026", support: "supports", note: "" },
        { name: "Park Place", detail: "$261K/door, 5.4% cap", support: "favorable", note: "" },
      ],
      leaseComps: [
        { name: "The Rowan", detail: "$2,050/mo one-bedroom", support: "supports", note: "" },
        { name: "The Calder", detail: "$2,300/mo two-bedroom", support: "supports", note: "" },
        { name: "Hale House", detail: "$2,250/mo two-bedroom", support: "supports", note: "" },
      ],
      redFlags: [],
      summary: "",
    },
    recordedSales: { count: 4, medianPerSqft: 310, medianPerUnit: 240_000, providerName: "Philadelphia OPA", retrievedAt: "2026-10-01", href: "https://example.test/records" },
    pastScreens: { count: 3, perUnitMedian: 255_000, perSfMedian: 290, market: "Washington DC" },
    // A term sheet on file whose rate the deal's model carries.
    loanQuote: { ratePct: 5.6, stated: "5.60%", floating: false, filename: "term-sheet.pdf", asOf: "2026-10-03" },
    readOn: "2026-10-05",
  });
  // An office deal in Washington, whose vacancy and exit read the research
  // tracker's band and cap range (lib/tracker-read), and whose rents read
  // the national index of office lessors' rents.
  const office: ExtractionResult = {
    ...APARTMENT,
    assetClass: "office",
    metrics: [...APARTMENT.metrics.filter((m) => !/Units|Pro forma rent/.test(m.label)), row("Operating expenses (pro forma)", "$1,300,000", "p. 9")],
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
    expect(x.method).toMatch(/^The OM's exit cap against the OM's going-in cap \(the offering memorandum\), the one figure that decides; beside it, not deciding: .*cap \(research tracker\)/);
  });

  it("holds a commercial rent growth to its lessors' national index, and never to a regulation's allowance", () => {
    const office = rowOf(officeTest, "rent_growth");
    expect(office.gap!.text).toMatch(
      /^Held to the national index of rents charged by lessors of professional and office buildings, the figure for this kind of rent, the nation's lessors of this kind of building rather than the metro's: [+-]\d+\.\d% over the year to [A-Z][a-z]{2} \d{4} \(BLS via FRED\), a single year's change\. The OM's 4\.0%\/yr is /,
    );
    // The Brooklyn regime's allowance is shown first, beside the figure
    // that decides — Zillow's apartment asking rents — and never held to.
    const g = rowOf(apartmentTest, "rent_growth");
    expect(g.evidence[0].label).toMatch(/allowance on the regulated units/);
    expect(g.impact!.evidenceIndex).toBe(g.evidence.findIndex((e) => e.label === "Asking rent, apartments"));
    expect(g.method).toMatch(/^The OM's rent growth against asking rent, apartments \(Zillow Research\), the one figure that decides; beside it, not deciding: .*allowance on the regulated units/i);
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

  it("the basis reads the memorandum's comps, the recorded sales and the past screens, best first, and no price band", () => {
    const b = rowOf(apartmentTest, "basis");
    // The reader's past screens are other memoranda's asks — nobody's
    // publication and never a trade — filed as a rule of thumb under the
    // reader's own name; the class's price band is no evidence at all.
    expect(b.evidence.map((e) => e.kind)).toEqual(["om_internal", "published", "rule_of_thumb"]);
    expect(b.evidence[2]).toMatchObject({ label: "Other memoranda's asking prices in Washington DC (your past screens): asks, not trades", publisher: "your past screens", scope: "metro", value: 255_000 });
    expect(b.evidence.some((e) => /band any market delivers in|Prices the class trades in/.test(`${e.label} ${e.text}`))).toBe(false);
    // Park Place is graded favorable — less comparable, in a way that
    // flatters the ask — so The Ellery is the one comp graded clean: named,
    // too few for a median, deciding nothing (the review of 2026-10-23). The
    // recorded sales' median of four decides.
    expect(b.evidence[0].value).toBeNull();
    expect(b.evidence[0].text).toContain("The Ellery $252k/unit — one graded clean, too few for a median (3 or more), so none is set against the ask");
    expect(b.evidence[1]).toMatchObject({ value: 240_000, href: "https://example.test/records", asOf: "2026-10-01" });
    expect(b.decidedBy).toBe(1);
    expect(b.gap).toMatchObject({ unit: "pct", value: 14.4 });
    expect(b.gap!.text).toBe("The ask's $275k/unit is 14.4% over the median of recorded sales (Philadelphia OPA), $240k/unit.");
    expect(b.verdict).toBe("stretched");
    expect(b.impact!.input).toBe("purchasePrice");
    expect(b.impact!.altValue).toBeCloseTo((42_000_000 * 240_000) / 274_510, 0);
    // The note names whose figure the price is re-run at, and that the loan
    // re-sizes with the price — the recorded sales', not "the OM's".
    expect(b.impact!.note).toMatch(
      /^If the price is the recorded sales' median \(Philadelphia OPA\), \$36\.72M \(\$240k\/unit\), at the model's loan-to-cost \(the loan re-sizes with the price\), not the OM's \$42M \(\$275k\/unit\), the levered IRR moves from/,
    );
  });

  it("says why recorded sales carry no median: too few under the floor, and none struck a unit over it", () => {
    const recorded = (count: number, medianPerSqft: number | null = null) =>
      rowOf(
        buildStressTest({
          extraction: APARTMENT,
          challenger: null,
          market: null,
          modelVsMarket: null,
          actuals: null,
          derived: null,
          storedAssetClass: "multifamily",
          recordedSales: { count, medianPerSqft, medianPerUnit: null, providerName: "Philadelphia OPA", retrievedAt: "2026-10-01" },
          readOn: READ_ON,
        }),
        "basis",
      ).evidence.find((e) => e.label.startsWith("Recorded sales"))!;
    expect(recorded(2)).toMatchObject({ text: "2 recorded sales, too few for a median /unit", value: null });
    expect(recorded(1).text).toBe("1 recorded sale, too few for a median /unit");
    // Six sales clear the floor; a record states no unit count, so no
    // per-unit median is struck — but the deal states its area, so the
    // $/SF median is judged per SF (lib/comp-detail `basisTracks`' rule).
    expect(recorded(6, 310)).toMatchObject({ text: "median $310/SF over 6 recorded sales, judged per SF", value: 310 });
    expect(recorded(6)).toMatchObject({ text: "6 recorded sales; no per-unit median is struck on recorded sales", value: null });
  });

  it("strikes the comps' figure only over those the comps step graded supports, naming the favorable and the stretched apart", () => {
    const comps = {
      saleComps: [
        { name: "The Ellery", detail: "$252,000 per unit, 5.6% cap", support: "supports" as const, note: "" },
        { name: "Vue", detail: "$298,000 per unit", support: "stretched" as const, note: "" },
        { name: "Park Place", detail: "$261K/door, 5.4% cap", support: "favorable" as const, note: "" },
        { name: "The Rowan", detail: "$249,000 per unit", support: "supports" as const, note: "" },
        { name: "Hallam", detail: "$258,000 per unit", support: "supports" as const, note: "" },
      ],
      leaseComps: [],
      redFlags: [],
      summary: "",
    };
    const b = rowOf(buildStressTest(apartmentArgs({ brokerComps: comps })), "basis");
    // Three graded supports make the median; Park Place, graded favorable
    // (less comparable, in a way that flatters the ask, lib/anthropic/
    // prompts), is never clean.
    expect(b.evidence[0].value).toBe(252_000);
    expect(b.evidence[0].text).toBe(
      "5 of 5 state a figure /unit; graded clean (supports): The Ellery $252k/unit; The Rowan $249k/unit; Hallam $258k/unit — median $252k/unit over the 3; left out, graded favorable by the comps step (less comparable, in a way that flatters the ask): Park Place $261k/unit; left out, graded stretched by the comps step (not comparable to the subject): Vue $298k/unit",
    );
    // Favorable alone is no clean comp: nothing is set against the ask.
    const favorable = rowOf(buildStressTest(apartmentArgs({ brokerComps: { ...comps, saleComps: [comps.saleComps[2]] } })), "basis");
    expect(favorable.evidence[0]).toMatchObject({ value: null });
    expect(favorable.evidence[0].text).toContain("none graded clean (supports)");
    expect(favorable.verdict).toBe("unchecked");
    expect(favorable.unchecked).toBe(basisFloorWhy(0, 1, "/unit"));
    // None graded clean: no figure, and the row has nothing to decide on.
    const none = rowOf(buildStressTest(apartmentArgs({ brokerComps: { ...comps, saleComps: [comps.saleComps[1]] } })), "basis");
    expect(none.evidence[0]).toMatchObject({
      value: null,
      text: "1 of 1 state a figure /unit, none graded clean (supports), so none is set against the ask; left out, graded stretched by the comps step (not comparable to the subject): Vue $298k/unit",
    });
    expect(none.verdict).toBe("unchecked");
  });

  it("carries the OM's own validated page on its own pieces, a median's only where its comps share one", () => {
    const three = {
      saleComps: [
        { name: "The Brixton", detail: "$252,000 per unit", support: "supports" as const, note: "", page: "p. 14" },
        { name: "Hallam", detail: "$250,000 per unit", support: "supports" as const, note: "", page: "p. 14" },
        { name: "The Rowan", detail: "$256,000 per unit", support: "supports" as const, note: "", page: "p. 14" },
        { name: "Vue", detail: "$298,000 per unit", support: "stretched" as const, note: "", page: "p. 15" },
      ],
      leaseComps: [],
      redFlags: [],
      summary: "",
    };
    const t = buildStressTest(apartmentArgs({ brokerComps: three }));
    const b = rowOf(t, "basis");
    // The clean comps' own page, validated against the deck's 48 pages; the
    // left-out comp's page is no page of the figure.
    expect(b.evidence[0]).toMatchObject({ kind: "om_internal", value: 252_000, page: 14 });
    expect(rowWords(b).against).toBe("$252k/unit (the median of the 3 comps graded clean, OM p. 14)");
    // The verdict's brief cites the same page on the piece's own line.
    const briefLine = stressSection(t).find((l) => l.startsWith("- ") && l.includes("(basis)"))!;
    expect(briefLine).toContain(`${b.evidence[0].label}: ${b.evidence[0].text} (OM p. 14; the memorandum's own figure)`);
    // A page past the deck's length is no page: nothing new is printed.
    const past = rowOf(buildStressTest(apartmentArgs({ brokerComps: { ...three, saleComps: three.saleComps.map((c) => ({ ...c, page: "p. 99" })) } })), "basis");
    expect(past.evidence[0].page).toBeUndefined();
    // Clean comps on two pages: their median, no one page.
    const split = rowOf(buildStressTest(apartmentArgs({ brokerComps: { ...three, saleComps: [three.saleComps[0], three.saleComps[1], { ...three.saleComps[2], page: "p. 15" }] } })), "basis");
    expect(split.evidence[0].page).toBeUndefined();
    // The going-in cap's own row's page.
    const x = rowOf(t, "exit_cap");
    expect(x.evidence[0]).toMatchObject({ label: "The OM's going-in cap", page: 6 });
    expect(rowWords(x).against).toBe("5.71% (OM p. 6)");
  });

  it("dates each published piece by its own period, a day only for a day's figure", () => {
    const t = buildStressTest(apartmentArgs());
    const ev = t.rows.flatMap((r) => r.evidence);
    const zillow = ev.find((e) => e.label === "Asking rent, apartments")!;
    // Zillow's month is dated its last day; CPI's its first: both a month.
    expect(evidencePeriod(zillow)).toEqual({ said: "Aug 2026", inText: true });
    expect(evidenceWhen(zillow)).toBe("");
    const cpi = ev.find((e) => e.label === "Consumer prices (CPI, all items)")!;
    expect(evidencePeriod(cpi)).toEqual({ said: "Aug 2026", inText: true });
    expect(rowWords(rowOf(t, "expense_growth")).against).toMatch(/^\+[\d.]+% over the year to Aug 2026 \(BLS via FRED\)$/);
    // The 10-year is a day's figure.
    const ten = ev.find((e) => e.label === "10-year Treasury, as the market check read it")!;
    expect(evidencePeriod(ten)).toEqual({ said: "Sep 17, 2026", inText: true });
    // A stored day the text does not date stays a day; no date, no period.
    expect(evidencePeriod({ asOf: "2026-06-30", text: "$2.2M" })).toEqual({ said: "Jun 30, 2026", inText: false });
    expect(evidenceWhen({ asOf: null, text: "x", kind: "published" })).toBe(", undated");
    expect(evidenceWhen({ asOf: null, text: "x", kind: "om_internal" })).toBe("");
    // No growth evidence anywhere is cited as a rate a year.
    for (const k of ["rent_growth", "expense_growth"] as const) expect(rowWords(rowOf(t, k)).against).not.toMatch(/\/yr/);
  });

  it("dates a piece read at a moment by its UTC day, and gives a table a date, and a page a dateTime, only for the period its words say", () => {
    // A recorded-sales pull stores the moment it read the records (lib/
    // public-comps/run `retrievedAt: new Date().toISOString()`).
    const stamp = new Date(Date.UTC(2026, 9, 12, 23, 41, 7, 512)).toISOString();
    expect(stamp).toBe("2026-10-12T23:41:07.512Z");
    expect(isoDayOf(stamp)).toBe("2026-10-12");
    expect(isoDayOf("2026-10-12T19:41:07-04:00")).toBe("2026-10-12");
    expect(isoDayOf("2026-10-12T22:41:07-04:00")).toBe("2026-10-13");
    expect(isoDayOf("Q2 2026")).toBe("Q2 2026");
    const sale = { asOf: stamp, text: "Median $250k/unit over 4 recorded sales, thin" };
    expect(evidencePeriod(sale)).toEqual({ said: "Oct 12, 2026", inText: false });
    expect(whenWords(stamp)).toBe("Oct 12, 2026");
    expect(evidenceDay(sale)).toBe("2026-10-12");
    expect(evidenceDateTime(sale)).toBe("2026-10-12");
    // At the source too: a recorded-sales piece is dated its day.
    const t = buildStressTest(
      apartmentArgs({ recordedSales: { count: 4, medianPerSqft: 310, medianPerUnit: 240_000, providerName: "Philadelphia OPA", retrievedAt: stamp, href: null } }),
    );
    const recorded = rowOf(t, "basis").evidence.find((e) => e.label.startsWith("Recorded sales"))!;
    expect(recorded).toBeDefined();
    expect(recorded.asOf).toBe("2026-10-12");
    expect(evidenceShort(rowOf(t, "basis"), recorded)).not.toContain("T23:41");
    // A month's figure stored under its first day is a month, never a day.
    const cpi = { asOf: "2026-08-01", text: "+2.9% over the year to Aug 2026" };
    expect(evidenceDay(cpi)).toBeNull();
    expect(evidenceDateTime(cpi)).toBe("2026-08");
    // A quarter has no valid HTML date string: no dateTime.
    const survey = { asOf: "2026-04-01", text: "6.2% ±2.2 pts (Q2 2026)" };
    expect(evidencePeriod(survey)).toEqual({ said: "Q2 2026", inText: true });
    expect(evidenceDay(survey)).toBeNull();
    expect(evidenceDateTime(survey)).toBeNull();
    // A day's figure is a day.
    expect(evidenceDay({ asOf: "2026-06-30", text: "$2.2M" })).toBe("2026-06-30");
    expect(evidenceDay({ asOf: null, text: "x" })).toBeNull();
  });

  it("prints the memorandum's own page beside the publisher, as the report and the brief say it", () => {
    expect(sourceWithPage({ publisher: "the offering memorandum", page: 14 })).toBe("OM p. 14");
    expect(sourceWithPage({ publisher: "the deal's T-12", page: 3 })).toBe("the deal's T-12, OM p. 3");
    expect(sourceWithPage({ publisher: "the offering memorandum" })).toBe("the offering memorandum");
    expect(sourceWithPage({ publisher: "Zillow Research", page: 0 })).toBe("Zillow Research");
  });

  it("says the levered return was re-run only where a row draws a re-run", () => {
    const t = buildStressTest(apartmentArgs());
    expect(stressReadLine(t)).toMatch(/; the levered return re-run with one input swapped for the evidence's, in code\.$/);
    // Every row holding or stripped of its re-run: nothing is withheld, and
    // nothing is re-run, so the line ends on its counts.
    const none = { ...t, rows: t.rows.map((r) => ({ ...r, impact: null })) };
    expect(stressReadLine(none)).not.toContain("re-run");
    expect(stressReadLine(none)).toMatch(/unchecked\.$|\)\.$/);
    const held = { ...t, rows: t.rows.map((r) => (r.verdict === "unchecked" ? r : { ...r, verdict: "holds" as const })) };
    expect(stressReadLine(held)).not.toContain("re-run");
  });

  it("leads a document with the larger move within a verdict, a row with no re-run after", () => {
    const t = buildStressTest(apartmentArgs());
    const led = leadRows(t, 10);
    const rank = { unsupported: 0, stretched: 1 } as Record<string, number>;
    for (let i = 1; i < led.length; i++) {
      const [a, b] = [led[i - 1], led[i]];
      if (rank[a.verdict] !== rank[b.verdict]) {
        expect(rank[a.verdict]).toBeLessThan(rank[b.verdict]);
        continue;
      }
      const [sa, sb] = [moveSize(a), moveSize(b)];
      if (sa == null) expect(sb).toBeNull();
      else if (sb != null) expect(sa).toBeGreaterThanOrEqual(sb);
    }
    // A synthetic pair: the larger move first, whatever the test's order.
    const small = { ...rowOf(t, "rent_growth"), verdict: "stretched" as const };
    const big = { ...small, key: "vacancy" as const, impact: { ...small.impact!, baseIrrPct: 12, altIrrPct: 6 } };
    const none = { ...small, key: "noi" as const, impact: null };
    const s2 = { ...small, impact: { ...small.impact!, baseIrrPct: 12, altIrrPct: 11 } };
    expect(leadRows({ ...t, rows: [none, s2, big] }).map((r) => r.key)).toEqual(["vacancy", "rent_growth", "noi"]);
  });

  it("names one or two clean comps with their count, never a figure: under three, and with no recorded sales' median, the price stands unchecked on the comps' own floor (the review of 2026-10-23)", () => {
    const comp = (name: string, detail: string) => ({ name, detail, support: "supports" as const, note: "" });
    const one = rowOf(buildStressTest(apartmentArgs({ brokerComps: { saleComps: [comp("The Ellery", "$232,000 per unit")], leaseComps: [], redFlags: [], summary: "" }, recordedSales: null })), "basis");
    expect(one.evidence[0]).toMatchObject({ value: null });
    expect(one.evidence[0].text).toBe("1 of 1 state a figure /unit; graded clean (supports): The Ellery $232k/unit — one graded clean, too few for a median (3 or more), so none is set against the ask");
    expect(one.verdict).toBe("unchecked");
    expect(one.unchecked).toBe(
      "Fewer than 3 of the memorandum's sale comps graded clean (supports) state a figure /unit (1 of 1), and no recorded sales' median stands beside them, so no median is struck: the comps' own floor.",
    );
    expect(one.impact).toBeNull();
    const two = rowOf(
      buildStressTest(apartmentArgs({ brokerComps: { saleComps: [comp("The Ellery", "$232,000 per unit"), comp("Vue", "$236,000 per unit")], leaseComps: [], redFlags: [], summary: "" }, recordedSales: null })),
      "basis",
    );
    expect(two.evidence[0]).toMatchObject({ value: null });
    expect(two.evidence[0].text).toContain("two graded clean, too few for a median (3 or more), so none is set against the ask");
    expect(two.verdict).toBe("unchecked");
    expect(two.unchecked).toBe(basisFloorWhy(2, 2, "/unit"));
    // The floor's sentence is the market-rent row's own, word for word but the noun.
    expect(basisFloorWhy(2, 2, "/unit")).toMatch(/^Fewer than 3 of the memorandum's sale comps graded clean \(supports\) state a figure \/unit \(2 of 2\).*, so no median is struck: the comps' own floor\.$/);
    // Two comps beside a recorded sales' median of four: the median decides.
    const withSales = rowOf(
      buildStressTest(apartmentArgs({ brokerComps: { saleComps: [comp("The Ellery", "$232,000 per unit"), comp("Vue", "$236,000 per unit")], leaseComps: [], redFlags: [], summary: "" }, recordedSales: { count: 4, medianPerSqft: null, medianPerUnit: 240_000, providerName: "Philadelphia OPA", retrievedAt: "2026-10-01" } })),
      "basis",
    );
    expect(withSales.evidence[withSales.decidedBy!].label).toMatch(/^Recorded sales \(/);
    // Three make a median, and a median can call the basis unsupported.
    const three = rowOf(
      buildStressTest(
        apartmentArgs({ brokerComps: { saleComps: [comp("The Ellery", "$232,000 per unit"), comp("Vue", "$236,000 per unit"), comp("Hallam", "$230,000 per unit")], leaseComps: [], redFlags: [], summary: "" } }),
      ),
      "basis",
    );
    expect(three.verdict).toBe("unsupported");
  });

  it("judges the basis on trades only: the reader's own past asks are shown beside it and never decide, not even alone", () => {
    const comps = { saleComps: ["The Ellery", "Hallam", "The Rowan"].map((name) => ({ name, detail: "$256,500 per unit", support: "supports" as const, note: "" })), leaseComps: [], redFlags: [], summary: "" };
    const pastScreens = { count: 4, perUnitMedian: 300_000, perSfMedian: null, market: "Washington DC" };
    const b = rowOf(buildStressTest(apartmentArgs({ brokerComps: comps, pastScreens })), "basis");
    // 7.0% over the comps; the asks at $300k would have read it under one.
    expect(b.verdict).toBe("stretched");
    expect(b.ruleOfThumbOnly).toBeUndefined();
    expect(b.method).toMatch(/against the memorandum's sale comps \(the offering memorandum\), the one figure that decides; beside it, not deciding: other memoranda's asking prices/);
    // The asks alone are asks, not trades: the row stands unchecked, said so.
    const asksOnly = rowOf(buildStressTest(apartmentArgs({ pastScreens, recordedSales: null })), "basis");
    expect(asksOnly.verdict).toBe("unchecked");
    expect(asksOnly.unchecked).toBe("No trade carries a figure the ask can be set against: your past screens' asking prices are asks, not trades, and decide nothing.");
    expect(asksOnly.evidence.find((e) => e.publisher === "your past screens")).toMatchObject({ value: 300_000 });
  });

  it("strikes the basis verdict against the same median its sentence names, and prints no count it does not have", () => {
    // The comps' median $232k: the ask 18.3% over it. Recorded sales at
    // $290k would read it under — but the sentence names the comps, so the
    // verdict does too.
    const comps = {
      saleComps: ["The Ellery", "Vue", "Hallam"].map((name) => ({ name, detail: "$232,000 per unit", support: "supports" as const, note: "" })),
      leaseComps: [],
      redFlags: [],
      summary: "",
    };
    const recordedSales = { count: 6, medianPerSqft: null, medianPerUnit: 290_000, providerName: "Philadelphia OPA", retrievedAt: "2026-10-01" };
    const b = rowOf(buildStressTest(apartmentArgs({ brokerComps: comps, recordedSales })), "basis");
    expect(b.gap!.text).toBe("The ask's $275k/unit is 18.3% over the median of the memorandum's sale comps, $232k/unit.");
    expect(b.verdict).toBe("unsupported");
    // No unit count stated: the price is said without a "?" for it.
    const noCount: ExtractionResult = { ...APARTMENT, metrics: APARTMENT.metrics.filter((m) => m.label !== "Units") };
    const t = buildStressTest(apartmentArgs({ extraction: noCount, brokerComps: comps }));
    for (const r of t.rows) expect(r.omSays.text).not.toContain("?");
  });

  it("the office deal's vacancy and exit read the tracker as published figures, the metro's", () => {
    const v = rowOf(officeTest, "vacancy");
    expect(v.evidence.some((e) => /vacancy \(research tracker\)/.test(e.label) && e.kind === "published" && e.scope === "metro")).toBe(true);
    const g = rowOf(officeTest, "rent_growth");
    expect(g.evidence[0]).toMatchObject({ scope: "nation", publisher: "BLS via FRED" });
  });
});

// ── The basis agrees with every other surface that speaks to it ──────────

describe("the basis row reads the deal as the card, the comps tick and the brief do", () => {
  const comps = (detail: string, n = 3, support: "supports" | "favorable" | "stretched" = "supports") => ({
    saleComps: Array.from({ length: n }, (_, i) => ({ name: `Comp ${i + 1}`, detail, support, note: "" })),
    leaseComps: [],
    redFlags: [],
    summary: "",
  });
  const basisOf = (extraction: ExtractionResult, args: Partial<StressTestArgs> = {}) =>
    buildStressTest({ extraction, challenger: null, market: null, modelVsMarket: null, actuals: null, derived: null, readOn: READ_ON, ...args }).rows.find((r) => r.key === "basis");
  const deal = (metrics: ReturnType<typeof row>[], extra: Partial<ExtractionResult> = {}): ExtractionResult => ({ ...APARTMENT, metrics, ...extra });

  it("divides a bulk condominium purchase's price by the units offered, as the card's basis does", () => {
    const condo = deal([row("Asking price", "$12,600,000"), row("Units offered", "42"), row("Units in the condominium", "120"), row("Total units", "120")], { assetClass: "Condominium units" });
    const b = basisOf(condo, { brokerComps: comps("$290,000 per unit") })!;
    expect(basisTag(condo, "stabilized", condo.assetClass)).toBe("$300k/unit");
    expect(b.omSays.text).toBe("$300k/unit (Asking price $12,600,000 over 42 units offered)");
    expect(b.omSays.value).toBe(300_000);
    expect(b.verdict).toBe("holds");
  });

  it("judges a piece per SF where it states no figure on the class's basis and the deal states its area", () => {
    // The memorandum's comps state $/SF alone: judged per SF, never "no comp".
    const sfComps = basisOf(APARTMENT, { brokerComps: comps("$250/SF, 5.5% cap") })!;
    expect(sfComps.omSays.text).toBe("$300/SF (Asking price $42,000,000 over 140,000 SF)");
    expect(sfComps.evidence[0].text).toMatch(/^3 of 3 state a figure \/SF alone, so they are judged per SF; graded clean/);
    expect(sfComps.gap!.text).toBe("The ask's $300/SF is 20.0% over the median of the memorandum's sale comps, $250/SF.");
    expect(sfComps.verdict).toBe("unsupported");
    // A per-unit set first, the per-SF comps a piece of their own; the OM's
    // figure on each yardstick, the per-SF piece marked off the shared track.
    const mixed = {
      ...comps("$270,000 per unit"),
      saleComps: [...comps("$270,000 per unit").saleComps, ...comps("$250/SF").saleComps.map((c) => ({ ...c, name: `SF ${c.name}` }))],
    };
    const both = basisOf(APARTMENT, { brokerComps: mixed })!;
    expect(both.evidence.map((e) => e.label)).toEqual(["The memorandum's sale comps", "The memorandum's sale comps stating a price per SF alone"]);
    expect(both.omSays.text).toBe("$275k/unit, $300/SF (Asking price $42,000,000 over 153 units and over 140,000 SF)");
    expect(both.gap!.text).toBe("The ask's $275k/unit is 1.7% over the median of the memorandum's sale comps, $270k/unit.");
    expect(both.evidence[0].ownYardstick).toBeUndefined();
    expect(both.evidence[1].ownYardstick).toEqual({ om: 300, per: "/SF" });
    // Recorded sales' $/SF median on an apartment deal, with the count behind it.
    const recorded = (perSqftCount: number) =>
      basisOf(APARTMENT, { recordedSales: { count: 12, medianPerSqft: 250, perSqftCount, medianPerUnit: null, providerName: "DC OTR", retrievedAt: "2026-10-01" } })!;
    expect(recorded(4).evidence[0].text).toBe("median $250/SF over 4 of 12 recorded sales, those that state an area, thin, judged per SF");
    expect(recorded(4).verdict).toBe("unsupported");
    // Under three that state an area, no median at all.
    expect(recorded(2).evidence[0]).toMatchObject({ value: null, text: "12 recorded sales, too few of them stating an area for a median /SF" });
  });

  it("strikes no basis on a master lease of the building, and drops the comps' tick with it", () => {
    const master = deal(APARTMENT.metrics, {
      interest: { kind: "leasehold", summary: "The master lease of the building, sublet to its tenants", share: "", groundLease: "", loan: "", page: "" },
    } as Partial<ExtractionResult>);
    const b = basisOf(master, { brokerComps: comps("$300,000 per unit") })!;
    expect(b.verdict).toBe("unchecked");
    expect(b.omSays.text).toBe("No basis is struck: the price buys a master lease of the building, sublet to its tenants — the position between two rents, not the building.");
    expect(subjectBasis(master.metrics, "stabilized", screenYearOf(master), interestOf(master))).toEqual({ perUnit: null, perSf: null });
    // Its model is a leasehold's, the position's own: the other rows re-run.
    const derived = deriveUnderwriteInputs(master, "x", undefined, { debtIndex: FIVE });
    expect(buildStressTest({ extraction: master, challenger: null, market: null, modelVsMarket: null, actuals: null, derived, readOn: READ_ON }).impactsWithheld).toBeNull();
  });

  it("leaves a basis outside the plausibility band unchecked, with the check's own reason", () => {
    const b = basisOf(deal([row("Asking price", "$2,000,000"), row("Units", "1,000")]), { brokerComps: comps("$250,000 per unit") })!;
    expect(b.verdict).toBe("unchecked");
    expect(b.gap).toBeNull();
    expect(b.unchecked).toMatch(/^The plausibility check finds the basis outside the band any market trades at: \$2\.0M of price over 1,000 units is \$2k per unit\. No multifamily market trades there\./);
  });

  it("cites the row whose figure it divides, never a call for offers above it", () => {
    const b = basisOf(deal([row("Asking price", "Call for offers", "p. 2"), row("Purchase price", "$42,000,000", "p. 9"), row("Units", "153")]), { brokerComps: comps("$250,000 per unit") })!;
    expect(b.omSays.text).toBe("$275k/unit (Purchase price $42,000,000 over 153 units)");
    expect(b.omSays.page).toBe(9);
  });

  it("says the count in the memorandum's own noun, as the card does", () => {
    const hotel = deal([row("Asking price", "$40,000,000"), row("Rooms", "200")], { assetClass: "hotel" });
    const b = basisOf(hotel, { storedAssetClass: "hotel", brokerComps: comps("$210,000 per key") })!;
    expect(basisTag(hotel, "stabilized", "hotel")).toBe("$200k/room");
    expect(b.omSays.text).toBe("$200k/room (Asking price $40,000,000 over 200 rooms)");
  });

  it("judges a value-add on its all-in cost, and leaves one with no total cost unchecked", () => {
    const valueAdd = (metrics: ReturnType<typeof row>[]) =>
      deal(metrics, { strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" } as ExtractionResult["strategy"] });
    const priced = basisOf(valueAdd([row("Asking price", "$30,000,000"), row("Units", "200"), row("Renovation budget", "$8,000,000")]), { brokerComps: comps("$195,000 per unit") })!;
    expect(priced.omSays.text).toBe("$190k/unit all-in (the $38M total cost: Asking price $30,000,000 plus the $8M budget for the plan, over 200 units)");
    expect(priced.gap!.text).toBe("The all-in cost's $190k/unit is 2.6% under the median of the memorandum's sale comps, $195k/unit — the conservative side.");
    expect(priced.impact).toBeNull();
    const noBudget = basisOf(valueAdd([row("Asking price", "$30,000,000"), row("Units", "200")]), { brokerComps: comps("$195,000 per unit") })!;
    expect(noBudget.verdict).toBe("unchecked");
    expect(noBudget.unchecked).toBe(
      "No all-in basis is struck: the memorandum states no budget for the plan beside the price, so no total cost is read, and the price alone, before the plan's cost, is never set against finished buildings' trades.",
    );
  });

  it("judges a forward purchase's price as the buyer's whole cost at delivery", () => {
    const forward = deal([row("Purchase price", "$48,000,000", "p. 2"), row("Total SF", "300,000 SF"), row("NOI (Year 1)", "$2,880,000"), row("Delivery date", "Q3 2027")], {
      assetClass: "Industrial",
      strategy: { kind: "development", summary: "Forward purchase of a 300,000 SF build-to-suit distribution center at completion", capitalBudget: "", timeline: "" } as ExtractionResult["strategy"],
    });
    const b = basisOf(forward, { storedAssetClass: "industrial", brokerComps: comps("$175/SF") })!;
    expect(b.omSays.text).toBe("$160/SF (the price, the buyer's whole cost at delivery: Purchase price $48,000,000 over 300,000 SF)");
    expect(b.gap!.text).toBe("The price's $160/SF is 8.6% under the median of the memorandum's sale comps, $175/SF — the conservative side.");
    expect(b.verdict).toBe("holds");
    expect(b.impact).toBeNull();
  });

  it("says the past screens' median over the screens behind it, from three", () => {
    const ps = (medianCount: number) => basisOf(APARTMENT, { pastScreens: { count: 7, medianCount, perUnitMedian: 300_000, perSfMedian: null, market: "Washington DC" } })!.evidence[0];
    expect(ps(3)).toMatchObject({ value: 300_000, text: "median $300k/unit over 3 of 7 screens, each at its memorandum's asking price, never a price anyone paid" });
    expect(ps(2)).toMatchObject({ value: null, text: "7 screens, 2 with a basis /unit, too few for a median" });
  });

  it("names past screens withheld by a surface whose words reach someone else", () => {
    const b = basisOf(APARTMENT, { brokerComps: comps("$270,000 per unit"), pastScreensWithheld: "Withheld here: a reason." })!;
    expect(b.evidence.at(-1)).toMatchObject({ label: "Other memoranda's asking prices from past screens: withheld", text: "Withheld here: a reason.", value: null });
    expect(b.verdict).toBe("holds");
  });
});

// ── The headline: the OM's case against the evidence's ───────────────────

describe("the headline", () => {
  const args = apartmentArgs();
  const model = args.derived!.inputs;
  const test = buildStressTest(args);
  const h = test.headline!;
  /** The rows with every impact but the named rows' struck off, and the
   *  named rows read stretched where they hold — the test of one or two
   *  rows past their evidence and nothing else in the OM's case. */
  const only = (keys: StressKey[], verdicts: Partial<Record<StressKey, StressRow["verdict"]>> = {}): StressRow[] =>
    test.rows.map((r) =>
      keys.includes(r.key) ? { ...r, verdict: verdicts[r.key] ?? (r.verdict === "holds" || r.verdict === "unchecked" ? "stretched" : r.verdict) } : { ...r, impact: null, verdict: "holds" },
    );

  it("runs the OM's case and the evidence's on the apartment deal, the parts summing to the gap", () => {
    expect(h.omIrrPct).not.toBeNull();
    expect(h.evidenceIrrPct).not.toBeNull();
    // Every re-run row is in the OM's case, in the test's order.
    expect(h.omKeys).toEqual(test.rows.filter((r) => r.impact).map((r) => r.key));
    // The players are the rows past their evidence (the NOI aside, below);
    // the rows that hold stay at the OM's figure and carry no part.
    const passed = test.rows.filter((r) => r.impact && (r.verdict === "stretched" || r.verdict === "unsupported") && r.key !== "noi").map((r) => r.key);
    expect(h.parts.map((p) => p.key).sort()).toEqual([...passed].sort());
    // Efficiency: the Shapley parts add up to the gap, in IRR and multiple.
    const sum = h.parts.reduce((s, p) => s + p.pts, 0);
    expect(Math.abs(sum - (h.evidenceIrrPct! - h.omIrrPct!))).toBeLessThan(1e-6);
    const mult = h.parts.reduce((s, p) => s + p.multiple!, 0);
    expect(Math.abs(mult - (h.evidenceMultiple! - h.omMultiple!))).toBeLessThan(1e-6);
    // Largest move first.
    for (let i = 1; i < h.parts.length; i++) expect(Math.abs(h.parts[i - 1].pts)).toBeGreaterThanOrEqual(Math.abs(h.parts[i].pts));
    expect(h.unsolved).toBe(0);
  });

  it("carries the model as it runs and the figures the evidence's case keeps at the OM's, display only", () => {
    // The model's own run, every input its own: the base of every re-run.
    expect(h.modelIrrPct!).toBeCloseTo(computeUnderwrite(model).returns.leveredIrrPct! * 100, 9);
    // Each kept row is in the OM's case, carries no part, and its OM figure
    // is not the model's; a part is never kept.
    const parts = new Set(h.parts.map((p) => p.key));
    for (const k of h.keptAtOm!) {
      expect(h.omKeys).toContain(k.key);
      expect(parts.has(k.key)).toBe(false);
      expect(Math.abs(k.om - k.model)).toBeGreaterThan(1e-9);
      const r = rowOf(test, k.key);
      expect(k.why).toBe(r.verdict === "holds" ? "holds" : h.omitted.some((o) => o.key === k.key) ? "left_out" : k.why);
    }
    // The sentence names each kept row with both figures, in the documents'
    // words, and the headline's whole sentence ends on it.
    const kept = keptSentence(test);
    if (h.keptAtOm!.length > 0) {
      expect(kept).toMatch(/^Against the screening model as it runs \([-−]?\d+\.\d%\), the evidence's case keeps the OM's figure where /);
      // The NOI row keeps the rent line that makes the OM's NOI, never the
      // NOI itself, and says so (audit of PR #482, H2).
      for (const k of h.keptAtOm!) expect(kept).toContain(k.key === "noi" ? "the rent line " : `${headlineName(k.key)} `);
      expect(headlineSentence(test)!.endsWith(kept!)).toBe(true);
    } else if ((h.atEvidence ?? []).length === 0) expect(kept).toBeNull();
    // The other half of why: each evidence figure the evidence's case runs
    // where the model runs another is a part, its figure not the model's.
    for (const e of h.atEvidence!) {
      expect(parts.has(e.key)).toBe(true);
      expect(Math.abs(e.evidence - e.model)).toBeGreaterThan(1e-9);
      expect(kept).toContain(`${headlineName(e.key)} `);
    }
    if (h.atEvidence!.length > 0) expect(kept).toContain("runs the evidence's figure where the model runs another: ");
    // Display only: carrying it changes neither case.
    const again = stressHeadline(test.rows, model)!;
    expect([again.omIrrPct, again.evidenceIrrPct]).toEqual([h.omIrrPct, h.evidenceIrrPct]);
    // Every re-run's words name the model's figure as its base.
    // The figure is named as a levered IRR, so it never reads as a vacancy
    // beside a rent roll's (audit of PR #482, M3).
    expect(rerunWords(test)).toBe(`from the model's own ${h.modelIrrPct!.toFixed(1)}% levered IRR, this input alone set to the OM's figure, then to the evidence's`);
    const same = { ...rowOf(test, "vacancy").impact!, altValue: rowOf(test, "vacancy").impact!.omValue };
    expect(rerunWords(test, same)).toMatch(/, this input alone set to the OM's figure, which is the evidence's$/);
    // A test with no headline names no figure.
    expect(rerunWords({ ...test, headline: null })).toBe("from the model as it runs, this input alone set to the OM's figure, then to the evidence's");
  });

  it("with one row past its evidence, the whole gap is that row's, struck on the OM's case — which is the row's own re-run only where no other row is in the OM's case (audit H2)", () => {
    // Every other re-run row held at the OM's figure, its impact kept: the
    // OM's case puts each of them at the OM's figure, so the one part is the
    // whole gap, but the gap is not the row's own re-run, which starts from
    // the model's own figures.
    const held = (k: StressKey) => test.rows.map((r) => (r.key === k ? { ...r, verdict: "stretched" as const } : r.impact ? { ...r, verdict: "holds" as const } : r));
    let differs = 0;
    for (const k of ["vacancy", "rent_growth", "debt", "taxes"] as StressKey[]) {
      const one = stressHeadline(held(k), model)!;
      const i = rowOf(test, k).impact!;
      expect(one.parts.map((p) => p.key), k).toEqual([k]);
      expect(one.parts[0].pts, k).toBeCloseTo(one.evidenceIrrPct! - one.omIrrPct!, 9);
      if (Math.abs(one.parts[0].pts - (i.altIrrPct! - i.baseIrrPct!)) > 0.05) differs++;
    }
    expect(differs).toBeGreaterThan(0);
    // The method says the true thing, never that the headline is the row's re-run.
    expect(HEADLINE_METHOD.split.join(" ")).not.toMatch(/headline is that row's own re-run/);
    expect(HEADLINE_METHOD.split).toContain("With one assumption past its evidence, the whole gap is that assumption's, struck on the OM's case.");
    expect(HEADLINE_METHOD.split).toContain("That can differ from the row's own re-run, which starts from the model's own figures rather than the OM's.");
  });

  it("with one row past its evidence and no other re-run in the OM's case, is that row's own re-run, for every row that re-runs", () => {
    const rerun = test.rows.filter((r) => r.impact && Math.abs(r.impact.altValue - r.impact.omValue) > 1e-9);
    // Insurance re-runs at the seller's own T-12 premium, the OM's $120k
    // under its $150k.
    expect(rerun.map((r) => r.key).sort()).toEqual(["debt", "exit_cap", "expense_growth", "insurance", "noi", "rent_growth", "taxes", "vacancy"]);
    for (const r of rerun) {
      const one = stressHeadline(only([r.key]), model)!;
      const i = r.impact!;
      expect(one.omKeys, r.key).toEqual([r.key]);
      expect(one.omIrrPct!, r.key).toBeCloseTo(i.baseIrrPct!, 9);
      expect(one.evidenceIrrPct!, r.key).toBeCloseTo(i.altIrrPct!, 9);
      expect(one.omMultiple!, r.key).toBeCloseTo(i.baseMultiple!, 9);
      expect(one.evidenceMultiple!, r.key).toBeCloseTo(i.altMultiple!, 9);
      expect(one.parts, r.key).toHaveLength(1);
      expect(one.parts[0].pts, r.key).toBeCloseTo(i.altIrrPct! - i.baseIrrPct!, 9);
    }
  });

  it("never counts the NOI and its components twice: the components carry the move and the NOI is named as left out", () => {
    // The NOI's own swap is the evidence's NOI, which already holds the
    // vacancy, taxes and insurance: with a component past its evidence too,
    // the NOI is no part, stays at the OM's figure in both cases, and is
    // left out in the method's own words.
    expect(rowOf(test, "noi").verdict).toBe("unsupported");
    expect(h.parts.map((p) => p.key)).not.toContain("noi");
    expect(h.omitted).toContainEqual({ key: "noi", label: rowOf(test, "noi").title, why: HEADLINE_NOI_LEFT_OUT });
    // The evidence's case is the one the NOI holding would make: the NOI at
    // the OM's figure is the anchor either way, so its verdict moves nothing.
    const held = stressHeadline(test.rows.map((r) => (r.key === "noi" ? { ...r, verdict: "holds" as const } : r)), model)!;
    expect(held.evidenceIrrPct!).toBeCloseTo(h.evidenceIrrPct!, 9);
    expect(held.omitted.map((o) => o.key)).not.toContain("noi");
    // With each component alone beside the NOI, the NOI is still left out;
    // with none, the NOI's own swap stands and is a part.
    for (const c of HEADLINE_NOI_COMPONENTS) {
      if (!test.rows.some((r) => r.key === c && r.impact)) continue;
      const pair = stressHeadline(only(["noi", c]), model)!;
      expect(pair.parts.map((p) => p.key), c).toEqual([c]);
      expect(pair.omitted.map((o) => o.key), c).toEqual(["noi"]);
    }
    const noiAlone = stressHeadline(only(["noi", "exit_cap"]), model)!;
    expect(noiAlone.parts.map((p) => p.key).sort()).toEqual(["exit_cap", "noi"]);
    expect(noiAlone.omitted).toEqual([]);
    // The NOI anchors the OM's case at the OM's own vacancy: year one is the
    // OM's NOI whether or not the vacancy row is past its evidence.
    expect(HEADLINE_METHOD.overlap[0]).toContain(HEADLINE_NOI_LEFT_OUT);
  });

  it("says what the component swaps leave of the NOI's gap, in neither case, wherever it passes 1% of the OM's NOI", () => {
    const n = rowOf(test, "noi");
    const t = rowOf(test, "taxes").impact!;
    const noiGap = n.omSays.value! - n.evidence[n.impact!.evidenceIndex].value!;
    // The tax swap moves the year-one NOI by the bill's own move, dollar for
    // dollar (the management fee is struck on the income, not the expenses).
    const rest = noiGap - (t.altValue - t.omValue);
    const pair = stressHeadline(only(["noi", "taxes"]), model)!;
    expect(Math.abs(rest)).toBeGreaterThan(HEADLINE_NOI_REST_SHARE * n.omSays.value!);
    expect(pair.noiRest!.components).toEqual(["taxes"]);
    expect(pair.noiRest!.usd).toBeCloseTo(rest, -1);
    // Said in one clause, by its sign.
    const said = { ...pair, noiRest: { usd: 54_000, components: ["taxes" as const] } };
    expect(noiRestClause(said)).toBe("the rest of the NOI's gap ($54k a year) is in neither case");
    expect(noiRestClause({ ...said, noiRest: { usd: -54_000, components: ["vacancy", "taxes"] } })).toBe("the vacancy and tax swaps move the year-one NOI $54k a year past the NOI's own gap");
    expect(noiRestSentence({ ...said, noiRest: { usd: -54_000, components: ["taxes"] } })).toBe("The tax swap moves the year-one NOI $54k a year past the NOI's own gap.");
    expect(noiRestClause({ ...said, noiRest: null })).toBe("");
    // With the test in hand, both figures are said, read off the NOI row:
    // what the swaps take off year-one NOI and how far past its gap that is.
    const withRows = { ...test, rows: test.rows.map((r) => (r.key === "noi" ? { ...r, decidedBy: r.impact!.evidenceIndex } : r)) };
    const past = { ...said, noiRest: { usd: -54_000, components: ["taxes" as const] } };
    const takes = `$${Math.round((noiGap + 54_000) / 1000)}k`;
    expect(noiRestClause(past, withRows)).toMatch(/^the tax (?:reset|swap) takes \$\d+k off year-one NOI, \$54k more than the OM's NOI sits over the /);
    expect(noiRestClause(past, withRows)).toContain(` takes ${takes} off `);
    // No NOI row to read: the clause as before.
    expect(noiRestClause(past, { ...test, rows: [] })).toBe("the tax swap moves the year-one NOI $54k a year past the NOI's own gap");
    // An NOI decided by the memorandum against itself is its own in-place
    // NOI, never "the offering memorandum" as a whole (audit of PR #486).
    const ownNoi = {
      ...test,
      rows: test.rows.map((r) =>
        r.key === "noi"
          ? { ...r, omSays: { ...r.omSays, value: 2_650_000 }, decidedBy: 0, evidence: [{ kind: "om_internal" as const, label: "The OM's in-place NOI against its pro forma", text: "", value: 2_400_000, asOf: null, publisher: "the offering memorandum", scope: "deal" as const }] }
          : r,
      ),
    };
    expect(noiRestClause(past, ownNoi)).toMatch(/, \$54k more than the OM's NOI sits over the OM's own in-place NOI$/);
    expect(holdsBand(ownNoi.rows.find((r) => r.key === "noi")!)).toBe("within 5% of the OM's own in-place NOI");
    // A tax move that carries the NOI's gap to within 1% says nothing.
    const carried = only(["noi", "taxes"]).map((r) => (r.key === "taxes" ? { ...r, impact: { ...r.impact!, altValue: r.impact!.omValue + noiGap } } : r));
    expect(stressHeadline(carried, model)!.noiRest).toBeNull();
    // Where the NOI is not left out, there is no rest to say.
    expect(stressHeadline(only(["noi", "exit_cap"]), model)!.noiRest).toBeNull();
    expect(HEADLINE_METHOD.overlap.join(" ")).toContain("passes 1% of the OM's NOI");
    expect(HEADLINE_NOI_REST_SHARE).toBe(0.01);
  });

  it("names what it does not test where the price, the NOI or the debt is unchecked, or a roster rolls 25% in a year before the sale", () => {
    // The apartment deal tests the NOI and the debt; its price stands
    // unchecked (no comp carries a figure), so the price is named.
    expect(rowOf(test, "basis").verdict).toBe("unchecked");
    expect(["noi", "debt"].map((k) => rowOf(test, k as StressKey).verdict)).not.toContain("unchecked");
    expect(h.untested).toEqual({ keys: ["basis"], roll: null });
    expect(untestedSentence(h)).toBe("This headline does not test the price.");
    expect(headlineSentence(test)).toContain(" This headline does not test the price.");
    // With nothing named, nothing is said.
    expect(untestedSentence({ ...h, untested: null })).toBe("");
    // With no loan rate stated, the debt row stands unchecked and is named too.
    const noRate = { ...APARTMENT, metrics: APARTMENT.metrics.filter((m) => !/interest rate/i.test(m.label)) };
    const bare = buildStressTest(apartmentArgs({ extraction: noRate }));
    expect(rowOf(bare, "debt").verdict).toBe("unchecked");
    expect(bare.headline!.untested).toEqual({ keys: ["basis", "debt"], roll: null });
    expect(untestedSentence(bare.headline!)).toBe("This headline does not test the price or the loan rate.");
    // A roster whose worst year before the sale rolls 25% or more of its
    // listed rent is named with its share and the month that year ends.
    const tenant = (name: string, rent: string, leaseExpiration: string) => ({ name, role: "inline", inSale: "yes", sf: "20,000 SF", rent, leaseExpiration, options: "", earlyTermination: "", rights: "", page: "p. 12" });
    const rostered = { ...noRate, assetClass: "retail", tenants: [tenant("Grocer", "$600,000", "June 30, 2028"), tenant("Bank", "$400,000", "December 31, 2035")] } as unknown as ExtractionResult;
    const roster = readRoster(rostered, new Date(`${READ_ON}T12:00:00Z`))!;
    expect(roster.worst!.sharePct).toBeGreaterThanOrEqual(ROSTER_UNTESTED_PCT);
    const rolled = buildStressTest(apartmentArgs({ extraction: rostered }));
    const end = new Date(`${READ_ON}T12:00:00Z`);
    end.setUTCFullYear(end.getUTCFullYear() + roster.worst!.year);
    const through = `${end.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} ${end.getUTCFullYear()}`;
    expect(rolled.headline!.untested!.roll).toEqual({ sharePct: roster.worst!.sharePct, basis: "rent", through });
    expect(untestedSentence(rolled.headline!)).toMatch(new RegExp(`^This headline does not test the price, the loan rate or the ${Math.round(roster.worst!.sharePct)}% of the listed rent rolling in the year to ${through}\\.$`));
    // Three, joined with "or".
    expect(untestedSentence({ ...h, untested: { keys: ["basis", "noi"], roll: { sharePct: 57.2, basis: "rent", through: "Oct 2028" } } })).toBe(
      "This headline does not test the price, the NOI or the 57% of the listed rent rolling in the year to Oct 2028.",
    );
    expect(HEADLINE_UNTESTED_KEYS).toEqual(["basis", "noi", "debt"]);
    expect(HEADLINE_METHOD.limits.join(" ")).toContain(`rolls ${ROSTER_UNTESTED_PCT}% or more of its listed rent in one year before the model's sale`);
  });

  it("keeps the price at the ask in both cases, a reset tax bill struck on the ask, and names the price as left out", () => {
    const taxes = rowOf(test, "taxes");
    const reset = taxes.evidence[taxes.impact!.evidenceIndex];
    expect(reset.label).toMatch(/^The bill the OM's own figures imply/);
    const price = model.purchasePrice;
    const basis: StressRow = {
      key: "basis",
      title: "Basis",
      omSays: { text: "x", value: 274_000, page: null },
      evidence: [],
      gap: { value: 10, unit: "pct", text: "" },
      verdict: "stretched",
      impact: { input: "purchasePrice", evidenceIndex: 0, omValue: price, altValue: price * 0.9, baseIrrPct: null, altIrrPct: null, baseMultiple: null, altMultiple: null, note: "" },
      challenge: null,
      method: "",
    };
    const both = stressHeadline([basis, ...only(["taxes"]).filter((r) => r.key !== "basis")], model)!;
    // By hand: the ask, the tax line moved by the reset struck on the ask
    // less the OM's bill. The price is in neither side of the split.
    const delta = reset.value! - taxes.omSays.value!;
    const byHand = computeUnderwrite({
      ...model,
      purchasePrice: price,
      expenseLines: model.expenseLines.map((l, i) => (i === 0 ? { ...l, annual: l.annual + delta } : l)),
    }).returns.leveredIrrPct!;
    expect(both.evidenceIrrPct!).toBeCloseTo(byHand * 100, 9);
    expect(both.parts.map((p) => p.key)).toEqual(["taxes"]);
    expect(both.omitted).toContainEqual({ key: "basis", label: "Basis", why: HEADLINE_BASIS_LEFT_OUT });
  });

  it("names a row past its evidence with no model input as left out, and says the headline in the documents' words", () => {
    const premium: StressRow = { ...rowOf(test, "vacancy"), key: "renovation_premium", title: "Renovation premium", impact: null, verdict: "unsupported" };
    const withPremium = stressHeadline([...test.rows, premium], model)!;
    expect(withPremium.omitted.map((o) => o.key)).toContain("renovation_premium");
    expect(HEADLINE_METHOD.limits[0]).toMatch(/renovation premium/);
    const sentence = headlineSentence(test)!;
    expect(sentence).toMatch(/^Levered IRR on the OM's figures [-−]?\d+\.\d% to [-−]?\d+\.\d% with the evidence \(equity multiple \d\.\d\dx to \d\.\d\dx\): /);
    expect(sentence).toContain("Left out: the NOI (");
  });

  it("runs the OM's case on the NOI the NOI row tests, its stabilized pro forma here, and says so (audit L1)", () => {
    const noi = rowOf(test, "noi");
    expect(noi.omSays.value).toBe(2_650_000);
    const rent = noi.impact!.omValue;
    expect(computeUnderwrite({ ...model, inPlaceRentAnnual: rent }).cashFlow[0].noi).toBeCloseTo(2_650_000, 0);
    expect(HEADLINE_METHOD.omCase.join(" ")).not.toMatch(/year-one NOI/);
    expect(HEADLINE_METHOD.omCase).toContain("The NOI is the one the NOI row tests, its stabilized or pro forma figure where the OM states one, else the first it states, run as year one.");
  });

  it("names the price both cases pay as the model runs it — a share's grossed up, an auction's floor — and strikes a master lease's headline, as the method says (audit L2)", () => {
    expect(headlinePrice(args.derived!)).toBe("the asking price");
    const share = deriveUnderwriteInputs(SHARE, "x", undefined, { debtIndex: FIVE });
    expect(headlinePrice(share)).toBe("the 49% share's price grossed up to the whole the model runs");
    const auction: ExtractionResult = {
      ...APARTMENT,
      sale: { method: "auction", terms: "Online auction", condition: "", page: "p. 2" } as ExtractionResult["sale"],
      metrics: [...APARTMENT.metrics.filter((m) => m.label !== "Asking price"), row("Starting bid", "$30,000,000", "p. 2"), row("Buyer's premium", "5%", "p. 2")],
    };
    const floor = deriveUnderwriteInputs(auction, "x", undefined, { debtIndex: FIVE });
    expect(floor.inputs.purchasePrice).toBe(31_500_000);
    expect(headlinePrice(floor)).toBe("the auction's floor, the starting bid plus the buyer's premium, which the model runs in place of an asking price");
    const basis: StressRow = {
      key: "basis",
      title: "Basis",
      omSays: { text: "x", value: 1, page: null },
      evidence: [],
      gap: { value: 10, unit: "pct", text: "" },
      verdict: "stretched",
      impact: { input: "purchasePrice", evidenceIndex: 0, omValue: model.purchasePrice, altValue: model.purchasePrice * 0.9, baseIrrPct: null, altIrrPct: null, baseMultiple: null, altMultiple: null, note: "" },
      challenge: null,
      method: "",
    };
    const h2 = stressHeadline([basis, ...test.rows], model, headlinePrice(share))!;
    expect(h2.omitted.find((o) => o.key === "basis")!.why).toBe(headlineBasisLeftOut("the 49% share's price grossed up to the whole the model runs"));
    // A master lease's model is the position's own: its headline is struck,
    // and the method's limits say so rather than withholding it.
    const master = { ...APARTMENT, interest: { kind: "leasehold", summary: "The master lease of the building, sublet to its tenants", share: "", groundLease: "", loan: "", page: "" } } as ExtractionResult;
    const md = deriveUnderwriteInputs(master, "x", undefined, { debtIndex: FIVE });
    expect(buildStressTest({ extraction: master, challenger: null, market: null, modelVsMarket: readFor(md), actuals: null, derived: md, readOn: READ_ON }).headline).not.toBeNull();
    expect(HEADLINE_METHOD.limits).toContain("A master lease's price buys the position between two rents, which the model runs as its own, so its headline is struck on that position.");
  });

  it("prints the gap from the two rounded IRRs and parts that add up to it, by largest remainder (audit M2)", () => {
    // The sample's bare read: 13.06% to 3.56% prints 13.1% to 3.6%, a
    // 9.5-point gap, never the 9.6 the unrounded figures make, and the parts
    // round to sum to it.
    const hh = { ...h, omIrrPct: 13.06, evidenceIrrPct: 3.56, parts: [
      { key: "vacancy" as const, label: "Stabilized vacancy", pts: -3.567, multiple: null },
      { key: "taxes" as const, label: "Real estate taxes", pts: -3.304, multiple: null },
      { key: "exit_cap" as const, label: "Exit cap", pts: -1.536, multiple: null },
      { key: "insurance" as const, label: "Insurance", pts: -1.103, multiple: null },
    ] };
    const shown = shownHeadline(hh);
    expect([shown.om, shown.evidence, shown.gap]).toEqual([13.1, 3.6, 9.5]);
    expect(Math.round(shown.parts.reduce((s, p) => s + p.shown, 0) * 10) / 10).toBe(-9.5);
    const s = headlineSentence({ ...test, headline: hh })!;
    expect(s).toContain("of the 9.5-point gap");
    // Every printed part, summed, is the printed gap, on the apartment deal too.
    const real = shownHeadline(h);
    expect(Math.round(real.parts.reduce((t, p) => t + p.shown, 0) * 10) / 10).toBe(Math.round((real.evidence! - real.om!) * 10) / 10);
    for (const p of real.parts) expect(headlineSentence(test)).toContain(`${headlineName(p.key)} ${ptsText(p.shown)}`);
  });

  it("says a case whose IRR does not solve in a clause of its own, never as a figure (audit M1)", () => {
    const evNull = { ...test, headline: { ...h, evidenceIrrPct: null, evidenceMultiple: null, parts: [], unsolved: 0 } };
    expect(headlineLine(evNull)).toBe(`Levered IRR on the OM's figures ${h.omIrrPct!.toFixed(1)}%; with the evidence it does not solve`);
    expect(headlineSentence(evNull)).toMatch(/; with the evidence it does not solve, so the gap is not split\.( This headline does not test [^.]*\.)? Left out: /);
    expect(headlineShort(evNull)).toBe(`Levered IRR on the OM's figures ${h.omIrrPct!.toFixed(1)}%; with the evidence it does not solve (the screening model as it runs: ${h.modelIrrPct!.toFixed(1)}%).`);
    // The one-page memo's line leaves the model to its legend.
    expect(headlineShort(evNull, false)).toBe(`Levered IRR on the OM's figures ${h.omIrrPct!.toFixed(1)}%; with the evidence it does not solve.`);
    const omNull = { ...test, headline: { ...h, omIrrPct: null, omMultiple: null, parts: [], unsolved: 0 } };
    expect(headlineLine(omNull)).toBe(`The levered IRR does not solve on the OM's figures; with the evidence it is ${h.evidenceIrrPct!.toFixed(1).replace("-", "\u2212")}%`);
    const both = { ...test, headline: { ...h, omIrrPct: null, evidenceIrrPct: null, parts: [], unsolved: 0 } };
    expect(headlineLine(both)).toBe("The levered IRR does not solve on the OM's figures or with the evidence");
    for (const t of [evNull, omNull, both]) expect(headlineSentence(t)).not.toMatch(/does not solve with the evidence|to does not solve/);
  });

  it("with only a row the headline leaves out past its evidence, says nothing past its evidence is swapped, never that nothing is past it (audit M3)", () => {
    const price = model.purchasePrice;
    const basis: StressRow = {
      key: "basis",
      title: "Basis",
      omSays: { text: "x", value: 274_000, page: null },
      evidence: [],
      gap: { value: 10, unit: "pct", text: "" },
      verdict: "unsupported",
      impact: { input: "purchasePrice", evidenceIndex: 0, omValue: price, altValue: price * 0.8, baseIrrPct: null, altIrrPct: null, baseMultiple: null, altMultiple: null, note: "" },
      challenge: null,
      method: "",
    };
    const rows = [basis, ...test.rows.map((r) => (r.impact ? { ...r, verdict: "holds" as const } : r))];
    const t = { ...test, rows, headline: stressHeadline(rows, model)! };
    const s = headlineSentence(t)!;
    expect(s).toMatch(/^Levered IRR on the OM's figures [\d.]+%, with nothing past its evidence that the headline swaps, so the evidence moves nothing\. Left out: the price \(/);
    expect(s).not.toContain("no figure the model takes is past its evidence");
  });

  it("marks a part struck against a rule of thumb alone in the headline's words (audit M7)", () => {
    const debt = h.parts.find((p) => p.key === "debt");
    expect(rowOf(test, "debt").ruleOfThumbOnly).toBe(true);
    expect(debt?.ruleOfThumb).toBe(true);
    const shownDebt = shownHeadline(h).parts.find((p) => p.key === "debt")!;
    expect(headlineSentence(test)).toContain(`the loan rate ${ptsText(shownDebt.shown)} (against a screening default)`);
    for (const p of h.parts.filter((x) => x.key !== "debt")) expect(p.ruleOfThumb, p.key).toBeUndefined();
    // The memo's one line says so too: it carries the evidence's case whole.
    expect(headlineShort(test)).toMatch(/ with the evidence \(the loan rate against a screening default; the screening model as it runs: [\d.]+%\); the report splits the gap by assumption\.$/);
    expect(headlineShort(test, false)).toMatch(/ with the evidence \(the loan rate against a screening default\); the report splits/);
  });

  it("names in the method every assumption the OM's case can hold", () => {
    for (const k of STRESS_KEYS) {
      // No model input on a stabilized deal: neither is in the OM's case.
      if (k === "renovation_premium" || k === "market_rent" || k === "other") continue;
      expect(HEADLINE_METHOD.omCase[1], k).toContain(headlineName(k));
    }
    for (const c of HEADLINE_NOI_COMPONENTS) expect(HEADLINE_METHOD.overlap[0], c).toContain(headlineName(c).replace(/^the /, ""));
  });

  it("is null wherever no return is re-run, the test's reason standing for it", () => {
    // A value-add stating no stabilized NOI: no yield on cost to re-run.
    const plan = buildStressTest({
      ...apartmentArgs(),
      extraction: { ...APARTMENT, strategy: { kind: "value_add", summary: "", capitalBudget: "$1,800,000", timeline: "" }, metrics: APARTMENT.metrics.filter((m) => !/stabilized/.test(m.label)) },
    });
    expect(plan.impactsWithheld).not.toBeNull();
    expect(plan.headline).toBeNull();
    expect(headlineSentence(plan)).toBe(`${plan.impactsWithheld} The headline, the OM's figures against the evidence's in one run each, is withheld for the same reason.`);
    const shared = buildStressTest({ ...apartmentArgs(), derived: null, withheldReason: SHARE_NO_MODEL });
    expect(shared.headline).toBeNull();
    expect(headlineSentence(shared)).toContain(SHARE_NO_MODEL);
    // No row re-run at all: no OM's case to strike.
    expect(stressHeadline(test.rows.map((r) => ({ ...r, impact: null })), model)).toBeNull();
  });

  it("with nothing past its evidence, the two cases are one run and nothing is split", () => {
    const calm = stressHeadline(test.rows.map((r) => ({ ...r, verdict: r.impact ? ("holds" as const) : r.verdict })), model)!;
    expect(calm.parts).toEqual([]);
    expect(calm.evidenceIrrPct).toBe(calm.omIrrPct);
  });
});

/** Every sentence a test prints, on every surface: the rows' own words, each
 *  row's cells, the headline, the kept sentence and the brief's section. */
function printedTexts(t: ReturnType<typeof buildStressTest>): string[] {
  return [
    ...t.rows.flatMap((r) => [r.omSays.text, r.gap?.text ?? "", r.impact?.note ?? "", r.noRerun ?? "", r.noRerunShort ?? "", r.unchecked ?? "", r.method, ...r.evidence.map((e) => e.text)]),
    ...t.rows.map((r) => Object.values(rowWords(r)).filter((v) => typeof v === "string").join(" ")),
    headlineSentence(t) ?? "",
    keptSentence(t) ?? "",
    stressReadLine(t),
    ...stressSection(t),
  ].filter(Boolean);
}

/** A hyphen-minus before a figure, where no word or figure runs into it
 *  ("to -0.2%"); "T-12" and "2026-06-30" are no minus. */
const HYPHEN_MINUS = /(?:^|[^\w.])-\d/;

describe("a negative figure carries the true minus (U+2212) on every surface (the walkthrough of 2026-10-20)", () => {
  it("prints no hyphen before a digit on a deal whose model runs a negative levered IRR", () => {
    // The Maddox's model with no rent growth and a wide exit runs a levered
    // IRR under zero, so every re-run has a negative figure to print.
    const args = apartmentArgs();
    const derived = { ...args.derived!, inputs: { ...args.derived!.inputs, rentGrowthPct: 0, exitCapPct: 0.08 } };
    const t = buildStressTest({ ...args, derived });
    // The fixture's model runs under water, so negatives are there to print.
    expect(t.headline!.modelIrrPct!).toBeLessThan(0);
    const texts = printedTexts(t);
    expect(texts.join("\n")).toContain("−");
    for (const s of texts) expect(s, s).not.toMatch(HYPHEN_MINUS);
    expect("moves from 1.5% to -0.2%").toMatch(HYPHEN_MINUS);
    expect("the deal's T-12, Jun 30, 2026-06-30").not.toMatch(HYPHEN_MINUS);
  });
});

// ── A growth row's one year, beside the longer average its history holds ──

describe("a growth row's one trailing year stands beside the average its stored history holds (the review of 2026-10-21)", () => {
  /** All-items CPI's published year-over-year changes a whole year apart,
   *  stored beside the fixture's newest (Aug 2026). */
  const CPI_BACK: RateRow[] = [
    { series_id: "CPIAUCSL_YOY", obs_date: "2025-08-01", value: 2.9 },
    { series_id: "CPIAUCSL_YOY", obs_date: "2024-08-01", value: 2.5 },
    { series_id: "CPIAUCSL_YOY", obs_date: "2023-08-01", value: 3.7 },
  ];
  const newestCpi = REAL_ROWS.find((r) => r.series_id === "CPIAUCSL_YOY")!;
  const compound = (vals: number[]) => (vals.reduce((p, v) => p * (1 + v / 100), 1) ** (1 / vals.length) - 1) * 100;
  /** The average as the figure carries it, to two places, and said to one. */
  const said = (vals: number[]) => (Math.round(compound(vals) * 100) / 100).toFixed(1);

  it("compounds a series' own changes a whole year apart, newest back, and stops at the first year it does not hold", () => {
    const history = [newestCpi, ...CPI_BACK].map((r) => ({ obsDate: r.obs_date, value: r.value }));
    const a = compoundYearOverYear({ obsDate: newestCpi.obs_date, history })!;
    expect(a.years).toBe(4);
    expect(a.pct).toBeCloseTo(compound([newestCpi.value, 2.9, 2.5, 3.7]), 9);
    expect(a.changes.map((c) => c.obsDate)).toEqual(["2026-08-01", "2025-08-01", "2024-08-01", "2023-08-01"]);
    // A gap ends the run: no year is skipped, none taken from a neighbouring month.
    const gapped = history.filter((h) => h.obsDate !== "2024-08-01").concat({ obsDate: "2024-07-01", value: 9 });
    expect(compoundYearOverYear({ obsDate: newestCpi.obs_date, history: gapped })!.years).toBe(2);
    // One year is the deciding figure itself: no average.
    expect(compoundYearOverYear({ obsDate: newestCpi.obs_date, history: history.slice(0, 1) })).toBeNull();
    expect(GROWTH_AVERAGE_MIN_YEARS).toBe(2);
  });

  it("says what the stored history holds, read through the readers the page reads it with", () => {
    // HISTORY_ROWS observations a series: a transformed change from a year
    // ago holds four whole years; a level derived on read, three.
    expect(GROWTH_HISTORY_HELD.startsWith(`${HISTORY_ROWS} observations a series are kept: four years`)).toBe(true);
    const month = (k: number) => new Date(Date.UTC(2026, 7 - k, 1)).toISOString().slice(0, 10);
    const yoyRows: RateRow[] = Array.from({ length: HISTORY_ROWS }, (_, k) => ({ series_id: "CPIAUCSL_YOY", obs_date: month(k), value: 3 }));
    const cpi = readRates(yoyRows, FIXTURE_NOW).find((r) => r.meta.id === "CPIAUCSL_YOY")!;
    expect(compoundYearOverYear(cpi)!.years).toBe(4);
    const levelRows: RateRow[] = Array.from({ length: HISTORY_ROWS }, (_, k) => ({ series_id: "CUURS35ASEHA", obs_date: month(k), value: 400 + (HISTORY_ROWS - k) }));
    const rent = readMetroRates("dc", levelRows, FIXTURE_NOW).find((r) => r.meta.id === "CUURS35ASEHA")!;
    expect(compoundYearOverYear(rent)!.years).toBe(3);
    // A metro series published every other month holds more years in the same
    // rows, so the sentence says "at least three".
    expect(GROWTH_HISTORY_HELD).toContain("at least three of a metro's CPI rent");
    const bimonthly: RateRow[] = Array.from({ length: HISTORY_ROWS }, (_, k) => ({ series_id: "CUURS35ASEHA", obs_date: month(2 * k), value: 400 + (HISTORY_ROWS - k) }));
    const rent2 = readMetroRates("dc", bimonthly, FIXTURE_NOW).find((r) => r.meta.id === "CUURS35ASEHA")!;
    expect(compoundYearOverYear(rent2)!.years).toBeGreaterThanOrEqual(3);
    expect(GROWTH_HISTORY_HELD.length).toBeLessThanOrEqual(260);
  });

  it("shows all-items CPI's own average beside the one year that decides the expense growth, deciding nothing", () => {
    const args = apartmentArgs();
    const withHistory = readRates([...REAL_ROWS, ...CPI_BACK], FIXTURE_NOW);
    const e = rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { national: withHistory }) }), "expense_growth");
    const avg = e.evidence[e.evidence.length - 1];
    expect(avg).toMatchObject({ kind: "published", label: "Consumer prices (CPI, all items): average a year over 4 years", publisher: "BLS via FRED", scope: "nation", asOf: "2026-08-01" });
    expect(avg.value).toBeCloseTo(compound([newestCpi.value, 2.9, 2.5, 3.7]), 2);
    expect(avg.text).toBe(
      `+${said([newestCpi.value, 2.9, 2.5, 3.7])}% a year over the four years to Aug 2026, compounded from its four published changes against a year earlier (the years to Aug 2026, Aug 2025, Aug 2024 and Aug 2023): an average of published figures, not a forecast`,
    );
    // The one year still decides: the same verdict and the same re-run.
    expect(e.evidence[e.decidedBy!].label).toBe("Consumer prices (CPI, all items)");
    expect(e.impact!.altValue).toBeCloseTo(newestCpi.value / 100, 9);
    const without = rowOf(buildStressTest(args), "expense_growth");
    expect(e.verdict).toBe(without.verdict);
    expect(without.evidence.some((x) => /average a year/.test(x.label))).toBe(false);
    // The gap says the decider is one year, and names the longer average.
    expect(e.gap!.text).toContain("(BLS via FRED), a single year's change. The OM's 2.5%/yr is 0.9 points under it.");
    expect(e.gap!.text).toContain(
      ` Beside it, not deciding: the same series averaged +${said([newestCpi.value, 2.9, 2.5, 3.7])}% a year over the four years to Aug 2026, compounded from its published changes against a year earlier — an average of published figures, not a forecast. ${TRAILING_YEAR_NOT_FORECAST}`,
    );
    expect(e.method).toContain("beside it, not deciding: ");
    expect(e.method).toContain("consumer prices (CPI, all items): average a year over 4 years (BLS via FRED)");
    expect(evidenceShort(e, avg)).toBe(`+${said([newestCpi.value, 2.9, 2.5, 3.7])}% a year over the four years to Aug 2026, an average (BLS via FRED)`);
  });

  it("shows the CPI rent's own average where it decides, and none beside Zillow's, which keeps no history", () => {
    const month = (k: number) => new Date(Date.UTC(2026, 7 - k, 1)).toISOString().slice(0, 10);
    // 40 monthly levels: three whole years of changes against a year earlier.
    const levels: RateRow[] = Array.from({ length: HISTORY_ROWS }, (_, k) => ({ series_id: "CUURS35ASEHA", obs_date: month(k), value: Math.round(400 * 1.03 ** ((HISTORY_ROWS - k) / 12) * 10) / 10 }));
    const metro = readMetroRates("dc", [...METRO_ROWS.filter((r) => r.series_id !== "CUURS35ASEHA"), ...levels], FIXTURE_NOW);
    const args = apartmentArgs();
    const cpiRent = rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { zori: null, rates: metro }) }), "rent_growth");
    expect(cpiRent.evidence[cpiRent.decidedBy!].label).toBe("Rent paid by sitting tenants (CPI rent)");
    const avg = cpiRent.evidence.find((e) => /: average a year over \d+ years$/.test(e.label))!;
    expect(avg.label).toBe("Rent paid by sitting tenants (CPI rent): average a year over 3 years");
    expect(avg.scope).toBe("metro");
    expect(cpiRent.gap!.text).toContain("Beside it, not deciding: the same series averaged ");
    // Zillow's apartment asking rents decide on the same read: no average,
    // since its stored rows keep the newest month alone.
    const zillow = rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { rates: metro }) }), "rent_growth");
    expect(zillow.evidence[zillow.decidedBy!].label).toBe("Asking rent, apartments");
    expect(zillow.evidence.some((e) => /average a year/.test(e.label))).toBe(false);
    expect(zillow.gap!.text).not.toContain("Beside it, not deciding");
  });

  it("decides on the more cautious of the one year and the longer average: the higher for expenses, the lower for rent (the review of 2026-10-23)", () => {
    const args = apartmentArgs();
    // A cooler newest year after hotter ones: the CPI's average decides the
    // expense growth, the trailing year beside it.
    const hot = [5.5, 6.0, 4.5];
    const national = readRates([...REAL_ROWS, ...CPI_BACK.map((r, i) => ({ ...r, value: hot[i] }))], FIXTURE_NOW);
    const e = rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { national }) }), "expense_growth");
    const avgPct = Math.round(compound([newestCpi.value, ...hot]) * 100) / 100;
    expect(avgPct).toBeGreaterThan(newestCpi.value);
    expect(e.decidedBy).toBe(0);
    expect(e.evidence.slice(0, 2).map((x) => x.label)).toEqual(["Consumer prices (CPI, all items): average a year over 4 years", "Consumer prices (CPI, all items)"]);
    expect(e.impact!.altValue).toBeCloseTo(avgPct / 100, 9);
    expect(e.gap!.text).toMatch(
      /^Held to consumer prices, all items \(the CPI\), averaged a year over the 4 years its stored history holds, the higher of its trailing year and its longer average, the cautious side for a rate run every year of the hold: \+[\d.]+% a year over the four years to Aug 2026/,
    );
    expect(e.gap!.text).toContain(" Beside it, not deciding: its trailing year, +");
    expect(e.gap!.text.endsWith(AVERAGE_NOT_FORECAST)).toBe(true);
    expect(e.impact!.note).toMatch(/^If expense growth is \+[\d.]+% a year, its 4-year compound average \(BLS via FRED\), run each year of the hold, not the OM's 2\.5%\/yr/);
    // The model's seed reads the same deciding figure (lib/model-evidence).
    expect(expenseGrowthPieces(readFor(args.derived!, { national })).decided!.figure).toBeCloseTo(avgPct, 9);
    // A hot newest year after cooler ones: the CPI rent's average decides the
    // rent growth, so one hot year never carries a 4.0% a year for five.
    const month = (k: number) => new Date(Date.UTC(2026, 7 - k, 1)).toISOString().slice(0, 10);
    const level = (k: number) => (k >= 12 ? 400 * 1.02 ** ((HISTORY_ROWS - k) / 12) : 400 * 1.02 ** ((HISTORY_ROWS - 12) / 12) * 1.06 ** ((12 - k) / 12));
    const levels: RateRow[] = Array.from({ length: HISTORY_ROWS }, (_, k) => ({ series_id: "CUURS35ASEHA", obs_date: month(k), value: Math.round(level(k) * 100) / 100 }));
    const metro = readMetroRates("dc", [...METRO_ROWS.filter((r) => r.series_id !== "CUURS35ASEHA"), ...levels], FIXTURE_NOW);
    const g = rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { zori: null, rates: metro }) }), "rent_growth");
    const decider = g.evidence[g.decidedBy!];
    expect(decider.label).toBe("Rent paid by sitting tenants (CPI rent): average a year over 3 years");
    const trailing = g.evidence.find((x) => x.label === "Rent paid by sitting tenants (CPI rent)")!;
    expect(decider.value!).toBeLessThan(trailing.value!);
    // 4.0% holds against the trailing 6.0%; against the average it is stretched.
    expect(trailing.value!).toBeGreaterThan(4);
    expect(g.verdict).toBe("stretched");
    expect(g.gap!.text).toContain("the lower of its trailing year and its longer average, the cautious side for a rate run every year of the hold");
    expect(g.gap!.text.endsWith(AVERAGE_NOT_FORECAST)).toBe(true);
  });

  it("holds the insurance margin the methodology prints to the reader's own", () => {
    expect(STRESS_METHODS.find((m) => m.key === "insurance")!.against[0]).toContain(`more than ${SAME_SHARE * 100}% under it`);
  });
});

// ── The review of 2026-10-21: what each row reads, and in whose unit ──────

describe("the debt row reads a fixed rate only, against the tenor of the OM's own loan term", () => {
  const withRows = (...extra: { label: string; value: string }[]): ExtractionResult => ({
    ...APARTMENT,
    metrics: [...APARTMENT.metrics.filter((m) => m.label !== "Interest rate"), ...extra.map((r) => row(r.label, r.value, "p. 30"))],
  });

  for (const value of ["SOFR + 3.25%", "Term SOFR + 2.10%", "Prime + 1%", "SOFR + 325 bps"]) {
    it(`stands "${value}" unchecked: an index plus a spread, shown as stated and priced on nothing`, () => {
      const test = buildStressTest(apartmentArgs({ extraction: withRows({ label: "Interest rate", value }) }));
      const d = rowOf(test, "debt");
      expect(d.verdict).toBe("unchecked");
      // The spread is never read as the rate.
      expect(d.omSays).toEqual({ text: `Interest rate: ${value}`, value: null, page: 30 });
      expect(d.unchecked).toBe(`The OM states a floating rate (${value}), an index plus a spread, not a fixed rate, so it is shown as stated and priced on nothing.`);
      expect(d.gap).toBeNull();
      expect(d.impact).toBeNull();
      // The lender tests run at the model's rate, never at the spread.
      const lender = d.evidence.find((e) => e.label.startsWith("Lender tests"))!;
      expect(lender.text).toContain("on the model's year-1 NOI at 6.78%");
      const leverage = d.evidence.find((e) => e.label.startsWith("Negative leverage"))!;
      expect(leverage.text).toContain("the model's 6.78% rate, a screening default");
      // No re-run, so the headline does not test the debt, and says so.
      expect(test.headline?.untested?.keys).toContain("debt");
    });
  }

  it("reads '5.25% fixed' as the fixed rate it states", () => {
    const d = rowOf(buildStressTest(apartmentArgs({ extraction: withRows({ label: "Interest rate", value: "5.25% fixed" }) })), "debt");
    expect(d.omSays.value).toBe(5.25);
    expect(d.verdict).toBe("stretched");
    expect(d.impact!.omValue).toBeCloseTo(0.0525, 9);
  });

  it("sets the rate against the Treasury tenor nearest the OM's loan term where its figure is read, saying which", () => {
    const d = rowOf(buildStressTest(apartmentArgs({ extraction: withRows({ label: "Interest rate", value: "5.25%" }, { label: "Loan term", value: "10 years" }) })), "debt");
    expect(d.evidence[0].text).toBe("4.78% (FRED, Sep 17, 2026), the tenor nearest the model's 5-year hold; the OM's 10-year loan term (p. 30) is set against the 10-yr Treasury below");
    const term = d.evidence[1];
    expect(term).toMatchObject({ kind: "published", label: "The index for the OM's 10-year loan term (p. 30): 10-yr Treasury", publisher: "FRED", scope: "nation" });
    expect(term.text).toMatch(/, the Treasury tenor nearest the term$/);
    // The class's 200 bps over the 10-year decides, and the re-run is at it.
    const decider = d.evidence[d.decidedBy!];
    expect(decider.label).toBe("The class's screening spread over it, a rule of thumb");
    expect(decider.value).toBeCloseTo(Math.round((term.value! + 2) * 100) / 100, 9);
    expect(d.impact!.altValue).toBeCloseTo(decider.value! / 100, 9);
    expect(d.gap!.value).toBe(Math.round((decider.value! - 5.25) * 100));
    expect(d.gap!.text).toContain("under the index plus the class's spread, the 10-yr Treasury for the term,");
    // The market check's 10-year is not drawn a second time.
    expect(d.evidence.filter((e) => /10-year Treasury|10-yr Treasury/.test(e.label))).toHaveLength(1);
  });

  it("holds the rate to the hold's tenor where the term's own figure is not read, and says so", () => {
    const seven = rowOf(buildStressTest(apartmentArgs({ extraction: withRows({ label: "Interest rate", value: "5.25%" }, { label: "Loan term", value: "7 years" }) })), "debt");
    expect(seven.evidence[0].text).toBe(
      "4.78% (FRED, Sep 17, 2026), the tenor nearest the model's 5-year hold; the 7-yr Treasury, the tenor nearest the OM's 7-year loan term (p. 30), was not read here, so the rate is set against the hold's",
    );
    expect(seven.evidence[seven.decidedBy!].value).toBe(6.78);
    const five = rowOf(buildStressTest(apartmentArgs({ extraction: withRows({ label: "Interest rate", value: "5.25%" }, { label: "Loan term", value: "60 months" }) })), "debt");
    expect(five.evidence[0].text).toBe("4.78% (FRED, Sep 17, 2026), the tenor nearest the OM's 5-year loan term (p. 30) and the model's 5-year hold");
    // A term beside an amortization in one line is two spans: no term read.
    const both = rowOf(buildStressTest(apartmentArgs({ extraction: withRows({ label: "Interest rate", value: "5.25%" }, { label: "Loan term", value: "10 years, 30-year amortization" }) })), "debt");
    expect(both.evidence[0].text).toMatch(/since the OM states no loan term$/);
  });
});

describe("the NOI row's rent roll is said on the class's own yardstick", () => {
  it("a month a unit on an apartment roll", () => {
    const actualsIn = { rentRoll: ROLL, t12: { summary: T12, periodEnd: "2026-06-30" } };
    const actuals = readActuals({ metrics: APARTMENT.metrics, strategy: inferStrategy(APARTMENT), ...actualsIn, assetClass: "multifamily" });
    const n = rowOf(buildStressTest(apartmentArgs({ actuals })), "noi");
    const rr = n.evidence.find((e) => e.label === "The rent roll's in-place rent against the OM's pro forma rent")!;
    expect(rr.text).toBe("$2,190/unit/mo in place (as of Jul 1, 2026) against the OM's pro forma rent of $2,350/unit/mo");
  });

  it("per SF a year on an office roll, never a suite's month beside a rent a foot", () => {
    const office: ExtractionResult = {
      ...APARTMENT,
      assetClass: "office",
      metrics: [...APARTMENT.metrics.filter((m) => !/Units|Pro forma rent/.test(m.label)), row("Pro forma rent", "$38.00/SF", "p. 20")],
    };
    const roll = { asOf: "2026-07-01", summary: { ...ROLL.summary, unitCount: 12, occupiedUnits: 11, weightedAvgRentPsf: 32.5, avgRentMonthly: 18_000, rentUnits: 11 } };
    const actuals = readActuals({ metrics: office.metrics, strategy: inferStrategy(office), rentRoll: roll, t12: { summary: T12, periodEnd: "2026-06-30" }, assetClass: "office" });
    const n = rowOf(buildStressTest(apartmentArgs({ extraction: office, actuals, storedAssetClass: "office" })), "noi");
    const rr = n.evidence.find((e) => e.label === "The rent roll's in-place rent against the OM's pro forma rent")!;
    expect(rr.text).toBe("$32.50/SF a year in place (as of Jul 1, 2026) against the OM's pro forma rent of $38.00/SF");
    expect(rr.text).not.toContain("18,000");
  });
});

describe("a challenge on an expense's level is the operating expenses', never the expense growth's", () => {
  const ch = (assumption: string, extra: Partial<ChallengerResult["challenges"][number]> = {}) => ({ assumption, severity: "medium" as const, challenge: "c", question: "q", page: "p. 21", ...extra });

  it("files a ratio, a share of income or a figure a unit on the operating-expense row, by its words or its figure", () => {
    expect(challengeKey(ch("Expense ratio of 28%"))).toBe("opex");
    expect(challengeKey(ch("Operating expenses at 28% of EGI", { key: "expense_growth", omFigure: 28 }))).toBe("opex");
    expect(challengeKey(ch("Operating expenses held at a low level", { key: "expense_growth", omFigure: 6_500 }))).toBe("opex");
    expect(challengeKey(ch("Expense growth of 2.5% a year", { key: "expense_growth", omFigure: 2.5 }))).toBe("expense_growth");
    expect(challengeKey(ch("Expense growth of 2.5%"))).toBe("expense_growth");
  });

  it("never draws a ratio as the growth row's question, beside a CPI test of a growth rate", () => {
    const test = buildStressTest(
      apartmentArgs({ challenger: { stressTest: "", challenges: [ch("Expense ratio of 28% of EGI", { key: "expense_growth", omFigure: 28, altFigure: 40, altBasis: "a rule of thumb" })] } }),
    );
    expect(rowOf(test, "expense_growth").challenge).toBeNull();
    // It rides on the operating-expense row, which the T-12 beside it would
    // test once the OM states a total or a ratio.
    expect(rowOf(test, "opex").challenge?.challenge).toBe("c");
    expect(test.rows.some((r) => r.key === "other")).toBe(false);
  });

  it("prints the challenge's own words as the OM's figure on an other row, never its bare number", () => {
    const test = buildStressTest(apartmentArgs({ challenger: { stressTest: "", challenges: [ch("Management fee of 3%", { key: "other", omFigure: 3 })] } }));
    const other = test.rows.find((r) => r.key === "other")!;
    expect(other.omSays).toEqual({ text: "Management fee of 3%", value: null, page: 21 });
    const html = renderToStaticMarkup(createElement(StressTestPanel, { test }));
    expect(html).not.toContain("Management fee of 3%: 3");
  });
});

describe("the taxes row is held to the seller's T-12 bill where no reset bill can be struck", () => {
  const withBill = (bill: string, extra: Partial<ExtractionResult> = {}): ExtractionResult => ({
    ...APARTMENT,
    ...extra,
    metrics: [...APARTMENT.metrics.filter((m) => m.label !== "Assessed value" && m.label !== "Real estate taxes"), row("Real estate taxes", bill, "p. 15")],
  });

  it("reads a line more than 2% under the T-12's stretched at most, re-run at the T-12's bill as a floor", () => {
    const args = apartmentArgs({ extraction: withBill("$300,000") });
    const test = buildStressTest(args);
    const t = rowOf(test, "taxes");
    const decider = t.evidence[t.decidedBy!];
    expect(decider).toMatchObject({ kind: "document", label: "The deal's T-12 tax line", value: 380_000 });
    expect(decider.text).toContain("; the seller's own bill, a working floor and a rule of thumb (a sale rarely lowers the bill), not the bill a new owner pays");
    expect(t.verdict).toBe("stretched");
    expect(t.gap).toMatchObject({ value: 80_000, unit: "usd" });
    expect(t.gap!.text).toContain("With no assessed value stated, no reset bill is struck");
    expect(t.impact!.input).toBe("expenseLines");
    // The model's line is the T-12's load, which already carries the T-12's
    // $380k: the T-12's run is the model's own line, never the gap added on.
    const model = args.derived!.inputs.expenseLines.reduce((s, l) => s + l.annual, 0);
    expect(t.impact!.altValue).toBeCloseTo(model, 0);
    expect(t.impact!.omValue).toBeCloseTo(model - 80_000, 0);
    // The headline marks the part as a floor, and the NOI is left out for its
    // components, the taxes among them.
    const part = test.headline!.parts.find((p) => p.key === "taxes")!;
    expect(part.conditional).toBe("at the seller's own T-12 bill, a working floor, not a new owner's bill");
    expect(test.headline!.omitted.find((o) => o.key === "noi")?.why).toBe(HEADLINE_NOI_LEFT_OUT);
    if (test.headline!.noiRest) expect(test.headline!.noiRest.components).toContain("taxes");
  });

  it("stands a line at or over the T-12's unchecked, as before", () => {
    const t = rowOf(buildStressTest(apartmentArgs({ extraction: withBill("$380,000") })), "taxes");
    expect(t.verdict).toBe("unchecked");
    expect(t.unchecked).toBe("The OM states no assessed value to work the reset bill from; the rate is the assessor's to give.");
    expect(t.evidence.find((e) => e.label === "The deal's T-12 tax line")!.text).toBe("$380k (Real estate taxes, TTM to Jun 30, 2026)");
  });

  it("never lets the T-12 decide on a conversion: the plan delivers a building assessed when it is finished", () => {
    const conversion = withBill("$300,000", { strategy: { kind: "conversion", summary: "", capitalBudget: "", timeline: "" } });
    const t = rowOf(buildStressTest(apartmentArgs({ extraction: conversion })), "taxes");
    expect(t.verdict).toBe("unchecked");
  });

  it("leaves the reset bill deciding where the OM states its assessed value", () => {
    const t = rowOf(buildStressTest(apartmentArgs()), "taxes");
    expect(t.evidence[t.decidedBy!].label).toBe("The bill the OM's own figures imply on the price");
  });
});

describe("the renovation premium shows the program's pace beside it, the OM against itself", () => {
  const program: ExtractionResult = {
    ...APARTMENT,
    metrics: [
      ...APARTMENT.metrics,
      row("Units to renovate", "120", "p. 22"),
      row("Renovation cost per unit", "$15,000", "p. 22"),
      row("Renovation premium", "$250/mo", "p. 22"),
      row("Achieved renovation premium", "$190/mo", "p. 23"),
      row("Annual turnover", "35%", "p. 23"),
      row("Renovation period", "24 months", "p. 22"),
    ],
  };

  it("says the turnover the period needs against the turnover stated, deciding nothing and re-running nothing", () => {
    const r = rowOf(buildStressTest(apartmentArgs({ extraction: program })), "renovation_premium");
    const pace = r.evidence.find((e) => e.label === "The program's pace against the turnover the OM states")!;
    expect(pace).toMatchObject({ kind: "om_internal", value: null, publisher: "the offering memorandum" });
    expect(pace.text).toBe("a 24-month program needs 50% of the classic units to turn each year; the OM states 35% a year, so the program takes 2.9 years");
    expect(r.evidence[r.decidedBy!].label).toBe("Achieved premium on the doors already renovated");
    expect(r.method).toContain("beside it, not deciding: ");
  });

  it("puts the rent roll's year of expiries beside it, said as expiries, not move-outs", () => {
    const roll = { ...ROLL, summary: { ...ROLL.summary, expiryBuckets: { next12mo: 0.42, y1to3: 0.58, y3to5: 0, y5plus: 0 }, expiryCoveredSf: 127_000 } };
    const actuals = readActuals({ metrics: program.metrics, strategy: inferStrategy(program), rentRoll: roll, t12: { summary: T12, periodEnd: "2026-06-30" }, assetClass: "multifamily" });
    const r = rowOf(buildStressTest(apartmentArgs({ extraction: program, actuals })), "renovation_premium");
    expect(r.evidence.find((e) => e.label === "The program's pace against the turnover the OM states")!.text).toMatch(
      /; the rent roll's leases ending within a year of Jul 1, 2026 cover 42% of the occupied area that states an end: expiries, not move-outs$/,
    );
  });

  it("says no pace where the OM states no turnover", () => {
    const r = rowOf(buildStressTest(apartmentArgs({ extraction: { ...program, metrics: program.metrics.filter((m) => m.label !== "Annual turnover") } })), "renovation_premium");
    expect(r.evidence.some((e) => /pace/.test(e.label))).toBe(false);
  });
});

describe("the headline names a hold the OM states that the model does not run", () => {
  it("says the OM's hold is untested, in one clause, where it differs from the model's", () => {
    const ex: ExtractionResult = { ...APARTMENT, metrics: [...APARTMENT.metrics, row("Hold period", "7 years", "p. 30")] };
    const test = buildStressTest(apartmentArgs({ extraction: ex }));
    expect(test.headline!.untested!.hold).toEqual({ omYears: 7, modelYears: 5, page: 30 });
    expect(untestedSentence(test.headline!)).toContain("the OM's 7-year hold (p. 30), since the model sells at 5 years");
  });

  it("says nothing where the OM's hold is the model's", () => {
    const ex: ExtractionResult = { ...APARTMENT, metrics: [...APARTMENT.metrics, row("Hold period", "5 years", "p. 30")] };
    const test = buildStressTest(apartmentArgs({ extraction: ex }));
    expect(test.headline!.untested?.hold).toBeUndefined();
  });
});

describe("the operating-expense row (the owner's decision of 2026-10-21)", () => {
  const withOpex = (...extra: ReturnType<typeof row>[]): ExtractionResult => ({ ...APARTMENT, metrics: [...APARTMENT.metrics, ...extra] });

  it("holds the OM's total, less the tax bill and premium it states, to the T-12 on the same footing, and re-runs one input apart", () => {
    const args = apartmentArgs({ extraction: withOpex(row("Operating expenses (pro forma)", "$1,500,000", "p. 9")) });
    const test = buildStressTest(args);
    const o = rowOf(test, "opex");
    // $1.5M less the OM's $380k bill and $120k premium, against the T-12's
    // $1.75M less its $380k tax line and $150k insurance line.
    expect(o.omSays).toMatchObject({ value: 1_000_000, page: 9 });
    expect(o.omSays.text).toBe("$1M ($6,536 a unit): the OM's operating expenses (pro forma) of $1.5M less its $380k tax bill (p. 15) and $120k premium (p. 15)");
    expect(o.footing).toEqual({ less: ["taxes", "insurance"] });
    const decider = o.evidence[o.decidedBy!];
    expect(decider).toMatchObject({ kind: "document", label: "The deal's T-12 operating expenses less taxes and insurance", value: 1_220_000, asOf: "2026-06-30" });
    expect(decider.text).toBe("$1.22M ($7,974 a unit): the T-12's $1.75M total less its $380k tax line and $150k insurance line (TTM to Jun 30, 2026)");
    // Each T-12 line on the footing, a unit, beside it and never deciding.
    const lines = o.evidence.find((e) => e.label === "The deal's T-12 expense lines")!;
    expect(lines).toMatchObject({ kind: "document", value: null });
    expect(lines.text).toBe("Payroll $620k ($4,052 a unit); Repairs & maintenance $600k ($3,922 a unit) (TTM to Jun 30, 2026)");
    // 18.0% under the T-12: past the NOI's 10% band, unsupported.
    expect(o.gap).toMatchObject({ value: 220_000, unit: "usd" });
    expect(o.gap!.text).toBe("The OM's $1M is $220k (18.0%) under the T-12's $1.22M.");
    expect(o.verdict).toBe("unsupported");
    expect(o.method).toBe(
      "The OM's operating expenses against the deal's T-12 operating expenses less taxes and insurance, the one figure that decides; beside it, not deciding: the deal's T-12 expense lines.",
    );
    // The model's line is the T-12's load: the OM's run swaps the T-12's
    // $1.22M for the OM's $1M, the evidence's is the line as it stands.
    const model = args.derived!.inputs.expenseLines.reduce((s, l) => s + l.annual, 0);
    expect(o.impact!.input).toBe("expenseLines");
    expect(o.impact!.altValue).toBeCloseTo(model, 0);
    expect(o.impact!.omValue).toBeCloseTo(model - 220_000, 0);
    expect(o.impact!.altIrrPct!).toBeLessThan(o.impact!.baseIrrPct!);
    // The headline swaps it as a component of the NOI, never beside it.
    const h = test.headline!;
    expect(h.parts.map((p) => p.key)).toContain("opex");
    expect(HEADLINE_NOI_COMPONENTS).toContain("opex");
    if (rowOf(test, "noi").verdict !== "holds") expect(h.omitted.find((x) => x.key === "noi")?.why).toBe(HEADLINE_NOI_LEFT_OUT);
  });

  it("sets the OM's case expense line at the OM's own stated total where the model carries the T-12's load: taxes, insurance and the rest swapped, none added twice", () => {
    const args = apartmentArgs({ extraction: withOpex(row("Operating expenses (pro forma)", "$1,500,000", "p. 9")) });
    const test = buildStressTest(args);
    const model = args.derived!.inputs.expenseLines.reduce((s, l) => s + l.annual, 0);
    // The model's line ties to the T-12's $1.75M total, so each row's OM run
    // is the line less the T-12's figure plus the OM's; the three moves add
    // to the OM's stated $1.5M total.
    expect(model).toBeCloseTo(1_750_000, -2);
    const move = (["taxes", "insurance", "opex"] as const).reduce((s, k) => s + (rowOf(test, k).impact ? rowOf(test, k).impact!.omValue - model : 0), 0);
    expect(model + move).toBeCloseTo(1_500_000, -2);
  });

  it("takes the total the OM names over a smaller expense line above it, and never takes out again a line the label leaves out", () => {
    // "Operating expenses" above "Total expenses": the total is the one
    // tested, less the bill and premium it holds.
    const both = rowOf(buildStressTest(apartmentArgs({ extraction: withOpex(row("Operating expenses", "$1,000,000", "p. 9"), row("Total expenses", "$1,500,000", "p. 9")) })), "opex");
    expect(both.omSays.value).toBe(1_000_000);
    expect(both.omSays.text).toBe("$1M ($6,536 a unit): the OM's total expenses of $1.5M less its $380k tax bill (p. 15) and $120k premium (p. 15)");
    // With no total named, the larger figure stated.
    const larger = rowOf(buildStressTest(apartmentArgs({ extraction: withOpex(row("Operating expenses", "$1,000,000", "p. 9"), row("Opex", "$1,500,000", "p. 9")) })), "opex");
    expect(larger.omSays.value).toBe(1_000_000);
    // A label that leaves the taxes out: only the premium is taken out of it,
    // and the footing still leaves both out.
    const excl = rowOf(buildStressTest(apartmentArgs({ extraction: withOpex(row("Operating expenses (excl. taxes)", "$1,120,000", "p. 9")) })), "opex");
    expect(excl.omSays.value).toBe(1_000_000);
    expect(excl.omSays.text).toBe("$1M ($6,536 a unit): the OM's operating expenses (excl. taxes) of $1.12M less its $120k premium (p. 15)");
    expect(excl.footing).toEqual({ less: ["taxes", "insurance"] });
    expect(excl.evidence[excl.decidedBy!].value).toBe(1_220_000);
  });

  it("says the re-run in one line, in the singular", () => {
    const o = rowOf(buildStressTest(apartmentArgs({ extraction: withOpex(row("Operating expenses (pro forma)", "$1,500,000", "p. 9")) })), "opex");
    expect(o.impact!.note).toMatch(/^If the operating-expense line less taxes and insurance is the deal's T-12's \$1\.22M, not the OM's \$1M, the levered IRR moves from/);
  });

  it("holds a figure within 5% of the T-12, or over it", () => {
    for (const [total, verdict] of [["$1,690,000", "holds"], ["$1,900,000", "holds"], ["$1,600,000", "stretched"]] as const) {
      const o = rowOf(buildStressTest(apartmentArgs({ extraction: withOpex(row("Operating expenses (pro forma)", total, "p. 9")) })), "opex");
      expect(o.verdict, total).toBe(verdict);
    }
  });

  it("reads a ratio the OM states on its stated EGI, and its own lines beside the T-12's", () => {
    const o = rowOf(
      buildStressTest(
        apartmentArgs({
          extraction: withOpex(row("Expense ratio (pro forma)", "40%", "p. 9"), row("Effective gross income (pro forma)", "$4,000,000", "p. 9"), row("Management fee", "3.0%", "p. 9"), row("Payroll", "$590,000", "p. 9")),
        }),
      ),
      "opex",
    );
    expect(o.omSays.text).toContain("the OM's 40.0% expense ratio (pro forma) on the OM's effective gross income (pro forma) of $4M, $1.6M");
    expect(o.omSays.value).toBe(1_100_000);
    expect(o.evidence.find((e) => e.label === "The deal's T-12 expense lines")!.text).toContain(
      "payroll $590k ($3,856 a unit) (p. 9), the T-12's $620k ($4,052 a unit)",
    );
  });

  it("decides on the class's ratio, a rule of thumb, only where no T-12 is on file, stretched at most", () => {
    const ex = withOpex(row("Operating expenses (pro forma)", "$1,000,000", "p. 9"));
    const derived = deriveUnderwriteInputs(ex, "x", undefined, { debtIndex: FIVE });
    const o = rowOf(buildStressTest(apartmentArgs({ extraction: ex, actuals: null, derived, modelVsMarket: readFor(derived) })), "opex");
    const decider = o.evidence[o.decidedBy!];
    expect(decider).toMatchObject({ kind: "rule_of_thumb", label: "The class's expense ratio, a rule of thumb" });
    expect(decider.text).toMatch(/^42% of EGI, the multifamily screening default, on the \$3\.65M the OM's \$2\.65M NOI and its \$1M of expenses make is \$1\.53M less the OM's own \$380k tax bill and \$120k premium, \$1\.03M: a rule of thumb, not this building's cost$/);
    expect(o.ruleOfThumbOnly).toBe(true);
    expect(o.gap!.text).toContain("Against a rule of thumb only.");
    expect(["holds", "stretched"]).toContain(o.verdict);
  });

  it("reads the model's line, struck on the class's ratio, as carrying the class's figure: the OM's run swaps it out, the evidence's is the model's own", () => {
    const ex = withOpex(row("Operating expenses (pro forma)", "$1,000,000", "p. 9"));
    const derived = deriveUnderwriteInputs(ex, "x", undefined, { debtIndex: FIVE });
    expect(derived.meta.defaultExpenseRatio).toBeTruthy();
    const test = buildStressTest(apartmentArgs({ extraction: ex, actuals: null, derived, modelVsMarket: readFor(derived) }));
    const o = rowOf(test, "opex");
    const model = derived.inputs.expenseLines.reduce((s, l) => s + l.annual, 0);
    const fig = o.evidence[o.decidedBy!].value!;
    // The evidence's run is the model's own line; the OM's is that line less
    // the class's figure plus the OM's — the gap counted once.
    expect(o.impact!.altValue).toBeCloseTo(model, 0);
    expect(o.impact!.omValue).toBeCloseTo(model - fig + o.omSays.value!, 0);
    expect(o.impact!.altValue - o.impact!.omValue).toBeCloseTo(o.gap!.value, 0);
    // The model's own run is the evidence's: the OM's lighter line earns more.
    expect(o.impact!.altIrrPct!).toBeCloseTo(computeUnderwrite(derived.inputs).returns.leveredIrrPct! * 100, 6);
    expect(o.impact!.baseIrrPct!).toBeGreaterThan(o.impact!.altIrrPct!);
    expect(o.impact!.note).toContain("The model itself already runs at it.");
    // The headline never names the model's line as the OM's figure.
    expect(keptSentence(test) ?? "").not.toContain("the operating expenses");
    expect(test.headline!.atEvidence?.some((k) => k.key === "opex")).toBe(false);
  });

  it("stands unchecked where the T-12 breaks out no line the OM's figure leaves out", () => {
    const noIns = { ...T12, opex: T12.opex.filter((l) => l.key !== "insurance"), totalOpex: 1_600_000 };
    const ex = withOpex(row("Operating expenses (pro forma)", "$1,500,000", "p. 9"));
    const actuals = readActuals({ metrics: ex.metrics, strategy: inferStrategy(ex), rentRoll: null, t12: { summary: noIns, periodEnd: "2026-06-30" }, assetClass: "multifamily" });
    const o = rowOf(buildStressTest(apartmentArgs({ extraction: ex, actuals })), "opex");
    expect(o.verdict).toBe("unchecked");
    expect(o.unchecked).toBe("The deal's T-12 breaks out no insurance line, so its expenses cannot be set apart from the premium the OM's figure leaves out to its own row.");
    expect(o.impact).toBeNull();
  });

  it("builds no row on a development or a conversion, and none where nothing is stated or found", () => {
    const dev: ExtractionResult = { ...withOpex(row("Operating expenses (pro forma)", "$1,500,000", "p. 9")), strategy: { kind: "development", summary: "", capitalBudget: "", timeline: "" } };
    expect(buildStressTest(apartmentArgs({ extraction: dev })).rows.some((r) => r.key === "opex")).toBe(false);
    expect(buildStressTest(apartmentArgs({ actuals: null })).rows.some((r) => r.key === "opex")).toBe(false);
  });

  it("sets the OM's other income beside the NOI against the T-12's, never deciding it", () => {
    const n = rowOf(buildStressTest(apartmentArgs({ extraction: withOpex(row("Other income", "$110,000", "p. 9")) })), "noi");
    const oi = n.evidence.find((e) => e.label === "The OM's other income against the T-12's")!;
    expect(oi).toMatchObject({ kind: "document", value: null });
    expect(oi.text).toBe("the OM's other income of $110k (p. 9) against the T-12's $100k (TTM to Jun 30, 2026), 10.0% over it: beside the NOI, never deciding it");
    expect(n.evidence[n.decidedBy!].label).toBe("The deal's T-12 NOI");
  });

  it("holds the prompt's expense labels to the reader", () => {
    const prompt = extractionInstruction("multifamily");
    for (const label of ["Operating expenses (pro forma)", "Expense ratio (pro forma)", "Effective gross income (pro forma)", "Management fee", "Payroll", "Repairs and maintenance", "Utilities", "Other income"]) {
      expect(prompt, label).toContain(`"${label}"`);
    }
    const test = buildStressTest(
      apartmentArgs({
        extraction: withOpex(
          row("Operating expenses (pro forma)", "$1,500,000", "p. 9"),
          row("Management fee", "$120,000", "p. 9"),
          row("Payroll", "$590,000", "p. 9"),
          row("Repairs and maintenance", "$560,000", "p. 9"),
          row("Utilities", "$300,000", "p. 9"),
          row("Other income", "$110,000", "p. 9"),
        ),
      }),
    );
    const beside = rowOf(test, "opex").evidence.find((e) => e.label === "The deal's T-12 expense lines")!.text;
    for (const name of ["management fee $120k", "payroll $590k", "repairs and maintenance $560k", "utilities $300k"]) expect(beside, name).toContain(name);
    expect(rowOf(test, "noi").evidence.some((e) => e.label === "The OM's other income against the T-12's")).toBe(true);
  });
});

describe("the market-rent row (the owner's decision of 2026-10-21)", () => {
  const comps = (...leaseComps: { name: string; detail: string; support: "supports" | "favorable" | "stretched" }[]) => ({
    saleComps: [],
    leaseComps: leaseComps.map((c) => ({ ...c, note: "", page: "p. 16" })),
    redFlags: [],
    summary: "",
  });
  const three = comps(
    { name: "The Rowan", detail: "$2,050/mo one-bedroom", support: "supports" },
    { name: "The Calder", detail: "$2,300/mo two-bedroom", support: "supports" },
    { name: "Hale House", detail: "$2,250/mo two-bedroom", support: "supports" },
    { name: "The Vue", detail: "$2,900/mo, new construction", support: "stretched" },
  );

  it("holds the OM's pro forma rent to the median of three lease comps graded clean, the others named, and re-runs nothing on a stabilized deal", () => {
    const test = buildStressTest(apartmentArgs({ brokerComps: three }));
    const r = rowOf(test, "market_rent");
    expect(r.omSays).toEqual({ text: "$2,350/mo: Pro forma rent $2,350/unit/mo", value: 2_350, page: 20 });
    expect(r.yardstick).toBe("/mo");
    const decider = r.evidence[r.decidedBy!];
    expect(decider).toMatchObject({ kind: "om_internal", label: "The memorandum's lease comps", value: 2_250, page: 16 });
    expect(decider.text).toBe(
      "4 of 4 state a rent a month a unit; graded clean (supports): The Rowan $2,050/mo; The Calder $2,300/mo; Hale House $2,250/mo — median $2,250/mo over the 3; left out, graded stretched by the comps step (not comparable to the subject): The Vue $2,900/mo",
    );
    // 4.4% over the median: inside the comps' 5%, a hold.
    expect(r.gap).toMatchObject({ value: 4.4, unit: "pct" });
    expect(r.gap!.text).toBe("The OM's $2,350/mo is 4.4% over the median of its lease comps graded clean, $2,250/mo.");
    expect(r.verdict).toBe("holds");
    expect(r.impact).toBeNull();
    expect(r.noRerun).toBe(MARKET_RENT_NO_RERUN);
    expect(r.method).toBe("The OM's market rent against the memorandum's lease comps (the offering memorandum), the one figure that decides.");
  });

  it("reads unsupported past 15% over the median, and the headline names it as no model input", () => {
    const ex: ExtractionResult = { ...APARTMENT, metrics: APARTMENT.metrics.map((m) => (m.label === "Pro forma rent" ? row("Pro forma rent", "$2,650/mo", "p. 20") : m)) };
    const test = buildStressTest(apartmentArgs({ extraction: ex, brokerComps: three }));
    const r = rowOf(test, "market_rent");
    expect(r.verdict).toBe("unsupported");
    expect(test.headline!.omitted.find((o) => o.key === "market_rent")?.why).toBe("a market rent is no model input: the model runs today's rent, which the NOI row carries");
  });

  it("strikes no median under three comps graded clean, and says how many there are", () => {
    const r = rowOf(buildStressTest(apartmentArgs({ brokerComps: comps({ name: "The Rowan", detail: "$2,050/mo", support: "supports" }, { name: "The Vue", detail: "$2,900/mo", support: "favorable" }) })), "market_rent");
    expect(r.verdict).toBe("unchecked");
    expect(r.unchecked).toBe("Fewer than 3 of the memorandum's lease comps graded clean (supports) state a rent a month a unit (1 of 2), so no median is struck: the comps' own floor.");
    expect(r.evidence[0].value).toBeNull();
    expect(r.evidence[0].text).toContain(", too few graded clean for a median (3 or more); left out, graded favorable");
  });

  it("sets the rent roll's in-place rent beside it as the gap the OM claims to close, and Zillow's asking rent as the metro's", () => {
    const actuals = readActuals({ metrics: APARTMENT.metrics, strategy: inferStrategy(APARTMENT), rentRoll: ROLL, t12: { summary: T12, periodEnd: "2026-06-30" }, assetClass: "multifamily" });
    const market = { checks: [], summary: "", liveBrief: { metro: "Washington DC", readOn: READ_ON, lines: [], figures: [{ key: "zori_mfr_rent", label: "Asking rent, apartments", value: 2150, unit: "usd" as const, asOf: "2026-08-31" }] } };
    const r = rowOf(buildStressTest(apartmentArgs({ brokerComps: three, actuals, market })), "market_rent");
    const roll = r.evidence.find((e) => e.label === "The rent roll's in-place rent")!;
    expect(roll).toMatchObject({ kind: "document", value: 2_190 });
    expect(roll.text).toBe("$2,190/mo in place (as of Jul 1, 2026), $160/mo under the OM's $2,350/mo: the gap the OM claims to close; today's rent, not a market's");
    const z = r.evidence.find((e) => e.publisher === "Zillow Research")!;
    expect(z).toMatchObject({ kind: "published", label: "Asking rent, apartments, metro area", value: 2_150, scope: "metro" });
    expect(z.text).toBe("$2,150/mo (Aug 2026), the metro's asking rent for apartments before concessions: the metro's, not this building's");
    // Neither decides: the comps' median does.
    expect(r.evidence[r.decidedBy!].label).toBe("The memorandum's lease comps");
  });

  it("reads an office's rent a square foot a year", () => {
    const office: ExtractionResult = { ...APARTMENT, assetClass: "office", metrics: [...APARTMENT.metrics.filter((m) => !/Units|Pro forma rent/.test(m.label)), row("Market rent", "$38.00/SF", "p. 20")] };
    const derived = deriveUnderwriteInputs(office, "x", undefined, { debtIndex: FIVE });
    const r = rowOf(
      buildStressTest(
        apartmentArgs({
          extraction: office,
          derived,
          actuals: null,
          storedAssetClass: "office",
          modelVsMarket: null,
          brokerComps: comps({ name: "One", detail: "$34.00/SF NNN", support: "supports" }, { name: "Two", detail: "$35.50/SF/yr", support: "supports" }, { name: "Three", detail: "$3.00/SF/mo", support: "supports" }),
        }),
      ),
      "market_rent",
    );
    expect(r.yardstick).toBe("/SF");
    expect(r.evidence[0].value).toBe(35.5);
    expect(r.gap).toMatchObject({ value: 7, unit: "pct" });
    expect(r.verdict).toBe("stretched");
  });

  it("strikes no median over comps graded clean that state different lease bases, on a class quoted by the foot", () => {
    const office: ExtractionResult = { ...APARTMENT, assetClass: "office", metrics: [...APARTMENT.metrics.filter((m) => !/Units|Pro forma rent/.test(m.label)), row("Market rent", "$38.00/SF", "p. 20")] };
    const derived = deriveUnderwriteInputs(office, "x", undefined, { debtIndex: FIVE });
    const r = rowOf(
      buildStressTest(
        apartmentArgs({
          extraction: office,
          derived,
          actuals: null,
          storedAssetClass: "office",
          modelVsMarket: null,
          brokerComps: comps({ name: "One", detail: "$34.00/SF NNN", support: "supports" }, { name: "Two", detail: "$41.00/SF full service", support: "supports" }, { name: "Three", detail: "$35.50/SF/yr", support: "supports" }),
        }),
      ),
      "market_rent",
    );
    expect(r.verdict).toBe("unchecked");
    expect(r.unchecked).toBe(
      "The memorandum's lease comps graded clean (supports) state their rents on different lease bases (net and full service), and a rent on one basis is not the same rent on another, so no median is struck over them.",
    );
    expect(r.evidence[0].value).toBeNull();
    expect(r.evidence[0].text).toContain(", stated on different lease bases (net and full service), so no median is struck over them");
    expect(STRESS_METHODS.find((m) => m.key === "market_rent")!.limits.join(" ")).toContain("comps graded clean on different bases strike no median");
  });

  it("sets Zillow's asking rent beside an apartment's or a rented home's rent only, never a pad's or a bed's", () => {
    const market = {
      checks: [],
      summary: "",
      liveBrief: {
        metro: "Washington DC",
        readOn: READ_ON,
        lines: [],
        figures: [
          { key: "zori_mfr_rent", label: "Asking rent, apartments", value: 2150, unit: "usd" as const, asOf: "2026-08-31" },
          { key: "zori_rent", label: "Asking rent, all homes", value: 2412, unit: "usd" as const, asOf: "2026-08-31" },
        ],
      },
    };
    const zillow = (r: StressRow | undefined) => r?.evidence.find((e) => e.publisher === "Zillow Research") ?? null;
    const of = (cls: string, count: string, rent: string) => {
      const ex: ExtractionResult = { ...APARTMENT, assetClass: cls, metrics: [...APARTMENT.metrics.filter((m) => !/Units|Pro forma rent/.test(m.label)), row(count, "200", "p. 4"), row("Market rent", rent, "p. 20")] };
      return buildStressTest(apartmentArgs({ extraction: ex, storedAssetClass: cls, market, actuals: null, brokerComps: three })).rows.find((x) => x.key === "market_rent");
    };
    expect(zillow(of("manufactured_housing", "Pads", "$525/pad/mo"))).toBeNull();
    expect(zillow(of("student_housing", "Beds", "$950/bed/mo"))).toBeNull();
    expect(zillow(of("sfr_btr", "Homes", "$2,600/home/mo"))).toMatchObject({ label: "Asking rent, all home types, metro area", value: 2_412 });
    expect(zillow(of("multifamily", "Units", "$2,350/unit/mo"))).toMatchObject({ label: "Asking rent, apartments, metro area", value: 2_150 });
  });

  it("reads a parking space's month as stated, and says the yardstick in the class's own noun", () => {
    const garage: ExtractionResult = { ...APARTMENT, assetClass: "parking", metrics: [...APARTMENT.metrics.filter((m) => !/Units|Pro forma rent/.test(m.label)), row("Spaces", "400", "p. 4"), row("Market rent", "$95/space/mo", "p. 20")] };
    const r = rowOf(
      buildStressTest(
        apartmentArgs({
          extraction: garage,
          storedAssetClass: "parking",
          actuals: null,
          brokerComps: comps({ name: "Deck A", detail: "$85/space/mo", support: "supports" }, { name: "Deck B", detail: "$90/space/mo", support: "supports" }, { name: "Deck C", detail: "$100/space/mo", support: "supports" }),
        }),
      ),
      "market_rent",
    );
    expect(r.omSays.value).toBe(95);
    expect(r.evidence[0].text).toMatch(/^3 of 3 state a rent a month a space; graded clean \(supports\): Deck A \$85\/mo; Deck B \$90\/mo; Deck C \$100\/mo — median \$90\/mo over the 3$/);
    expect(r.evidence[r.decidedBy!].value).toBe(90);
  });

  it("on a value-add, re-runs the yield on cost with the gap on every unit at the OM's own vacancy, and leaves it out of the headline beside a premium", () => {
    const metrics = [
      row("Asking price", "$42,000,000", "p. 5"),
      row("Units", "153", "p. 4"),
      row("NOI (in-place)", "$2,400,000", "p. 7"),
      row("NOI (stabilized, pro forma)", "$3,000,000", "p. 7"),
      row("Stabilized vacancy", "5.0%", "p. 21"),
      row("Renovation budget", "$1,800,000", "p. 22"),
      row("Pro forma rent", "$2,600/mo", "p. 20"),
    ];
    const ex: ExtractionResult = { ...APARTMENT, strategy: { kind: "value_add", summary: "", capitalBudget: "", timeline: "" }, metrics };
    const derived = deriveUnderwriteInputs(ex, "x", undefined, { debtIndex: FIVE });
    const r = rowOf(buildStressTest(apartmentArgs({ extraction: ex, derived, actuals: null, modelVsMarket: null, brokerComps: three })), "market_rent");
    // $350 a month over the $2,250 median on 153 units, twelve months, at
    // the OM's 5.0% vacancy: $610,470 off the stabilized NOI.
    expect(r.impact).toMatchObject({ measure: "yield_on_cost", input: "stabilizedNoi", omValue: 3_000_000 });
    expect(r.impact!.altValue).toBeCloseTo(3_000_000 - 350 * 153 * 12 * 0.95, 0);
    expect(r.impact!.caveat).toContain("The gap is on the 153 units, twelve months each, at the OM's own 5.0% vacancy");
    // Beside a renovation premium past its evidence, the market rent is left
    // out of the split, said so.
    const withPremium: ExtractionResult = {
      ...ex,
      metrics: [...metrics, row("Units to renovate", "120", "p. 22"), row("Renovation cost per unit", "$15,000", "p. 22"), row("Renovation premium", "$250/mo", "p. 22"), row("Achieved renovation premium", "$190/mo", "p. 23")],
    };
    const d2 = deriveUnderwriteInputs(withPremium, "x", undefined, { debtIndex: FIVE });
    const t2 = buildStressTest(apartmentArgs({ extraction: withPremium, derived: d2, actuals: null, modelVsMarket: null, brokerComps: three }));
    expect(t2.headline!.parts.map((p) => p.key)).toContain("renovation_premium");
    expect(t2.headline!.omitted.find((o) => o.key === "market_rent")?.why).toBe(PLAN_MARKET_RENT_BESIDE_PREMIUM);
  });

  it("builds no row on a class that quotes no rent, and none where nothing is stated or found", () => {
    const hotel: ExtractionResult = { ...APARTMENT, assetClass: "hospitality_str" };
    expect(buildStressTest(apartmentArgs({ extraction: hotel, storedAssetClass: "hospitality_str", brokerComps: three })).rows.some((x) => x.key === "market_rent")).toBe(false);
    const bare: ExtractionResult = { ...APARTMENT, metrics: APARTMENT.metrics.filter((m) => m.label !== "Pro forma rent") };
    expect(buildStressTest(apartmentArgs({ extraction: bare, actuals: null })).rows.some((x) => x.key === "market_rent")).toBe(false);
  });
});

describe("a term sheet on file decides the debt row (the owner's decision of 2026-10-21)", () => {
  const quote = (ratePct: number | null, stated = ratePct != null ? `${ratePct.toFixed(2)}%` : "SOFR + 2.75%") => ({ ratePct, stated, floating: ratePct == null, filename: "Brixton term sheet.pdf", asOf: "2026-10-03" });

  it("holds the OM's rate to the lender's quote, a document of the deal's own, and re-runs the model's rate one input apart", () => {
    const args = apartmentArgs({ loanQuote: quote(6.1) });
    const d = rowOf(buildStressTest(args), "debt");
    const decider = d.evidence[d.decidedBy!];
    expect(decider).toMatchObject({ kind: "document", label: "The lender's quote on file", value: 6.1, asOf: "2026-10-03", publisher: "the deal's loan terms", scope: "deal" });
    expect(decider.text).toBe("6.10% as the deal's loan terms state it (Brixton term sheet.pdf, on file since Oct 3, 2026): a lender's quote, not a screening default");
    // The OM's 5.25% is 85 bps under it: past the 50, unsupported — no
    // screening default caps it at stretched.
    expect(d.gap).toMatchObject({ value: 85, unit: "bps" });
    expect(d.gap!.text).toBe("The OM's 5.25% is 85 bps under the lender's quote on file, 6.10%.");
    expect(d.verdict).toBe("unsupported");
    expect(d.ruleOfThumbOnly).toBeUndefined();
    expect(d.impact).toMatchObject({ input: "allInRatePct", omValue: 0.0525, altValue: 0.061 });
    expect(d.impact!.note).toMatch(/^If the all-in rate is the lender's quote on file, 6\.10%, not the OM's 5\.25%, the levered IRR moves from/);
    // The screening default stands beside it, deciding nothing.
    expect(d.method).toMatch(/^The OM's debt against the lender's quote on file \(the deal's loan terms\), the one figure that decides; beside it, not deciding: the index the model prices off/);
  });

  it("holds a rate at or over the quote", () => {
    expect(rowOf(buildStressTest(apartmentArgs({ loanQuote: quote(5.25) })), "debt").verdict).toBe("holds");
    expect(rowOf(buildStressTest(apartmentArgs({ loanQuote: quote(5.0) })), "debt").verdict).toBe("holds");
  });

  it("shows a floating quote as stated, priced on nothing, and the screening default decides", () => {
    const d = rowOf(buildStressTest(apartmentArgs({ loanQuote: quote(null) })), "debt");
    const q = d.evidence.find((e) => e.label === "The lender's quote on file")!;
    expect(q).toMatchObject({ kind: "document", value: null });
    expect(q.text).toBe("SOFR + 2.75% as the deal's loan terms state it (Brixton term sheet.pdf, on file since Oct 3, 2026): a floating rate, shown as stated and priced on nothing");
    expect(d.evidence[d.decidedBy!].label).toBe(rowOf(buildStressTest(apartmentArgs()), "debt").evidence[rowOf(buildStressTest(apartmentArgs()), "debt").decidedBy!].label);
    expect(d.ruleOfThumbOnly).toBe(true);
  });

  it("keeps a quote-decided debt row that is in the headline out of the brief: no rate, no pairing, no verdict word", () => {
    const full = buildStressTest(apartmentArgs({ loanQuote: quote(6.5) }));
    expect(rowOf(full, "debt").evidence[rowOf(full, "debt").decidedBy!].label).toBe("The lender's quote on file");
    // The quote's row is a player in the full test's headline.
    expect(full.headline!.parts.some((p) => p.key === "debt")).toBe(true);
    expect(headlineSentence(full)).toContain("6.50%");
    // The guard, for a caller that hands the brief the full test anyway.
    const guarded = stressSection(full).join("\n");
    expect(guarded).not.toContain("6.50%");
    expect(guarded).not.toMatch(/the loan rate [\d.]+% \(the model's/);
    expect(guarded).not.toContain("HEADLINE (the engine's");
    const debtLine = guarded.split("\n").find((l) => l.startsWith("- Debt (debt)"))!;
    expect(debtLine).not.toMatch(/\[(UNSUPPORTED|STRETCHED|HOLDS|UNCHECKED)\]/);
    // What the pipeline hands the brief: the same build with no quote
    // (lib/anthropic/pipeline `screenStressTest`'s `brief`).
    const brief = stressSection(buildStressTest(apartmentArgs({ loanQuote: null }))).join("\n");
    expect(brief).not.toContain("6.50%");
    expect(brief).not.toContain("The lender's quote on file");
    expect(brief).toContain("HEADLINE (the engine's");
    const pipeline = readFileSync("lib/anthropic/pipeline.ts", "utf8");
    expect(pipeline).toContain("brief: args.loanQuote ? buildStressTest({ ...args, loanQuote: null }) : full");
    expect(pipeline).toContain("const stressTest = tests?.brief ?? null;");
    // Every surface names the same sheet: the deal page's oldest-first order.
    expect(readFileSync("lib/loan-quote-read.ts", "utf8")).toContain('.order("created_at", { ascending: true })');
  });

  it("decides nothing where the OM states no rate, and is handed no quote on the shared screen", () => {
    const noRate: ExtractionResult = { ...APARTMENT, metrics: APARTMENT.metrics.filter((m) => m.label !== "Interest rate") };
    const d = rowOf(buildStressTest(apartmentArgs({ extraction: noRate, loanQuote: quote(6.1) })), "debt");
    expect(d.verdict).toBe("unchecked");
    expect(d.unchecked).toBe("The OM states no loan rate.");
    const share = readFileSync("app/share/[token]/page.tsx", "utf8");
    expect(share).not.toMatch(/loanQuote|readLoanQuote|loanQuoteOf/);
    // Every surface that may read the deal's documents hands it in.
    for (const f of ["app/(app)/deals/[id]/page.tsx", "app/api/deals/[id]/memo/route.ts", "app/api/deals/[id]/report/route.ts", "app/api/deals/[id]/underwrite.xlsx/route.ts", "lib/anthropic/pipeline.ts"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/loanQuote: /);
    }
  });
});
