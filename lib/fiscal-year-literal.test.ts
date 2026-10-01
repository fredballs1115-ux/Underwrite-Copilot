import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// No source names a fiscal year: the year comes from the data.
//
// HUD's fair market rents change every Oct 1, and the site had the year
// typed into its pages' words ("FY… fair market rent" on the markets band,
// the market brief, the compare card and the demo) and into the code that
// built its benchmark rows ("hud_fmr_fy…_2br"). So the day HUD's next year
// took effect, every one of those pages went on printing last year's rents
// as current. The year is a field of the research block now (lib/fmr), and
// this holds every page, every module and the two scripts that write FMR
// rows to it — comments included, so no sentence a reader might copy into a
// page keeps a year either. A test may pin a year; a source may not.

const LITERAL = /(?<![a-z])fy ?20\d\d/gi;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("a fiscal year is data, never typed into a source", () => {
  it("catches the forms a year was typed in, and nothing that is not one", () => {
    const hits = (s: string) => [...s.matchAll(LITERAL)].map((m) => m[0]);
    expect(hits("FY2026 2BR fair market rent")).toEqual(["FY2026"]);
    expect(hits('metric: "hud_fmr_fy2026_2br"')).toEqual(["fy2026"]);
    expect(hits("the FY 2027 schedule")).toEqual(["FY 2027"]);
    // Not a fiscal year: a word ending in "fy" before a year, an estimate
    // column in a memorandum's own words, a year alone, a year from data.
    expect(hits("we certify 2026 figures")).toEqual([]);
    expect(hits('an estimate letter ("2026E", "FY26E")')).toEqual([]);
    expect(hits("through 2026-09-30")).toEqual([]);
    expect(hits("`${fmrLabel(fmr.fy)} fair market rent`")).toEqual([]);
  });

  it("no page, module or FMR script names one", () => {
    const files = [
      ...sources(join(process.cwd(), "app")),
      ...sources(join(process.cwd(), "lib")),
      join(process.cwd(), "scripts/fetch-fmr.mjs"),
      join(process.cwd(), "scripts/seed-research.mjs"),
    ];
    expect(files.length).toBeGreaterThan(400);
    const found: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(LITERAL)) found.push(`${f.slice(process.cwd().length + 1)}:${i + 1} ${m[0]}`);
        });
    }
    expect(found).toEqual([]);
  });
});
