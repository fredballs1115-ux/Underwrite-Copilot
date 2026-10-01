import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import metrosSeed from "@/data/research/metros.json";
import { MarketsMarquee, metroFact, researchReadOn } from "@/app/markets-marquee";
import { MarketsGallery } from "@/app/markets-gallery";
import { datedLong } from "@/lib/debt-index";
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
    expect(dc.cite).toBe("Vacancy: Colliers (21.3%) and CBRE (22.2%), the District, Q2 2026");
    expect(dc.readOn).toBe(readDay);
    // Baltimore's industrial vacancy is Newmark's Q1 2026 figure and its rent
    // CBRE's Q2 2026 — two periods, each said beside its own figure.
    const baltimore = byId("baltimore").sector_snapshot!;
    const industrial = metroFact({ sector_snapshot: { as_of: baltimore.as_of, industrial: baltimore.industrial } }, 0)!;
    expect(industrial).toEqual({
      text: "Industrial 8.5% vac (Q1 2026) · $11.17/SF (Q2 2026)",
      cite: "Vacancy: Newmark, Q1 2026 · Rent: CBRE, Q2 2026; average asking",
      readOn: readDay,
    });
  });

  it("a figure whose period the file does not state is undated; an FMR says its year; no figure, no credit", () => {
    expect(metroFact({ sector_snapshot: { office: { vacancy_pct: 12.5 } }, rule_ids: ["a"] }, 0)).toEqual({
      text: "Office 12.5% vac (undated) · 1 rule on file",
      cite: "Vacancy: publisher not recorded, undated",
      readOn: null,
    });
    // The fiscal year is the block's own (lib/fmr), never one typed on the page.
    const block = { fy: 2027, effective: "2026-10-01", area: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD MSA", "2br": 1860 };
    expect(metroFact({ fmr: block }, 0)).toEqual({ text: "FY2027 2BR FMR $1,860/mo", cite: null, readOn: null });
    expect(metroFact({ fmr: { ...block, fy: 2028, effective: "2027-10-01", "2br": 1900 } }, 0)?.text).toBe("FY2028 2BR FMR $1,900/mo");
    // A block that names no year prints no rent: the rules count alone.
    expect(metroFact({ fmr: { "2br": 1860 }, rule_ids: ["a"] }, 0)).toEqual({ text: "1 rule on file", cite: null, readOn: null });
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
      if (fact) expect(text, m.id).toContain(fact.text);
    }
    // Each market's link names who published its figures.
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
    // live-verify's homepage marker: a tile's figure and its rules count are
    // one run of text.
    expect(html).toMatch(/% vac[^<]*rules? on file/);
    expect(a11yIssues(html), "markets gallery").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
