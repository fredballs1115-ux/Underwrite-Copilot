// What Pro adds is ONE list (lib/marketing-constants PRO_PLAN), drawn by the
// homepage's plan cards and the billing page's, each line naming the gates
// in the code that hold it to Pro. The billing page sold per-tab uploads and
// the multi-document reconciliation as Pro — nothing gates either — and
// neither page named Ask-the-deal, which is gated. This holds the list to
// the gates both ways: a refusal the list does not name fails here, and so
// does a line whose gate is gone.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { FREE_DEALS, FREE_DEALS_LINE, FREE_PLAN, PRO_PLAN, PRO_PLAN_LINES, PRO_UPSELL } from "./marketing-constants";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, p));
  }
  return out;
}
const APP = sources(join(ROOT, "app"));

/** Every file under app/ that refuses a free account through lib/billing's
 *  `isPro`, with the gate it holds — or null for the deal page, which reads
 *  the plan only to show which of its controls are Pro. A new call site
 *  fails here until the Pro card names its feature. */
const IS_PRO_CALLERS: Record<string, string | null> = {
  "app/api/deals/[id]/memo/route.ts": "memo",
  "app/api/deals/[id]/report/route.ts": "report",
  "app/api/deals/[id]/loi/route.ts": "loi",
  "app/api/deals/[id]/underwrite.xlsx/route.ts": "underwrite",
  "app/api/deals/[id]/rent-roll.xlsx/route.ts": "rentroll",
  "app/(app)/account/actions.ts": "branding",
  "app/(app)/deals/[id]/model-actions.ts": "model-build",
  "app/(app)/deals/[id]/ask-actions.ts": "ask",
  "app/(app)/deals/[id]/comps-actions.ts": "comp-search",
  "app/(app)/deals/[id]/page.tsx": null,
};

const GATES = PRO_PLAN.flatMap((l) => l.gates as readonly string[]);
const UPSELLS = Object.keys(PRO_UPSELL);

describe("the Pro card names every gate in the code, and only those", () => {
  it("each gate belongs to one line, once", () => {
    expect(new Set(GATES).size).toBe(GATES.length);
    for (const key of UPSELLS) expect(GATES, key).toContain(key);
    for (const line of PRO_PLAN) expect(line.gates.length, line.label).toBeGreaterThan(0);
  });

  it("every upsell key a refusal sends is on the list, and every key on the list is still sent", () => {
    const sent = new Set<string>();
    for (const f of APP) for (const m of read(f).matchAll(/[?&]upsell=([a-z]+)/g)) sent.add(m[1]);
    expect([...sent].filter((k) => !UPSELLS.includes(k)), "a refusal the Pro card does not name").toEqual([]);
    expect(UPSELLS.filter((k) => !sent.has(k)), "a key no refusal sends any more").toEqual([]);
  });

  it("every file that asks isPro is a gate on the list — a new one fails until the card names it", () => {
    const callers = APP.filter((f) => /\bisPro\(/.test(read(f))).sort();
    expect(callers).toEqual(Object.keys(IS_PRO_CALLERS).sort());
    for (const [file, gate] of Object.entries(IS_PRO_CALLERS)) {
      if (gate === null) continue;
      expect(GATES, `${file} holds ${gate}`).toContain(gate);
      if (UPSELLS.includes(gate)) expect(read(file), file).toContain(`upsell=${gate}`);
    }
  });

  it("unlimited deals is the create actions' own refusal", () => {
    const actions = read("app/(app)/deals/actions.ts");
    expect(actions.match(/if \(!billing\.canCreateDeal\)/g) ?? []).toHaveLength(2);
    expect(GATES).toContain("deal-cap");
  });

  it("per-tab uploads and the document reconciliation are free: no gate holds them, and the card never sells them", () => {
    for (const f of ["app/(app)/deals/[id]/supplement-actions.ts", "app/(app)/deals/[id]/reconcile-actions.ts"]) {
      expect(read(f), f).not.toMatch(/\bisPro\b/);
    }
    // A source document is added on every plan; only building the model
    // from the set is Pro.
    const model = read("app/(app)/deals/[id]/model-actions.ts");
    const add = model.slice(model.indexOf("export async function addDealDocument"), model.indexOf("export async function removeDealDocument"));
    expect(add.length).toBeGreaterThan(0);
    expect(add).not.toMatch(/\bisPro\b/);
    expect(model.slice(model.indexOf("export async function generateModel"))).toMatch(/\bisPro\(/);
    for (const line of PRO_PLAN_LINES) expect(line).not.toMatch(/upload|reconcil/i);
  });
});

describe("the homepage and the billing page draw the one list", () => {
  for (const page of ["app/page.tsx", "app/(app)/billing/page.tsx"]) {
    it(page, () => {
      const src = read(page);
      expect(src).toContain("PRO_PLAN_LINES.map(");
      expect(src).toContain("FREE_PLAN.map(");
      expect(src).not.toMatch(/const (?:PRO|FREE)_FEATURES\b/);
    });
  }

  it("the billing page explains a refusal from the same map, and only by a key it holds", () => {
    const src = read("app/(app)/billing/page.tsx");
    expect(src).toContain("Object.hasOwn(PRO_UPSELL, upsell)");
    expect(src).not.toContain("UPSELL_LABELS");
  });
});

// The free cap counts the deals a reader has now — the create actions read
// `getBilling`'s count of the deals that exist, and so does the database's
// trigger (migration 0036), samples left out — and the team trial counts
// the team's the same way. "Your first 3 deals" promised a once-only
// allowance the code does not keep; every page says "up to" instead, and
// nothing about the rule staying as it is.
describe("the free allowance is said as the cap counts it", () => {
  it("no page says a first or next few deals, all of them screened, or the trial used up", () => {
    const once =
      /\b(?:first|next)\s+\$?\{(?:FREE_DEALS|FREE_DEAL_LIMIT|TEAM_TRIAL_DEALS)\}|screened all \$\{FREE_DEAL_LIMIT\}|deals are used up/i;
    expect(APP.filter((f) => once.test(read(f)))).toEqual([]);
  });

  it("the team trial is counted by its own constant, never the personal one", () => {
    expect(APP.filter((f) => /\$\{FREE_DEALS\} shared deals/.test(read(f)))).toEqual([]);
    expect(read("app/page.tsx")).toContain("`Up to ${TEAM_TRIAL_DEALS} shared deals free to try it`");
  });

  it("the plan card and the calls to sign up read one line", () => {
    expect(FREE_DEALS_LINE).toBe(`Up to ${FREE_DEALS} deals free`);
    expect(FREE_PLAN[0]).toBe(`Up to ${FREE_DEALS} deals, the full six-stage screen on each`);
    expect(read("app/page.tsx").match(/\{FREE_DEALS_LINE\}/g) ?? []).toHaveLength(2);
    expect(read("app/demo/page.tsx")).toContain("{FREE_DEALS_LINE}");
  });
});
