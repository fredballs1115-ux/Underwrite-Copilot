// The submarket page's pictures (app/(app)/submarkets/[id]/pipeline-picture),
// drawn on fixtures: the deliveries a bar a quarter on one scale, each
// pipeline building's size a bar on one scale, and the drawn cover over a
// heading whose metro names no market. The page reads a database no test can
// reach; the parts are pure.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeliveryBars, PipelineSfCell, SubmarketCoverHead, sfShort } from "@/app/(app)/submarkets/[id]/pipeline-picture";
import type { DeliveryQuarter } from "@/lib/market/metrics";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const h = React.createElement;
const widths = (html: string, bar: string) =>
  [...html.matchAll(new RegExp(`style="width:([\\d.]+)%"[^>]*data-bar="${bar}"`, "g"))].map((m) => Number(m[1]));

const Q = (quarter: string, sf: number, count: number, hasStale = false): DeliveryQuarter => ({
  quarter,
  sf,
  count,
  names: Array.from({ length: count }, (_, i) => `Building ${quarter} ${i + 1}`),
  hasStale,
});

describe("DeliveryBars — the pipeline's deliveries, a bar a quarter on one scale", () => {
  it("draws each quarter against the largest, with its figure and building count", () => {
    const html = renderToStaticMarkup(
      h(DeliveryBars, { deliveries: [Q("2027-Q1", 120_000, 1), Q("2027-Q2", 480_000, 3, true), Q("2027-Q4", 0, 1)] }),
    );
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    expect(widths(html, "sub-delivery")).toEqual([25, 100]);
    expect(text).toContain("2027-Q1 · 1 building");
    expect(text).toContain("2027-Q2 · 3 buildings · review");
    expect(text).toContain("120k SF");
    expect(text).toContain("480k SF");
    // A quarter whose buildings state no size: no bar, said.
    expect(text).toContain("SF not stated");
  });

  it("says so where nothing is dated", () => {
    const html = renderToStaticMarkup(h(DeliveryBars, { deliveries: [] }));
    expect(visibleText(html)).toContain("No dated deliveries");
    expect(html).not.toContain("data-bar");
  });

  it("writes square feet short", () => {
    expect(sfShort(120_000)).toBe("120k SF");
    expect(sfShort(1_250_000)).toBe("1.3M SF");
    expect(sfShort(2_000_000)).toBe("2M SF");
    expect(sfShort(800)).toBe("800 SF");
  });
});

describe("PipelineSfCell — each building's size on the table's one scale", () => {
  it("draws the bar under the figure, and a blank size as a dash with no bar", () => {
    const html = renderToStaticMarkup(
      h("div", null, h(PipelineSfCell, { sf: 50_000, max: 200_000 }), h(PipelineSfCell, { sf: null, max: 200_000 })),
    );
    expect(widths(html, "sub-pipeline-sf")).toEqual([25]);
    const text = visibleText(html);
    expect(text).toContain("50,000 SF");
    expect(text).toContain("—");
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("SubmarketCoverHead — a heading with no market opens on the drawn cover", () => {
  it("draws its class's cover, hidden from a screen reader, then the name as the h1", () => {
    const html = renderToStaticMarkup(
      h(SubmarketCoverHead, { submarket: { id: "s1", name: "I-81 corridor", assetClass: "industrial" } }),
    );
    expect(a11yIssues(html)).toEqual([]);
    expect(html).toContain('data-picture="submarket-head-cover"');
    expect(html).toMatch(/data-deal-cover="industrial"/);
    expect(html).toMatch(/<h1[^>]*>I-81 corridor<\/h1>/);
    expect(gluedWords(visibleText(html))).toEqual([]);
  });
});
