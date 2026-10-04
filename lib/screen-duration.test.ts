import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isScreenJob, typicalScreenMs, typicalScreenPhrase } from "./screen-duration";
import * as marketing from "./marketing-constants";

describe("typicalScreenMs — the median of the account's measured runs, from three", () => {
  it("is nothing under three runs: the rail then claims no duration", () => {
    expect(typicalScreenMs([])).toBeNull();
    expect(typicalScreenMs([180_000])).toBeNull();
    expect(typicalScreenMs([180_000, 200_000])).toBeNull();
  });

  it("is the median from three", () => {
    expect(typicalScreenMs([200_000, 150_000, 400_000])).toBe(200_000);
    expect(typicalScreenMs([150_000, 170_000, 190_000, 400_000])).toBe(180_000);
  });

  it("a value that is no run's wall-clock is not counted — nor does it make up the three", () => {
    expect(typicalScreenMs([180_000, 0, null, "190000", Number.NaN, 200_000])).toBeNull();
    expect(typicalScreenMs([180_000, 0, -5, 190_000, 200_000])).toBe(190_000);
  });
});

describe("typicalScreenPhrase — rounded to what a person says", () => {
  it("whole minutes past a minute and a half", () => {
    expect(typicalScreenPhrase(170_000)).toBe("about 3 minutes");
    expect(typicalScreenPhrase(150_000)).toBe("about 3 minutes");
    expect(typicalScreenPhrase(149_000)).toBe("about 2 minutes");
    expect(typicalScreenPhrase(95_000)).toBe("about 2 minutes");
    expect(typicalScreenPhrase(610_000)).toBe("about 10 minutes");
  });

  it("a minute and under", () => {
    expect(typicalScreenPhrase(70_000)).toBe("about a minute");
    expect(typicalScreenPhrase(30_000)).toBe("under a minute");
  });

  it("no figure, no phrase", () => {
    expect(typicalScreenPhrase(null)).toBeNull();
    expect(typicalScreenPhrase(0)).toBeNull();
    expect(typicalScreenPhrase(Number.NaN)).toBeNull();
  });
});

describe("the homepage claims no duration it has not measured either", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

  it("says what the screen does and in what order, not how long the first read takes", () => {
    const home = read("app/page.tsx");
    // "a first read … lands in about half a minute" was labelled observed
    // in lib/marketing-constants, with nothing measured behind it.
    expect(home).not.toMatch(/half a minute|FIRST_READ_CLAIM|FULL_SCREEN_CLAIM/);
    expect(home).toContain("the screen runs on its own — the headline numbers first, then extraction, assumption challenges, comp scrutiny, market check, and a verdict.");
    expect(Object.keys(marketing)).not.toContain("FIRST_READ_CLAIM");
    expect(Object.keys(marketing)).not.toContain("FULL_SCREEN_CLAIM");
  });

  // The second pre-merge audit: the test above read "half a minute" alone,
  // and the homepage's lead line still ended "— in minutes", the sign-in
  // page said "Screen your first deal in minutes" and /why "get a verdict in
  // a few minutes". No public page promises a screen's duration.
  it("no public page promises how long a screen takes", () => {
    const DURATION = /\bin (?:a few |just )?(?:minutes|seconds)\b|\bwithin minutes\b|\bin under a minute\b|\bminutes, not\b/i;
    for (const p of ["app/page.tsx", "app/login/page.tsx", "app/why/page.tsx", "app/demo/page.tsx", "app/tools/page.tsx", "app/market/page.tsx"]) {
      const said = read(p)
        .split("\n")
        .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
        .join("\n");
      expect(said, p).not.toMatch(DURATION);
    }
  });
});

describe("isScreenJob — the six-step screen, not a job that runs on its own", () => {
  it("reads the rail's own split", () => {
    for (const step of [null, undefined, "signal", "extract", "challenge", "comps", "market", "verdict"]) {
      expect(isScreenJob(step), String(step)).toBe(true);
    }
    for (const step of ["reconcile", "model", "comps_search"]) expect(isScreenJob(step), step).toBe(false);
  });
});
