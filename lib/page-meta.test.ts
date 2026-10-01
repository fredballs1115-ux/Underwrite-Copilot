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
import { metadata as notFound } from "@/app/not-found";
import sitemap from "@/app/sitemap";
import { changelogSince, latestChange } from "./changelog";
import { SITE_CARD, marketMeta, marketPageFor, marketPages, sectorPageFor } from "./public-pages";
import { SITE_NAME, marketHeading, publicMetadata } from "./page-meta";

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

  it("dates a sitemap entry only where the page can say when it changed", () => {
    // Every entry had been stamped with the moment of the request, telling a
    // crawler that every page changed on every fetch. /whats-new can say:
    // its newest entry is the day it last changed.
    const entries = sitemap();
    const whatsNewEntry = entries.find((e) => e.url.endsWith("/whats-new"));
    expect(whatsNewEntry?.lastModified).toBe(latestChange()?.date);
    for (const e of entries) {
      if (e !== whatsNewEntry) expect(e.lastModified, e.url).toBeUndefined();
    }
    // The rest of each entry is as it was, and the market pages are all
    // still there, from the one catalogue.
    expect(entries.every((e) => e.changeFrequency && typeof e.priority === "number")).toBe(true);
    expect(entries.filter((e) => e.url.includes("/market?metro=")).length).toBe(marketPages().length);
  });

  it("keeps the 404 out of the index, and says nothing else about it", () => {
    // The root layout indexes every page; the 404 carried its
    // "index, follow" beside Next's own "noindex". Its own robots
    // replaces the layout's, and says noindex alone.
    expect(read("app/layout.tsx")).toMatch(/robots:\s*\{\s*index:\s*true,\s*follow:\s*true\s*\}/);
    expect(notFound.robots).toEqual({ index: false });
  });

  it("names the homepage's organization by a logo Google will take", () => {
    // Google asks for a logo of at least 112px; the favicon is 32.
    const route = /logo:\s*`\$\{SITE_URL\}\/([a-z-]+)`/.exec(read("app/page.tsx"))?.[1];
    expect(route).toBe("apple-icon");
    const size = /size = \{ width: (\d+), height: (\d+) \}/.exec(read(`app/${route}.tsx`));
    expect(size, `app/${route}.tsx declares its size`).not.toBeNull();
    expect(Number(size![1])).toBeGreaterThanOrEqual(112);
    expect(Number(size![2])).toBeGreaterThanOrEqual(112);
  });

  it("names the metro in a metro page's one h1, as its title does", () => {
    // Forty-odd metro pages shared the h1 "The covered markets", the metro
    // only a sub-heading further down.
    expect(marketHeading(marketPageFor("pittsburgh"))).toBe("Pittsburgh PA market data");
    expect(marketHeading(null)).toBe("The covered markets");
    for (const p of marketPages()) {
      expect(marketMeta(p, null).title.startsWith(`${marketHeading(p)}:`), p.id).toBe(true);
    }
    const src = read("app/market/page.tsx");
    expect(src).toContain("const pageMetro = marketPageFor(metroParam);");
    expect(src).toMatch(/<h1[^>]*>\s*\{marketHeading\(pageMetro\)\}\s*<\/h1>/);
    // One h1 a page: the signed-in reader's and everyone else's are the two
    // arms of one choice, and the metro's band keeps its section heading.
    expect(src.match(/<h1\b/g)?.length).toBe(2);
    for (const f of ["app/market/page.tsx", "app/market/read-only-metro.tsx"]) {
      expect(read(f), f).not.toMatch(/<MarketBand[^>]*as="h1"/);
    }
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
