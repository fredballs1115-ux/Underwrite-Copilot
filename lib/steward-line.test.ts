import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stewardLine, stewardOverdue } from "./steward-line";

const NOW = new Date("2026-10-01T12:00:00Z");

describe("the data-health page says when the steward last ran, never 'nightly'", () => {
  it("dates a recent run, and says an overdue one has re-checked nothing since", () => {
    expect(stewardLine({ started_at: "2026-10-01T06:00:00Z", finished_at: "2026-10-01T06:04:00Z" }, NOW)).toBe(
      "A steward re-checks source links, feed freshness and the oldest singly-sourced claims; its last run was Oct 1, 2026. A figure it corrects lands here, never silently.",
    );
    const old = { started_at: "2026-09-20T06:00:00Z", finished_at: null };
    expect(stewardOverdue(old, NOW)).toBe(true);
    expect(stewardLine(old, NOW)).toContain("but its last run was Sep 20, 2026, so nothing has been re-checked since");
  });

  it("says no run is recorded where there is none", () => {
    expect(stewardOverdue(null, NOW)).toBe(true);
    expect(stewardLine(null, NOW)).toContain("once it runs; no run is recorded yet");
  });

  it("the page prints the line, and the word 'nightly' reaches no customer", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/data-health/page.tsx"), "utf8");
    expect(src).toContain("stewardLine(");
    // Every "nightly" left on the page sits inside the operator's view.
    const customerPart = src.slice(0, src.indexOf("{operator && ("));
    expect(customerPart.slice(customerPart.indexOf("return ("))).not.toMatch(/nightly/i);
  });
});
