import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import metrosSeed from "@/data/research/metros.json";
import { MarketsMarquee, metroFact, researchAsOf } from "@/app/markets-marquee";
import { MarketsGallery } from "@/app/markets-gallery";
import { datedLong } from "@/lib/debt-index";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

// The markets band and the homepage's gallery print each market's research
// fact — a sector's vacancy from the tracker's snapshot of brokerages'
// quarterly prints. The band called it "live from the research layer" and the
// gallery printed it with no date at all. It is dated research, and every
// figure now carries the research file's own date for it.

const metros = (metrosSeed.metros ?? []) as { id: string; name: string; sector_snapshot?: { as_of?: string } | null }[];

describe("the covered markets' research facts, dated from the research file", () => {
  it("a sector read carries its snapshot's own date; an FMR says its year; a file with no date gets none", () => {
    const withSnap = metros.find((m) => m.sector_snapshot?.as_of)!;
    const fact = metroFact(withSnap, 0)!;
    expect(fact.asOf).toBe(withSnap.sector_snapshot!.as_of);
    expect(fact.text).toMatch(/ vac/);
    const undated = { sector_snapshot: { office: { vacancy_pct: 12.5 } }, rule_ids: ["a"] };
    expect(metroFact(undated, 0)).toEqual({ text: "Office 12.5% vac · 1 rule on file", asOf: null });
    // The fiscal year is the block's own (lib/fmr), never one typed on the page.
    const block = { fy: 2027, effective: "2026-10-01", area: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD MSA", "2br": 1860 };
    expect(metroFact({ fmr: block }, 0)).toEqual({ text: "FY2027 2BR FMR $1,860/mo", asOf: null });
    expect(metroFact({ fmr: { ...block, fy: 2028, effective: "2027-10-01", "2br": 1900 } }, 0)?.text).toBe("FY2028 2BR FMR $1,900/mo");
    // A block that names no year prints no rent: the rules count alone.
    expect(metroFact({ fmr: { "2br": 1860 }, rule_ids: ["a"] }, 0)).toEqual({ text: "1 rule on file", asOf: null });
    expect(researchAsOf("2026-08-25")).toBe(`as of ${datedLong("2026-08-25")}`);
  });

  it("the band says the figures are dated research, never live, with the file's date", () => {
    const html = renderToStaticMarkup(React.createElement(MarketsMarquee));
    const text = visibleText(html);
    expect(text).not.toMatch(/live from the research layer/i);
    expect(text).toMatch(/covered markets — dated research/);
    const dates = [...new Set(metros.map((m, i) => metroFact(m, i)?.asOf ?? null))];
    if (dates.length === 1 && dates[0]) {
      // One snapshot date for every figure: said once, in the heading.
      expect(text).toContain(`dated research, ${researchAsOf(dates[0])}`);
    } else {
      for (const d of dates) if (d) expect(text).toContain(researchAsOf(d));
    }
    expect(a11yIssues(html), "markets marquee").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });

  it("each gallery tile's figure carries its own date from the research file", () => {
    const html = renderToStaticMarkup(React.createElement(MarketsGallery));
    const text = visibleText(html);
    const dated = metros.map((m, i) => ({ m, fact: metroFact(m, i) })).filter((x) => x.fact?.asOf);
    expect(dated.length).toBeGreaterThan(0);
    // One date line per dated tile (tiles without coordinates are left out).
    const lines = html.match(/data-qa="fact-date"/g) ?? [];
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(dated.length);
    for (const { fact } of dated) expect(text).toContain(researchAsOf(fact!.asOf!));
    expect(a11yIssues(html), "markets gallery").toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
