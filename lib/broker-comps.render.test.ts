// The deal page's Comps tab, rendered on a fixture (the comps research
// pass's M12–M15): the OM's sale comps are listed once — in their table,
// each row wearing its map pin and citing the memorandum's page — while the
// map's own table lists the public-web comps; a comp stating only a price a
// foot is drawn on a per-SF track beside the per-unit one; a web comp
// carries its search's day, and one whose source calls it a listing is said
// to be an ask.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals/d1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../app/(app)/deals/actions", () => ({ rerunAnalysis: async () => {}, reconcileWithModel: async () => {} }));
vi.mock("../app/(app)/deals/[id]/comps-actions", () => ({ searchPublicComps: async () => {}, refreshRecordComps: async () => {} }));

import { BrokerComps } from "@/app/(app)/deals/[id]/deal-sections";
import { ToastProvider } from "@/app/(app)/toaster";
import type { BrokerCompsResult } from "@/lib/anthropic/types";
import type { CompSearchResult } from "@/lib/anthropic/comps-search";
import { basisTracks } from "@/lib/comp-detail";
import { saysListing } from "@/lib/web-comp-read";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const comps: BrokerCompsResult = {
  summary: "Three sales.",
  redFlags: [],
  leaseComps: [],
  saleComps: [
    { name: "The Alden", detail: "$300k/unit · 5.1% cap", support: "supports", note: "Same vintage.", page: "14" },
    { name: "Park Row", detail: "$410/SF", support: "stretched", note: "Newer.", page: "15" },
    { name: "Mill House", detail: "Sold 2025", support: "favorable", note: "", page: "" },
  ],
} as unknown as BrokerCompsResult;

const search: CompSearchResult = {
  summary: "Two candidates, unverified.",
  searchedAt: "2026-10-02T15:00:00Z",
  candidates: [
    { name: "4 Elm St", location: "Philadelphia", detail: "$2.1M, listed for sale", date: "2026", sourceName: "A brokerage", sourceUrl: "", note: "" },
    { name: "9 Oak St", location: "Philadelphia", detail: "Sold $1.8M", date: "2026", sourceName: "City paper", sourceUrl: "", note: "" },
  ],
} as unknown as CompSearchResult;

const draw = (sample = false, compSearch: CompSearchResult | null = search) =>
  renderToStaticMarkup(
    React.createElement(
      ToastProvider,
      null,
      React.createElement(BrokerComps, {
        result: comps,
        dealId: "d1",
        compSearch,
        active: false,
        isPro: true,
        subject: { perUnit: 280_000, perSf: 380 },
        mapContext: { subjectLabel: "1 Main St", market: "Philadelphia", omUrl: "/api/deals/d1/om", totalPages: 40, sample },
      }),
    ),
  );

describe("the sample's comps are never pinned to real places", () => {
  it("draws the table and bars alone, with no pin, and says the comps are fictional", () => {
    for (const s of [null, search]) {
      const html = draw(true, s);
      const text = visibleText(html).replace(/\s+/g, " ");
      expect(text).toContain("The sample’s comps are fictional, like its building, so they are not placed on a map.");
      expect(text).not.toMatch(/Pins? 1/);
      expect(html).not.toContain("Pin 1 on the map");
      // still listed, with their pages and bars
      expect(text).toContain("The Alden");
      expect(html).toContain('href="/api/deals/d1/om#page=14"');
      expect(text).toMatch(/Bars per unit \(1 comp\)/);
      expect(a11yIssues(html)).toEqual([]);
      expect(gluedWords(visibleText(html))).toEqual([]);
    }
  });

  it("asks the geocoder for no memorandum comp on the sample", () => {
    const src = readFileSync(join(__dirname, "..", "app", "(app)", "deals", "[id]", "deal-sections-view.tsx"), "utf8");
    expect(src).toContain("...(mapContext.sample ? [] : saleComps).map(");
    const view = readFileSync(join(__dirname, "..", "app", "(app)", "deals", "[id]", "deal-view.tsx"), "utf8");
    expect(view).toMatch(/sample: isSample,/);
  });
});

describe("the Comps tab", () => {
  it("lists the OM's sale comps once, with their pins and pages", () => {
    const html = draw();
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toContain("Pins 1–3 are the sale comps in the table below");
    // the OM comps appear in the table (its phone cards and rows), never in the map's table
    expect(html).toContain('href="/api/deals/d1/om#page=14"');
    // once in the table's phone card and once in its row — not a third time
    // in the map's table, which lists the web comps
    expect(text.split("The Alden").length - 1).toBe(2);
    expect(text).toContain("4 Elm St");
    expect(text).toContain("OM p. 15");
    expect(html).toContain("Pin 1 on the map");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });

  it("draws a per-SF comp on its own track beside the per-unit ones", () => {
    const html = draw();
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toMatch(/Bars per unit \(1 comp\)/);
    expect(text).toMatch(/Bars per SF \(1 comp\)/);
    const t = basisTracks(comps.saleComps, { perUnit: 280_000, perSf: 380 })!;
    expect(t.trackOf).toEqual([0, 1, null]);
    expect(t.tracks.map((x) => x.unit)).toEqual(["unit", "sf"]);
  });

  it("dates the web search and says a listing's figure is an ask", () => {
    const text = visibleText(draw()).replace(/\s+/g, " ");
    expect(text).toContain("Searched Oct 2, 2026.");
    expect(text.split("the figure is an ask, not a sale price").length - 1).toBe(1);
    expect(saysListing({ detail: "Sold $1.8M" })).toBe(false);
  });
});
