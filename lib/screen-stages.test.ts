// The homepage's "six stages" are the deal page's own (the homepage and
// /demo against the signed-in product, M5: the homepage drew Extract …
// Verdict and Reconcile, where the deal page's rail runs Signal … Verdict,
// "Step N of 6", and reconciles the buyer's model as a run of its own).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANALYSIS_STAGES } from "./marketing-constants";
import { RECONCILE_RUN, SCREEN_STAGES } from "./screen-stages";

const VIEW = readFileSync(join(__dirname, "..", "app", "(app)", "deals", "[id]", "deal-view.tsx"), "utf8");
const HOME = readFileSync(join(__dirname, "..", "app", "page.tsx"), "utf8");

describe("the screen's stages", () => {
  it("are the deal page's rail, in its order and its words", () => {
    const rail = /const steps = \[([\s\S]*?)\];/.exec(VIEW)?.[1] ?? "";
    const steps = [...rail.matchAll(/\{ key: "([a-z_]+)", label: "([^"]+)" \}/g)].map((m) => ({ key: m[1], label: m[2] }));
    expect(steps).toEqual(SCREEN_STAGES.map((s) => ({ ...s })));
    const pipeline = /const PIPELINE = \[([^\]]*)\]/.exec(VIEW)?.[1] ?? "";
    expect([...pipeline.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])).toEqual(SCREEN_STAGES.map((s) => s.key));
  });

  it("leave the reconcile run out of the count, as the rail's side jobs do", () => {
    expect(/const SIDE_JOBS = new Set\(\[[^\]]*"reconcile"/.test(VIEW)).toBe(true);
    expect(SCREEN_STAGES.map((s) => s.key)).not.toContain(RECONCILE_RUN.key);
    expect(ANALYSIS_STAGES).toBe(SCREEN_STAGES.length);
  });

  it("are the list the homepage's rail draws", () => {
    expect(HOME).toContain("SCREEN_STAGES.map(");
    expect(HOME).not.toMatch(/title: "(Extract|Challenge|Comps|Market|Verdict|Reconcile)"/);
  });
});
