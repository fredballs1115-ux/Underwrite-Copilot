// The photograph that opens a public page is its largest paint, and it was
// asked for lazily with no priority, behind everything else on the page.
// It is fetched first now (`eager`: loading="eager", fetchPriority="high",
// which React also preloads), and every picture further down still waits.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MARKET_BAND_BOXES, MarketBand, PlaceBackdrop, PlaceBand, WINDOW_BOXES, pageColumnBoxes } from "@/app/place-band";
import { SKYLINES, bandSizes } from "@/lib/skyline";

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

  it("asks /tools' picture for the width it is drawn in its column, not the screen's", () => {
    // The band's own heights, held to its classes: 15rem, 18rem from sm.
    const tools = read("app/tools/page.tsx");
    expect(tools).toMatch(/<PlaceBackdrop metro="chicago"[^>]*boxes=\{pageColumnBoxes\(240, 288\)\}/);
    expect(tools).toMatch(/<section className="[^"]*\bmin-h-\[15rem\][^"]*\bsm:min-h-\[18rem\]/);
    const boxes = pageColumnBoxes(240, 288);
    const html = renderToStaticMarkup(React.createElement(PlaceBackdrop, { metro: "chicago", boxes }));
    // Chicago's 2.4:1 frame is drawn wider than a phone's 240px band.
    expect(imgOf(html)).toContain(`sizes="${bandSizes(SKYLINES.chicago, boxes)}"`);
    expect(bandSizes(SKYLINES.chicago, boxes)).toMatch(/(?:^|, )576px$/);
    // The market bands, in the same column, ask by their own heights.
    const band = renderToStaticMarkup(React.createElement(MarketBand, { metro: "chicago", eyebrow: "x", name: "y" }));
    expect(imgOf(band)).toContain(`sizes="${bandSizes(SKYLINES.chicago, MARKET_BAND_BOXES)}"`);
    // The sign-in page's band is the window, so its panorama is asked for
    // by the window's height wherever the window is the narrower shape.
    expect(read("app/login/page.tsx")).toMatch(/<PlaceBackdrop metro="baltimore"[^>]*boxes=\{WINDOW_BOXES\}/);
    const login = renderToStaticMarkup(React.createElement(PlaceBackdrop, { metro: "baltimore", scrim: "center", boxes: WINDOW_BOXES }));
    expect(imgOf(login)).toContain('sizes="(max-aspect-ratio: 7988/3495) calc(100vh * 2.286), 100vw"');
    // A band that says nothing of its box (the homepage's hero) keeps the
    // window's width.
    expect(imgOf(renderToStaticMarkup(React.createElement(PlaceBackdrop, { metro: "chicago" })))).toContain('sizes="100vw"');
  });

  it("keeps the fallback to the overhead when the photograph fails before hydration", () => {
    // Asked for first, the picture can fail before any listener is
    // attached; the component checks on mount as DealBanner does. The
    // check lives in CityPhoto's client half (app/city-photo-view), which
    // is handed both pictures resolved on the server.
    const src = read("app/city-photo-view.tsx");
    expect(src).toMatch(/img\?\.complete \|\| img\.naturalWidth > 0\) return;/);
    expect(src).toContain('m === "skyline" && hasAerial ? "aerial" : "none"');
    expect(src).toContain('onError={() => setMode(mode === "skyline" && hasAerial ? "aerial" : "none")}');
  });
});
