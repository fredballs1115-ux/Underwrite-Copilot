// The track record (lib/track-record): each stored challenge scored against
// evidence that arrived AFTER the screen, never against a document the
// screen read; the account's counts under the site's floor.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Challenge } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import type { StageChange } from "@/lib/stages";
import { STRESS_KEYS, type StressEvidence, type StressKey, type StressRow, type StressTest } from "@/lib/stress-test-types";
import { BREAKS_IF, BREAKS_IF_ESTIMATE, STRESS_SNAPSHOT_V, WORSE_WHEN, breaksIfLabel, callCitesEngine, readStressSnapshot, rowThreshold, snapshotThreshold, stressSnapshotOf, type StressSnapshot, type StressSnapshotRow } from "@/lib/stress-snapshot";
import {
  CARD_SCOPE,
  DECISION_SCORES,
  NOT_YET_SCORABLE,
  SCORED_BY,
  OUTCOME_WORD,
  RECORD_FLOOR,
  dealRecordLine,
  RECORD_NONE_LINE,
  TAX_INSURANCE_NOT_SCORED,
  accountRecord,
  arrivalOf,
  recordCountsLine,
  recordLine,
  recordState,
  ROLL_NOT_DOLLARS_WHY,
  SCORABLE_SOURCES,
  T12_NOT_DOORS_WHY,
  VACANCY_MEASURE_RULE,
  scorableGrid,
  scoreDeal,
  t12MonthsBefore,
  wholeShares,
  type DealRecord,
} from "./track-record";

const T = "2026-10-01T12:00:00Z";
const BEFORE = "2026-09-20T09:00:00Z";
const AFTER = "2026-11-05T09:00:00Z";

const vacancy: Challenge = {
  assumption: "Stabilized vacancy of 6%",
  severity: "high",
  challenge: "The rent roll runs 9% vacant.",
  question: "Why 6%?",
  page: "p. 12",
  key: "vacancy",
  omFigure: 6,
  altFigure: 9,
  altBasis: "a rule of thumb: a stabilized apartment building runs about 95% occupied",
};
const basis: Challenge = {
  assumption: "Asking price of $274k a unit",
  severity: "high",
  challenge: "The comps trade at $240k.",
  question: "What supports $274k?",
  page: "p. 3",
  key: "basis",
  omFigure: 274_000,
  altFigure: 240_000,
  altBasis: "the OM's own sale comps",
};
const debt: Challenge = { assumption: "A 5.0% all-in rate", severity: "medium", challenge: "Today's index plus spread is 6.8%.", question: "", key: "debt", omFigure: 5, altFigure: 6.8, altBasis: "the 5-yr Treasury plus the class spread" };
const insurance: Challenge = { assumption: "Insurance at the seller's $300k premium", severity: "medium", challenge: "", question: "", key: "insurance", omFigure: 300_000, altFigure: 400_000, altBasis: "the index's year" };
const noi: Challenge = { assumption: "Pro forma NOI of $4.0M", severity: "medium", challenge: "", question: "", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000, altBasis: "the trailing year" };
const older: Challenge = { assumption: "Exit cap of 5.25% inside the going-in cap", severity: "high", challenge: "", question: "" };

const t12: T12Summary = {
  collectedRent: 6_499_500,
  vacancyLoss: 650_500,
  otherIncome: 292_000,
  egi: 6_791_500,
  opex: [
    { key: "taxes", label: "Real estate taxes", amount: 1_140_000, page: "p. 1" },
    { key: "insurance", label: "Insurance", amount: 385_000, page: "p. 1" },
  ],
  totalOpex: 1_525_000,
  noi: 3_706_500,
  noiDerived: false,
};
const roll: RentRollSummary = {
  unitCount: 240,
  occupiedUnits: 218,
  totalSf: 220_720,
  occupiedSf: 200_000,
  sfWeightedOccupancy: 0.906,
  waltYears: 0.6,
  weightedAvgRentPsf: 30,
  expiryBuckets: null,
  expiryCoveredSf: 0,
  truncated: false,
};
// The roll's vacancy as the scorer reads it with no class (by area, where
// the roll carries it): 1 − 0.906 is 9.4%. A vacancy counted by doors is
// scored by a later rent roll alone; the T-12's economic vacancy (650,500
// over 7,150,000, 9.1%) scores only an economic row.
const ROLL_VAC = Math.round((1 - roll.sfWeightedOccupancy!) * 1000) / 10;
const T12_VAC = Math.round((t12.vacancyLoss! / (t12.collectedRent! + t12.vacancyLoss!)) * 1000) / 10;
const laterRoll = (dated = "2026-10-31", arrivedAt = AFTER) => ({ rentRoll: { arrivedAt, dated, summary: roll } });

const dead =(reason: "price" | "financing", at = AFTER): { stage: string; history: StageChange[] } => ({
  stage: "dead",
  history: [
    { stage: "screening", at: BEFORE },
    { stage: "dead", at, outcome: { reason, trade: null } },
  ],
});

describe("scoreDeal — only what arrived after the screen scores a challenge", () => {
  it("a rent roll added after the screen scores vacancy on the screen's side, by its count", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], ...laterRoll() });
    expect(r.screenedAt).toBe(T);
    expect(r.evidence.map((e) => e.source)).toEqual(["rent_roll"]);
    expect(r.evidence[0].label).toBe("Rent roll as of Oct 31, 2026 (added Nov 5, 2026)");
    const row = r.rows[0];
    expect(row.key).toBe("vacancy");
    expect(row.landing).toBe("screen_side");
    // 9.4% vacant by area: past the screen's 9.0%.
    expect(row.later?.value).toBe(ROLL_VAC);
    expect(ROLL_VAC).toBeGreaterThan(9);
    expect(row.text).toBe(
      `Stabilized vacancy: the OM's 6.0%, the screen's 9.0% (a rule of thumb: a stabilized apartment building runs about 95% occupied); the rent roll as of Oct 31, 2026 ran ${ROLL_VAC.toFixed(1)}% vacant by area — on the screen's side.`,
    );
    expect(r.notScored).toEqual([]);
  });

  it("a T-12 added after the screen does not score a challenge's vacancy: a challenge carries no measure, read as doors, and the T-12's are dollars — said on the row", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } });
    // Still on record as what came after, and its figure still shown.
    expect(r.evidence.map((e) => e.source)).toEqual(["t12"]);
    expect(r.evidence[0].label).toBe("T-12 to Oct 31, 2026 (added Nov 5, 2026)");
    const row = r.rows[0];
    expect(row.landing).toBe("unscored");
    expect(row.figures).toBeNull();
    expect(row.later).toMatchObject({ source: "t12", value: T12_VAC });
    expect(row.why).toBe(T12_NOT_DOORS_WHY);
    expect(T12_NOT_DOORS_WHY).toContain("the T-12's economic vacancy is dollars, not doors");
    expect(row.text).toBe(
      `Stabilized vacancy: the T-12 to Oct 31, 2026 (11 of its 12 months precede the verdict) ran ${T12_VAC.toFixed(1)}% economic vacancy (its vacancy loss over gross potential rent: the rent line plus the loss, since the stated EGI is the rent line plus other income), but the T-12's economic vacancy is dollars, not doors, and the OM's figure counts doors, which only a later rent roll can score, so it is not scored.`,
    );
    expect(accountRecord([r]).challenges.scored).toBe(0);
  });

  it("only the rent roll scores a challenge's vacancy beside a T-12, and a figure inside the two reads between", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [vacancy],
      rentRoll: { arrivedAt: AFTER, dated: "2026-10-31", summary: { ...roll, sfWeightedOccupancy: 0.925 } },
      t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 },
    });
    expect(r.rows[0].later?.source).toBe("rent_roll");
    expect(r.rows[0].later?.value).toBe(7.5);
    expect(r.rows[0].landing).toBe("between");
  });

  it("reads the roll's vacancy as the stress test does: by count on an apartment building, by area on an office", () => {
    const rentRoll = { arrivedAt: AFTER, dated: "2026-10-31", summary: roll };
    // 218 of 240 units is 9.2% by count; 90.6% of the area is 9.4%.
    expect(scoreDeal({ screenedAt: T, challenges: [vacancy], rentRoll, assetClass: "multifamily" }).rows[0].later).toMatchObject({ value: 9.2, text: "the rent roll as of Oct 31, 2026 ran 9.2% vacant by units" });
    expect(scoreDeal({ screenedAt: T, challenges: [vacancy], rentRoll, assetClass: "office" }).rows[0].later).toMatchObject({ value: 9.4, text: "the rent roll as of Oct 31, 2026 ran 9.4% vacant by area" });
  });

  it("a later document never scores a stabilized assumption the stress test holds to the market: its vacancy is today's", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 }, vacancyHeldToMarket: true });
    // Still on record as what came after, and the figure still shown.
    expect(r.evidence.map((e) => e.source)).toEqual(["t12"]);
    const row = r.rows[0];
    expect(row.landing).toBe("unscored");
    expect(row.later?.value).toBe(9.1);
    expect(row.figures).toBeNull();
    expect(row.why).toBe(
      "the OM's vacancy is a stabilized assumption on a deal read as stabilized, which the stress test holds to the market's published figures where one is fresh; a document's vacancy is the building's today, the gap a lease-up has to close, not a test of it.",
    );
    expect(row.text).toMatch(/^Stabilized vacancy: the T-12 to Oct 31, 2026 \(11 of its 12 months precede the verdict\) ran 9\.1% economic vacancy .*, but the OM's vacancy is a stabilized assumption .* not a test of it, so it is not scored\.$/);
    // The shares count it nowhere.
    expect(accountRecord([r]).scored).toBe(0);
  });

  it("a T-12 the screen read is unscored, said as before the screen, and never evidence", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy, insurance], t12: { arrivedAt: BEFORE, dated: "2026-08-31", summary: t12 } });
    expect(r.evidence).toEqual([]);
    expect(r.refusedLater).toBe(false);
    expect(r.notScored).toEqual([
      "T-12 to Aug 31, 2026 was on the deal before the screen (added Sep 20, 2026): the screen read it, so it is not scored against it.",
    ]);
    for (const row of r.rows) expect(row.landing).toBe("unscored");
    expect(r.rows.map((x) => x.why)).toEqual([
      "nothing that arrived after the screen speaks to it.",
      "a seller's T-12 cannot show a new owner's premium, and no document on the deal is the buyer's own quote, so no document scores it.",
    ]);
  });

  it("a T-12 with no arrival on record is not scored either", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: null, dated: null, summary: t12 } });
    expect(r.evidence).toEqual([]);
    expect(r.notScored[0]).toContain("no arrival time on record");
    expect(r.rows[0].landing).toBe("unscored");
  });

  it("a T-12 uploaded after the screen whose period ended on or before the verdict is history, not news: refused and said so", () => {
    for (const periodEnd of ["2026-09-30", "2026-10-01"]) {
      const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: periodEnd, summary: t12 } });
      expect(r.evidence).toEqual([]);
      expect(r.refusedLater).toBe(true);
      expect(r.rows[0].landing).toBe("unscored");
      expect(accountRecord([r])).toMatchObject({ scored: 0, dealsWithLater: 0 });
    }
    expect(scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-09-30", summary: t12 } }).notScored).toEqual([
      "T-12 to Sep 30, 2026 was added Nov 5, 2026, after the screen, but its period ended on or before the verdict (Oct 1, 2026): it is history the screen could have been handed, only uploaded later, so it is not scored.",
    ]);
    // The day after the verdict's is after it: the T-12 scores the NOI
    // ($3.71M, between the OM's $4.0M and the screen's $3.6M), and a rent
    // roll dated that day the vacancy.
    const next = scoreDeal({ screenedAt: T, challenges: [noi], t12: { arrivedAt: AFTER, dated: "2026-10-02", summary: t12 } });
    expect(next.refusedLater).toBe(false);
    expect(next.rows[0].landing).toBe("between");
    const nextRoll = scoreDeal({ screenedAt: T, challenges: [vacancy], ...laterRoll("2026-10-02") });
    expect(nextRoll.refusedLater).toBe(false);
    expect(nextRoll.rows[0].landing).toBe("screen_side");
    // A rent roll by its as-of date, the same rule.
    const early = scoreDeal({ screenedAt: T, challenges: [vacancy], rentRoll: { arrivedAt: AFTER, dated: "2026-09-15", summary: roll } });
    expect(early.notScored).toEqual([
      "Rent roll as of Sep 15, 2026 was added Nov 5, 2026, after the screen, but it is dated on or before the verdict (Oct 1, 2026): it is history the screen could have been handed, only uploaded later, so it is not scored.",
    ]);
  });

  it("a document uploaded after the screen with no date of its own on record is not scored, and says so", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], rentRoll: { arrivedAt: AFTER, dated: null, summary: roll }, t12: { arrivedAt: AFTER, dated: null, summary: t12 } });
    expect(r.evidence).toEqual([]);
    expect(r.refusedLater).toBe(true);
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.notScored).toEqual([
      "T-12 (period not stated) was added Nov 5, 2026, after the screen, but with no period end on record nothing shows its figures postdate the verdict, so it is not scored.",
      "Rent roll (as-of not stated) was added Nov 5, 2026, after the screen, but with no as-of date on record nothing shows its figures postdate the verdict, so it is not scored.",
    ]);
  });

  it("a taxes or insurance challenge is never scored by a document: a seller's T-12 cannot show a new owner's bill or premium", () => {
    const taxes: Challenge = { ...insurance, assumption: "Taxes not reset", key: "taxes", omFigure: 900_000, altFigure: 1_300_000 };
    const noi: Challenge = { ...insurance, assumption: "Pro forma NOI", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000 };
    const r = scoreDeal({ screenedAt: T, challenges: [insurance, taxes, noi], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } });
    // The T-12 is evidence (it scores the NOI, $3.71M between $3.6M and
    // $4.0M); its tax and insurance lines score nothing, and those rows
    // carry no later figure.
    expect(r.evidence.map((e) => e.source)).toEqual(["t12"]);
    expect(r.rows.map((x) => [x.key, x.landing, x.later?.value ?? null])).toEqual([
      ["insurance", "unscored", null],
      ["taxes", "unscored", null],
      ["noi", "between", 3_706_500],
    ]);
    expect(r.rows[0].text).toBe("Insurance: a seller's T-12 cannot show a new owner's premium, and no document on the deal is the buyer's own quote, so no document scores it.");
    expect(r.rows[1].text).toBe("Real estate taxes: a seller's T-12 cannot show a new owner's tax bill, and no document on the deal is the buyer's own, so no document scores it.");
    expect(r.rows[2].text).toContain("the T-12 to Oct 31, 2026 (11 of its 12 months precede the verdict) earned $3.71M");
    expect(accountRecord([r]).byKey.map((k) => k.key)).toEqual(["noi"]);
    expect(TAX_INSURANCE_NOT_SCORED).toBe("A seller's T-12 cannot show a new owner's tax bill or premium, so taxes and insurance rows are not scored by documents.");
    // Nothing reads a T-12's tax or insurance line to score a row.
    const src = readFileSync(join(process.cwd(), "lib/track-record.ts"), "utf8");
    expect(src).not.toMatch(/case "(?:taxes|insurance)":/);
    expect(src).not.toMatch(/T12_(?:TAX|INSURANCE)_NOT/);
  });

  it("on a plan deal a later T-12 scores no NOI challenge and a later document no stated stabilized vacancy: the building before the plan is done", () => {
    const noi: Challenge = { ...insurance, assumption: "Stabilized NOI", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000 };
    const later = { t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 }, rentRoll: { arrivedAt: AFTER, dated: "2026-10-31", summary: roll } };
    const r = scoreDeal({ screenedAt: T, challenges: [noi, vacancy], ...later, plan: true, vacancyIsPlanTarget: true });
    expect(r.rows.map((x) => x.landing)).toEqual(["unscored", "unscored"]);
    expect(r.rows[0].why).toBe("on a plan deal the OM's NOI is the finished project's, and a T-12 is the building's year before the plan is done, not a test of it.");
    expect(r.rows[0].text).toBe(
      "NOI: the T-12 to Oct 31, 2026 (11 of its 12 months precede the verdict) earned $3.71M, but on a plan deal the OM's NOI is the finished project's, and a T-12 is the building's year before the plan is done, not a test of it, so it is not scored.",
    );
    expect(r.rows[1].why).toBe("the OM's vacancy is the stabilized figure a plan deal is to reach; a document's vacancy is the building's today, before the plan is done, not a test of it.");
    expect(accountRecord([r]).scored).toBe(0);
    // A plan deal whose OM states today's occupancy, not an allowance: the
    // documents' vacancy is today's too, and scores it.
    expect(scoreDeal({ screenedAt: T, challenges: [vacancy], ...later, plan: true, vacancyIsPlanTarget: false }).rows[0].landing).not.toBe("unscored");
    // Off a plan deal the NOI is scored as before.
    expect(scoreDeal({ screenedAt: T, challenges: [noi], ...later }).rows[0].landing).toBe("between");
  });

  it("a figure at or past the OM's end lands on the OM's side", () => {
    const noi: Challenge = { ...insurance, assumption: "Pro forma NOI", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000 };
    const r = scoreDeal({ screenedAt: T, challenges: [noi], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: { ...t12, noi: 4_100_000 } } });
    expect(r.rows[0].landing).toBe("om_side");
    expect(r.rows[0].text).toContain("the T-12 to Oct 31, 2026 (11 of its 12 months precede the verdict) earned $4.10M — on the OM's side.");
  });

  it("a Dead-on-price decision after the screen scores the basis challenge as a decision on the screen's side; financing scores the debt", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [basis, debt, vacancy], ...dead("price") });
    expect(r.evidence[0].label).toBe("Moved to Dead on price (Nov 5, 2026)");
    expect(r.rows.map((x) => [x.key, x.landing])).toEqual([
      ["basis", "screen_side"],
      ["debt", "unscored"],
      ["vacancy", "unscored"],
    ]);
    expect(r.rows[0].later).toEqual({ source: "outcome", value: null, text: "walked away on price" });
    expect(r.rows[0].text).toContain("a decision on the screen's side, not a figure");
    const f = scoreDeal({ screenedAt: T, challenges: [basis, debt], ...dead("financing") });
    expect(f.rows.map((x) => [x.key, x.landing])).toEqual([
      ["basis", "unscored"],
      ["debt", "screen_side"],
    ]);
  });

  it("a decision recorded before the screen's verdict is named and not scored", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [basis], ...dead("price", BEFORE) });
    expect(r.evidence).toEqual([]);
    expect(r.notScored[0]).toBe("The deal died on price before the screen's verdict (Sep 20, 2026), so the decision is not scored.");
    expect(r.rows[0].landing).toBe("unscored");
  });

  it("a reported trade scores the basis on the OM figure's own basis — the trade over the ask applied to the per-unit figure", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [basis],
      askingPrice: 65_760_000,
      stage: "dead",
      history: [
        { stage: "screening", at: BEFORE },
        { stage: "dead", at: AFTER, outcome: { reason: null, trade: { price: 60_000_000, buyer: null, date: "2026-10-03", reportedBy: "Jane", reportedAt: AFTER } } },
      ],
    });
    expect(r.evidence[0].label).toBe("The building traded at $60.00M on Oct 3, 2026, reported by Jane (recorded Nov 5, 2026)");
    const row = r.rows[0];
    expect(row.later?.source).toBe("trade");
    // $60.0M over the $65.76M ask is 0.9124; on $274k a unit, $250k a unit.
    expect(Math.round(row.later!.value!)).toBe(250_000);
    expect(row.landing).toBe("between");
    expect(row.text).toContain("$250k on the OM figure's basis");
  });

  it("a trade beats a decision for the basis, and a whole-price OM figure is compared whole", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [{ ...basis, omFigure: 65_760_000, altFigure: 58_000_000 }],
      askingPrice: 65_760_000,
      stage: "dead",
      history: [{ stage: "dead", at: AFTER, outcome: { reason: "price", trade: { price: 57_000_000, buyer: "Another buyer", date: null, reportedBy: null, reportedAt: AFTER } } }],
    });
    expect(r.evidence.map((e) => e.source)).toEqual(["outcome", "trade"]);
    expect(r.rows[0].later?.source).toBe("trade");
    expect(r.rows[0].later?.value).toBe(57_000_000);
    expect(r.rows[0].landing).toBe("screen_side");
  });

  it("a challenge stored before the challenger wrote figures is unscored with why, keyed off its words", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [older], ...dead("price") });
    expect(r.rows[0].key).toBe("exit_cap");
    expect(r.rows[0].omFigure).toBeNull();
    expect(r.rows[0].landing).toBe("unscored");
    // A basis challenge with no OM figure, against a trade: the trade is named, the row stays unscored.
    const noFig = scoreDeal({
      screenedAt: T,
      challenges: [{ ...basis, omFigure: null, altFigure: null }],
      askingPrice: 65_760_000,
      stage: "dead",
      history: [{ stage: "dead", at: AFTER, outcome: { reason: null, trade: { price: 60_000_000, buyer: null, date: null, reportedBy: null, reportedAt: AFTER } } }],
    });
    expect(noFig.rows[0].landing).toBe("unscored");
    expect(noFig.rows[0].why).toBe("the challenger gave no OM figure to score it on.");
    expect(noFig.rows[0].later?.text).toBe("the building traded at $60.00M");
  });

  it("a screen's figure equal to the OM's has no side to land on", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [{ ...vacancy, altFigure: 6 }], ...laterRoll() });
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.rows[0].why).toContain("the screen's figure is the OM's own");
  });

  it("a verdict with no stamp scores nothing: there is no after without a when", () => {
    const r = scoreDeal({ screenedAt: undefined, challenges: [vacancy, basis], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 }, ...dead("price") });
    expect(r.screenedAt).toBeNull();
    expect(r.evidence).toEqual([]);
    expect(r.notScored).toEqual([
      "T-12 to Oct 31, 2026 is on the deal, but the verdict carries no screen time to set it after.",
      "The deal died on price, but the verdict carries no screen time to set the decision after.",
    ]);
    for (const row of r.rows) expect(row.why).toBe("the verdict carries no screen time, so nothing can be said to have come after it.");
    expect(scoreDeal({ screenedAt: "not a date", challenges: [vacancy] }).screenedAt).toBeNull();
  });

  it("arrivalOf takes the document's upload over the extraction row's own write", () => {
    const docs = [{ id: "doc-1", created_at: "2026-10-02T00:00:00Z" }];
    expect(arrivalOf({ created_at: "2026-10-09T00:00:00Z", source_document_id: "doc-1" }, docs)).toBe("2026-10-02T00:00:00Z");
    expect(arrivalOf({ created_at: "2026-10-09T00:00:00Z", source_document_id: "doc-9" }, docs)).toBe("2026-10-09T00:00:00Z");
    expect(arrivalOf({ created_at: null, source_document_id: null }, docs)).toBeNull();
    expect(arrivalOf(null, docs)).toBeNull();
  });
});

describe("scoreDeal — the previous screen's challenges, scored against what arrived between the two screens", () => {
  // The prior screen on Sep 10; the rent roll added Sep 25; the re-screen on
  // Oct 1 read that roll and replaced the challenges it would be scored
  // against.
  const PRIOR_T = "2026-09-10T12:00:00Z";
  const BETWEEN = "2026-09-25T09:00:00Z";
  const priorVacancy: Challenge = { ...vacancy, assumption: "Stabilized vacancy of 5%", omFigure: 5, altFigure: 8 };
  const priorScreen = { verdict: { verdict: "caution", generatedAt: PRIOR_T }, challenges: { challenges: [priorVacancy, basis] } };

  it("a rent roll arriving between the prior and the current verdict scores the prior screen's challenge, not the current one's", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [vacancy, insurance],
      priorScreen,
      ...laterRoll("2026-09-20", BETWEEN),
    });
    expect(r.prior).toEqual({ screenedAt: PRIOR_T, screenedOn: "Sep 10, 2026" });
    // The evidence is the earlier screen's, said so.
    expect(r.evidence.map((e) => e.label)).toEqual(["Rent roll as of Sep 20, 2026 (added Sep 25, 2026, after the screen of Sep 10, 2026 and before this one)"]);
    // One row a key: the prior's vacancy row in the current's unscored one's
    // place, on the prior's own figures (5% and 8%, not 6% and 9%).
    expect(r.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([
      ["vacancy", "screen_side", "Sep 10, 2026"],
      ["insurance", "unscored", null],
    ]);
    expect(r.rows[0].figures).toEqual({ om: "5.0% vacant", alt: "8.0% vacant", later: `${ROLL_VAC.toFixed(1)}% vacant` });
    expect(r.rows[0].text).toBe(
      `Stabilized vacancy (the screen of Sep 10, 2026): the OM's 5.0%, the screen's 8.0% (a rule of thumb: a stabilized apartment building runs about 95% occupied); the rent roll as of Sep 20, 2026 ran ${ROLL_VAC.toFixed(1)}% vacant by area — on the screen's side.`,
    );
    // The current screen's refusal says where the roll is scored instead.
    expect(r.notScored).toEqual([
      "Rent roll as of Sep 20, 2026 was on the deal before this screen (added Sep 25, 2026): this screen read it, so it is scored against the screen of Sep 10, 2026 instead.",
    ]);
    // The prior's basis challenge has nothing after it either, and an
    // unscored prior row is never added.
    expect(r.rows.some((x) => x.key === "basis")).toBe(false);
  });

  it("a rent roll uploaded after both screens but dated between them scores the prior screen's challenge, and says it is dated between", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen, ...laterRoll("2026-09-20") });
    expect(r.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([["vacancy", "screen_side", "Sep 10, 2026"]]);
    expect(r.evidence.map((e) => e.label)).toEqual(["Rent roll as of Sep 20, 2026 (added Nov 5, 2026; dated after the screen of Sep 10, 2026 and before this one)"]);
    expect(r.notScored).toEqual([
      "Rent roll as of Sep 20, 2026 was added Nov 5, 2026, but it is dated on or before this screen's verdict (Oct 1, 2026), so it is scored against the screen of Sep 10, 2026 instead.",
    ]);
    // A T-12 the same way scores the prior's NOI challenge, its period said.
    const noiPrior = { verdict: { verdict: "caution", generatedAt: PRIOR_T }, challenges: { challenges: [noi] } };
    const t = scoreDeal({ screenedAt: T, challenges: [noi], priorScreen: noiPrior, t12: { arrivedAt: AFTER, dated: "2026-09-20", summary: t12 } });
    expect(t.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([["noi", "between", "Sep 10, 2026"]]);
    expect(t.notScored).toEqual([
      "T-12 to Sep 20, 2026 was added Nov 5, 2026, but its period ended on or before this screen's verdict (Oct 1, 2026), so it is scored against the screen of Sep 10, 2026 instead.",
    ]);
  });

  it("a figure that arrived after BOTH screens scores the current challenge once, never the prior's of the same key", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen, ...laterRoll() });
    expect(r.evidence).toHaveLength(1);
    expect(r.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([["vacancy", "screen_side", null]]);
    expect(r.rows[0].figures?.om).toBe("6.0% vacant");
    expect(r.notScored).toEqual([]);
    // …while a key the current screen no longer challenges is the prior's.
    const basisOnly = scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen, askingPrice: 65_760_000, ...dead("price") });
    expect(basisOnly.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([
      ["vacancy", "unscored", null],
      ["basis", "screen_side", "Sep 10, 2026"],
    ]);
    expect(basisOnly.rows[1].text).toContain("Basis (the screen of Sep 10, 2026): the screen challenged it");
  });

  it("a decision between the two screens scores the prior's basis challenge, and the current screen's refusal says so", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [basis], priorScreen, ...dead("price", BETWEEN) });
    expect(r.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([["basis", "screen_side", "Sep 10, 2026"]]);
    expect(r.evidence[0].label).toBe("Moved to Dead on price (Sep 25, 2026, after the screen of Sep 10, 2026 and before this one)");
    expect(r.notScored).toEqual(["The deal died on price before this screen's verdict (Sep 25, 2026), so the decision is scored against the screen of Sep 10, 2026 instead."]);
  });

  it("an older snapshot without challenges, one without a stamp, or one stamped after the current screen reads exactly as before", () => {
    const plain = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: BETWEEN, dated: "2026-09-20", summary: t12 } });
    for (const prior of [
      { verdict: { generatedAt: PRIOR_T } },
      { verdict: { generatedAt: PRIOR_T }, challenges: { challenges: [] } },
      { verdict: null, challenges: { challenges: [priorVacancy] } },
      { verdict: { generatedAt: "2026-10-02T00:00:00Z" }, challenges: { challenges: [priorVacancy] } },
      null,
    ]) {
      const r = scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen: prior, t12: { arrivedAt: BETWEEN, dated: "2026-09-20", summary: t12 } });
      expect(r.prior).toBeNull();
      expect(r.rows).toEqual(plain.rows);
      expect(r.evidence).toEqual([]);
      expect(r.notScored).toEqual(plain.notScored);
    }
  });

  it("a manual deal's facts edit snapshots the challenges it replaces, as the pipeline's own re-screen does", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/actions.ts"), "utf8");
    const at = src.indexOf("export async function updateManualFacts");
    const body = src.slice(at, src.indexOf("\nexport async function", at + 10));
    expect(body).toMatch(/\.select\("[^"]*\bchallenges\b[^"]*"\)/);
    expect(body).toMatch(/prior_screen: \{[^}]*challenges: deal\.challenges \?\? null/);
  });

  it("the account's record counts a prior screen's scored row as the deal's", () => {
    const r = accountRecord([scoreDeal({ screenedAt: T, challenges: [vacancy], priorScreen, ...laterRoll("2026-09-20", BETWEEN) })]);
    expect(r).toMatchObject({ dealsTested: 1, dealsWithLater: 1, scored: 0, challenges: { scored: 1, screenSide: 1 } });
  });
});

describe("accountRecord — counts, by key, and the floor", () => {
  // The vacancy by the rent roll's count, the NOI by the T-12.
  const scoredDeal = (...extra: Challenge[]): DealRecord =>
    scoreDeal({ screenedAt: T, challenges: [vacancy, ...extra], ...laterRoll(), t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } });

  it("says no record and claims none with nothing scored, and names what it will be scored against", () => {
    const r = accountRecord([scoreDeal({ screenedAt: T, challenges: [vacancy] }), scoreDeal({ screenedAt: null, challenges: [vacancy] })]);
    expect(r).toMatchObject({ dealsTested: 1, dealsWithLater: 0, scored: 0, byKey: [], shares: null });
    expect(recordState(r)).toBe("none");
    expect(recordLine(r)).toBe(RECORD_NONE_LINE);
    for (const thing of ["a T-12 or rent roll dated after the screen", "what you decided (dead, and why)", "what the building traded for"]) expect(RECORD_NONE_LINE).toContain(thing);
    expect(recordCountsLine(r)).toBe("1 deal tested · 0 with later evidence · 0 rows scored");
  });

  it("under the floor the challenges are a start, not a record, and no share is printed", () => {
    expect(RECORD_FLOOR).toBe(5);
    const r = accountRecord([scoredDeal(), scoredDeal()]);
    expect(r).toMatchObject({ dealsTested: 2, dealsWithLater: 2, scored: 0, challenges: { scored: 2, screenSide: 2, omSide: 0, between: 0, shares: null }, shares: null });
    expect(recordState(r)).toBe("start");
    expect(recordLine(r)).toBe("2 challenges scored from screens whose stress test was not kept are a start, not a record: no share is printed under 5.");
    expect(recordLine(accountRecord([scoredDeal()]))).toBe("1 challenge scored from screens whose stress test was not kept is a start, not a record: no share is printed under 5.");
    expect(recordLine(accountRecord([scoredDeal()]))).not.toMatch(/%/);
    // Four is still under the floor.
    const four = accountRecord([scoredDeal(noi), scoredDeal(), scoredDeal()]);
    expect(four.challenges.scored).toBe(4);
    expect(recordState(four)).toBe("start");
    expect(recordLine(four)).not.toMatch(/%/);
  });

  it("at the floor the shares are said, each with its count, and the keys ranked by rows scored", () => {
    const r = accountRecord([scoredDeal(noi), scoredDeal(), scoredDeal(), scoredDeal()]);
    expect(r.challenges.scored).toBe(5);
    expect(r.byKey.map((k) => [k.key, k.screenSide, k.omSide, k.between])).toEqual([
      ["vacancy", 4, 0, 0],
      ["noi", 0, 0, 1],
    ]);
    expect(r.challenges.shares).toEqual({ screenSidePct: 80, omSidePct: 0, betweenPct: 20 });
    expect(recordState(r)).toBe("record");
    expect(recordLine(r)).toBe(
      "5 challenges from 4 deals scored, from screens whose stress test was not kept: 4 of 5 challenges on the screen's side (80%), 0 of 5 challenges on the OM's (0%), 1 of 5 challenges between (20%).",
    );
    expect(recordCountsLine(r)).toBe("4 deals tested · 4 with later evidence · 5 rows scored");
  });

  it("a decision is counted apart: never a scored row, never in a share or a key's bar", () => {
    const decided = scoreDeal({ screenedAt: T, challenges: [basis], ...dead("price") });
    expect(decided.rows[0]).toMatchObject({ landing: "screen_side", decision: true });
    const r = accountRecord([scoredDeal(noi), scoredDeal(), scoredDeal(), scoredDeal(), decided]);
    expect(r).toMatchObject({ scored: 0, decisions: 1, challenges: { scored: 5, screenSide: 4, between: 1 } });
    expect(r.byKey.map((k) => k.key)).toEqual(["vacancy", "noi"]);
    expect(recordLine(r)).toBe(
      "5 challenges from 4 deals scored, from screens whose stress test was not kept: 4 of 5 challenges on the screen's side (80%), 0 of 5 challenges on the OM's (0%), 1 of 5 challenges between (20%). 1 more row was a decision (Dead, and why), counted apart and in no share.",
    );
    expect(recordCountsLine(r)).toBe("5 deals tested · 5 with later evidence · 6 rows answered, 1 of them a decision · 5 scored");
    // A decision alone is no record: nothing is scored on a figure.
    const alone = accountRecord([decided]);
    expect(recordState(alone)).toBe("none");
    expect(recordLine(alone)).toBe(`${RECORD_NONE_LINE} 1 more row was a decision (Dead, and why), counted apart and in no share.`);
  });

  it("a trade with no asking price to put it on the OM figure's basis is named, never scored", () => {
    const r = scoreDeal({
      screenedAt: T,
      challenges: [basis],
      askingPrice: null,
      stage: "dead",
      history: [{ stage: "dead", at: AFTER, outcome: { reason: null, trade: { price: 60_000_000, buyer: null, date: null, reportedBy: null, reportedAt: AFTER } } }],
    });
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.rows[0].text).toBe("Basis: the building traded at $60.00M, but it carries no figure on the OM figure's basis, so it is not scored.");
  });
});

// ── The stress test's rows, as they stood at the verdict ───────────────────

describe("scoreDeal — every row of the stress test kept with the verdict, holds included (the owner's decision of 2026-10-20)", () => {
  const row = (over: Partial<StressSnapshotRow> & Pick<StressSnapshotRow, "key">): StressSnapshotRow => ({
    title: over.key === "vacancy" ? "Stabilized vacancy" : over.key === "noi" ? "NOI" : over.key === "basis" ? "Basis per unit" : "Row",
    verdict: "stretched",
    om: 6,
    page: 12,
    evidence: { value: 9, label: "Apartment occupancy, a rule of thumb", asOf: null, kind: "rule_of_thumb", publisher: "a rule of thumb" },
    per: null,
    threshold: snapshotThreshold(over.key),
    worse: WORSE_WHEN[over.key],
    ...over,
  });
  const snap = (...rows: StressSnapshotRow[]): StressSnapshot => ({ v: STRESS_SNAPSHOT_V, readOn: "2026-10-01", rows });
  const laterT12 = (over: Partial<T12Summary> = {}) => ({ t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: { ...t12, ...over } } });
  // A vacancy counted by doors is scored by the rent roll (9.4% by area); an
  // economic one by the T-12 (650,500 over 7,150,000, 9.1%).

  it("a stretched row is right where the later figure lands past the OM's on the buyer's bad side, by more than the row's margin", () => {
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [vacancy], ...laterRoll() });
    expect(r.snapshotted).toBe(true);
    expect(r.snapshotNotes).toEqual([]);
    const x = r.rows[0];
    expect(x).toMatchObject({ key: "vacancy", fromTest: true, verdict: "stretched", landing: "right", outcome: "flag_right", omFigure: 6, altFigure: 9 });
    expect(x.figures).toEqual({ om: "6.0% vacant", alt: "9.0% vacant", later: `${ROLL_VAC.toFixed(1)}% vacant` });
    expect(x.text).toBe(
      `Stabilized vacancy: the test read the OM's 6.0% as stretched, set against apartment occupancy, a rule of thumb at 9.0%; the rent roll as of Oct 31, 2026 ran ${ROLL_VAC.toFixed(1)}% vacant by area — past the OM's figure, worse for the buyer by more than the row's 0.05-point margin: the test was right.`,
    );
  });

  it("a vacancy counted by doors is never scored by a later T-12: the row names the T-12's economic vacancy and says why", () => {
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], ...laterT12() });
    expect(r.evidence.map((e) => e.source)).toEqual(["t12"]);
    const x = r.rows[0];
    expect(x).toMatchObject({ landing: "unscored", outcome: null, figures: null, why: T12_NOT_DOORS_WHY });
    expect(x.later).toMatchObject({ source: "t12", value: T12_VAC });
    expect(x.text).toBe(
      `Stabilized vacancy: the T-12 to Oct 31, 2026 (11 of its 12 months precede the verdict) ran ${T12_VAC.toFixed(1)}% economic vacancy (its vacancy loss over gross potential rent: the rent line plus the loss, since the stated EGI is the rent line plus other income), but the T-12's economic vacancy is dollars, not doors, and the OM's figure counts doors, which only a later rent roll can score, so it is not scored.`,
    );
    expect(accountRecord([r]).scored).toBe(0);
    // Beside a rent roll, the roll scores it and the T-12 is not read.
    const both = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], ...laterT12(), ...laterRoll() });
    expect(both.rows[0]).toMatchObject({ landing: "right", later: { source: "rent_roll", value: ROLL_VAC } });
    // Its grid marks the rent roll alone.
    expect(SCORABLE_SOURCES.filter((s) => r.scorable!.find((g) => g.key === "vacancy")!.by[s])).toEqual(["rent_roll"]);
  });

  it("an economic vacancy is scored by a later T-12's economic vacancy alone, never by a rent roll's count", () => {
    const economic = row({ key: "vacancy", title: "Economic vacancy", measure: "economic", evidence: { value: 9, label: "Apartment vacancy and credit loss, a rule of thumb", asOf: null, kind: "rule_of_thumb", publisher: "a rule of thumb" } });
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(economic), challenges: [], ...laterT12() });
    expect(r.rows[0]).toMatchObject({ landing: "right", outcome: "flag_right", later: { source: "t12", value: T12_VAC } });
    expect(r.rows[0].figures).toEqual({ om: "6.0% vacant", alt: "9.0% vacant", later: `${T12_VAC.toFixed(1)}% vacant` });
    expect(r.rows[0].text).toContain(`ran ${T12_VAC.toFixed(1)}% economic vacancy`);
    // A rent roll alone does not score it, and the row says why.
    const byRoll = scoreDeal({ screenedAt: T, stressSnapshot: snap(economic), challenges: [], ...laterRoll() });
    expect(byRoll.rows[0]).toMatchObject({ landing: "unscored", why: ROLL_NOT_DOLLARS_WHY, later: { source: "rent_roll", value: ROLL_VAC } });
    expect(byRoll.rows[0].text).toBe(
      `Economic vacancy: the rent roll as of Oct 31, 2026 ran ${ROLL_VAC.toFixed(1)}% vacant by area, but the rent roll counts doors, not dollars, and the OM's figure is an economic vacancy, which only a later T-12's can score, so it is not scored.`,
    );
    // Beside a rent roll, the T-12 scores it.
    const both = scoreDeal({ screenedAt: T, stressSnapshot: snap(economic), challenges: [], ...laterT12(), ...laterRoll() });
    expect(both.rows[0]).toMatchObject({ landing: "right", later: { source: "t12", value: T12_VAC } });
    // Its grid marks the T-12 alone.
    expect(SCORABLE_SOURCES.filter((s) => r.scorable!.find((g) => g.key === "vacancy")!.by[s])).toEqual(["t12"]);
    // A plan deal's stated economic allowance is the plan's target first.
    const plan = scoreDeal({ screenedAt: T, stressSnapshot: snap(economic), challenges: [], plan: true, vacancyIsPlanTarget: true, ...laterRoll() });
    expect(plan.rows[0].why).toBe("the OM's vacancy is the stabilized figure a plan deal is to reach; a document's vacancy is the building's today, before the plan is done, not a test of it.");
    expect(VACANCY_MEASURE_RULE).toBe("A vacancy counted by doors is scored by a later rent roll; an economic vacancy by a later T-12.");
  });

  it("a stretched row is wrong where the later figure lands within its margin of the OM's, or better for the buyer", () => {
    // A rent roll 4.2% vacant against the OM's 6.0%, read stretched: better for the buyer.
    const rr = { ...roll, occupiedUnits: 230, unitCount: 240, sfWeightedOccupancy: 0.96 };
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], rentRoll: { arrivedAt: AFTER, dated: "2026-11-01", summary: rr } });
    expect(r.rows[0]).toMatchObject({ landing: "wrong", outcome: "flag_wrong" });
    expect(r.rows[0].text).toContain("within the row's 0.05-point margin of the OM's figure, or better for the buyer: the test was wrong.");
    // At the OM's own figure exactly: still wrong — the flag said it was worse.
    const at = { ...roll, occupiedUnits: 0, unitCount: 0, sfWeightedOccupancy: 0.94 };
    const atOm = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], rentRoll: { arrivedAt: AFTER, dated: "2026-11-01", summary: at } });
    expect(atOm.rows[0].later?.value).toBe(6);
    expect(atOm.rows[0].outcome).toBe("flag_wrong");
  });

  it("a hold is right where the later figure lands within the row's margin of the OM's, or better for the buyer", () => {
    const held = row({ key: "noi", verdict: "holds", om: 3_800_000, evidence: { value: 3_900_000, label: "The OM's own in-place NOI", asOf: null, kind: "om_internal", publisher: "the memorandum" } });
    // The T-12's $3.71M is 2.5% under the OM's $3.8M: inside the 5% band.
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(held), challenges: [], ...laterT12() });
    expect(r.rows[0]).toMatchObject({ landing: "right", outcome: "hold_right" });
    expect(r.rows[0].text).toContain("within the row's 5% margin of the OM's figure, or better for the buyer: the hold was right.");
    // Better for the buyer by far is a hold borne out too.
    const better = scoreDeal({ screenedAt: T, stressSnapshot: snap(held), challenges: [], ...laterT12({ noi: 4_500_000 }) });
    expect(better.rows[0].outcome).toBe("hold_right");
  });

  it("a hold is wrong — a false hold — where the later figure lands past the OM's on the buyer's bad side", () => {
    const held = row({ key: "noi", verdict: "holds", om: 4_000_000, evidence: { value: 3_950_000, label: "The OM's own in-place NOI", asOf: null, kind: "om_internal", publisher: "the memorandum" } });
    // $3.71M is 7.3% under $4.0M: past the 5% band.
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(held), challenges: [], ...laterT12() });
    expect(r.rows[0]).toMatchObject({ landing: "wrong", outcome: "false_hold", verdict: "holds" });
    expect(r.rows[0].figures).toEqual({ om: "$4.00M", alt: "$3.95M", later: "$3.71M" });
    expect(r.rows[0].text).toBe(
      "NOI: the test read the OM's $4.00M as holding, set against the OM's own in-place NOI at $3.95M; the T-12 to Oct 31, 2026 (11 of its 12 months precede the verdict) earned $3.71M — past the OM's figure, worse for the buyer by more than the row's 5% margin: a false hold.",
    );
    expect(OUTCOME_WORD.false_hold).toBe("Wrong: a false hold");
    expect(dealRecordLine(r)).toBe("1 stress-test row scored on this deal: 0 right, 1 wrong, 1 of them a false hold. No share is printed under 5 scored rows.");
  });

  it("an unchecked row is not scored, and says why; taxes and insurance are never scored by a document", () => {
    const r = scoreDeal({
      screenedAt: T,
      stressSnapshot: snap(
        row({ key: "vacancy", verdict: "unchecked", evidence: null }),
        row({ key: "taxes", verdict: "stretched", om: 1_000_000, evidence: { value: 1_400_000, label: "The reset bill", asOf: null, kind: "om_internal", publisher: "the memorandum" } }),
      ),
      challenges: [],
      ...laterT12(),
    });
    expect(r.rows.map((x) => x.landing)).toEqual(["unscored", "unscored"]);
    expect(r.rows[0].why).toBe("the stress test left it unchecked — no evidence with a figure decided it — so there is no verdict to score.");
    expect(r.rows[1].why).toContain("a seller's T-12 cannot show a new owner's tax bill");
    expect(dealRecordLine(r)).toBeNull();
  });

  it("a stabilized vacancy the market's published figure decided is not scored by a later document; one a rule of thumb decided is", () => {
    const published = row({ key: "vacancy", verdict: "holds", om: 6, evidence: { value: 6.2, label: "Rental vacancy, metro area", asOf: "2026-04-01", kind: "published", publisher: "Census Bureau" } });
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(published), challenges: [], ...laterT12() });
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.rows[0].text).toContain("which the stress test holds to the market's published figures");
    // The caller's flag is for an older screen's challenge; the row reads its own decider.
    const ruled = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], vacancyHeldToMarket: true, ...laterRoll() });
    expect(ruled.rows[0].landing).toBe("right");
    // A plan deal's NOI is the finished project's, whatever the row read.
    const plan = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "noi", om: 4_000_000, evidence: null, verdict: "holds" })), challenges: [], plan: true, ...laterT12() });
    expect(plan.rows[0].landing).toBe("unscored");
  });

  it("a plan deal's stated vacancy the survey decided is said as the plan's target, never a deal read as stabilized", () => {
    const published = row({ key: "vacancy", verdict: "holds", om: 6, evidence: { value: 6.2, label: "Rental vacancy, metro area", asOf: "2026-04-01", kind: "published", publisher: "Census Bureau" } });
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(published), challenges: [], plan: true, vacancyIsPlanTarget: true, ...laterT12() });
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.rows[0].why).toBe("the OM's vacancy is the stabilized figure a plan deal is to reach; a document's vacancy is the building's today, before the plan is done, not a test of it.");
    expect(r.rows[0].text).not.toContain("a deal read as stabilized");
    // An older screen's challenge with both flags reads the plan's sentence too.
    const old = scoreDeal({ screenedAt: T, challenges: [vacancy], plan: true, vacancyIsPlanTarget: true, vacancyHeldToMarket: true, ...laterT12() });
    expect(old.rows[0].landing).toBe("unscored");
    expect(old.rows[0].text).not.toContain("a deal read as stabilized");
  });

  it("a decision is a direction: on a flagged row it agrees, against a hold it does not, and either is counted apart", () => {
    const flagged = row({ key: "basis", om: 274_000, evidence: { value: 240_000, label: "The OM's sale comps", asOf: null, kind: "om_internal", publisher: "the memorandum" } });
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(flagged), challenges: [], ...dead("price") });
    expect(r.rows[0]).toMatchObject({ landing: "right", decision: true, outcome: null });
    expect(r.rows[0].text).toContain("and you walked away on price — a decision on the test's side, not a figure.");
    const held = scoreDeal({ screenedAt: T, stressSnapshot: snap({ ...flagged, verdict: "holds" }), challenges: [], ...dead("price") });
    expect(held.rows[0]).toMatchObject({ landing: "wrong", decision: true });
    expect(held.rows[0].text).toContain("a decision against the hold, not a figure.");
    const acct = accountRecord([r, held]);
    expect(acct).toMatchObject({ scored: 0, decisions: 2, shares: null });
  });

  it("a trade is put on a per-SF row's own yardstick, and the row's 5% stretch line decides", () => {
    const perSf = row({ key: "basis", om: 300, per: "/SF", evidence: { value: 260, label: "Recorded sales, median a foot", asOf: "2026-09-01", kind: "published", publisher: "public records" } });
    const trade = (price: number) => ({
      askingPrice: 66_000_000,
      stage: "dead",
      history: [{ stage: "dead", at: AFTER, outcome: { reason: null, trade: { price, buyer: null, date: null, reportedBy: null, reportedAt: AFTER } } }] as StageChange[],
    });
    // $60.0M over the $66.0M ask is $272.73 a foot: 9.1% under $300.
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(perSf), challenges: [], ...trade(60_000_000) });
    expect(r.rows[0]).toMatchObject({ landing: "right", outcome: "flag_right" });
    expect(r.rows[0].figures?.om).toBe("$300/SF");
    // $64.0M is 3.0% under: inside the 5% line, so the flag did not stand.
    const near = scoreDeal({ screenedAt: T, stressSnapshot: snap(perSf), challenges: [], ...trade(64_000_000) });
    expect(near.rows[0].outcome).toBe("flag_wrong");
  });

  it("the floor: four scored rows are a start with no share; five print each share with its count", () => {
    // At the roll's own figure a flag is wrong; at 6.0% it is right.
    const deal = (n: number) => scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy", om: n })), challenges: [], ...laterRoll() });
    const four = accountRecord([deal(6), deal(6), deal(6), deal(ROLL_VAC)]);
    expect(four).toMatchObject({ scored: 4, right: 3, wrong: 1, falseHolds: 0, shares: null });
    expect(recordState(four)).toBe("start");
    expect(recordLine(four)).toBe("4 scored stress-test rows are a start, not a record: no share is printed under 5.");
    const five = accountRecord([deal(6), deal(6), deal(6), deal(ROLL_VAC), deal(ROLL_VAC)]);
    expect(five.shares).toEqual({ rightPct: 60, wrongPct: 40 });
    expect(recordState(five)).toBe("record");
    expect(recordLine(five)).toBe("5 stress-test rows from 5 deals scored: 3 of 5 rows right (60%), 2 of 5 rows wrong (40%).");
    expect(five.byKey).toEqual([{ key: "vacancy", title: "Stabilized vacancy", right: 3, wrong: 2, screenSide: 0, omSide: 0, between: 0 }]);
    expect(recordCountsLine(five)).toBe("5 deals tested · 5 with later evidence · 5 rows scored");
    // The deal page's own line takes the same floor.
    const many = scoreDeal({
      screenedAt: T,
      stressSnapshot: snap(row({ key: "vacancy" }), row({ key: "vacancy" }), row({ key: "vacancy" }), row({ key: "vacancy", om: ROLL_VAC }), row({ key: "vacancy", om: ROLL_VAC })),
      challenges: [],
      ...laterRoll(),
    });
    expect(dealRecordLine(many)).toBe("5 stress-test rows scored on this deal: 3 of 5 rows right (60%), 2 of 5 rows wrong (40%).");
  });

  it("a verdict with no snapshot scores its challenges and says its rows were not snapshotted; one that built no test says so", () => {
    const older = scoreDeal({ screenedAt: T, challenges: [vacancy], ...laterRoll() });
    expect(older.snapshotted).toBe(false);
    expect(older.rows[0]).toMatchObject({ landing: "screen_side" });
    expect(older.rows[0].fromTest).toBeUndefined();
    expect(older.snapshotNotes).toEqual([
      "This screen (Oct 1, 2026) was made before the stress test was kept with its verdict, so its rows were not snapshotted: its challenges are scored on the challenger's own figures instead.",
    ]);
    const none = scoreDeal({ screenedAt: T, stressSnapshot: null, challenges: [vacancy], ...laterT12() });
    expect(none.snapshotNotes).toEqual(["This screen (Oct 1, 2026) built no stress test, so its rows were not snapshotted: its challenges are scored on the challenger's own figures instead."]);
    // Anything stored that is not a snapshot is none, never a hold.
    expect(readStressSnapshot({ v: 99, rows: [] })).toBeNull();
    expect(readStressSnapshot({ v: STRESS_SNAPSHOT_V, rows: [{ key: "nope", verdict: "holds", title: "x" }] })).toBeNull();
    expect(readStressSnapshot("junk")).toBeNull();
  });

  it("the prior screen's snapshot rides in its verdict into prior_screen, and scores what arrived between the two screens", () => {
    const PRIOR_T = "2026-09-10T12:00:00Z";
    const BETWEEN = "2026-09-25T09:00:00Z";
    const priorScreen = { verdict: { generatedAt: PRIOR_T, stressSnapshot: snap(row({ key: "vacancy", verdict: "holds", om: 5 })) }, challenges: { challenges: [vacancy] } };
    // The rent roll arrived between the two screens, dated Sep 20: the
    // current screen read it; the prior's hold of 5.0% is scored on it — a
    // false hold.
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], priorScreen, ...laterRoll("2026-09-20", BETWEEN) });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ priorScreenedOn: "Sep 10, 2026", outcome: "false_hold", fromTest: true });
    expect(r.rows[0].text.startsWith("Stabilized vacancy (the screen of Sep 10, 2026): the test read the OM's 5.0% as holding")).toBe(true);
    expect(r.snapshotNotes).toEqual([]);
    // A prior verdict with no snapshot scores its challenges, said as the earlier screen's.
    const older = scoreDeal({
      screenedAt: T,
      stressSnapshot: snap(row({ key: "vacancy" })),
      challenges: [],
      priorScreen: { verdict: { generatedAt: PRIOR_T }, challenges: { challenges: [vacancy] } },
      ...laterRoll("2026-09-20", BETWEEN),
    });
    expect(older.rows[0]).toMatchObject({ landing: "screen_side", priorScreenedOn: "Sep 10, 2026" });
    expect(older.snapshotNotes).toEqual([
      "The screen of Sep 10, 2026 was made before the stress test was kept with its verdict, so its rows were not snapshotted: its challenges are scored on the challenger's own figures instead.",
    ]);
  });
});

describe("stressSnapshotOf — the stress test as it stood at the verdict", () => {
  const ev = (over: Partial<StressEvidence>): StressEvidence => ({ kind: "document", label: "The deal's T-12", text: "", value: 1_000_000, asOf: "2026-06-30", publisher: "the deal's T-12", scope: "deal", ...over });
  const base: StressRow = {
    key: "noi",
    title: "NOI",
    omSays: { text: "NOI: $1,200,000", value: 1_200_000, page: 5 },
    evidence: [ev({})],
    gap: { value: 200_000, unit: "usd", text: "" },
    verdict: "unsupported",
    impact: null,
    challenge: null,
    method: "",
  };
  const test = (...rows: StressRow[]): StressTest => ({ rows, readOn: "2026-10-01", publishedRead: true, impactsWithheld: null });

  it("keeps each row's verdict, the OM's figure and page, and the evidence that decided it — the re-run's, else the first with a figure", () => {
    const vac: StressRow = {
      ...base,
      key: "vacancy",
      title: "Stabilized vacancy",
      omSays: { text: "Vacancy 5%", value: 5, page: 9 },
      evidence: [ev({ value: 9, label: "The deal's rent roll" }), ev({ kind: "published", label: "Rental vacancy, metro area", value: 6.2, asOf: "2026-04-01", publisher: "Census Bureau" })],
      verdict: "stretched",
      impact: { input: "vacancyPct", evidenceIndex: 1, omValue: 0.05, altValue: 0.062, baseIrrPct: 10, altIrrPct: 9, baseMultiple: 1.8, altMultiple: 1.7, note: "" },
    };
    const s = stressSnapshotOf(test(base, vac, { ...base, key: "other", title: "Other", verdict: "unchecked", evidence: [], omSays: { text: "", value: null, page: null } }))!;
    expect(s).toMatchObject({ v: STRESS_SNAPSHOT_V, readOn: "2026-10-01" });
    expect(s.rows[0]).toEqual({
      key: "noi",
      title: "NOI",
      verdict: "unsupported",
      om: 1_200_000,
      page: 5,
      evidence: { value: 1_000_000, label: "The deal's T-12", asOf: "2026-06-30", kind: "document", publisher: "the deal's T-12" },
      per: null,
      threshold: { value: 0.05, unit: "share" },
      worse: "lower",
      rerun: null,
    });
    expect(s.rows[1].evidence).toMatchObject({ kind: "published", value: 6.2 });
    expect(s.rows[1].threshold).toEqual({ value: 0.05, unit: "pts" });
    // What the row's re-run measured is kept: the levered IRR here.
    expect(s.rows[1].rerun).toBe("levered_irr");
    expect(s.rows[2]).toMatchObject({ verdict: "unchecked", evidence: null, threshold: null, om: null });
    // What is written reads back as itself.
    expect(readStressSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(stressSnapshotOf(null)).toBeNull();
    expect(stressSnapshotOf(test())).toBeNull();
  });

  it("labels the deal-killer cards 'Breaks if:' only where the call was reached on the engine's re-runs, else the screen's estimate", () => {
    const impact = { input: "vacancyPct" as const, evidenceIndex: 0, omValue: 0.05, altValue: 0.09, baseIrrPct: 10, altIrrPct: 9, baseMultiple: 1.8, altMultiple: 1.7, note: "" };
    const stretched: StressRow = { ...base, key: "vacancy", title: "Stabilized vacancy", verdict: "stretched", impact };
    const snap = (...rows: StressRow[]) => JSON.parse(JSON.stringify(stressSnapshotOf(test(...rows))));
    // A row past its evidence that carried a re-run: the brief cited it.
    expect(callCitesEngine(snap(base, stretched))).toBe(true);
    expect(breaksIfLabel(snap(base, stretched))).toBe(BREAKS_IF);
    expect(BREAKS_IF).toBe("Breaks if:");
    // A row that holds keeps its impact for the headline but draws no re-run,
    // and a row past its evidence with none re-ran nothing: no citation.
    expect(callCitesEngine(snap({ ...stretched, verdict: "holds" }))).toBe(false);
    expect(callCitesEngine(snap(base))).toBe(false);
    expect(breaksIfLabel(snap(base))).toBe(BREAKS_IF_ESTIMATE);
    expect(BREAKS_IF_ESTIMATE).toBe("Breaks if (the screen's estimate):");
    // A verdict saved before the stress test, or a snapshot kept before
    // `rerun` was carried, is the screen's estimate.
    expect(breaksIfLabel(undefined)).toBe(BREAKS_IF_ESTIMATE);
    const old = snap(base, stretched);
    for (const r of old.rows) delete r.rerun;
    expect(breaksIfLabel(old)).toBe(BREAKS_IF_ESTIMATE);
    // The sample's call is written on its own stress test.
    expect(breaksIfLabel(undefined, true)).toBe(BREAKS_IF);
  });

  it("keeps the row's own deciding figure (decidedBy) ahead of the re-run's", () => {
    const vac: StressRow = {
      ...base,
      key: "vacancy",
      title: "Stabilized vacancy",
      omSays: { text: "Vacancy 5%", value: 5, page: 9 },
      evidence: [ev({ value: 9, label: "The deal's rent roll" }), ev({ kind: "published", label: "Rental vacancy, metro area", value: 6.2, asOf: "2026-04-01", publisher: "Census Bureau" })],
      verdict: "stretched",
      decidedBy: 1,
      impact: { input: "vacancyPct", evidenceIndex: 0, omValue: 0.05, altValue: 0.09, baseIrrPct: 10, altIrrPct: 9, baseMultiple: 1.8, altMultiple: 1.7, note: "" },
    };
    expect(stressSnapshotOf(test(vac))!.rows[0].evidence).toMatchObject({ kind: "published", value: 6.2 });
  });

  it("keeps whether a row's re-run was a plan deal's yield on cost, and reads an older snapshot's rows as unknown", () => {
    const vac: StressRow = {
      ...base,
      key: "vacancy",
      title: "Stabilized vacancy",
      omSays: { text: "Stabilized vacancy 5%", value: 5, page: 9 },
      evidence: [ev({ value: 9, label: "The deal's rent roll" })],
      verdict: "stretched",
      decidedBy: 0,
      impact: {
        measure: "yield_on_cost",
        input: "stabilizedNoi",
        evidenceIndex: 0,
        omValue: 2_650_000,
        altValue: 2_470_000,
        baseIrrPct: null,
        altIrrPct: null,
        baseMultiple: null,
        altMultiple: null,
        baseYocPct: 6.05,
        altYocPct: 5.64,
        note: "",
      },
    };
    const s = stressSnapshotOf(test(vac))!;
    expect(s.rows[0].rerun).toBe("yield_on_cost");
    expect(readStressSnapshot(JSON.parse(JSON.stringify(s)))!.rows[0].rerun).toBe("yield_on_cost");
    // A snapshot kept before the field reads back without it: unknown, never
    // a levered IRR.
    const older = JSON.parse(JSON.stringify(s));
    delete older.rows[0].rerun;
    expect(readStressSnapshot(older)!.rows[0]).not.toHaveProperty("rerun");
  });

  it("keeps an economic vacancy's measure, so the record scores it by a T-12; a row counted by doors carries none", () => {
    const doors: StressRow = { ...base, key: "vacancy", title: "Stabilized vacancy", omSays: { text: "Vacancy 5%", value: 5, page: 9 }, evidence: [ev({ value: 9, label: "The deal's rent roll" })], verdict: "stretched", decidedBy: 0 };
    const economic: StressRow = { ...doors, title: "Economic vacancy", omSays: { text: "Vacancy and credit loss 5%", value: 5, page: 9 }, evidence: [ev({ value: 9, label: "The deal's T-12" })], measure: "economic" };
    const s = stressSnapshotOf(test(doors, economic))!;
    expect(s.rows[0]).not.toHaveProperty("measure");
    expect(s.rows[1].measure).toBe("economic");
    // Written and read back, the measure is kept as itself.
    const back = readStressSnapshot(JSON.parse(JSON.stringify(s)))!;
    expect(back).toEqual(s);
    expect(back.rows[1].measure).toBe("economic");
    // Anything else stored there reads as a row counted by doors.
    const junk = JSON.parse(JSON.stringify(s));
    junk.rows[0].measure = "physical";
    expect(readStressSnapshot(junk)!.rows[0]).not.toHaveProperty("measure");
    // And the round trip scores the economic row by a later T-12, the doors
    // row by a later rent roll.
    const r = scoreDeal({ screenedAt: T, stressSnapshot: JSON.parse(JSON.stringify(s)), challenges: [], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 }, ...laterRoll() });
    expect(r.rows.map((x) => [x.title, x.later?.source ?? null, x.landing])).toEqual([
      ["Stabilized vacancy", "rent_roll", "right"],
      ["Economic vacancy", "t12", "right"],
    ]);
  });

  it("a piece judged on its own yardstick is kept on it, the OM's figure with it", () => {
    const basisRow: StressRow = {
      ...base,
      key: "basis",
      title: "Basis per unit",
      omSays: { text: "$274,000 a unit", value: 274_000, page: 3 },
      evidence: [ev({ kind: "published", label: "Recorded sales", value: 260, ownYardstick: { om: 300, per: "/SF" } })],
      verdict: "stretched",
    };
    const row0 = stressSnapshotOf(test(basisRow))!.rows[0];
    expect(row0).toMatchObject({ om: 300, per: "/SF", threshold: { value: 0.05, unit: "share" }, worse: "lower" });
    expect(row0.evidence?.value).toBe(260);
  });
});

// ── What can score which row, held to the scorer ─────────────────────────

describe("what can score a row — the words held to the scorer, key by key (the investor walkthrough of 2026-10-20)", () => {
  const OM: Record<StressKey, number> = {
    basis: 50_000_000,
    exit_cap: 5.25,
    debt: 5,
    noi: 4_000_000,
    vacancy: 6,
    rent_growth: 3,
    expense_growth: 3,
    taxes: 1_000_000,
    insurance: 300_000,
    renovation_premium: 250,
    other: 1,
  };
  const rowFor = (key: StressKey): StressSnapshotRow => ({
    key,
    title: key,
    verdict: "stretched",
    om: OM[key],
    page: 3,
    evidence: { value: OM[key] * 1.2, label: "A rule of thumb", asOf: null, kind: "rule_of_thumb", publisher: "a rule of thumb" },
    per: null,
    threshold: snapshotThreshold(key),
    worse: WORSE_WHEN[key],
  });
  // The challenger's other points are always unchecked rows, which no
  // record scores ("An unchecked row is not scored").
  const keys = STRESS_KEYS.filter((k) => k !== "other");
  const snapshot: StressSnapshot = { v: STRESS_SNAPSHOT_V, readOn: "2026-10-01", rows: keys.map(rowFor) };
  const scoredKeys = (r: DealRecord) => r.rows.filter((x) => x.landing === "right" || x.landing === "wrong").map((x) => x.key);

  it("with every kind of later figure in hand — a T-12, a rent roll, a trade — only the vacancy, the NOI and the price are scored", () => {
    const r = scoreDeal({
      screenedAt: T,
      stressSnapshot: snapshot,
      challenges: [],
      askingPrice: 50_000_000,
      t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 },
      rentRoll: { arrivedAt: AFTER, dated: "2026-11-01", summary: roll },
      stage: "dead",
      history: [{ stage: "dead", at: AFTER, outcome: { reason: null, trade: { price: 47_000_000, buyer: null, date: null, reportedBy: null, reportedAt: AFTER } } }],
    });
    expect(new Set(scoredKeys(r))).toEqual(new Set(["vacancy", "noi", "basis"]));
    // SCORED_BY names the three, NOT_YET_SCORABLE every row nothing can score.
    // The vacancy row here counts doors: the rent roll scored it, never the T-12.
    expect(r.rows.find((x) => x.key === "vacancy")!.later?.source).toBe("rent_roll");
    expect(SCORED_BY).toContain("a vacancy by a rent roll (doors) or a T-12 (dollars), dated after the verdict, unless the market decided it");
    expect(SCORED_BY).toContain("the NOI by a T-12, neither on a plan deal");
    expect(CARD_SCOPE).toContain("a rent roll for a vacancy counted by doors, a T-12 for an economic vacancy, unless the market's figure decided it, or the NOI, neither on a plan deal");
    // No surface says a T-12 scores a vacancy counted by doors.
    for (const s of [CARD_SCOPE, SCORED_BY]) expect(s).not.toMatch(/a vacancy by a rent roll or (?:a )?T-12/);
    expect(SCORED_BY).toContain("the price by a reported trade");
    const named: Record<string, string> = {
      rent_growth: "Rent growth",
      expense_growth: "expense growth",
      exit_cap: "the exit cap",
      taxes: "taxes",
      insurance: "insurance",
      renovation_premium: "a renovation premium",
    };
    // The loan is answered by a decision alone (the next case), so it is
    // neither a figure's row nor one nothing can answer.
    const unscored = keys.filter((k) => !scoredKeys(r).includes(k) && k !== "debt");
    expect(new Set(unscored)).toEqual(new Set(Object.keys(named)));
    for (const k of unscored) expect(NOT_YET_SCORABLE, k).toContain(named[k]);
  });

  it("the loan is answered only by a Dead decision on financing, and the price by one on price — counted apart, never a figure", () => {
    const fin = scoreDeal({ screenedAt: T, stressSnapshot: snapshot, challenges: [], ...dead("financing") });
    expect(scoredKeys(fin)).toEqual(["debt"]);
    expect(fin.rows.find((x) => x.key === "debt")).toMatchObject({ decision: true, outcome: null });
    const price = scoreDeal({ screenedAt: T, stressSnapshot: snapshot, challenges: [], askingPrice: 50_000_000, ...dead("price") });
    expect(scoredKeys(price)).toEqual(["basis"]);
    expect(price.rows.find((x) => x.key === "basis")).toMatchObject({ decision: true });
    expect(DECISION_SCORES).toBe("A Dead decision on price or financing answers the price or the loan, and a Closed deal's own price answers the price, each counted apart.");
  });

  it("no surface says every row is scored", () => {
    for (const s of [CARD_SCOPE, SCORED_BY, NOT_YET_SCORABLE, RECORD_NONE_LINE]) expect(s).not.toMatch(/every (?:row|test)\b[^.]*\bis scored/i);
    expect(CARD_SCOPE).toContain("is scored where a later figure can speak to it");
  });
});

// ── The row's own tolerance, kept with the verdict ───────────────────────

describe("the snapshot keeps the verdict's own tolerance, and the record scores by it", () => {
  const ev = (over: Partial<StressEvidence>): StressEvidence => ({
    kind: "published",
    label: "Rental vacancy, metro area",
    text: "5.8% ±1.9 pts (Q2 2026)",
    value: 5.8,
    asOf: "2026-04-01",
    publisher: "Census Bureau",
    scope: "metro",
    ...over,
  });
  const vacRow = (evidence: StressEvidence[]): StressRow => ({
    key: "vacancy",
    title: "Stabilized vacancy",
    omSays: { text: "Vacancy (pro forma): 6.0%", value: 6, page: 21 },
    evidence,
    gap: { value: -0.2, unit: "pts", text: "" },
    verdict: "holds",
    decidedBy: 0,
    impact: null,
    challenge: null,
    method: "",
  });
  const test = (...rows: StressRow[]): StressTest => ({ rows, readOn: "2026-10-01", publishedRead: true, impactsWithheld: null });

  it("a vacancy the survey decided keeps the survey's margin of error, the one its verdict held the OM's figure inside", () => {
    // The sample's own case: 6.0% against the metro survey's 5.8% ±1.9 holds.
    expect(stressSnapshotOf(test(vacRow([ev({})])))!.rows[0].threshold).toEqual({ value: 1.9, unit: "pts" });
    expect(rowThreshold("vacancy", { kind: "published", text: "6.2% ±2.2 pts (Q2 2026)" })).toEqual({ value: 2.2, unit: "pts" });
  });

  it("every other row keeps the key's own threshold: a document, a figure with no margin, and every other key", () => {
    const doc = ev({ kind: "document", label: "The deal's rent roll", text: "9.3% vacant", value: 9.3, publisher: "the deal's rent roll", scope: "deal" });
    expect(stressSnapshotOf(test(vacRow([doc])))!.rows[0].threshold).toEqual({ value: 0.05, unit: "pts" });
    expect(rowThreshold("vacancy", { kind: "published", text: "4.6% (Q2 2026)" })).toEqual(snapshotThreshold("vacancy"));
    expect(rowThreshold("vacancy", null)).toEqual(snapshotThreshold("vacancy"));
    // A margin in another row's text is not that row's tolerance: only the
    // vacancy judge reads one.
    for (const k of STRESS_KEYS.filter((x) => x !== "vacancy")) expect(rowThreshold(k, { kind: "published", text: "6.2% ±2.2 pts" }), k).toEqual(snapshotThreshold(k));
  });

  it("reads the margin off the figure's text exactly as lib/stress-test's vacancy judge does", () => {
    const re = String.raw`/±\s*(\d+(?:\.\d+)?)\s*pts?/`;
    expect(readFileSync(join(process.cwd(), "lib/stress-test.ts"), "utf8")).toContain(re);
    expect(readFileSync(join(process.cwd(), "lib/stress-snapshot.ts"), "utf8")).toContain(re);
  });

  it("a row is scored by the tolerance it was kept with, and a stored snapshot keeps the margin it stored", () => {
    // The stored margin alone decides: a hold at 6.0% and a later 7.0%, one
    // point worse for the buyer.
    const row = (threshold: StressSnapshotRow["threshold"]): StressSnapshotRow => ({
      key: "vacancy",
      title: "Stabilized vacancy",
      verdict: "holds",
      om: 6,
      page: 21,
      evidence: { value: 6.5, label: "A rule of thumb", asOf: null, kind: "rule_of_thumb", publisher: "a rule of thumb" },
      per: null,
      threshold,
      worse: "higher",
    });
    const later = { ...roll, occupiedUnits: 0, unitCount: 0, sfWeightedOccupancy: 0.93 };
    const score = (t: StressSnapshotRow["threshold"]) =>
      scoreDeal({
        screenedAt: T,
        stressSnapshot: { v: STRESS_SNAPSHOT_V, readOn: "2026-10-01", rows: [row(t)] },
        challenges: [],
        rentRoll: { arrivedAt: AFTER, dated: "2026-11-01", summary: later },
      }).rows[0];
    const wide = score({ value: 1.9, unit: "pts" });
    expect(wide).toMatchObject({ outcome: "hold_right", landing: "right" });
    expect(wide.text).toContain("within the row's 1.9-point margin of the OM's figure");
    expect(score({ value: 0.05, unit: "pts" })).toMatchObject({ outcome: "false_hold", landing: "wrong" });
    // Read back, a stored threshold is kept as stored, never recomputed from
    // the evidence: a snapshot kept before the tolerance was carried keeps its
    // 0.05 points beside a survey's figure.
    const older = {
      v: STRESS_SNAPSHOT_V,
      readOn: "2026-10-01",
      rows: [{ ...row({ value: 0.05, unit: "pts" }), evidence: { value: 5.8, label: "Rental vacancy, metro area", asOf: "2026-04-01", kind: "published", publisher: "Census Bureau" } }],
    };
    expect(readStressSnapshot(JSON.parse(JSON.stringify(older)))!.rows[0].threshold).toEqual({ value: 0.05, unit: "pts" });
  });
});

// ── The review of 2026-10-21 ─────────────────────────────────────────────

describe("a trade is scored only where it traded after the verdict's day, as a document is", () => {
  const basisRow: StressSnapshotRow = {
    key: "basis",
    title: "Basis",
    verdict: "stretched",
    om: 50_000_000,
    page: 3,
    evidence: { value: 44_000_000, label: "Recorded sales, median", asOf: "2026-09-01", kind: "published", publisher: "public records" },
    per: null,
    threshold: snapshotThreshold("basis"),
    worse: WORSE_WHEN.basis,
  };
  const snapOf = (...rows: StressSnapshotRow[]): StressSnapshot => ({ v: STRESS_SNAPSHOT_V, readOn: "2026-10-01", rows });
  const traded = (date: string | null, reportedAt = AFTER) => ({
    askingPrice: 50_000_000,
    stage: "dead",
    history: [{ stage: "dead", at: reportedAt, outcome: { reason: null, trade: { price: 45_000_000, buyer: null, date, reportedBy: null, reportedAt } } }] as StageChange[],
  });

  it("refuses a trade dated before the verdict though reported after it, and says so; the card is still drawn", () => {
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snapOf(basisRow), challenges: [], ...traded("2026-05-01") });
    expect(r.evidence).toEqual([]);
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.refusedLater).toBe(true);
    expect(r.notScored).toEqual([
      "The trade (traded at $45.00M on May 1, 2026) was recorded Nov 5, 2026, after the screen, but it traded on or before the verdict's day (Oct 1, 2026): a sale the screen could have been told of, only reported later, so it is not scored.",
    ]);
  });

  it("refuses one dated on the verdict's own day, and scores one dated the day after", () => {
    expect(scoreDeal({ screenedAt: T, stressSnapshot: snapOf(basisRow), challenges: [], ...traded("2026-10-01") }).rows[0].landing).toBe("unscored");
    const after = scoreDeal({ screenedAt: T, stressSnapshot: snapOf(basisRow), challenges: [], ...traded("2026-10-02") });
    expect(after.rows[0]).toMatchObject({ landing: "right", outcome: "flag_right" });
    expect(after.refusedLater).toBe(false);
    // A trade with no date of its own is scored on its report, as before.
    expect(scoreDeal({ screenedAt: T, stressSnapshot: snapOf(basisRow), challenges: [], ...traded(null) }).rows[0].outcome).toBe("flag_right");
  });

  it("a trade dated between two screens scores the earlier screen's row, and the current screen's refusal says so", () => {
    const PRIOR = "2026-09-10T12:00:00Z";
    const r = scoreDeal({
      screenedAt: T,
      stressSnapshot: snapOf({ ...basisRow, verdict: "holds" }),
      challenges: [],
      priorScreen: { verdict: { generatedAt: PRIOR, stressSnapshot: snapOf(basisRow) } },
      ...traded("2026-09-20"),
    });
    expect(r.rows[0]).toMatchObject({ key: "basis", outcome: "flag_right", priorScreenedOn: "Sep 10, 2026" });
    expect(r.evidence.map((e) => e.label)).toEqual(["The building traded at $45.00M on Sep 20, 2026 (recorded Nov 5, 2026; traded after the screen of Sep 10, 2026 and before this one)"]);
    expect(r.notScored).toEqual([
      "The trade (traded at $45.00M on Sep 20, 2026) was recorded Nov 5, 2026, but it traded on or before this screen's verdict (Oct 1, 2026), so it is scored against the screen of Sep 10, 2026 instead.",
    ]);
  });

  it("the price's sentence says the market priced it under the ask, never that a trade under it was worse for the buyer", () => {
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snapOf(basisRow), challenges: [], ...traded("2026-10-20") });
    expect(r.rows[0].text).toContain("more than the row's 5% margin under the OM's figure, the market pricing it under the ask: the test was right.");
    expect(r.rows[0].text).not.toContain("worse for the buyer");
    const held = scoreDeal({ screenedAt: T, stressSnapshot: snapOf({ ...basisRow, verdict: "holds" }), challenges: [], ...traded("2026-10-20") });
    expect(held.rows[0].text).toContain("the market pricing it under the ask: a false hold.");
  });
});

describe("a T-12 dated a day after the verdict says how many of its months precede it", () => {
  it("counts the monthly periods ending on or before the verdict's day", () => {
    expect(t12MonthsBefore("2026-10-31", "2026-10-01")).toBe(11);
    expect(t12MonthsBefore("2026-10-02", "2026-10-01")).toBe(11);
    expect(t12MonthsBefore("2027-03-31", "2026-10-01")).toBe(6);
    expect(t12MonthsBefore("2027-06-30", "2026-10-01")).toBe(3);
    expect(t12MonthsBefore("2027-12-31", "2026-10-01")).toBe(0);
    // A month-end period runs back over month ends: Feb 28, not Feb 31.
    expect(t12MonthsBefore("2027-01-31", "2026-02-28")).toBe(1);
  });

  it("says it on the row only where most months precede the verdict; the score is unchanged", () => {
    const at = (dated: string) => scoreDeal({ screenedAt: T, challenges: [noi], t12: { arrivedAt: AFTER, dated, summary: t12 } }).rows[0];
    expect(at("2026-10-02").text).toContain("the T-12 to Oct 2, 2026 (11 of its 12 months precede the verdict) earned $3.71M");
    expect(at("2027-03-31").text).not.toContain("months precede");
    expect(at("2026-10-02").landing).toBe(at("2027-03-31").landing);
  });
});

describe("the vacancy row is named one way on both surfaces, its figures a share vacant", () => {
  const occ = (om: number): StressSnapshotRow => ({
    key: "vacancy",
    title: "Occupancy today",
    verdict: "stretched",
    om,
    page: 4,
    evidence: { value: 9, label: "The deal's rent roll", asOf: "2026-09-01", kind: "document", publisher: "the deal's rent roll" },
    per: null,
    threshold: snapshotThreshold("vacancy"),
    worse: "higher",
  });
  const stab: StressSnapshotRow = { ...occ(6), title: "Stabilized vacancy", evidence: { value: 9, label: "A rule of thumb", asOf: null, kind: "rule_of_thumb", publisher: "a rule of thumb" } };
  const deal = (row: StressSnapshotRow) =>
    scoreDeal({ screenedAt: T, stressSnapshot: { v: STRESS_SNAPSHOT_V, readOn: "2026-10-01", rows: [row] }, challenges: [], ...laterRoll("2027-03-31") });

  it("prints each figure as a share vacant, never a bare percent an occupancy row would read as occupied", () => {
    const r = deal(occ(5)).rows[0];
    expect(r.title).toBe("Occupancy today");
    expect(r.figures).toEqual({ om: "5.0% vacant", alt: "9.0% vacant", later: `${ROLL_VAC.toFixed(1)}% vacant` });
  });

  it("files a row under the title the card prints, so the account record never calls today's occupancy a stabilized vacancy", () => {
    const acct = accountRecord([deal(occ(5)), deal(stab), deal(occ(5))]);
    expect(acct.byKey.map((k) => [k.key, k.title, k.right + k.wrong])).toEqual([
      ["vacancy", "Occupancy today", 2],
      ["vacancy", "Stabilized vacancy", 1],
    ]);
  });
});

describe("shares sum to 100, and the account's share names its deals", () => {
  it("rounds a set of shares by the largest remainder", () => {
    expect(wholeShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholeShares([1, 7])).toEqual([13, 87]);
    expect(wholeShares([2, 2, 3])).toEqual([29, 28, 43]);
    expect(wholeShares([0, 0])).toEqual([0, 0]);
    for (const counts of [[1, 2, 4], [5, 5, 1], [3, 3, 3], [1, 1, 1, 1, 1, 1, 1]]) expect(wholeShares(counts).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("prints the three-way challenge shares summing to 100, with the rows' count and their deals", () => {
    const side = (alt: number, om = 6) => scoreDeal({ screenedAt: T, challenges: [{ ...vacancy, omFigure: om, altFigure: alt }], ...laterRoll("2027-03-31") });
    // The roll's 9.4% later: past 9 is the screen's side, between 6 and 10
    // between, under both an OM's figure 0.1 over it and a screen's 0.4 over
    // it the OM's side.
    const r = accountRecord([side(9), side(9), side(10), side(10), side(10), side(ROLL_VAC + 0.4, ROLL_VAC + 0.1)]);
    expect(r.challenges).toMatchObject({ screenSide: 2, between: 3, omSide: 1 });
    const s = r.challenges.shares!;
    expect(s.screenSidePct + s.omSidePct + s.betweenPct).toBe(100);
    expect(recordLine(r)).toContain(`${r.challenges.scored} challenges from ${r.challenges.deals} deals scored, from screens whose stress test was not kept:`);
  });
});

describe("what will score what — the grid is the scorer's own rules, never written by hand", () => {
  const marked = (rows: ReturnType<typeof scorableGrid>) => Object.fromEntries(rows.map((r) => [r.key, SCORABLE_SOURCES.filter((s) => r.by[s])]));

  it("marks the vacancy by either document, the NOI by a T-12, the price by a trade or a decision, the loan by a decision, and nothing else", () => {
    expect(marked(scorableGrid())).toEqual({
      basis: ["outcome", "trade"],
      exit_cap: [],
      debt: ["outcome"],
      noi: ["t12"],
      vacancy: ["t12", "rent_roll"],
      rent_growth: [],
      expense_growth: [],
      taxes: [],
      insurance: [],
      renovation_premium: [],
      other: [],
    });
    expect(scorableGrid().map((r) => r.key)).toEqual([...STRESS_KEYS]);
    // The account's grid speaks for a row of either measure; a deal's own
    // grid for its row's: doors by the rent roll, dollars by the T-12.
    expect(marked(scorableGrid({ vacancyEconomic: false })).vacancy).toEqual(["rent_roll"]);
    expect(marked(scorableGrid({ vacancyEconomic: true })).vacancy).toEqual(["t12"]);
    // A deal whose screen kept no test reads its challenge as doors.
    const older = scoreDeal({ screenedAt: T, challenges: [vacancy] });
    expect(SCORABLE_SOURCES.filter((s) => older.scorable!.find((g) => g.key === "vacancy")!.by[s])).toEqual(["rent_roll"]);
  });

  it("follows the deal's own conditions: a plan deal, a vacancy the market decided", () => {
    const plan = marked(scorableGrid({ plan: true, vacancyIsPlanTarget: true }));
    expect(plan.noi).toEqual([]);
    expect(plan.vacancy).toEqual([]);
    expect(marked(scorableGrid({ vacancyHeldToMarket: true })).vacancy).toEqual([]);
    // The deal's record carries its own grid, titled as its test titles its rows.
    const r = scoreDeal({
      screenedAt: T,
      stressSnapshot: { v: STRESS_SNAPSHOT_V, readOn: "2026-10-01", rows: [{ key: "vacancy", title: "Occupancy today", verdict: "holds", om: 5, page: 2, evidence: { value: 5.8, label: "Rental vacancy, metro area", asOf: "2026-04-01", kind: "published", publisher: "Census Bureau" }, per: null, threshold: { value: 1.9, unit: "pts" }, worse: "higher" }] },
      challenges: [],
    });
    const vac = r.scorable!.find((x) => x.key === "vacancy")!;
    expect(vac.title).toBe("Occupancy today");
    expect(SCORABLE_SOURCES.filter((s) => vac.by[s])).toEqual([]);
  });

  it("agrees with what the scorer scores when every kind of evidence is in hand, and the grid's columns are the sources' order", () => {
    // The keys the "with every kind of later figure" case scores, and the two
    // decisions, are exactly the marked cells.
    const grid = marked(scorableGrid());
    const figureKeys = Object.entries(grid).filter(([, s]) => s.some((x) => x !== "outcome")).map(([k]) => k);
    expect(new Set(figureKeys)).toEqual(new Set(["vacancy", "noi", "basis"]));
    expect(Object.entries(grid).filter(([, s]) => s.includes("outcome")).map(([k]) => k).sort()).toEqual(["basis", "debt"]);
    const component = readFileSync(join(process.cwd(), "app/(app)/scorable-grid.tsx"), "utf8");
    const order = [...component.matchAll(/source: "(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual([...SCORABLE_SOURCES]);
  });
});
