import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHART_MAX_SCALE, WIDEST_CHART_COLUMN_PX, chartScaleIssues, chartWidthStyle } from "@/lib/chart-bounds";
import { DotTimeline, TIMELINE_FRAMES, TIMELINE_FRAME_SPANS } from "@/app/(app)/analytics/charts";
import { DualAxisTrend } from "@/app/(app)/submarkets/[id]/trend-chart";

describe("a chart's lettering never grows past 1.25× its set size", () => {
  it("caps a stretched chart at 1.25× its viewBox, keeping its scroll floor", () => {
    expect(chartWidthStyle(90)).toEqual({ maxWidth: 112 });
    expect(chartWidthStyle(904, 560)).toEqual({ maxWidth: 1130, minWidth: 560 });
    // A floor over the cap would undo it: the floor gives way.
    expect(chartWidthStyle(90, 560)).toEqual({ maxWidth: 112, minWidth: 112 });
  });

  it("names the old shape — a 90-unit chart stretched to a 918px column draws its type ten times over", () => {
    const old = '<svg viewBox="0 0 90 248" width="100%" style="min-width:90px"><text font-size="11">2027</text></svg>';
    expect(chartScaleIssues(old)).toEqual(["viewBox 90: up to 10.20×"]);
    const capped = '<svg viewBox="0 0 90 248" width="100%" style="max-width:112px;min-width:90px"><text>2027</text></svg>';
    expect(chartScaleIssues(capped)).toEqual([]);
    // A bar with no lettering, and a chart drawn at its own pixels, have none to grow.
    expect(chartScaleIssues('<svg viewBox="0 0 560 16" width="100%"><rect/></svg>')).toEqual([]);
    expect(chartScaleIssues('<svg viewBox="0 0 90 248" width="90"><text>x</text></svg>')).toEqual([]);
  });

  it("the analytics timeline shows each frame only over the card widths it reads at", () => {
    for (const f of TIMELINE_FRAMES) {
      const [lo, hi] = TIMELINE_FRAME_SPANS[f.key];
      expect(hi / f.W, f.key).toBeLessThanOrEqual(CHART_MAX_SCALE);
      // …and never so narrow its type shrinks past a tenth (the phone's
      // frame meets a 320px screen's ~238px card, its floor).
      if (lo > 0) expect(lo / f.W, f.key).toBeGreaterThanOrEqual(0.9);
    }
    // The spans meet end to end, up to the widest column a card is laid out at.
    const spans = TIMELINE_FRAMES.map((f) => TIMELINE_FRAME_SPANS[f.key]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBe(spans[i - 1][1]);
    expect(spans.at(-1)![1]).toBeGreaterThanOrEqual(WIDEST_CHART_COLUMN_PX);
    const html = renderToStaticMarkup(
      React.createElement(DotTimeline, {
        points: [
          { at: "2026-06-11T12:00:00Z", value: 5.45, name: "A", id: "a" },
          { at: "2026-08-20T12:00:00Z", value: 5.9, name: "B", id: "b" },
          { at: "2026-09-02T12:00:00Z", value: 8.1, name: "C", id: "c" },
        ],
        format: (v: number) => `${v.toFixed(2)}%`,
        medianLabel: "median",
      }),
    );
    expect((html.match(/<svg/g) ?? []).length).toBe(TIMELINE_FRAMES.length);
    expect(html).toContain('class="@container"');
    expect(chartScaleIssues(html)).toEqual([]);
  });

  it("the submarket trend, with one period or twenty, never draws its labels past the cap", () => {
    for (const n of [1, 3, 20]) {
      const bars = Array.from({ length: n }, (_, i) => ({
        period: `20${10 + Math.floor(i / 4)}-${String((i % 4) * 3 + 3).padStart(2, "0")}-01`,
        value: 0.05,
        source: "export.csv",
        unverified: false,
      }));
      const html = renderToStaticMarkup(
        React.createElement(DualAxisTrend, {
          bars,
          barLabel: "Vacancy",
          segments: [],
          lineLabel: "Asking rent",
          formatBar: (v: number) => `${(v * 100).toFixed(1)}%`,
          formatLine: String,
        }),
      );
      expect(chartScaleIssues(html), `${n} periods`).toEqual([]);
    }
  });
});
