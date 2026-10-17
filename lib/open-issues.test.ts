// The data-health page counts every open issue (research pass 42, L3): it
// headed the newest fifty with their own count, and read a failed read as
// "Nothing open".
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ISSUES_LISTED, openIssuesCount, openIssuesCutLine } from "./open-issues";

describe("the open issues' count", () => {
  it("is every open issue beside the heading, and the cut is said", () => {
    expect(ISSUES_LISTED).toBe(50);
    expect(openIssuesCount(50, 73)).toBe(73);
    expect(openIssuesCount(12, 12)).toBe(12);
    expect(openIssuesCount(12, null)).toBe(12);
    expect(openIssuesCutLine(50, 73)).toBe("The newest 50 of 73 open issues are listed.");
    expect(openIssuesCutLine(12, 12)).toBeNull();
    expect(openIssuesCutLine(50, null)).toBeNull();
  });

  it("the page reads the exact count and says a failed read", () => {
    const page = readFileSync("app/(app)/data-health/page.tsx", "utf8");
    expect(page).toContain('supabase.from("data_issues").select("id", { count: "exact", head: true }).is("resolved_at", null)');
    expect(page).toContain("openIssuesCount(issues.length, issueTotal)");
    expect(page).toContain("Couldn’t read the open issues just now");
    expect(page).not.toMatch(/\.limit\(50\)/);
  });
});
