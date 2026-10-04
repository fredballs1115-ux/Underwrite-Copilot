// Every cookie our own code writes, and the privacy page's account of each.
// The page says how many cookies of our own there are and what each is for;
// the time-zone cookie (lib/reader-day) would have made "Two cookies of our
// own" untrue the day it shipped. This scan finds every write — a
// `document.cookie` assignment, a cookie store's `set` (`cookies().set`, a
// store read from `cookies()`, `response.cookies.set`) or a Set-Cookie
// header — in app/, lib/ and the root's proxy, leaving out lib/supabase,
// whose session cookies the page accounts for in a sentence of their own.
// A write site not listed below fails, so the next cookie is said on the
// page before it ships.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PrivacyPage from "@/app/privacy/page";
import { visibleText } from "./render-lint";
import { PIPELINE_VIEW_COOKIE } from "./pipeline-view";
import { DISMISSED_ALERTS_COOKIE, DISMISSED_ALERTS_MAX_AGE } from "./dismissed-alerts";
import { TZ_COOKIE, TZ_COOKIE_MAX_AGE } from "./reader-day";

const root = process.cwd();

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Where a source writes a cookie: one entry a write, as `file:line`. */
export function cookieWrites(src: string): number[] {
  const lines: number[] = [];
  const lineOf = (index: number) => src.slice(0, index).split("\n").length;
  // A store read from `cookies()` ("const store = await cookies()"), whose
  // `set` writes one.
  const stores = [...src.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?cookies\(\)/g)].map((m) => m[1]);
  const patterns = [
    /\bdocument\.cookie\s*=(?!=)/g,
    /\bcookies\(\)\)?\s*\.set\(/g,
    /\.cookies\s*\.set\(/g,
    /["']set-cookie["']/gi,
    ...stores.map((s) => new RegExp(`\\b${s}\\.set\\(`, "g")),
  ];
  for (const re of patterns) for (const m of src.matchAll(re)) lines.push(lineOf(m.index ?? 0));
  return [...new Set(lines)].sort((a, b) => a - b);
}

/** The cookies our code writes, each with the file that writes it and the
 *  words the privacy page uses for it. A new write site fails the scan below
 *  until it is listed here — with its sentence on the page. */
const OWN_COOKIES: { cookie: string; file: string; writes: number; privacy: string; maxAge: number | "in the write" }[] = [
  {
    cookie: PIPELINE_VIEW_COOKIE,
    file: "app/(app)/deals/pipeline.tsx",
    writes: 1,
    privacy: "the view of your pipeline you left on (cards or list)",
    // Its write spells the max-age out: read off the source below.
    maxAge: "in the write",
  },
  {
    cookie: DISMISSED_ALERTS_COOKIE,
    file: "app/(app)/regulatory-alert-banner.tsx",
    writes: 1,
    privacy: "the regulatory alerts you dismissed, kept under your account's name",
    maxAge: DISMISSED_ALERTS_MAX_AGE,
  },
  {
    cookie: TZ_COOKIE,
    file: "app/(app)/time-zone-cookie.tsx",
    writes: 1,
    privacy: "your browser's time zone, so a due date counts from your own calendar day",
    maxAge: TZ_COOKIE_MAX_AGE,
  },
];

const COUNT_WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six"];

describe("every cookie our own code writes is on the privacy page", () => {
  it("finds a write in each of its shapes, and nothing in a read", () => {
    expect(cookieWrites("document.cookie = `a=1`;")).toEqual([1]);
    expect(cookieWrites("if (document.cookie == x) {}")).toEqual([]);
    expect(cookieWrites("const s = await cookies();\ns.get('a');\ns.set('a', '1');")).toEqual([3]);
    expect(cookieWrites("(await cookies()).set('a', '1');")).toEqual([1]);
    expect(cookieWrites("res.cookies.set('a', '1');")).toEqual([1]);
    expect(cookieWrites("headers.append('Set-Cookie', v);")).toEqual([1]);
    expect(cookieWrites("const v = (await cookies()).get('a')?.value;")).toEqual([]);
  });

  it("lists every write site in app/, lib/ and the proxy, lib/supabase's session cookies aside", () => {
    const files = [...sources(join(root, "app")), ...sources(join(root, "lib")), join(root, "proxy.ts")];
    const found: Record<string, number> = {};
    for (const f of files) {
      const rel = f.slice(root.length + 1);
      if (rel.startsWith("lib/supabase/")) continue;
      const n = cookieWrites(readFileSync(f, "utf8")).length;
      if (n > 0) found[rel] = n;
    }
    const listed = Object.fromEntries(OWN_COOKIES.map((c) => [c.file, c.writes]));
    expect(found, "a cookie written here is not on the privacy page: say what it is for and how long it lasts there, then list it in OWN_COOKIES").toEqual(listed);
  });

  it("the privacy page counts them, says what each is for, and how long it lasts", () => {
    const text = visibleText(renderToStaticMarkup(React.createElement(PrivacyPage)));
    const names = new Set(OWN_COOKIES.map((c) => c.cookie));
    expect(text).toContain(`${COUNT_WORD[names.size]} cookies of our own last a year:`);
    const year = 60 * 60 * 24 * 365;
    for (const c of OWN_COOKIES) {
      expect(text, c.cookie).toContain(c.privacy);
      const maxAge =
        c.maxAge === "in the write"
          ? Number(/max-age=(\d+)/.exec(readFileSync(join(root, c.file), "utf8"))?.[1])
          : c.maxAge;
      expect(maxAge, c.cookie).toBe(year);
    }
  });
});
