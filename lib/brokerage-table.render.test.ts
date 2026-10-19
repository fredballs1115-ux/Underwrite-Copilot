// The analytics page's "By brokerage" scorecard (app/(app)/analytics/
// brokerage-table), drawn on a fixture: each firm's deals a bar on one
// scale, its fits and its Go calls as fills on the same scale, the counts in
// words beside them.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrokerageTable } from "@/app/(app)/analytics/brokerage-table";
import { brokerScorecard, type BrokerDeal } from "@/lib/brokerage";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const cbre = { key: "cbre", name: "CBRE" };
const jll = { key: "jll", name: "JLL" };
const deal = (firm: { key: string; name: string }, fit: BrokerDeal["fit"], verdict: string | null, partial = false): BrokerDeal => ({
  firms: [firm],
  fit,
  partial,
  verdict,
});

const widths = (html: string, bar: string) =>
  [...html.matchAll(new RegExp(`style="width:([\\d.]+)%"[^>]*data-bar="${bar}"`, "g"))].map((m) => Number(m[1]));

describe("BrokerageTable — deals per firm on one scale, the fits and Go calls as fills", () => {
  const { rows, unnamed } = brokerScorecard([
    deal(cbre, "fits", "pass"),
    deal(cbre, "fits", "caution"),
    deal(cbre, "outside", "pass_on"),
    deal(cbre, "near", null, true),
    deal(jll, "fits", "pass"),
    deal(jll, "outside", "pass"),
    { firms: [], fit: null, verdict: null },
  ]);

  it("draws each firm's bar against the busiest, its fills on the same scale, and keeps the N of M words", () => {
    const html = renderToStaticMarkup(React.createElement(BrokerageTable, { rows, unnamed }));
    expect(a11yIssues(html)).toEqual([]);
    const text = visibleText(html);
    expect(gluedWords(text)).toEqual([]);
    // CBRE 4 deals, JLL 2: one scale.
    expect(widths(html, "brokerage-deals")).toEqual([100, 50]);
    // CBRE: 2 fit; JLL: 1 fit — counts on the deals' scale.
    expect(widths(html, "brokerage-fit")).toEqual([50, 25]);
    // CBRE: 1 Go; JLL: 2 Go.
    expect(widths(html, "brokerage-go")).toEqual([25, 50]);
    expect(text).toContain("2 of 3 (67%)");
    expect(text).toContain("+1 checked on part of the box");
    expect(text).toContain("1 of 3 (33%)");
    expect(text).toContain("2 of 2 (100%)");
    expect(text).toContain("Fit the box");
    expect(text).toContain("Called Go");
    expect(text).toContain("1 deal names no firm.");
  });

  it("draws no fill for a firm with no fit and no Go", () => {
    const only = brokerScorecard([deal(cbre, "outside", "pass_on")]);
    const html = renderToStaticMarkup(React.createElement(BrokerageTable, { rows: only.rows, unnamed: 0 }));
    expect(widths(html, "brokerage-deals")).toEqual([100]);
    expect(html).not.toContain('data-bar="brokerage-fit"');
    expect(html).not.toContain('data-bar="brokerage-go"');
  });
});
