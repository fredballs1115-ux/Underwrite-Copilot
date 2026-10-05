import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import rulesSeed from "@/data/research/regulatory_rules.json";
import metrosSeed from "@/data/research/metros.json";
import { datedNotes, lastStatedDay, readDatedText } from "./dated-window";
import { evaluateRules, type RegulatoryRule } from "./research";
import { buildSubject, seedRules } from "./research-data";
import { sampleLegal } from "./sample-legal";
import { RuleItem } from "@/app/market/rule-item";
import { DatedNotes } from "@/app/dated-notes";
import { LegalPanel } from "@/app/demo/legal-panel";
import { MarketNote } from "@/app/market/market-note";
import { snapshotReadOn } from "./tracker-read";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const rules = rulesSeed.rules as RegulatoryRule[];
const rule = (id: string) => rules.find((r) => r.id === id)!;
const note = (id: string) =>
  ((metrosSeed.metros ?? []).find((m) => m.id === id)!.market_notes as { value: string }).value;
const text = (html: string) => visibleText(html).replace(/\s+/g, " ").trim();

describe("readDatedText — a window or an effective date, only as written", () => {
  it("reads the windows the rules state, in the shapes they write them", () => {
    expect(readDatedText(rule("md-takoma-park-rent-stabilization").effect).windows).toEqual([
      { text: "July 1, 2026 - June 30, 2027", start: "2026-07-01", end: "2027-06-30" },
    ]);
    expect(readDatedText(rule("ca-ab1482-rent-cap").effect).windows).toEqual([
      { text: "Aug 1, 2026 to July 31, 2027", start: "2026-08-01", end: "2027-07-31" },
    ]);
    // Los Angeles states this year's window and last year's.
    expect(readDatedText(rule("ca-la-rso-coverage").effect).windows.map((w) => [w.start, w.end])).toEqual([
      ["2026-07-01", "2027-06-30"],
      ["2025-07-01", "2026-06-30"],
    ]);
    // The verification notes' month/day/year and "between … and …" shapes.
    expect(readDatedText(rule("ca-la-rso-coverage").verification).windows[0]).toEqual({
      text: "7/1/2026 - 6/30/2027",
      start: "2026-07-01",
      end: "2027-06-30",
    });
    // Washington's: the 2027 cap read on 2026-09-30, then Commerce's page
    // read again on 2026-10-04 — the 2026 window and the 2027 one. The read's
    // own day and the page's "through 12/31/2026" are single days, not windows.
    expect(readDatedText(rule("wa-rent-cap-hb1217").verification).windows).toEqual([
      { text: "1/1/2027 and 12/31/2027", start: "2027-01-01", end: "2027-12-31" },
      { text: "1/1/2026 and 12/31/2026", start: "2026-01-01", end: "2026-12-31" },
      { text: "1/1/2027 and 12/31/2027", start: "2027-01-01", end: "2027-12-31" },
    ]);
    // The rule's effect and Seattle's note state both windows with their
    // days, as Commerce's page does (they had said "for 2026", a year alone).
    for (const t of [rule("wa-rent-cap-hb1217").effect, note("seattle")]) {
      expect(readDatedText(t).windows).toEqual([
        { text: "January 1, 2026 and December 31, 2026", start: "2026-01-01", end: "2026-12-31" },
        { text: "January 1, 2027 and December 31, 2027", start: "2027-01-01", end: "2027-12-31" },
      ]);
    }
    // Montgomery County's note states Takoma Park's allowance for its window
    // (it had said "FY2027 allowance 3.0%", a label no file gives days for).
    expect(readDatedText(note("montgomery_county"))).toEqual({
      windows: [{ text: "July 1, 2026 and June 30, 2027", start: "2026-07-01", end: "2027-06-30" }],
      takesEffect: [],
      fiscalYears: [],
    });
  });

  it("reads Virginia's effective date and its request for a review", () => {
    expect(readDatedText(rule("va-no-local-rent-control").effect).takesEffect).toEqual([
      { text: "takes effect 2027-07-01", on: "2027-07-01", review: true },
    ]);
  });

  it("reads no window with an end that names no year, an end before its start, or a building's vintage", () => {
    expect(readDatedText("allowance for July 1 - June 30, 2027 at 3.0%").windows).toEqual([]);
    expect(readDatedText("a cap from July 31, 2027 to Aug 1, 2026").windows).toEqual([]);
    expect(readDatedText("a cap for 2026, and 10% for increases taking effect in 2027").windows).toEqual([]);
    // New York's coverage is a vintage, as true today as in 1974.
    expect(readDatedText(rule("ny-nyc-rent-stabilization-coverage").quote).windows).toEqual([]);
    // A past enactment is history, not a date to watch.
    for (const id of ["ny-good-cause-eviction", "il-rent-control-preemption", "dc-rental-act-law-26-80", "md-pg-prsa-cap"]) {
      expect(readDatedText(rule(id).effect), id).toEqual({ windows: [], takesEffect: [], fiscalYears: [] });
    }
  });

  it("counts a fiscal-year label only where its dates are written beside it", () => {
    // A label with no days beside it — as Montgomery County's note once wrote
    // Takoma Park's "FY2027 allowance 3.0%", before it stated the window — is
    // given no days from another text or from memory: it guards nothing, and
    // is listed so a reader can see why.
    const bare = "Takoma Park's FY2027 allowance 3.0%.";
    expect(readDatedText(bare)).toEqual({ windows: [], takesEffect: [], fiscalYears: ["FY2027"] });
    expect(datedNotes(bare, "2030-01-01")).toEqual([]);
    // A label with its window beside it is that window.
    const stated = readDatedText("Allowance for FY2027 (July 1, 2026 - June 30, 2027): 3.0%.");
    expect(stated.fiscalYears).toEqual([]);
    expect(stated.windows.map((w) => w.end)).toEqual(["2027-06-30"]);
  });
});

describe("datedNotes — what a page says on the day before, of and after each end", () => {
  const takoma = rule("md-takoma-park-rent-stabilization").effect;

  it("a window holds through its last day and has ended the day after", () => {
    expect(datedNotes(takoma, "2027-06-29")).toEqual([]);
    expect(datedNotes(takoma, "2027-06-30")).toEqual([]);
    expect(datedNotes(takoma, "2027-07-01")).toEqual([
      {
        kind: "window_ended",
        date: "2027-06-30",
        text: "This states its figure for July 1, 2026 - June 30, 2027, a window that ended on Jun 30, 2027: the figure needs checking.",
      },
    ]);
    const ab1482 = rule("ca-ab1482-rent-cap").effect;
    expect(datedNotes(ab1482, "2027-07-31")).toEqual([]);
    expect(datedNotes(ab1482, "2027-08-01").map((n) => n.text)).toEqual([
      "This states its figure for Aug 1, 2026 to July 31, 2027, a window that ended on Jul 31, 2027: the figure needs checking.",
    ]);
  });

  it("a text's own history is never called ended: Los Angeles's last-year window passes unremarked", () => {
    const la = rule("ca-la-rso-coverage").effect;
    expect(datedNotes(la, "2026-10-04")).toEqual([]);
    expect(datedNotes(la, "2027-06-30")).toEqual([]);
    const after = datedNotes(la, "2027-07-01");
    expect(after.map((n) => n.date)).toEqual(["2027-06-30"]);
  });

  it("Washington's 2026 window is history once the 2027 one it states follows it; the 2027 one ends with its year", () => {
    for (const [id, t] of [
      ["wa-rent-cap-hb1217", rule("wa-rent-cap-hb1217").effect],
      ["note:seattle", note("seattle")],
    ] as const) {
      expect(datedNotes(t, "2026-12-31"), id).toEqual([]);
      // The 2026 window has ended, and the same text states the window that
      // follows it: its own history, no note.
      expect(datedNotes(t, "2027-01-01"), id).toEqual([]);
      expect(datedNotes(t, "2027-12-31"), id).toEqual([]);
      expect(datedNotes(t, "2028-01-01"), id).toEqual([
        {
          kind: "window_ended",
          date: "2027-12-31",
          text: "This states its figure for January 1, 2027 and December 31, 2027, a window that ended on Dec 31, 2027: the figure needs checking.",
        },
      ]);
    }
  });

  it("Takoma Park's allowance in Montgomery County's note ends with its window, June 30, 2027", () => {
    const moco = note("montgomery_county");
    expect(datedNotes(moco, "2027-06-30")).toEqual([]);
    expect(datedNotes(moco, "2027-07-01")).toEqual([
      {
        kind: "window_ended",
        date: "2027-06-30",
        text: "This states its figure for July 1, 2026 and June 30, 2027, a window that ended on Jun 30, 2027: the figure needs checking.",
      },
    ]);
  });

  it("an effective date: nothing before it, today on it, passed after it", () => {
    const va = rule("va-no-local-rent-control").effect;
    expect(datedNotes(va, "2027-06-30")).toEqual([]);
    expect(datedNotes(va, "2027-07-01")).toEqual([
      {
        kind: "takes_effect_today",
        date: "2027-07-01",
        text: "This says a change takes effect today, Jul 1, 2027: it was written before then and needs checking.",
      },
    ]);
    expect(datedNotes(va, "2027-07-02")).toEqual([
      {
        kind: "takes_effect_passed",
        date: "2027-07-01",
        text: "This says a change takes effect on Jul 1, 2027 and asks for a review before then; that date has passed: it was written before then and needs checking.",
      },
    ]);
  });

  it("says nothing on a day it cannot read", () => {
    expect(datedNotes(takoma, "")).toEqual([]);
    expect(datedNotes(null, "2030-01-01")).toEqual([]);
  });
});

describe("what the files state, and when it ends", () => {
  // Every printed text: the rules' effects and the market notes.
  const printed = [
    ...rules.map((r) => ({ id: r.id, text: r.effect })),
    ...(metrosSeed.metros ?? []).map((m) => ({ id: `note:${m.id}`, text: (m.market_notes as { value?: string } | null)?.value ?? "" })),
  ];

  it("names every printed text whose stated window or date ends within twelve months of 2026-10-04", () => {
    const ending = printed
      .map((p) => ({ id: p.id, last: lastStatedDay(p.text) }))
      .filter((p): p is { id: string; last: string } => p.last !== null && p.last >= "2026-10-04" && p.last <= "2027-10-04")
      .sort((a, b) => a.last.localeCompare(b.last) || a.id.localeCompare(b.id));
    expect(ending).toEqual([
      { id: "ca-la-rso-coverage", last: "2027-06-30" },
      { id: "md-takoma-park-rent-stabilization", last: "2027-06-30" },
      { id: "note:montgomery_county", last: "2027-06-30" },
      { id: "va-no-local-rent-control", last: "2027-07-01" },
      { id: "ca-ab1482-rent-cap", last: "2027-07-31" },
    ]);
    // Washington's 2027 window, in the rule and in Seattle's note, ends with
    // its year, past the twelve months.
    expect(lastStatedDay(rule("wa-rent-cap-hb1217").effect)).toBe("2027-12-31");
    expect(lastStatedDay(note("seattle"))).toBe("2027-12-31");
  });

  it("no printed text says anything on 2026-10-04", () => {
    for (const p of printed) expect(datedNotes(p.text, "2026-10-04"), p.id).toEqual([]);
  });
});

describe("every surface that prints such a text reads it", () => {
  it("the rules evaluation carries each rule's notes on the subject's day", () => {
    const subject = (today: string) =>
      buildSubject({ address: { state: "MD", city: "Takoma Park", county: "Montgomery County" }, sizeText: "4 units", today });
    const takoma = (today: string) =>
      evaluateRules(seedRules(), subject(today)).find((e) => e.rule.id === "md-takoma-park-rent-stabilization")!;
    expect(takoma("2027-06-30").dated).toEqual([]);
    expect(takoma("2027-07-01").dated.map((n) => n.kind)).toEqual(["window_ended"]);
    // The outcome is the rule's: it still holds; its figure needs checking.
    expect(takoma("2027-07-01").outcome).toBe(takoma("2027-06-30").outcome);
    // The subject's year follows its day.
    expect(subject("2027-07-01").current_year).toBe(2027);
  });

  it("the market brief's rule note says it under the rule, in view", () => {
    const item = (today: string) =>
      renderToStaticMarkup(React.createElement("ul", null, React.createElement(RuleItem, { rule: rule("md-takoma-park-rent-stabilization"), today })));
    expect(item("2027-06-30")).not.toContain('data-qa="window-ended"');
    const html = item("2027-07-01");
    expect(text(html)).toContain("a window that ended on Jun 30, 2027: the figure needs checking.");
    // In view, never inside the fold that holds the rest of the rule.
    expect(html.match(/<details[\s\S]*?<\/details>/)?.[0] ?? "").not.toContain("window-ended");
    // The rule's text stays as written.
    expect(text(html)).toContain("Takoma Park runs its OWN rent stabilization");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("the market brief's Washington rule says its 2027 window ended only once 2027 is out", () => {
    const item = (today: string) =>
      renderToStaticMarkup(React.createElement("ul", null, React.createElement(RuleItem, { rule: rule("wa-rent-cap-hb1217"), today })));
    expect(item("2027-01-01")).not.toContain('data-qa="window-ended"');
    expect(text(item("2028-01-01"))).toContain("a window that ended on Dec 31, 2027: the figure needs checking.");
  });

  it("the market brief's note says it under the note, which stays as written", () => {
    const moco = (metrosSeed.metros ?? []).find((m) => m.id === "montgomery_county")!;
    const at = (today: string) =>
      renderToStaticMarkup(
        React.createElement(MarketNote, {
          note: moco.market_notes as { value: string; status?: string },
          readOn: snapshotReadOn(moco.sector_snapshot),
          today,
        }),
      );
    expect(at("2027-06-30")).not.toContain('data-qa="window-ended"');
    const html = at("2027-07-01");
    expect(text(html)).toContain("a window that ended on Jun 30, 2027: the figure needs checking.");
    expect(text(html)).toContain(note("montgomery_county"));
    expect(a11yIssues(html)).toEqual([]);
  });

  it("the demo's legal list draws its notes under the rule's text", () => {
    const legal = sampleLegal("2026-10-04");
    expect(legal.rules.every((r) => r.dated.length === 0)).toBe(true);
    const withNote = { ...legal, rules: legal.rules.map((r, i) => (i === 0 ? { ...r, dated: datedNotes(rule("md-takoma-park-rent-stabilization").effect, "2027-07-01").map((n) => n.text) } : r)) };
    const html = renderToStaticMarkup(React.createElement(LegalPanel, { legal: withNote }));
    expect(text(html)).toContain("a window that ended on Jun 30, 2027: the figure needs checking.");
    expect(html).toContain('data-qa="window-ended"');
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("draws nothing while nothing has ended", () => {
    expect(renderToStaticMarkup(React.createElement(DatedNotes, { notes: [] }))).toBe("");
  });
});
