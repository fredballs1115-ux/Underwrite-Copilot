import { describe, expect, it } from "vitest";
import { MAX_RUN_MS, elapsedLabel, runStartMs } from "./run-clock";

const LOADED = Date.parse("2026-09-30T14:03:00Z");

describe("the deal page's screen clock", () => {
  it("counts from when the run began, so a reload mid-screen does not read 0:00", () => {
    // The run was asked for at 14:00:05; the page was reloaded at 14:03.
    const start = runStartMs("2026-09-30T14:00:05.123456+00:00", LOADED);
    expect(start).toBe(Date.parse("2026-09-30T14:00:05.123Z"));
    expect(elapsedLabel(start, LOADED)).toBe("2:54");
    expect(elapsedLabel(start, LOADED + 60_000)).toBe("3:54");
  });

  it("falls back to the page load where the route gives no start", () => {
    for (const none of [null, undefined, "", "not a date"]) {
      expect(runStartMs(none, LOADED)).toBe(LOADED);
    }
    expect(elapsedLabel(runStartMs(null, LOADED), LOADED)).toBe("0:00");
    expect(elapsedLabel(runStartMs(null, LOADED), LOADED + 65_000)).toBe("1:05");
  });

  it("does not count from a row stamped before claims restamped it", () => {
    // A run claimed before the deploy keeps the deal's first screen's day as
    // its created_at: counted from, the rail would read thousands of minutes.
    const firstScreen = "2026-09-12T09:00:00Z";
    expect(runStartMs(firstScreen, LOADED)).toBe(LOADED);
    // Inside the bound a start is the run's own.
    const earlier = new Date(LOADED - MAX_RUN_MS + 60_000).toISOString();
    expect(runStartMs(earlier, LOADED)).toBe(LOADED - MAX_RUN_MS + 60_000);
  });

  it("never reads below 0:00 when the browser's clock runs behind the database's", () => {
    expect(elapsedLabel(LOADED + 4_000, LOADED)).toBe("0:00");
  });

  it("keeps counting minutes past the hour rather than wrapping", () => {
    expect(elapsedLabel(LOADED, LOADED + 75 * 60_000 + 9_000)).toBe("75:09");
  });
});
