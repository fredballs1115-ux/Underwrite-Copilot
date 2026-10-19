/**
 * The decision log's stage moves as one picture (lib/stage-days): a bar a
 * stage as long as its days, in the pipeline funnel's tones, with each
 * stage's days in words. The spans read off the history, then the log
 * rendered on fixtures and linted.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals/d1",
  useSearchParams: () => new URLSearchParams(),
}));

import { DecisionLog } from "@/app/(app)/deals/[id]/decision-log";
import { spanDaysWords, stageTimeline, utcDayOf } from "./stage-days";
import type { StageChange } from "./stages";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const h = React.createElement;

const HISTORY: StageChange[] = [
  { stage: "screening", at: "2026-09-01T15:00:00Z" },
  { stage: "tracking", at: "2026-09-13T09:30:00Z" },
  // Set again on the stage it held: no move.
  { stage: "tracking", at: "2026-09-14T09:30:00Z" },
  { stage: "active_pursuit", at: "2026-10-01T18:00:00Z" },
];

describe("stageTimeline — how long a deal sat in each stage", () => {
  it("runs each stage to the next move, the last to today, in whole UTC days", () => {
    const { spans, end } = stageTimeline(HISTORY, "2026-10-19");
    expect(spans.map((s) => [s.stage, s.from, s.to, s.days, s.current])).toEqual([
      ["screening", "2026-09-01", "2026-09-13", 12, false],
      ["tracking", "2026-09-13", "2026-10-01", 18, false],
      ["active_pursuit", "2026-10-01", "2026-10-19", 18, true],
    ]);
    expect(end).toBeNull();
    expect(spanDaysWords(spans[0])).toBe("12 days");
    expect(spanDaysWords(spans[2])).toBe("18 days so far");
    expect(spanDaysWords({ days: 0, current: false })).toBe("under a day");
    expect(spanDaysWords({ days: 1, current: false })).toBe("1 day");
  });

  it("reads the history in time order whatever order it is stored in", () => {
    const shuffled = [HISTORY[3], HISTORY[0], HISTORY[2], HISTORY[1]];
    expect(stageTimeline(shuffled, "2026-10-19")).toEqual(stageTimeline(HISTORY, "2026-10-19"));
  });

  it("ends at Closed or Dead, which the deal sits in rather than runs up days in", () => {
    const { spans, end } = stageTimeline([...HISTORY, { stage: "dead", at: "2026-10-05T12:00:00Z" }], "2026-10-19");
    expect(spans.map((s) => [s.stage, s.days, s.current])).toEqual([
      ["screening", 12, false],
      ["tracking", 18, false],
      ["active_pursuit", 4, false],
    ]);
    expect(end).toEqual({ stage: "dead", label: "Dead", on: "2026-10-05" });
  });

  // The audit of #466: the moves' days are UTC days and "today" was the
  // reader's local day, so a move made on a Los Angeles evening (already
  // the next UTC day) left the stage it set off the timeline.
  it("counts the stage it is in on the moves' own clock, a Los Angeles evening included", () => {
    // 7 pm PDT on Oct 19 is 02:00Z on Oct 20; the page reads at 8 pm PDT.
    const moved: StageChange[] = [
      { stage: "screening", at: "2026-10-01T15:00:00Z" },
      { stage: "tracking", at: "2026-10-19T19:00:00-07:00" },
    ];
    const at8pmLA = Date.parse("2026-10-19T20:00:00-07:00");
    expect(utcDayOf(at8pmLA)).toBe("2026-10-20");
    const { spans } = stageTimeline(moved, utcDayOf(at8pmLA));
    expect(spans.map((s) => [s.stage, s.from, s.to, s.days, s.current])).toEqual([
      ["screening", "2026-10-01", "2026-10-20", 19, false],
      ["tracking", "2026-10-20", "2026-10-20", 0, true],
    ]);
    // A day behind the move's own (a local day handed in) never drops it.
    expect(stageTimeline(moved, "2026-10-19").spans.at(-1)).toMatchObject({ stage: "tracking", days: 0, current: true });
    // Ordered by the moment, not the text: 08:00 PDT is after 12:00Z.
    const offsets: StageChange[] = [
      { stage: "tracking", at: "2026-10-05T08:00:00-07:00" },
      { stage: "screening", at: "2026-10-05T12:00:00Z" },
    ];
    expect(stageTimeline(offsets, "2026-10-06").spans.map((s) => s.stage)).toEqual(["screening", "tracking"]);
  });

  it("gives the stage it is in no end without today, and draws nothing with no move", () => {
    expect(stageTimeline(HISTORY, null).spans.map((s) => s.stage)).toEqual(["screening", "tracking"]);
    expect(stageTimeline([], "2026-10-19")).toEqual({ spans: [], end: null });
    expect(stageTimeline([{ stage: "tracking", at: "not a date" }], "2026-10-19")).toEqual({ spans: [], end: null });
  });
});

describe("DecisionLog — the stage moves as days in each stage", () => {
  const log = (stageHistory: StageChange[], today: string | null = "2026-10-19") =>
    renderToStaticMarkup(h(DecisionLog, { dealId: "d1", notes: [], stageHistory, userEmail: null, userId: null, today }));

  it("draws a bar a stage in the funnel's tones, each stage's days said in words", () => {
    const html = log(HISTORY);
    expect(a11yIssues(html)).toEqual([]);
    const block = /<div class="mt-3" data-qa="stage-days">[\s\S]*?<\/ul><\/div>/.exec(html)?.[0] ?? "";
    expect(block).not.toBe("");
    const bars = [...block.matchAll(/<span data-bar="stage-days"[^>]*class="([^"]*)"[^>]*style="([^"]*)"/g)];
    expect(bars).toHaveLength(3);
    // The stages it passed through in the funnel's lit rung, the one it is in
    // in its picked rung.
    expect(bars[0][1]).toContain("bg-brand/10 ring-1 ring-inset ring-brand/40");
    expect(bars[1][1]).toContain("bg-brand/10");
    expect(bars[2][1]).toMatch(/\bbg-brand\b(?!\/)/);
    // Each as long as its days.
    expect(bars.map((b) => /flex-grow:(\d+)/.exec(b[2])?.[1])).toEqual(["12", "18", "18"]);
    // The bar is for the eye; the words are what a reader and a screen
    // reader read.
    expect(block).toMatch(/<div aria-hidden="true" class="mt-1\.5 flex/);
    const text = visibleText(block).replace(/\s+/g, " ").replace(/ ,/g, ",");
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Days in each stage");
    expect(text).toContain("Screening, 12 days — from Sep 1, 2026");
    expect(text).toContain("Tracking, 18 days — from Sep 13, 2026");
    expect(text).toContain("Active pursuit, 18 days so far — from Oct 1, 2026");
    // The log below still lists every move.
    expect((visibleText(html).match(/Stage →/g) ?? []).length).toBe(4);
  });

  it("names where the deal ended, and draws Dead mid-history in the funnel's hollow rung", () => {
    const html = log([
      { stage: "screening", at: "2026-09-01T15:00:00Z" },
      { stage: "dead", at: "2026-09-04T15:00:00Z" },
      { stage: "tracking", at: "2026-09-10T15:00:00Z" },
      { stage: "closed", at: "2026-10-10T15:00:00Z" },
    ]);
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html).replace(/\s+/g, " ").replace(/ ,/g, ",");
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Dead, 6 days — from Sep 4, 2026");
    expect(text).toContain("Tracking, 30 days — from Sep 10, 2026");
    expect(text).toContain("Closed on Oct 10, 2026");
    expect(text).not.toContain("so far");
    const bars = [...html.matchAll(/<span data-bar="stage-days"[^>]*class="([^"]*)"/g)];
    expect(bars).toHaveLength(3);
    expect(bars[1][1]).toContain("bg-surface ring-1 ring-inset ring-line");
  });

  it("draws nothing with no move to measure from", () => {
    expect(log([])).not.toContain('data-qa="stage-days"');
    expect(log([{ stage: "tracking", at: "2026-10-19T09:00:00Z" }], null)).not.toContain('data-qa="stage-days"');
  });
});
