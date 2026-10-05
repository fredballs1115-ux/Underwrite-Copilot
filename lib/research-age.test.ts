import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import metrosSeed from "@/data/research/metros.json";
import officeSeed from "@/data/research/office.json";
import rulesSeed from "@/data/research/regulatory_rules.json";
import {
  RESEARCH_STALE_DAYS,
  isResearchStale,
  oldestDate,
  researchAge,
  staleMark,
  staleReason,
} from "./research-age";
import { snapshotAge, snapshotReadOn, trackerAge, trackerFor } from "./tracker-read";
import { asOfLabel } from "./research";

describe("the research rule — one limit, the deal page's own", () => {
  it("is 180 days, and a date is stale only past it", () => {
    expect(RESEARCH_STALE_DAYS).toBe(180);
    // 2026-08-21 (the sector files): its 180th day is Feb 17, 2027.
    expect(researchAge("2026-08-21", "2027-02-17")).toEqual({ asOf: "2026-08-21", days: 180, stale: false, staleFrom: "2027-02-18" });
    expect(researchAge("2026-08-21", "2027-02-18")).toEqual({ asOf: "2026-08-21", days: 181, stale: true, staleFrom: "2027-02-18" });
    // 2026-08-25 (the market tracker's snapshot): current through Feb 21.
    expect(isResearchStale("2026-08-25", "2027-02-21")).toBe(false);
    expect(isResearchStale("2026-08-25", "2027-02-22")).toBe(true);
  });

  it("counts whole days, whatever the hour the clock is read at", () => {
    expect(researchAge("2026-08-21", new Date("2027-02-17T23:59:59Z")).stale).toBe(false);
    expect(researchAge("2026-08-21", new Date("2027-02-18T00:00:01Z")).stale).toBe(true);
    // A timestamp's own day is its date.
    expect(researchAge("2026-08-21T14:00:00Z", "2027-02-18").days).toBe(181);
    // A date in the future is not stale.
    expect(researchAge("2026-12-01", "2026-10-04")).toMatchObject({ days: -58, stale: false });
  });

  it("an undated or unreadable date is undated, never stale and never given a day", () => {
    for (const d of [null, undefined, "", "  ", "garbage", "2026-02-30", "Q2 2026"]) {
      expect(researchAge(d, "2027-06-01"), String(d)).toEqual({ asOf: null, days: null, stale: false, staleFrom: null });
      expect(staleMark(researchAge(d, "2027-06-01"))).toBeNull();
    }
  });

  it("says the age and the mark one way everywhere, and nothing while current", () => {
    expect(staleMark(researchAge("2026-08-25", "2027-02-21"))).toBeNull();
    expect(staleMark(researchAge("2026-08-25", "2027-02-22"))).toBe("181 days old, stale");
    expect(staleReason(researchAge("2026-08-25", "2027-02-21"))).toBeNull();
    expect(staleReason(researchAge("2026-08-25", "2027-02-22"))).toBe(
      "181 days old, past the 180 days the site holds research current",
    );
    // The shared "as of" writer says it the same way once handed the day.
    expect(asOfLabel("2026-08-20", "2027-02-16")).toBe("as of 2026-08-20");
    expect(asOfLabel("2026-08-20", "2027-02-17")).toBe("as of 2026-08-20 (181 days old, stale)");
    expect(asOfLabel("2026-08-20")).toBe("as of 2026-08-20");
    expect(asOfLabel("", "2027-02-17")).toBe("undated");
  });

  it("a line naming several reads is as stale as its oldest", () => {
    expect(oldestDate(["2026-08-25", null, "2026-08-21", "garbage"])).toBe("2026-08-21");
    expect(oldestDate([null, undefined, ""])).toBeNull();
  });
});

describe("each research file crosses on its own date", () => {
  it("the market tracker's snapshot, read 2026-08-25: current Feb 21, 2027, stale from Feb 22", () => {
    const dc = (metrosSeed.metros ?? []).find((m) => m.id === "dc")!.sector_snapshot;
    expect(snapshotReadOn(dc)).toBe("2026-08-25");
    expect(snapshotAge(dc, "2027-02-21").stale).toBe(false);
    expect(snapshotAge(dc, "2027-02-22").stale).toBe(true);
    // Every covered market's snapshot is dated, and ages by the one rule.
    for (const m of metrosSeed.metros ?? []) {
      const snap = (m as { sector_snapshot?: unknown }).sector_snapshot;
      if (!snap) continue;
      const day = snapshotReadOn(snap);
      expect(day, m.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(snapshotAge(snap, researchAge(day, "2026-10-04").staleFrom!).stale, m.id).toBe(true);
    }
    // A tracker read carries the same day and ages the same way.
    const office = trackerFor("dc", "office")!;
    expect(trackerAge(office, "2027-02-21").stale).toBe(false);
    expect(trackerAge(office, "2027-02-22").days).toBe(181);
  });

  it("the sector files, read 2026-08-21: current Feb 17, 2027, stale from Feb 18", () => {
    expect(officeSeed.as_of).toBe("2026-08-21");
    expect(isResearchStale(officeSeed.as_of, "2027-02-17")).toBe(false);
    expect(isResearchStale(officeSeed.as_of, "2027-02-18")).toBe(true);
  });

  it("each rule by its own date: the oldest rules cross in January 2027", () => {
    const rules = rulesSeed.rules as { id: string; as_of: string }[];
    const oldest = oldestDate(rules.map((r) => r.as_of))!;
    const first = researchAge(oldest, "2026-10-04").staleFrom!;
    expect(oldest).toBe("2026-07-15");
    expect(first).toBe("2027-01-12");
    const staleOn = (day: string) => rules.filter((r) => isResearchStale(r.as_of, day)).map((r) => r.id);
    expect(staleOn("2027-01-11")).toEqual([]);
    expect(staleOn(first).length).toBeGreaterThan(0);
    // Every rule is dated, so every rule eventually reads stale.
    for (const r of rules) expect(researchAge(r.as_of, "2026-10-04").asOf, r.id).not.toBeNull();
  });
});

describe("no surface keeps its own copy of the limit", () => {
  // The panel typed 180 into lib/research.ts and the steward typed it again;
  // a third copy on a page would let one surface call a date stale while
  // another called it current. A research date's age comes from here.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
    }
  };
  walk("app");
  walk("lib");
  walk("scripts");

  it("no source divides a research date by a day and compares it to 180", () => {
    for (const f of files) {
      if (f.endsWith("research-age.ts")) continue;
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/86_?400_?000\)?\s*>\s*180\b/);
      expect(src, f).not.toMatch(/daysAgo\(180\)/);
    }
  });

  it("the steward counts the research rows by the same constant", () => {
    const steward = readFileSync(join("scripts", "steward.mjs"), "utf8");
    expect(steward).toContain('from "../lib/research-age.ts"');
    expect(steward).toContain("daysAgo(RESEARCH_STALE_DAYS)");
  });
});
