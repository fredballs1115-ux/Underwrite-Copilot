// The track record's two surfaces (2026-10-19): the deal page's "What came
// after the screen" card and the analytics page's "Track record" section,
// each drawn on records lib/track-record scored, linted for a11y and glued
// words, their markers unique across the app's sources.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Challenge } from "@/lib/anthropic/types";
import type { T12Summary } from "@/lib/actuals/types";
import { TrackRecordCard } from "@/app/(app)/deals/[id]/track-record-card";
import { TrackRecordSection } from "@/app/(app)/analytics/track-record";
import {
  ACCOUNT_VACANCY_NOTE,
  BASE_RATE_WHY,
  CALIBRATION_NOTE,
  CARD_SCOPE,
  PURCHASE_IS_DECISION,
  DOCUMENT_DATE_RULE,
  RECORD_NONE_LINE,
  RESCREEN_LINE,
  RESCREEN_RULE,
  TAX_INSURANCE_NOT_SCORED,
  TRADE_DATE_RULE,
  accountRecord,
  scorableGrid,
  scoreDeal,
  type DealRecord,
} from "./track-record";
import { ScorableGrid } from "@/app/(app)/scorable-grid";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { STRESS_SNAPSHOT_V, snapshotThreshold, type StressSnapshot, type StressSnapshotRow } from "./stress-snapshot";

const T = "2026-10-01T12:00:00Z";
const AFTER = "2026-11-05T09:00:00Z";
const vacancy: Challenge = { assumption: "Stabilized vacancy of 6%", severity: "high", challenge: "", question: "", key: "vacancy", omFigure: 6, altFigure: 9, altBasis: "a rule of thumb" };
const insurance: Challenge = { assumption: "Insurance at the seller's premium", severity: "medium", challenge: "", question: "", key: "insurance", omFigure: 300_000, altFigure: 400_000, altBasis: "the index's year" };
const noi: Challenge = { assumption: "Pro forma NOI of $4.0M", severity: "medium", challenge: "", question: "", key: "noi", omFigure: 4_000_000, altFigure: 3_600_000, altBasis: "the trailing year" };
const basis: Challenge = { assumption: "Asking price of $274k a unit", severity: "high", challenge: "", question: "", key: "basis", omFigure: 274_000, altFigure: 240_000, altBasis: "the comps" };
const older: Challenge = { assumption: "Exit cap of 5.25%", severity: "high", challenge: "", question: "" };
const t12: T12Summary = {
  collectedRent: 6_499_500,
  vacancyLoss: 650_500,
  otherIncome: 0,
  egi: 6_499_500,
  opex: [{ key: "insurance", label: "Insurance", amount: 385_000, page: "" }],
  totalOpex: 385_000,
  noi: 3_706_500,
  noiDerived: false,
};

const withLater = (): DealRecord =>
  scoreDeal({
    screenedAt: T,
    challenges: [vacancy, noi, insurance, basis, older],
    t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 },
    stage: "dead",
    history: [{ stage: "dead", at: AFTER, outcome: { reason: "price", trade: null } }],
  });

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

// The stress test as it stood at a verdict (lib/stress-snapshot): a vacancy
// read stretched against a rule of thumb, and an NOI that held.
const vacancyRow: StressSnapshotRow = {
  key: "vacancy",
  title: "Stabilized vacancy",
  verdict: "stretched",
  om: 6,
  page: 12,
  evidence: { value: 9, label: "Apartment occupancy, a rule of thumb", asOf: null, kind: "rule_of_thumb", publisher: "a rule of thumb" },
  per: null,
  threshold: snapshotThreshold("vacancy"),
  worse: "higher",
};
const noiRow: StressSnapshotRow = {
  key: "noi",
  title: "NOI",
  verdict: "holds",
  om: 4_000_000,
  page: 5,
  evidence: { value: 3_950_000, label: "The OM's own in-place NOI", asOf: null, kind: "om_internal", publisher: "the memorandum" },
  per: null,
  threshold: snapshotThreshold("noi"),
  worse: "lower",
};
const snapshot = (rows: StressSnapshotRow[]): StressSnapshot => ({ v: STRESS_SNAPSHOT_V, readOn: "2026-10-01", rows });
const snapDeal = (opts: { only?: "vacancy" } = {}): DealRecord =>
  scoreDeal({
    screenedAt: T,
    stressSnapshot: snapshot(opts.only ? [vacancyRow] : [vacancyRow, noiRow]),
    challenges: [vacancy, noi],
    t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 },
  });

describe("TrackRecordCard — what came after the screen, on the deal page", () => {
  it("draws the evidence, a row a scored challenge with its three figures and its landing, and folds the unscored", () => {
    const out = html(React.createElement(TrackRecordCard, { record: withLater() }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("What came after the screen");
    expect(text).toContain("Screened Oct 1, 2026.");
    expect(text).toContain("T-12 to Oct 31, 2026 (added Nov 5, 2026)");
    expect(text).toContain("Moved to Dead on price (Nov 5, 2026)");
    expect(out).toContain('data-landing="screen_side"');
    expect(out).toContain('data-landing="between"');
    expect(text).toContain("Screen's side");
    expect(text).toContain("Between");
    // The three figures of a scored row, in the key's own unit.
    expect(text).toContain("6.0%");
    expect(text).toContain("9.0%");
    expect(text).toContain("9.1%");
    expect(text).toContain("$3.71M");
    // The decision row carries no figures but its sentence.
    expect(text).toContain("a decision on the screen's side, not a figure");
    expect(text).toContain("2 challenges not scored");
    expect(text).toContain("Exit cap: nothing that arrived after the screen speaks to it.");
    // What it scores against, and why the insurance challenge is not scored.
    const words = text.replace(/&#x27;/g, "'");
    expect(words).toContain(CARD_SCOPE);
    expect(words).toContain(TAX_INSURANCE_NOT_SCORED);
    expect(out).toContain('data-qa="track-record-tax-insurance"');
    expect(words).toContain("Insurance: a seller's T-12 cannot show a new owner's premium");
    // …and no tax or insurance line is said where no such challenge is.
    const noTax = html(React.createElement(TrackRecordCard, { record: scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } }) }));
    expect(noTax).not.toContain('data-qa="track-record-tax-insurance"');
  });

  it("draws the stress test's rows: the test's verdict, the evidence figure, the outcome in words, and the deal's counts with no share under five", () => {
    const out = html(React.createElement(TrackRecordCard, { record: snapDeal() }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out).replace(/&#x27;/g, "'");
    expect(gluedWords(text)).toEqual([]);
    expect(out).toContain('data-landing="right"');
    expect(out).toContain('data-outcome="flag_right"');
    expect(out).toContain('data-landing="wrong"');
    expect(out).toContain('data-outcome="false_hold"');
    expect(text).toContain("Right: the flag stood");
    expect(text).toContain("Wrong: a false hold");
    expect(text).toContain("· the test's verdict: stretched");
    expect(text).toContain("· the test's verdict: holds");
    // The middle column is the evidence's figure, not the challenger's.
    expect(text).toContain("Evidence");
    expect(text).not.toContain("Screen's side");
    expect(text).toContain("$3.95M");
    expect(text).toContain("2 stress-test rows scored on this deal: 1 right, 1 wrong, 1 of them a false hold. No share is printed under 5 scored rows.");
    expect(out).toContain('data-qa="track-record-summary"');
    expect(out).not.toContain('data-qa="track-record-not-snapshotted"');
  });

  it("says a screen's rows were not snapshotted where its verdict kept none, and scores its challenges", () => {
    const out = html(React.createElement(TrackRecordCard, { record: withLater() }));
    const text = visibleText(out).replace(/&#x27;/g, "'");
    expect(out).toContain('data-qa="track-record-not-snapshotted"');
    expect(text).toContain(
      "This screen (Oct 1, 2026) was made before the stress test was kept with its verdict, so its rows were not snapshotted: its challenges are scored on the challenger's own figures instead.",
    );
    expect(out).not.toContain('data-qa="track-record-summary"');
  });

  it("draws the refusal where a document uploaded after the screen is dated before it: history, only uploaded later", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-09-30", summary: t12 } });
    expect(r.evidence).toEqual([]);
    const out = html(React.createElement(TrackRecordCard, { record: r }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out);
    expect(gluedWords(text)).toEqual([]);
    expect(out).not.toContain('data-qa="track-record-evidence"');
    expect(text).toContain("Nothing that arrived speaks to a challenge with figures of its own, so no row is scored.");
    expect(text.replace(/&#x27;/g, "'")).toContain(
      "T-12 to Sep 30, 2026 was added Nov 5, 2026, after the screen, but its period ended on or before the verdict (Oct 1, 2026): it is history the screen could have been handed, only uploaded later, so it is not scored.",
    );
  });

  it("draws what will score what where nothing arrived after a verdict, and nothing with no record or no verdict stamp", () => {
    expect(html(React.createElement(TrackRecordCard, { record: null }))).toBe("");
    expect(html(React.createElement(TrackRecordCard, { record: scoreDeal({ screenedAt: null, challenges: [vacancy] }) }))).toBe("");
    const before = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: "2026-09-01T00:00:00Z", dated: null, summary: t12 } });
    expect(before.notScored).toHaveLength(1);
    const out = html(React.createElement(TrackRecordCard, { record: before }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out).replace(/&#x27;/g, "'");
    expect(gluedWords(text)).toEqual([]);
    expect(out).toContain('data-state="waiting"');
    expect(text).toContain("Screened Oct 1, 2026. Nothing has arrived since, so no row is scored yet.");
    expect(out).toContain('data-qa="scorable-grid"');
    expect(text).toContain(RESCREEN_LINE);
    // The grid is the deal's own record's, drawn as data: a row a key, a mark
    // a kind of evidence that can score it.
    expect((out.match(/<tr [^>]*data-row="/g) ?? []).length).toBe(before.scorable!.length);
    expect((out.match(/data-scores="/g) ?? []).length).toBe(before.scorable!.reduce((n, r) => n + Object.values(r.by).filter(Boolean).length, 0));
    expect(out).toContain('data-row="vacancy"><th scope="row"');
    // Nothing is claimed: no row, no share, no evidence list; the read T-12's refusal stays.
    expect(out).not.toContain('data-qa="track-record-rows"');
    expect(out).not.toContain('data-qa="track-record-evidence"');
    expect(text).not.toMatch(/\d+%/);
    expect(text).toContain("T-12 (period not stated) was on the deal before the screen");
  });

  it("draws a decision's badge in a neutral tone, never a verdict's green or red; its words unchanged", () => {
    const out = html(React.createElement(TrackRecordCard, { record: withLater() }));
    const badge = out.match(/<span class="([^"]*)"[^>]*data-decision=""[^>]*>([^<]*)<\/span>/);
    expect(badge).not.toBeNull();
    expect(badge![1]).toContain("text-muted");
    expect(badge![1]).not.toMatch(/text-pass|text-kill/);
    expect(badge![2]).toBe("Screen&#x27;s side");
  });

  it("draws a flagged row's capture of its gap on a track, said in words, and a Closed deal's own price as a decision in a neutral tone", () => {
    // The OM's 6.0% against the evidence's 9.0%; the T-12's 9.1% went past it.
    const past = html(React.createElement(TrackRecordCard, { record: snapDeal({ only: "vacancy" }) }));
    expect(a11yIssues(past)).toEqual([]);
    const text = visibleText(past).replace(/&#x27;/g, "'");
    expect(gluedWords(text)).toEqual([]);
    expect(past).toContain('data-qa="track-record-capture" data-place="past"');
    for (const bar of ["capture-om", "capture-evidence", "capture-later", "capture-span"]) expect(past).toContain(`data-bar="${bar}"`);
    expect(text).toContain("The later figure landed past the evidence's figure: the whole gap and more.");
    expect(text).toContain(CALIBRATION_NOTE);
    // The score is unchanged beside it.
    expect(text).toContain("Right: the flag stood");
    // A hold draws no capture.
    expect(html(React.createElement(TrackRecordCard, { record: snapDeal() })).match(/data-qa="track-record-capture"/g)).toHaveLength(1);
    // A Closed deal's own price: a decision, neutral, said as the buyer's.
    const basisRow: StressSnapshotRow = { ...vacancyRow, key: "basis", title: "Basis", om: 50_000_000, evidence: { value: 44_000_000, label: "Recorded sales, median", asOf: null, kind: "published", publisher: "public records" }, threshold: snapshotThreshold("basis"), worse: "lower" };
    const bought = scoreDeal({
      screenedAt: T,
      stressSnapshot: snapshot([basisRow]),
      challenges: [],
      askingPrice: 50_000_000,
      stage: "closed",
      history: [{ stage: "closed", at: AFTER, outcome: { reason: null, trade: { price: 45_000_000, buyer: null, date: null, reportedBy: null, reportedAt: AFTER } } }],
    });
    const out = html(React.createElement(TrackRecordCard, { record: bought }));
    expect(a11yIssues(out)).toEqual([]);
    const words = visibleText(out).replace(/&#x27;/g, "'");
    expect(gluedWords(words)).toEqual([]);
    const badge = out.match(/<span class="([^"]*)"[^>]*data-decision=""[^>]*>([^<]*)<\/span>/);
    expect(badge![1]).toContain("text-muted");
    expect(badge![1]).not.toMatch(/text-pass|text-kill/);
    expect(badge![2].replace(/&#x27;/g, "'")).toBe("Your own price, on the test's side");
    expect(words).toContain(PURCHASE_IS_DECISION);
    expect(words).toContain("You bought it at $45.00M: your own price, a decision (recorded Nov 5, 2026)");
    expect(out).not.toContain('data-qa="track-record-summary"');
    expect(out).not.toContain('data-qa="track-record-capture"');
  });

  it("prints a vacancy row's three figures each as a share vacant", () => {
    const text = visibleText(html(React.createElement(TrackRecordCard, { record: snapDeal({ only: "vacancy" }) })));
    expect(text).toContain("6.0% vacant");
    expect(text).toContain("9.0% vacant");
    expect(text).toContain("9.1% vacant");
  });

  it("says no row is scored where the later evidence speaks to no challenge with figures", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [older], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } });
    const out = html(React.createElement(TrackRecordCard, { record: r }));
    expect(a11yIssues(out)).toEqual([]);
    expect(visibleText(out)).toContain("Nothing that arrived speaks to a challenge with figures of its own, so no row is scored.");
  });
});

describe("TrackRecordSection — the account's record on /analytics, in three states", () => {
  it("zero: no record, and none claimed", () => {
    const out = html(React.createElement(TrackRecordSection, { record: accountRecord([]) }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out);
    expect(gluedWords(text)).toEqual([]);
    expect(out).toContain('data-state="none"');
    expect(text).toContain(RECORD_NONE_LINE);
    expect(text).toContain("0 deals tested · 0 with later evidence · 0 rows scored");
    expect(out).not.toContain("data-bar=");
    // The account's record holds every stated stabilized vacancy back as the
    // market's, which a deal's own page does only where the market decided:
    // said where the record is drawn (audit M5).
    expect(text.replace(/&#x27;/g, "'")).toContain(ACCOUNT_VACANCY_NOTE);
    // What a document must be to score, a trade's own date, and what no document scores.
    expect(text.replace(/&#x27;/g, "'")).toContain(`${DOCUMENT_DATE_RULE} ${TRADE_DATE_RULE} ${TAX_INSURANCE_NOT_SCORED}`);
    expect(text.replace(/&#x27;/g, "'")).toContain(RESCREEN_RULE);
    // Nothing scored: the grid of what will score what, not words alone.
    expect(out).toContain('data-qa="scorable-grid"');
    expect(text).toContain(RESCREEN_LINE);
  });

  it("ScorableGrid: a row a stress-test assumption by its title, a column a kind of later evidence, a mark the scorer can make", () => {
    const rows = scorableGrid();
    const out = html(React.createElement(ScorableGrid, { rows }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out);
    expect(gluedWords(text)).toEqual([]);
    expect(out).toMatch(/<caption[^>]*>What will score what<\/caption>/);
    for (const h of ["T-12", "Rent roll", "Decision", "Trade"]) expect(out).toContain(`scope="col" class="w-16 px-1 py-1 text-center font-medium text-muted">${h}</th>`);
    for (const r of rows) expect(out).toContain(`data-row="${r.key}"><th scope="row" class="py-1 pr-2 text-left font-normal">${r.title.replace(/'/g, "&#x27;")}</th>`);
    // Each marked cell says so to a screen reader; an empty one says nothing scores it.
    const marks = rows.reduce((n, r) => n + Object.values(r.by).filter(Boolean).length, 0);
    expect(marks).toBeGreaterThan(0);
    expect((out.match(/can score it/g) ?? []).length).toBe(marks);
    expect((out.match(/>nothing</g) ?? []).length).toBe(rows.length * 4 - marks);
    expect(out).toContain('data-row="noi"');
    expect(out).toMatch(/data-row="noi">[\s\S]*?data-scores="t12"/);
    expect(html(React.createElement(ScorableGrid, { rows: [] }))).toBe("");
  });

  it("few: the counts, a bar a key, and 'a start, not a record' with no share", () => {
    const fewer = accountRecord([scoreDeal({ screenedAt: T, challenges: [vacancy, noi], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } })]);
    const few = html(React.createElement(TrackRecordSection, { record: fewer }));
    expect(a11yIssues(few)).toEqual([]);
    const text = visibleText(few);
    expect(gluedWords(text)).toEqual([]);
    expect(few).toContain('data-state="start"');
    expect(text).toContain("1 deal tested · 1 with later evidence · 2 rows scored");
    expect(text).toContain("2 challenges scored from screens whose stress test was not kept are a start, not a record: no share is printed under 5.");
    expect(text).not.toMatch(/\d+%/);
    // Under the floor, a dot a scored row in its tone, never a share bar.
    expect(few).not.toContain("data-bar=");
    expect((few.match(/data-dot="record-screen"/g) ?? []).length).toBe(1);
    expect((few.match(/data-dot="record-between"/g) ?? []).length).toBe(1);
    expect(few).not.toContain('data-dot="record-om"');
    expect(text).toContain("Under 5 scored rows an assumption draws a dot a row, never a bar.");
    expect(few).not.toContain('data-qa="scorable-grid"');
    // A decision is no scored row: withLater's basis row is the Dead
    // decision, counted apart, so its deal alone is two scored rows.
    const decided = html(React.createElement(TrackRecordSection, { record: accountRecord([withLater()]) }));
    expect(decided).toContain('data-state="start"');
    expect(visibleText(decided)).toContain("1 deal tested · 1 with later evidence · 3 rows answered, 1 of them a decision · 2 scored");
    // Four scored rows is still under the floor: no share.
    const four = html(
      React.createElement(TrackRecordSection, {
        record: accountRecord([withLater(), scoreDeal({ screenedAt: T, challenges: [vacancy, noi], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } })]),
      }),
    );
    expect(four).toContain('data-state="start"');
    expect(visibleText(four)).not.toMatch(/\d+%/);
  });

  it("enough: the shares, said once in the line, each with its count", () => {
    const record = accountRecord([withLater(), withLater(), scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: "2026-10-31", summary: t12 } })]);
    const out = html(React.createElement(TrackRecordSection, { record }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out);
    expect(gluedWords(text)).toEqual([]);
    expect(out).toContain('data-state="record"');
    // The two Dead decisions are said apart, never in the shares.
    expect(text.replace(/&#x27;/g, "'")).toContain(
      "5 challenges from 3 deals scored, from screens whose stress test was not kept: 3 of 5 challenges on the screen's side (60%), 0 of 5 challenges on the OM's (0%), 2 of 5 challenges between (40%). 2 more rows were decisions (Dead, and why), counted apart and in no share.",
    );
    // Each key holds under five rows, so each draws dots: 3 and 2.
    expect((out.match(/data-dot="record-screen"/g) ?? []).length).toBe(3);
    expect((out.match(/data-dot="record-between"/g) ?? []).length).toBe(2);
    expect(text).toContain("3 screen · 0 OM");
    expect(text).toContain("0 screen · 0 OM · 2 between");
  });

  it("the stress test's rows: right and wrong in words beside the bar, a share only from five, with its count", () => {
    const four = accountRecord([snapDeal(), snapDeal()]);
    expect(four).toMatchObject({ scored: 4, right: 2, wrong: 2, falseHolds: 2, shares: null });
    const few = html(React.createElement(TrackRecordSection, { record: four }));
    expect(few).toContain('data-state="start"');
    expect(visibleText(few)).toContain("4 scored stress-test rows are a start, not a record: no share is printed under 5.");
    expect(visibleText(few)).not.toMatch(/\d+%/);
    const five = accountRecord([snapDeal(), snapDeal(), snapDeal({ only: "vacancy" })]);
    const out = html(React.createElement(TrackRecordSection, { record: five }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out);
    expect(gluedWords(text)).toEqual([]);
    expect(out).toContain('data-state="record"');
    expect(text).toContain("5 stress-test rows from 3 deals scored: 3 of 5 rows right (60%), 2 of 5 rows wrong (40%), 2 of them false holds.");
    expect((out.match(/data-dot="record-right"/g) ?? []).length).toBe(3);
    expect((out.match(/data-dot="record-wrong"/g) ?? []).length).toBe(2);
    expect(text).toContain("3 right · 0 wrong");
    expect(text).toContain("0 right · 2 wrong");
    // A key of five scored rows draws its bar.
    const bar = accountRecord([snapDeal({ only: "vacancy" }), snapDeal({ only: "vacancy" }), snapDeal({ only: "vacancy" }), snapDeal({ only: "vacancy" }), snapDeal({ only: "vacancy" })]);
    const barred = html(React.createElement(TrackRecordSection, { record: bar }));
    expect(barred).toContain('data-bar="record-right"');
    expect(barred).not.toContain("data-dot=");
    expect(a11yIssues(barred)).toEqual([]);
  });

  it("draws the base rate and each flagged row's capture beside the record, display only, with the base rate's share only from five", () => {
    const four = accountRecord([snapDeal(), snapDeal()]);
    const few = html(React.createElement(TrackRecordSection, { record: four }));
    expect(a11yIssues(few)).toEqual([]);
    const fewText = visibleText(few).replace(/&#x27;/g, "'");
    expect(gluedWords(fewText)).toEqual([]);
    expect(few).toContain('data-qa="track-record-base-rate"');
    expect(fewText).toContain("Base rate: 4 of 4 scored rows, whatever the test's verdict, landed past the OM's figure on the buyer's bad side by more than the row's margin. No share is printed under 5 scored rows.");
    expect(fewText).toContain(BASE_RATE_WHY);
    // Each flagged row a tick on one track, counted in words, never a share.
    expect(few).toContain('data-qa="track-record-calibration"');
    expect((few.match(/data-bar="calibration-row"/g) ?? []).length).toBe(2);
    expect(fewText).toContain("Of 2 flagged rows scored on figures: 0 landed between the OM's figure and the evidence's, 2 past the evidence's, 0 on the OM's side.");
    expect(fewText).toContain(CALIBRATION_NOTE);
    expect(fewText).not.toMatch(/\d+%/);
    const five = html(React.createElement(TrackRecordSection, { record: accountRecord([snapDeal(), snapDeal(), snapDeal({ only: "vacancy" })]) }));
    expect(visibleText(five).replace(/&#x27;/g, "'")).toContain(
      "Base rate: 5 of 5 scored rows landed past the OM's figure on the buyer's bad side by more than the row's margin (100%), whatever the test's verdict.",
    );
    // Nothing scored on a stress-test row: neither is drawn.
    const none = html(React.createElement(TrackRecordSection, { record: accountRecord([withLater()]) }));
    expect(none).not.toContain('data-qa="track-record-base-rate"');
    expect(none).not.toContain('data-qa="track-record-calibration"');
  });

  it("its bar markers are its own across the app's sources", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(join(process.cwd(), "app"));
    // The markers are the section's `DOTS` table, a bar's segment and a dot alike.
    for (const marker of ["record-right", "record-wrong", "record-screen", "record-between", "record-om"]) {
      const holders = files.filter((f) => readFileSync(f, "utf8").includes(`"${marker}"`));
      expect(holders.map((f) => f.replace(process.cwd(), "")), marker).toEqual(["/app/(app)/analytics/track-record.tsx"]);
    }
    const landing = files.filter((f) => readFileSync(f, "utf8").includes("data-landing="));
    expect(landing.map((f) => f.replace(process.cwd(), ""))).toEqual(["/app/(app)/deals/[id]/track-record-card.tsx"]);
  });
});
