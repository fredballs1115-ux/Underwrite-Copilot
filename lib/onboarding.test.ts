// "Screen your first OM" ticks for a deal whose memorandum a screen has
// finished — never for a deal typed in by hand, or a screen still running.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { screenedAnOm } from "./onboarding";

const om = "user/deal.pdf";
const deal = (over: Partial<Parameters<typeof screenedAnOm>[0]> = {}) =>
  screenedAnOm({ isSample: false, omPath: om, hasVerdict: true, job: { status: "done", step: "verdict" }, ...over });

describe("screenedAnOm — a memorandum screened to its verdict", () => {
  it("an uploaded OM whose screen reached its verdict", () => {
    expect(deal()).toBe(true);
    expect(deal({ job: null })).toBe(true);
    // A job that rewrites none of the screen's results — a comp search, a
    // model build — leaves the finished screen standing.
    expect(deal({ job: { status: "running", step: "comps_search" } })).toBe(true);
    expect(deal({ job: { status: "error", step: "model" } })).toBe(true);
  });

  it("never the sample, a deal typed in by hand, or a first screen still running or failed", () => {
    expect(deal({ isSample: true })).toBe(false);
    // Typed facts: a verdict, and no memorandum behind it.
    expect(deal({ omPath: null })).toBe(false);
    // An upload whose first screen has not reached its verdict — the step
    // ticked here, the moment the deal existed.
    expect(deal({ hasVerdict: false, job: { status: "queued", step: "signal" } })).toBe(false);
    expect(deal({ hasVerdict: false, job: { status: "running", step: "challenge" } })).toBe(false);
    expect(deal({ hasVerdict: false, job: { status: "error", step: "extract" } })).toBe(false);
  });

  it("never a verdict a later run has not reached — it may be a typed-in screen's, on a deal whose OM came after", () => {
    expect(deal({ job: { status: "running", step: "extract" } })).toBe(false);
    expect(deal({ job: { status: "queued", step: "signal" } })).toBe(false);
    expect(deal({ job: { status: "error", step: "market" } })).toBe(false);
    // …and counts again once the run's own verdict lands.
    expect(deal({ job: { status: "done", step: "verdict" } })).toBe(true);
  });

  it("is what the pipeline page ticks the step by", () => {
    // The page is a loader over the Supabase rows, so it is held at its
    // source: it ticked for any deal that was not the sample.
    const src = readFileSync("app/(app)/deals/page.tsx", "utf8");
    expect(src).toMatch(/hasScreenedOm: rows\.some\(\(d\) =>\s*screenedAnOm\(/);
    expect(src).not.toMatch(/rows\.some\(\(d\) => !d\.is_sample\)/);
  });
});
