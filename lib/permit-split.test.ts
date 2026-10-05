import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { currentBriefLine, NO_MULTI_UNIT_SERIES } from "./permit-split";
import { buildBrief } from "./anthropic/verdict";

// The Census Bureau publishes permits by the size of the building for
// metros, states and counties; FRED, which the figures here are read from,
// carries only the total and the single-family series for them. The site
// once said "the only split published for a metro or a state", which is the
// first claim and was not true — it says the second now, everywhere.

const STORED =
  "Housing units permitted, twelve months to Aug 2026, Washington MSA: 12,000 (-20.0% against the twelve months before), of which 7,200 in buildings of two or more units (-29.4%) — the total less the single-family series, the only split published for a metro or a state; FRED";

describe("the multi-unit permits' source, said as what it is", () => {
  it("names FRED as what carries no multi-unit series, not the whole of the Census Bureau's publishing", () => {
    expect(NO_MULTI_UNIT_SERIES).toBe("FRED carries no multi-unit series for a metro or a state");
  });

  it("reads a line a check stored before the wording changed with the clause corrected and every figure as stored", () => {
    expect(currentBriefLine(STORED)).toBe(
      "Housing units permitted, twelve months to Aug 2026, Washington MSA: 12,000 (-20.0% against the twelve months before), of which 7,200 in buildings of two or more units (-29.4%) — the total less the single-family series, since FRED carries no multi-unit series for a metro or a state; FRED",
    );
    // Any other line is left exactly as stored.
    const other = "Unemployment 3.4% (Jul 2026, Washington MSA; FRED), +0.2 pt on the month before";
    expect(currentBriefLine(other)).toBe(other);
    expect(currentBriefLine(currentBriefLine(STORED))).toBe(currentBriefLine(STORED));
  });

  it("the verdict's brief hands the model the corrected line from a stored check", () => {
    const brief = buildBrief({
      extraction: null,
      challenges: null,
      comps: null,
      reconciliation: null,
      market: {
        checks: [],
        summary: "",
        liveBrief: { metro: "Washington DC", readOn: "2026-09-23", lines: [STORED], figures: [] },
      },
    });
    expect(brief).toContain(`since ${NO_MULTI_UNIT_SERIES}; FRED`);
    expect(brief).not.toContain("the only split published");
  });

  it("no source says the retired claim any more", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && !p.endsWith("permit-split.ts")) files.push(p);
      }
    };
    walk(join(__dirname, "..", "app"));
    walk(join(__dirname));
    const said = files.filter((f) => /only split (published|FRED publishes)/.test(readFileSync(f, "utf8")));
    expect(said).toEqual([]);
  });
});
