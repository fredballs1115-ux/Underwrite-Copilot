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

// Audit C7, L11: the first signal's prompt said "the full six-stage screen
// runs next" (the signal is one of the six), and lib/deals' DEAL_STEPS
// named six steps with the reconciliation in them and the signal out.
describe("what else names the stages", () => {
  it("the first signal's prompt says the rest of the screen runs next", async () => {
    const { firstSignalInstruction } = await import("./anthropic/prompts");
    const text = firstSignalInstruction("multifamily" as never);
    expect(text).toContain("The rest of the screen runs next; this is just the instant signal.");
    expect(text).not.toMatch(/six-stage/);
  });

  it("DEAL_STEPS labels each stored result as the stage that writes it, the reconciliation last", async () => {
    const { DEAL_STEPS } = await import("./deals");
    const words = [...SCREEN_STAGES.map((s) => s.label), RECONCILE_RUN.label];
    for (const step of DEAL_STEPS) expect(words, step.key).toContain(step.label);
    expect(DEAL_STEPS.map((s) => s.label)).toEqual(["Extract", "Challenge", "Comps", "Market", "Verdict", "Reconcile"]);
  });
});
