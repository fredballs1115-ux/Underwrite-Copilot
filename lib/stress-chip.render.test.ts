// The stress test at a glance beside the call (2026-10-20): the header's
// chip and the sticky bar's, drawn on the sample's own test, held to the
// panel's counts and to the panel's anchor on the Overview.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => "/deals/d1",
  useSearchParams: () => new URLSearchParams(),
}));

import { STRESS_TEST_ANCHOR, StressChip, stressChipLine } from "@/app/(app)/deals/[id]/stress-chip";
import { DealHero } from "@/app/(app)/deals/[id]/deal-hero";
import { DealStickyBar } from "@/app/(app)/deals/[id]/deal-sticky-bar";
import { stressReadLine } from "@/app/stress-test-panel";
import { verdictCounts } from "./stress-test-words";
import { sampleStressTest } from "./sample-stress";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const h = React.createElement;
const test = sampleStressTest({ today: "2026-09-08" });
const counts = verdictCounts(test);
/** The page around a chip: the Overview draws the panel the chip links to. */
const withTarget = (html: string) => `${html}<div id="${STRESS_TEST_ANCHOR}"></div>`;

describe("the stress-test chip", () => {
  it("counts the rows as the panel's own read line does, in its words, most severe first", () => {
    const line = stressChipLine(counts)!;
    // The panel's line is "N assumptions tested: …"; the chip's parts are its.
    expect(line.replace(/^Stress test: /, "")).toBe(stressReadLine(test.rows).replace(/^\d+ assumptions? tested: /, ""));
    const html = renderToStaticMarkup(h(StressChip, { counts }));
    const text = visibleText(html).replace(/\s+/g, " ").trim();
    for (const part of line.replace(/^Stress test: /, "").split(", ")) expect(text).toContain(part);
    expect(text.startsWith("Stress test")).toBe(true);
    expect(gluedWords(visibleText(html))).toEqual([]);
    expect(a11yIssues(withTarget(html))).toEqual([]);
  });

  it("links to the Overview's panel, and wraps on a phone only between its parts", () => {
    const html = renderToStaticMarkup(h(StressChip, { counts }));
    expect(html).toContain(`href="#${STRESS_TEST_ANCHOR}"`);
    expect(html).toMatch(/^<a [^>]*class="[^"]*\bflex-wrap\b[^"]*\bmax-w-full\b/);
    // Each part keeps its count and its word on one line.
    const parts = [...html.matchAll(/<span class="inline-flex items-center gap-1 whitespace-nowrap/g)];
    expect(parts.length).toBe(Object.values(counts).filter((n) => n > 0).length);
    // The Overview gives the panel the id the chip links to.
    const base = readFileSync("app/(app)/deals/[id]/deal-sections-base.tsx", "utf8");
    expect(base).toContain("<div id={STRESS_TEST_ANCHOR}");
  });

  it("draws nothing without a struck row, and says one hold as 'holds', more as 'hold'", () => {
    expect(renderToStaticMarkup(h(StressChip, { counts: null }))).toBe("");
    expect(renderToStaticMarkup(h(StressChip, { counts: { holds: 0, stretched: 0, unsupported: 0, unchecked: 0 } }))).toBe("");
    expect(stressChipLine({ holds: 1, stretched: 0, unsupported: 0, unchecked: 2 })).toBe("Stress test: 1 holds, 2 unchecked");
    expect(stressChipLine({ holds: 3, stretched: 1, unsupported: 0, unchecked: 0 })).toBe("Stress test: 1 stretched, 3 hold");
  });

  it("sits beside the call in the deal header", () => {
    const html = renderToStaticMarkup(
      h(DealHero, {
        title: "The Maddox",
        subtitle: "Philadelphia, PA · Multifamily",
        figures: [],
        chips: h(React.Fragment, null, h("span", { "data-qa": "call" }, "Pursue"), h(StressChip, { counts })),
      }),
    );
    const facts = html.slice(html.indexOf("data-deal-hero-facts"));
    expect(facts.indexOf('data-qa="stress-chip"')).toBeGreaterThan(facts.indexOf('data-qa="call"'));
    expect(facts.indexOf('data-qa="stress-chip"')).toBeLessThan(facts.indexOf("<dl"));
    expect(a11yIssues(withTarget(html))).toEqual([]);
    // The deal page hands it the panel's counts.
    const page = readFileSync("app/(app)/deals/[id]/page.tsx", "utf8");
    expect(page).toContain("verdictCounts(stressTest)");
    expect(page).toContain("<StressChip counts={stressCounts} />");
    expect(page).toContain("stress={stressCounts}");
  });

  it("rides the sticky bar from lg, compact: a dot and a count a verdict, the words for a screen reader", () => {
    const html = renderToStaticMarkup(
      h(DealStickyBar, { dealId: "d1", name: "The Maddox", chip: { label: "Pursue", cls: "bg-pass/10 text-pass" }, stress: counts, figures: [] }),
    );
    const at = html.indexOf('data-qa="stress-chip-compact"');
    expect(at).toBeGreaterThan(0);
    expect(html.slice(html.lastIndexOf('<span class="', at), at)).toContain("hidden lg:contents");
    const chip = html.slice(html.lastIndexOf("<a ", at), html.indexOf("</a>", at));
    // Unchecked left out where any row was tested.
    expect(visibleText(chip)).not.toContain("unchecked");
    expect(chip).toContain('<span class="sr-only"> unsupported</span>');
    expect(a11yIssues(withTarget(html))).toEqual([]);
    const none = renderToStaticMarkup(h(DealStickyBar, { dealId: "d1", name: "x", figures: [] }));
    expect(none).not.toContain("stress-chip");
  });
});
