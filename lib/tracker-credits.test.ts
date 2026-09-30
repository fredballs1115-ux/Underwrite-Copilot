import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import metrosSeed from "@/data/research/metros.json";
import { blockCitations, figureCitation, figureNote, figureSources, figuresTitle } from "@/lib/tracker-read";
import { sectorLeaderboard } from "@/lib/sector-leaderboard";
import { COMPARE_METROS } from "@/app/market/compare-metros";
import { MarketCompare } from "@/app/market/market-compare";
import { datedLong } from "@/lib/debt-index";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

// The research tracker's figures on /market — the metro brief's "By asset
// type" panel, the sector leaderboard, the coverage board and the compare
// card — had each credited a block's figures to its FIRST link and dated them
// by the day the research was read: Chicago's $43.90 office rent, Cushman's
// CBD MarketBeat for Q2 2026, sat under a "source" that was Tenantbase's Q1
// print, beside "fundamentals as of 2026-08-25". Every surface now credits a
// figure through its block's own read (lib/tracker-read `blockCitations`).

type Block = Record<string, unknown> & { sources?: string[] };
const block = (id: string, sector: string): Block =>
  ((metrosSeed.metros.find((m) => m.id === id)!.sector_snapshot as unknown) as Record<string, Block>)[sector];
const TENANTBASE = "https://www.tenantbase.com/chicago/q1-2026/";
const CBD_OFFICE = "https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/chicago-marketbeats/cbd-office";

describe("blockCitations — each figure a block carries, with its own read", () => {
  it("credits Chicago's office vacancy and rent apart, and neither to the block's first link", () => {
    const [vacancy, rent, ...rest] = blockCitations(block("chicago", "office"));
    expect(rest).toEqual([]);
    expect(vacancy).toMatchObject({ label: "Vacancy", words: "Q1 2026" });
    expect(vacancy.read.links).toEqual([]);
    expect(rent).toMatchObject({ label: "Rent", words: "Cushman & Wakefield, the CBD, Q2 2026" });
    expect(rent.read.links).toEqual([CBD_OFFICE]);
  });

  it("gives a cap its kind and its stock, and leaves out a figure the block does not carry", () => {
    const figs = blockCitations(block("chicago", "multifamily"));
    expect(figs.map((f) => f.label)).toEqual(["Vacancy", "Cap"]);
    expect(figs[1].words).toBe(
      "Essex Realty, Chicago, April 2026; a transaction average of 175 sales, not a quoted band; for the small-building stock, mostly the Class B/C neighborhood buildings that drive Chicago volume",
    );
    // A block with a rent and no vacancy (Montgomery County industrial) credits the rent alone.
    expect(blockCitations(block("montgomery_county", "industrial")).map((f) => f.label)).toEqual(["Rent"]);
    expect(blockCitations(null)).toEqual([]);
  });

  it("every figure on file is credited only to its own block's sources", () => {
    for (const m of metrosSeed.metros) {
      const snap = (m.sector_snapshot as unknown as Record<string, Block | string>) ?? {};
      for (const [sector, blk] of Object.entries(snap)) {
        if (sector === "as_of" || typeof blk !== "object") continue;
        for (const f of blockCitations(blk)) {
          for (const link of f.read.links) expect(blk.sources, `${m.id}.${sector} ${f.label}`).toContain(link);
          // A cap's line says what kind of figure it is and whose stock; a
          // vacancy's and a rent's say who, where and when.
          expect(f.words, `${m.id}.${sector} ${f.label}`).toBe(f.label === "Cap" ? figureNote(f.read) : figureCitation(f.read));
        }
      }
    }
  });
});

describe("figureSources — a row's links, each its own figures'", () => {
  it("one link that carries every figure is the row's source", () => {
    expect(figureSources(blockCitations(block("richmond", "industrial")))).toEqual([
      {
        href: "https://www.cbre.com/insights/figures/richmond-industrial-figures-q2-2026",
        label: "source",
        title: "Vacancy: CBRE, Q2 2026 · Rent: CBRE, Q2 2026; average asking",
      },
    ]);
  });

  it("links that differ are labelled by their figures, and an unlinked figure lends no link", () => {
    expect(figureSources(blockCitations(block("baltimore", "industrial"))).map((l) => [l.label, l.href])).toEqual([
      ["vacancy", "https://www.nmrk.com/insights/market-report/baltimore-market-reports"],
      ["rent", "https://www.cbre.com/insights/figures/baltimore-industrial-figures-q2-2026"],
    ]);
    // Chicago office: the rent's link, labelled as the rent's — the vacancy has none.
    expect(figureSources(blockCitations(block("chicago", "office"))).map((l) => [l.label, l.href])).toEqual([["rent", CBD_OFFICE]]);
    // Miami retail: Colliers' Q2 2026 figures, and the block's only Colliers link is its Q1 report.
    expect(figureSources(blockCitations(block("miami", "retail")))).toEqual([]);
    // The Washington region's apartment figures name no house.
    expect(figureSources(blockCitations(block("dc", "multifamily")))).toEqual([]);
  });

  it("drops a link the audit refuses", () => {
    const figs = blockCitations(block("richmond", "industrial"));
    expect(figureSources(figs, () => false)).toEqual([]);
    expect(figuresTitle(figs)).toBe("Vacancy: CBRE, Q2 2026 · Rent: CBRE, Q2 2026; average asking");
  });
});

describe("the sector leaderboard credits each row's figures, never the block's first link", () => {
  it("carries each row's cited figures and no block-wide source", () => {
    for (const sector of ["office", "industrial", "multifamily", "retail"]) {
      for (const r of sectorLeaderboard(sector).rows) {
        expect(r).not.toHaveProperty("source");
        expect(r.figures.length, `${sector} ${r.id}`).toBeGreaterThan(0);
        expect(r.figures.some((f) => f.label === "Vacancy"), `${sector} ${r.id}`).toBe(r.vLow !== null);
        expect(r.figures.some((f) => f.label === "Rent"), `${sector} ${r.id}`).toBe(r.rent !== null);
        expect(r.figures.some((f) => f.label === "Cap"), `${sector} ${r.id}`).toBe(r.capLow !== null && r.capHigh !== null);
      }
    }
    const chicago = sectorLeaderboard("office").rows.find((r) => r.id === "chicago")!;
    const links = figureSources(chicago.figures).map((l) => l.href);
    expect(links).toEqual([CBD_OFFICE]);
    expect(links).not.toContain(TENANTBASE);
  });

  it("the page draws the credits through the one reader and says the day read as that", () => {
    const page = readFileSync(join(process.cwd(), "app/market/page.tsx"), "utf8");
    expect(page).toContain("<FigureCredits figures={blockCitations(b)} />");
    expect(page).toContain("figureSources(r.figures,");
    expect(page).toContain("`· research read ${datedLong(readOn)}`");
    expect(page).not.toContain("fundamentals as of");
    expect(page).not.toMatch(/`as of \$\{datedLong\(snapDates/);
    // The snapshot panel's old block-wide link is gone.
    expect(page).not.toMatch(/b\.sources\?\.\[0\]/);
  });
});

describe("the compare card", () => {
  it("titles each cell with its figures' own credits and says the day the research was read as that", () => {
    const chicago = COMPARE_METROS.find((m) => m.id === "chicago")!;
    expect(chicago.researchReadOn).toBe(datedLong(String((metrosSeed.metros.find((m) => m.id === "chicago")!.sector_snapshot as { as_of: string }).as_of)));
    expect(chicago.sectors?.office?.cite).toBe(
      "Vacancy: Q1 2026 · Rent: Cushman & Wakefield, the CBD, Q2 2026; average gross asking",
    );
    for (const m of COMPARE_METROS) {
      for (const s of Object.values(m.sectors ?? {})) {
        // A cell titles what it shows: its rent and cap only beside a vacancy.
        expect(!!s.cite, m.id).toBe(typeof s.vLow === "number");
      }
    }
    const html = renderToStaticMarkup(React.createElement(MarketCompare, { metros: COMPARE_METROS }));
    const text = visibleText(html);
    expect(text).toContain("Asset-type read");
    expect(text).toMatch(/research read [A-Z][a-z]{2} \d{1,2}, \d{4}/);
    expect(text).not.toMatch(/research as of/);
    expect(html).toContain('title="Vacancy: Colliers (21.3%) and CBRE (22.2%), the District, Q2 2026"');
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
