// The buy box page's geography picker: each covered-market chip wears a
// thumbnail of its market's photograph, handed in from the server as plain
// data (lib/geo-chip-pictures), with one line under the chips crediting every
// photograph they show, as the licences ask.
import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { GeoPicker } from "@/app/(app)/criteria/geo-picker";
import { CHIP_PICTURE_WIDTH, coveredMarketChipPictures } from "@/lib/geo-chip-pictures";
import { coveredMarketGeoTargets } from "@/lib/market-match";
import { SKYLINE_WIDTHS, skylineCredit, skylineFor, skylineTag } from "@/lib/skyline";
import { metroAliasOf } from "@/lib/live-rates";
import { creditText, galleryCreditLineOf } from "@/lib/credit-parts";
import metrosSeed from "@/data/research/metros.json";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const h = React.createElement;

describe("the geography picker's covered-market chips, each with its market's photograph", () => {
  const pictures = coveredMarketChipPictures();
  const suggestions = coveredMarketGeoTargets();

  it("gives every covered market the photograph its market is known by, its metro's where it has none", () => {
    for (const m of metrosSeed.metros) {
      const id = skylineFor(m.id) ? m.id : metroAliasOf(m.id) && skylineFor(metroAliasOf(m.id)!) ? metroAliasOf(m.id)! : null;
      const pic = pictures[m.name as string];
      if (!id) {
        expect(pic, m.id).toBeUndefined();
        continue;
      }
      expect(pic, m.id).toEqual({
        src: `/api/imagery/skyline/${encodeURIComponent(id)}?w=${CHIP_PICTURE_WIDTH}&v=${skylineTag(id)}`,
        credit: skylineCredit(skylineFor(id)!),
      });
    }
    // Asked at a width the route serves, so no request is snapped.
    expect(SKYLINE_WIDTHS).toContain(CHIP_PICTURE_WIDTH);
    // Keyed by the chip's own label, so every chip finds its picture.
    expect(suggestions.filter((s) => pictures[s.label]).length).toBe(Object.keys(pictures).length);
    expect(Object.keys(pictures).length).toBeGreaterThan(10);
  });

  it("draws a thumbnail on each chip and one credit line naming every photograph shown, with nothing to lint", () => {
    const initial = [suggestions[0]];
    const html = renderToStaticMarkup(h(GeoPicker, { initial, suggestions, pictures }));
    const thumbs = html.match(/data-picture="geo-chip"/g) ?? [];
    expect(thumbs.length).toBe(suggestions.filter((s) => pictures[s.label]).length);
    // Every photograph on screen is credited, the line built from the
    // credits as data by the gallery line's own builder.
    const credits = suggestions.map((s) => pictures[s.label]).filter(Boolean).map((p) => p!.credit);
    const line = creditText(galleryCreditLineOf(credits)!);
    const text = visibleText(html);
    const said = html
      .match(/<p[^>]*data-qa="geo-credit"[^>]*>([\s\S]*?)<\/p>/)![1]
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    expect(said).toBe(line);
    expect(line).toMatch(/^Photographs by /);
    expect(line).toContain("cropped to fit");
    expect(html).toContain('data-qa="geo-credit"');
    // Each photographer linked to the photograph's page, each licence to its text.
    expect(html).toContain('href="https://commons.wikimedia.org/wiki/File:');
    // The chosen chip keeps its picture; the hidden field carries the
    // territories alone, never a picture's URL.
    const hidden = html.match(/<input type="hidden" name="geos" value="([^"]*)"/)![1];
    expect(hidden).not.toContain("imagery");
    expect(text).toContain("Covered markets, one tap:");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("draws no picture and no credit where it is handed none", () => {
    const html = renderToStaticMarkup(h(GeoPicker, { initial: [], suggestions }));
    expect(html).not.toContain('data-picture="geo-chip"');
    expect(html).not.toContain('data-qa="geo-credit"');
    expect(a11yIssues(html)).toEqual([]);
  });

  it("is handed its pictures by the page, and never loads the skyline table itself", () => {
    const picker = readFileSync("app/(app)/criteria/geo-picker.tsx", "utf8");
    expect(picker).toMatch(/^"use client";/);
    expect(picker).not.toMatch(/from "@\/lib\/skyline"/);
    expect(picker).toMatch(/import type \{ ChipPicture \} from "@\/lib\/geo-chip-pictures";/);
    const page = readFileSync("app/(app)/criteria/page.tsx", "utf8");
    expect(page).toContain("pictures={coveredMarketChipPictures()}");
  });
});
