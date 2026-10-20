import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readMetroRates, readRates, type RateRow } from "./live-rates";
import { FIXTURE_NOW, REAL_ROWS } from "./live-rates.fixture";
import { SAMPLE_DEAL } from "./sample-deal";
import { samplePlacement, sampleStressTest } from "./sample-stress";
import { sampleDemoData, walkthroughData } from "@/app/demo/demo-data";
import { NO_DEBT_SEEDS } from "./debt-index";
import { readActuals } from "./actuals/actuals-read";
import { t12SummaryOf } from "./actuals/analyze";
import type { RentRollSummary } from "./actuals/types";
import { inferStrategy } from "./deal-strategy";
import { shownAssetClass } from "./asset-class";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import { modelMarketFor } from "./model-market";
import { regulationForDeal } from "./rent-regulation";
import { countyOf, placeDeal } from "./market-county";
import { modelVsMarketFor } from "./model-vs-market";
import { PLAN_YIELD_LEAD, buildStressTest } from "./stress-test";
import type { StressTest } from "./stress-test-types";
import type { TodayReads } from "./model-vs-market-read";
import { readValueAdd } from "./value-add";
import { modelReadsWithheld } from "./underwrite/report-grid";
import { computeUnderwrite } from "./underwrite/engine";
import { HOLDS_NO_RERUN, SAMPLE_PLAN_NOTE, headlineSentence, headlineShort, keptSentence, rerunWords, rowMoveText } from "./stress-test-words";
import { stressSection } from "./anthropic/verdict";

// The sample's stress test is drawn on three surfaces: the signed-in sample
// deal's page (app/(app)/deals/[id]/page.tsx), /demo's Overview
// (app/demo/demo-data) and the homepage's walkthrough (app/page.tsx). The
// two public ones build it through lib/sample-stress; the page builds it
// from its own reads of the sample's row. They had built it three ways —
// the homepage with no published figure at all, so its exit cap, vacancy,
// rent and expense growth and insurance rows read differently from /demo's
// and the page's — and this file holds the three to one StressTest.

vi.mock("@/lib/model-vs-market-read", () => ({
  todayReads: async () => {
    throw new Error("no database in a test");
  },
}));

// Today's figures for the sample's market (Philadelphia), in the shapes the
// deal page's read returns: the national table as the runner printed it,
// and the metro's own unemployment, survey vacancy with its margin, the
// Northeast's vacancy and the CPI rent index as a level.
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
const READS: TodayReads = {
  rates: readMetroRates("philadelphia", ROWS, FIXTURE_NOW),
  zori: null,
  realtor: null,
  national: readRates(REAL_ROWS, FIXTURE_NOW),
  now: FIXTURE_NOW,
};
const TODAY = "2026-09-21";

/**
 * The signed-in sample deal's page, its expressions on the sample's row, in
 * its order: the row the "Try a sample deal" action seeds (no first signal),
 * the rent roll and T-12 rows it seeds read through `t12SummaryOf` and
 * `readActuals`, the place `placeDeal(address, countyOf(address, flags))`,
 * the rent rules, the derivation with `modelMarketFor(true, …)` (never
 * seeded), the model's read against today's figures, and `buildStressTest`
 * with no recorded sales or past screens on the sample.
 */
function signedInParts(reads: TodayReads | null): { stress: StressTest; derived: ReturnType<typeof deriveUnderwriteInputs> } {
  const extraction = SAMPLE_DEAL.extraction;
  const strategy = inferStrategy(extraction, null);
  const readClass = shownAssetClass(SAMPLE_DEAL.asset_class, extraction) || null;
  const t12Summary = t12SummaryOf(SAMPLE_DEAL.t12.summary);
  const actuals = readActuals({
    metrics: extraction.metrics,
    strategy,
    rentRoll: { asOf: SAMPLE_DEAL.rentRoll.as_of_date, summary: SAMPLE_DEAL.rentRoll.summary as RentRollSummary },
    t12: t12Summary ? { periodEnd: SAMPLE_DEAL.t12.period_end_date, summary: t12Summary } : null,
    assetClass: readClass,
  })!;
  const address = SAMPLE_DEAL.address;
  const placement = placeDeal(address, countyOf(address, null));
  const regulation = regulationForDeal({ extraction, address, siteFlags: null, assetClass: SAMPLE_DEAL.asset_class }, TODAY);
  const derived = deriveUnderwriteInputs(
    extraction,
    SAMPLE_DEAL.name,
    {
      rentRoll: actuals.rentRoll ? { summary: actuals.rentRoll.summary, asOf: actuals.rentRoll.asOf } : null,
      t12: actuals.t12 ? { summary: actuals.t12.summary, periodEnd: actuals.t12.periodEnd } : null,
    },
    modelMarketFor(true, NO_DEBT_SEEDS),
    { regulation, asOf: new Date(`${TODAY}T12:00:00Z`) },
  );
  const modelRead = reads
    ? modelVsMarketFor({
        derived,
        extraction,
        firstSignal: null,
        storedAssetClass: SAMPLE_DEAL.asset_class,
        metro: placement.live,
        reads,
        regulation,
      })
    : null;
  const stress = buildStressTest({
    extraction,
    firstSignal: null,
    challenger: SAMPLE_DEAL.challenges,
    market: SAMPLE_DEAL.market,
    modelVsMarket: modelRead,
    actuals,
    derived,
    storedAssetClass: SAMPLE_DEAL.asset_class,
    brokerComps: SAMPLE_DEAL.comps,
    recordedSales: null,
    pastScreens: null,
    readOn: TODAY,
  });
  return { stress, derived };
}
const signedInSample = (reads: TodayReads | null): StressTest => signedInParts(reads).stress;

/** The homepage's walkthrough, as app/page.tsx builds it: /demo's build,
 *  picked for the walkthrough. */
const homepage = (reads: TodayReads | null) =>
  walkthroughData(sampleDemoData({ today: TODAY, reads, debt: NO_DEBT_SEEDS }).data).stressTest;
/** /demo's Overview, as app/demo/demo-data builds it. */
const demo = (reads: TodayReads | null) => sampleDemoData({ today: TODAY, reads, debt: NO_DEBT_SEEDS }).data.stressTest;

const src = (p: string) => readFileSync(p, "utf8");

describe("the sample's stress test, one build on every surface", () => {
  it("is the same StressTest on the homepage, /demo and the signed-in sample's page, with today's figures read", () => {
    const page = signedInSample(READS);
    expect(sampleStressTest({ today: TODAY, reads: READS })).toEqual(page);
    expect(homepage(READS)).toEqual(page);
    expect(demo(READS)).toEqual(page);
    // The published figures are its evidence: the rent growth row is set
    // against the metro's sitting-tenant rents, the vacancy row against the
    // survey's metro figure, the exit against the 10-year.
    const row = (k: string) => page.rows.find((r) => r.key === k)!;
    expect(row("rent_growth").verdict).not.toBe("unchecked");
    expect(row("vacancy").evidence.map((e) => e.label)).toContain("Rental vacancy, metro area");
    // The sample's 6.0% pro forma vacancy is a stabilized assumption on a
    // stabilized deal: held to the metro's 5.8% ±1.9 survey, its rent roll's
    // 9.3% shown beside it as today's. With no Zillow figure in this read,
    // its 4.0% rent growth is held to the CPI rent's +5.0%.
    expect(row("vacancy")).toMatchObject({ verdict: "holds", gap: { value: -0.2, unit: "pts" } });
    expect(row("vacancy").evidence[0].label).toBe("Rental vacancy, metro area");
    expect(row("vacancy").gap!.text).toContain("Today the deal's rent roll runs 9.3% vacant, 3.3 points over the assumption — the gap a lease-up has to close.");
    // 3.3 points is past the row's own 3-point threshold: neither run
    // models the lease-up, said so, whatever the verdict.
    expect(row("vacancy").gap!.text).toContain("The lease-up from today's 9.3% to the stabilized 6.0% is not modelled in either case: each runs its vacancy from year one.");
    // A row that holds draws no re-run on any surface: the report and the
    // verdict's brief print the one line in its place (its impact stays for
    // the headline's cases).
    expect(row("vacancy").impact).not.toBeNull();
    expect(rowMoveText(page, row("vacancy"))).toBe(HOLDS_NO_RERUN);
    expect(rowMoveText(page, row("rent_growth"), "from the model")).toBe(HOLDS_NO_RERUN);
    const brief = stressSection(page).find((l) => l.startsWith("- Stabilized vacancy (vacancy)"))!;
    expect(brief).toContain(`The levered IRR: ${HOLDS_NO_RERUN}`);
    expect(brief).not.toContain("the levered IRR moves from");
    expect(row("rent_growth")).toMatchObject({ verdict: "holds", gap: { value: -1, unit: "pts" } });
    expect(row("rent_growth").gap!.text).toMatch(/^Held to the rent sitting tenants pay \(CPI rent\)/);
    expect(row("exit_cap").evidence.map((e) => e.label)).toContain("10-year Treasury");
    expect(page.rows.some((r) => r.key === "expense_growth")).toBe(true);
  });

  it("is the same StressTest on all three where the read failed, its published rows unchecked", () => {
    const page = signedInSample(null);
    expect(homepage(null)).toEqual(page);
    expect(demo(null)).toEqual(page);
    const rent = page.rows.find((r) => r.key === "rent_growth")!;
    expect(rent.verdict).toBe("unchecked");
    expect(page.rows.flatMap((r) => r.evidence).some((e) => e.kind === "published" && e.publisher === "FRED")).toBe(false);
  });

  it("leads with one headline on every surface: the OM's figures against the evidence's, split by assumption", () => {
    const page = signedInSample(READS);
    expect(homepage(READS)!.headline).toEqual(page.headline);
    expect(demo(READS)!.headline).toEqual(page.headline);
    const h = page.headline!;
    const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
    // The OM's case: the ask, its 5.25% exit, its NOI at its own 6.0%
    // vacancy, its 4.0% rent growth, its tax bill and premium.
    expect(h.omKeys).toEqual(["basis", "exit_cap", "noi", "vacancy", "rent_growth", "taxes", "insurance"]);
    expect([r1(h.omIrrPct), r1(h.evidenceIrrPct)]).toEqual([16.7, 12.5]);
    // The insurance row swaps the T-12's $385k inside the model's one expense
    // line (the T-12's $3.09M total) for the OM's $310k, never adding the gap
    // on top of a line that already holds the T-12's premium (audit H3): its
    // evidence's run is the model's own. The T-12's premium is the seller's
    // history, not a new owner's quote, so the row is unchecked and both
    // cases keep the OM's $310k.
    const ins = page.rows.find((r) => r.key === "insurance")!.impact!;
    expect([Math.round(ins.omValue), Math.round(ins.altValue)]).toEqual([3_010_000, 3_085_000]);
    expect([r1(ins.baseIrrPct), r1(ins.altIrrPct)]).toEqual([10.3, 9.3]);
    expect(ins.note).toMatch(/^If the insurance line is the deal's T-12's \$385k, not the OM's \$310k, the levered IRR moves from 10\.3% to 9\.3% /);
    expect(ins.note).toMatch(/so this re-run is no test of the OM's premium\.$/);
    expect([h.omMultiple!.toFixed(2), h.evidenceMultiple!.toFixed(2)]).toEqual(["2.10", "1.77"]);
    // The split, largest first: the reset tax bill and the exit at the
    // going-in cap lower it; the vacancy holds to the metro's survey and rent
    // growth to CPI rent, and insurance is unchecked, so none carries a part.
    expect(h.parts.map((p) => [p.key, r1(p.pts)])).toEqual([
      ["taxes", -2.8],
      ["exit_cap", -1.4],
    ]);
    expect(Math.abs(h.parts.reduce((s, p) => s + p.pts, 0) - (h.evidenceIrrPct! - h.omIrrPct!))).toBeLessThan(1e-6);
    // Both cases pay the ask; the NOI's T-12 figure holds the vacancy, taxes
    // and insurance the rows move on their own; the premium is no model input.
    expect(h.omitted.map((o) => o.key)).toEqual(["basis", "noi", "renovation_premium"]);
    // The NOI is left out for the tax swap, which moves the year-one NOI by
    // the reset's $224k, $50k past the NOI row's own $174k gap over the
    // T-12: said, never swapped.
    expect(h.noiRest).toEqual({ usd: -50_468, components: ["taxes"] });
    // The memorandum states no loan rate, so the debt row stands unchecked
    // and the headline says it does not test it.
    expect(h.untested).toEqual({ keys: ["debt"], roll: null });
    expect(headlineSentence(page)).toContain(" This headline does not test the loan rate. ");
    expect(headlineSentence(page)).toContain(" The tax swap moves the year-one NOI $50k a year past the NOI's own gap. ");
    // With the read failed: the published rows unchecked, rent growth out of
    // both cases, and the vacancy held to the deal's own rent roll.
    const bare = signedInSample(null).headline!;
    expect(bare.omKeys).not.toContain("rent_growth");
    expect([r1(bare.omIrrPct), r1(bare.evidenceIrrPct)]).toEqual([13.1, 4.8]);
    expect(bare.parts.map((p) => p.key)).toEqual(["vacancy", "taxes", "exit_cap"]);
  });

  it("names the model as it runs beside the two cases, and why the evidence's case is not it, on every surface (the investor's walkthrough)", () => {
    const { stress: page, derived } = signedInParts(READS);
    const h = page.headline!;
    expect(homepage(READS)!.headline).toEqual(h);
    expect(demo(READS)!.headline).toEqual(h);
    // The model as it runs: the derived model's own run, every input its
    // own — the base each row's re-run changes one input of. The price row's
    // re-run starts at it, since the model runs the ask, and the exit cap's
    // lands on it, since the model runs the going-in cap.
    expect(h.modelIrrPct!).toBeCloseTo(computeUnderwrite(derived.inputs).returns.leveredIrrPct! * 100, 9);
    expect(Math.round(h.modelIrrPct! * 10) / 10).toBe(9.3);
    const row = (k: string) => page.rows.find((r) => r.key === k)!;
    expect(row("basis").impact!.baseIrrPct!).toBeCloseTo(h.modelIrrPct!, 9);
    expect(row("exit_cap").impact!.altIrrPct!).toBeCloseTo(h.modelIrrPct!, 9);
    // The evidence's case sits above it because it keeps the OM's figure
    // where a row holds, is left out or is unchecked: read off the rows,
    // never typed.
    expect(h.keptAtOm!.map((k) => [k.key, k.why])).toEqual([
      ["noi", "left_out"],
      ["vacancy", "holds"],
      ["rent_growth", "holds"],
      ["insurance", "unchecked"],
    ]);
    // The NOI row left out keeps the rent line that makes the OM's $3.88M NOI
    // at the OM's vacancy and expenses, never the NOI itself: the tax swap
    // moves the evidence's case's NOI off it (audit of PR #482, H2). And the
    // evidence's case runs the reset tax bill where the model runs the
    // seller's (M4), so the sentence says every figure the two differ on.
    const kept =
      "Against the screening model as it runs (9.3%), the evidence's case keeps the OM's figure where a row holds: vacancy 6.0% (the model's 9.1%) and rent growth 4.0%/yr (the model's 3.0%/yr); where a row is left out: the rent line $7.33M that makes the OM's $3.88M NOI at the OM's vacancy and expenses (the model's rent line $7.47M); and where a row is unchecked: insurance $310k (the model's $385k). It runs the evidence's figure where the model runs another: the taxes $952k (the model's $728k).";
    expect(keptSentence(page)).toBe(kept);
    expect(h.atEvidence!.map((e) => e.key)).toEqual(["taxes"]);
    // Complete: the model with the kept figures and the evidence's figures
    // set, and nothing else, IS the evidence's case, to the engine's figure.
    const fig = (k: string) => h.keptAtOm!.find((x) => x.key === k)!.om;
    const tax = h.atEvidence!.find((e) => e.key === "taxes")!;
    const ins = h.keptAtOm!.find((x) => x.key === "insurance")!;
    const m = derived.inputs;
    const rebuilt = {
      ...m,
      vacancyPct: fig("vacancy") / 100,
      rentGrowthPct: fig("rent_growth") / 100,
      inPlaceRentAnnual: fig("noi"),
      expenseLines: m.expenseLines.map((l, i) => (i === 0 ? { ...l, annual: l.annual + (tax.evidence - tax.model) + (ins.om - ins.model) } : l)),
    };
    expect(computeUnderwrite(rebuilt).returns.leveredIrrPct! * 100).toBeCloseTo(h.evidenceIrrPct!, 6);
    expect(headlineSentence(page)!.endsWith(kept)).toBe(true);
    expect(headlineShort(page)).toBe("Levered IRR on the OM's figures 16.7% to 12.5% with the evidence (the screening model as it runs: 9.3%); the report splits the gap by assumption.");
    // Each re-run is the model at 9.3% with one input changed, the figure
    // named as the levered IRR it is (M3).
    expect(rerunWords(page, row("insurance").impact)).toBe("from the model's own 9.3% levered IRR, this input alone set to the OM's figure, then to the evidence's");
    // The rent growth holds against the CPI's rent, a lagging measure, and
    // its re-run says so rather than reading as an endorsement.
    expect(row("rent_growth").verdict).toBe("holds");
    expect(row("rent_growth").impact!.note).toContain(
      "Held to the rent paid by sitting tenants (CPI rent), which averages every lease in place, so it lags the rents new leases sign at: neither the row holding nor this re-run endorses the OM's 4.0%/yr.",
    );
    // The insurance row's index figure is the OM's own premium moved by it,
    // said in words and held to nothing.
    expect(row("insurance").evidence[1]).toMatchObject({ kind: "published", label: "The OM's $310k moved by the national premium index (PPI, commercial multiple peril)", value: null });
    expect(row("insurance").evidence[1].text).toMatch(/^\$325k \(the index .*\); the national move applied to the OM's own figure, not a test of this premium$/);
  });

  it("states no rent-growth verdict in the sample's fixed prose that today's feeds decide (audit of PR #482, H1)", () => {
    // A fresh Zillow read whose apartment asking rents rose 1.0% on the year:
    // the stress test holds the OM's 4.0% to it first and reads it
    // unsupported. Nothing the sample stores in words may then say the
    // growth is in line or holds.
    const zori = {
      rent: 1_720,
      yoyPct: 1.6,
      asOf: "2026-08-31",
      note: "Zillow Observed Rent Index (ZORI), all homes, smoothed, Philadelphia, PA metro area, month ending 2026-08-31. Data: Zillow Research.",
      shared: false,
      mfrRent: 1_610,
      mfrYoyPct: 1.0,
      homeValue: null,
      homeValueYoyPct: null,
      priceToRentYears: null,
    };
    const reads: TodayReads = { ...READS, zori };
    const test = sampleStressTest({ today: TODAY, reads });
    expect(test).toEqual(signedInSample(reads));
    const rent = test.rows.find((r) => r.key === "rent_growth")!;
    expect(rent.verdict).toBe("unsupported");
    expect(rent.evidence[rent.impact!.evidenceIndex].label).toBe("Asking rent, apartments");
    // The fixed prose: the verdict, its ranges, scenarios and steps, the
    // market check, the challenger, the comps and the reconciliation.
    const v = SAMPLE_DEAL.verdict;
    const prose = [
      v.reason,
      ...v.topRisks,
      ...v.nextSteps,
      ...(v.screen?.ranges ?? []).flatMap((r) => [r.basis, r.source]),
      ...(v.screen?.sensitivity ?? []).map((s) => s.note),
      ...(v.screen?.dealKillers ?? []).flatMap((k) => [k.read, k.risk]),
      SAMPLE_DEAL.market.summary,
      ...SAMPLE_DEAL.market.checks.flatMap((c) => [c.note, `${c.assumption}: ${c.assessment}`]),
      ...SAMPLE_DEAL.challenges.challenges.flatMap((c) => [c.challenge, c.question]),
      SAMPLE_DEAL.challenges.stressTest,
      SAMPLE_DEAL.comps.summary,
      SAMPLE_DEAL.reconciliation.takeaway,
    ];
    const sentences = prose.flatMap((p) => p.split(/(?<=[.;])\s+/));
    const aboutGrowth = sentences.filter((s) => /\brent growth\b|\bgrowth\b|\bramp\b/i.test(s));
    for (const s of aboutGrowth) expect(s, s).not.toMatch(/\bin[- ]line\b|\bholds?\b|\bsupported\b|\binside\b|\bconservative\b/i);
    // The market check reads it against a rule of thumb, says so, and leaves
    // the published figure to the stress test without saying how it comes out.
    const check = SAMPLE_DEAL.market.checks.find((c) => /rent growth/i.test(c.assumption))!;
    expect(check).toMatchObject({ typicalRange: "2.5–3.5%", assessment: "aggressive" });
    expect(check.note).toMatch(/rule of thumb/);
    expect(check.note).toMatch(/the stress test sets the 4\.0% against today's published rents\.$/);
  });

  it("draws one renovation program under the header on all three: the deal page's props, /demo's and the homepage's", () => {
    // The deal page (page.tsx `ValueAddPanel`): the stored memorandum's
    // program, the derived model's exit cap and read where its reads stand.
    const { derived } = signedInParts(READS);
    const shown = modelReadsWithheld(derived.inputs, derived.sources, false) ? null : derived;
    const page = {
      program: readValueAdd(SAMPLE_DEAL.extraction),
      exitCapPct: shown ? shown.inputs.exitCapPct : null,
      modelLine: shown?.meta.valueAdd?.read ?? "",
    };
    expect(page.program).not.toBeNull();
    // The door valued at the premium priced and at the one achieved.
    expect(page.modelLine).toMatch(/exit cap a door's premium priced at \$200 is worth .* At the \$140 achieved on the doors already renovated, a door's premium is worth /);
    const { data } = sampleDemoData({ today: TODAY, reads: READS, debt: NO_DEBT_SEEDS });
    expect(data.valueAdd).toEqual(page);
    // The deal page hands the panel those three, /demo draws it under the
    // sample's header and the homepage at its walkthrough's head, each from
    // /demo's one build.
    expect(src("app/(app)/deals/[id]/page.tsx")).toMatch(
      /<ValueAddPanel\s+program=\{readValueAdd\(extraction\)\}\s+exitCapPct=\{shown \? shown\.inputs\.exitCapPct : null\}\s+modelLine=\{shown\?\.meta\.valueAdd\?\.read \?\? ""\}/,
    );
    expect(src("app/demo/page.tsx")).toContain("<ValueAddPanel {...data.valueAdd} />");
    expect(src("app/page.tsx")).toContain("<ValueAddPanel {...data.valueAdd} />");
  });

  it("places the sample where the deal page places it", () => {
    expect(samplePlacement()).toEqual(placeDeal(SAMPLE_DEAL.address, countyOf(SAMPLE_DEAL.address, null)));
    expect(samplePlacement().live).toMatchObject({ id: "philadelphia" });
  });

  it("reads today's figures for the public pages without failing them", async () => {
    const { sampleTodayReads } = await import("./sample-stress-read");
    await expect(sampleTodayReads()).resolves.toBeNull();
  });

  it("builds it through lib/sample-stress on both public pages, and the page hands the sample no reader's evidence", () => {
    // The homepage draws /demo's own build (app/demo/demo-data), picked for
    // the walkthrough (`walkthroughData`), on the reads it makes itself.
    const home = src("app/page.tsx");
    expect(home).toContain("const reads = await sampleTodayReads();");
    // On the reader's day, the one the memo tile and the downloads date the
    // sample by (lib/reader-day, New York with no reader's zone), never the
    // UTC day: from 8 pm Eastern the two are a day apart.
    expect(home).toMatch(/sampleDemoDataOnce\(readerToday\(null\), reads, NO_DEBT_SEEDS\)/);
    expect(home).not.toContain("fmrToday");
    expect(src("lib/sample-memo.ts")).toContain("const readerDay = readerToday(null, now);");
    expect(src("app/demo/page.tsx")).toContain("const today = readerToday(null);");
    expect(src("app/demo/page.tsx")).not.toContain("fmrToday");
    // One read and one build a render (React's cache), so the homepage's
    // chip, memo tile and walkthrough draw one set of figures.
    expect(src("lib/sample-stress-read.ts")).toContain("export const sampleTodayReads = cache(async ()");
    expect(src("app/demo/demo-data.ts")).toContain("export const sampleDemoDataOnce = cache(");
    expect(home).toContain("<DemoTabs {...walkthroughData(data)} />");
    expect(home).not.toMatch(/buildStressTest|sampleStressTest\(/);
    expect(src("app/demo/page.tsx")).toContain("await sampleTodayReads()");
    const demoData = src("app/demo/demo-data.ts");
    expect(demoData).toContain("stressTest: sampleStressTest({ today, reads })");
    expect(demoData).not.toContain("buildStressTest");
    expect(demoData).not.toMatch(/modelVsMarketFor\(|sampleDerivedInputs\(/);
    const page = src("app/(app)/deals/[id]/page.tsx");
    // The one builder hands the sample neither (lib/stress-basis-evidence).
    expect(page).toMatch(/stressBasisEvidence\(\{[^}]*isSample: isSampleDeal,/);
    // The sample is never seeded from today's rates (lib/model-market).
    expect(page).toContain("modelMarketFor((deal as { is_sample?: boolean }).is_sample, debt)");
  });
});

/** The components a section's JSX draws, in order. */
function overviewOrder(file: string, start: string, end: string): string[] {
  const s = src(file);
  const from = s.indexOf(start);
  const to = s.indexOf(end, from);
  expect(from, file).toBeGreaterThan(0);
  expect(to, file).toBeGreaterThan(from);
  return [...s.slice(from, to).matchAll(/<([A-Z][A-Za-z]+)\b/g)].map((m) => m[1]);
}

// What the deal page's Overview draws that /demo leaves off, each because a
// visitor has no account or the sample never has it: a re-screen's diff (the
// sample is never re-screened), the reader's own model's discrepancies and
// past screens, the actuals prompt (hidden on the sample), the tasks, Ask,
// the outcome, the decision log, and the track record (the sample's verdict
// carries no screen time, so nothing is scored on it).
const ACCOUNT_ONLY = new Set([
  "SinceLastScreen",
  "ReconciliationPanel",
  "MarketMemoryStrip",
  "ActualsPrompt",
  "DealTasks",
  "AskPanel",
  "DealOutcomeCard",
  "DecisionLog",
  "TrackRecordCard",
]);

describe("/demo's Overview, in the deal page's order", () => {
  it("draws the deal page's Overview components in its order, leaving off only what needs an account", () => {
    // The sections' own JSX, `{section === "overview" && (`: the deal page
    // also tests the section in its code (the stress chip's jump).
    const deal = overviewOrder("app/(app)/deals/[id]/deal-view.tsx", '{section === "overview" && (', '{section === "financials" && (');
    const demoOrder = overviewOrder("app/demo/sections.tsx", '{section === "overview" && (', '{section === "financials" && (');
    expect(deal).toContain("OverviewView");
    expect(demoOrder).toEqual(deal.filter((c) => !ACCOUNT_ONLY.has(c)));
  });

  it("draws the homepage walkthrough's Overview with the deal page's own OverviewView, the stress test inside it after the call", () => {
    // Its parts and their order against /demo's are lib/sample-tabs.test.ts's.
    const home = src("app/landing-interactive.tsx");
    const overview = home.slice(home.indexOf('case "Overview":'), home.indexOf('case "Financials":'));
    expect([...overview.matchAll(/<([A-Z][A-Za-z]+)\b/g)].map((m) => m[1])).toEqual(["OverviewTab"]);
    expect(overview).toContain("stressTest={stressTest}");
    const tab = home.slice(home.indexOf("function OverviewTab("), home.indexOf("/** One tab's panel"));
    expect(tab).toMatch(/<OverviewView [^>]*stressTest=\{stressTest\}/);
    const base = src("app/(app)/deals/[id]/deal-sections-base.tsx");
    const view = base.slice(base.indexOf("export function OverviewView"));
    expect(view.indexOf("<VerdictHero")).toBeGreaterThan(0);
    expect(view.indexOf("<StressTestPanel")).toBeGreaterThan(view.indexOf("<VerdictHero"));
    expect(view.indexOf("Risk digest")).toBeGreaterThan(view.indexOf("<StressTestPanel"));
    // The deal page's slot under the panel (the rent roll and T-12 prompt,
    // 2026-10-20) is drawn after the panel and its method link and before
    // the meter and the risk digest; /demo and the homepage fill it with
    // nothing, so the three Overviews stay one order.
    expect(view.indexOf("{afterStress}")).toBeGreaterThan(view.indexOf("how-we-test-link"));
    expect(view.indexOf("{afterStress}")).toBeLessThan(view.indexOf("Risk digest"));
    expect(overview).not.toContain("afterStress");
    expect(src("app/demo/sections.tsx")).not.toContain("afterStress");
    const deal = src("app/(app)/deals/[id]/deal-view.tsx");
    const slot = deal.slice(deal.indexOf("afterStress={"), deal.indexOf("<SensitivityPlayground"));
    expect(slot).toContain("<ActualsPrompt");
  });

  it("says under the sample's panel, on all three, that its re-runs are a stabilized deal's and a plan deal's OM re-runs its yield on cost, in the plan rule's words", () => {
    // The investor's walkthrough (2026-10-20): the sample re-runs every row,
    // and nothing on it said a value-add OM would not.
    const home = src("app/landing-interactive.tsx");
    expect(home).toMatch(/<OverviewView [^>]*stressTest=\{stressTest\} sample \/>/);
    expect(src("app/demo/sections.tsx")).toMatch(/<OverviewView [^>]*stressTest=\{data\.stressTest\} sample \/>/);
    expect(src("app/(app)/deals/[id]/deal-view.tsx")).toMatch(/stressTest=\{stressTest\}\s*sample=\{isSample\}/);
    // The sample re-runs its levered return, read as stabilized; the same
    // memorandum read as a value-add re-runs its yield on total cost, for the
    // reason the note gives in its own words.
    const sample = sampleStressTest({ today: "2026-10-20" });
    expect(sample.impactsWithheld).toBeNull();
    expect(sample.measure).toBeUndefined();
    expect(sample.headline?.measure).toBeUndefined();
    const ex = { ...SAMPLE_DEAL.extraction, strategy: { ...SAMPLE_DEAL.extraction.strategy!, kind: "value_add" as const } };
    const derived = deriveUnderwriteInputs(ex, SAMPLE_DEAL.name);
    const plan = buildStressTest({ extraction: ex, challenger: null, market: null, modelVsMarket: null, actuals: null, derived, storedAssetClass: "multifamily", readOn: "2026-10-20" });
    expect(plan.impactsWithheld).toBeNull();
    expect(plan.measure).toBe("yield_on_cost");
    expect(plan.headline?.measure).toBe("yield_on_cost");
    expect(plan.rows.every((r) => r.impact == null || r.impact.measure === "yield_on_cost")).toBe(true);
    const why = "the model runs today's income, not the business plan";
    expect(PLAN_YIELD_LEAD).toContain(why);
    expect(SAMPLE_PLAN_NOTE).toContain(why);
    expect(PLAN_YIELD_LEAD).toMatch(/^On a value-add, lease-up, conversion or development deal /);
    expect(SAMPLE_PLAN_NOTE).toContain("A value-add, lease-up, conversion or development OM");
    expect(SAMPLE_PLAN_NOTE).toContain("re-run on its yield on total cost");
  });
});
