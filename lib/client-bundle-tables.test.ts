// No data table reaches a browser through a client component's imports.
//
// A "use client" module is bundled for the browser with everything it imports
// by value, and everything those import — a module's top-level work runs on
// load, so a bundler keeps a JSON table a module parses at its top even where
// the client calls nothing that reads it. Research pass 25 (2026-10-05) found
// two such tables in the browser's JavaScript:
//   - data/fred-series.json (313 KB raw, 26 KB gzip), which lib/live-rates
//     parses at its top, on /tools, /demo and every deal page: /tools for
//     three helpers and two types, the deal page and /demo through the
//     demand bars' one sentence and the model card's date writer;
//   - lib/skyline.ts's photograph table (58 KB raw, 15 KB gzip) on every
//     public page with a photo band and on the pipeline, through the market
//     photograph's component and the credit line.
// Neither is anything a browser reads: the pages hand the client the rows it
// draws. This walks every client module's value imports, transitively, and
// fails on a path to either kind of table.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const directive = (word: string) =>
  new RegExp(String.raw`^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use ${word}["']`);
const isClient = (src: string) => directive("client").test(src);
/** A "use server" module is a boundary: a client that imports one of its
 *  actions is sent a reference to it, never its code. */
const isServerActions = (src: string) => directive("server").test(src);

/** The source without its comments, so a commented-out import is no import. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every module this source imports BY VALUE: a type-only import or
 *  re-export brings no code, and a dynamic import() is split off. */
function valueImports(src: string): string[] {
  const body = code(src);
  const out: string[] = [];
  const statement = /(?:^|\n)\s*(import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of body.matchAll(statement)) {
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

/** A specifier resolved to a file in the repository, or null for a package. */
function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  const tries = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  for (const t of tries) {
    if (existsSync(t) && statSync(t).isFile()) return t;
  }
  return null;
}

/** A module a browser must never be sent. */
function isTable(path: string): boolean {
  const rel = relative(ROOT, path).split("\\").join("/");
  return (rel.startsWith("data/") && rel.endsWith(".json")) || rel === "lib/skyline.ts";
}

/** The first chain of value imports from `entry` to a table, or null. */
function chainToTable(entry: string): string[] | null {
  const seen = new Set<string>();
  const walk = (file: string, chain: string[]): string[] | null => {
    if (seen.has(file)) return null;
    seen.add(file);
    if (isTable(file)) return chain;
    if (!/\.(ts|tsx)$/.test(file)) return null;
    const src = readFileSync(file, "utf8");
    if (chain.length > 1 && isServerActions(src)) return null;
    for (const spec of valueImports(src)) {
      const next = resolveSpec(file, spec);
      if (!next) continue;
      const found = walk(next, [...chain, relative(ROOT, next)]);
      if (found) return found;
    }
    return null;
  };
  return walk(entry, [relative(ROOT, entry)]);
}

const clients = ["app", "lib"].flatMap((d) => sources(join(ROOT, d))).filter((f) => isClient(readFileSync(f, "utf8")));

describe("no data table reaches a browser", () => {
  it("reads the client modules", () => {
    expect(clients.length).toBeGreaterThan(40);
  });

  it("tells a value import from a type-only one", () => {
    expect(valueImports('import type { A } from "@/lib/x";\nimport { type B, type C } from "@/lib/y";')).toEqual([]);
    expect(valueImports('import { type B, c } from "@/lib/y";\nexport * from "./z";\nimport "./side";')).toEqual([
      "@/lib/y",
      "./z",
      "./side",
    ]);
    expect(valueImports('// import { a } from "@/lib/gone";\nexport type { T } from "./t";')).toEqual([]);
  });

  it("knows a table when it reaches one", () => {
    expect(isTable(join(ROOT, "data/fred-series.json"))).toBe(true);
    expect(isTable(join(ROOT, "lib/skyline.ts"))).toBe(true);
    expect(isTable(join(ROOT, "lib/skyline-core.ts"))).toBe(false);
    // The walk itself finds a path through a server module to the table.
    expect(chainToTable(join(ROOT, "lib/live-rates.ts"))).toEqual(["lib/live-rates.ts", "data/fred-series.json"]);
  });

  it("imports no data table from any client module, however far down", () => {
    const found = clients
      .map((f) => chainToTable(f))
      .filter((c): c is string[] => c !== null)
      .map((c) => c.join(" → "));
    expect(found).toEqual([]);
  });
});
