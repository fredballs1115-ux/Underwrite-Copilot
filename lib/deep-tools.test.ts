// The "past the screen" cards (DEEP_TOOLS) sit on /demo beside the sample
// deal, so a figure on one reads as the sample's. The sample holds no BOVs
// and no valuations (lib/sample-deal seeds none), so there is no gap of its
// own for the Valuations card to quote: it had said "$6.5M", the valuation
// tests' grounding case. No card carries a dollar figure unless it is read
// from the sample, and none is.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEEP_TOOLS } from "./marketing-constants";

describe("the past-the-screen cards claim no figure the sample does not have", () => {
  it("prints no dollar figure on any card", () => {
    for (const t of DEEP_TOOLS) {
      expect(`${t.title} ${t.blurb}`, t.title).not.toMatch(/\$\s?\d/);
    }
  });

  it("the sample seeds no BOV for a gap to be read from", () => {
    const src = readFileSync(join(__dirname, "sample-deal.ts"), "utf8");
    expect(src).not.toMatch(/\bbovs?\b|"valuations"|opinion of value/i);
  });
});
