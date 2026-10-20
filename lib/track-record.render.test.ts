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
import { ACCOUNT_VACANCY_NOTE, RECORD_NONE_LINE, accountRecord, scoreDeal, type DealRecord } from "./track-record";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const T = "2026-10-01T12:00:00Z";
const AFTER = "2026-10-05T09:00:00Z";
const vacancy: Challenge = { assumption: "Stabilized vacancy of 6%", severity: "high", challenge: "", question: "", key: "vacancy", omFigure: 6, altFigure: 9, altBasis: "a rule of thumb" };
const insurance: Challenge = { assumption: "Insurance at the seller's premium", severity: "medium", challenge: "", question: "", key: "insurance", omFigure: 300_000, altFigure: 400_000, altBasis: "the index's year" };
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
    challenges: [vacancy, insurance, basis, older],
    t12: { arrivedAt: AFTER, dated: "2026-09-30", summary: t12 },
    stage: "dead",
    history: [{ stage: "dead", at: AFTER, outcome: { reason: "price", trade: null } }],
  });

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("TrackRecordCard — what came after the screen, on the deal page", () => {
  it("draws the evidence, a row a scored challenge with its three figures and its landing, and folds the unscored", () => {
    const out = html(React.createElement(TrackRecordCard, { record: withLater() }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("What came after the screen");
    expect(text).toContain("Screened Oct 1, 2026.");
    expect(text).toContain("T-12 to Sep 30, 2026 (added Oct 5, 2026)");
    expect(text).toContain("Moved to Dead on price (Oct 5, 2026)");
    expect(out).toContain('data-landing="screen_side"');
    expect(out).toContain('data-landing="between"');
    expect(text).toContain("Screen's side");
    expect(text).toContain("Between");
    // The three figures of a scored row, in the key's own unit.
    expect(text).toContain("6.0%");
    expect(text).toContain("9.0%");
    expect(text).toContain("9.1%");
    expect(text).toContain("$385k");
    // The decision row carries no figures but its sentence.
    expect(text).toContain("a decision on the screen's side, not a figure");
    expect(text).toContain("1 challenge not scored");
    expect(text).toContain("Exit cap: nothing that arrived after the screen speaks to it.");
  });

  it("draws nothing where nothing arrived after the screen, or with no record", () => {
    expect(html(React.createElement(TrackRecordCard, { record: null }))).toBe("");
    const before = scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: "2026-09-01T00:00:00Z", dated: null, summary: t12 } });
    expect(before.notScored).toHaveLength(1);
    expect(html(React.createElement(TrackRecordCard, { record: before }))).toBe("");
  });

  it("says no row is scored where the later evidence speaks to no challenge with figures", () => {
    const r = scoreDeal({ screenedAt: T, challenges: [older], t12: { arrivedAt: AFTER, dated: null, summary: t12 } });
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
  });

  it("few: the counts, a bar a key, and 'a start, not a record' with no share", () => {
    const fewer = accountRecord([scoreDeal({ screenedAt: T, challenges: [vacancy, insurance], t12: { arrivedAt: AFTER, dated: null, summary: t12 } })]);
    const few = html(React.createElement(TrackRecordSection, { record: fewer }));
    expect(a11yIssues(few)).toEqual([]);
    const text = visibleText(few);
    expect(gluedWords(text)).toEqual([]);
    expect(few).toContain('data-state="start"');
    expect(text).toContain("1 deal tested · 1 with later evidence · 2 rows scored");
    expect(text).toContain("2 scored rows are a start, not a record.");
    expect(text).not.toMatch(/\d+%/);
    expect(few).toContain('data-bar="record-screen"');
    expect(few).toContain('data-bar="record-between"');
    expect(few).not.toContain('data-bar="record-om"');
    expect(text).toContain("No share is printed under three scored rows.");
    // A decision is no scored row: withLater's basis row is the Dead
    // decision, counted apart, so its deal alone is two scored rows.
    const decided = html(React.createElement(TrackRecordSection, { record: accountRecord([withLater()]) }));
    expect(decided).toContain('data-state="start"');
    expect(visibleText(decided)).toContain("1 deal tested · 1 with later evidence · 3 rows answered, 1 of them a decision · 2 scored");
    // Three scored rows — vacancy (screen) twice, insurance (between) — is
    // the floor, and the shares are said.
    const atFloor = html(
      React.createElement(TrackRecordSection, {
        record: accountRecord([withLater(), scoreDeal({ screenedAt: T, challenges: [vacancy], t12: { arrivedAt: AFTER, dated: null, summary: t12 } })]),
      }),
    );
    expect(atFloor).toContain('data-state="record"');
    expect(visibleText(atFloor)).toContain("2 deals tested · 2 with later evidence · 4 rows answered, 1 of them a decision · 3 scored");
  });

  it("enough: the shares, said once in the line", () => {
    const record = accountRecord([withLater(), withLater()]);
    const out = html(React.createElement(TrackRecordSection, { record }));
    expect(a11yIssues(out)).toEqual([]);
    const text = visibleText(out);
    expect(gluedWords(text)).toEqual([]);
    expect(out).toContain('data-state="record"');
    // The two Dead decisions are said apart, never in the shares.
    expect(text).toContain(
      "Of 4 scored rows, 2 landed on the screen's side (50%), 0 on the OM's (0%) and 2 between (50%). 2 more rows were decisions (Dead, and why), counted apart and in no share.",
    );
    expect(text).toContain("2 screen · 0 OM");
    expect(text).toContain("0 screen · 0 OM · 2 between");
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
    for (const marker of ["record-screen", "record-between", "record-om"]) {
      const holders = files.filter((f) => readFileSync(f, "utf8").includes(`data-bar="${marker}"`));
      expect(holders.map((f) => f.replace(process.cwd(), "")), marker).toEqual(["/app/(app)/analytics/track-record.tsx"]);
    }
    const landing = files.filter((f) => readFileSync(f, "utf8").includes("data-landing="));
    expect(landing.map((f) => f.replace(process.cwd(), ""))).toEqual(["/app/(app)/deals/[id]/track-record-card.tsx"]);
  });
});
