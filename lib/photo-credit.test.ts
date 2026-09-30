import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GalleryCreditText, SkylineCreditText } from "@/app/photo-credit";
import { CityPhoto } from "@/app/city-photo";
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

  it("gives a grid one line: each photographer and licence once, each linked where it can be, the same words as galleryCredit", () => {
    const ids = Object.keys(SKYLINES);
    const markup = html(React.createElement(GalleryCreditText, { ids }));
    expect(words(markup)).toBe(galleryCredit(ids));
    const parts = galleryCreditParts(ids)!;
    const links = hrefs(markup);
    for (const a of parts.authors) expect(links).toContain(a.url);
    for (const l of parts.licenses) if (l.url) expect(links).toContain(l.url);
    expect(new Set(parts.authors.map((a) => a.name)).size).toBe(parts.authors.length);
    expect(a11yIssues(markup)).toEqual([]);
    expect(html(React.createElement(GalleryCreditText, { ids: ["atlantis"] }))).toBe("");
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
