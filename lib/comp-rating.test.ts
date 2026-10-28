import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMP_RATING, inCompOrder } from "./comp-rating";
import { VERDICT_WORDS } from "./how-we-test";

const SECTIONS = readFileSync(join(__dirname, "..", "app", "(app)", "deals", "[id]", "deal-sections-view.tsx"), "utf8");

describe("a comp's grade", () => {
  it("is drawn from the one display map, which the deal page re-exports rather than copies", () => {
    expect(SECTIONS).toContain('import { COMP_RATING } from "@/lib/comp-rating";');
    expect(SECTIONS).not.toMatch(/const COMP_RATING = \{/);
    for (const f of ["app/stress-test-panel.tsx", "app/screen-run-strip.tsx", "lib/memo/report-document.tsx", "lib/stress-test.ts"]) {
      expect(readFileSync(join(__dirname, "..", f), "utf8"), f).toContain('from "@/lib/comp-rating"');
    }
  });

  it("says comparability, never a stress-test verdict word (the review of 2026-10-28)", () => {
    expect(Object.fromEntries(Object.entries(COMP_RATING).map(([k, r]) => [k, r.label]))).toEqual({
      supports: "Comparable",
      favorable: "Less comparable, flatters the ask",
      stretched: "Not comparable",
    });
    const verdicts: readonly string[] = VERDICT_WORDS.map((v) => v.word);
    for (const r of Object.values(COMP_RATING)) {
      for (const word of [...r.label.toLowerCase().split(/\W+/), ...r.short.split(/\W+/)]) expect(verdicts, word).not.toContain(word);
      expect(r.label.toLowerCase().startsWith(r.short)).toBe(true);
    }
  });

  it("orders the comps as the deal page does: the least comparable first, each keeping its place among equals", () => {
    const comps = [
      { name: "a", support: "supports" },
      { name: "b", support: "stretched" },
      { name: "c", support: "favorable" },
      { name: "d", support: "stretched" },
    ];
    expect(inCompOrder(comps).map((c) => c.name)).toEqual(["b", "d", "c", "a"]);
  });
});
