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
import { BRIEF_COUNT, MARKETS_READ, regionCountLabel } from "@/lib/market-count";
import { DATA_METROS } from "@/lib/market-match";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("counts /market's chip rows in the same units: the DMV core's four briefs are one market, every other chip a market", () => {
    // The rows said "DMV core · 4 metros" and "Mid-Atlantic · 5 metros" (over
    // Newark / Jersey City, which is no metro area of its own) while the
    // homepage counted the four Washington briefs as one market.
    const regions = new Map<string, number>();
    for (const m of metros) regions.set(m.region ?? "More markets", (regions.get(m.region ?? "More markets") ?? 0) + 1);
    expect(regionCountLabel("DMV core", regions.get("DMV core")!)).toBe("4 briefs, one market");
    expect(regionCountLabel("Mid-Atlantic", regions.get("Mid-Atlantic")!)).toBe("5 markets");
    expect(regionCountLabel("Major US markets", 1)).toBe("1 market");
    // The rows add up to the count every other page states.
    let markets = 0;
    for (const [region, n] of regions) markets += region === "DMV core" ? 1 : n;
    expect(markets).toBe(MARKET_COUNT);
    for (const [region, n] of regions) expect(regionCountLabel(region, n)).not.toMatch(/metro/);
    // The page states the row's count through the helper, never typed.
    const page = readFileSync(join(process.cwd(), "app/market/page.tsx"), "utf8");
    expect(page).toContain("regionCountLabel(region, group.length)");
    expect(page).not.toMatch(/group\.length\} metro/);
  });

  it("says why the gallery shows more tiles than the markets its heading counts", () => {
    const text = visibleText(renderToStaticMarkup(React.createElement(MarketsGallery)));
    expect(text).toContain(`The ${MARKET_COUNT} covered markets.`);
    // Four briefs, not "four jurisdictions": Northern Virginia is several.
    expect(text).toContain(`${BRIEF_COUNT} briefs, 4 of them for the Washington area.`);
    const line = text.split("\n").find((l) => l.includes(" briefs")) ?? "";
    expect(line).not.toMatch(/jurisdiction|skyline/i);
  });
});
