// The fit in words and colour, one way for every surface that draws it
// (research pass 35): where the screen could not check every criterion the
// box sets, the words say how many it did, and the fit is never green while
// one the price decides is among those it could not.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkedOf, checkedSentence, fitCellText, fitScoreLabel, fitTone, FOLD_WORD } from "./fit-label";

const NOTE = { checked: 2, total: 4, unchecked: ["Going-in cap", "Target return"], priceUnchecked: true };
const WHOLE = { checked: 4, total: 4, unchecked: [], priceUnchecked: false };
const PLACE = { checked: 3, total: 4, unchecked: ["Geography"], priceUnchecked: false };

describe("fitScoreLabel — the deal header's chip and the screen-complete email", () => {
  it("reads as before where the box was checked whole", () => {
    expect(fitScoreLabel(82, "PURSUE", false, WHOLE)).toBe("Fit 82 · Pursue");
    expect(fitScoreLabel(82, "PURSUE", false)).toBe("Fit 82 · Pursue");
    expect(fitScoreLabel(18, "PASS", true, WHOLE)).toBe("Fit 18 · Outside box");
  });

  it("puts the count in the call's place where it was not, and after a miss outright", () => {
    expect(fitScoreLabel(100, "PURSUE", false, NOTE)).toBe("Fit 100 · 2 of 4 checked");
    expect(fitScoreLabel(64, "WATCH", false, PLACE)).toBe("Fit 64 · 3 of 4 checked");
    expect(fitScoreLabel(63, "WATCH", true, PLACE)).toBe("Fit 63 · Outside box · 3 of 4 checked");
  });
});

describe("fitTone — never green while the price went unjudged", () => {
  it("mutes a pass whose price-decided criteria could not be checked, and nothing else", () => {
    expect(fitTone("PURSUE", "fits", NOTE)).toBe("muted");
    expect(fitTone(null, "fits", NOTE)).toBe("muted");
    // Only the place unknown: still the call's green.
    expect(fitTone("PURSUE", "fits", PLACE)).toBe("pass");
    expect(fitTone(null, "fits", WHOLE)).toBe("pass");
    // A warning stays a warning, and a miss outright is red whatever the score.
    expect(fitTone("WATCH", "near", NOTE)).toBe("caution");
    expect(fitTone(null, "near", NOTE)).toBe("caution");
    expect(fitTone("PASS", "fits", NOTE)).toBe("kill");
    expect(fitTone("PURSUE", "outside", NOTE)).toBe("kill");
    expect(fitTone(null, null, null)).toBe("muted");
  });
});

describe("fitCellText — the meeting workbook's and the pipeline CSV's Buy box cell", () => {
  it("says the count where the box was not checked whole, and marks a first read beside it", () => {
    expect(fitCellText(FOLD_WORD.fits, NOTE)).toBe("Fits (2 of 4)");
    expect(fitCellText(FOLD_WORD.near, PLACE, true)).toBe("Near (3 of 4, first read)");
    expect(fitCellText(FOLD_WORD.outside, WHOLE)).toBe("Outside");
    expect(fitCellText(FOLD_WORD.near, WHOLE, true)).toBe("Near (first read)");
    expect(fitCellText("", NOTE, true)).toBe("");
  });
});

describe("checkedOf and checkedSentence — the count and which criteria", () => {
  it("say nothing of a box checked whole, or of no box", () => {
    expect(checkedOf(WHOLE)).toBeNull();
    expect(checkedOf(null)).toBeNull();
    expect(checkedOf({ checked: 0, total: 0 })).toBeNull();
    expect(checkedSentence(WHOLE)).toBeNull();
  });

  it("count, short where a slot is narrow, and name what could not be checked", () => {
    expect(checkedOf(NOTE)).toBe("2 of 4 checked");
    expect(checkedOf(NOTE, true)).toBe("2 of 4");
    expect(checkedSentence(NOTE)).toBe("Judged on 2 of the buy box's 4 criteria; going-in cap and target return could not be checked.");
    expect(
      checkedSentence({ checked: 1, total: 4, unchecked: ["Price", "Basis / unit", "Going-in cap"], priceUnchecked: true }),
    ).toBe("Judged on 1 of the buy box's 4 criteria; price, basis / unit and going-in cap could not be checked.");
    expect(checkedSentence({ checked: 0, total: 3, unchecked: ["Price", "Units", "Size"] })).toBe(
      "None of the buy box's 3 criteria could be checked.",
    );
  });

  it("imports nothing at run time, so the pipeline's client module can read it", () => {
    const src = readFileSync("lib/fit-label.ts", "utf8");
    const imports = [...src.matchAll(/^import\s+(type\s+)?/gm)];
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((m) => !!m[1])).toBe(true);
  });
});
