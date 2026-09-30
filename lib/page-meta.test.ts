import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Metadata } from "next";
import { metadata as why } from "@/app/why/page";
import { metadata as whatsNew } from "@/app/whats-new/page";
import { metadata as security } from "@/app/security/page";
import { metadata as privacy } from "@/app/privacy/page";
import { metadata as terms } from "@/app/terms/page";
import { metadata as tools } from "@/app/tools/page";
import { metadata as login } from "@/app/login/page";
import { changelogSince } from "./changelog";
import { SITE_CARD, marketMeta, marketPageFor, sectorPageFor } from "./public-pages";
import { SITE_NAME, publicMetadata } from "./page-meta";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// The root layout's title template, read out of the file rather than
// imported: the layout loads next/font, which only runs under Next.
const TEMPLATE = /template:\s*"([^"]+)"/.exec(read("app/layout.tsx"))?.[1] ?? "";

/** The <title> a page's metadata renders under the root layout. */
function renderedTitle(m: Metadata): string {
  const t = m.title;
  if (typeof t === "string") return TEMPLATE.replace("%s", t);
  if (t && typeof t === "object" && "absolute" in t) return t.absolute;
  throw new Error(`a title Next would not render: ${JSON.stringify(t)}`);
}

const PAGES: Array<[string, Metadata]> = [
  ["/why", why],
  ["/whats-new", whatsNew],
  ["/security", security],
  ["/privacy", privacy],
  ["/terms", terms],
  ["/tools", tools],
  ["/login", login],
];

describe("each public page states its own canonical and link preview", () => {
  it("reads the root layout's title template", () => {
    expect(TEMPLATE).toBe(`%s · ${SITE_NAME}`);
  });

  it.each(PAGES)("%s is its own canonical, and previews as itself with the site's card", (path, m) => {
    expect(m.alternates?.canonical).toBe(path);
    const og = m.openGraph as Record<string, unknown>;
    expect(og.url, "a preview's url is the page's, never the homepage's").toBe(path);
    expect(og.siteName).toBe(SITE_NAME);
    expect(og.description).toBe(m.description);
    // A replaced openGraph drops the root's picture unless it carries one.
    expect(og.images).toEqual([SITE_CARD]);
    const tw = m.twitter as Record<string, unknown>;
    expect(tw.card).toBe("summary_large_image");
    expect(tw.images).toEqual([SITE_CARD]);
    expect(tw.description).toBe(m.description);
  });

  it.each(PAGES)("%s names the site once in its title", (_path, m) => {
    const title = renderedTitle(m);
    expect(title.split(SITE_NAME).length - 1, title).toBe(1);
  });

  it.each(PAGES)("%s has a description a search result can show", (_path, m) => {
    // A meta description is a line under a search result: /tools' ran to
    // 3,317 characters, every card on the page listed in prose.
    expect(typeof m.description).toBe("string");
    expect((m.description as string).length).toBeGreaterThan(40);
    expect((m.description as string).length).toBeLessThanOrEqual(200);
  });

  it("keeps /tools' figures out of the Referer header", () => {
    // Its links carry the figures typed into it in the query string.
    expect(tools.referrer).toBe("no-referrer");
    expect((tools.description as string).length).toBeLessThanOrEqual(160);
  });

  it("says how far /whats-new's log reaches back, from the log", () => {
    // The log starts mid-way through the product's life, so "every
    // improvement" was not true; the month is read off its oldest entry.
    const since = changelogSince();
    expect(since).not.toBeNull();
    expect(whatsNew.description).toContain(`Product improvements to Underwrite Copilot since ${since},`);
    expect(whatsNew.description).not.toMatch(/\bevery\b/i);
  });

  it("titles /tools and /why the way a reader sees them", () => {
    expect(renderedTitle(tools)).toBe(`Deal math · ${SITE_NAME}`);
    expect(renderedTitle(why)).toBe("Why Underwrite Copilot");
  });

  it("is the market pages' own shape too, which go through the same helper", () => {
    const pitt = publicMetadata(marketMeta(marketPageFor("pittsburgh"), null));
    expect(pitt.alternates?.canonical).toBe("/market?metro=pittsburgh");
    expect(renderedTitle(pitt)).toBe(`Pittsburgh PA market data: rents, vacancy, jobs and supply · ${SITE_NAME}`);
    expect((pitt.openGraph as Record<string, unknown>).images).toEqual([
      { url: "/api/og/market/pittsburgh", width: 1200, height: 630, alt: "Pittsburgh PA market data, over the market's own photograph" },
    ]);
    const office = publicMetadata(marketMeta(null, sectorPageFor("office")));
    expect((office.twitter as Record<string, unknown>).images).toEqual([SITE_CARD]);
    expect(read("app/market/page.tsx")).toContain("publicMetadata(marketMeta(");
  });
});
