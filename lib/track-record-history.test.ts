// The owner's three decisions of 2026-10-21 on the track record
// (lib/track-record): calibration beside right and wrong, display only; a
// Closed deal's own price a decision, never a trade; and every screen kept,
// so a scored row never vanishes when a deal is re-screened again.
import { describe, expect, it } from "vitest";
import type { Challenge } from "@/lib/anthropic/types";
import type { RentRollSummary, T12Summary } from "@/lib/actuals/types";
import type { StageChange } from "@/lib/stages";
import { STRESS_SNAPSHOT_V, WORSE_WHEN, snapshotThreshold, type StressSnapshot, type StressSnapshotRow } from "@/lib/stress-snapshot";
import {
  BASE_RATE_WHY,
  DECISION_SCORES,
  PURCHASE_IS_DECISION,
  RESCREEN_RULE,
  SCORED_BY,
  accountRecord,
  baseRateLine,
  calibrationCountsLine,
  capturedAt,
  capturedWords,
  decisionBadge,
  gapCaptured,
  recordLine,
  scoreDeal,
  type PriorScreenLike,
} from "./track-record";

const T = "2026-10-01T12:00:00Z";
const AFTER = "2026-11-05T09:00:00Z";

const t12: T12Summary = {
  collectedRent: 6_499_500,
  vacancyLoss: 650_500,
  otherIncome: 292_000,
  egi: 6_791_500,
  opex: [],
  totalOpex: 1_525_000,
  noi: 3_706_500,
  noiDerived: false,
};
// The T-12's economic vacancy, 650,500 over 7,150,000, scores only an
// economic row; a vacancy counted by doors is scored by the rent roll.
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

const row = (over: Partial<StressSnapshotRow> & Pick<StressSnapshotRow, "key">): StressSnapshotRow => ({
  title: over.key === "vacancy" ? "Stabilized vacancy" : over.key === "basis" ? "Basis" : "Row",
  verdict: "stretched",
  om: 6,
  page: 12,
  evidence: { value: 11, label: "Apartment occupancy, a rule of thumb", asOf: null, kind: "rule_of_thumb", publisher: "a rule of thumb" },
  per: null,
  threshold: snapshotThreshold(over.key),
  worse: WORSE_WHEN[over.key],
  ...over,
});
const snap = (...rows: StressSnapshotRow[]): StressSnapshot => ({ v: STRESS_SNAPSHOT_V, readOn: "2026-10-01", rows });
const laterT12 = { t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } };
const laterRoll = { rentRoll: { arrivedAt: AFTER, dated: "2026-10-31", summary: roll } };
// The roll's vacancy as the scorer reads it with no class, by area: 9.4%.
const ROLL_VAC = Math.round((1 - roll.sfWeightedOccupancy!) * 1000) / 10;

// ── 1. Calibration, beside right and wrong ──────────────────────────────

describe("calibration: how much of the gap the evidence opened the later figure covered — shown, never scored", () => {
  it("gapCaptured is (later − OM) / (evidence − OM), a whole percent, with where it landed", () => {
    expect(gapCaptured(6, 10, 8)).toEqual({ pct: 50, place: "between" });
    expect(gapCaptured(6, 10, 10)).toEqual({ pct: 100, place: "between" });
    expect(gapCaptured(6, 10, 6)).toEqual({ pct: 0, place: "between" });
    expect(gapCaptured(6, 10, 12)).toEqual({ pct: 150, place: "past" });
    expect(gapCaptured(6, 10, 5)).toEqual({ pct: -25, place: "om_side" });
    // A price falls, the evidence under the ask: the same arithmetic.
    expect(gapCaptured(274_000, 240_000, 250_000)).toEqual({ pct: 71, place: "between" });
    // No gap opened, or a figure missing: none.
    expect(gapCaptured(6, 6, 7)).toBeNull();
    expect(gapCaptured(null, 10, 7)).toBeNull();
    expect(gapCaptured(6, undefined, 7)).toBeNull();
    expect(gapCaptured(6, 10, Number.NaN)).toBeNull();
  });

  it("says it in words, clamped as the track is: past the evidence over 100%, the OM's side under 0", () => {
    expect(capturedWords({ pct: 30, place: "between" })).toBe("The later figure landed 30% of the way from the OM's figure to the evidence's.");
    expect(capturedWords({ pct: 340, place: "past" })).toBe("The later figure landed past the evidence's figure: the whole gap and more.");
    expect(capturedWords({ pct: 340, place: "past" })).not.toContain("340");
    expect(capturedWords({ pct: -40, place: "om_side" })).toBe("The later figure landed on the OM's side of its own figure, away from the evidence's: none of the gap.");
    // The track: the OM's figure at 25%, the evidence's at 75%, held inside.
    expect(capturedAt(0)).toEqual({ at: 25, clipped: false });
    expect(capturedAt(100)).toEqual({ at: 75, clipped: false });
    expect(capturedAt(50)).toEqual({ at: 50, clipped: false });
    expect(capturedAt(-25)).toEqual({ at: 12.5, clipped: false });
    expect(capturedAt(150)).toEqual({ at: 100, clipped: false });
    expect(capturedAt(300)).toEqual({ at: 100, clipped: true });
    expect(capturedAt(-80)).toEqual({ at: 0, clipped: true });
  });

  it("a scored flagged row carries it; a hold, a decision and an unscored row carry none — and the score is unchanged", () => {
    // The OM's 6.0% against the evidence's 11.0%; the roll's 9.4% covers 68% of the gap.
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], ...laterRoll });
    expect(r.rows[0]).toMatchObject({ outcome: "flag_right", landing: "right", captured: { pct: Math.round(((ROLL_VAC - 6) / (11 - 6)) * 100), place: "between" } });
    // A flag scored wrong still says how far the later figure went.
    const wrong = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy", om: ROLL_VAC, evidence: { value: 12, label: "x", asOf: null, kind: "rule_of_thumb", publisher: "" } })), challenges: [], ...laterRoll });
    expect(wrong.rows[0]).toMatchObject({ outcome: "flag_wrong", captured: { pct: 0, place: "between" } });
    const held = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy", verdict: "holds" })), challenges: [], ...laterRoll });
    expect(held.rows[0].outcome).toBe("false_hold");
    expect(held.rows[0].captured ?? null).toBeNull();
    const decided = scoreDeal({
      screenedAt: T,
      stressSnapshot: snap(row({ key: "basis", om: 50_000_000, evidence: { value: 44_000_000, label: "x", asOf: null, kind: "rule_of_thumb", publisher: "" } })),
      challenges: [],
      stage: "dead",
      history: [{ stage: "dead", at: AFTER, outcome: { reason: "price", trade: null } }],
    });
    expect(decided.rows[0].captured ?? null).toBeNull();
  });

  it("the account lists each flagged row's capture by where it landed — counts, never a share or an average", () => {
    const deal = (om: number, value: number) =>
      scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy", om, evidence: { value, label: "x", asOf: null, kind: "rule_of_thumb", publisher: "" } })), challenges: [], ...laterRoll });
    const r = accountRecord([deal(6, 11), deal(6, 8), deal(4, 3)]);
    expect(r.calibration.map((c) => c.captured.place)).toEqual(["between", "past", "om_side"]);
    expect(r.capturedCounts).toEqual({ between: 1, past: 1, omSide: 1 });
    expect(calibrationCountsLine(r.capturedCounts)).toBe(
      "Of 3 flagged rows scored on figures: 1 landed between the OM's figure and the evidence's, 1 past the evidence's, 1 on the OM's side.",
    );
    expect(calibrationCountsLine({ between: 0, past: 0, omSide: 0 })).toBeNull();
  });

  it("the base rate: every scored row whose later figure landed past the OM's on the buyer's bad side, whatever its verdict — a share only from five, with its count", () => {
    const deal = (verdict: StressSnapshotRow["verdict"], om: number) =>
      scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy", verdict, om })), challenges: [], ...laterRoll });
    // Past the 6.0% by more than the margin: a flag borne out and a false hold alike.
    const four = accountRecord([deal("stretched", 6), deal("holds", 6), deal("stretched", ROLL_VAC), deal("holds", ROLL_VAC)]);
    expect(four).toMatchObject({ scored: 4, pastOm: 2, pastOmPct: null });
    expect(baseRateLine(four)).toBe(
      "Base rate: 2 of 4 scored rows, whatever the test's verdict, landed past the OM's figure on the buyer's bad side by more than the row's margin. No share is printed under 5 scored rows.",
    );
    const five = accountRecord([deal("stretched", 6), deal("holds", 6), deal("stretched", ROLL_VAC), deal("holds", ROLL_VAC), deal("stretched", 6)]);
    expect(five).toMatchObject({ scored: 5, pastOm: 3, pastOmPct: 60 });
    expect(baseRateLine(five)).toBe(
      "Base rate: 3 of 5 scored rows landed past the OM's figure on the buyer's bad side by more than the row's margin (60%), whatever the test's verdict.",
    );
    // The right/wrong shares are as before: the base rate changes no score.
    expect(five).toMatchObject({ right: 3, wrong: 2, shares: { rightPct: 60, wrongPct: 40 } });
    expect(baseRateLine(accountRecord([]))).toBeNull();
    expect(BASE_RATE_WHY).toContain("a flag that proves right says less");
  });
});

// ── 2. A Closed deal's own price is a decision, not a trade ───────────────

describe("a Closed deal's own price is the buyer's decision, counted apart; a Dead deal's reported trade still scores the price", () => {
  const basisRow = row({ key: "basis", om: 50_000_000, evidence: { value: 44_000_000, label: "Recorded sales, median", asOf: "2026-09-01", kind: "published", publisher: "public records" } });
  const ended = (stage: "closed" | "dead", price: number, date: string | null = "2026-10-20", reportedAt = AFTER) => ({
    askingPrice: 50_000_000,
    stage,
    history: [{ stage, at: reportedAt, outcome: { reason: null, trade: { price, buyer: null, date, reportedBy: "Jane", reportedAt } } }] as StageChange[],
  });

  it("on a Closed deal the price is a decision on the test's side or against it, never right or wrong, in no share", () => {
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(basisRow), challenges: [], ...ended("closed", 45_000_000) });
    expect(r.rows[0]).toMatchObject({ landing: "right", decision: true, purchase: true, outcome: null, figures: null });
    expect(r.rows[0].captured ?? null).toBeNull();
    expect(r.rows[0].text).toBe(
      "Basis: the test read the OM's $50.00M as stretched, set against recorded sales, median at $44.00M (Sep 1, 2026); you bought it at $45.00M on Oct 20, 2026 — more than the row's 5% margin under the OM's figure: your own price, negotiated with the screen in hand, so a decision on the test's side, counted apart and in no share.",
    );
    expect(r.evidence).toEqual([{ source: "outcome", label: "You bought it at $45.00M on Oct 20, 2026: your own price, a decision (recorded Nov 5, 2026)", at: AFTER, purchase: true }]);
    // About the ask: against the flag; for a hold, on its side.
    const near = scoreDeal({ screenedAt: T, stressSnapshot: snap(basisRow), challenges: [], ...ended("closed", 49_000_000) });
    expect(near.rows[0]).toMatchObject({ landing: "wrong", decision: true, purchase: true });
    expect(near.rows[0].text).toContain("within the row's 5% margin of the OM's figure, or over it: your own price, negotiated with the screen in hand, so a decision against the flag");
    const held = scoreDeal({ screenedAt: T, stressSnapshot: snap({ ...basisRow, verdict: "holds" }), challenges: [], ...ended("closed", 49_000_000) });
    expect(held.rows[0]).toMatchObject({ landing: "right", decision: true });
    expect(decisionBadge({ ...r.rows[0], verdict: "stretched" })).toBe("Your own price, on the test's side");
    expect(decisionBadge({ ...near.rows[0], verdict: "stretched" })).toBe("Your own price, against the flag");
    expect(decisionBadge({ landing: "wrong", verdict: "holds", purchase: true })).toBe("Your own price, against the hold");
    // The account counts it apart: no scored row, no share, said as the buyer's price.
    const acct = accountRecord([r, near]);
    expect(acct).toMatchObject({ scored: 0, decisions: 2, purchases: 2, shares: null, pastOm: 0 });
    expect(acct.byKey).toEqual([]);
    expect(recordLine(acct)).toContain("2 more rows were decisions (a Closed deal's own price), counted apart and in no share.");
  });

  it("the same price on a Dead deal is a third party's trade, and scores the row", () => {
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(basisRow), challenges: [], ...ended("dead", 45_000_000) });
    expect(r.rows[0]).toMatchObject({ landing: "right", outcome: "flag_right" });
    expect(r.rows[0].decision).toBeUndefined();
    expect(r.evidence[0].label).toBe("The building traded at $45.00M on Oct 20, 2026, reported by Jane (recorded Nov 5, 2026)");
    expect(accountRecord([r])).toMatchObject({ scored: 1, decisions: 0, purchases: 0 });
  });

  it("a challenge from an older screen reads a Closed deal's price as a decision on its side, counted apart", () => {
    const basis: Challenge = { assumption: "Asking price of $274k a unit", severity: "high", challenge: "", question: "", key: "basis", omFigure: 274_000, altFigure: 240_000, altBasis: "the OM's own sale comps" };
    const r = scoreDeal({ screenedAt: T, challenges: [basis], ...ended("closed", 60_000_000), askingPrice: 65_760_000 });
    expect(r.rows[0]).toMatchObject({ landing: "between", decision: true, purchase: true, figures: null });
    expect(r.rows[0].text).toContain("you bought it at $60.00M on Oct 20, 2026, $250k on the OM figure's basis — between the two: your own price, negotiated with the screen in hand, so a decision, counted apart and in no share.");
    expect(accountRecord([r])).toMatchObject({ challenges: { scored: 0 }, decisions: 1, purchases: 1 });
  });

  it("a purchase closed on or before the verdict's day is not counted, and says why", () => {
    const r = scoreDeal({ screenedAt: T, stressSnapshot: snap(basisRow), challenges: [], ...ended("closed", 45_000_000, "2026-05-01") });
    expect(r.rows[0].landing).toBe("unscored");
    expect(r.notScored).toEqual([
      "The purchase (you bought it at $45.00M on May 1, 2026) was recorded Nov 5, 2026, after the screen, but it closed on or before the verdict's day (Oct 1, 2026): a price agreed before the screen's call, only recorded later, so it is not counted.",
    ]);
  });

  it("the words every surface reads say it", () => {
    expect(SCORED_BY).toContain("the price by a reported trade on a Dead deal.");
    expect(DECISION_SCORES).toContain("a Closed deal's own price answers the price");
    expect(PURCHASE_IS_DECISION).toContain("negotiated with the screen in hand");
  });
});

// ── 3. Every screen kept ───────────────────────────────────────────────

describe("every screen kept: a row scored against an earlier screen never vanishes on a later re-screen", () => {
  // Three screens: Sep 1, Sep 15, and the current Oct 1. A rent roll dated
  // Sep 5 arrived Sep 10, between the first two; the Sep 15 screen read it.
  const S2 = "2026-09-01T12:00:00Z";
  const S1 = "2026-09-15T12:00:00Z";
  const ROLL_AT = "2026-09-10T09:00:00Z";
  const screen = (at: string, om: number, measure?: "economic"): PriorScreenLike => ({ verdict: { generatedAt: at, stressSnapshot: snap(row({ key: "vacancy", om, ...(measure ? { measure } : {}) })) } });
  const rollBetween = { rentRoll: { arrivedAt: ROLL_AT, dated: "2026-09-05", summary: roll } };

  it("with only the last screen kept (deals.prior_screen), the first screen's scored row is lost; with every screen kept it stays", () => {
    const lost = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], priorScreen: screen(S1, 7), ...rollBetween });
    expect(lost.rows.map((x) => x.landing)).toEqual(["unscored"]);
    const kept = scoreDeal({
      screenedAt: T,
      stressSnapshot: snap(row({ key: "vacancy" })),
      challenges: [],
      priorScreen: screen(S1, 7),
      // In any order: the scorer reads them newest first.
      priorScreens: [screen(S1, 7), screen(S2, 5)],
      ...rollBetween,
    });
    expect(kept.rows.map((x) => [x.key, x.landing, x.priorScreenedOn ?? null])).toEqual([["vacancy", "right", "Sep 1, 2026"]]);
    expect(kept.rows[0].text.startsWith("Stabilized vacancy (the screen of Sep 1, 2026): the test read the OM's 5.0% as stretched")).toBe(true);
    expect(kept.prior).toEqual({ screenedAt: S1, screenedOn: "Sep 15, 2026" });
    expect(kept.priors).toEqual([
      { screenedAt: S1, screenedOn: "Sep 15, 2026" },
      { screenedAt: S2, screenedOn: "Sep 1, 2026" },
    ]);
    expect(kept.evidence.map((e) => e.label)).toEqual(["Rent roll as of Sep 5, 2026 (added Sep 10, 2026, after the screen of Sep 1, 2026 and before the screen of Sep 15, 2026)"]);
    // The current screen's refusal names the screen it is scored against.
    expect(kept.notScored[0]).toBe("Rent roll as of Sep 5, 2026 was on the deal before this screen (added Sep 10, 2026): this screen read it, so it is scored against the screen of Sep 1, 2026 instead.");
    // The account counts the row once.
    expect(accountRecord([kept])).toMatchObject({ scored: 1, right: 1 });
  });

  it("a screen kept in both places is read once, by its verdict's stamp", () => {
    const once = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], priorScreen: screen(S2, 5), priorScreens: [screen(S2, 5), screen(S2, 5)], ...rollBetween });
    expect(once.rows).toHaveLength(1);
    expect(once.priors).toHaveLength(1);
    expect(once.evidence).toHaveLength(1);
    // A kept screen stamped at or after the current one is not an earlier screen.
    const later = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy" })), challenges: [], priorScreens: [screen(T, 5), screen("2026-10-02T00:00:00Z", 5)], ...rollBetween });
    expect(later.priors).toEqual([]);
  });

  it("one piece of evidence scores a key once, by the latest screen made before it; two pieces score two screens' rows", () => {
    // The T-12 arrived after every screen; the rent roll between the first
    // two. The Sep 15 screen and this one read the OM's vacancy as economic,
    // which only a T-12 scores; the Sep 1 screen read it by doors, which only
    // a rent roll does.
    const r = scoreDeal({
      screenedAt: T,
      stressSnapshot: snap(row({ key: "vacancy", measure: "economic" })),
      challenges: [],
      priorScreens: [screen(S2, 5), screen(S1, 7, "economic")],
      ...rollBetween,
      ...laterT12,
    });
    // The current row on the T-12 (the Sep 15 row, also before it, is not
    // counted again); the Sep 1 row on the rent roll, which no newer row reads.
    expect(r.rows.map((x) => [x.key, x.later?.source, x.priorScreenedOn ?? null])).toEqual([
      ["vacancy", "t12", null],
      ["vacancy", "rent_roll", "Sep 1, 2026"],
    ]);
    expect(accountRecord([r]).scored).toBe(2);
    // Without the roll, the T-12 is the current screen's alone.
    const one = scoreDeal({ screenedAt: T, stressSnapshot: snap(row({ key: "vacancy", measure: "economic" })), challenges: [], priorScreens: [screen(S2, 5), screen(S1, 7, "economic")], ...laterT12 });
    expect(one.rows.map((x) => x.priorScreenedOn ?? null)).toEqual([null]);
  });

  it("the re-screen rule says every screen is kept", () => {
    expect(RESCREEN_RULE).toContain("each re-screen keeps the screen it replaces, every one");
    expect(RESCREEN_RULE).toContain("against the latest screen made before it");
  });
});
