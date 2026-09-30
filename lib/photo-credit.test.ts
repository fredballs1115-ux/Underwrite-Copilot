import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GalleryCreditText, SkylineCreditText } from "@/app/photo-credit";
import { CityPhoto } from "@/app/city-photo";
import { HERO_STRIP, MarketBand, PlaceBackdrop, PlaceBand } from "@/app/place-band";
import { a11yIssues, gluedWords, visibleText } from "@/lib/render-lint";
import { SKYLINES, commonsPage, creditLine, galleryCredit, galleryCreditParts, skylineCredit } from "@/lib/skyline";

// A Creative Commons credit carries the creator, a link to the work, the
// licence with a link to its text, and that the work was modified (CC BY-SA
// 4.0 §3(a)(1)). The credits printed the name and the licence's short name
// as plain text; these hold every credit the site draws to all four.

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
/** The words as read: visibleText breaks a line after each link. */
const words = (markup: string) => visibleText(markup).replace(/\n/g, "");
const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

describe("a market photograph's credit, with its links", () => {
  it("says creditLine's words for every photograph in the table, the photographer linked to the file's page and the licence to its text", () => {
    for (const [id, shot] of Object.entries(SKYLINES)) {
      const markup = html(React.createElement(SkylineCreditText, { shot }));
      expect(words(markup), id).toBe(creditLine(shot));
      expect(creditLine(shot), id).toMatch(/cropped to fit$/);
      const links = hrefs(markup);
      expect(links, id).toContain(commonsPage(shot.file));
      if (shot.licenseUrl) expect(links, id).toContain(shot.licenseUrl);
      else expect(links, id).toHaveLength(1);
      expect(a11yIssues(markup), id).toEqual([]);
      expect(gluedWords(visibleText(markup)), id).toEqual([]);
    }
  });

  it("links nothing a public-domain photograph does not ask for", () => {
    const pd = Object.values(SKYLINES).find((s) => !s.licenseUrl);
    expect(pd, "a public-domain file is in the table").toBeTruthy();
    expect(skylineCredit(pd!).license.url).toBe("");
  });

  it("gives a grid one line: every photograph shown linked to its own page, each photographer and licence named once, the same words as galleryCredit", () => {
    const ids = Object.keys(SKYLINES);
    const markup = html(React.createElement(GalleryCreditText, { ids }));
    expect(words(markup)).toBe(galleryCredit(ids));
    const links = hrefs(markup);
    // Every photograph the grid shows, not only each photographer's first:
    // a photographer with several had the rest linked nowhere.
    for (const id of ids) expect(links, id).toContain(commonsPage(SKYLINES[id].file));
    const pages = links.filter((l) => l.startsWith("https://commons.wikimedia.org/"));
    expect(new Set(pages).size, "each page linked once").toBe(pages.length);
    const parts = galleryCreditParts(ids)!;
    for (const l of parts.licenses) if (l.url) expect(links).toContain(l.url);
    expect(new Set(parts.authors.map((a) => a.name)).size).toBe(parts.authors.length);
    expect(parts.authors.some((a) => a.photos.length > 1), "the table has a photographer with several files").toBe(true);
    expect(a11yIssues(markup)).toEqual([]);
    expect(gluedWords(visibleText(markup))).toEqual([]);
    expect(html(React.createElement(GalleryCreditText, { ids: ["atlantis"] }))).toBe("");
  });

  it("names a photographer with several photographs shown once, and links each photograph by what it shows", () => {
    // The homepage's case: one photographer took both of these, and the
    // second was linked nowhere.
    const [a, b] = [SKYLINES.richmond, SKYLINES.norfolk_hampton_roads];
    expect(a.credit, "the table's own photographer for both").toBe(b.credit);
    const markup = html(React.createElement(GalleryCreditText, { ids: ["richmond", "norfolk_hampton_roads"] }));
    const text = words(markup);
    expect(text).toContain(`${a.credit} (${a.place}; ${b.place})`);
    expect(text.split(a.credit).length - 1).toBe(1);
    const links = hrefs(markup);
    expect(links).toContain(commonsPage(a.file));
    expect(links).toContain(commonsPage(b.file));
    // Each place is the link to its own photograph.
    expect(markup).toContain(`href="${commonsPage(a.file)}" target="_blank" rel="noreferrer" class="underline decoration-dotted underline-offset-2">${a.place}</a>`);
    expect(markup).toContain(`href="${commonsPage(b.file)}" target="_blank" rel="noreferrer" class="underline decoration-dotted underline-offset-2">${b.place}</a>`);
    // One photograph alone is its photographer's name, linked.
    const one = html(React.createElement(GalleryCreditText, { ids: ["richmond"] }));
    expect(one).toContain(`>${a.credit}</a>`);
    expect(words(one)).not.toContain(a.place);
  });

  it("puts a band's credit after the band's words, so Tab and a screen reader meet the words first", () => {
    // The credit is drawn at the band's foot but sat first in the markup:
    // on the homepage Tab reached the photographer before "Get started free".
    const shot = SKYLINES.chicago;
    const cta = React.createElement("a", { href: "/login?mode=signup" }, "Get started free");
    const bands: Array<[string, string]> = [
      ["PlaceBand", html(React.createElement(PlaceBand, { metro: "chicago" } as React.ComponentProps<typeof PlaceBand>, cta))],
      ["PlaceBackdrop", html(React.createElement(PlaceBackdrop, { metro: "chicago", scrim: "hero" }, cta))],
      ["MarketBand", html(React.createElement(MarketBand, { metro: "chicago", eyebrow: "Midwest", name: "Chicago" }))],
    ];
    for (const [name, markup] of bands) {
      const picture = markup.indexOf("<img");
      const said = name === "MarketBand" ? markup.indexOf(">Chicago</h3>") : markup.indexOf(">Get started free</a>");
      const credit = markup.indexOf(`href="${commonsPage(shot.file)}"`);
      expect(picture, name).toBeGreaterThan(-1);
      expect(said, name).toBeGreaterThan(picture);
      expect(credit, name).toBeGreaterThan(said);
      expect(words(markup), name).toContain(creditLine(shot));
      expect(a11yIssues(markup), name).toEqual([]);
    }
    // Drawn where it always was: in a box of the picture's own shape, which
    // lets clicks through to the words under it; the credit takes its own.
    const hero = bands[1][1];
    const box = `<div class="pointer-events-none ${HERO_STRIP}">`;
    expect(hero.split(box).length - 1, "the picture's box and the credit's").toBe(2);
    expect(hero.slice(hero.lastIndexOf(box))).toMatch(/^<div[^>]*><p class="pointer-events-auto absolute bottom-3 right-4/);
    expect(bands[0][1]).toContain('<div class="pointer-events-none absolute inset-0"><p class="pointer-events-auto');
    // A market with no picture at all draws its words alone.
    expect(html(React.createElement(PlaceBackdrop, { metro: "atlantis" }, cta))).toBe('<a href="/login?mode=signup">Get started free</a>');
    // Every page that draws a backdrop hands it its words.
    for (const file of ["app/page.tsx", "app/tools/page.tsx", "app/login/page.tsx", "app/place-band.tsx"]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, file).toMatch(/<PlaceBackdrop\b/);
      expect(src, file).not.toMatch(/<PlaceBackdrop\b[^>]*\/>/);
    }
  });

  it("draws the linked credit under a market's band", () => {
    const shot = SKYLINES.chicago;
    expect(shot).toBeTruthy();
    const markup = html(React.createElement(CityPhoto, { metro: "chicago", width: 1400, height: 420 }));
    expect(words(markup)).toContain(creditLine(shot));
    expect(hrefs(markup)).toContain(commonsPage(shot.file));
    // The backdrop lets clicks through; the credit takes them back.
    expect(markup).toMatch(/<p class="pointer-events-auto/);
  });
});
