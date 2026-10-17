import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A Server Component (a page, a layout, generateMetadata) cannot call
// cookies(), headers() or anything that reads them inside after(): Next runs
// the callback after React's render, and the call throws (node_modules/next/
// dist/docs/01-app/03-api-reference/04-functions/after.md, "In Server
// Components"). The deal page's bridge snapshot opened a Supabase client
// there — which reads cookies — and lost every snapshot to its catch. Read
// the request data first and pass it in.

const REQUEST_READS = /\b(cookies|headers|draftMode|createSupabaseServerClient|getUser)\s*\(/;

function serverComponentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...serverComponentFiles(p));
    else if (/^(page|layout|default|template)\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/** The body of each after(...) call: from the call to its matching paren. */
function afterBodies(src: string): string[] {
  const bodies: string[] = [];
  const re = /\bafter\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    bodies.push(src.slice(m.index, i + 1));
  }
  return bodies;
}

describe("after() in a Server Component reads no request data", () => {
  it("finds the after() calls it is meant to check", () => {
    const src = readFileSync("app/(app)/deals/[id]/page.tsx", "utf8");
    expect(afterBodies(src).length).toBeGreaterThan(1);
  });

  it("no page or layout calls cookies, headers or a cookie-backed client inside after()", () => {
    const offenders: string[] = [];
    for (const file of serverComponentFiles("app")) {
      const src = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(src)) continue;
      for (const body of afterBodies(src)) {
        const hit = body.match(REQUEST_READS);
        if (hit) offenders.push(`${file}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
