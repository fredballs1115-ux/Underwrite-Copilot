// The weekday intel job's dedupe (research pass 42, L7): it read which
// stories were already stored a hundred news addresses a request — tens of
// kilobytes of URL — and ignored the read's error, so a failed read meant
// "none stored": every story scored, digested and alerted again, the red
// banner back for a change already on file. It reads through readByValues
// (lib/read-all), whose runs fit a request line, and leaves a story it could
// not check for the next run.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/daily-intel.mjs", "utf8");

describe("the intel job's dedupe", () => {
  it("reads the stored stories in runs that fit a request line", () => {
    expect(script).toContain('import { readByValues } from "../lib/read-all.ts"');
    expect(script).toMatch(/readByValues\(\s*candidates\.map\(\(c\) => c\.url\)/);
    expect(script).not.toMatch(/i \+= 100/);
  });

  it("never treats a story it could not check as new, so no alert goes in twice", () => {
    expect(script).toMatch(/const fresh = candidates\.filter\(\(c\) => !seen\.has\(c\.url\) && !notChecked\.has\(c\.url\)\)/);
    // a run that could check nothing fails, rather than saying nothing is new
    expect(script).toMatch(/unread\.length === candidates\.length\)\s*\{\s*throw new Error/);
    // the dedupe is read before any alert is written
    expect(script.indexOf("readByValues(")).toBeLessThan(script.indexOf('from("regulatory_alerts").insert'));
  });
});
