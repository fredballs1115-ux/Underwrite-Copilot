import { describe, expect, it } from "vitest";
import { FIT_FILTER_BANDS, fitFilterKey, fitFilterLabel, fitFilterOptions, normalizeFitFilter, type FitFilterDeal } from "./fit-filter";
import { FOLD_WORD, checkedOf, fitScoreLabel } from "./fit-label";
import { PURSUE_MIN, WATCH_MIN } from "./mandate";

const deal = (over: Partial<FitFilterDeal>): FitFilterDeal => ({
  score: null,
  mandateVerdict: null,
  fit: null,
  fitCoverage: null,
  ...over,
});

const PART = { checked: 2, total: 4 };
const MOST = { checked: 3, total: 4 };
const WHOLE = { checked: 4, total: 4 };

// The pipeline's own shapes: a scored deal of each call, a miss outright at
// a score that would have read "Watch", fits judged on part of the box, and
// fits with no score (the fold's word alone).
const FIXTURES: Record<string, FitFilterDeal> = {
  pursue: deal({ score: 88, mandateVerdict: "PURSUE", fit: "fits", fitCoverage: WHOLE }),
  watch: deal({ score: 71, mandateVerdict: "WATCH", fit: "near" }),
  low: deal({ score: 42, mandateVerdict: "PASS", fit: "near", fitCoverage: WHOLE }),
  outsideWatch: deal({ score: 63, mandateVerdict: "WATCH", fit: "outside" }),
  outsidePart: deal({ score: 63, mandateVerdict: "WATCH", fit: "outside", fitCoverage: MOST }),
  part: deal({ score: 100, mandateVerdict: "PURSUE", fit: "fits", fitCoverage: PART }),
  most: deal({ score: 80, mandateVerdict: "PURSUE", fit: "fits", fitCoverage: MOST }),
  fitsOnly: deal({ fit: "fits" }),
  nearOnly: deal({ fit: "near" }),
  outsideOnly: deal({ fit: "outside" }),
  nearOnlyPart: deal({ fit: "near", fitCoverage: PART }),
};

/** What the row's chip says, as the pipeline writes it: the deal header's
 *  label where there is a score, else the fold's word with "box" and the
 *  count. */
function chipOf(d: FitFilterDeal): string | null {
  if (d.score != null && d.mandateVerdict) return fitScoreLabel(d.score, d.mandateVerdict, d.fit === "outside", d.fitCoverage);
  if (!d.fit) return null;
  const count = checkedOf(d.fitCoverage);
  return `${FOLD_WORD[d.fit]} box${count ? `, ${count}` : ""}`;
}

describe("the pipeline's fit filter (signed-in gaps, M8)", () => {
  it("files each deal under the words its chip says", () => {
    for (const [name, d] of Object.entries(FIXTURES)) {
      const key = fitFilterKey(d);
      const chip = chipOf(d);
      expect(key, name).not.toBeNull();
      const label = fitFilterLabel(key!);
      expect(label, name).not.toMatch(/\bPass\b/);
      if (key === "LOW") {
        // The card draws a low score as its red figure; the row's "Pass"
        // stays the score's own word (lib/fit-label), never the filter's.
        expect(d.score!, name).toBeLessThan(FIT_FILTER_BANDS.watch);
        expect(chip, name).toMatch(/· Pass$/);
        continue;
      }
      // The option's words, minus a score band's range, are in the chip.
      const words = label.replace(/ · \d.*$/, "");
      expect(chip, name).toContain(words);
    }
  });

  it("puts a miss outright under Outside box whatever its score, and a part-checked fit under its count", () => {
    expect(fitFilterKey(FIXTURES.outsideWatch)).toBe("outside");
    expect(fitFilterKey(FIXTURES.outsidePart)).toBe("outside");
    expect(fitFilterKey(FIXTURES.outsideOnly)).toBe("outside");
    expect(fitFilterLabel("outside")).toBe("Outside box");
    expect(fitFilterKey(FIXTURES.part)).toBe("checked:2/4");
    expect(fitFilterLabel("checked:2/4")).toBe("2 of 4 checked");
    expect(fitFilterKey(FIXTURES.nearOnlyPart)).toBe("checked:2/4");
    expect(fitFilterKey(FIXTURES.pursue)).toBe("PURSUE");
    expect(fitFilterKey(FIXTURES.watch)).toBe("WATCH");
    expect(fitFilterKey(FIXTURES.fitsOnly)).toBe("fits");
    expect(fitFilterKey(deal({}))).toBeNull();
  });

  it("offers only what the deals file under, strongest first, and never Pass", () => {
    const opts = fitFilterOptions(Object.values(FIXTURES));
    expect(opts.map(([, l]) => l)).toEqual([
      "All fit",
      `Pursue · ${PURSUE_MIN}+`,
      `Watch · ${WATCH_MIN}–${PURSUE_MIN - 1}`,
      "Fits box",
      "Near box",
      "3 of 4 checked",
      "2 of 4 checked",
      `Fit under ${WATCH_MIN}`,
      "Outside box",
    ]);
    expect(fitFilterOptions([FIXTURES.watch]).map(([k]) => k)).toEqual(["all", "WATCH"]);
    expect(fitFilterOptions([])).toEqual([["all", "All fit"]]);
    // A choice no deal files under any more is still listed.
    expect(fitFilterOptions([FIXTURES.watch], "outside").map(([k]) => k)).toEqual(["all", "WATCH", "outside"]);
  });

  it("reads a view saved under the old Pass key as the low band", () => {
    expect(normalizeFitFilter("PASS")).toBe("LOW");
    expect(normalizeFitFilter("WATCH")).toBe("WATCH");
  });

  it("holds its band floors to lib/mandate's", () => {
    expect(FIT_FILTER_BANDS.pursue).toBe(PURSUE_MIN);
    expect(FIT_FILTER_BANDS.watch).toBe(WATCH_MIN);
  });
});
