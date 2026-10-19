// The team header's members as faces: overlapping PersonBadges, six at most
// and then "+N", each named for a screen reader since no name is written
// beside it.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TEAM_FACES_MAX, TeamFaces } from "@/app/(app)/team/team-faces";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const member = (i: number) => ({ userId: `u${i}`, fullName: i % 2 ? `Person ${i}` : null, email: `person${i}@example.com` });
const team = (n: number) => Array.from({ length: n }, (_, i) => member(i + 1));

describe("TeamFaces — who is on the team, at a glance", () => {
  it("draws every member of a small team, each named", () => {
    const html = renderToStaticMarkup(React.createElement(TeamFaces, { members: team(3) }));
    expect(html).toContain('data-qa="team-faces"');
    expect((html.match(/data-person-badge=/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-label="Person 1"');
    expect(html).not.toContain("team-faces-more");
    expect(html).toContain("-space-x-2");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("stops at six and counts the rest", () => {
    const html = renderToStaticMarkup(React.createElement(TeamFaces, { members: team(9) }));
    expect((html.match(/data-person-badge=/g) ?? []).length).toBe(TEAM_FACES_MAX);
    expect(html).toContain('data-qa="team-faces-more"');
    expect(html).toContain('aria-label="and 3 more"');
    expect(visibleText(html)).toContain("+3");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("shows exactly six with no count, and nothing for an empty roster", () => {
    expect(renderToStaticMarkup(React.createElement(TeamFaces, { members: team(6) }))).not.toContain("team-faces-more");
    expect(renderToStaticMarkup(React.createElement(TeamFaces, { members: [] }))).toBe("");
  });
});
