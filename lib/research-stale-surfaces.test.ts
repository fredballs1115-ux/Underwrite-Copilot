import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceLink } from "@/app/(app)/deals/[id]/research-panel";
import { MarketsMarquee } from "@/app/markets-marquee";
import { MarketsGallery } from "@/app/markets-gallery";
import { MarketCompare } from "@/app/market/market-compare";
import { COMPARE_METROS } from "@/app/market/compare-metros";
import { LeaderboardTable } from "@/app/market/tracker-boards";
import { sectorLeaderboard } from "./sector-leaderboard";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

/**
 * Every surface that prints a research or tracker date, drawn on a day
 * before its crossing and the day after (lib/research-age: 180 days, the
 * deal page's own limit). Past it the date stays, with its age and the
 * stale mark; the figures stay too. Before it, nothing changes.
 *
 * The market tracker's snapshot was read 2026-08-25 (current through Feb
 * 21, 2027); the sector files 2026-08-21 (through Feb 17, 2027).
 */
const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const text = (html: string) => visibleText(html).replace(/\s+/g, " ").trim();

describe("the deal page's research panel — its source line", () => {
  const rule = (today: string) =>
    render(React.createElement(SourceLink, { source: null, asOf: "2026-08-21", status: "verified", today }));

  it("a rule's date is current through its 180th day and stale, with its age, from the next", () => {
    expect(text(rule("2027-02-17"))).toBe("verified as of 2026-08-21");
    const html = rule("2027-02-18");
    expect(text(html)).toBe("verified as of 2026-08-21 · 181 days old, stale");
    expect(html).toContain('data-qa="research-stale"');
  });

  it("a tracker row says the day it was read, and ages by the same rule", () => {
    const row = (today: string) =>
      text(render(React.createElement(SourceLink, { source: null, asOf: "2026-08-25", status: "sourced", today, readOn: true })));
    expect(row("2027-02-21")).toBe("sourced read 2026-08-25");
    expect(row("2027-02-22")).toBe("sourced read 2026-08-25 · 181 days old, stale");
  });

  it("a fair market rent keeps its fiscal year's rule, never the research rule's", () => {
    const fmr = (yearEnded: boolean) =>
      text(render(React.createElement(SourceLink, { source: null, asOf: "2026-09-30", status: "verified", today: "2027-06-01", yearEnded })));
    expect(fmr(false)).toBe("verified as of 2026-09-30");
    expect(fmr(true)).toBe("verified year ended");
  });

  it("an undated figure says undated, never stale", () => {
    expect(text(render(React.createElement(SourceLink, { source: null, asOf: "", status: "sourced", today: "2027-06-01" })))).toBe(
      "sourced undated",
    );
  });
});

describe("the homepage's band and gallery", () => {
  it("the band's heading says the day read, and its age and the stale mark past the limit", () => {
    const before = text(render(React.createElement(MarketsMarquee, { today: "2027-02-21" })));
    expect(before).toContain("covered markets — dated research, read Aug 25, 2026");
    expect(before).not.toContain("stale");
    const html = render(React.createElement(MarketsMarquee, { today: "2027-02-22" }));
    expect(text(html)).toContain("covered markets — dated research, read Aug 25, 2026 (181 days old, stale)");
    // The figures stay, each with its house and its own period.
    expect(text(html)).toContain("% vac (Colliers and CBRE, Q2 2026)");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("the gallery says nothing of the day while current, and the day, its age and the mark once stale", () => {
    const before = text(render(React.createElement(MarketsGallery, { today: "2027-02-21" })));
    expect(before).not.toContain("Research read");
    expect(before).not.toContain("stale");
    const html = render(React.createElement(MarketsGallery, { today: "2027-02-22" }));
    expect(text(html)).toContain("Research read Aug 25, 2026 (181 days old, stale).");
    expect(text(html)).toMatch(/% vac \(Q2 2026\)/);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });
});

describe("/market's research dates", () => {
  it("the compare card's asset-type line says the day read, then its age and the mark", () => {
    const line = (today: string) => text(render(React.createElement(MarketCompare, { metros: COMPARE_METROS, today })));
    expect(line("2027-02-21")).toMatch(/research read Aug 25, 2026(?! \()/);
    expect(line("2027-02-22")).toContain("research read Aug 25, 2026 (181 days old, stale)");
  });

  it("the sector leaderboard says the read's age and the mark under its heading, and keeps its figures", () => {
    const { rows, ranked, heldOpen } = sectorLeaderboard("office", "2027-02-22");
    const plain = text(render(React.createElement(LeaderboardTable, { sector: "office", rows, ranked, heldOpen })));
    expect(plain).not.toContain("stale");
    const html = render(
      React.createElement(LeaderboardTable, {
        sector: "office",
        rows,
        ranked,
        heldOpen,
        stale: "research read Aug 25, 2026 (181 days old, stale)",
      }),
    );
    expect(text(html)).toContain("Office across the covered markets");
    expect(text(html)).toContain("research read Aug 25, 2026 (181 days old, stale)");
    expect(html).toContain('data-qa="research-stale"');
    expect(a11yIssues(html)).toEqual([]);
  });
});
