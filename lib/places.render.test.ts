// Render tests for the signed-in site's places (package C of the 2026-10-16
// signed-in pass): /market's own memory cards, the covered-market card on
// the deal's research panel and the comps page, and the analytics page's
// market table and charts. Each is drawn on a fixture and its markup and
// visible text linted as the other render tests do.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { a11yIssues, gluedWords, visibleText } from "@/lib/render-lint";
import { MarketMemoryCards } from "@/app/market/market-memory-cards";
import type { MarketGroup } from "@/lib/market-memory";
import { SKYLINES, commonsPage, galleryCredit, skylineSrcSet } from "@/lib/skyline";

const render = (node: React.ReactElement): string => renderToStaticMarkup(node);

const group = (over: Partial<MarketGroup> & Pick<MarketGroup, "market" | "marketKey">): MarketGroup => ({
  assetClass: "multifamily",
  count: 3,
  cap: { min: 5.1, median: 5.3, max: 5.6 },
  perUnit: { min: 180_000, median: 200_000, max: 240_000, basis: "unit", noun: "unit" },
  calls: { pass: 1, caution: 1, pass_on: 1 },
  dealIds: ["a", "b", "c"],
  ...over,
});

describe("MarketMemoryCards — /market's own cards open on their market's photograph, credited once under the grid", () => {
  const GROUPS: MarketGroup[] = [
    group({ market: "Richmond, VA", marketKey: "richmond va" }),
    group({ market: "Arlington, VA", marketKey: "arlington va", assetClass: "office", perUnit: null }),
    // A bare city is more than one place: no picture, the card as before.
    group({ market: "Portland", marketKey: "portland", count: 1 }),
  ];

  it("pictures each card whose market names one the site has, links the strip to its brief, and owes one credit line", () => {
    const html = render(React.createElement(MarketMemoryCards, { groups: GROUPS }));
    expect(a11yIssues(html), "a11y memory cards").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html.match(/data-picture="memory"/g)?.length).toBe(2);
    expect(html).toContain('href="/market?metro=richmond"');
    expect(html).toContain('href="/market?metro=nova"');
    expect(html).toContain(`srcSet="${skylineSrcSet("richmond").replaceAll("&", "&amp;")}"`);
    // The strip wears the market's name; the card keeps the memorandum's.
    expect(text).toContain("Richmond VA");
    expect(text).toContain("Richmond, VA");
    expect(text).toContain("Portland");
    expect(text).toContain("5.10–5.60%");
    const credit = galleryCredit(["richmond", "nova"]);
    expect(credit).not.toBe("");
    expect(text.replace(/\n/g, "")).toContain(credit);
    expect(html).toContain(`href="${commonsPage(SKYLINES.richmond.file)}"`);
  });

  it("no market named, no picture and no credit owed", () => {
    const html = render(React.createElement(MarketMemoryCards, { groups: GROUPS.slice(2) }));
    expect(html).not.toContain('data-picture="memory"');
    expect(html).not.toContain('data-qa="memory-credit"');
    expect(visibleText(html)).not.toContain("Photographs by");
  });
});

// ── The analytics page's market table ───────────────────────────────────────
import { MarketTable } from "@/app/(app)/analytics/market-table";
import { deriveAnalytics, marketRows, type AnalyticsRow } from "@/lib/analytics";

const analyticsRow = (id: string, market: string, verdict = "pass"): AnalyticsRow => ({
  id,
  name: `Deal ${id}`,
  asset_class: "multifamily",
  created_at: `2026-09-${(10 + Number(id)).toString()}T12:00:00Z`,
  is_sample: false,
  stage: "screening",
  verdict: { verdict },
  extraction: {
    dealName: `Deal ${id}`,
    assetClass: "multifamily",
    market,
    address: "",
    metrics: [
      { label: "Asking price", value: "$40,000,000", flagged: false, page: "p. 2" },
      { label: "Going-in cap rate", value: `5.${id}0%`, flagged: false, page: "p. 2" },
      { label: "Units", value: "200", flagged: false, page: "p. 2" },
    ],
  },
});

describe("MarketTable — /analytics' markets, grouped as /market groups them, each pictured where it names a market", () => {
  const deals = deriveAnalytics([
    analyticsRow("1", "Richmond, VA"),
    analyticsRow("2", "Richmond VA", "caution"),
    analyticsRow("3", "richmond, va"),
    analyticsRow("4", "Portland"),
  ]);

  it("draws one row for one market's spellings, its picture and brief link, and one credit line under the table", () => {
    const html = render(React.createElement(MarketTable, { rows: marketRows(deals), planNote: false }));
    expect(a11yIssues(html), "a11y analytics market table").toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(html.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr /g)?.length).toBe(2);
    expect(html.match(/data-picture="analytics-market"/g)?.length).toBe(1);
    expect(html).toContain('href="/market?metro=richmond"');
    expect(text).toContain("Richmond VA brief");
    // Three deals make a median: 5.20% of 5.10, 5.20 and 5.30.
    expect(text).toContain("5.20%");
    const credit = galleryCredit(["richmond"]);
    expect(text.replace(/\n/g, "")).toContain(credit);
  });

  it("no market named, no picture and no credit owed", () => {
    const html = render(React.createElement(MarketTable, { rows: marketRows(deals.slice(3)), planNote: true }));
    expect(html).not.toContain('data-picture="analytics-market"');
    expect(html).not.toContain('data-qa="market-credit"');
    expect(visibleText(html)).toContain("Plan deals are judged on yield on total cost");
  });
});

// ── The analytics page's timelines on a phone ───────────────────────────────
import { DotTimeline } from "@/app/(app)/analytics/charts";

describe("DotTimeline — readable at 390px, and every dot opens its deal (no hover on a phone)", () => {
  const pct = (v: number) => `${v.toFixed(2)}%`;
  const points = [
    { at: "2026-08-11T12:00:00Z", value: 5.45, name: "The Maddox", id: "d1" },
    { at: "2026-08-20T12:00:00Z", value: 5.9, name: "Harbor View", id: "d2" },
    { at: "2026-09-02T12:00:00Z", value: 8.1, name: "Tysons Plaza", id: "d3" },
  ];

  it("draws a phone frame under a 24rem card and wider frames past it, whose type is the larger on the phone", () => {
    const html = render(React.createElement(DotTimeline, { points, format: pct, medianLabel: "median" }));
    const svgs = html.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(4);
    expect(svgs[0]).toContain('viewBox="0 0 320 210"');
    expect(svgs[0]).toContain('class="@sm:hidden"');
    expect(svgs[2]).toContain('viewBox="0 0 560 190"');
    expect(svgs[2]).toContain('class="hidden @lg:block @2xl:hidden"');
    // 12 units in a 320-wide frame draw at about 12px on a 390px screen's
    // ~318px card; the wide frame's 9.5 units had drawn at about 5.5px.
    expect(html).toContain('font-size="12"');
    expect(html).not.toContain('font-size="9.5"');
  });

  it("makes each dot a link to its deal, named for a screen reader, in a group rather than an image", () => {
    const html = render(React.createElement(DotTimeline, { points, format: pct, medianLabel: "median" }));
    expect(a11yIssues(html), "a11y timeline").toEqual([]);
    expect(gluedWords(visibleText(html))).toEqual([]);
    for (const p of points) {
      // Once in each of the four frames, once in the phone's list.
      expect(html.match(new RegExp(`href="/deals/${p.id}"`, "g"))?.length).toBe(5);
    }
    expect(html).toContain('aria-label="The Maddox — 5.45% · added Aug 11, 2026"');
    // The axis says the month and the year in full: "Aug 26" had read as the 26th.
    expect(visibleText(html)).toContain("Aug 2026");
    expect(visibleText(html)).not.toMatch(/\bAug 26\b/);
    expect(html).toContain('role="group"');
    expect(html).not.toContain('role="img"');
    // The phone's list of the deals, newest first.
    expect(html).toContain('data-qa="timeline-list"');
    expect(visibleText(html)).toContain("List the 3 deals");
    expect(html.indexOf("Tysons Plaza</span>")).toBeLessThan(html.indexOf("The Maddox</span>"));
  });

  it("points without an id draw as before: an image, no links, no list", () => {
    const bare = points.map(({ at, value, name }) => ({ at, value, name }));
    const html = render(React.createElement(DotTimeline, { points: bare, format: pct, medianLabel: "median" }));
    expect(html).not.toContain("<a ");
    expect(html).toContain('role="img"');
    expect(html).not.toContain('data-qa="timeline-list"');
  });
});

// ── A grid's credit line follows the pictures shown (audit C9, L3) ──────────
import { shownCredit, firstMode, type ShownMode } from "@/lib/shown-credit";
import { gridPictures } from "@/app/market/grid-credit";
import { OVERHEAD_GRID_CREDIT, hasSkyline, skylineCredit, skylineFor } from "@/lib/skyline";

describe("the market grids' one credit line names the picture each tile settled on", () => {
  const [richmond, moco] = gridPictures(["richmond", "montgomery_county"]);

  it("reads each market's photograph and overhead from the tables", () => {
    expect(hasSkyline("richmond")).toBe(true);
    expect(richmond.skyline).toEqual(skylineCredit(skylineFor("richmond")!));
    // Montgomery County is pictured by its overhead alone (CLAUDE.md).
    expect(moco.skyline).toBeNull();
    expect(moco.overhead).toBe(true);
    expect(firstMode(richmond)).toBe("skyline");
    expect(firstMode(moco)).toBe("aerial");
  });

  it("before any tile reports, credits each tile's first picture; a failed photograph's credit leaves with it", () => {
    const none = new Map<string, ShownMode[]>();
    expect(shownCredit([richmond], none)).toEqual({ photos: [richmond.skyline], overhead: false });
    expect(shownCredit([richmond, moco], none)).toEqual({ photos: [richmond.skyline], overhead: true });
    // Richmond's photograph failed and its tile shows the overhead.
    expect(shownCredit([richmond], new Map([["richmond", ["aerial"]]]))).toEqual({ photos: [], overhead: true });
    // Two tiles of one market, one failed: both pictures are on screen.
    expect(shownCredit([richmond], new Map([["richmond", ["skyline", "aerial"]]]))).toEqual({
      photos: [richmond.skyline],
      overhead: true,
    });
    // Both pictures failed: nothing to credit.
    expect(shownCredit([richmond], new Map([["richmond", ["none"]]]))).toEqual({ photos: [], overhead: false });
  });

  it("the server's render prints the overhead line for an overhead-only market and keeps the tiles bare", () => {
    const html = render(
      React.createElement(MarketMemoryCards, { groups: [group({ market: "Montgomery County MD", marketKey: "montgomery county md" })] }),
    );
    const text = visibleText(html);
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    expect(html).toContain('data-picture="memory"');
    expect(html).toContain('data-qa="memory-credit"');
    expect(text).toContain(OVERHEAD_GRID_CREDIT);
    expect(text).not.toContain("Photographs by");
  });
});

// ── A metro area read without a brief promises no brief (audit C9, M2) ──────
import { ResearchPanelView } from "@/app/(app)/deals/[id]/research-panel";
import { marketLeadLine, marketPageWord } from "@/app/market/market-lead";
import { dataMetroForAddress, isDataMetro, metroForAddress, metroForName } from "@/lib/market-match";

describe("a metro area the site reads without a brief is never called a brief", () => {
  const pitt = metroForName("Pittsburgh PA")!;

  it("Pittsburgh is one of them, by name and by address", () => {
    expect(pitt.id).toBe("pittsburgh");
    expect(isDataMetro(pitt.id)).toBe(true);
    expect(marketPageWord(pitt.id)).toBe("figures");
    expect(marketPageWord("richmond")).toBe("brief");
    // The comps page and the research panel draw the "Covered market … Open
    // the market brief" card off `metroForAddress`, which answers for the
    // briefed markets alone.
    const addr = { city: "Pittsburgh", state: "PA" };
    expect(metroForAddress(addr)).toBeNull();
    expect(dataMetroForAddress(addr)?.id).toBe("pittsburgh");
  });

  it("the memory card's strip opens the market page, not a brief", () => {
    const html = render(
      React.createElement(MarketMemoryCards, { groups: [group({ market: "Pittsburgh PA", marketKey: "pittsburgh pa" })] }),
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(html).toContain('href="/market?metro=pittsburgh"');
    expect(html).toContain("Open the market page: ");
    expect(html).not.toContain("market brief");
  });

  it("the analytics table links the metro's figures, not its brief", () => {
    const html = render(
      React.createElement(MarketTable, { rows: marketRows(deriveAnalytics([analyticsRow("5", "Pittsburgh PA")])), planNote: false }),
    );
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(text).toContain("Pittsburgh PA figures");
    expect(text).not.toContain("brief");
  });

  it("the market page's lead line says what the page opens on", () => {
    expect(marketLeadLine(true)).toContain("brief first");
    expect(marketLeadLine(false)).toBe("The market’s published figures first; your own market data follows it.");
  });

  it("the research panel draws no covered-market card for a Pittsburgh address", () => {
    const address = {
      label: "100 Smithfield St, Pittsburgh, PA 15222",
      street: "100 Smithfield St",
      city: "Pittsburgh",
      state: "PA",
      zip: "15222",
      county: "",
      submarket: "",
    };
    const html = render(React.createElement(ResearchPanelView, { address, rules: [], benchmarks: [] }));
    expect(html).not.toContain('data-picture="covered-market"');
    expect(visibleText(html)).toContain("Pittsburgh PA is read, not briefed");
    // A briefed market's address still gets its card.
    const richmond = { ...address, label: "1 Main St, Richmond, VA", city: "Richmond", state: "VA", zip: "23219" };
    const briefed = render(React.createElement(ResearchPanelView, { address: richmond, rules: [], benchmarks: [] }));
    expect(briefed).toContain('data-picture="covered-market"');
  });
});
