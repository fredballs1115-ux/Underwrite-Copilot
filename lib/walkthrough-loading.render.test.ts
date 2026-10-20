// The walkthrough's tabs past the Overview (the homepage's and /demo's) are
// a chunk of their own (app/landing-interactive.tsx `loadWalkthrough`). A tab
// opened before the chunk lands drew an empty panel, and on /demo, which
// never asked for the chunk, stayed empty (work package AK, 2026-10-16). A
// panel now asks for the chunk itself and draws the deal page's own skeleton
// of its shape until it lands, with a polite word for a screen reader. This
// file renders before the chunk is loaded — it holds its own module state,
// apart from the files that load it first — and then after.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { DemoPanel, loadWalkthrough, type AnalysisKey } from "@/app/landing-interactive";
import { SamplePipelineCardLazy, loadSampleTile } from "@/app/sample-pipeline-card-lazy";
import { sampleDealCard } from "./pipeline-card";
import { sampleDemoData, walkthroughData } from "@/app/demo/demo-data";
import { NO_DEBT_SEEDS } from "./debt-index";

const readSource = (p: string) => readFileSync(p, "utf8");


const panel = (tab: "Financials" | "Analyses", analysis: AnalysisKey = "verdict") =>
  renderToStaticMarkup(React.createElement(DemoPanel, { tab, analysis }));

/** The number of shimmering blocks a render draws. */
const shimmers = (html: string) => (html.match(/class="skeleton /g) ?? []).length;

describe("a walkthrough tab opened before its chunk has landed", () => {
  const ANALYSES: AnalysisKey[] = ["verdict", "challenger", "comps", "market", "reconciler"];

  it.each(ANALYSES)("draws the %s's shape in the deal page's skeletons, never an empty panel", (analysis) => {
    const html = panel("Analyses", analysis);
    expect(html).toContain('data-qa="walkthrough-loading"');
    expect(html).toContain('aria-busy="true"');
    expect(shimmers(html)).toBeGreaterThan(4);
    // The tabs above it stay, and nothing pretends to be the view.
    expect(html).toContain('aria-label="Analyses"');
    expect(a11yIssues(html)).toEqual([]);
  });

  it("draws the verdict's hero for the verdict and a table for the comps", () => {
    expect(panel("Analyses", "verdict")).toContain("skeleton h-11 w-11 rounded-full");
    expect(panel("Analyses", "comps")).toContain("skeleton h-3 w-1/4 rounded");
    expect(panel("Analyses", "comps")).not.toContain("skeleton h-11 w-11 rounded-full");
  });

  it("draws the Financials' terms and model as their figures' shape", () => {
    const html = panel("Financials");
    expect(html).toContain('data-qa="walkthrough-loading"');
    expect(shimmers(html)).toBeGreaterThanOrEqual(16 + 6);
    expect(html).not.toContain('data-qa="workbook-note"');
    expect(a11yIssues(html)).toEqual([]);
  });

  it("says it politely, in a status region set once the region is there, the shapes hidden from a reader", () => {
    const html = panel("Analyses", "market");
    // Empty as the server sends it: the words arrive after the region
    // mounts, so a reader that announces only a change hears them.
    expect(html).toContain('<p role="status" class="sr-only"></p>');
    expect(html).toMatch(/<div aria-hidden="true">[\s\S]*class="skeleton /);
    const src = readSource("app/landing-interactive.tsx");
    expect(src).toContain("setSaid(`Loading ${what}…`)");
    expect(src).toContain("<TabLoading what={`the ${label.toLowerCase()}`}>");
    expect(src).toContain('<TabLoading what="the financials">');
  });

  it("asks for the chunk from the panel itself, so /demo, which never asked, draws its views", () => {
    const src = readSource("app/landing-interactive.tsx");
    // The Overview (its actuals card and playground), Financials, Analyses,
    // Buy box and Documents each ask for it.
    expect(src.match(/const w = useWalkthrough\(\);/g)?.length).toBe(5);
    expect(src).not.toMatch(/const w = walkthrough;/);
  });

  it("draws the Overview's guide, call and stress test at once, its actuals card and playground as their shape", () => {
    const { overview, stressTest } = walkthroughData(sampleDemoData({ today: "2026-09-21", reads: null, debt: NO_DEBT_SEEDS }).data);
    const html = renderToStaticMarkup(React.createElement(DemoPanel, { tab: "Overview", overview, stressTest }));
    const text = visibleText(html);
    expect(text).toContain("How to read this screen");
    expect(html).toContain('data-qa="stress-test-panel"');
    expect(text).toContain("Risk digest");
    expect(html.match(/data-qa="walkthrough-part-loading"/g)?.length).toBe(2);
    expect(text).not.toContain("Property actuals");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("draws the views, and no skeleton, once the chunk has landed", async () => {
    await loadWalkthrough();
    const { overview } = walkthroughData(sampleDemoData({ today: "2026-09-21", reads: null, debt: NO_DEBT_SEEDS }).data);
    const home = renderToStaticMarkup(React.createElement(DemoPanel, { tab: "Overview", overview }));
    expect(home).not.toContain('data-qa="walkthrough-part-loading"');
    expect(visibleText(home)).toContain("Property actuals");
    const verdict = panel("Analyses", "verdict");
    expect(verdict).not.toContain('data-qa="walkthrough-loading"');
    expect(visibleText(verdict)).toContain("Caution");
    const fin = panel("Financials");
    expect(fin).not.toContain('data-qa="walkthrough-loading"');
    expect(fin).toContain('data-qa="workbook-note"');
    expect(gluedWords(visibleText(fin))).toEqual([]);
  });
});

// The homepage's pipeline card is a chunk of its own too
// (app/sample-pipeline-card-lazy.tsx): its shape until it lands, then the
// pipeline's own card.
describe("the homepage's pipeline card before and after its chunk", () => {
  const today = "2026-10-16";
  const card = sampleDealCard({ today });
  const draw = () => renderToStaticMarkup(React.createElement(SamplePipelineCardLazy, { card, today }));

  it("draws the card's shape, hidden from a screen reader, before the chunk lands", () => {
    const html = draw();
    expect(html).toContain('data-qa="sample-card-loading"');
    expect(html).toMatch(/<div aria-hidden="true"[^>]*>[\s\S]*skeleton aspect-\[16\/10\]/);
    expect(html).not.toContain("data-deal-tile");
    expect(a11yIssues(html)).toEqual([]);
  });

  it("draws the pipeline's own card, opening /demo, once it has", async () => {
    await loadSampleTile();
    const html = draw();
    expect(html).not.toContain('data-qa="sample-card-loading"');
    expect(html).toContain('data-deal-tile="sample"');
    expect(html).toMatch(/<a [^>]*href="\/demo"/);
  });
});
