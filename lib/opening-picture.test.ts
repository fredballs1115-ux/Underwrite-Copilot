// The photograph that opens a public page is its largest paint, and it was
// asked for lazily with no priority, behind everything else on the page.
// It is fetched first now (`eager`: loading="eager", fetchPriority="high",
// which React also preloads), and every picture further down still waits.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketBand, PAGE_COLUMN_SIZES, PlaceBackdrop, PlaceBand } from "@/app/place-band";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const imgOf = (html: string) => /<img\b[^>]*>/.exec(html)?.[0] ?? "";

describe("a page's opening picture is fetched first", () => {
  it("asks for an eager band's picture at once, ahead of the page, and preloads it", () => {
    const props = { metro: "dc", eager: true } as React.ComponentProps<typeof PlaceBand>;
    const html = renderToStaticMarkup(React.createElement(PlaceBand, props, "Words"));
    const img = imgOf(html);
    expect(img).toContain('loading="eager"');
    expect(img).toContain('fetchPriority="high"');
    expect(html).toMatch(/<link rel="preload" as="image"[^>]*fetchPriority="high"/);
  });

  it("leaves every other band's picture to load lazily, with no priority", () => {
    for (const html of [
      renderToStaticMarkup(React.createElement(PlaceBackdrop, { metro: "chicago" })),
      renderToStaticMarkup(React.createElement(MarketBand, { metro: "richmond", eyebrow: "Mid-Atlantic", name: "Richmond VA" })),
    ]) {
      const img = imgOf(html);
      expect(img).toContain('loading="lazy"');
      expect(img).not.toContain("fetchPriority");
      expect(html).not.toContain('rel="preload"');
    }
  });

  it("is passed where the band is the first thing on the page, and nowhere further down", () => {
    const opening: Array<[string, RegExp]> = [
      ["app/page.tsx", /<PlaceBackdrop metro=\{HERO_AERIAL\.metro\}[^>]*\beager\b/],
      ["app/why/page.tsx", /<PlaceBand metro="dc"[^>]*\beager\b/],
      ["app/demo/page.tsx", /<PlaceBand metro="philadelphia"[^>]*\beager\b/],
      ["app/tools/page.tsx", /<PlaceBackdrop metro="chicago"[^>]*\beager\b/],
      ["app/login/page.tsx", /<PlaceBackdrop metro="baltimore"[^>]*\beager\b/],
      ["app/market/page.tsx", /<MarketBand[^>]*\beager\b/],
      ["app/market/read-only-metro.tsx", /<MarketBand[^>]*\beager\b/],
    ];
    for (const [file, pattern] of opening) expect(read(file), file).toMatch(pattern);
    // The galleries further down the page wait their turn.
    for (const file of ["app/markets-gallery.tsx", "app/market/submarket-cards.tsx"]) {
      expect(read(file), file).not.toMatch(/<CityPhoto[^>]*\beager\b/);
    }
  });

  it("asks /tools' picture for the width of its column, not the screen's", () => {
    expect(read("app/tools/page.tsx")).toMatch(/<PlaceBackdrop metro="chicago"[^>]*sizes=\{PAGE_COLUMN_SIZES\}/);
    const html = renderToStaticMarkup(React.createElement(PlaceBackdrop, { metro: "chicago", sizes: PAGE_COLUMN_SIZES }));
    expect(imgOf(html)).toContain(`sizes="${PAGE_COLUMN_SIZES}"`);
    // The same measure the market bands, in the same column, ask for.
    const band = renderToStaticMarkup(React.createElement(MarketBand, { metro: "chicago", eyebrow: "x", name: "y" }));
    expect(imgOf(band)).toContain(`sizes="${PAGE_COLUMN_SIZES}"`);
  });

  it("keeps the fallback to the overhead when the photograph fails before hydration", () => {
    // Asked for first, the picture can fail before any listener is
    // attached; the component checks on mount as DealBanner does.
    const src = read("app/city-photo.tsx");
    expect(src).toMatch(/img\?\.complete \|\| img\.naturalWidth > 0\) return;/);
    expect(src).toContain('m === "skyline" && view ? "aerial" : "none"');
    expect(src).toContain('onError={() => setMode(skyline && view ? "aerial" : "none")}');
  });
});
