import { describe, expect, it } from "vitest";
import { isScreenJob, typicalScreenMs, typicalScreenPhrase } from "./screen-duration";

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

describe("isScreenJob — the six-step screen, not a job that runs on its own", () => {
  it("reads the rail's own split", () => {
    for (const step of [null, undefined, "signal", "extract", "challenge", "comps", "market", "verdict"]) {
      expect(isScreenJob(step), String(step)).toBe(true);
    }
    for (const step of ["reconcile", "model", "comps_search"]) expect(isScreenJob(step), step).toBe(false);
  });
});
