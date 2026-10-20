import { describe, expect, it } from "vitest";
import {
  BESIDE_TAG,
  CORE_CPI_LABEL,
  CPI_ALL_ITEMS_LABEL,
  DECIDER_NAMES,
  DECIDES_TAG,
  GOING_IN_CAP_LABEL,
  METRO_VACANCY_LABEL,
  RENT_ROLL_VACANCY_LABEL,
  T12_VACANCY_LABEL,
  basisDecider,
  decidesTag,
  decidingFigureOf,
  decidingFigures,
  exitCapDecider,
  expenseGrowthDecider,
  insuranceDecider,
  noiDecider,
  rentGrowthDeciding,
  taxesDecider,
  vacancyDecider,
  type DeciderCandidate,
} from "./stress-deciders";
import { buildStressTest } from "./stress-test";
import { STRESS_KEYS, type StressEvidence, type StressRow } from "./stress-test-types";
import { VERDICT_RULES } from "./how-we-test";
import type { ExtractionResult } from "./anthropic/types";
import type { ModelVsMarket } from "./model-vs-market";
import { deriveUnderwriteInputs } from "./underwrite/inputs";

const piece = (label: string, value: number | null, extra: Partial<StressEvidence> = {}): StressEvidence => ({
  kind: "published",
  label,
  text: value == null ? "words" : `${value}%`,
  value,
  asOf: "2026-08-01",
  publisher: "BLS via FRED",
  scope: "nation",
  ...extra,
});
const held = (...es: StressEvidence[]): DeciderCandidate[] => es.map((evidence) => ({ evidence, held: evidence.value != null }));

describe("one figure decides each row, never the nearest edge of a range", () => {
  it("expense growth: all-items CPI decides, core only where all-items is not fresh, and the lower figure is never chosen for being lower", () => {
    const cpi = piece(CPI_ALL_ITEMS_LABEL, 3.4);
    const core = piece(CORE_CPI_LABEL, 2.4);
    const insurance = piece("Commercial property insurance premiums (PPI, commercial multiple peril)", 4.8);
    const breakeven = piece("Expected inflation, next ten years (10-year breakeven)", 2.33);
    // Core sits first and lower: all-items still decides.
    expect(expenseGrowthDecider(held(core, cpi, insurance, breakeven))).toMatchObject({ index: 1, figure: 3.4, label: CPI_ALL_ITEMS_LABEL, source: "BLS via FRED", asOf: "2026-08-01" });
    // No all-items figure: core stands in, named as the fallback.
    expect(expenseGrowthDecider(held(core, insurance))).toMatchObject({ index: 0, figure: 2.4, why: "where the all-items figure is not fresh" });
    // The insurance index and the breakeven never decide.
    expect(expenseGrowthDecider(held(insurance, breakeven))).toBeNull();
    // A piece that may not be held to (stale) is passed over.
    expect(expenseGrowthDecider([{ evidence: cpi, held: false }, { evidence: core, held: true }])).toMatchObject({ figure: 2.4 });
  });

  it("vacancy: the market first on a stabilized assumption, the rent roll first on today's, the rule of thumb last", () => {
    const metro = piece(METRO_VACANCY_LABEL, 6.2);
    const region = piece("Rental vacancy, South Census region", 9.5);
    const rr = piece(RENT_ROLL_VACANCY_LABEL, 9.2, { kind: "document", publisher: "the deal's rent roll" });
    const t12 = piece(T12_VACANCY_LABEL, 9.1, { kind: "document", publisher: "the deal's T-12" });
    const rot = piece("Multifamily vacancy, a rule of thumb", 5, { kind: "rule_of_thumb" });
    const all = held(t12, rr, region, metro, rot);
    expect(vacancyDecider(all, { stabilized: true })!.label).toBe(METRO_VACANCY_LABEL);
    // Today's vacancy: the rent roll before the T-12, wherever it sits.
    expect(vacancyDecider(all, { stabilized: false })!.label).toBe(RENT_ROLL_VACANCY_LABEL);
    expect(vacancyDecider(held(t12, region, rot), { stabilized: false })!.label).toBe(T12_VACANCY_LABEL);
    // No metro figure: the region's, never the documents', on a stabilized assumption.
    expect(vacancyDecider(held(t12, region, rot), { stabilized: true })!.label).toBe("Rental vacancy, South Census region");
    expect(vacancyDecider(held(rot), { stabilized: true })!.label).toBe(rot.label);
    // A plan deal's stated stabilized figure: the market's, then the class's
    // norm, never the documents, which are the building before the plan is
    // done (the walkthrough of 2026-10-20: a T-12 had decided it).
    expect(vacancyDecider(all, { stabilized: true, plan: true })!.label).toBe(METRO_VACANCY_LABEL);
    expect(vacancyDecider(held(t12, rr, rot), { stabilized: true, plan: true })!.label).toBe(rot.label);
    expect(vacancyDecider(held(t12, rr), { stabilized: true, plan: true })).toBeNull();
    // A plan deal's occupancy today is the documents' still.
    expect(vacancyDecider(all, { stabilized: false, plan: true })!.label).toBe(RENT_ROLL_VACANCY_LABEL);
    // A tracker band decides at its low read, never its high one.
    const lo = piece("Office vacancy (research tracker), the District, low read", 21.3, { publisher: "research tracker" });
    const hi = piece("Office vacancy (research tracker), the District, high read", 22.2, { publisher: "research tracker" });
    expect(vacancyDecider(held(hi, lo), { stabilized: true })!.label).toBe(lo.label);
  });

  it("exit cap: the going-in cap, else the tracker range's low end; the 10-year never", () => {
    const going = piece(GOING_IN_CAP_LABEL, 5.71, { kind: "om_internal" });
    const ten = piece("10-year Treasury", null);
    const lo = piece("Office cap (research tracker), low end", 6.5);
    const hi = piece("Office cap (research tracker), high end", 7.25);
    expect(exitCapDecider(held(ten, hi, lo, going))!.label).toBe(GOING_IN_CAP_LABEL);
    expect(exitCapDecider(held(ten, hi, lo))!.label).toBe(lo.label);
    expect(exitCapDecider(held(ten))).toBeNull();
  });

  it("the basis, the NOI and the taxes keep their own one figure; insurance has none", () => {
    expect(basisDecider(held(piece("Recorded sales (Philadelphia OPA)", 240_000), piece("The memorandum's sale comps", 252_000, { kind: "om_internal" })))!.figure).toBe(252_000);
    expect(basisDecider(held(piece("Other memoranda's asking prices in X (your past screens): asks, not trades", 300_000, { publisher: "your past screens" })))!.figure).toBe(300_000);
    expect(noiDecider(held(piece("The OM's in-place NOI against its pro forma", 2_400_000), piece("The deal's T-12 NOI", 2_350_000)))!.figure).toBe(2_350_000);
    expect(taxesDecider(held(piece("The stated tax abatement and when it ends", 900_000), piece("The bill the OM's own figures imply on the price", 532_000)))!.figure).toBe(532_000);
    expect(insuranceDecider()).toBeNull();
  });

  it("rent growth reads lib/rent-growth-decider's order among the pieces that may decide", () => {
    const all = piece("Asking rent, all home types", 2.3, { publisher: "Zillow Research" });
    const mf = piece("Asking rent, apartments", 1.1, { publisher: "Zillow Research" });
    const cpi = piece("Rent paid by sitting tenants (CPI rent)", 5.0);
    expect(rentGrowthDeciding("multifamily", held(all, mf, cpi))).toMatchObject({ index: 1, figure: 1.1, name: "Zillow's apartment asking rents" });
    expect(rentGrowthDeciding("multifamily", [{ evidence: all, held: true }, { evidence: mf, held: false }, { evidence: cpi, held: true }])).toMatchObject({ index: 0, figure: 2.3 });
    expect(rentGrowthDeciding("sfr_btr", held(all, mf, cpi))!.index).toBe(0);
  });

  it("names every row's order, and /how-we-test's rule for each names its first figure", () => {
    expect(Object.keys(DECIDER_NAMES).sort()).toEqual([...STRESS_KEYS].sort());
    expect(DECIDER_NAMES.insurance).toEqual([]);
    expect(VERDICT_RULES.expense_growth).toContain("all-items CPI");
    expect(VERDICT_RULES.exit_cap).toContain("going-in cap alone");
    expect(VERDICT_RULES.noi).toContain("T-12 alone");
  });
});

describe("a built row carries the one figure that decided it", () => {
  const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 4" });
  const EX: ExtractionResult = {
    dealName: "Test",
    assetClass: "multifamily",
    market: "Washington, DC",
    address: "1200 N Capitol St NW, Washington, DC 20002",
    totalPages: 48,
    strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
    metrics: [row("Asking price", "$42,000,000"), row("Units", "153"), row("NOI (in-place)", "$2,400,000"), row("Going-in cap rate", "5.75%"), row("Exit cap rate", "5.50%"), row("Expense growth", "2.5%")],
  };
  const derived = deriveUnderwriteInputs(EX, "Test", undefined);
  // A read that carries all-items CPI over core, and a tracker cap range
  // whose low end reaches the exit.
  const mvm = {
    readOn: "2026-09-21",
    metro: "Washington DC",
    checks: [
      {
        key: "expense_growth",
        title: "Expense growth",
        model: "3.0%/yr",
        modelSource: "a screening default",
        published: [
          { label: CPI_ALL_ITEMS_LABEL, text: "+3.4% over the year to Aug 2026", value: 3.4, asOf: "2026-08-01", publisher: "BLS via FRED" },
          { label: CORE_CPI_LABEL, text: "+2.4% over the year to Aug 2026", value: 2.4, asOf: "2026-08-01", publisher: "BLS via FRED" },
        ],
        tone: "behind",
        toneLabel: "",
        scope: "national",
        read: "",
      },
      {
        key: "exit_cap",
        title: "Exit cap",
        model: "5.50%",
        modelSource: "",
        published: [
          { label: "Multifamily cap (research tracker), low end", text: "5.25% (Q2 2026)", value: 5.25, asOf: "Q2 2026", publisher: "research tracker: CBRE" },
          { label: "Multifamily cap (research tracker), high end", text: "5.75% (Q2 2026)", value: 5.75, asOf: "Q2 2026", publisher: "research tracker: CBRE" },
        ],
        tone: "level",
        toneLabel: "",
        scope: "metro",
        read: "held",
      },
    ],
  } as unknown as ModelVsMarket;
  const test = buildStressTest({ extraction: EX, challenger: null, market: null, modelVsMarket: mvm, actuals: null, derived, storedAssetClass: "multifamily", readOn: "2026-09-21" });
  const of = (key: string): StressRow => test.rows.find((r) => r.key === key)!;

  it("an expense growth under all-items CPI no longer holds against the lower core figure", () => {
    const e = of("expense_growth");
    expect(decidingFigureOf(e)).toMatchObject({ figure: 3.4, label: CPI_ALL_ITEMS_LABEL, source: "BLS via FRED", asOf: "2026-08-01" });
    expect(e.verdict).toBe("stretched");
    expect(decidesTag(e, 0)).toBe(DECIDES_TAG);
    expect(decidesTag(e, 1)).toBe(BESIDE_TAG);
  });

  it("a cap range beside the going-in cap decides nothing: 25 bps of compression is unsupported whatever the range's low end", () => {
    const x = of("exit_cap");
    expect(decidingFigureOf(x)).toMatchObject({ figure: 5.75, label: GOING_IN_CAP_LABEL });
    expect(x.gap).toMatchObject({ value: 25, unit: "bps" });
    expect(x.verdict).toBe("unsupported");
    expect(x.method).toMatch(/^The OM's exit cap against the OM's going-in cap \(the offering memorandum\), the one figure that decides; beside it, not deciding: multifamily cap \(research tracker\), low end/);
  });

  it("reads every deciding figure off a built test, and none off an unchecked row", () => {
    const all = decidingFigures(test);
    expect(all.expense_growth?.figure).toBe(3.4);
    expect(all.exit_cap?.figure).toBe(5.75);
    for (const r of test.rows) if (r.verdict === "unchecked") expect(decidingFigureOf(r)).toBeNull();
    expect(decidingFigureOf(null)).toBeNull();
  });
});
