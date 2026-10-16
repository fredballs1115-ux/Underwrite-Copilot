/**
 * The pipeline page's news strip. It had listed the weekday sweep's stories
 * with their relevance chips and a line saying they were scored for a small
 * East Coast 2–4 unit buyer, not the reader's box — honest, and read as
 * broken on a new reader's first screen (signed-in gaps, H6). It now draws
 * the News page's live headlines with the publishers' own pictures, each
 * headline its link, its publisher and its day.
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewsStrip, STRIP_SIZE, storyDate, stripHeadlines } from "@/app/(app)/deals/news-strip";
import type { RankedHeadline } from "@/lib/news/feeds";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const H = (over: Partial<RankedHeadline> & Pick<RankedHeadline, "url" | "title">): RankedHeadline => ({
  publisher: "Example Wire",
  publisherUrl: null,
  publishedAt: null,
  snippet: "",
  sourceId: "example",
  image: null,
  score: 1,
  ...over,
});

const HEADLINES: RankedHeadline[] = [
  H({ url: "https://news.example/a", title: "Lenders ease multifamily standards", publishedAt: "2026-09-29T14:05:00.000Z" }),
  H({
    url: "https://news.example/b",
    title: "Eviction rules tighten in the county",
    publisher: "Example Daily",
    publisherUrl: "https://daily.example",
    image: "https://img.example/b.jpg",
  }),
  H({
    url: "https://news.example/c",
    title: "Office vacancy at a new high",
    publishedAt: "2026-09-28T09:00:00.000Z",
    image: "https://img.example/c.jpg",
  }),
  H({ url: "https://news.example/d", title: "Cap rates hold", image: "https://img.example/d.jpg", publishedAt: "2026-09-27T09:00:00.000Z" }),
];

describe("the pipeline's news strip", () => {
  it("draws the live headlines with the publishers' pictures, and no score or buyer profile", () => {
    const html = renderToStaticMarkup(React.createElement(NewsStrip, { headlines: HEADLINES }));
    const text = visibleText(html);
    expect(text).toContain("CRE news");
    expect(text).not.toMatch(/your markets/i);
    // No relevance chip and no sweep's buyer profile: the live layer is
    // scored for nobody.
    expect(text).not.toMatch(/\d+\/10|AI-scored|2–4 unit buyer|buy box/);
    expect(html).not.toMatch(/Relevance/);
    // Three, the pictured ones first in ranked order.
    expect(html.match(/<li/g)).toHaveLength(STRIP_SIZE);
    for (const src of ["https://img.example/b.jpg", "https://img.example/c.jpg", "https://img.example/d.jpg"]) {
      expect(html).toContain(`src="${src}"`);
    }
    expect(text).not.toContain("Lenders ease multifamily standards");
    // Each headline its link, its publisher (linked where the feed names a
    // home) and its day, UTC's and said so.
    expect(html).toMatch(/<a href="https:\/\/news\.example\/b"[^>]*>Eviction rules tighten in the county<\/a>/);
    expect(html).toMatch(/<a href="https:\/\/daily\.example"[^>]*>Example Daily<\/a>/);
    expect(html).toContain('<time dateTime="2026-09-28T09:00:00.000Z">Sep 28, 2026 UTC</time>');
    expect(text).toContain("Example Wire · Sep 28, 2026 UTC");
    // A story whose feed gave no date says none, rather than a made-up one.
    expect(text).toMatch(/Example Daily(?! ·)/);
    expect(html.match(/<time /g)).toHaveLength(2);
    // The pictures are the publishers', decorative beside their headlines.
    expect(html).toContain('alt=""');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("fills a slot with a story the feed gave no picture only where too few have one", () => {
    const one = stripHeadlines([HEADLINES[0], HEADLINES[1], H({ url: "https://news.example/e", title: "Rates" })]);
    expect(one.map((h) => h.url)).toEqual(["https://news.example/a", "https://news.example/b", "https://news.example/e"]);
    const html = renderToStaticMarkup(React.createElement(NewsStrip, { headlines: one }));
    // The plate holds the publisher's name, hidden from a screen reader,
    // which reads the byline under it.
    expect(html).toMatch(/<div aria-hidden="true"[^>]*>Example Wire<\/div>/);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("renders nothing until a publisher has answered", () => {
    expect(renderToStaticMarkup(React.createElement(NewsStrip, { headlines: [] }))).toBe("");
  });

  it("reads a date only where there is one, said as the UTC day it is", () => {
    expect(storyDate("2026-09-29T14:05:00.000Z")).toBe("Sep 29, 2026 UTC");
    // 9 pm Eastern on Sep 29 is Sep 30 in UTC: the label says whose day.
    expect(storyDate("2026-09-29T21:00:00-04:00")).toBe("Sep 30, 2026 UTC");
    expect(storyDate(null)).toBeNull();
    expect(storyDate("not a date")).toBeNull();
  });
});
