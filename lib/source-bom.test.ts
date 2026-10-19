// A byte-order mark the code writes or strips is spelled "\uFEFF", never
// typed: the character is invisible in an editor and a diff, so a literal one
// reads as an empty string to a reviewer, and an editor that drops it on save
// silently changes what a CSV download starts with or what a parser strips.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BOM = String.fromCharCode(0xfeff);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

describe("no source types a byte-order mark", () => {
  it("spells U+FEFF as an escape in app/, lib/ and scripts/", () => {
    const typed = ["app", "lib", "scripts"].flatMap((d) => sources(d)).filter((f) => readFileSync(f, "utf8").includes(BOM));
    expect(typed).toEqual([]);
  });
});
