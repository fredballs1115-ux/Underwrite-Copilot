/**
 * The pipeline page's news strip. It read "News for your markets" over
 * market_intel_items, a table every account shares (migration 0024) whose
 * rows carry no market, with no date on any story. It is titled for what it
 * is now, and each story prints its own date where its feed gave one.
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewsStrip, storyDate, type NewsStripItem } from "@/app/(app)/deals/news-strip";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const ITEMS: NewsStripItem[] = [
  {
    url: "https://news.example/a",
    title: "Lenders ease multifamily standards",
    source: "Example Wire",
    relevance: 8,
    published_at: "2026-09-29T14:05:00.000Z",
  },
  {
    url: "https://news.example/b",
    title: "eviction rules tighten in the county",
    source: "Example Daily",
    relevance: 6,
    published_at: null,
  },
  {
    url: "https://news.example/c",
    title: "Office vacancy at a new high",
    source: null,
    relevance: null,
    published_at: "2026-09-28T09:00:00.000Z",
  },
];

describe("the pipeline's news strip", () => {
  it("is titled for what it is — no claim of the reader's markets — and dates each story", () => {
    const html = renderToStaticMarkup(React.createElement(NewsStrip, { items: ITEMS }));
    const text = visibleText(html);
    expect(text).toContain("CRE news");
    expect(text).not.toMatch(/your markets/i);
    expect(html).toContain('<time dateTime="2026-09-29T14:05:00.000Z">Sep 29, 2026</time>');
    expect(html).toContain('<time dateTime="2026-09-28T09:00:00.000Z">Sep 28, 2026</time>');
    expect(text).toContain("Example Wire · Sep 29, 2026");
    // A story whose feed gave no date says none, rather than a made-up one.
    expect(text).toMatch(/Example Daily(?! ·)/);
    expect(html.match(/<time /g)).toHaveLength(2);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("renders nothing until the sweep has a story", () => {
    expect(renderToStaticMarkup(React.createElement(NewsStrip, { items: [] }))).toBe("");
  });

  it("reads a date only where there is one", () => {
    expect(storyDate("2026-09-29T14:05:00.000Z")).toBe("Sep 29, 2026");
    expect(storyDate(null)).toBeNull();
    expect(storyDate("not a date")).toBeNull();
  });
});
