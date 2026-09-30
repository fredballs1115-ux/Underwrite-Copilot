// The site states its coverage scope in two different units, and they must
// never contradict each other on the same page: MARKETS are what a buyer
// counts (15 — the DMV core's four jurisdictions are one market), while
// TILES/entries are per jurisdiction (18). The homepage once printed "18
// covered markets" on the pulse board while saying "15 markets, deliberately"
// a screen away; these tests pin the two numbers and their relationship so a
// future metro addition has to update both deliberately.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketsGallery } from "@/app/markets-gallery";
import { visibleText } from "@/lib/render-lint";
import metrosSeed from "@/data/research/metros.json";
import { MARKET_COUNT } from "@/app/markets-marquee";
import { BRIEF_COUNT, MARKETS_READ } from "@/lib/market-count";
import { DATA_METROS } from "@/lib/market-match";

const metros = (metrosSeed.metros ?? []) as { id: string; region?: string }[];

describe("coverage scope", () => {
  it("counts 18 jurisdiction entries across 15 buyer-facing markets", () => {
    expect(metros.length).toBe(18);
    expect(MARKET_COUNT).toBe(15);
  });

  it("derives the market count by collapsing DMV core to one market", () => {
    const dmv = metros.filter((m) => m.region === "DMV core");
    expect(dmv.length).toBe(4);
    // 18 entries - 4 DMV entries + 1 DMV market = 15.
    expect(metros.length - dmv.length + 1).toBe(MARKET_COUNT);
  });

  it("never lets the entry count masquerade as the market count", () => {
    expect(MARKET_COUNT).toBeLessThan(metros.length);
    expect(BRIEF_COUNT).toBe(metros.length);
  });

  it("counts every market read the same way: the briefed markets plus the metro areas read without a brief", () => {
    expect(MARKETS_READ).toBe(MARKET_COUNT + DATA_METROS.length);
    expect(MARKETS_READ).toBe(41);
  });

  it("says why the gallery shows more tiles than the markets its heading counts", () => {
    const text = visibleText(renderToStaticMarkup(React.createElement(MarketsGallery)));
    expect(text).toContain(`The ${MARKET_COUNT} covered markets.`);
    expect(text).toContain(`${BRIEF_COUNT} briefs: the Washington area's 4 jurisdictions have one each.`);
  });
});
