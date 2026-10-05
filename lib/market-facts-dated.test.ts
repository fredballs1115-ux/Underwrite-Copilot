import { describe, expect, it, onTestFinished, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import metrosSeed from "@/data/research/metros.json";
import { MarketsMarquee, metroFact, researchReadOn } from "@/app/markets-marquee";
import { MarketsGallery } from "@/app/markets-gallery";
import { datedLong } from "@/lib/debt-index";
import { blockCitations, houseShort } from "@/lib/tracker-read";
import { readFileSync } from "node:fs";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

// The markets band and the homepage's gallery print each market's research
// fact — a sector's vacancy, and its asking rent where the block carries one,
// from the tracker's snapshot of brokerages' quarterly prints. The band once
// called it "live from the research layer" and the gallery printed it with no
// date; then both dated every figure by the day the research was read
// ("as of Aug 25, 2026") — a Chicago vacancy that is a Q1 print among them.
// Each figure now carries its own period, from its block's read
// (lib/tracker-read), and the day read is said as that.

type Entry = { id: string; name: string; sector_snapshot?: Record<string, unknown> & { as_of?: string } };
const metros = (metrosSeed.metros ?? []) as unknown as Entry[];
const byId = (id: string) => metros.find((m) => m.id === id)!;
const readDay = byId("dc").sector_snapshot!.as_of!;

describe("the covered markets' research facts, each figure with its own period", () => {
  it("a sector read carries each figure's own period and credit, and the day read apart", () => {
    const dc = metroFact(byId("dc"), 0)!;
    expect(dc.text).toMatch(/^Office 21\.3–22\.2% vac \(Q2 2026\)( · \d+ rules? on file)?$/);
    // Who published each figure, in words a phone shows (research pass 31,
    // C5): beside its period where there is room, as a line where not.
    expect(dc.credited).toMatch(/^Office 21\.3–22\.2% vac \(Colliers and CBRE, Q2 2026\)( · \d+ rules? on file)?$/);
    expect(dc.houses).toBe("Vacancy: Colliers and CBRE");
    expect(dc.cite).toBe("Vacancy: Colliers (21.3%) and CBRE (22.2%), the District, Q2 2026");
    expect(dc.readOn).toBe(readDay);
    // Baltimore's industrial vacancy is Newmark's Q1 2026 figure and its rent
    // CBRE's Q2 2026 — two periods, each said beside its own figure.
    const baltimore = byId("baltimore").sector_snapshot!;
    const industrial = metroFact({ sector_snapshot: { as_of: baltimore.as_of, industrial: baltimore.industrial } }, 0)!;
    expect(industrial).toEqual({
      text: "Industrial 8.5% vac (Q1 2026) · $11.17/SF (Q2 2026)",
      credited: "Industrial 8.5% vac (Newmark, Q1 2026) · $11.17/SF (CBRE, Q2 2026)",
      houses: "Vacancy: Newmark · Rent: CBRE",
      cite: "Vacancy: Newmark, Q1 2026 · Rent: CBRE, Q2 2026; average asking",
      readOn: readDay,
    });
    // One house behind both figures is named once.
    const nyc = byId("nyc").sector_snapshot!;
    expect(metroFact({ sector_snapshot: { as_of: nyc.as_of, industrial: nyc.industrial } }, 0)?.houses).toBe(
      "Vacancy and rent: Matthews",
    );
  });

  it("/demo's Philadelphia line puts each figure's house in its words, not its title alone", () => {
    // The page is async and not rendered here; its helper is read, and the
    // houses it prints are the ones the same readers give.
    const demo = readFileSync("app/demo/page.tsx", "utf8");
    expect(demo).toMatch(/cited: \[houseShort\(fig\?\.read \?\? \{ house: null \}\)/);
    expect(demo).not.toMatch(/credit\("[a-z]+", "(Vacancy|Rent)"\)\.period/);
    const snap = byId("philadelphia").sector_snapshot! as Record<string, unknown>;
    const house = (sector: string, label: string) =>
      houseShort(blockCitations(snap[sector]).find((f) => f.label === label)?.read ?? { house: null });
    expect(house("office", "Vacancy")).toBe("Colliers");
    expect(house("industrial", "Rent")).toBe("Colliers");
    expect(house("multifamily", "Vacancy")).toBe("Northmarq");
    // A figure the file names no house for says so in the words.
    expect(house("industrial", "Vacancy")).toBe("publisher not recorded");
  });

  it("a house is said short, its parentheticals off, and a figure no house is named for says so", () => {
    expect(houseShort({ house: "Colliers (21.3%) and CBRE (22.2%)" })).toBe("Colliers and CBRE");
    expect(houseShort({ house: "Northmarq (citing Fannie Mae)" })).toBe("Northmarq");
    expect(houseShort({ house: "Moody's via JPMorgan (4.4%) and Kidder Mathews (4.7%)" })).toBe(
      "Moody's via JPMorgan and Kidder Mathews",
    );
    expect(houseShort({ house: "Cushman & Wakefield | Thalhimer" })).toBe("Cushman & Wakefield | Thalhimer");
    expect(houseShort({ house: null })).toBe("publisher not recorded");
  });

  it("a figure whose period the file does not state is undated; an FMR says its year; no figure, no credit", () => {
    // Read on a pinned day: a fair market rent is shown only while its year
    // is in force (lib/fmr `fmrWhen`), and metroFact reads today off the
    // clock — FY2027's ends Sep 30, 2027 and FY2028's a year later.
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 9, 1)), toFake: ["Date"] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    expect(metroFact({ sector_snapshot: { office: { vacancy_pct: 12.5 } }, rule_ids: ["a"] }, 0)).toEqual({
      text: "Office 12.5% vac (undated) · 1 rule on file",
      credited: "Office 12.5% vac (publisher not recorded, undated) · 1 rule on file",
      houses: "Vacancy: publisher not recorded",
      cite: "Vacancy: publisher not recorded, undated",
      readOn: null,
    });
    // The fiscal year is the block's own (lib/fmr), never one typed on the page.
    const block = { fy: 2027, effective: "2026-10-01", area: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD MSA", "2br": 1860 };
    expect(metroFact({ fmr: block }, 0)).toEqual({
      text: "FY2027 2BR FMR $1,860/mo",
      credited: "FY2027 2BR FMR $1,860/mo",
      houses: null,
      cite: null,
      readOn: null,
    });
    expect(metroFact({ fmr: { ...block, fy: 2028, effective: "2027-10-01", "2br": 1900 } }, 0)?.text).toBe("FY2028 2BR FMR $1,900/mo");
    // A block that names no year prints no rent: the rules count alone.
    expect(metroFact({ fmr: { "2br": 1860 }, rule_ids: ["a"] }, 0)).toEqual({
      text: "1 rule on file",
      credited: "1 rule on file",
      houses: null,
      cite: null,
      readOn: null,
    });
    expect(researchReadOn("2026-08-25")).toBe(`read ${datedLong("2026-08-25")}`);
  });

  it("no market's fact dates a figure by the day the research was read", () => {
    metros.forEach((m, i) => {
      const fact = metroFact(m, i);
      if (!fact?.cite) return;
      expect(fact.text, m.id).toMatch(/% vac \([^)]+\)/);
      expect(fact.text, m.id).not.toContain(datedLong(readDay));
      expect(fact.text, m.id).not.toMatch(/as of/);
    });
  });

  it("the band says the figures are dated research, never live, with the day read said as that", () => {
    const html = renderToStaticMarkup(React.createElement(MarketsMarquee));
    const text = visibleText(html);
    expect(text).not.toMatch(/live from the research layer/i);
    expect(text).toMatch(/covered markets — dated research/);
    const days = [...new Set(metros.map((m, i) => metroFact(m, i)?.readOn ?? null))];
    if (days.length === 1 && days[0]) expect(text).toContain(`dated research, ${researchReadOn(days[0])}`);
    expect(text).not.toContain(`as of ${datedLong(readDay)}`);
    for (const [i, m] of metros.entries()) {
      const fact = metroFact(m, i);
      // The band prints each figure with its house beside it.
      if (fact) expect(text, m.id).toContain(fact.credited);
    }
    expect(text).toContain("Office 21.3–22.2% vac (Colliers and CBRE, Q2 2026)");
    // Each market's link still carries the whole citation as its title.
    expect(html).toContain('title="Vacancy: Colliers (21.3%) and CBRE (22.2%), the District, Q2 2026"');
    expect(a11yIssues(html), "markets marquee").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("each gallery tile's figures carry their own periods, and the tile names who published them", () => {
    const html = renderToStaticMarkup(React.createElement(MarketsGallery));
    const text = visibleText(html);
    const facts = html.match(/data-qa="fact"/g) ?? [];
    expect(facts.length).toBeGreaterThan(0);
    expect(text).not.toContain(`as of ${datedLong(readDay)}`);
    expect(text).toMatch(/% vac \(Q2 2026\)/);
    expect(html).toContain('title="Vacancy: Colliers (21.3%) and CBRE (22.2%), the District, Q2 2026"');
    // Who published each tile's figures is said under it, in words a phone
    // shows (research pass 31, C5) — every tile that carries a tracker figure.
    const tiles = html.split("<li").slice(1);
    const withFigures = tiles.filter((t) => /% vac/.test(t));
    expect(withFigures.length).toBeGreaterThan(0);
    for (const tile of withFigures) expect(tile).toContain('data-qa="fact-houses"');
    expect(text).toContain("Vacancy: Colliers and CBRE");
    // live-verify's homepage marker: a tile's figure and its rules count are
    // one run of text.
    expect(html).toMatch(/% vac[^<]*rules? on file/);
    expect(a11yIssues(html), "markets gallery").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
