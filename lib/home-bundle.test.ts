// The homepage's walkthrough draws the deal page's own sections on the sample
// deal (app/landing-interactive.tsx), and a client module is bundled for the
// browser with everything it imports by value. Drawn from deal-sections.tsx
// and model-view.tsx, it had brought the homepage the comps map's Leaflet
// stylesheet and the references to four server-action modules, none of which
// it draws (work package 6, 2026-10-16). It reads the sections from
// deal-sections-view.tsx and the returns from returns-headline.tsx, which
// import neither; this walks its value imports and holds it there.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();

const serverDirective = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use server["']/;

/** Every module a source imports BY VALUE (a type-only import brings no
 *  code; a dynamic import() is split off), as client-bundle-tables reads. */
function valueImports(src: string): string[] {
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const m of body.matchAll(/(?:^|\n)\s*(import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g)) {
    const clause = m[2].trim();
    if (/^type\b/.test(clause)) continue;
    const braces = clause.match(/^\{([\s\S]*)\}$/);
    if (braces) {
      const names = braces[1].split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length > 0 && names.every((n) => /^type\s/.test(n))) continue;
    }
    out.push(m[3]);
  }
  for (const m of body.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const t of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(t) && statSync(t).isFile()) return t;
  }
  return null;
}

/** Every repository module the entry reaches by value, and every package
 *  specifier it names on the way, stopping at a "use server" module (a
 *  client is sent a reference to it, never its code — but a reference all
 *  the same). */
function reach(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const serverActions = new Set<string>();
  const walk = (file: string) => {
    const rel = relative(ROOT, file).split("\\").join("/");
    if (files.has(rel)) return;
    files.add(rel);
    if (!/\.(ts|tsx)$/.test(file)) return;
    const src = readFileSync(file, "utf8");
    if (serverDirective.test(src)) {
      serverActions.add(rel);
      return;
    }
    for (const spec of valueImports(src)) {
      const next = resolveSpec(file, spec);
      if (next) walk(next);
      else packages.add(spec);
    }
  };
  walk(join(ROOT, entry));
  return { files, packages, serverActions };
}

describe("the homepage's walkthrough", () => {
  // What the page loads first, and the chunk its tabs past the Overview
  // arrive in (a dynamic import(), which the walk does not follow).
  const home = reach("app/landing-interactive.tsx");
  const tabs = reach("app/walkthrough-tabs.tsx");

  it("draws the deal page's own sections: the Overview first, the rest in a chunk of their own", () => {
    expect(home.files.has("app/(app)/deals/[id]/deal-sections-base.tsx")).toBe(true);
    expect(readFileSync(join(ROOT, "app/landing-interactive.tsx"), "utf8")).toContain('import("./walkthrough-tabs")');
    // The deal-strategy readers too: the risk digest's one band had brought
    // them, through lib/actuals/analyze (lib/actuals/in-line-band now).
    for (const f of ["app/(app)/deals/[id]/deal-sections-view.tsx", "app/(app)/deals/[id]/returns-headline.tsx", "lib/deal-strategy.ts"]) {
      expect(home.files.has(f), f).toBe(false);
      expect(tabs.files.has(f), f).toBe(true);
    }
  });

  it("loads no server action, no comps map and no Leaflet, first or later", () => {
    for (const graph of [home, tabs]) {
      expect([...graph.serverActions]).toEqual([]);
      expect([...graph.files].filter((f) => /comps-map|deal-sections\.tsx$|model-view\.tsx$/.test(f))).toEqual([]);
      expect([...graph.packages].filter((p) => /leaflet|\.css$/.test(p))).toEqual([]);
    }
  });

  it("is a walk that would find them: the deal page's modules reach both", () => {
    expect(reach("app/(app)/deals/[id]/deal-view.tsx").serverActions.size).toBeGreaterThan(0);
    const page = reach("app/(app)/deals/[id]/deal-sections.tsx");
    expect([...page.serverActions].length).toBeGreaterThan(0);
    expect(page.files.has("app/(app)/deals/[id]/comps-map.tsx")).toBe(true);
    expect(page.packages.has("leaflet/dist/leaflet.css")).toBe(true);
    expect(reach("app/(app)/deals/[id]/model-view.tsx").serverActions.size).toBeGreaterThan(0);
  });
});

// /demo draws the deal page's own parts on the sample (app/demo/sections.tsx:
// the Overview, the terms, the debt sizer, the model card's views, the buy
// box) and, past them, the walkthrough's panel. It had read them from
// deal-sections.tsx, deal-view.tsx and model-view.tsx, which brought it the
// comps map's Leaflet stylesheet and seven server-action modules, though it
// draws no map and acts on nothing (work package AK, 2026-10-16). It reads
// them from the modules that carry neither; this holds it there. The page is
// a server component, so the walk from it reaches the server-only readers
// too: none of them may reach a server action or Leaflet either.
describe("/demo", () => {
  const page = reach("app/demo/page.tsx");
  const sections = reach("app/demo/sections.tsx");

  it("draws the deal page's own parts, from the modules with no action and no map", () => {
    for (const f of [
      "app/(app)/deals/[id]/deal-sections-base.tsx",
      "app/(app)/deals/[id]/deal-sections-view.tsx",
      "app/(app)/deals/[id]/buy-box-panel.tsx",
      "app/(app)/deals/[id]/model-panels.tsx",
      "app/(app)/deals/[id]/returns-headline.tsx",
    ]) {
      expect(sections.files.has(f), f).toBe(true);
    }
  });

  it("loads no server action, no comps map and no Leaflet", () => {
    for (const graph of [page, sections]) {
      expect([...graph.serverActions]).toEqual([]);
      expect(
        [...graph.files].filter((f) => /comps-map|deal-sections\.tsx$|deal-view\.tsx$|model-view\.tsx$/.test(f)),
      ).toEqual([]);
      expect([...graph.packages].filter((p) => /leaflet|\.css$/.test(p))).toEqual([]);
    }
  });
});

// The homepage draws the sample's own pipeline card (app/sample-pipeline-card,
// deal-tile.tsx). The card's module had imported the stage control and the
// offers-due control's module, each a server action's form; the pipeline now
// hands the card its stage control and the deadline's words live in
// offers-due-bit.tsx (work package AK, 2026-10-16). The card is a chunk of
// its own, asked for as its section nears the screen (a dynamic import(),
// which the walk does not follow), so the first load carries none of it. The
// whole page, server part and client part, and the card's chunk reach no
// server action and no Leaflet.
describe("the homepage, whole", () => {
  const page = reach("app/page.tsx");
  const card = reach("app/(app)/deals/deal-tile.tsx");

  it("draws the pipeline's own card for the sample, in a chunk of its own", () => {
    expect(page.files.has("app/sample-pipeline-card.tsx")).toBe(true);
    expect(page.files.has("lib/pipeline-card.ts")).toBe(true);
    expect(page.files.has("app/(app)/deals/deal-tile.tsx")).toBe(false);
    expect(readFileSync(join(ROOT, "app/sample-pipeline-card-lazy.tsx"), "utf8")).toContain('import("./(app)/deals/deal-tile")');
  });

  it("loads no server action, no comps map and no Leaflet, the card included", () => {
    for (const graph of [page, card]) {
      expect([...graph.serverActions]).toEqual([]);
      expect([...graph.files].filter((f) => /comps-map|stage-select|offers-due\.tsx$|pipeline\.tsx$/.test(f))).toEqual([]);
      expect([...graph.packages].filter((p) => /leaflet|\.css$/.test(p))).toEqual([]);
    }
  });

  it("is a walk that would find them: the pipeline reaches the card's stage control", () => {
    const pipeline = reach("app/(app)/deals/pipeline.tsx");
    expect(pipeline.files.has("app/(app)/deals/[id]/stage-select.tsx")).toBe(true);
    expect(pipeline.serverActions.size).toBeGreaterThan(0);
  });
});
