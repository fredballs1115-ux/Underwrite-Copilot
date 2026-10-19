// The pipeline's counts count the rows its list would show (the audit of
// 2026-10-19): the verdict chips and the brokerage filter had counted the
// dead deals the list folds away.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countsForFirms, shownInList, verdictCountsOf } from "./pipeline-counts";

const deals = [
  { verdict: "pass", stage: "screening" },
  { verdict: "pass_on", stage: "dead" },
  { verdict: "pass_on", stage: "active_pursuit" },
  { verdict: "caution", stage: "dead" },
  { verdict: null, stage: "screening" },
];

describe("shownInList", () => {
  it("a dead deal only once the reader asked for the dead", () => {
    expect(shownInList("screening")).toBe(true);
    expect(shownInList("dead")).toBe(false);
    expect(shownInList("dead", { showDead: true })).toBe(true);
    expect(shownInList("dead", { stageFilter: "dead" })).toBe(true);
    // An unknown stage reads as the ladder's first rung (lib/stages).
    expect(shownInList(null)).toBe(true);
  });
});

describe("verdictCountsOf", () => {
  it("leaves the dead out unless they are shown", () => {
    expect(verdictCountsOf(deals)).toEqual({ pass: 1, caution: 0, pass_on: 1, screening: 1 });
    expect(verdictCountsOf(deals, { showDead: true })).toEqual({ pass: 1, caution: 1, pass_on: 2, screening: 1 });
    expect(verdictCountsOf(deals, { stageFilter: "dead" })).toEqual({ pass: 1, caution: 1, pass_on: 2, screening: 1 });
  });
});

describe("the brokerage filter's counts", () => {
  it("never the sample, never a dead deal", () => {
    expect(countsForFirms({ is_sample: false, stage: "screening" })).toBe(true);
    expect(countsForFirms({ is_sample: true, stage: "screening" })).toBe(false);
    expect(countsForFirms({ is_sample: false, stage: "dead" })).toBe(false);
  });

  it("the pipeline page counts firms, and the chosen firm's share, over those rows", () => {
    const page = readFileSync("app/(app)/deals/page.tsx", "utf8");
    expect(page).toContain("if (!countsForFirms(d)) continue;");
    expect(page).toContain("shown={shownRows.filter((d) => shownInList(d.stage)).length}");
    expect(page).toContain("total={rows.filter((d) => shownInList(d.stage)).length}");
    const list = readFileSync("app/(app)/deals/pipeline.tsx", "utf8");
    expect(list).toContain("verdictCountsOf(deals, { showDead, stageFilter: stage })");
  });
});
