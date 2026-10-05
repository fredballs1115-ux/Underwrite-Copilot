import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MARKET_CAPTION, MARKET_CAPTION_SCRIM, MarketCaption, marketCaptionScrim } from "@/app/(app)/deals/market-caption";

/**
 * A market photograph's caption (#438), held to the contrast floor — the
 * way lib/place-band.contrast.test.ts holds the bands.
 *
 * Research pass 29 measured the caption over all 209 served photographs:
 * its 9px "MARKET PHOTO" eyebrow read under 4.5:1 at its worst pixel on 94
 * of them on a phone's card, 155 on a tablet's and 121 in the deal page's
 * header, and the credit failed too, because the old scrim was relative to
 * a box the words wrapped inside — 45% black at its middle, clear at its
 * top, and the eyebrow sat at its top.
 *
 * As there, this is arithmetic against the WORST photograph a market could
 * have, a frame that is pure white in every pixel, and the stops are READ
 * BACK from what the component paints — the style attribute of the rendered
 * caption, resolved for the caption's own height — never restated here.
 */

type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
/** WCAG relative luminance. */
function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
/** `top` at `alpha` over `bottom`, composited in sRGB as the browser does. */
function over(top: RGB, alpha: number, bottom: RGB): RGB {
  return bottom.map((b, i) => alpha * top[i] + (1 - alpha) * b) as RGB;
}
function contrast(fg: RGB, bg: RGB): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

type Size = keyof typeof MARKET_CAPTION;
const SIZES = Object.keys(MARKET_CAPTION) as Size[];

/** The caption as the page draws it, at a size. */
const drawn = (size: Size) =>
  renderToStaticMarkup(React.createElement(MarketCaption, { market: "Pittsburgh PA", credit: "EEJCC · CC BY-SA 4.0 · cropped to fit", size }));

/** The rendered caption's own style, decoded: what the browser paints. */
function styleOf(html: string): Record<string, string> {
  const raw = /<span data-picture="market" style="([^"]*)"/.exec(html)?.[1] ?? "";
  const css = raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const out: Record<string, string> = {};
  // Split on the semicolons between declarations, never inside the gradient.
  for (const decl of css.split(/;(?![^(]*\))/)) {
    const at = decl.indexOf(":");
    if (at > 0) out[decl.slice(0, at).trim()] = decl.slice(at + 1).trim();
  }
  return out;
}

/** A gradient's stops, black with an alpha each, at a position resolved for
 *  a box `height` px tall: `Npx`, `N%` or `calc(100% - Npx)`, from the foot
 *  (the gradient runs to the top). */
function stopsOf(gradient: string, height: number): Array<[number, number]> {
  expect(gradient.startsWith("linear-gradient(to top,"), gradient).toBe(true);
  const out: Array<[number, number]> = [];
  const stop = /rgba\(0, 0, 0, ([\d.]+)\) (calc\(100% - ([\d.]+)px\)|([\d.]+)px|([\d.]+)%)/g;
  for (const m of gradient.matchAll(stop)) {
    const y = m[3] !== undefined ? height - Number(m[3]) : m[4] !== undefined ? Number(m[4]) : (Number(m[5]) / 100) * height;
    out.push([y, Number(m[1])]);
  }
  expect(out.length, `stops in ${gradient}`).toBeGreaterThanOrEqual(3);
  return out;
}

/** Linear interpolation along the stops, as CSS does it. */
function alphaAt(y: number, stops: Array<[number, number]>): number {
  if (y <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [y0, a0] = stops[i];
    const [y1, a1] = stops[i + 1];
    if (y >= y0 && y <= y1) return y1 === y0 ? a1 : a0 + ((a1 - a0) * (y - y0)) / (y1 - y0);
  }
  return stops[stops.length - 1][1];
}

/** A line's type, read off its classes: its size and line height in px, and
 *  its white's alpha. */
function typeOf(classes: string): { size: number; line: number; white: number; mt: number } {
  const size = Number(/\btext-\[(\d+(?:\.\d+)?)px\]/.exec(classes)?.[1]);
  const line = Number(/\bleading-\[(\d+(?:\.\d+)?)px\]/.exec(classes)?.[1]);
  const white = /\btext-white(?:\/(\d+))?\b/.exec(classes);
  const mt = /\bmt-(\d+(?:\.\d+)?)\b/.exec(classes);
  expect(size, classes).toBeGreaterThan(0);
  expect(line, classes).toBeGreaterThanOrEqual(size);
  expect(white, classes).not.toBeNull();
  return { size, line, white: white![1] === undefined ? 1 : Number(white![1]) / 100, mt: mt ? Number(mt[1]) * 4 : 0 };
}

/** The caption's padding under the words, in px (Tailwind's 4px unit). */
const padBottom = (box: string) => Number(/\bpb-(\d+(?:\.\d+)?)\b/.exec(box)?.[1]) * 4;

/**
 * Where each line sits in a caption whose name wraps to `nameLines` and
 * credit to `creditLines`, in px up from the caption's foot, and the
 * caption's height: the credit under the name under the eyebrow, the fade
 * above them all.
 */
function layout(size: Size, nameLines: number, creditLines: number) {
  const g = MARKET_CAPTION[size];
  const eyebrow = typeOf(g.eyebrow);
  const name = typeOf(g.name);
  const credit = typeOf(g.credit);
  const pb = padBottom(g.box);
  const creditTop = pb + creditLines * credit.line;
  const nameFrom = creditTop + credit.mt;
  const nameTop = nameFrom + nameLines * name.line;
  const eyebrowTop = nameTop + eyebrow.line;
  return {
    height: eyebrowTop + g.fade,
    wordsTop: eyebrowTop,
    lines: [
      { line: "credit", from: pb, to: creditTop, white: credit.white },
      { line: "name", from: nameFrom, to: nameTop, white: name.white },
      { line: "eyebrow", from: nameTop, to: eyebrowTop, white: eyebrow.white },
    ],
  };
}

describe("the market caption is drawn from its constants", () => {
  it("paints the scrim and the fade the constants say, the fade above every word", () => {
    for (const size of SIZES) {
      const g = MARKET_CAPTION[size];
      const html = drawn(size);
      const style = styleOf(html);
      expect(style["padding-top"], size).toBe(`${g.fade}px`);
      expect(style["background-image"], size).toBe(marketCaptionScrim(g.fade));
      // No class pads the caption's top as well: the inline padding is the
      // fade, and the gradient's knee sits exactly on the words' top.
      const cls = /<span data-picture="market"[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
      expect(cls, size).not.toMatch(/(?:^|\s)(?:pt|py|p)-/);
      expect(cls, size).toContain(g.box);
      expect(cls, size).toContain("pointer-events-none");
    }
  });

  it("sets each line in its constant's type, the eyebrow off 9px and on one line, the name on two at most", () => {
    for (const size of SIZES) {
      const g = MARKET_CAPTION[size];
      const html = drawn(size);
      const lines = [...html.matchAll(/<span class="([^"]*)">/g)].map((m) => m[1]);
      expect(lines.find((c) => c.includes(g.eyebrow)), `${size} eyebrow`).toMatch(/\bwhitespace-nowrap\b/);
      expect(lines.find((c) => c.includes(g.name)), `${size} name`).toMatch(/\bline-clamp-2\b/);
      expect(lines.find((c) => c.includes(g.name)), `${size} name`).not.toMatch(/\btruncate\b/);
      expect(lines.find((c) => c.includes(g.credit)), `${size} credit`).toBeTruthy();
      // The call chip's 11px is the site's floor for words over a picture;
      // the credit, the smallest line, is a step under it, never 9px.
      expect(typeOf(g.eyebrow).size, size).toBeGreaterThanOrEqual(11);
      expect(typeOf(g.credit).size, size).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("white on the worst photograph there could be", () => {
  it("holds every line to AA at every point it can reach, however the name and the credit wrap", () => {
    // The name is clamped at two lines; the credit wraps where a long one
    // must (95 characters is the longest the table holds), so four lines
    // are checked. The scrim's stops are the caption's own box, so a taller
    // caption carries its words' alpha up with it.
    let checked = 0;
    for (const size of SIZES) {
      const html = drawn(size);
      const gradient = styleOf(html)["background-image"];
      for (const nameLines of [1, 2]) {
        for (const creditLines of [1, 2, 3, 4]) {
          const { height, lines } = layout(size, nameLines, creditLines);
          const stops = stopsOf(gradient, height);
          for (const { line, from, to, white } of lines) {
            for (let y = from; y <= to; y += 0.5) {
              const bg = over(BLACK, alphaAt(y, stops), WHITE);
              const ratio = contrast(over(WHITE, white, bg), bg);
              expect(ratio, `${size}: ${line} at ${y}px up (name ${nameLines}, credit ${creditLines})`).toBeGreaterThanOrEqual(4.5);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("is never lighter under the words than the words' alpha, which itself holds the faintest white", () => {
    const { words } = MARKET_CAPTION_SCRIM;
    for (const size of SIZES) {
      const g = MARKET_CAPTION[size];
      const faintest = Math.min(...[g.eyebrow, g.name, g.credit].map((c) => typeOf(c).white));
      const bg = over(BLACK, words, WHITE);
      expect(contrast(over(WHITE, faintest, bg), bg), size).toBeGreaterThanOrEqual(4.5);
      const { height, wordsTop } = layout(size, 2, 4);
      const stops = stopsOf(marketCaptionScrim(g.fade), height);
      for (let y = 0; y <= wordsTop; y += 0.5) expect(alphaAt(y, stops), `${size} ${y}px`).toBeGreaterThanOrEqual(words - 1e-9);
    }
  });
});

describe("a caption over a picture, not a box", () => {
  // The smallest picture each caption is drawn on: a card at the grid's
  // narrowest (17.5rem less its 1px border a side, at 16:10), and the deal
  // page's header on a 390px phone (16:9).
  const SMALLEST = { card: [278, 278 / 1.6], hero: [348, 348 / (16 / 9)] } as const;

  it("clears by the caption's top, so the photograph shows above the words", () => {
    for (const size of SIZES) {
      const { height } = layout(size, 1, 1);
      const stops = stopsOf(marketCaptionScrim(MARKET_CAPTION[size].fade), height);
      expect(stops[stops.length - 1], size).toEqual([height, 0]);
      // Eased across the fade, never a step: each stop up the fade is
      // lighter than the one under it.
      for (let i = 1; i < stops.length; i++) expect(stops[i][1], `${size} stop ${i}`).toBeLessThan(stops[i - 1][1]);
    }
  });

  it("leaves most of the smallest picture to the photograph with a one-line name and credit, and a third with both at two", () => {
    for (const size of SIZES) {
      const [, pictureH] = SMALLEST[size];
      const typical = layout(size, 1, 1);
      const longest = layout(size, 2, 2);
      // The words' band (at least the words' alpha) and the picture left
      // clear above the whole caption.
      expect(typical.wordsTop / pictureH, `${size} words' band`).toBeLessThanOrEqual(0.34);
      expect(1 - typical.height / pictureH, `${size} clear above`).toBeGreaterThanOrEqual(0.45);
      expect(1 - longest.height / pictureH, `${size} clear above, two lines each`).toBeGreaterThanOrEqual(0.3);
    }
  });
});
