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
  const home = reach("app/landing-interactive.tsx");

  it("draws the deal page's own sections", () => {
    expect(home.files.has("app/(app)/deals/[id]/deal-sections-view.tsx")).toBe(true);
    expect(home.files.has("app/(app)/deals/[id]/returns-headline.tsx")).toBe(true);
  });

  it("loads no server action, no comps map and no Leaflet", () => {
    expect([...home.serverActions]).toEqual([]);
    expect([...home.files].filter((f) => /comps-map|deal-sections\.tsx$|model-view\.tsx$/.test(f))).toEqual([]);
    expect([...home.packages].filter((p) => /leaflet|\.css$/.test(p))).toEqual([]);
  });

  it("is a walk that would find them: the deal page's modules reach both", () => {
    const page = reach("app/(app)/deals/[id]/deal-sections.tsx");
    expect([...page.serverActions].length).toBeGreaterThan(0);
    expect(page.files.has("app/(app)/deals/[id]/comps-map.tsx")).toBe(true);
    expect(page.packages.has("leaflet/dist/leaflet.css")).toBe(true);
    expect(reach("app/(app)/deals/[id]/model-view.tsx").serverActions.size).toBeGreaterThan(0);
  });
});
