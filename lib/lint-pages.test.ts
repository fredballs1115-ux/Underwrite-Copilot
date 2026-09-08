// scripts/lint-pages.mjs is what live-verify runs over the public pages on
// every deploy — the render tests cover the signed-in views, but the public
// pages are rendered from live data and only exist as HTML once fetched.
// This proves the script runs under the CI Node (it imports the TypeScript
// lint directly, relying on Node's type stripping), fails on the faults it
// exists to catch, and honours the allow-list for the changelog's quoted
// typos.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(process.cwd(), "scripts", "lint-pages.mjs");

function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("scripts/lint-pages.mjs", () => {
  const dir = mkdtempSync(join(tmpdir(), "lint-pages-"));
  const clean = join(dir, "clean.html");
  const faulty = join(dir, "faulty.html");
  writeFileSync(
    clean,
    `<main><h1>Covered markets</h1><p>29 machine-evaluable rules, focused on your markets.</p>` +
      `<img src="/a.png" alt="A building"><label for="q">Search</label><input id="q"></main>`,
  );
  writeFileSync(
    faulty,
    `<main><p>29machine-evaluable rules — the the number glued.</p>` +
      `<img src="/a.png"><button class="x"></button><input id="q"><input id="q"></main>`,
  );

  it("passes a clean page with exit 0 and the summary line", () => {
    const r = run([clean]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/clean\.html: clean/);
    expect(r.out).toMatch(/PAGE LINT: 1 pages · 0 glued words · 0 accessibility faults/);
  });

  it("fails a faulty page, naming each glued word and accessibility fault", () => {
    const r = run([faulty]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/glued: "29machine"/);
    expect(r.out).toMatch(/glued: "the the"/);
    expect(r.out).toMatch(/a11y: img without alt/);
    expect(r.out).toMatch(/a11y: button with no accessible name/);
    expect(r.out).toMatch(/a11y: input with no label/);
    expect(r.out).toMatch(/a11y: duplicate id "q" ×2/);
    expect(r.out).toMatch(/PAGE LINT: 1 pages · 2 glued words · 5 accessibility faults/);
  });

  it("the allow-list drops a quoted typo but nothing else", () => {
    const r = run(["--allow=29machine", faulty]);
    expect(r.code).toBe(1);
    expect(r.out).not.toMatch(/glued: "29machine"/);
    expect(r.out).toMatch(/glued: "the the"/);
    expect(r.out).toMatch(/1 glued words/);
  });

  it("with no files it explains itself and exits 2", () => {
    const r = run([]);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/usage: node scripts\/lint-pages\.mjs/);
  });
});
