import { readFileSync } from "node:fs";
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
import { IMPLIED_CAP_CEILING, inferStrategy, planSummary, planWithBasisChecked } from "./deal-strategy";
import { subjectBasis } from "./comp-detail";
import { interestOf } from "./interest";
import { screenYearOf } from "./criteria";
import { basisTag } from "./pipeline-slots";
import { compactUsd } from "./money";
import { NO_RENT_INDEX } from "./rent-growth-decider";
import type { ChallengerResult, ExtractionResult } from "./anthropic/types";
import type { DebtIndex } from "./debt-index";
import { STRESS_KEYS, STRESS_METHODS, type StressKey, type StressRow } from "./stress-test-types";
import {
  CHALLENGE_KEYWORDS,
  HEADLINE_NOI_COMPONENTS,
  HEADLINE_NOI_REST_SHARE,
  HEADLINE_UNTESTED_KEYS,
  ROSTER_UNTESTED_PCT,
  INSURANCE_NO_QUOTE,
  INSURANCE_RERUN_NOTE,
  IRR_MOVE_STRETCH_BPS,
  leaseUpNotModelled,
  VACANCY_UNSUPPORTED_PTS,
  SHARE_NO_MODEL,
  PLAN_BASIS_LEFT_OUT,
  PLAN_NO_YIELD_MEANING,
  PLAN_TAX_NOT_PRO_FORMA,
  PLAN_VACANCY_TODAY,
  PLAN_YIELD_LEAD,
  planNoYieldReason,
  buildStressTest,
  challengeKey,
  headlinePrice,
  stabilizedVacancyStated,
  vacancyDecidedBy,
  stressHeadline,
  type StressTestArgs,
} from "./stress-test";
import { HEADLINE_BASIS_LEFT_OUT, HEADLINE_METHOD, HEADLINE_NOI_LEFT_OUT, headlineBasisLeftOut } from "./stress-test-types";
import { headlineLine, headlineName, headlineSentence, headlineShort, keptSentence, moveShort, noMoveWhy, noiRestClause, noiRestSentence, ptsText, rerunWords, shownHeadline, stressReadLine, untestedSentence } from "./stress-test-words";
import { planYieldBase } from "./plan-sensitivity";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StressTestPanel } from "@/app/stress-test-panel";
import { readRoster } from "./tenant-roster";

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
    // The OM states no vacancy allowance: its figure is today's occupancy,
    // titled and worded so, never a pro forma assumption.
    expect(v.title).toBe("Occupancy today");
    expect(v.omSays).toEqual({ text: "Occupancy: 94% as stated — today's occupancy, not a pro forma assumption — which leaves 6.0% vacant", value: 6, page: 8 });
    expect(v.evidence[0]).toMatchObject({ kind: "document", publisher: "the deal's T-12", scope: "deal", value: 9.1, asOf: "2026-06-30" });
    // The share is over gross potential rent: here the rent line itself,
    // since the statement's stated EGI nets the vacancy from it — and the
    // sentence says what the loss was divided by.
    expect(v.evidence[0].label).toBe("The deal's T-12: vacancy loss over gross potential rent");
    expect(v.evidence[0].text).toBe("9.1% ($400k of $4.4M gross potential rent: the rent line, which the stated EGI nets the vacancy from; TTM to Jun 30, 2026)");
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
    // A publisher the label already names is not said twice.
    expect(v.method).toBe(
      "The OM's occupancy today against the deal's T-12: vacancy loss over gross potential rent, the one figure that decides; beside it, not deciding: rental vacancy, metro area (Census Bureau), rental vacancy, South Census region (Census Bureau via FRED) and multifamily vacancy, a rule of thumb.",
    );
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
    // re-run moves the levered IRR from 11.7% to 9.3%.
    const { sampleStressTest } = await import("@/lib/sample-cover");
    const n = rowOf(sampleStressTest("2026-10-19"), "noi");
    expect(IRR_MOVE_STRETCH_BPS).toBe(100);
    expect(n.verdict).toBe("stretched");
    expect(n.gap!.text).toMatch(/^The OM's \$3\.88M is 4\.7% \(\$174k\) over the deal's T-12's \$3\.71M\. The gap is inside the evidence's band, but the return moves \d+ bps on it \(levered IRR 11\.7% to 9\.3%\)\.$/);
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
    // under it reads stretched at most, and every sentence says the condition.
    expect(t.verdict).toBe("stretched");
    expect(t.gap!.text).toBe("If the sale resets the assessment to the price, the bill is $532k, $152k (28.6%) over the OM's $380k line — whether it does is the jurisdiction's to say.");
    expect(t.impact!.input).toBe("expenseLines");
    expect(t.impact!.altIrrPct!).toBeLessThan(t.impact!.baseIrrPct!);
    expect(t.impact!.note).toMatch(/^If the tax line is the \$532k bill if the sale resets the assessment to the price, not the OM's \$380k, the levered IRR moves from/);
    const i = rowOf(test, "insurance");
    expect(i.omSays.value).toBe(120_000);
    // The T-12's premium is the same seller's policy: shown as its history,
    // never the figure that decides.
    expect(i.evidence[0]).toMatchObject({ kind: "document", label: "The deal's T-12 insurance line", value: 150_000 });
    expect(i.evidence[0].text).toMatch(/; the seller's history, not a test of a new owner's quote$/);
    expect(i.evidence[1]).toMatchObject({ kind: "published", scope: "nation", publisher: "BLS via FRED", value: null });
    // The index's figure is the OM's own premium moved by it, labelled so —
    // never set out as a premium of its own, and carrying no figure any
    // surface could hold the OM's to.
    expect(i.evidence[1].label).toBe("The OM's $120k moved by the national premium index (PPI, commercial multiple peril)");
    expect(i.evidence[1].text).toMatch(/^\$\d+k \(the index [+-−]?\d+\.\d% over the year to .+\); the national move applied to the OM's own figure, not a test of this premium$/);
    // No quote for a new owner is on file, so nothing tests the premium.
    expect(i.verdict).toBe("unchecked");
    expect(i.gap).toBeNull();
    expect(i.unchecked).toBe(INSURANCE_NO_QUOTE);
    expect(i.method).toBe(
      "The OM's insurance beside the deal's T-12 insurance line and the OM's $120k moved by the national premium index (PPI, commercial multiple peril) (BLS via FRED): no figure decides it.",
    );
    // The return is re-run at the seller's own premium, said as no test.
    expect(i.impact!.input).toBe("expenseLines");
    expect(i.impact!.note.endsWith(INSURANCE_RERUN_NOTE)).toBe(true);
  });

  it("re-runs no insurance line without a T-12: the index only moves the OM's own premium", () => {
    const derived = deriveUnderwriteInputs(APARTMENT, "x", undefined, { debtIndex: FIVE });
    const t = buildStressTest(apartmentArgs({ derived, actuals: null, modelVsMarket: readFor(derived) }));
    const i = rowOf(t, "insurance");
    expect(i.verdict).toBe("unchecked");
    expect(i.unchecked).toBe(INSURANCE_NO_QUOTE);
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
    // The OM's run carries the OM's $120k premium in place of the T-12's
    // $150k; the evidence's run is the T-12's, which the model already runs.
    const i = rowOf(test, "insurance").impact!;
    expect(Math.round(i.omValue)).toBe(1_720_000);
    expect(Math.round(i.altValue)).toBe(1_750_000);
    expect(i.baseIrrPct!).toBeCloseTo(irrAt(1_720_000), 9);
    expect(i.altIrrPct!).toBeCloseTo(irrAt(total), 9);
    expect(i.note).toMatch(/^If the insurance line is the deal's T-12's \$150k, not the OM's \$120k, the levered IRR moves from /);
    expect(i.note).toMatch(/ The model itself already runs at it\. The T-12's premium is the seller's own history/);
    // The reset tax bill, against the T-12's $380k tax line (the OM's own
    // figure here): the OM's run is the model's line, the evidence's the line
    // less the T-12's $380k plus the $532k reset.
    const t = rowOf(test, "taxes").impact!;
    expect(Math.round(t.omValue)).toBe(1_750_000);
    expect(Math.round(t.altValue)).toBe(1_902_000);
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
      text: "Held to Zillow's apartment asking rents, the figure for this kind of rent: +1.1% over the year to Aug 2026 (Zillow Research). The OM's 4.0%/yr is 2.9 points over it.",
    });
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
      text: "Held to consumer prices, all items (the CPI), the broad price level the expense base moves with: +3.4% over the year to Aug 2026 (BLS via FRED). The OM's 2.5%/yr is 0.9 points under it.",
    });
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
    expect(test.rows.map((r) => r.key)).toEqual(["basis", "exit_cap", "debt", "noi", "vacancy", "rent_growth", "expense_growth", "taxes", "insurance"]);
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
  /** The Maddox with a stated pro forma vacancy beside its occupancy today. */
  const withVacancy = (pct: string, kind: "stabilized" | "value_add" = "stabilized"): ExtractionResult => ({
    ...APARTMENT,
    strategy: { kind, summary: "", capitalBudget: kind === "value_add" ? "$1,800,000" : "", timeline: "" },
    metrics: [...APARTMENT.metrics, row("Vacancy (pro forma)", pct, "p. 21")],
  });
  const argsFor = (ex: ExtractionResult, overrides: Partial<StressTestArgs> = {}): StressTestArgs => {
    const plan = ex.strategy?.kind !== "stabilized";
    const actualsIn = { t12: { summary: T12, periodEnd: "2026-06-30" } };
    const derived = deriveUnderwriteInputs(ex, "The Maddox", actualsIn, { debtIndex: FIVE });
    const actuals = readActuals({ metrics: ex.metrics, strategy: inferStrategy(ex), rentRoll: null, t12: actualsIn.t12, assetClass: "multifamily" });
    return { ...apartmentArgs({ extraction: ex, derived, actuals, modelVsMarket: readFor(derived, { plan }) }), ...overrides };
  };

  it("holds it to the metro's survey inside its margin, and shows the T-12's vacancy beside it as today's", () => {
    const v = rowOf(buildStressTest(argsFor(withVacancy("6.0%"))), "vacancy");
    expect(v.title).toBe("Stabilized vacancy");
    expect(v.omSays).toEqual({ text: "Vacancy (pro forma): 6.0%", value: 6, page: 21 });
    // The figure that decides first; the region's, the documents' and the
    // class's norm beside it.
    expect(v.evidence.map((e) => [e.kind, e.label])).toEqual([
      ["published", "Rental vacancy, metro area"],
      ["published", "Rental vacancy, South Census region"],
      ["document", "The deal's T-12: vacancy loss over gross potential rent"],
      ["rule_of_thumb", "Multifamily vacancy, a rule of thumb"],
    ]);
    expect(v.evidence[2].text).toBe(
      "9.1% ($400k of $4.4M gross potential rent: the rent line, which the stated EGI nets the vacancy from; TTM to Jun 30, 2026); today's, 3.1 points over the stabilized assumption — the gap a lease-up has to close",
    );
    // 6.0% against 6.2% ±2.2: inside the margin, so it holds.
    expect(v.gap).toEqual({
      value: 0.2,
      unit: "pts",
      text: "The OM's 6.0% is a stabilized assumption, so it is held to the market's published figure: rental vacancy, metro area (Census Bureau), 6.2% ±2.2 pts. The OM is 0.2 points under it, inside its margin. The deal's T-12 ran 9.1% vacant over its trailing year, 3.1 points over the assumption — the gap a lease-up has to close. The lease-up from today's 9.1% to the stabilized 6.0% is not modelled in either case: each runs its vacancy from year one.",
    });
    // The note rides only past the row's own threshold: 3.1 points over.
    expect(v.gap!.text.endsWith(leaseUpNotModelled(9.1, 6))).toBe(true);
    expect(STRESS_METHODS.find((m) => m.key === "vacancy")!.limits.join(" ")).toContain(`more than ${VACANCY_UNSUPPORTED_PTS} points over the assumption`);
    expect(v.verdict).toBe("holds");
    expect(v.method).toBe(
      "The OM's stabilized vacancy against rental vacancy, metro area (Census Bureau), the one figure that decides; beside it, not deciding: rental vacancy, South Census region (Census Bureau via FRED), the deal's T-12: vacancy loss over gross potential rent and multifamily vacancy, a rule of thumb.",
    );
    // The engine is re-run at the figure that decided.
    expect(v.impact!.evidenceIndex).toBe(0);
    expect(v.impact!.altValue).toBeCloseTo(0.062, 6);
    expect(v.impact!.note).toMatch(/^If vacancy is Census Bureau's 6\.2%, not the OM's 6\.0%/);
  });

  it("reads past the survey's margin stretched, and a building already at or under the assumption as support", () => {
    const tight = rowOf(buildStressTest(argsFor(withVacancy("3.0%"))), "vacancy");
    // 3.0% against 6.2% ±2.2: 3.2 points under, 1.0 past the margin.
    expect(tight.gap).toMatchObject({ value: 3.2, unit: "pts" });
    expect(tight.gap!.text).toContain("The OM is 3.2 points under it, 1.0 point past its margin.");
    expect(tight.verdict).toBe("stretched");
    const loose = rowOf(buildStressTest(argsFor(withVacancy("9.5%"))), "vacancy");
    expect(loose.verdict).toBe("holds");
    expect(loose.gap!.text).toContain("The OM is 3.3 points over it — the conservative side. The deal's T-12 ran 9.1% vacant over its trailing year, 0.4 points under the assumption — support for it.");
    expect(loose.evidence[2].text).toMatch(/; today's, 0\.4 points under the stabilized assumption — support for it$/);
  });

  it("with no fresh published figure, the documents decide, and the row says so", () => {
    const v = rowOf(buildStressTest(argsFor(withVacancy("6.0%"), { modelVsMarket: null })), "vacancy");
    expect(v.evidence.map((e) => e.kind)).toEqual(["document", "rule_of_thumb"]);
    expect(v.gap!.text).toBe(
      "The OM's 6.0% is 3.1 points under the evidence's 9.1%. No fresh published vacancy figure for this market could be held to the stabilized assumption, so the deal's own documents decide.",
    );
    expect(v.verdict).toBe("unsupported");
    expect(v.impact!.altValue).toBeCloseTo(0.091, 6);
  });

  it("on a plan deal the documents decide, as before, with no word about the market", () => {
    const v = rowOf(buildStressTest(argsFor(withVacancy("6.0%", "value_add"))), "vacancy");
    expect(v.evidence[0]).toMatchObject({ kind: "document", publisher: "the deal's T-12", value: 9.1 });
    expect(v.evidence[0].text).not.toContain("today's");
    expect(v.gap!.text).toBe("The OM's 6.0% is 3.1 points under the evidence's 9.1%.");
    expect(v.verdict).toBe("unsupported");
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
    // No fresh published figure: the documents decided, and a later rent roll
    // or T-12 scores the challenge.
    expect(vacancyDecidedBy(buildStressTest(argsFor(withVacancy("6.0%"), { modelVsMarket: null })))).toBe("document");
    expect(vacancyDecidedBy(null)).toBeNull();
    // The deal page asks it of its own built test, never of the extraction alone.
    const page = readFileSync("app/(app)/deals/[id]/page.tsx", "utf8");
    expect(page).toContain('stabilizedVacancyStated(extraction, firstSignal) && vacancyDecidedBy(stressTest) === "published"');
  });

  it("an occupancy the OM states for today is held to the documents, today's figures too", () => {
    // The Maddox states no allowance: its 94% is today's (the first describe).
    expect(rowOf(buildStressTest(apartmentArgs()), "vacancy").evidence[0]).toMatchObject({ kind: "document" });
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
      "Held to the rent sitting tenants pay (CPI rent), the figure for this kind of rent where no Zillow asking rent was read; it averages every lease in place, so it lags the rents new leases sign at: +5.0% over the year to Aug 2026 (BLS). The OM's 4.0%/yr is 1.0 point under it — the conservative side.",
    );
    expect(g.verdict).toBe("holds");
    // The evidence lifts the return: the conservative side's cushion.
    expect(g.impact!.altIrrPct!).toBeGreaterThan(g.impact!.baseIrrPct!);
  });

  it("with no apartment index for the month, Zillow's all-homes figure decides", () => {
    const args = apartmentArgs();
    const g = rowOf(buildStressTest({ ...args, modelVsMarket: readFor(args.derived!, { zori: { ...zori, mfrRent: null, mfrYoyPct: null } }) }), "rent_growth");
    expect(g.evidence.map((e) => e.label)).toEqual(["Asking rent, all home types", "Rent paid by sitting tenants (CPI rent)"]);
    expect(g.gap!.text).toMatch(/^Held to Zillow's asking rents across all home types, the nearest figure for this kind of rent, since Zillow's apartment index has no figure for the month: \+2\.3% over the year to Aug 2026 \(Zillow Research\)\. The OM's 4\.0%\/yr is 1\.7 points over it\.$/);
    expect(g.verdict).toBe("stretched");
  });

  it("reads a current, in-place, actual or T-12 vacancy as today's figure, never as a stabilized assumption held to the market (audit M6)", () => {
    for (const label of ["Current vacancy", "In-place vacancy", "Actual vacancy", "T-12 vacancy", "Vacancy today"]) {
      const ex = { ...APARTMENT, metrics: [...APARTMENT.metrics.filter((m) => m.label !== "Occupancy"), row("Units", "153"), row(label, "9.0%", "p. 8")] };
      expect(stabilizedVacancyStated(ex), label).toBe(false);
      const v = rowOf(buildStressTest(apartmentArgs({ extraction: ex })), "vacancy");
      expect(v.title, label).toBe("Occupancy today");
      expect(v.omSays.text, label).toBe(`${label}: 9.0% as stated — today's vacancy, not a pro forma assumption`);
      // Today's documents decide, never the market's survey.
      expect(v.evidence[0].kind, label).toBe("document");
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

  it("an exit flat to the going-in cap holds, and says most underwriting adds expansion — no expansion figure invented", () => {
    const x = rowOf(buildStressTest(apartmentArgs({ extraction: withCaps("5.50%", "5.50%") })), "exit_cap");
    expect(x.verdict).toBe("holds");
    expect(x.gap!.text).toBe("The OM's 5.50% exit is flat to its 5.50% going-in cap; most underwriting adds expansion over a hold.");
  });

  it("says the exit's spread under the 10-year where it is under it", () => {
    const x = rowOf(buildStressTest(apartmentArgs({ extraction: withCaps("5.71%", "4.50%") })), "exit_cap");
    // The going-in cap's spread over the same yield rides beside the exit's.
    expect(x.evidence[1].text).toBe("4.94% on Sep 17, 2026 — the exit's spread under it is 44 bps; the going-in cap's spread over it is 77 bps");
    expect(rowOf(buildStressTest(apartmentArgs({ extraction: withCaps("5.71%", "4.94%") })), "exit_cap").evidence[1].text).toBe(
      "4.94% on Sep 17, 2026 — the exit sits at it; the going-in cap's spread over it is 77 bps",
    );
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
    expect(sentence).toContain("the taxes (the OM's tax bill is not stated as its pro forma's line");
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
  // states its stabilized vacancy, its pro forma gross and its pro forma tax
  // line, so each moves the stabilized NOI.
  const metrics = [
    row("Asking price", "$42,000,000", "p. 5"),
    row("Units", "153", "p. 4"),
    row("Rentable SF", "140,000", "p. 4"),
    row("NOI (in-place)", "$2,400,000", "p. 7"),
    row("NOI (stabilized, pro forma)", "$3,000,000", "p. 7"),
    row("Stabilized vacancy", "5.0%", "p. 21"),
    row("Pro forma gross potential rent", "$5,000,000", "p. 21"),
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
    // Vacancy: the T-12's 9.1% decides a plan deal's vacancy; the gap on the
    // pro forma gross is $5M × 4.1 pts = $205k.
    const v = rowOf(test, "vacancy");
    expect(v.title).toBe("Stabilized vacancy");
    const tv = v.evidence[0].value!;
    expect(v.impact).toMatchObject({ measure: "yield_on_cost", input: "stabilizedNoi", evidenceIndex: 0, omValue: 3_000_000 });
    expect(v.impact!.altValue).toBeCloseTo(3_000_000 - (5_000_000 * (tv - 5)) / 100, 6);
    expect(v.impact!.baseYocPct!).toBeCloseTo((3_000_000 / COST) * 100, 9);
    expect(v.impact!.note).toContain("the gap struck on the OM's pro forma gross potential rent of $5M");
    // Taxes: the reset bill on the price, $380k / $30M × $42M = $532k, off
    // the stabilized NOI the pro forma's line is in.
    const t = rowOf(test, "taxes");
    expect(t.impact).toMatchObject({ measure: "yield_on_cost", input: "stabilizedNoi", omValue: 3_000_000, altValue: 3_000_000 - 152_000 });
    expect(t.noRerun).toBeUndefined();
    // The premium on the doors to renovate.
    expect(rowOf(test, "renovation_premium").impact!.altValue).toBe(3_000_000 - 86_400);
    // The NOI row tests today's income against the T-12: its verdict stands,
    // and no yield on cost is re-run on it.
    expect(rowOf(test, "noi").verdict).not.toBe("unchecked");
    expect(rowOf(test, "noi").noRerun).toBe(PLAN_NO_YIELD_MEANING.noi);
  });

  it("splits the gap by Shapley values, the parts adding to it and, printed, to the printed gap", () => {
    const h = test.headline!;
    expect(h.measure).toBe("yield_on_cost");
    const moves = { vacancy: rowOf(test, "vacancy").impact!, taxes: rowOf(test, "taxes").impact!, renovation_premium: rowOf(test, "renovation_premium").impact! };
    const drop = Object.values(moves).reduce((s, i) => s + (i.omValue - i.altValue), 0);
    expect(h.omYocPct!).toBeCloseTo((3_000_000 / COST) * 100, 9);
    expect(h.evidenceYocPct!).toBeCloseTo(((3_000_000 - drop) / COST) * 100, 9);
    expect(h.parts.map((p) => p.key).sort()).toEqual(["renovation_premium", "taxes", "vacancy"]);
    expect(h.parts.reduce((s, p) => s + p.pts, 0)).toBeCloseTo(h.evidenceYocPct! - h.omYocPct!, 9);
    // The NOI moves add over one cost, so each part is its own move over it.
    for (const p of h.parts) expect(p.pts).toBeCloseTo(-((moves[p.key as keyof typeof moves].omValue - moves[p.key as keyof typeof moves].altValue) / COST) * 100, 9);
    const shown = shownHeadline(h);
    expect(Math.round(shown.parts.reduce((s, p) => s + p.shown, 0) * 100)).toBe(Math.round((shown.evidence! - shown.om!) * 100));
    // The OM's own stated yield on cost rides beside the two cases, as the OM's.
    expect(h.statedYoc).toEqual({ pct: 7.1, label: "Untrended yield on cost", page: 24 });
    expect(headlineSentence(test)).toContain("The OM states its own yield on cost of 7.10% (Untrended yield on cost, p. 24).");
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
  basis: ["The memorandum's sale comps", "Recorded sales (", "Other memoranda's asking prices in"],
  exit_cap: ["The OM's going-in cap", "10-year Treasury", "cap (research tracker)"],
  debt: ["The index the model prices off", "Lender tests at screening defaults", "Negative leverage"],
  noi: ["The deal's T-12 NOI", "The rent roll's in-place rent", "The OM's in-place NOI against its pro forma"],
  vacancy: ["Rental vacancy, metro area", "vacancy (research tracker)", "The deal's rent roll", "a rule of thumb"],
  rent_growth: ["Asking rent, apartments", "Asking rent, all home types", "sitting tenants", "Rents charged by", "allowance on the regulated units"],
  expense_growth: ["Consumer prices", "Core CPI", "insurance premiums", "breakeven"],
  taxes: ["The bill the OM's own figures imply", "The stated tax abatement"],
  insurance: ["moved by the national premium index", "The deal's T-12 insurance line"],
  renovation_premium: ["Achieved premium", "classic and renovated rents"],
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
    expect(x.method).toMatch(/^The OM's exit cap against the OM's going-in cap \(the offering memorandum\), the one figure that decides; beside it, not deciding: .*cap \(research tracker\)/);
  });

  it("holds a commercial rent growth to its lessors' national index, and never to a regulation's allowance", () => {
    const office = rowOf(officeTest, "rent_growth");
    expect(office.gap!.text).toMatch(
      /^Held to the national index of rents charged by lessors of professional and office buildings, the figure for this kind of rent, the nation's lessors of this kind of building rather than the metro's: [+-]\d+\.\d% over the year to [A-Z][a-z]{2} \d{4} \(BLS via FRED\)\. The OM's 4\.0%\/yr is /,
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
    // Park Place is graded favorable — it leans the seller's way — so The
    // Ellery is the one comp graded clean, named, never called a median.
    expect(b.evidence[0].value).toBe(252_000);
    expect(b.evidence[1]).toMatchObject({ value: 240_000, href: "https://example.test/records", asOf: "2026-10-01" });
    expect(b.gap).toMatchObject({ unit: "pct", value: 8.9 });
    expect(b.gap!.text).toBe("The ask's $275k/unit is 8.9% over the one comp graded clean, The Ellery, $252k/unit.");
    expect(b.verdict).toBe("stretched");
    expect(b.impact!.input).toBe("purchasePrice");
    expect(b.impact!.altValue).toBeCloseTo((42_000_000 * 252_000) / 274_510, 0);
    // The note names whose figure the price is re-run at, and that the loan
    // re-sizes with the price — the comp's, not "the OM's".
    expect(b.impact!.note).toMatch(
      /^If the price is the one comp graded clean \(The Ellery\), \$38\.56M \(\$252k\/unit\), at the model's loan-to-cost \(the loan re-sizes with the price\), not the OM's \$42M \(\$275k\/unit\), the levered IRR moves from/,
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
    // (it leans the seller's way, lib/anthropic/prompts), is never clean.
    expect(b.evidence[0].value).toBe(252_000);
    expect(b.evidence[0].text).toBe(
      "5 of 5 state a figure /unit; graded clean (supports): The Ellery $252k/unit; The Rowan $249k/unit; Hallam $258k/unit — median $252k/unit over the 3; left out, graded favorable by the comps step (it leans the seller's way): Park Place $261k/unit; left out, graded stretched by the comps step (it does not support the deal): Vue $298k/unit",
    );
    // Favorable alone is no clean comp: nothing is set against the ask.
    const favorable = rowOf(buildStressTest(apartmentArgs({ brokerComps: { ...comps, saleComps: [comps.saleComps[2]] } })), "basis");
    expect(favorable.evidence[0]).toMatchObject({ value: null });
    expect(favorable.evidence[0].text).toContain("none graded clean (supports)");
    expect(favorable.verdict).toBe("unchecked");
    expect(favorable.unchecked).toBe("No evidence above carries a figure the ask can be set against.");
    // None graded clean: no figure, and the row has nothing to decide on.
    const none = rowOf(buildStressTest(apartmentArgs({ brokerComps: { ...comps, saleComps: [comps.saleComps[1]] } })), "basis");
    expect(none.evidence[0]).toMatchObject({
      value: null,
      text: "1 of 1 state a figure /unit, none graded clean (supports), so none is set against the ask; left out, graded stretched by the comps step (it does not support the deal): Vue $298k/unit",
    });
    expect(none.verdict).toBe("unchecked");
  });

  it("names one or two clean comps, never a median, and calls the basis no worse than stretched on them", () => {
    const comp = (name: string, detail: string) => ({ name, detail, support: "supports" as const, note: "" });
    const one = rowOf(buildStressTest(apartmentArgs({ brokerComps: { saleComps: [comp("The Ellery", "$232,000 per unit")], leaseComps: [], redFlags: [], summary: "" } })), "basis");
    expect(one.evidence[0].text).toBe("1 of 1 state a figure /unit; graded clean (supports): The Ellery $232k/unit — the one comp graded clean, too few for a median");
    // 18.3% over would be unsupported on a median; on one comp, stretched.
    expect(one.verdict).toBe("stretched");
    expect(one.gap!.text).toBe("The ask's $275k/unit is 18.3% over the one comp graded clean, The Ellery, $232k/unit. On one comp, no worse than stretched.");
    const two = rowOf(
      buildStressTest(apartmentArgs({ brokerComps: { saleComps: [comp("The Ellery", "$232,000 per unit"), comp("Vue", "$236,000 per unit")], leaseComps: [], redFlags: [], summary: "" } })),
      "basis",
    );
    expect(two.evidence[0]).toMatchObject({ value: 234_000 });
    expect(two.evidence[0].text).toContain("the two graded clean, midpoint $234k/unit, too few for a median");
    expect(two.gap!.text).toMatch(/over the midpoint of the two comps graded clean \(The Ellery and Vue\), \$234k\/unit\. On two comps, no worse than stretched\.$/);
    expect(two.verdict).toBe("stretched");
    // Three make a median, and a median can call the basis unsupported.
    const three = rowOf(
      buildStressTest(
        apartmentArgs({ brokerComps: { saleComps: [comp("The Ellery", "$232,000 per unit"), comp("Vue", "$236,000 per unit"), comp("Hallam", "$230,000 per unit")], leaseComps: [], redFlags: [], summary: "" } }),
      ),
      "basis",
    );
    expect(three.verdict).toBe("unsupported");
  });

  it("judges the basis on the best kind present: the reader's own past asks never turn a stretched basis into one that holds", () => {
    const comps = { saleComps: [{ name: "The Ellery", detail: "$256,500 per unit", support: "supports" as const, note: "" }], leaseComps: [], redFlags: [], summary: "" };
    const pastScreens = { count: 4, perUnitMedian: 300_000, perSfMedian: null, market: "Washington DC" };
    const b = rowOf(buildStressTest(apartmentArgs({ brokerComps: comps, pastScreens })), "basis");
    // 7.0% over the comps; the asks at $300k would have read it under one.
    expect(b.verdict).toBe("stretched");
    expect(b.ruleOfThumbOnly).toBeUndefined();
    expect(b.method).toMatch(/against the memorandum's sale comps \(the offering memorandum\), the one figure that decides; beside it, not deciding: other memoranda's asking prices/);
    // The asks alone decide only where nothing else carries a figure — and
    // the row says it was held to a rule of thumb only.
    const asksOnly = rowOf(buildStressTest(apartmentArgs({ pastScreens })), "basis");
    expect(asksOnly.verdict).toBe("holds");
    expect(asksOnly.ruleOfThumbOnly).toBe(true);
    expect(asksOnly.gap!.text).toBe("The ask's $275k/unit is 8.5% under the median of your past screens' asking prices in Washington DC, $300k/unit — the conservative side. Against a rule of thumb only.");
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
  });

  it("names in the method every assumption the OM's case can hold", () => {
    for (const k of STRESS_KEYS) {
      if (k === "renovation_premium" || k === "other") continue;
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
