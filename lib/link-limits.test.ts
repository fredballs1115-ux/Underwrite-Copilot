// A share link's thirty days and the compare page's four deals, one constant
// each (research pass 42, L6): the share action, its panel, the expired page
// and migration 0036 each wrote the thirty days for themselves, and the
// compare page cut the list at a 4 of its own beside the pipeline's.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMPARE_MAX, SHARE_LINK_DAYS } from "./link-limits";

const src = (p: string) => readFileSync(p, "utf8");

describe("a share link's life", () => {
  it("is the span migration 0036 clamps an expiry to", () => {
    const m = src("supabase/migrations/0036_security_hardening.sql").match(/least\(new\.expires_at, now\(\) \+ interval '(\d+) days'\)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(SHARE_LINK_DAYS);
  });

  it("is read, never typed, wherever it is minted or said", () => {
    expect(src("app/(app)/deals/[id]/share-actions.ts")).toContain("const SHARE_DAYS = SHARE_LINK_DAYS;");
    expect(src("app/(app)/deals/[id]/share-control.tsx")).toContain("expires after {SHARE_LINK_DAYS} days");
    expect(src("lib/share-resolve.ts")).toContain("share links live for ${SHARE_LINK_DAYS} days");
  });
});

describe("the compare page's deals", () => {
  it("are cut where the pipeline's pick stops", () => {
    expect(COMPARE_MAX).toBe(4);
    expect(src("app/(app)/deals/compare/page.tsx")).toContain(".slice(0, COMPARE_MAX)");
    const pipeline = src("app/(app)/deals/pipeline.tsx");
    expect(pipeline).toContain('import { COMPARE_MAX } from "@/lib/link-limits"');
    expect(pipeline).not.toMatch(/const COMPARE_MAX = \d/);
    expect(pipeline).toContain("`Select 2–${COMPARE_MAX} deals to compare.`");
  });
});
