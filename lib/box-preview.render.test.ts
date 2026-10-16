import { describe, expect, it } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { BOX_PREVIEW_MAX, BoxPreview, boxPreviewItem } from "@/app/(app)/criteria/box-preview";
import { sampleDealCard } from "@/lib/pipeline-card";
import { SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { fitScoreLabel } from "@/lib/fit-label";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

const card = (over: Partial<Parameters<typeof boxPreviewItem>[0]> & { id: string; name: string }) => ({
  score: null,
  mandateVerdict: null,
  fit: null,
  fitCoverage: null,
  fitFirstRead: false,
  ...over,
});

describe("the buy box page's preview of the reader's deals (signed-in gaps, M12)", () => {
  it("says each deal's fit in its pipeline card's words and tone", () => {
    expect(boxPreviewItem(card({ id: "a", name: "A", score: 82, mandateVerdict: "PURSUE", fit: "fits" }))).toMatchObject({ chip: "Fit 82 · Pursue", tone: "pass" });
    // A miss outright is "Outside box" and red, whatever the score's call.
    expect(boxPreviewItem(card({ id: "b", name: "B", score: 63, mandateVerdict: "WATCH", fit: "outside" }))).toMatchObject({ chip: "Fit 63 · Outside box", tone: "kill" });
    // Judged on part of the box: the count in the call's place, never green
    // while a criterion the price decides went unchecked.
    const part = boxPreviewItem(
      card({ id: "c", name: "C", score: 100, mandateVerdict: "PURSUE", fit: "fits", fitCoverage: { checked: 2, total: 4, unchecked: ["Going-in cap", "Target return"], priceUnchecked: true } as never }),
    );
    expect(part).toMatchObject({ chip: "Fit 100 · 2 of 4 checked", tone: "muted" });
    expect(part.title).toMatch(/going-in cap and target return could not be checked/);
    expect(boxPreviewItem(card({ id: "d", name: "D", fit: "near", fitFirstRead: true }))).toMatchObject({ chip: "Near box, first read", tone: "caution" });
    expect(boxPreviewItem(card({ id: "e", name: "E" }))).toMatchObject({ chip: "Not judged yet", tone: "muted" });
  });

  it("reads the sample's own card, built by the pipeline's builder, as the pipeline would", () => {
    const c = sampleDealCard({ today: "2026-10-16", box: SAMPLE_DEMO_BOX });
    const item = boxPreviewItem(c);
    expect(c.score).not.toBeNull();
    expect(item.chip).toBe(fitScoreLabel(c.score!, c.mandateVerdict!, c.fit === "outside", c.fitCoverage));
  });

  it("draws each deal's picture beside its chip, with nothing to lint", () => {
    const items = [
      boxPreviewItem(card({ id: "a", name: "The Maddox at Brewerytown", score: 71, mandateVerdict: "WATCH", fit: "near" })),
      boxPreviewItem(card({ id: "b", name: "Tysons Corner Plaza", score: 18, mandateVerdict: "PASS", fit: "outside" })),
    ];
    const html = renderToStaticMarkup(React.createElement(BoxPreview, { items, more: false }));
    expect(html).toContain('data-qa="box-preview"');
    expect((html.match(/data-qa="box-preview-chip"/g) ?? []).length).toBe(2);
    expect((html.match(/<img\b/g) ?? []).length).toBe(2);
    expect(html).toContain('href="/deals/a"');
    const text = visibleText(html);
    expect(text).toContain("Your pipeline against this box");
    expect(text).toContain("Fit 18 · Outside box");
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
    // Nothing to show, nothing drawn.
    expect(renderToStaticMarkup(React.createElement(BoxPreview, { items: [], more: false }))).toBe("");
  });

  it("is built on the page from the pipeline's own card builder, the newest few", () => {
    const page = readFileSync("app/(app)/criteria/page.tsx", "utf8");
    expect(page).toMatch(/boxPreviewItem\(\s*pipelineCard\(/);
    expect(page).toContain(".limit(BOX_PREVIEW_MAX * 3)");
    expect(BOX_PREVIEW_MAX).toBeLessThanOrEqual(12);
  });
});
