// A server file never reads a value out of a "use client" module (#438).
//
// Every export of a "use client" module is a CLIENT REFERENCE on the server:
// a function standing in for the component, which the server may render or
// hand to a client component as a prop, and nothing else. A constant or a
// helper exported beside the component compiles, type-checks and runs — and
// on the server it is that stand-in, not the value. The pipeline page read
// its view cookie as `cookies().get(PIPELINE_VIEW_COOKIE)` with the name
// imported from the pipeline's client module; on the server the name was a
// function, the cookie was looked up under the function's empty name, and
// the reader's chosen view was never read. Nothing failed; the page simply
// opened on its default every time. A helper CALLED the same way throws
// ("Attempted to call … from the server"), a 500 on the page.
//
// So this reads every source: the non-component exports of each client
// module (an ALL_CAPS or camelCase name — a component is PascalCase), and
// every value import of one of them from a file that is not itself a client
// module. Shared values belong in a plain module both sides import
// (lib/pipeline-view is the one this found).
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const isClient = (src: string) =>
  /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);

const files = ["app", "lib"].flatMap((d) => sources(d));
const text = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

/** Each client module's exports that are values rather than components. */
const clientValues = new Map<string, Set<string>>();
let clientModules = 0;
for (const f of files) {
  const src = text.get(f)!;
  if (!isClient(src)) continue;
  clientModules++;
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  const values = [...names].filter((n) => !/^[A-Z][a-z]/.test(n) || /^[A-Z0-9_]+$/.test(n));
  if (values.length) clientValues.set(f.replace(/\.(ts|tsx)$/, ""), new Set(values));
}

function target(from: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) return resolve(dirname(from), spec).slice(process.cwd().length + 1);
  return null;
}

describe("a server file reads no value out of a client module", () => {
  it("reads the client modules and the values they export", () => {
    expect(clientModules).toBeGreaterThan(40);
    // A value exported beside a component, which a server file must not read.
    expect(clientValues.get("app/(app)/deals/offers-due")?.has("daysUntil")).toBe(true);
  });

  it("imports only components (and types) from a 'use client' module", () => {
    const found: string[] = [];
    for (const f of files) {
      const src = text.get(f)!;
      if (isClient(src)) continue;
      for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
        if (m[1]) continue;
        const t = target(f, m[3]);
        if (!t) continue;
        const values = clientValues.get(t) ?? clientValues.get(join(t, "index"));
        if (!values) continue;
        const names = m[2]
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("type "))
          .map((s) => s.split(/\s+as\s+/)[0].trim());
        for (const n of names) if (values.has(n)) found.push(`${f} imports ${n} from ${m[3]}`);
      }
    }
    expect(found).toEqual([]);
  });
});
