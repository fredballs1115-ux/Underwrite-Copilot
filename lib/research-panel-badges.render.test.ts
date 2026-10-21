// The deal page's research rows (first-hour review): a tracker figure whose
// file names no house printed "publisher not recorded … · sourced", and a
// vacancy's rank chip read "#1 of 5" with nothing saying which end first is.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResearchPanelView, SourceLink } from "@/app/(app)/deals/[id]/research-panel";
import { seedBenchmarks } from "./research-data";
import { a11yIssues, visibleText } from "./render-lint";
import type { Benchmark } from "./research";

const TODAY = "2026-10-21";
const render = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("a figure no house is named for", () => {
  it("carries its house, or null, beside its citation in the seed rows", () => {
    const tracker = seedBenchmarks().filter((b) => b.cite != null);
    expect(tracker.length).toBeGreaterThan(0);
    for (const b of tracker) {
      expect(b.house === null, `${b.metro} ${b.metric}`).toBe(b.cite!.startsWith("publisher not recorded"));
    }
  });

  it("is badged by what there is — a link only, or no source — never 'sourced'", () => {
    const linked = visibleText(render(React.createElement(SourceLink, { source: "https://example.com/report", asOf: "2026-08-25", status: "sourced", today: TODAY, readOn: true, unattributed: true })));
    expect(linked).toContain("link only");
    expect(linked).not.toMatch(/\bsourced\b/);
    const bare = visibleText(render(React.createElement(SourceLink, { source: "", asOf: "2026-08-25", status: "sourced", today: TODAY, readOn: true, unattributed: true })));
    expect(bare).toContain("no source");
    expect(bare).not.toMatch(/\bsourced\b/);
    // A figure a house is named for keeps its status.
    const named = visibleText(render(React.createElement(SourceLink, { source: "https://example.com/report", asOf: "2026-08-25", status: "sourced", today: TODAY, readOn: true })));
    expect(named).toContain("sourced");
  });
});

describe("a vacancy's rank on the deal page", () => {
  it("says which end it is ranked from, of how many", () => {
    const row: Benchmark = {
      sector: "industrial",
      metro: "Miami",
      metric: "industrial_vacancy_pct",
      low: 9.9,
      high: 9.9,
      unit: "pct",
      source: "",
      as_of: "2026-08-25",
      status: "sourced",
      cite: "publisher not recorded, Q2 2026",
      house: null,
    };
    const html = render(
      React.createElement(ResearchPanelView, {
        address: { label: "Miami, FL", street: "", city: "Miami", state: "FL", zip: "", county: "Miami-Dade County", submarket: "" },
        capText: "5.45%",
        rules: [],
        benchmarks: [row],
      }),
    );
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(text).toContain("industrial vacancy");
    expect(text).not.toMatch(/#\d+ of \d+/);
    // Miami's own industrial figure is on the board the market page ranks
    // (it shares its place with another market's equal figure as the
    // files stand): its chip names the end and the count.
    expect(text).toMatch(/(?:=?\d+(?:st|nd|rd|th) |joint )?(?:lowest|highest) of \d+ ranked|the only figure ranked/);
    // The row's badge is no "sourced" over a figure no house is named for.
    const li = html.slice(html.indexOf("industrial vacancy"));
    expect(visibleText(li.slice(0, li.indexOf("</li>")))).toContain("no source");
  });
});
